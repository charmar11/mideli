"use server";

import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  getPreviousPeriod,
  parseDateKey,
  queryTimestamp,
  toDateKey,
  type AnalyticsPeriod,
} from "@/lib/analytics/period";

export type AnalyticsServiceFilter =
  | "todos"
  | "comedor"
  | "domicilio"
  | "para_llevar";

export interface AnalyticsParams {
  period: AnalyticsPeriod;
  service: AnalyticsServiceFilter;
}

export interface ComparisonMetric {
  current: number;
  previous: number;
  change: number | null;
}

export interface AnalyticsSummary {
  revenue: ComparisonMetric;
  paidOrders: ComparisonMetric;
  averageTicket: ComparisonMetric;
  pendingOrders: number;
  pendingAmount: number;
  cancelledOrders: number;
  cancellationRate: number;
  tipsAmount: number;
  discountsAmount: number;
  combinedPayments: number;
  voidedPayments: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  previousRevenue: number;
  previousOrders: number;
}

export interface RankedBreakdown {
  id: string;
  label: string;
  quantity: number;
  revenue: number;
  share: number;
}

export interface SimpleBreakdown {
  id: string;
  label: string;
  orders: number;
  revenue: number;
  share: number;
}

export interface AnalyticsInsight {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: "brand" | "gold" | "success" | "warning";
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
  service: AnalyticsServiceFilter;
  summary: AnalyticsSummary;
  trend: TrendPoint[];
  topProducts: RankedBreakdown[];
  categories: RankedBreakdown[];
  orderTypes: SimpleBreakdown[];
  paymentMethods: SimpleBreakdown[];
  insights: AnalyticsInsight[];
}

interface JoinedCategory {
  name: string;
}

interface JoinedMenuItem {
  name: string;
  categories: JoinedCategory | JoinedCategory[] | null;
}

interface PaidOrderItemRow {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  menu_items: JoinedMenuItem | JoinedMenuItem[] | null;
}

interface PaidOrderRow {
  id: string;
  number: number;
  type: Exclude<AnalyticsServiceFilter, "todos">;
  total: number;
  payment_method: "efectivo" | "tarjeta" | "transferencia" | null;
  paid_at: string;
  order_items: PaidOrderItemRow[];
}

interface OpenOrderRow {
  id: string;
  total: number;
  paid_amount: number;
  type: Exclude<AnalyticsServiceFilter, "todos">;
}

interface PaymentTransactionRow {
  id: string;
  status: "completed" | "voided";
  subtotal_amount: number;
  discount_amount: number;
  tip_amount: number;
  total_amount: number;
  order_type: Exclude<AnalyticsServiceFilter, "todos">;
  created_at: string;
  payment_tenders: Array<{
    method: "efectivo" | "tarjeta" | "transferencia";
    amount: number;
  }>;
}

const HERMOSILLO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Hermosillo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const HERMOSILLO_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Hermosillo",
  hour: "2-digit",
  hour12: false,
});

const SHORT_DAY = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
});

const SHORT_MONTH = new Intl.DateTimeFormat("es-MX", { month: "short" });

const ORDER_SELECT = `
  id,
  number,
  type,
  total,
  payment_method,
  paid_at,
  order_items (
    menu_item_id,
    quantity,
    unit_price,
    menu_items (
      name,
      categories (name)
    )
  )
`;

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function metric(current: number, previous: number): ComparisonMetric {
  return {
    current,
    previous,
    change: percentageChange(current, previous),
  };
}

function localDateKey(iso: string): string {
  return HERMOSILLO_DATE.format(new Date(iso));
}

function localHour(iso: string): number {
  return Number(HERMOSILLO_HOUR.format(new Date(iso))) % 24;
}

function formatBucketLabel(
  period: AnalyticsPeriod,
  key: string,
  index: number
): string {
  if (period.view === "dia") return `${String(index).padStart(2, "0")}:00`;
  const date = parseDateKey(key);
  if (period.view === "semana") return SHORT_DAY.format(date).replace(".", "");
  if (period.view === "mes") return String(date.getDate());
  return SHORT_MONTH.format(date).replace(".", "");
}

