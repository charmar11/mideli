"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order, OrderItem } from "@/types/database";
import { normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import {
  buildSalesHistoryCursorFilter,
  isValidSalesHistoryCursor,
  normalizeSalesHistoryCursor,
  SALES_HISTORY_PAGE_SIZE,
  sliceSalesHistoryPage,
  type SalesHistoryCursor,
} from "@/lib/sales-history-pagination";

export interface SalesHistoryParams {
  desde: string;
  hasta: string;
  ordersCursor?: SalesHistoryCursor | null;
  legacyCursor?: SalesHistoryCursor | null;
  loadOrders?: boolean;
  loadLegacyTickets?: boolean;
}

export interface SalesHistoryItem extends OrderItem {
  menu_item_name: string;
}

export interface SalesHistoryOrder extends Order {
  items: SalesHistoryItem[];
  created_by_name: string | null;
}

export interface SalesHistoryResult {
  orders: SalesHistoryOrder[];
  legacyTickets: LegacySalesTicket[];
  legacyArchiveAvailable: boolean;
  hasMoreOrders: boolean;
  nextOrdersCursor: SalesHistoryCursor | null;
  hasMoreLegacyTickets: boolean;
  nextLegacyCursor: SalesHistoryCursor | null;
  error: string | null;
}

export interface LegacySalesTicketItem {
  product_name: string;
  quantity: number;
  base_price: number;
  line_total: number;
  selected_modifiers: Array<{
    group?: string;
    option?: string;
    price?: number;
    description?: string;
  }>;
  extras: string[];
  combo_source_name?: string;
}

export interface LegacySalesTicket {
  id: string;
  business_id: string;
  source_document_id: string;
  source_folio: string | null;
  occurred_at: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  source_status: string | null;
  items: LegacySalesTicketItem[];
}

export interface DeleteSalesHistoryResult {
  success: boolean;
  error: string | null;
}

function isValidDate(value: string) {
  return value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function emptySalesHistoryResult(
  error: string | null,
  legacyTickets: LegacySalesTicket[] = [],
  legacyArchiveAvailable = false
): SalesHistoryResult {
  return {
    orders: [],
    legacyTickets,
    legacyArchiveAvailable,
    hasMoreOrders: false,
    nextOrdersCursor: null,
    hasMoreLegacyTickets: false,
    nextLegacyCursor: null,
    error,
  };
}

export async function fetchSalesHistory({
  desde,
  hasta,
  ordersCursor: rawOrdersCursor,
  legacyCursor: rawLegacyCursor,
  loadOrders = true,
  loadLegacyTickets = true,
}: SalesHistoryParams): Promise<SalesHistoryResult> {
  try {
    if (
      !isValidSalesHistoryCursor(rawOrdersCursor) ||
      !isValidSalesHistoryCursor(rawLegacyCursor)
    ) {
      return emptySalesHistoryResult("El cursor del historial no es válido");
    }

    const ordersCursor = normalizeSalesHistoryCursor(rawOrdersCursor);
    const legacyCursor = normalizeSalesHistoryCursor(rawLegacyCursor);

    if (!isValidDate(desde) || !isValidDate(hasta)) {
      return emptySalesHistoryResult("El rango de fechas no es válido");
    }

    const from = new Date(desde);
    const to = new Date(hasta);
    if (from > to) {
      return emptySalesHistoryResult("La fecha inicial debe ser anterior a la final");
    }
    if (from > new Date()) {
      return emptySalesHistoryResult("No puedes consultar una fecha futura");
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return emptySalesHistoryResult("Tu sesión expiró. Inicia sesión nuevamente");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_active) {
      return emptySalesHistoryResult("Tu cuenta está desactivada");
    }

    const businessContext = await getSelectedBusinessContext(supabase);
    if (businessContext.multibusinessAvailable && !businessContext.businessId) {
      return emptySalesHistoryResult("No hay un negocio disponible para esta cuenta");
    }
    if (
      businessContext.multibusinessAvailable &&
      businessContext.readableBusinessIds.length === 0
    ) {
      return emptySalesHistoryResult(null);
    }
    let readableBusinessIds = businessContext.readableBusinessIds;
    if (businessContext.multibusinessAvailable) {
      const licenseResult = await supabase.rpc(
        "get_my_business_license_availability"
      );
      if (licenseResult.error) {
        return {
          ...emptySalesHistoryResult("No se pudo verificar qué negocios están habilitados"),
        };
      }
      const licensedBusinessIds = new Set(
        ((licenseResult.data ?? []) as Array<{
          business_id: string;
          is_available: boolean;
        }>)
          .filter((business) => business.is_available === true)
          .map((business) => business.business_id)
      );
      readableBusinessIds = readableBusinessIds.filter((businessId) =>
        licensedBusinessIds.has(businessId)
      );
      if (readableBusinessIds.length === 0) {
        return emptySalesHistoryResult(null);
      }
    }

    let ordersQuery = supabase
      .from("orders")
      .select(
        "id,business_id,number,status,type,total,notes,table_number,table_id,table_zone_id,table_zone_name,customer_name,customer_phone,source_channel,whatsapp_status_opt_in,delivery_address,delivery_colony,delivery_reference,delivery_fee,delivery_distance_meters,delivery_latitude,delivery_longitude,delivery_status,payment_method_requested,requested_cash_tendered,scheduled_for,kitchen_release_at,kitchen_released_at,schedule_status,cash_shift_id,cash_received,change_given,created_by,payment_method,payment_status,paid_amount,paid_at,cancelled_at,created_at,updated_at"
      )
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(SALES_HISTORY_PAGE_SIZE + 1);
    if (ordersCursor) {
      ordersQuery = ordersQuery.or(
        buildSalesHistoryCursorFilter("created_at", ordersCursor)
      );
    }
    if (businessContext.multibusinessAvailable) {
      ordersQuery = ordersQuery.in("business_id", readableBusinessIds);
    } else if (businessContext.businessId) {
      ordersQuery = ordersQuery.eq("business_id", businessContext.businessId);
    }

    const loadLegacyArchive = async () => {
      if (!loadLegacyTickets) {
        return {
          tickets: [] as LegacySalesTicket[],
          available: false,
          hasMore: false,
          nextCursor: null,
        };
      }
      if (!businessContext.multibusinessAvailable || readableBusinessIds.length === 0) {
        return {
          tickets: [] as LegacySalesTicket[],
          available: false,
          hasMore: false,
          nextCursor: null,
        };
      }

      let archiveQuery = supabase
        .from("legacy_sales_tickets")
        .select("id,business_id,source_document_id,source_folio,occurred_at,subtotal_amount,discount_amount,total_amount,payment_method,source_status,items")
        .gte("occurred_at", from.toISOString())
        .lte("occurred_at", to.toISOString())
        .eq("source_system", "just-dipping-firestore")
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SALES_HISTORY_PAGE_SIZE + 1);
      if (legacyCursor) {
        archiveQuery = archiveQuery.or(
          buildSalesHistoryCursorFilter("occurred_at", legacyCursor)
        );
      }
      if (businessContext.multibusinessAvailable) {
        archiveQuery = archiveQuery.in("business_id", readableBusinessIds);
      } else {
        archiveQuery = archiveQuery.eq("business_id", businessContext.businessId);
      }
      const { data, error } = await archiveQuery;
      if (error) {
        return {
          tickets: [] as LegacySalesTicket[],
          available: false,
          hasMore: false,
          nextCursor: null,
        };
      }
      const page = sliceSalesHistoryPage(
        (data ?? []) as unknown as LegacySalesTicket[],
        SALES_HISTORY_PAGE_SIZE,
        (ticket) => ticket.occurred_at
      );
      return {
        tickets: page.rows,
        available: true,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    };

    const [ordersResult, legacyArchive] = await Promise.all([
      loadOrders
        ? ordersQuery
        : Promise.resolve({ data: null, error: null }),
      loadLegacyArchive(),
    ]);
    const { data: ordersData, error: ordersError } = ordersResult;

    if (ordersError) {
      return emptySalesHistoryResult("No se pudo cargar el historial de ventas");
    }

    const ordersPage = sliceSalesHistoryPage(
      (ordersData ?? []) as Order[],
      SALES_HISTORY_PAGE_SIZE,
      (order) => order.created_at
    );
    const orders = ordersPage.rows;
    // Authenticated RLS remains the authorization boundary for the archive;
    // older deployments can run before its additive migration exists.
    const legacyTickets = legacyArchive.tickets;
    const legacyArchiveAvailable = legacyArchive.available;

    if (orders.length === 0) {
      return {
        ...emptySalesHistoryResult(null, legacyTickets, legacyArchiveAvailable),
        hasMoreOrders: ordersPage.hasMore,
        nextOrdersCursor: ordersPage.nextCursor,
        hasMoreLegacyTickets: legacyArchive.hasMore,
        nextLegacyCursor: legacyArchive.nextCursor,
      };
    }

    const orderIds = orders.map((order) => order.id);
    const creatorIds = Array.from(
      new Set(
        orders
          .map((order) => order.created_by)
          .filter((id): id is string => Boolean(id))
      )
    );

    const [itemsResult, profilesResult] = await Promise.all([
      supabase
        .from("order_items")
        .select(
          "id,order_id,menu_item_id,quantity,unit_price,notes,selected_modifiers,created_at,menu_items(name)"
        )
        .in("order_id", orderIds),
      creatorIds.length > 0
        ? supabase.from("profiles").select("id,full_name").in("id", creatorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemsResult.error) {
      return emptySalesHistoryResult(
        "No se pudieron cargar los artículos del historial",
        legacyTickets,
        legacyArchiveAvailable
      );
    }

    const creatorNames = new Map<string, string>();
    for (const profileRow of profilesResult.data ?? []) {
      if (profileRow.id && profileRow.full_name) {
        creatorNames.set(profileRow.id, profileRow.full_name);
      }
    }

    const itemsByOrder = new Map<string, SalesHistoryItem[]>();
    for (const item of itemsResult.data ?? []) {
      const menuItem = item.menu_items as unknown as
        | { name?: string }
        | { name?: string }[]
        | null;
      const menuName = Array.isArray(menuItem)
        ? menuItem[0]?.name
        : menuItem?.name;
      const historyItem: SalesHistoryItem = {
        id: item.id,
        order_id: item.order_id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        notes: item.notes ?? "",
        selected_modifiers: normalizeWhatsappPosModifiers(item.selected_modifiers),
        created_at: item.created_at,
        menu_item_name: menuName ?? "Producto eliminado",
      };
      const current = itemsByOrder.get(item.order_id) ?? [];
      current.push(historyItem);
      itemsByOrder.set(item.order_id, current);
    }

    return {
      orders: orders.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
        created_by_name: order.created_by
          ? creatorNames.get(order.created_by) ?? null
          : null,
      })),
      legacyTickets,
      legacyArchiveAvailable,
      hasMoreOrders: ordersPage.hasMore,
      nextOrdersCursor: ordersPage.nextCursor,
      hasMoreLegacyTickets: legacyArchive.hasMore,
      nextLegacyCursor: legacyArchive.nextCursor,
      error: null,
    };
  } catch {
    return emptySalesHistoryResult("No se pudo cargar el historial de ventas");
  }
}

export async function deleteSalesHistoryOrder(
  orderId: string
): Promise<DeleteSalesHistoryResult> {
  try {
    if (!orderId) {
      return { success: false, error: "No se encontró el pedido" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Tu sesión expiró. Inicia sesión nuevamente" };
    }

    const { data: viewer } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!viewer?.is_active) {
      return {
        success: false,
        error: "Tu cuenta no puede eliminar pedidos del historial",
      };
    }

    const businessContext = await getSelectedBusinessContext(supabase);
    if (businessContext.multibusinessAvailable && !businessContext.businessId) {
      return {
        success: false,
        error: "No hay un negocio disponible para esta cuenta",
      };
    }

    let allowedBusinessIds = businessContext.deletableBusinessIds;
    if (businessContext.multibusinessAvailable && allowedBusinessIds.length === 0) {
      return {
        success: false,
        error: "Sólo el dueño del negocio puede eliminar pedidos del historial",
      };
    }
    if (!businessContext.multibusinessAvailable) {
      if (viewer.role !== "owner" && viewer.role !== "admin") {
        return {
          success: false,
          error: "Tu cuenta no puede eliminar pedidos del historial",
        };
      }
      // In legacy single-business mode, resolve the order through the
      // authenticated RLS client before using the service client below.
      const { data: visibleOrder } = await supabase
        .from("orders")
        .select("business_id")
        .eq("id", orderId)
        .maybeSingle();
      if (!visibleOrder?.business_id) {
        return { success: false, error: "El pedido ya no existe o no es visible" };
      }
      allowedBusinessIds = [visibleOrder.business_id];
    }

    const admin = createAdminClient();
    let orderQuery = admin
      .from("orders")
      .select("id,number,business_id")
      .eq("id", orderId)
    orderQuery = orderQuery.in("business_id", allowedBusinessIds);
    const { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (orderError) {
      return { success: false, error: "No se pudo consultar el pedido" };
    }

    if (!order) {
      return { success: false, error: "El pedido ya no existe" };
    }

    const { data: deleted, error: deleteError } = await admin.rpc(
      "delete_sales_order_atomic",
      {
        p_order_id: orderId,
        p_business_id: order.business_id,
      }
    );

    if (deleteError) {
      console.error("No se pudo eliminar un pedido del historial", {
        code: deleteError.code ?? "unknown",
        message: deleteError.message,
      });
      if (deleteError.message === "ORDER_DELETE_CLOSED_SHIFT") {
        return {
          success: false,
          error: "Este pedido pertenece a un corte cerrado y ya no se puede eliminar. Registra una corrección desde Caja.",
        };
      }
      if (deleteError.message === "ORDER_DELETE_SHARED_PAYMENT") {
        return {
          success: false,
          error: "Este pedido pertenece a una cuenta dividida. Anula primero el ticket compartido para poder eliminarlo.",
        };
      }
      if (deleteError.code === "55P03") {
        return {
          success: false,
          error: "Hay un cobro o cierre de caja en curso. Espera unos segundos e inténtalo de nuevo.",
        };
      }
      return {
        success: false,
        error: "No se pudo eliminar el pedido y sus artículos",
      };
    }

    if (deleted !== true) {
      return { success: false, error: "El pedido ya no existe o no pertenece a este negocio" };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar el pedido",
    };
  }
}
