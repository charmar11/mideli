"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessLogoUrl } from "@/lib/business-branding";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import type { BusinessContextRow } from "@/types/multibusiness";

export type BusinessReceiptSettings = {
  businessId: string;
  businessName: string;
  receiptName: string;
  address: string;
  phone: string;
  footer: string;
  paperWidthMm: 48 | 58;
  logoUrl: string | null;
};

export type BusinessOrderPrintData = BusinessReceiptSettings & {
  order: {
    id: string;
    number: number;
    type: "comedor" | "domicilio" | "para_llevar";
    status: string;
    createdAt: string;
    tableLabel: string | null;
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    deliveryColony: string | null;
    deliveryReference: string | null;
    deliveryFee: number;
    productsSubtotal: number;
    discountAmount: number;
    paidAmount: number;
    paymentStatus: string;
    paymentMethod: string | null;
    requestedPaymentMethod: string | null;
    marketplacePlatform: "uber_eats" | "didi_food" | null;
    marketplacePaymentMode: "app" | "cash" | null;
    marketplaceCashReceived: number | null;
    notes: string | null;
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
    modifiers: Array<{ group: string; option: string; price: number }>;
  }>;
};

type ReceiptActionResult<T> = { success: boolean; data: T | null; error: string | null };

function failed<T>(error: string): ReceiptActionResult<T> {
  return { success: false, data: null, error };
}

function succeeded<T>(data: T): ReceiptActionResult<T> {
  return { success: true, data, error: null };
}

async function authorizeSelectedBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión nuevamente." } as const;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) {
    return { error: "Esta cuenta está desactivada." } as const;
  }

  const [contextResult, selected] = await Promise.all([
    supabase.rpc("get_my_multibusiness_context"),
    getSelectedBusinessContext(supabase),
  ]);
  if (contextResult.error || !selected.multibusinessAvailable || !selected.businessId) {
    return { error: "No se pudo verificar el negocio seleccionado." } as const;
  }
  const contexts = (contextResult.data ?? []) as BusinessContextRow[];
  const business = contexts.find((row) => row.business_id === selected.businessId);
  if (!business || business.business_lifecycle_status !== "active") {
    return { error: "El negocio seleccionado no está disponible." } as const;
  }
  if (!business.capability_codes.includes("business.manage_catalog")) {
    return { error: "No tienes permiso para configurar los tickets de este negocio." } as const;
  }
  const licenseResult = await supabase.rpc("get_my_business_license_availability");
  const licenseAvailable = !licenseResult.error &&
    ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
      .some((row) => row.business_id === selected.businessId && row.is_available === true);
  if (!licenseAvailable) {
    return { error: "La licencia del negocio no está vigente." } as const;
  }

  return {
    error: null,
    businessId: selected.businessId,
    business,
    contexts,
    selected,
    userId: user.id,
    admin: createAdminClient(),
  } as const;
}

function receiptSettings(
  business: BusinessContextRow,
  saved: {
    receipt_name: string;
    receipt_address: string;
    receipt_phone: string;
    receipt_footer: string;
    paper_width_mm: number;
  } | null
): BusinessReceiptSettings {
  return {
    businessId: business.business_id,
    businessName: business.business_display_name,
    receiptName: saved?.receipt_name ?? "",
    address: saved?.receipt_address ?? "",
    phone: saved?.receipt_phone ?? "",
    footer: saved?.receipt_footer ?? "",
    paperWidthMm: saved?.paper_width_mm === 58 ? 58 : 48,
    logoUrl: getBusinessLogoUrl(business.business_brand_logo_path),
  };
}

export async function getBusinessReceiptSettingsAction(): Promise<ReceiptActionResult<BusinessReceiptSettings>> {
  try {
    const auth = await authorizeSelectedBusiness();
    if (auth.error) return failed(auth.error);
    const { data, error } = await auth.admin
      .from("business_receipt_settings")
      .select("receipt_name,receipt_address,receipt_phone,receipt_footer,paper_width_mm")
      .eq("business_id", auth.businessId)
      .maybeSingle();
    if (error) throw error;
    return succeeded(receiptSettings(auth.business, data));
  } catch {
    return failed("No se pudo cargar la configuración del ticket.");
  }
}