function createBucketKeys(period: AnalyticsPeriod): string[] {
  if (period.view === "dia") {
    return Array.from({ length: 24 }, (_, hour) => String(hour));
  }

  if (period.view === "anio") {
    const year = parseDateKey(period.from).getFullYear();
    const endMonth = parseDateKey(period.to).getMonth();
    return Array.from({ length: endMonth + 1 }, (_, month) =>
      toDateKey(new Date(year, month, 1, 12))
    );
  }

  const keys: string[] = [];
  let cursor = parseDateKey(period.from);
  const end = parseDateKey(period.to);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function bucketKey(order: PaidOrderRow, period: AnalyticsPeriod): string {
  if (period.view === "dia") return String(localHour(order.paid_at));
  const dateKey = localDateKey(order.paid_at);
  if (period.view !== "anio") return dateKey;
  const date = parseDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

function aggregateBuckets(
  orders: PaidOrderRow[],
  period: AnalyticsPeriod
): Array<{ key: string; revenue: number; orders: number }> {
  const values = new Map(
    createBucketKeys(period).map((key) => [key, { revenue: 0, orders: 0 }])
  );

  for (const order of orders) {
    const value = values.get(bucketKey(order, period));
    if (!value) continue;
    value.revenue += order.total ?? 0;
    value.orders += 1;
  }

  return Array.from(values, ([key, value]) => ({ key, ...value }));
}

function buildTrend(
  orders: PaidOrderRow[],
  previousOrders: PaidOrderRow[],
  period: AnalyticsPeriod,
  previousPeriod: AnalyticsPeriod
): TrendPoint[] {
  const current = aggregateBuckets(orders, period);
  const previous = aggregateBuckets(previousOrders, previousPeriod);

  return current.map((point, index) => ({
    key: point.key,
    label: formatBucketLabel(period, point.key, index),
    revenue: point.revenue,
    orders: point.orders,
    previousRevenue: previous[index]?.revenue ?? 0,
    previousOrders: previous[index]?.orders ?? 0,
  }));
}

function buildRankedBreakdown(
  orders: PaidOrderRow[],
  field: "product" | "category"
): RankedBreakdown[] {
  const values = new Map<string, { label: string; quantity: number; revenue: number }>();

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const menuItem = firstRelation(item.menu_items);
      const category = firstRelation(menuItem?.categories ?? null);
      const id =
        field === "product"
          ? item.menu_item_id
          : category?.name ?? "Sin categoría";
      const label =
        field === "product"
          ? menuItem?.name ?? "Producto eliminado"
          : category?.name ?? "Sin categoría";
      const existing = values.get(id) ?? { label, quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.quantity * item.unit_price;
      values.set(id, existing);
    }
  }

  const totalRevenue = Array.from(values.values()).reduce(
    (sum, item) => sum + item.revenue,
    0
  );

  return Array.from(values, ([id, value]) => ({
    id,
    ...value,
    share: totalRevenue > 0 ? (value.revenue / totalRevenue) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

function buildTransactionBreakdown(
  transactions: PaymentTransactionRow[],
  field: "type" | "payment"
): SimpleBreakdown[] {
  const labels: Record<string, string> = {
    comedor: "Comedor",
    domicilio: "Domicilio",
    para_llevar: "Para llevar",
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
  };
  const values = new Map<string, { orders: number; revenue: number }>();
  if (field === "type") {
    for (const transaction of transactions) {
      const current = values.get(transaction.order_type) ?? { orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += transaction.subtotal_amount - transaction.discount_amount;
      values.set(transaction.order_type, current);
    }
  } else {
    for (const transaction of transactions) {
      for (const tender of transaction.payment_tenders ?? []) {
        const current = values.get(tender.method) ?? { orders: 0, revenue: 0 };
        current.orders += 1;
        current.revenue += Number(tender.amount);
        values.set(tender.method, current);
      }
    }
  }
  const total = Array.from(values.values()).reduce((sum, value) => sum + value.revenue, 0);
  return Array.from(values, ([id, value]) => ({
    id,
    label: labels[id] ?? id,
    ...value,
    share: total > 0 ? value.revenue / total * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

function buildInsights(
  orders: PaidOrderRow[],
  products: RankedBreakdown[],
  orderTypes: SimpleBreakdown[],
  pendingOrders: number,
  pendingAmount: number
): AnalyticsInsight[] {
  const hourMap = new Map<number, { orders: number; revenue: number }>();
  for (const order of orders) {
    const hour = localHour(order.paid_at);
    const value = hourMap.get(hour) ?? { orders: 0, revenue: 0 };
    value.orders += 1;
    value.revenue += order.total ?? 0;
    hourMap.set(hour, value);
  }

  const peakHour = Array.from(hourMap.entries()).sort(
    (a, b) => b[1].orders - a[1].orders || b[1].revenue - a[1].revenue
  )[0];
  const topProduct = products[0];
  const topType = orderTypes[0];
  const currency = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  return [
    {
      id: "peak-hour",
      title: "Hora con más movimiento",
      value: peakHour ? `${String(peakHour[0]).padStart(2, "0")}:00` : "Sin datos",
      detail: peakHour
        ? `${peakHour[1].orders} pedidos cobrados en esa hora`
        : "Aún no hay pedidos cobrados en el periodo",
      tone: "brand",
    },
    {
      id: "top-product",
      title: "Producto que más aporta",
      value: topProduct?.label ?? "Sin datos",
      detail: topProduct
        ? `${topProduct.quantity} unidades, ${currency.format(topProduct.revenue)}`
        : "Aparecerá cuando existan ventas cobradas",
      tone: "gold",
    },
    {
      id: "service-leader",
      title: "Canal principal",
      value: topType?.label ?? "Sin datos",
      detail: topType
        ? `${Math.round(topType.share)}% de la venta cobrada`
        : "Sin distribución disponible",
      tone: "success",
    },
    {
      id: "pending-balance",
      title: "Por cobrar ahora",
      value: currency.format(pendingAmount),
      detail:
        pendingOrders === 1
          ? "1 cuenta sigue abierta"
          : `${pendingOrders} cuentas siguen abiertas`,
      tone: pendingOrders > 0 ? "warning" : "success",
    },
  ];
}

export async function fetchAnalytics({
  period,
  service,
}: AnalyticsParams): Promise<AnalyticsData> {
  const supabase = await createClient();
  const previousPeriod = getPreviousPeriod(period);
  const currentStart = queryTimestamp(period.from, "start");
  const currentEnd = queryTimestamp(period.to, "end");
  const previousStart = queryTimestamp(previousPeriod.from, "start");
  const previousEnd = queryTimestamp(previousPeriod.to, "end");

  let currentQuery = supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("payment_status", "paid")
    .gte("paid_at", currentStart)
    .lte("paid_at", currentEnd)
    .order("paid_at", { ascending: true });
  let cancelledQuery = supabase
    .from("orders")
    .select("id, type")
    .eq("status", "cancelled")
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);
  let openQuery = supabase
    .from("orders")
    .select("id, total, paid_amount, type")
    .in("status", ["pending", "in_kitchen", "ready", "served"]);
  let currentPaymentsQuery = supabase
    .from("payment_transactions")
    .select("id,status,subtotal_amount,discount_amount,tip_amount,total_amount,order_type,created_at,payment_tenders(method,amount)")
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd)
    .order("created_at", { ascending: true });
  let previousPaymentsQuery = supabase
    .from("payment_transactions")
    .select("id,status,subtotal_amount,discount_amount,tip_amount,total_amount,order_type,created_at,payment_tenders(method,amount)")
    .eq("status", "completed")
    .gte("created_at", previousStart)
    .lte("created_at", previousEnd)
    .order("created_at", { ascending: true });

  if (service !== "todos") {
    currentQuery = currentQuery.eq("type", service);
    cancelledQuery = cancelledQuery.eq("type", service);
    openQuery = openQuery.eq("type", service);
    currentPaymentsQuery = currentPaymentsQuery.eq("order_type", service);
    previousPaymentsQuery = previousPaymentsQuery.eq("order_type", service);
  }

  const [
    currentResult,
    cancelledResult,
    openResult,
    currentPaymentsResult,
    previousPaymentsResult,
  ] = await Promise.all([
    currentQuery,
    cancelledQuery,
    openQuery,
    currentPaymentsQuery,
    previousPaymentsQuery,
  ]);

  const firstError =
    currentResult.error ??
    cancelledResult.error ??
    openResult.error ??
    currentPaymentsResult.error ??
    previousPaymentsResult.error;
  if (firstError) {
    console.error("No se pudieron cargar las analíticas", firstError);
    throw new Error("No se pudieron cargar las analíticas del periodo.");
  }

  const orders = (currentResult.data ?? []) as unknown as PaidOrderRow[];
  const openOrders = (openResult.data ?? []) as OpenOrderRow[];
  const allCurrentPayments = (currentPaymentsResult.data ?? []) as unknown as PaymentTransactionRow[];
  const payments = allCurrentPayments.filter((transaction) => transaction.status === "completed");
  const previousPayments = (previousPaymentsResult.data ?? []) as unknown as PaymentTransactionRow[];
  const revenue = payments.reduce(
    (sum, transaction) => sum + transaction.subtotal_amount - transaction.discount_amount,
    0
  );
  const previousRevenue = previousPayments.reduce(
    (sum, transaction) => sum + transaction.subtotal_amount - transaction.discount_amount,
    0
  );
  const pendingAmount = openOrders.reduce(
    (sum, order) => sum + Math.max(0, (order.total ?? 0) - Number(order.paid_amount ?? 0)),
    0
  );
  const pendingOrders = openOrders.filter(
    (order) => Number(order.paid_amount ?? 0) < order.total
  ).length;
  const averageTicket = payments.length > 0 ? revenue / payments.length : 0;
  const previousAverage =
    previousPayments.length > 0 ? previousRevenue / previousPayments.length : 0;
  const cancelledOrders = cancelledResult.data?.length ?? 0;
  const products = buildRankedBreakdown(orders, "product");
  const categories = buildRankedBreakdown(orders, "category");
  const orderTypes = buildTransactionBreakdown(payments, "type");
  const paymentMethods = buildTransactionBreakdown(payments, "payment");
  const currentTrendOrders = payments.map((transaction) => ({
    id: transaction.id,
    number: 0,
    type: transaction.order_type,
    total: transaction.subtotal_amount - transaction.discount_amount,
    payment_method: null,
    paid_at: transaction.created_at,
    order_items: [],
  })) satisfies PaidOrderRow[];
  const previousTrendOrders = previousPayments.map((transaction) => ({
    id: transaction.id,
    number: 0,
    type: transaction.order_type,
    total: transaction.subtotal_amount - transaction.discount_amount,
    payment_method: null,
    paid_at: transaction.created_at,
    order_items: [],
  })) satisfies PaidOrderRow[];

  return {
    period,
    previousPeriod,
    service,
    summary: {
      revenue: metric(revenue, previousRevenue),
      paidOrders: metric(payments.length, previousPayments.length),
      averageTicket: metric(averageTicket, previousAverage),
      pendingOrders,
      pendingAmount,
      cancelledOrders,
      cancellationRate:
        orders.length + cancelledOrders > 0
          ? (cancelledOrders / (orders.length + cancelledOrders)) * 100
          : 0,
      tipsAmount: payments.reduce((sum, transaction) => sum + Number(transaction.tip_amount), 0),
      discountsAmount: payments.reduce((sum, transaction) => sum + Number(transaction.discount_amount), 0),
      combinedPayments: payments.filter((transaction) => (transaction.payment_tenders ?? []).length > 1).length,
      voidedPayments: allCurrentPayments.filter((transaction) => transaction.status === "voided").length,
    },
    trend: buildTrend(currentTrendOrders, previousTrendOrders, period, previousPeriod),
    topProducts: products.slice(0, 8),
    categories,
    orderTypes,
    paymentMethods,
    insights: buildInsights(
      currentTrendOrders,
      products,
      orderTypes,
      pendingOrders,
      pendingAmount
    ),
  };
}
