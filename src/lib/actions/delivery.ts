"use server";

import { createClient } from "@/lib/supabase/server";
import { loadBusinessDeliverySettings } from "@/lib/business-delivery.server";
import { quoteWhatsappDelivery, type DeliveryPricingConfig } from "@/lib/whatsapp/operations.server";
import {
  resolveGooglePlaceDestination,
  searchGooglePlaces,
  type GooglePlaceSuggestion,
} from "@/lib/whatsapp/google-maps.server";
import type { BusinessContextRow } from "@/types/multibusiness";
import type { ConversationDeliveryQuote } from "@/lib/whatsapp/types";
import { UNREGISTERED_DELIVERY_COLONY } from "@/lib/whatsapp/delivery-pricing";

export type ManualDeliveryQuoteResult =
  | { success: true; quote: ConversationDeliveryQuote }
  | { success: false; error: string; reason?: string };

export type ManualDeliveryPlaceSuggestion = GooglePlaceSuggestion;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pricingConfigFromBusiness(settings: Awaited<ReturnType<typeof loadBusinessDeliverySettings>>): DeliveryPricingConfig | null {
  if (
    !settings ||
    settings.originLatitude === null ||
    settings.originLongitude === null ||
    settings.rates.length === 0
  ) return null;
  return {
    settings: {
      delivery_quotes_enabled: true,
      store_latitude: settings.originLatitude,
      store_longitude: settings.originLongitude,
    },
    rates: settings.rates.map((rate) => ({
      id: rate.id,
      min_distance_km: rate.minDistanceKm,
      max_distance_km: rate.maxDistanceKm,
      fee: rate.fee,
      is_active: rate.isActive,
    })),
    surcharges: settings.surcharges.map((rule) => ({
      id: rule.id,
      colony_name: rule.colonyName,
      aliases: rule.aliases,
      fee: rule.fee,
      is_active: rule.isActive,
    })),
    persisted: false,
  };
}