export async function saveBusinessReceiptSettingsAction(input: {
  receiptName: string;
  address: string;
  phone: string;
  footer: string;
  paperWidthMm: number;
}): Promise<ReceiptActionResult<BusinessReceiptSettings>> {
  try {
    const auth = await authorizeSelectedBusiness();
    if (auth.error) return failed(auth.error);
    const receiptName = input.receiptName.trim().replace(/\s+/g, " ");
    const address = input.address.trim();
    const phone = input.phone.trim();
    const footer = input.footer.trim();
    if (receiptName.length > 100 || address.length > 300 || phone.length > 40 || footer.length > 240) {
      return failed("Revisa el largo de los datos del ticket.");
    }
    if (input.paperWidthMm !== 48 && input.paperWidthMm !== 58) {
      return failed("El ancho de papel debe ser 48 o 58 mm.");
    }

    const { data, error } = await auth.admin
      .from("business_receipt_settings")
      .upsert({
        business_id: auth.businessId,
        receipt_name: receiptName,
        receipt_address: address,
        receipt_phone: phone,
        receipt_footer: footer,
        paper_width_mm: input.paperWidthMm,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" })
      .select("receipt_name,receipt_address,receipt_phone,receipt_footer,paper_width_mm")
      .single();
    if (error || !data) throw error ?? new Error("No se guardó la configuración");
    return succeeded(receiptSettings(auth.business, data));
  } catch {
    return failed("No se pudo guardar la configuración del ticket.");
  }
}

function parseModifiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((modifier) => {
    if (!modifier || typeof modifier !== "object") return [];
    const row = modifier as Record<string, unknown>;
    if (typeof row.option !== "string") return [];
    return [{
      group: typeof row.group === "string" ? row.group : "",
      option: row.option,
      price: typeof row.price === "number" && Number.isFinite(row.price) ? row.price : 0,
    }];
  });
}

export async function getBusinessOrderPrintDataAction(
  orderId: string
): Promise<ReceiptActionResult<BusinessOrderPrintData>> {
  try {
    if (!orderId || orderId.length > 80) return failed("Pedido no válido.");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return failed("Tu sesión expiró. Inicia sesión nuevamente.");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile?.is_active) return failed("Esta cuenta está desactivada.");

    const [selected, contextsResult, licenseResult] = await Promise.all([
      getSelectedBusinessContext(supabase),
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (!selected.multibusinessAvailable || contextsResult.error || licenseResult.error) {
      return failed("No se pudo verificar el acceso al pedido.");
    }
    const contexts = (contextsResult.data ?? []) as BusinessContextRow[];
    const licensedIds = new Set(
      ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
        .filter((row) => row.is_available === true)
        .map((row) => row.business_id)
    );
    const allowedIds = selected.readableBusinessIds.filter((id) => licensedIds.has(id));
    if (allowedIds.length === 0) return failed("No tienes pedidos disponibles para imprimir.");

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,business_id,number,status,type,total,notes,table_number,table_zone_name,customer_name,customer_phone,delivery_address,delivery_colony,delivery_reference,delivery_fee,payment_method_requested,payment_method,payment_status,paid_amount,marketplace_platform,marketplace_payment_mode,marketplace_cash_received,created_at")
      .eq("id", orderId)
      .in("business_id", allowedIds)
      .maybeSingle();
    if (orderError || !order) return failed("El pedido no existe o no está disponible para esta cuenta.");

    const business = contexts.find((row) => row.business_id === order.business_id);
    if (!business || !licensedIds.has(order.business_id)) {
      return failed("La licencia del negocio del pedido no está vigente.");
    }

    const [settingsResult, itemsResult, allocationsResult] = await Promise.all([
      admin
        .from("business_receipt_settings")
        .select("receipt_name,receipt_address,receipt_phone,receipt_footer,paper_width_mm")
        .eq("business_id", order.business_id)
        .maybeSingle(),
      admin
        .from("order_items")
        .select("id,quantity,unit_price,notes,selected_modifiers,menu_items(name)")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      admin
        .from("payment_order_allocations")
        .select("transaction_id,discount_amount,net_amount")
        .eq("business_id", order.business_id)
        .eq("order_id", order.id),
    ]);
    if (settingsResult.error || itemsResult.error || allocationsResult.error) {
      throw settingsResult.error ?? itemsResult.error ?? allocationsResult.error;
    }

    const allocationRows = allocationsResult.data ?? [];
    const transactionIds = Array.from(new Set(allocationRows.map((row) => row.transaction_id)));
    const transactionsResult = transactionIds.length > 0
      ? await admin
          .from("payment_transactions")
          .select("id,status")
          .eq("business_id", order.business_id)
          .in("id", transactionIds)
      : { data: [], error: null };
    if (transactionsResult.error) throw transactionsResult.error;
    const completedIds = new Set(
      (transactionsResult.data ?? [])
        .filter((transaction) => transaction.status === "completed")
        .map((transaction) => transaction.id)
    );
    const completedAllocations = allocationRows.filter((row) => completedIds.has(row.transaction_id));
    const discountAmount = completedAllocations.reduce(
      (sum, row) => sum + Number(row.discount_amount ?? 0),
      0
    );
    // Payment tenders belong to a transaction, which may cover several orders.
    // Use this order's net allocation rather than repeating the transaction's
    // full tender amounts on every printed order.
    const paidAmount = allocationRows.length > 0
      ? completedAllocations.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0)
      : Number(order.paid_amount ?? 0);

    const settings = receiptSettings(business, settingsResult.data);
    const items = (itemsResult.data ?? []).map((item) => {
      const joinedMenu = item.menu_items as unknown as { name?: string } | { name?: string }[] | null;
      const menu = Array.isArray(joinedMenu) ? joinedMenu[0] : joinedMenu;
      const modifiers = parseModifiers(item.selected_modifiers);
      const unitPrice = Number(item.unit_price) + modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
      return {
        name: menu?.name ?? "Producto eliminado",
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        notes: item.notes || null,
        modifiers,
      };
    });

    return succeeded({
      ...settings,
      order: {
        id: order.id,
        number: order.number,
        type: order.type,
        status: order.status,
        createdAt: order.created_at,
        tableLabel: order.type === "comedor"
          ? [order.table_zone_name, order.table_number].filter(Boolean).join(" · ") || null
          : order.type === "para_llevar"
            ? "Para llevar"
            : null,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address,
        deliveryColony: order.delivery_colony,
        deliveryReference: order.delivery_reference,
        deliveryFee: Number(order.delivery_fee ?? 0),
        productsSubtotal: Number(order.total),
        discountAmount,
        paidAmount,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        requestedPaymentMethod: order.payment_method_requested ?? order.payment_method,
        marketplacePlatform: order.marketplace_platform as "uber_eats" | "didi_food" | null,
        marketplacePaymentMode: order.marketplace_payment_mode as "app" | "cash" | null,
        marketplaceCashReceived: order.marketplace_cash_received === null ? null : Number(order.marketplace_cash_received),
        notes: order.notes || null,
      },
      items,
    });
  } catch {
    return failed("No se pudo preparar el ticket de este pedido.");
  }
}
