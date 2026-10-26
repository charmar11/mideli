"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformManager } from "@/lib/server/platform-manager";
import type {
  MarketplacePlatform,
} from "@/lib/marketplace-orders";
import type { BusinessContextRow } from "@/types/multibusiness";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORMS: MarketplacePlatform[] = ["uber_eats", "didi_food"];

type MarketplaceActionResult<T> = { success: boolean; data: T | null; error: string | null };
type MarketplaceTarget = { id: string; name: string; slug: string };
type PlatformSetting = {
  platform: MarketplacePlatform;
  isEnabled: boolean;
  commissionRate: number | null;
};
type ProductPrice = { menuItemId: string; name: string; menuPrice: number; platformPrice: number | null };

function success<T>(data: T): MarketplaceActionResult<T> {
  return { success: true, data, error: null };
}

function failure<T>(error: string): MarketplaceActionResult<T> {
  return { success: false, data: null, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function authorizeBusinessMarketplaceManagement(businessId: string) {
  if (!UUID_PATTERN.test(businessId)) return { error: "Selecciona un negocio válido." } as const;

  try {
    const manager = await requirePlatformManager();
    const { data: business, error } = await manager.admin
      .from("businesses")
      .select("id,display_name,slug,marketplace_orders_enabled,lifecycle_status")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !business) return { error: "No se encontró el negocio." } as const;
    if (!business.marketplace_orders_enabled) return { error: "Rincón 404 debe habilitar pedidos de plataformas para este negocio." } as const;
    if (business.lifecycle_status !== "active") return { error: "El negocio no está activo." } as const;
    return {
      error: null,
      businessId,
      businessName: business.display_name as string,
      businessSlug: business.slug as string,
      admin: manager.admin,
      mode: "platform" as const,
    };
  } catch {
    // Continue with the signed-in business owner path below.
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Tu sesión expiró. Inicia sesión nuevamente." } as const;
  const [contextResult, licenseResult] = await Promise.all([
    supabase.rpc("get_my_multibusiness_context"),
    supabase.rpc("get_my_business_license_availability"),
  ]);
  if (contextResult.error || licenseResult.error) return { error: "No se pudo validar el acceso al negocio." } as const;
  const context = ((contextResult.data ?? []) as BusinessContextRow[]).find(
    (business) => business.business_id === businessId,
  );
  const licenseAvailable = ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
    .some((license) => license.business_id === businessId && license.is_available);
  if (!context || context.business_lifecycle_status !== "active" || !context.capability_codes.includes("business.manage_catalog")) {
    return { error: "No tienes permiso para configurar plataformas en este negocio." } as const;
  }
  if (!licenseAvailable) return { error: "La licencia del negocio no está vigente." } as const;

  const admin = createAdminClient();
  const { data: business, error } = await admin
    .from("businesses")
    .select("marketplace_orders_enabled")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !business) return { error: "No se pudo revisar la configuración del negocio." } as const;
  if (!business.marketplace_orders_enabled) return { error: "Rincón 404 debe habilitar pedidos de plataformas para este negocio." } as const;
  return {
    error: null,
    businessId,
    businessName: context.business_display_name,
    businessSlug: context.business_slug,
    admin,
    mode: "business" as const,
  };
}

export async function listBusinessMarketplaceTargetsAction(): Promise<
  MarketplaceActionResult<{ mode: "platform" | "business"; businesses: MarketplaceTarget[] }>
> {
  try {
    let manager: Awaited<ReturnType<typeof requirePlatformManager>> | null = null;
    try {
      manager = await requirePlatformManager();
    } catch {
      manager = null;
    }

    if (manager) {
      const { data, error } = await manager.admin
        .from("businesses")
        .select("id,display_name,slug")
        .eq("marketplace_orders_enabled", true)
        .eq("lifecycle_status", "active")
        .order("display_name");
      if (error) throw error;
      return success({
        mode: "platform",
        businesses: (data ?? []).map((business) => ({
          id: business.id as string,
          name: business.display_name as string,
          slug: business.slug as string,
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
    const authorizedIds = ((contextResult.data ?? []) as BusinessContextRow[])
      .filter((business) => business.business_lifecycle_status === "active" && business.capability_codes.includes("business.manage_catalog"))
      .map((business) => business.business_id);
    const licensedIds = new Set(
      ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
        .filter((license) => license.is_available)
        .map((license) => license.business_id),
    );
    const admin = createAdminClient();
    const { data, error } = authorizedIds.length > 0
      ? await admin.from("businesses").select("id,display_name,slug")
          .in("id", authorizedIds.filter((id) => licensedIds.has(id)))
          .eq("marketplace_orders_enabled", true).eq("lifecycle_status", "active").order("display_name")
      : { data: [], error: null };
    if (error) throw error;
    return success({
      mode: "business",
      businesses: (data ?? []).map((business) => ({
        id: business.id as string,
        name: business.display_name as string,
        slug: business.slug as string,
      })),
    });
  } catch {
    return failure("No se pudieron cargar las plataformas de este negocio.");
  }
}

export async function getBusinessMarketplaceSettingsAction(
  businessId: string,
): Promise<MarketplaceActionResult<{
  businessId: string;
  businessName: string;
  settings: PlatformSetting[];
  products: Array<Omit<ProductPrice, "platformPrice">>;
  prices: Record<MarketplacePlatform, Array<{ menuItemId: string; platformPrice: number }>>;
  availableProductIds: Record<MarketplacePlatform, string[]>;
}>> {
  try {
    const authorization = await authorizeBusinessMarketplaceManagement(businessId);
    if (authorization.error) return failure(authorization.error);
    const [settingsResult, productsResult, pricesResult] = await Promise.all([
      authorization.admin.from("business_marketplace_settings")
        .select("platform,is_enabled,commission_rate").eq("business_id", businessId),
      authorization.admin.from("menu_items")
        .select("id,name,price").eq("business_id", businessId).eq("is_active", true).order("name"),
      authorization.admin.from("business_marketplace_prices")
        .select("platform,menu_item_id,platform_price,is_available").eq("business_id", businessId),
    ]);
    if (settingsResult.error || productsResult.error || pricesResult.error) {
      throw settingsResult.error ?? productsResult.error ?? pricesResult.error;
    }
    const settingsByPlatform = new Map(
      (settingsResult.data ?? []).map((setting) => [setting.platform, setting]),
    );
    const priceByKey = new Map(
      (pricesResult.data ?? []).flatMap((price) => price.platform_price === null
        ? []
        : [[`${price.platform}:${price.menu_item_id}`, Number(price.platform_price)] as const]),
    );
    const availableProductIds: Record<MarketplacePlatform, string[]> = {
      uber_eats: [],
      didi_food: [],
    };
    for (const row of pricesResult.data ?? []) {
      if (row.is_available && PLATFORMS.includes(row.platform as MarketplacePlatform)) {
        availableProductIds[row.platform as MarketplacePlatform].push(row.menu_item_id);
      }
    }
    const settings = PLATFORMS.map((platform) => {
      const row = settingsByPlatform.get(platform);
      return {
        platform,
        isEnabled: row?.is_enabled === true,
        commissionRate: row?.commission_rate === null || row?.commission_rate === undefined
          ? null
          : Number(row.commission_rate),
      };
    });
    const products = (productsResult.data ?? []).map((item) => ({
      menuItemId: item.id as string,
      name: item.name as string,
      menuPrice: Number(item.price),
    }));
    return success({
      businessId,
      businessName: authorization.businessName,
      settings,
      products,
      prices: {
        uber_eats: (productsResult.data ?? []).flatMap((item) => {
          const price = priceByKey.get(`uber_eats:${item.id}`);
          return price === undefined ? [] : [{ menuItemId: item.id as string, platformPrice: price }];
        }),
        didi_food: (productsResult.data ?? []).flatMap((item) => {
          const price = priceByKey.get(`didi_food:${item.id}`);
          return price === undefined ? [] : [{ menuItemId: item.id as string, platformPrice: price }];
        }),
      },
      availableProductIds,
    });
  } catch {
    return failure("No se pudo cargar la configuración de plataformas.");
  }
}

export async function saveBusinessMarketplaceSettingsAction(input: {
  businessId: string;
  platforms: unknown;
}): Promise<MarketplaceActionResult<null>> {
  try {
    const authorization = await authorizeBusinessMarketplaceManagement(input.businessId);
    if (authorization.error) return failure(authorization.error);
    if (!Array.isArray(input.platforms) || input.platforms.length !== 2) {
      return failure("Configura Uber Eats y Didi Food antes de guardar.");
    }
    const seen = new Set<string>();
    const platforms = [];
    for (const entry of input.platforms) {
      if (!isRecord(entry) || !PLATFORMS.includes(entry.platform as MarketplacePlatform) || seen.has(String(entry.platform))) {
        return failure("Revisa la configuración de cada plataforma.");
      }
      seen.add(String(entry.platform));
      if (typeof entry.isEnabled !== "boolean" || !Array.isArray(entry.prices) || entry.prices.length > 1000) {
        return failure("Hay datos incompletos en la configuración de precios.");
      }
      const commissionRate = entry.commissionRate === null || entry.commissionRate === "" ? null : Number(entry.commissionRate);
      if (commissionRate !== null && (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100)) {
        return failure("La comisión de referencia debe estar entre 0 y 100.");
      }
      const prices: Array<{ menuItemId: string; price: number | null; isAvailable: boolean }> = [];
      const priceIds = new Set<string>();
      for (const price of entry.prices) {
        if (!isRecord(price) || typeof price.menuItemId !== "string" || !UUID_PATTERN.test(price.menuItemId) || priceIds.has(price.menuItemId)) {
          return failure("Revisa que cada producto aparezca una sola vez en la lista de precios.");
        }
        priceIds.add(price.menuItemId);
        if (typeof price.isAvailable !== "boolean") {
          return failure("Indica si cada producto está disponible en esta plataforma.");
        }
        const amount = price.price === null || price.price === "" ? null : Number(price.price);
        if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000)) {
          return failure("Los precios deben ser pesos enteros entre $0 y $1,000,000.");
        }
        prices.push({ menuItemId: price.menuItemId, price: amount, isAvailable: price.isAvailable });
      }
      platforms.push({
        platform: entry.platform,
        isEnabled: entry.isEnabled,
        commissionRate,
        prices,
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_business_marketplace_settings", {
      p_business_id: input.businessId,
      p_platforms: platforms,
    });
    if (error) return failure(error.message.includes("habilitar")
      ? "Rincón 404 debe habilitar primero pedidos de plataformas para este negocio."
      : "No se pudo guardar la configuración. Revisa los precios e intenta de nuevo.");
    revalidatePath("/settings/plataformas");
    return success(null);
  } catch {
    return failure("No se pudo guardar la configuración de plataformas.");
  }
}

export async function getBusinessMarketplacePosConfigAction(
  businessId: string,
  menuItemIds: string[],
): Promise<MarketplaceActionResult<{
  platforms: MarketplacePlatform[];
  prices: Record<string, Partial<Record<MarketplacePlatform, number>>>;
  availability: Record<string, Partial<Record<MarketplacePlatform, boolean>>>;
}>> {
  try {
    if (!UUID_PATTERN.test(businessId)) return failure("Negocio no válido.");
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return failure("Tu sesión expiró. Inicia sesión nuevamente.");
    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (contextResult.error || licenseResult.error) return failure("No se pudo validar el acceso al menú.");
    const context = ((contextResult.data ?? []) as BusinessContextRow[]).find((business) => business.business_id === businessId);
    const licensed = ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
      .some((row) => row.business_id === businessId && row.is_available);
    if (!context || context.business_lifecycle_status !== "active" || !context.capability_codes.includes("business.operate_orders")) {
      return failure("No tienes permiso para tomar pedidos en este negocio.");
    }
    if (!licensed) return failure("La licencia del negocio no está vigente.");

    const admin = createAdminClient();
    const [businessResult, settingsResult] = await Promise.all([
      admin.from("businesses").select("marketplace_orders_enabled,lifecycle_status").eq("id", businessId).maybeSingle(),
      admin.from("business_marketplace_settings").select("platform,is_enabled").eq("business_id", businessId).eq("is_enabled", true),
    ]);
    if (businessResult.error || settingsResult.error) return failure("No se pudo cargar la configuración de plataformas.");
    if (!businessResult.data?.marketplace_orders_enabled || businessResult.data.lifecycle_status !== "active") {
      return success({ platforms: [], prices: {}, availability: {} });
    }
    const platforms = (settingsResult.data ?? [])
      .map((row) => row.platform as MarketplacePlatform)
      .filter((platform) => PLATFORMS.includes(platform));
    const validMenuItemIds = [...new Set(menuItemIds)].filter((id) => UUID_PATTERN.test(id)).slice(0, 1000);
    const priceResult = platforms.length > 0 && validMenuItemIds.length > 0
      ? await admin.from("business_marketplace_prices")
          .select("platform,menu_item_id,platform_price,is_available")
          .eq("business_id", businessId)
          .in("platform", platforms)
          .in("menu_item_id", validMenuItemIds)
      : { data: [], error: null };
    if (priceResult.error) return failure("No se pudieron cargar los precios de plataforma.");
    const prices: Record<string, Partial<Record<MarketplacePlatform, number>>> = {};
    const availability: Record<string, Partial<Record<MarketplacePlatform, boolean>>> = {};
    for (const row of priceResult.data ?? []) {
      const platform = row.platform as MarketplacePlatform;
      if (!PLATFORMS.includes(platform)) continue;
      availability[row.menu_item_id] = {
        ...availability[row.menu_item_id],
        [platform]: row.is_available === true,
      };
      if (row.platform_price !== null) {
        prices[row.menu_item_id] = {
          ...prices[row.menu_item_id],
          [platform]: Number(row.platform_price),
        };
      }
    }
    return success({ platforms, prices, availability });
  } catch {
    return failure("No se pudo cargar la opción de pedidos por plataforma.");
  }
}

export async function handoffMarketplaceOrderAction(input: {
  businessId: string;
  orderId: string;
  idempotencyKey: string;
  cashReceived: number | null;
}): Promise<MarketplaceActionResult<{ handedOffAt: string; cashReceived: number | null; platform: MarketplacePlatform }>> {
  try {
    if (![input.businessId, input.orderId, input.idempotencyKey].every((value) => UUID_PATTERN.test(value))) {
      return failure("No se pudo identificar el pedido de plataforma.");
    }
    if (input.cashReceived !== null && (!Number.isSafeInteger(input.cashReceived) || input.cashReceived < 0 || input.cashReceived > 1000000)) {
      return failure("El efectivo recibido no es válido.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("handoff_marketplace_order", {
      p_business_id: input.businessId,
      p_order_id: input.orderId,
      p_idempotency_key: input.idempotencyKey,
      p_cash_received: input.cashReceived,
    });
    if (error || !data || typeof data !== "object") {
      const message = error?.message ?? "";
      if (message.includes("Abre caja")) return failure("Abre primero la caja de este negocio. No se registró la entrega ni el efectivo.");
      if (message.includes("realmente recibiste")) return failure("Escribe el efectivo que recibiste del repartidor.");
      return failure(message || "No se pudo confirmar la entrega a la plataforma.");
    }
    const order = data as {
      marketplace_platform?: MarketplacePlatform;
      marketplace_handed_off_at?: string;
      marketplace_cash_received?: number | null;
    };
    if (!order.marketplace_handed_off_at || !order.marketplace_platform) {
      return failure("La entrega no quedó confirmada. Revisa el estado antes de reintentar.");
    }
    revalidatePath("/dashboard/mesero");
    return success({
      handedOffAt: order.marketplace_handed_off_at,
      cashReceived: order.marketplace_cash_received ?? null,
      platform: order.marketplace_platform,
    });
  } catch {
    return failure("No se pudo confirmar la entrega a la plataforma.");
  }
}

export type { MarketplaceOrderSelection, MarketplacePaymentMode, MarketplacePlatform } from "@/lib/marketplace-orders";
