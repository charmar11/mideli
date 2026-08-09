import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { queryTimestamp, type AnalyticsPeriod } from "@/lib/analytics/period";
import {
  buildOwnerActions,
  calculateProductProfitability,
} from "@/lib/owner-report/metrics";
import type {
  OwnerDailySalesData,
  OwnerOperationalData,
} from "@/lib/owner-report/types";

interface CashShiftRow {
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
}

interface KitchenStatusRow {
  order_id: string;
  to_status: "in_kitchen" | "ready";
  created_at: string;
}

interface InventoryItemRow {
  id: string;
  name: string;
  current_stock: number | string;
  minimum_stock: number | string;
  cost_per_unit: number | string;
}

interface InventoryMovementRow {
  inventory_item_id: string;
  quantity_change: number | string;
  unit_cost_snapshot: number | string | null;
}

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
}

interface RecipeInventoryRelation {
  cost_per_unit: number | string;
}

interface RecipeRow {
  menu_item_id: string;
  quantity: number | string;
  modifier_option_id: string | null;
  inventory_items:
    | RecipeInventoryRelation
    | RecipeInventoryRelation[]
    | null;
}

interface SoldOrderRow {
  id: string;
  order_items: Array<{ menu_item_id: string }>;
}

interface ReportSettingsRow {
  enabled: boolean;
  recipient_email: string;
}

interface ReportRunRow {
  report_date: string;
  status: "processing" | "sent" | "failed";
  sent_at: string | null;
  error_message: string;
}

interface PaymentTransactionRow {
  id: string;
  status: "completed" | "voided";
  subtotal_amount: number | string;
  discount_amount: number | string;
  tip_amount: number | string;
  payment_tenders: Array<{
    method: "efectivo" | "tarjeta" | "transferencia";
    amount: number | string;
  }>;
}

interface PaidOrderItemRow {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  menu_items: { name: string } | Array<{ name: string }> | null;
}

interface PaidOrderRow {
  id: string;
  order_items: PaidOrderItemRow[];
}

