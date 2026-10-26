"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformManager } from "@/lib/server/platform-manager";
import { geocodeDestination } from "@/lib/whatsapp/google-maps.server";
import { loadBusinessDeliveryOrigins, loadBusinessDeliverySettings } from "@/lib/business-delivery.server";
import type {
  BusinessDeliveryRate,
  BusinessDeliveryOrigin,
  BusinessDeliverySettings,
  BusinessDeliverySurcharge,
} from "@/lib/business-delivery";
import type { BusinessContextRow } from "@/types/multibusiness";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RINCON_ORGANIZATION_SLUG = "rincon-404-food-park";

export type DeliverySettingsTarget = {
  id: string;
  name: string;
  slug: string;
  lifecycleStatus: string;
};

export type DeliverySettingsActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

function success<T>(data: T): DeliverySettingsActionResult<T> {
  return { success: true, data, error: null };
}

function failure<T>(error: string): DeliverySettingsActionResult<T> {
  return { success: false, data: null, error };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedRates(value: unknown): BusinessDeliveryRate[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const rates: BusinessDeliveryRate[] = [];
  for (const item of value) {
    if (!isPlainRecord(item)) return null;
    const minDistanceKm = finiteNumber(item.minDistanceKm);
    const maxDistanceKm = finiteNumber(item.maxDistanceKm);
    const fee = finiteNumber(item.fee);
    if (
      typeof item.id !== "string" || !UUID_PATTERN.test(item.id) ||
      minDistanceKm === null || maxDistanceKm === null || fee === null ||
      minDistanceKm < 0 || maxDistanceKm <= minDistanceKm || maxDistanceKm > 100 ||
      fee < 0 || fee > 10000
    ) return null;
    rates.push({
      id: item.id,
      minDistanceKm: Math.round(minDistanceKm * 100) / 100,
      maxDistanceKm: Math.round(maxDistanceKm * 100) / 100,
      fee: Math.round(fee),
      isActive: item.isActive !== false,
    });
  }
  rates.sort((left, right) => left.minDistanceKm - right.minDistanceKm);
  for (let index = 1; index < rates.length; index += 1) {
    if (rates[index].minDistanceKm < rates[index - 1].maxDistanceKm) return null;
  }
  return rates;
}

function normalizedSurcharges(value: unknown): BusinessDeliverySurcharge[] | null {
  if (!Array.isArray(value) || value.length > 250) return null;
  const surcharges: BusinessDeliverySurcharge[] = [];
  const usedNames = new Set<string>();
  for (const item of value) {
    if (!isPlainRecord(item)) return null;
    const fee = finiteNumber(item.fee);
    const colonyName = typeof item.colonyName === "string" ? item.colonyName.trim() : "";
    if (
      typeof item.id !== "string" || !UUID_PATTERN.test(item.id) ||
      !colonyName || colonyName.length > 100 || fee === null || fee < 0 || fee > 10000
    ) return null;
    const key = colonyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
    if (usedNames.has(key)) return null;
    usedNames.add(key);
    const aliases = Array.isArray(item.aliases)
      ? item.aliases.flatMap((alias) => typeof alias === "string" && alias.trim() && alias.length <= 100 ? [alias.trim()] : [])
      : [];
    surcharges.push({
      id: item.id,
      colonyName,
      aliases: [...new Set(aliases)],
      fee: Math.round(fee),
      isActive: item.isActive !== false,
    });
  }
  return surcharges;
}

async function activeOrganizationId(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", RINCON_ORGANIZATION_SLUG)
    .maybeSingle();
  if (error || !data) throw new Error("No se pudo validar Rincón 404.");
  return data.id as string;
}

async function platformManager() {
  try {
    return await requirePlatformManager();
  } catch {
    return null;
  }
}

async function authorizeBusinessDeliveryManagement(businessId: string) {
  if (!UUID_PATTERN.test(businessId)) return { error: "Selecciona un negocio válido." } as const;

  const manager = await platformManager();
  if (manager) {
    const organizationId = await activeOrganizationId(manager.admin);
    const { data: business, error } = await manager.admin
      .from("businesses")
      .select("id,display_name,slug,lifecycle_status,organization_id")
      .eq("id", businessId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !business) return { error: "No se encontró el negocio de Rincón 404." } as const;
    return {
      error: null,
      businessId,
      businessName: business.display_name as string,
      actorId: manager.actorId,
      admin: manager.admin,
    } as const;
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Tu sesión expiró. Inicia sesión nuevamente." } as const;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) return { error: "Esta cuenta está desactivada." } as const;

  const contextResult = await supabase.rpc("get_my_multibusiness_context");
  if (contextResult.error) return { error: "No se pudo validar el acceso al negocio." } as const;
  const context = ((contextResult.data ?? []) as BusinessContextRow[]).find(
    (business) => business.business_id === businessId,
  );
  if (
    !context ||
    context.business_lifecycle_status === "archived" ||
    !context.capability_codes.includes("business.manage_catalog")
  ) return { error: "No tienes permiso para configurar las entregas de este negocio." } as const;

  const licenses = await supabase.rpc("get_my_business_license_availability");
  if (licenses.error) return { error: "No se pudo revisar la licencia del negocio." } as const;
  const licenseAvailable = ((licenses.data ?? []) as Array<{ business_id: string; is_available: boolean }>).some(
    (license) => license.business_id === businessId && license.is_available,
  );
  if (!licenseAvailable) return { error: "La licencia del negocio no está vigente." } as const;

  return {
    error: null,
    businessId,
    businessName: context.business_display_name,
    actorId: auth.user.id,
    admin: createAdminClient(),
  } as const;
}

export async function listBusinessDeliverySettingsTargetsAction(): Promise<
  DeliverySettingsActionResult<{ mode: "platform" | "business"; businesses: DeliverySettingsTarget[] }>
> {
  try {
    const manager = await platformManager();
    if (manager) {
      const organizationId = await activeOrganizationId(manager.admin);
      const { data, error } = await manager.admin
        .from("businesses")
        .select("id,display_name,slug,lifecycle_status")
        .eq("organization_id", organizationId)
        .neq("lifecycle_status", "archived")
        .neq("lifecycle_status", "retired")
        .order("display_name");
      if (error) throw error;
      return success({
        mode: "platform",
        businesses: (data ?? []).map((business) => ({
          id: business.id as string,
          name: business.display_name as string,
          slug: business.slug as string,
          lifecycleStatus: business.lifecycle_status as string,
        })),
      });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return failure("Tu sesión expiró. Inicia sesión nuevamente.");
    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (contextResult.error || licenseResult.error) return failure("No se pudieron cargar tus negocios.");
    const licensedIds = new Set(
      ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
        .filter((item) => item.is_available)
        .map((item) => item.business_id),
    );
    const businesses = ((contextResult.data ?? []) as BusinessContextRow[])
      .filter((business) =>
        business.business_lifecycle_status !== "archived" &&
        business.business_lifecycle_status !== "retired" &&
        business.capability_codes.includes("business.manage_catalog") &&
        licensedIds.has(business.business_id)
      )
      .map((business) => ({
        id: business.business_id,
        name: business.business_display_name,
        slug: business.business_slug,
        lifecycleStatus: business.business_lifecycle_status,
      }));
    if (businesses.length === 0) return failure("No tienes acceso de administración a un negocio vigente.");
    return success({ mode: "business", businesses });
  } catch {
    return failure("No se pudieron cargar las opciones de configuración.");
  }
}

export async function getBusinessDeliverySettingsAction(
  businessId: string,
): Promise<DeliverySettingsActionResult<BusinessDeliverySettings & { businessName: string }>> {
  try {
    const authorization = await authorizeBusinessDeliveryManagement(businessId);
    if (authorization.error) return failure(authorization.error);
    const settings = await loadBusinessDeliverySettings(businessId);
    if (!settings) return failure("Este negocio todavía no tiene configuración de entregas. Actualiza el sistema o avisa a Rincón 404.");
    return success({ ...settings, businessName: authorization.businessName });
  } catch {
    return failure("No se pudo cargar la configuración de entregas.");
  }
}

export async function resolveBusinessDeliveryOriginAction(
  businessId: string,
  addressOrMapsLink: string,
): Promise<DeliverySettingsActionResult<{ address: string; latitude: number; longitude: number }>> {
  try {
    const authorization = await authorizeBusinessDeliveryManagement(businessId);
    if (authorization.error) return failure(authorization.error);
    const value = addressOrMapsLink.trim();
    if (value.length < 5 || value.length > 500) return failure("Escribe la dirección o pega un enlace válido de Google Maps.");
    const location = await geocodeDestination(value);
    return success({
      address: location.formattedAddress || value,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  } catch {
    return failure("Google Maps no pudo confirmar el punto del local. Revisa la dirección o el enlace e intenta otra vez.");
  }
}

export async function saveBusinessDeliverySettingsAction(input: {
  businessId: string;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  rates: unknown;
  surcharges: unknown;
}): Promise<DeliverySettingsActionResult<BusinessDeliverySettings>> {
  try {
    const authorization = await authorizeBusinessDeliveryManagement(input.businessId);
    if (authorization.error) return failure(authorization.error);

    const originAddress = input.originAddress.trim();
    const latitude = input.originLatitude;
    const longitude = input.originLongitude;
    if (originAddress.length > 300) return failure("La dirección del local debe tener 300 caracteres o menos.");
    if (
      (latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      (latitude !== null && !originAddress)
    ) return failure("Confirma una dirección y ubicación válidas para el local.");

    const rates = normalizedRates(input.rates);
    if (!rates) return failure("Revisa los rangos: no deben traslaparse y cada tarifa necesita distancias y un precio válido.");
    const surcharges = normalizedSurcharges(input.surcharges);
    if (!surcharges) return failure("Revisa los recargos por colonia: el nombre debe ser único y los montos válidos.");

    const { error } = await authorization.admin
      .from("business_delivery_settings")
      .upsert({
        business_id: input.businessId,
        origin_address: originAddress,
        origin_latitude: latitude,
        origin_longitude: longitude,
        delivery_rates: rates,
        delivery_surcharges: surcharges,
        updated_by: authorization.actorId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
    if (error) throw error;

    revalidatePath("/settings/entregas");
    return success({
      businessId: input.businessId,
      originAddress,
      originLatitude: latitude,
      originLongitude: longitude,
      rates,
      surcharges,
    });
  } catch {
    return failure("No se pudo guardar. Revisa los campos e intenta de nuevo.");
  }
}

export async function getBusinessDeliveryOriginsForOrdersAction(
  businessIdsInput: string[],
): Promise<DeliverySettingsActionResult<BusinessDeliveryOrigin[]>> {
  try {
    const businessIds = [...new Set(businessIdsInput)]
      .filter((id) => UUID_PATTERN.test(id))
      .slice(0, 30);
    if (businessIds.length === 0) return success([]);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return failure("Tu sesión expiró. Inicia sesión nuevamente.");
    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (contextResult.error || licenseResult.error) return failure("No se pudieron cargar los puntos de salida.");
    const readableIds = new Set(
      ((contextResult.data ?? []) as BusinessContextRow[])
        .filter((business) =>
          business.business_lifecycle_status === "active" &&
          (business.capability_codes.includes("business.operate_orders") ||
            business.capability_codes.includes("organization.operate_orders"))
        )
        .map((business) => business.business_id),
    );
    const licensedIds = new Set(
      ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
        .filter((item) => item.is_available)
        .map((item) => item.business_id),
    );
    const authorizedIds = businessIds.filter((id) => readableIds.has(id) && licensedIds.has(id));
    return success(await loadBusinessDeliveryOrigins(authorizedIds));
  } catch {
    return failure("No se pudieron cargar los puntos de salida.");
  }
}
