"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order, OrderItem, SelectedModifier } from "@/types/database";

export interface SalesHistoryParams {
  desde: string;
  hasta: string;
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
  error: string | null;
}

export interface DeleteSalesHistoryResult {
  success: boolean;
  error: string | null;
}

function isValidDate(value: string) {
  return value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function normalizeModifiers(value: unknown): SelectedModifier[] {
  return Array.isArray(value) ? (value as SelectedModifier[]) : [];
}

export async function fetchSalesHistory({
  desde,
  hasta,
}: SalesHistoryParams): Promise<SalesHistoryResult> {
  try {
    if (!isValidDate(desde) || !isValidDate(hasta)) {
      return { orders: [], error: "El rango de fechas no es válido" };
    }

    const from = new Date(desde);
    const to = new Date(hasta);
    if (from > to) {
      return { orders: [], error: "La fecha inicial debe ser anterior a la final" };
    }
    if (from > new Date()) {
      return { orders: [], error: "No puedes consultar una fecha futura" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { orders: [], error: "Tu sesión expiró. Inicia sesión nuevamente" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_active) {
      return { orders: [], error: "Tu cuenta está desactivada" };
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id,number,status,type,total,notes,table_number,table_id,table_zone_id,table_zone_name,customer_name,cash_shift_id,cash_received,change_given,created_by,payment_method,payment_status,paid_amount,paid_at,cancelled_at,created_at,updated_at"
      )
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    if (ordersError) {
      return { orders: [], error: "No se pudo cargar el historial de ventas" };
    }

    const orders = (ordersData ?? []) as Order[];
    if (orders.length === 0) return { orders: [], error: null };

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
      return { orders: [], error: "No se pudieron cargar los artículos del historial" };
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
        selected_modifiers: normalizeModifiers(item.selected_modifiers),
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
      error: null,
    };
  } catch {
    return { orders: [], error: "No se pudo cargar el historial de ventas" };
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

    if (
      !viewer?.is_active ||
      !["owner", "admin", "supervisor", "waiter"].includes(viewer.role)
    ) {
      return {
        success: false,
        error: "Tu cuenta no puede eliminar pedidos del historial",
      };
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,number")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return { success: false, error: "No se pudo consultar el pedido" };
    }

    if (!order) {
      return { success: false, error: "El pedido ya no existe" };
    }

    const { data: allocations, error: allocationsError } = await admin
      .from("payment_order_allocations")
      .select("transaction_id")
      .eq("order_id", orderId);

    if (allocationsError) {
      return { success: false, error: "No se pudieron consultar los cobros del pedido" };
    }

    const transactionIds = Array.from(
      new Set(
        (allocations ?? [])
          .map((allocation) => allocation.transaction_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (transactionIds.length > 0) {
      const { data: closedShiftPayments, error: closedShiftError } = await admin
        .from("payment_transactions")
        .select("cash_shift_id,cash_shifts!inner(status)")
        .in("id", transactionIds)
        .eq("cash_shifts.status", "closed")
        .limit(1);

      if (closedShiftError) {
        return { success: false, error: "No se pudo validar el corte de caja" };
      }

      if ((closedShiftPayments ?? []).length > 0) {
        return {
          success: false,
          error: "Este pedido pertenece a un corte cerrado y ya no se puede eliminar. Registra una corrección desde Caja.",
        };
      }

      const { data: sharedAllocations, error: sharedAllocationsError } = await admin
        .from("payment_order_allocations")
        .select("transaction_id,order_id")
        .in("transaction_id", transactionIds);

      if (sharedAllocationsError) {
        return { success: false, error: "No se pudo validar la cuenta dividida" };
      }

      const isSharedPayment = (sharedAllocations ?? []).some(
        (allocation) => allocation.order_id !== orderId
      );

      if (isSharedPayment) {
        return {
          success: false,
          error:
            "Este pedido pertenece a una cuenta dividida. Anula primero el ticket compartido para poder eliminarlo.",
        };
      }

      const { error: transactionDeleteError } = await admin
        .from("payment_transactions")
        .delete()
        .in("id", transactionIds);

      if (transactionDeleteError) {
        return {
          success: false,
          error: "No se pudieron eliminar los tickets asociados al pedido",
        };
      }
    }

    const { error: deleteError } = await admin
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (deleteError) {
      return {
        success: false,
        error: "No se pudo eliminar el pedido y sus artículos",
      };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar el pedido",
    };
  }
}