interface OpenOrderRow {
  total: number;
  paid_amount: number | string;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstError(
  results: Array<{ error: { message: string } | null }>
): { message: string } | null {
  return results.find((result) => result.error)?.error ?? null;
}

export function hermosilloDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Hermosillo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function previousHermosilloDateKey(now = new Date()): string {
  return hermosilloDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

export async function fetchOwnerOperationalData(
  supabase: SupabaseClient,
  period: AnalyticsPeriod
): Promise<OwnerOperationalData> {
  const start = queryTimestamp(period.from, "start");
  const end = queryTimestamp(period.to, "end");

  const [
    cashResult,
    kitchenResult,
    inventoryResult,
    movementsResult,
    menuResult,
    recipesResult,
    soldOrdersResult,
    settingsResult,
    lastRunResult,
  ] = await Promise.all([
    supabase
      .from("cash_shifts")
      .select("expected_cash,counted_cash,difference")
      .eq("status", "closed")
      .gte("closed_at", start)
      .lte("closed_at", end),
    supabase
      .from("order_status_log")
      .select("order_id,to_status,created_at")
      .in("to_status", ["in_kitchen", "ready"])
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_items")
      .select("id,name,current_stock,minimum_stock,cost_per_unit")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_movements")
      .select("inventory_item_id,quantity_change,unit_cost_snapshot")
      .in("movement_type", ["waste", "internal_use", "damage", "expired"])
      .gte("created_at", start)
      .lte("created_at", end),
    supabase
      .from("menu_items")
      .select("id,name,price")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_recipes")
      .select("menu_item_id,quantity,modifier_option_id,inventory_items(cost_per_unit)"),
    supabase
      .from("orders")
      .select("id,order_items(menu_item_id)")
      .eq("payment_status", "paid")
      .gte("paid_at", start)
      .lte("paid_at", end),
    supabase
      .from("owner_report_settings")
      .select("enabled,recipient_email")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("owner_daily_report_runs")
      .select("report_date,status,sent_at,error_message")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error = firstError([
    cashResult,
    kitchenResult,
    inventoryResult,
    movementsResult,
    menuResult,
    recipesResult,
    soldOrdersResult,
    settingsResult,
    lastRunResult,
  ]);
  if (error) {
    console.error("No se pudo cargar el control diario del dueño", error);
    throw new Error("No se pudo preparar el control diario del dueño.");
  }

  const cashShifts = (cashResult.data ?? []) as CashShiftRow[];
  const statusRows = (kitchenResult.data ?? []) as KitchenStatusRow[];
  const inventoryItems = (inventoryResult.data ?? []) as InventoryItemRow[];
  const movements = (movementsResult.data ?? []) as InventoryMovementRow[];
  const menuItems = (menuResult.data ?? []) as MenuItemRow[];
  const recipes = (recipesResult.data ?? []) as unknown as RecipeRow[];
  const soldOrders = (soldOrdersResult.data ?? []) as SoldOrderRow[];
  const settings = settingsResult.data as ReportSettingsRow | null;
  const lastRun = lastRunResult.data as ReportRunRow | null;

  const kitchenStarts = new Map<string, number>();
  const kitchenMinutes: number[] = [];
  for (const row of statusRows) {
    const timestamp = new Date(row.created_at).getTime();
    if (row.to_status === "in_kitchen") {
      if (!kitchenStarts.has(row.order_id)) kitchenStarts.set(row.order_id, timestamp);
      continue;
    }
    const startedAt = kitchenStarts.get(row.order_id);
    if (startedAt && timestamp >= startedAt) {
      kitchenMinutes.push((timestamp - startedAt) / 60_000);
      kitchenStarts.delete(row.order_id);
    }
  }

  const lowStock = inventoryItems.filter(
    (item) => numberValue(item.current_stock) <= numberValue(item.minimum_stock)
  );
  const itemCosts = new Map(
    inventoryItems.map((item) => [item.id, numberValue(item.cost_per_unit)])
  );
  const wasteQuantity = movements.reduce(
    (sum, movement) => sum + Math.abs(numberValue(movement.quantity_change)),
    0
  );
  const wasteCost = movements.reduce(
    (sum, movement) =>
      sum +
      Math.abs(numberValue(movement.quantity_change)) *
        numberValue(
          movement.unit_cost_snapshot ?? itemCosts.get(movement.inventory_item_id)
        ),
    0
  );

  const profitability = calculateProductProfitability(
    menuItems,
    recipes.map((recipe) => ({
      menuItemId: recipe.menu_item_id,
      quantity: numberValue(recipe.quantity),
      modifierOptionId: recipe.modifier_option_id,
      unitCost: numberValue(firstRelation(recipe.inventory_items)?.cost_per_unit),
    }))
  );
  const configured = profitability.filter(
    (product) => product.recipeStatus === "configured"
  );
  const lowestMargins = configured
    .filter((product) => product.marginPercent !== null)
    .sort((a, b) => (a.marginPercent ?? 0) - (b.marginPercent ?? 0))
    .slice(0, 5);
  const highestMargins = [...configured]
    .filter((product) => product.marginPercent !== null)
    .sort((a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0))
    .slice(0, 5);

  const soldProductIds = new Set(
    soldOrders.flatMap((order) =>
      (order.order_items ?? []).map((item) => item.menu_item_id)
    )
  );
  const productsWithoutSales = menuItems.filter(
    (item) => !soldProductIds.has(item.id)
  );
  const cashDifference = cashShifts.reduce(
    (sum, shift) => sum + numberValue(shift.difference),
    0
  );
  const delayedOrders = kitchenMinutes.filter((minutes) => minutes >= 15).length;
  const missingRecipes = profitability.length - configured.length;

  return {
    period,
    cash: {
      closedShifts: cashShifts.length,
      expectedCash: cashShifts.reduce(
        (sum, shift) => sum + numberValue(shift.expected_cash),
        0
      ),
      countedCash: cashShifts.reduce(
        (sum, shift) => sum + numberValue(shift.counted_cash),
        0
      ),
      difference: cashDifference,
    },
    kitchen: {
      completedOrders: kitchenMinutes.length,
      averageMinutes:
        kitchenMinutes.length > 0
          ? kitchenMinutes.reduce((sum, minutes) => sum + minutes, 0) /
            kitchenMinutes.length
          : null,
      delayedOrders,
    },
    inventory: {
      activeItems: inventoryItems.length,
      lowStockItems: lowStock.length,
      lowStockNames: lowStock.map((item) => item.name),
      wasteQuantity,
      wasteCost,
    },
    menu: {
      activeProducts: menuItems.length,
      productsWithoutSales: productsWithoutSales.length,
      productsWithoutSalesNames: productsWithoutSales
        .slice(0, 5)
        .map((item) => item.name),
      configuredRecipes: configured.length,
      missingRecipes,
      lowestMargins,
      highestMargins,
    },
    actions: buildOwnerActions({
      cashDifference,
      lowStockNames: lowStock.map((item) => item.name),
      delayedOrders,
      missingRecipes,
      lowMarginProducts: lowestMargins.filter(
        (product) => (product.marginPercent ?? 100) < 35
      ),
    }),
    report: {
      enabled: settings?.enabled ?? false,
      recipientEmail: settings?.recipient_email ?? "",
      lastRun: lastRun
        ? {
            reportDate: lastRun.report_date,
            status: lastRun.status,
            sentAt: lastRun.sent_at,
            errorMessage: lastRun.error_message,
          }
        : null,
    },
  };
}

export async function fetchOwnerDailySalesData(
  supabase: SupabaseClient,
  reportDate: string
): Promise<OwnerDailySalesData> {
  const start = queryTimestamp(reportDate, "start");
  const end = queryTimestamp(reportDate, "end");

  const [paymentsResult, paidOrdersResult, cancelledResult, openResult] =
    await Promise.all([
      supabase
        .from("payment_transactions")
        .select(
          "id,status,subtotal_amount,discount_amount,tip_amount,payment_tenders(method,amount)"
        )
        .gte("created_at", start)
        .lte("created_at", end),
      supabase
        .from("orders")
        .select(
          "id,order_items(menu_item_id,quantity,unit_price,menu_items(name))"
        )
        .eq("payment_status", "paid")
        .gte("paid_at", start)
        .lte("paid_at", end),
      supabase
        .from("orders")
        .select("id")
        .eq("status", "cancelled")
        .gte("created_at", start)
        .lte("created_at", end),
      supabase
        .from("orders")
        .select("total,paid_amount")
        .in("status", ["pending", "in_kitchen", "ready", "served"]),
    ]);

  const error = firstError([
    paymentsResult,
    paidOrdersResult,
    cancelledResult,
    openResult,
  ]);
  if (error) throw new Error("No se pudieron preparar las ventas del reporte.");

  const allPayments = (paymentsResult.data ?? []) as unknown as PaymentTransactionRow[];
  const payments = allPayments.filter((payment) => payment.status === "completed");
  const paidOrders = (paidOrdersResult.data ?? []) as unknown as PaidOrderRow[];
  const openOrders = (openResult.data ?? []) as OpenOrderRow[];
  const revenue = payments.reduce(
    (sum, payment) =>
      sum +
      numberValue(payment.subtotal_amount) -
      numberValue(payment.discount_amount),
    0
  );

  const paymentMethodMap = new Map<
    "efectivo" | "tarjeta" | "transferencia",
    number
  >();
  for (const payment of payments) {
    for (const tender of payment.payment_tenders ?? []) {
      paymentMethodMap.set(
        tender.method,
        (paymentMethodMap.get(tender.method) ?? 0) + numberValue(tender.amount)
      );
    }
  }

  const productMap = new Map<
    string,
    { name: string; quantity: number; revenue: number }
  >();
  for (const order of paidOrders) {
    for (const item of order.order_items ?? []) {
      const current = productMap.get(item.menu_item_id) ?? {
        name: firstRelation(item.menu_items)?.name ?? "Producto eliminado",
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += item.quantity * item.unit_price;
      productMap.set(item.menu_item_id, current);
    }
  }

  const pending = openOrders
    .map((order) => Math.max(0, order.total - numberValue(order.paid_amount)))
    .filter((amount) => amount > 0);

  return {
    reportDate,
    revenue,
    paidOrders: paidOrders.length,
    averageTicket: paidOrders.length > 0 ? revenue / paidOrders.length : 0,
    tips: payments.reduce(
      (sum, payment) => sum + numberValue(payment.tip_amount),
      0
    ),
    discounts: payments.reduce(
      (sum, payment) => sum + numberValue(payment.discount_amount),
      0
    ),
    cancellations: cancelledResult.data?.length ?? 0,
    voidedPayments: allPayments.filter((payment) => payment.status === "voided")
      .length,
    pendingOrders: pending.length,
    pendingAmount: pending.reduce((sum, amount) => sum + amount, 0),
    paymentMethods: Array.from(paymentMethodMap, ([method, amount]) => ({
      method,
      amount,
    })).sort((a, b) => b.amount - a.amount),
    topProducts: Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  };
}
