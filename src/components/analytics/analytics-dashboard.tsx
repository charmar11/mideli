"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { ReactNode } from "react";
import {
  Ban,
  BadgePercent,
  Banknote,
  Bike,
  ChevronDown,
  CircleDollarSign,
  Download,
  HandPlatter,
  HandCoins,
  Minus,
  Package,
  ReceiptText,
  ShoppingBag,
  Split,
  Store,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import { DateRangePicker } from "@/components/analytics/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  AnalyticsData,
  AnalyticsServiceFilter,
  ComparisonMetric,
  RankedBreakdown,
  SimpleBreakdown,
} from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";

const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics/analytics-trend-chart").then(
      (module) => module.AnalyticsTrendChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center font-body text-sm text-muted-foreground">
        Cargando tendencia...
      </div>
    ),
  }
);

const SERVICE_FILTERS: Array<{
  id: AnalyticsServiceFilter;
  label: string;
  icon: typeof UtensilsCrossed;
}> = [
  { id: "todos", label: "Todos", icon: HandPlatter },
  { id: "comedor", label: "Comedor", icon: UtensilsCrossed },
  { id: "domicilio", label: "Domicilio", icon: Bike },
  { id: "para_llevar", label: "Para llevar", icon: ShoppingBag },
  { id: "plataformas", label: "Plataformas", icon: Store },
];

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function ChangeBadge({ metric }: { metric: ComparisonMetric }) {
  const change = metric.change;
  const Icon = change === null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const label =
    change === null
      ? "Sin base previa"
      : change === 0
        ? "Sin cambio"
        : `${change > 0 ? "+" : ""}${number.format(change)}%`;

  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit items-center gap-1 rounded-lg px-2 font-data text-[11px] font-bold",
        change === null || change === 0
          ? "bg-surface-raised text-muted-foreground"
          : change > 0
            ? "bg-success/12 text-success"
            : "bg-destructive/12 text-destructive"
      )}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  comparison,
  detail,
  tone = "default",
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
  comparison?: ComparisonMetric;
  detail: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className="grid items-center gap-3 py-3.5 first:pt-0 last:pb-0"
      style={{ gridTemplateColumns: "2.5rem minmax(0, 1fr) auto" }}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl bg-surface-raised",
          tone === "warning"
            ? "text-warning"
            : tone === "danger"
              ? "text-destructive"
              : "text-muted-foreground"
        )}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-sm font-bold">{label}</span>
        <span className="block truncate font-body text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <span className="font-data text-base font-bold tabular-nums">{value}</span>
        {comparison ? <ChangeBadge metric={comparison} /> : null}
      </span>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  comparison,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
  detail: string;
  comparison?: ComparisonMetric;
}) {
  return (
    <div className="min-w-0 px-0 py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon size={15} className="shrink-0" />
        <span className="truncate font-heading text-xs font-bold">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-data text-2xl font-bold leading-none tabular-nums text-cream">
          {value}
        </span>
        {comparison ? <ChangeBadge metric={comparison} /> : null}
      </div>
      <p className="mt-1.5 truncate font-body text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MarketplaceBreakdown({ data }: { data: AnalyticsData }) {
  const showMarketplace =
    data.service === "todos" ||
    data.service === "para_llevar" ||
    data.service === "plataformas";
  const hasMarketplaceOrders =
    data.marketplace.orders.current > 0 || data.marketplace.orders.previous > 0;

  if (!showMarketplace || (!hasMarketplaceOrders && data.service !== "plataformas")) {
    return null;
  }

  return (
    <section aria-labelledby="analytics-marketplace-title">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="analytics-marketplace-title" className="font-heading text-base font-bold">
          Pedidos de plataformas
        </h2>
        <p className="font-body text-xs text-muted-foreground">
          Importes separados de caja; el valor de tickets no descuenta comisiones.
        </p>
      </div>
      {data.marketplace.platforms.length > 0 ? (
        <div className="divide-y divide-border border-y border-border">
          {data.marketplace.platforms.map((platform) => (
            <div
              key={platform.platform}
              className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-heading text-sm font-bold">
                  {platform.platform === "uber_eats" ? "Uber Eats" : "DiDi Food"}
                </p>
                <p className="mt-0.5 font-body text-xs text-muted-foreground">
                  {number.format(platform.orders)} {platform.orders === 1 ? "pedido" : "pedidos"}
                  {platform.pendingHandoffOrders > 0
                    ? ` · ${number.format(platform.pendingHandoffOrders)} por entregar`
                    : ""}
                  {platform.cancelledOrders > 0
                    ? ` · ${number.format(platform.cancelledOrders)} cancelados`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 sm:justify-end">
                <p className="font-body text-xs text-muted-foreground">
                  Entregados: <span className="font-data font-bold text-cream">{number.format(platform.handedOffOrders)}</span>
                  <span className="ml-1 text-cream">· {currency.format(platform.handedOffValue)}</span>
                </p>
                {platform.appValue > 0 ? (
                  <p className="font-body text-xs text-muted-foreground">
                    Pagado en app: <span className="font-data font-bold text-cream">{currency.format(platform.appValue)}</span>
                  </p>
                ) : null}
                {platform.cashReceived > 0 ? (
                  <p className="font-body text-xs text-muted-foreground">
                    Efectivo Didi en caja: <span className="font-data font-bold text-cream">{currency.format(platform.cashReceived)}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-y border-border py-5 font-body text-sm text-muted-foreground">
          No hay pedidos de Uber Eats ni DiDi Food en este periodo.
        </p>
      )}
    </section>
  );
}

function RankedList({
  items,
  emptyText,
  limit,
}: {
  items: RankedBreakdown[];
  emptyText: string;
  limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const maxRevenue = Math.max(...shown.map((item) => item.revenue), 1);

  if (shown.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl bg-surface-raised/55 px-6 text-center">
        <p className="font-body text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-1">
      {shown.map((item, index) => (
        <li
          key={item.id}
          className="group relative overflow-hidden rounded-xl px-3 py-3 hover:bg-surface-raised/70"
        >
          <span
            className="absolute inset-y-0 left-0 bg-brand/8"
            style={{ width: `${Math.max(3, (item.revenue / maxRevenue) * 100)}%` }}
            aria-hidden="true"
          />
          <div
            className="relative grid items-center gap-2"
            style={{ gridTemplateColumns: "1.75rem minmax(0, 1fr) auto" }}
          >
            <span className="font-data text-xs font-bold text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-sm font-bold">
                {item.label}
              </span>
              <span className="font-body text-xs text-muted-foreground">
                {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-data text-sm font-bold tabular-nums">
                {currency.format(item.revenue)}
              </span>
              <span className="font-data text-[10px] text-muted-foreground">
                {Math.round(item.share)}%
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DistributionList({ items }: { items: SimpleBreakdown[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-surface-raised/55 px-4 py-8 text-center font-body text-sm text-muted-foreground">
        Sin ventas cobradas en este periodo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id}>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <div>
              <p className="font-heading text-sm font-bold">{item.label}</p>
              <p className="font-body text-xs text-muted-foreground">
                {item.orders} {item.orders === 1 ? "pedido" : "pedidos"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-data text-sm font-bold tabular-nums">
                {currency.format(item.revenue)}
              </p>
              <p className="font-data text-[10px] text-muted-foreground">
                {Math.round(item.share)}%
              </p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${item.share}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(data: AnalyticsData) {
  const rows: Array<Array<string | number>> = [
    ["Analíticas del negocio"],
    ["Periodo", `${data.period.from} a ${data.period.to}`],
    ["Filtro", SERVICE_FILTERS.find((filter) => filter.id === data.service)?.label ?? data.service],
    [],
    ["Resumen", "Valor actual", "Periodo anterior"],
    ["Venta cobrada", data.summary.revenue.current, data.summary.revenue.previous],
    ["Pedidos pagados", data.summary.paidOrders.current, data.summary.paidOrders.previous],
    ["Ticket promedio", data.summary.averageTicket.current, data.summary.averageTicket.previous],
    ["Por cobrar ahora", data.summary.pendingAmount, ""],
    ["Cuentas abiertas", data.summary.pendingOrders, ""],
    ["Cancelaciones", data.summary.cancelledOrders, ""],
    ["Propinas", data.summary.tipsAmount, ""],
    ["Descuentos", data.summary.discountsAmount, ""],
    ["Pagos combinados", data.summary.combinedPayments, ""],
    ["Pagos anulados", data.summary.voidedPayments, ""],
    [],
    ["Pedidos de plataforma", "Pedidos", "Entregados", "Cancelados", "Valor de tickets entregados", "Pagado en app", "Efectivo Didi recibido"],
    ...data.marketplace.platforms.map((item) => [
      item.platform === "uber_eats" ? "Uber Eats" : "DiDi Food",
      item.orders,
      item.handedOffOrders,
      item.cancelledOrders,
      item.handedOffValue,
      item.appValue,
      item.cashReceived,
    ]),
    [],
    ["Productos", "Unidades", "Venta", "Participación"],
    ...data.topProducts.map((item) => [
      item.label,
      item.quantity,
      item.revenue,
      `${number.format(item.share)}%`,
    ]),
    [],
    ["Métodos de pago", "Pedidos", "Venta", "Participación"],
    ...data.paymentMethods.map((item) => [
      item.label,
      item.orders,
      item.revenue,
      `${number.format(item.share)}%`,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rincon404-analiticas-${data.period.from}-${data.period.to}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsDashboard({
  data,
  ownerControlContent,
}: {
  data: AnalyticsData;
  ownerControlContent: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isFiltering, startFilterTransition] = useTransition();
  const platformMode = data.service === "plataformas";

  function setService(service: AnalyticsServiceFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (service === "todos") params.delete("servicio");
    else params.set("servicio", service);
    startFilterTransition(() => {
      router.push(`/dashboard/analiticas?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="mideli-page-scroll h-full min-w-0 touch-pan-y overscroll-y-contain overflow-x-hidden overflow-y-auto">
      <div className="mx-auto min-w-0 max-w-[1480px] space-y-5 p-3 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-8 lg:p-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <h1 className="text-balance font-heading text-2xl font-bold tracking-[-0.02em] sm:text-[1.75rem]">
              Pulso del negocio
            </h1>
            <p className="mt-1 text-pretty font-body text-sm text-muted-foreground">
              {platformMode
                ? "Pedidos y entregas de Uber Eats y DiDi Food."
                : "Ventas cobradas, cuentas abiertas y el movimiento del periodo."}
            </p>
          </div>
          <div className="analytics-header-controls">
            <DateRangePicker period={data.period} />
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => downloadCsv(data)}
              className="h-12 w-full rounded-xl border-border bg-card px-4 font-heading font-bold hover:bg-surface-raised sm:w-auto"
            >
              <Download />
              Exportar
            </Button>
          </div>
        </header>

        <div className="pos-scroll flex touch-pan-x overscroll-x-contain overflow-x-auto rounded-xl bg-surface p-1.5 ring-1 ring-foreground/10">
          {SERVICE_FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setService(id)}
              disabled={isFiltering}
              aria-pressed={data.service === id}
              className={cn(
                "flex h-11 min-h-11 min-w-max touch-manipulation items-center gap-2 rounded-lg px-3 font-heading text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50",
                data.service === id
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <section
          aria-label="Resumen del periodo"
          className={cn(
            "grid divide-border overflow-hidden rounded-2xl bg-surface px-4 ring-1 ring-foreground/10 sm:px-5",
            platformMode
              ? "grid-cols-2 divide-x divide-y xl:grid-cols-4 xl:divide-y-0"
              : "grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          )}
        >
          {platformMode ? (
            <>
              <SummaryMetric
                icon={Store}
                label="Pedidos"
                value={number.format(data.marketplace.orders.current)}
                detail={`${data.marketplace.pendingHandoffOrders} por entregar · ${data.marketplace.cancelledOrders} cancelados`}
                comparison={data.marketplace.orders}
              />
              <SummaryMetric
                icon={ReceiptText}
                label="Entregados"
                value={number.format(data.marketplace.handedOffOrders.current)}
                detail="Confirmados al repartidor"
                comparison={data.marketplace.handedOffOrders}
              />
              <SummaryMetric
                icon={CircleDollarSign}
                label="Valor de tickets"
                value={currency.format(data.marketplace.handedOffValue.current)}
                detail="Bruto, antes de comisiones"
                comparison={data.marketplace.handedOffValue}
              />
              <SummaryMetric
                icon={Banknote}
                label="Efectivo Didi"
                value={currency.format(data.marketplace.cashReceived.current)}
                detail="Recibido en caja al entregar"
                comparison={data.marketplace.cashReceived}
              />
            </>
          ) : (
            <>
              <SummaryMetric
                icon={CircleDollarSign}
                label="Venta cobrada"
                value={currency.format(data.summary.revenue.current)}
                detail="Cobros registrados en caja"
                comparison={data.summary.revenue}
              />
              <SummaryMetric
                icon={ReceiptText}
                label="Pedidos pagados"
                value={number.format(data.summary.paidOrders.current)}
                detail="En el periodo elegido"
                comparison={data.summary.paidOrders}
              />
              <SummaryMetric
                icon={HandCoins}
                label="Ticket promedio"
                value={currency.format(data.summary.averageTicket.current)}
                detail="Por cobro completado"
                comparison={data.summary.averageTicket}
              />
            </>
          )}
        </section>

        <Card className="gap-0 rounded-2xl py-0">
          <CardContent className="p-4 sm:p-5">
            <AnalyticsTrendChart
              data={data.trend}
              mode={data.service === "plataformas" ? "platforms" : "sales"}
            />
          </CardContent>
        </Card>

        <MarketplaceBreakdown data={data} />

        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 border-y border-border py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-heading text-sm font-bold">Control del dueño</span>
              <span className="mt-0.5 block font-body text-xs text-muted-foreground">
                Caja, cocina, inventario, recetas y reporte diario
              </span>
            </span>
            <ChevronDown
              size={18}
              className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="pt-4">{ownerControlContent}</div>
        </details>

        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 border-y border-border py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-heading text-sm font-bold">
                {data.service === "plataformas" ? "Productos y categorías" : "Ver más datos del periodo"}
              </span>
              <span className="mt-0.5 block font-body text-xs text-muted-foreground">
                {data.service === "plataformas"
                  ? "Artículos en pedidos entregados"
                  : "Desglose financiero, productos, servicios y pagos"}
              </span>
            </span>
            <ChevronDown
              size={18}
              className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-4 space-y-4">
            {data.service !== "plataformas" ? (
              <section className="rounded-2xl bg-surface p-4 ring-1 ring-foreground/10 sm:p-5">
                <div className="mb-2">
                  <h2 className="font-heading text-base font-bold">Cierre del periodo</h2>
                  <p className="font-body text-sm text-muted-foreground">
                    Cobros de caja y asuntos pendientes.
                  </p>
                </div>
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="divide-y divide-border sm:pr-4">
                    <MetricRow
                      icon={ReceiptText}
                      label="Pedidos pagados"
                      value={number.format(data.summary.paidOrders.current)}
                      comparison={data.summary.paidOrders}
                      detail={`Antes: ${number.format(data.summary.paidOrders.previous)}`}
                    />
                    <MetricRow
                      icon={CircleDollarSign}
                      label="Ticket promedio"
                      value={currency.format(data.summary.averageTicket.current)}
                      comparison={data.summary.averageTicket}
                      detail={`Antes: ${currency.format(data.summary.averageTicket.previous)}`}
                    />
                    <MetricRow
                      icon={HandCoins}
                      label="Propinas"
                      value={currency.format(data.summary.tipsAmount)}
                      detail="Separadas de la venta de alimentos"
                    />
                    <MetricRow
                      icon={BadgePercent}
                      label="Descuentos autorizados"
                      value={currency.format(data.summary.discountsAmount)}
                      detail="Aplicados antes de dividir la cuenta"
                    />
                  </div>
                  <div className="divide-y divide-border sm:pl-4">
                    <MetricRow
                      icon={Split}
                      label="Pagos combinados"
                      value={number.format(data.summary.combinedPayments)}
                      detail="Dos o más métodos en el mismo cobro"
                    />
                    <MetricRow
                      icon={WalletCards}
                      label="Por cobrar ahora"
                      value={currency.format(data.summary.pendingAmount)}
                      detail={`${data.summary.pendingOrders} ${data.summary.pendingOrders === 1 ? "cuenta abierta" : "cuentas abiertas"}`}
                      tone={data.summary.pendingOrders > 0 ? "warning" : "default"}
                    />
                    <MetricRow
                      icon={Ban}
                      label="Cancelaciones"
                      value={number.format(data.summary.cancelledOrders)}
                      detail={`${number.format(data.summary.cancellationRate)}% de pedidos cerrados`}
                      tone={data.summary.cancelledOrders > 0 ? "danger" : "default"}
                    />
                    <MetricRow
                      icon={Ban}
                      label="Pagos anulados"
                      value={number.format(data.summary.voidedPayments)}
                      detail="No se incluyen en la venta cobrada"
                      tone={data.summary.voidedPayments > 0 ? "danger" : "default"}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            <section className="analytics-split-grid analytics-split-grid-content">
              <Card className="gap-0 rounded-2xl py-0">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                      <h2 className="font-heading text-lg font-bold">Productos más vendidos</h2>
                      <p className="font-body text-sm text-muted-foreground">
                        Ordenados por unidades y valor en tickets.
                      </p>
                    </div>
                    <Package className="shrink-0 text-brand" size={22} />
                  </div>
                  <RankedList
                    items={data.topProducts}
                    emptyText={
                      data.service === "plataformas"
                        ? "No hay productos de plataforma entregados en este periodo."
                        : "Los productos aparecerán cuando haya ventas o entregas registradas."
                    }
                  />
                </CardContent>
              </Card>

              {data.service !== "plataformas" ? (
                <Card className="gap-0 rounded-2xl py-0">
                  <CardContent className="p-4 sm:p-5">
                    <h2 className="font-heading text-lg font-bold">Lectura rápida</h2>
                    <div className="mt-3 divide-y divide-border">
                      {data.insights.map((insight) => (
                        <div key={insight.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-body text-xs text-muted-foreground">
                                {insight.title}
                              </p>
                              <p
                                className={cn(
                                  "mt-1 truncate font-heading text-base font-bold",
                                  insight.tone === "brand" && "text-brand",
                                  insight.tone === "gold" && "text-gold",
                                  insight.tone === "success" && "text-success",
                                  insight.tone === "warning" && "text-warning"
                                )}
                              >
                                {insight.value}
                              </p>
                            </div>
                            {insight.id === "pending-balance" ? (
                              <Banknote size={19} className="shrink-0 text-muted-foreground" />
                            ) : (
                              <TrendingUp size={19} className="shrink-0 text-muted-foreground" />
                            )}
                          </div>
                          <p className="mt-1 font-body text-xs text-muted-foreground">
                            {insight.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </section>

            <section className={cn("grid gap-4", data.service === "plataformas" ? "lg:grid-cols-1" : "lg:grid-cols-3")}>
              <Card className="gap-0 rounded-2xl py-0">
                <CardContent className="p-4 sm:p-5">
                  <h2 className="font-heading text-lg font-bold">Por categoría</h2>
                  <p className="mb-3 font-body text-sm text-muted-foreground">
                    Valor generado por los productos.
                  </p>
                  <RankedList
                    items={data.categories}
                    limit={6}
                    emptyText="No hay ventas registradas por categoría en este periodo."
                  />
                </CardContent>
              </Card>

              {data.service !== "plataformas" ? (
                <>
                  <Card className="gap-0 rounded-2xl py-0">
                    <CardContent className="p-4 sm:p-5">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-heading text-lg font-bold">Tipo de servicio</h2>
                          <p className="font-body text-sm text-muted-foreground">
                            Cobros registrados en caja.
                          </p>
                        </div>
                        <HandPlatter size={20} className="text-muted-foreground" />
                      </div>
                      <DistributionList items={data.orderTypes} />
                    </CardContent>
                  </Card>

                  <Card className="gap-0 rounded-2xl py-0">
                    <CardContent className="p-4 sm:p-5">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-heading text-lg font-bold">Métodos de pago</h2>
                          <p className="font-body text-sm text-muted-foreground">
                            Dinero recibido en caja.
                          </p>
                        </div>
                        <WalletCards size={20} className="text-muted-foreground" />
                      </div>
                      <DistributionList items={data.paymentMethods} />
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}