async function authorizeManualDeliveryQuote(businessId: string) {
  if (!UUID_PATTERN.test(businessId)) {
    return { success: false as const, error: "Selecciona el negocio del pedido." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { success: false as const, error: "Tu sesión expiró. Inicia sesión nuevamente." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    return { success: false as const, error: "Esta cuenta está desactivada." };
  }

  const contextResult = await supabase.rpc("get_my_multibusiness_context");
  if (contextResult.error) {
    return { success: false as const, error: "No se pudo verificar el acceso al negocio." };
  }
  const business = ((contextResult.data ?? []) as BusinessContextRow[])
    .find((context) => context.business_id === businessId);
  if (!business || business.business_lifecycle_status !== "active") {
    return { success: false as const, error: "Este negocio no está disponible." };
  }
  if (!business.capability_codes.includes("business.operate_orders") &&
      !business.capability_codes.includes("organization.operate_orders")) {
    return { success: false as const, error: "No tienes permiso para cotizar domicilios en este negocio." };
  }

  const licenseResult = await supabase.rpc("get_my_business_license_availability");
  const licenseAvailable = !licenseResult.error &&
    ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
      .some((license) => license.business_id === businessId && license.is_available === true);
  if (!licenseAvailable) {
    return { success: false as const, error: "La licencia de este negocio no está vigente." };
  }
  return { success: true as const };
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "address_number_required":
      return "Escribe la calle y el número, o selecciona un lugar conocido en Maps.";
    case "address_low_confidence":
      return "El resultado no coincide con la calle, número o ciudad. Elige otro resultado o corrige el domicilio.";
    case "address_not_found":
      return "Google Maps no encontró ese domicilio. Revisa el texto o agrega la colonia en el mismo campo.";
    case "google_maps_link_unresolved":
      return "No se pudo abrir el enlace corto de Maps. Pega las coordenadas o escribe la dirección y colonia aquí.";
    case "colony_missing":
      return "Maps ubicó la calle, pero no reconoce su colonia. Si la sabes, agrégala aquí como “Col. Nombre” o “Fracc. Nombre”; si no tiene colonia oficial, podrás cotizar solo por distancia.";
    case "store_origin_not_configured":
      return "Falta configurar el punto de salida del local. Avísale al administrador.";
    case "outside_coverage":
      return "El domicilio queda fuera de la cobertura de envío configurada.";
    case "rate_not_found":
      return "No hay una tarifa configurada para esa distancia.";
    case "route_not_found":
      return "Maps ubicó la dirección, pero no pudo calcular una ruta en auto. Revisa el punto o intenta de nuevo.";
    case "google_maps_not_configured":
      return "La conexión con Google Maps no está disponible. Avísale al administrador.";
    case "google_geocoding_failed":
    case "google_place_details_failed":
    case "google_routes_failed":
      return "Google Maps no respondió correctamente. Espera un momento y vuelve a intentar.";
    case "google_place_id_invalid":
    case "address_coordinates_missing":
      return "No se pudo confirmar el punto elegido. Selecciona otra ubicación.";
    default:
      return "No se pudo localizar el domicilio. Revisa la dirección o intenta de nuevo.";
  }
}

function quoteFailure(reason: string): ManualDeliveryQuoteResult {
  return { success: false, error: errorMessage(new Error(reason)), reason };
}

export async function searchManualDeliveryPlacesAction(
  businessId: string,
  input: string,
  sessionToken: string
): Promise<ManualDeliveryPlaceSuggestion[]> {
  try {
    const authorization = await authorizeManualDeliveryQuote(businessId);
    if (!authorization.success) return [];
    const settings = await loadBusinessDeliverySettings(businessId);
    return await searchGooglePlaces(input, sessionToken, {
      origin: settings?.originLatitude !== null && settings?.originLatitude !== undefined &&
          settings.originLongitude !== null
        ? { latitude: settings.originLatitude, longitude: settings.originLongitude }
        : null,
    });
  } catch {
    return [];
  }
}

export async function quoteManualDeliveryPlaceAction(
  businessId: string,
  placeId: string,
  sessionToken: string,
  typedAddress: string,
  fallbackColony = "",
  allowMissingColony = false
): Promise<ManualDeliveryQuoteResult> {
  try {
    if (!placeId.trim()) return { success: false, error: "Selecciona una ubicación de Google Maps." };
    if (typedAddress.trim().length < 3 || typedAddress.length > 500) {
      return { success: false, error: "Escribe una dirección válida antes de elegir el resultado." };
    }
    const authorization = await authorizeManualDeliveryQuote(businessId);
    if (!authorization.success) return authorization;
    const settings = await loadBusinessDeliverySettings(businessId);
    const deliveryConfig = pricingConfigFromBusiness(settings);
    if (!deliveryConfig) return quoteFailure("store_origin_not_configured");
    const cleanFallbackColony = fallbackColony.trim() === UNREGISTERED_DELIVERY_COLONY
      ? ""
      : fallbackColony.slice(0, 120);
    const destination = await resolveGooglePlaceDestination(
      placeId,
      sessionToken,
      typedAddress,
      cleanFallbackColony
    );
    const result = await quoteWhatsappDelivery({
      conversationId: null,
      address: typedAddress,
      deliveryConfig,
      destination,
      allowWhenWhatsappQuotesDisabled: true,
      allowMissingColony,
    });
    if (result.status !== "quoted") return quoteFailure(result.reason);
    return { success: true, quote: result.quote };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function quoteManualDeliveryAction(
  businessId: string,
  address: string,
  colony = "",
  allowMissingColony = false
): Promise<ManualDeliveryQuoteResult> {
  try {
    const cleanAddress = address.trim().slice(0, 500);
    const cleanColony = colony.trim() === UNREGISTERED_DELIVERY_COLONY
      ? ""
      : colony.trim().slice(0, 120);
    const value = [cleanAddress, cleanColony].filter(Boolean).join(", ");
    if (value.length < 8) return { success: false, error: "Escribe una dirección más completa." };
    const authorization = await authorizeManualDeliveryQuote(businessId);
    if (!authorization.success) return authorization;
    const settings = await loadBusinessDeliverySettings(businessId);
    const deliveryConfig = pricingConfigFromBusiness(settings);
    if (!deliveryConfig) return quoteFailure("store_origin_not_configured");
    const result = await quoteWhatsappDelivery({
      conversationId: null,
      address: value,
      fallbackColony: cleanColony,
      allowWhenWhatsappQuotesDisabled: true,
      allowMissingColony,
      deliveryConfig,
    });
    if (result.status !== "quoted") return quoteFailure(result.reason);
    return { success: true, quote: result.quote };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
