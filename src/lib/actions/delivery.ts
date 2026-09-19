"use server";

import { createClient } from "@/lib/supabase/server";
import {
  loadWhatsappOperationsConfig,
  quoteWhatsappDelivery,
} from "@/lib/whatsapp/operations.server";
import {
  resolveGooglePlaceDestination,
  searchGooglePlaces,
  type GooglePlaceSuggestion,
} from "@/lib/whatsapp/google-maps.server";
import type { ConversationDeliveryQuote } from "@/lib/whatsapp/types";

export type ManualDeliveryQuoteResult =
  | { success: true; quote: ConversationDeliveryQuote }
  | { success: false; error: string };

export type ManualDeliveryPlaceSuggestion = GooglePlaceSuggestion;

async function authorizeManualDeliveryQuote() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { success: false as const, error: "Tu sesión expiró. Inicia sesión nuevamente" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.is_active || !["owner", "admin", "waiter", "supervisor"].includes(profile.role)) {
    return { success: false as const, error: "No tienes permiso para cotizar domicilios" };
  }
  return { success: true as const };
}

export async function searchManualDeliveryPlacesAction(
  input: string,
  sessionToken: string
): Promise<ManualDeliveryPlaceSuggestion[]> {
  try {
    const authorization = await authorizeManualDeliveryQuote();
    if (!authorization.success) return [];
    const config = await loadWhatsappOperationsConfig();
    return await searchGooglePlaces(input, sessionToken, {
      origin:
        config.settings.store_latitude !== null && config.settings.store_longitude !== null
          ? {
              latitude: config.settings.store_latitude,
              longitude: config.settings.store_longitude,
            }
          : null,
    });
  } catch {
    return [];
  }
}

export async function quoteManualDeliveryPlaceAction(
  placeId: string,
  sessionToken: string
): Promise<ManualDeliveryQuoteResult> {
  try {
    if (!placeId.trim()) return { success: false, error: "Selecciona una ubicación de Google Maps" };
    const authorization = await authorizeManualDeliveryQuote();
    if (!authorization.success) return authorization;
    const config = await loadWhatsappOperationsConfig();
    const destination = await resolveGooglePlaceDestination(placeId, sessionToken);
    const result = await quoteWhatsappDelivery({
      conversationId: null,
      address: destination.formattedAddress,
      config,
      destination,
    });
    if (result.status !== "quoted") {
      return {
        success: false,
        error: result.reason === "colony_missing"
          ? "Google Maps ubicó el punto, pero no identificó la colonia"
          : "No se pudo confirmar la cobertura de ese domicilio",
      };
    }
    return { success: true, quote: result.quote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo ubicar el domicilio" };
  }
}

export async function quoteManualDeliveryAction(address: string, colony = ""): Promise<ManualDeliveryQuoteResult> {
  try {
    const value = [address.trim(), colony.trim()].filter(Boolean).join(", ");
    if (value.length < 8) return { success: false, error: "Escribe una dirección más completa" };
    const authorization = await authorizeManualDeliveryQuote();
    if (!authorization.success) return authorization;
    const config = await loadWhatsappOperationsConfig();
    const result = await quoteWhatsappDelivery({ conversationId: null, address: value, config });
    if (result.status !== "quoted") {
      return {
        success: false,
        error: result.reason === "colony_missing"
          ? "No pude identificar la colonia automáticamente. Agrégala al domicilio o comparte la ubicación desde Google Maps"
          : "No se pudo confirmar la cobertura de ese domicilio",
      };
    }
    return { success: true, quote: result.quote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cotizar el domicilio" };
  }
}
