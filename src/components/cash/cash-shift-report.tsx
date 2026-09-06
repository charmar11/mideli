import {
  ArrowLeftRight,
  Banknote,
  CircleAlert,
  CreditCard,
  Landmark,
  LockKeyhole,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Truck,
  Utensils,
  WalletCards,
} from "lucide-react";
import {
  cashShiftDifferenceTone,
  cashShiftDuration,
  cashShiftServiceCounts,
} from "@/lib/cash-shift-report";
import { formatOrderLocation } from "@/lib/order-location";
import type { CashShiftDetail, CashShiftPaymentSummary } from "@/types/cash";

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "En curso";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function serviceLabel(type: CashShiftPaymentSummary["order_type"]) {
  if (type === "comedor") return "Comedor";
  if (type === "domicilio") return "Domicilio";
  return "Para llevar";
}

function paymentMethodLabel(method: string) {
  if (method === "efectivo") return "Efectivo";
  if (method === "tarjeta") return "Tarjeta";
  if (method === "transferencia") return "Transferencia";
  return method;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold"
      : tone === "success"
        ? "text-success"
        : tone === "danger"
          ? "text-destructive"
          : tone === "warning"
            ? "text-warning"
            : "text-foreground";

  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3 print:border-gray-300 print:bg-white">
      <p className="font-body text-xs text-muted-foreground print:text-gray-600">{label}</p>
      <p className={`mt-1 font-data text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background/40 p-4 print:border-gray-300 print:bg-white">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-black">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, string, React.ReactNode?]> }) {
  return (
    <div className="space-y-2.5">
      {rows.map(([label, value, icon]) => (
        <div key={label} className="flex items-center justify-between gap-3 font-body text-sm">
          <span className="flex items-center gap-2 text-muted-foreground print:text-gray-600">
            {icon}
            {label}
          </span>
          <strong className="font-data text-right">{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function CashShiftReport({ shift }: { shift: CashShiftDetail }) {
  const isClosed = shift.status === "closed";
  const totals = isClosed ? shift : (shift.operating_totals ?? shift);
  const serviceCounts = cashShiftServiceCounts(shift.payments);
  const differenceTone = cashShiftDifferenceTone(shift.difference);

  return (
    <div className="space-y-4 print:bg-white print:text-black">
      <section className="rounded-2xl border border-success/25 bg-success/8 p-4 print:border-gray-300 print:bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-[10px] uppercase tracking-[0.18em] text-success">{isClosed ? "Corte digital" : "Turno en curso"}</p>
            <h2 className="mt-1 font-heading text-xl font-black">{isClosed ? "Corte" : "Caja"} #{shift.number}</h2>
            <p className="mt-1 font-body text-xs text-muted-foreground print:text-gray-600">
              {dateTime(shift.opened_at)} a {dateTime(shift.closed_at)} · {cashShiftDuration(shift.opened_at, shift.closed_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-body text-xs text-muted-foreground">{isClosed ? "Cerró" : "Abrió"}</p>
            <p className="font-heading text-sm font-bold">{isClosed ? (shift.closed_by_name ?? shift.opened_by_name) : shift.opened_by_name}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isClosed ? (
          <>
            <Metric label="Venta Mideli" value={money(shift.net_sales)} tone="gold" />
            <Metric label="Cobrado" value={money(shift.collected_total)} tone="success" />
            <Metric label="Cobros" value={String(shift.payment_count)} />
            <Metric label="Diferencia" value={money(shift.difference)} tone={differenceTone} />
          </>
        ) : (
          <>
            <Metric label="Cobros" value={String(totals.payment_count)} />
            <Metric label="Tarjeta" value={money(totals.card_total)} />
            <Metric label="Transferencia" value={money(totals.transfer_total)} />
            <Metric label="Pendiente" value={money(totals.pending_balance)} tone="warning" />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-raised/80 p-3 text-center">
          <Utensils className="mx-auto text-gold" size={18} />
          <p className="mt-1 font-data text-lg font-black">{serviceCounts.comedor}</p>
          <p className="font-body text-[11px] text-muted-foreground">Comedor</p>
        </div>
        <div className="rounded-xl bg-surface-raised/80 p-3 text-center">
          <ShoppingBag className="mx-auto text-brand" size={18} />
          <p className="mt-1 font-data text-lg font-black">{serviceCounts.para_llevar}</p>
          <p className="font-body text-[11px] text-muted-foreground">Para llevar</p>
        </div>
        <div className="rounded-xl bg-surface-raised/80 p-3 text-center">
          <Truck className="mx-auto text-success" size={18} />
          <p className="mt-1 font-data text-lg font-black">{serviceCounts.domicilio}</p>
          <p className="font-body text-[11px] text-muted-foreground">Domicilio</p>
        </div>
      </div>

      {totals.pending_order_count > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4">
          <CircleAlert className="mt-0.5 shrink-0 text-warning" size={19} />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-bold text-warning">
              {totals.pending_order_count} {totals.pending_order_count === 1 ? "cuenta pendiente" : "cuentas pendientes"}
            </p>
            <p className="mt-1 font-body text-xs text-muted-foreground">
              Se transfirieron al siguiente turno. No cuentan como dinero cobrado.
            </p>
          </div>
          <strong className="shrink-0 font-data text-warning">{money(totals.pending_balance)}</strong>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="Métodos de pago" icon={<WalletCards size={17} />}>
          <Rows
            rows={[
              ["Efectivo", isClosed ? money(shift.cash_total) : "Protegido", <Banknote key="cash" size={15} />],
              ["Tarjeta", money(totals.card_total), <CreditCard key="card" size={15} />],
              ["Transferencia", money(totals.transfer_total), <ArrowLeftRight key="transfer" size={15} />],
              ["Propinas", money(totals.tip_total)],
              ["Descuentos", money(totals.discount_total)],
            ]}
          />
        </Block>

        <Block title={isClosed ? "Arqueo de efectivo" : "Efectivo protegido"} icon={<Landmark size={17} />}>
          {isClosed ? (
            <Rows
              rows={[
                ["Fondo inicial", money(shift.opening_float)],
                ["Ventas en efectivo", money(shift.cash_total)],
                ["Entradas de fondo", money(shift.fund_in_total)],
                ["Retiros", money(shift.withdrawal_total)],
                ["Gastos", money(shift.expense_total)],
                ["Correcciones", money(shift.correction_total)],
                ["Efectivo esperado", money(shift.expected_cash)],
                ["Efectivo contado", money(shift.counted_cash)],
              ]}
            />
          ) : (
            <p className="font-body text-sm text-muted-foreground">El efectivo esperado se mostrará únicamente después del conteo ciego.</p>
          )}
        </Block>
      </div>

      <Block title={`Ventas del turno · ${shift.payments.length}`} icon={<ReceiptText size={17} />}>
        {shift.payments.length === 0 ? (
          <p className="py-5 text-center font-body text-sm text-muted-foreground">No hubo cobros registrados en este turno.</p>
        ) : (
          <div className="divide-y divide-border">
            {shift.payments.map((payment) => {
              const orderLabel = payment.order_numbers?.length
                ? `Pedido${payment.order_numbers.length > 1 ? "s" : ""} ${payment.order_numbers.map((number) => `#${number}`).join(", ")}`
                : `Ticket #${payment.folio}`;
              const location = formatOrderLocation({
                type: payment.order_type ?? (payment.table_number ? "comedor" : "para_llevar"),
                table_number: payment.table_number,
                table_zone_name: payment.table_zone_name,
                customer_name: payment.customer_name,
              });
              return (
                <div key={payment.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-sm font-bold">{orderLabel}</p>
                      <span className={`rounded-full px-2 py-0.5 font-heading text-[10px] font-bold ${payment.status === "voided" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                        {payment.status === "voided" ? "Anulado" : serviceLabel(payment.order_type)}
                      </span>
                    </div>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {location} · {payment.item_count ?? 0} artículos
                    </p>
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      {(payment.payment_methods ?? []).map(paymentMethodLabel).join(" + ") || "Método no disponible"} · {payment.charged_by_name}
                    </p>
                  </div>
                  <strong className={`shrink-0 font-data ${payment.status === "voided" ? "text-destructive line-through" : "text-foreground"}`}>
                    {money(payment.total_amount)}
                  </strong>
                </div>
              );
            })}
          </div>
        )}
      </Block>

      {shift.pending_orders.length > 0 ? (
        <Block title={`Cuentas transferidas · ${shift.pending_orders.length}`} icon={<CircleAlert size={17} />}>
          <div className="divide-y divide-border">
            {shift.pending_orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold">Pedido #{order.order_number}</p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {formatOrderLocation({
                      type: order.order_type,
                      table_number: order.table_number,
                      table_zone_name: order.table_zone_name,
                      customer_name: order.customer_name,
                    })}
                  </p>
                </div>
                <strong className="shrink-0 font-data text-warning">{money(order.outstanding_amount)}</strong>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {shift.movements.length > 0 ? (
        <Block title="Movimientos autorizados" icon={<RotateCcw size={17} />}>
          <div className="divide-y divide-border">
            {shift.movements.map((movement) => (
              <div key={movement.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <strong className="font-heading text-sm">{movement.reason}</strong>
                  <span className={`font-data text-sm font-bold ${movement.direction === "in" ? "text-success" : "text-destructive"}`}>
                    {movement.direction === "in" ? "+" : "−"}{money(movement.amount)}
                  </span>
                </div>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {movement.created_by_name} · autorizó {movement.authorized_by_name} · {dateTime(movement.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {shift.adjustments.length > 0 ? (
        <Block title="Correcciones posteriores" icon={<LockKeyhole size={17} />}>
          <div className="divide-y divide-border">
            {shift.adjustments.map((adjustment) => (
              <div key={adjustment.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <strong className="font-heading text-sm">{adjustment.reason}</strong>
                  <span className={`font-data text-sm font-bold ${adjustment.direction === "increase" ? "text-success" : "text-destructive"}`}>
                    {adjustment.direction === "increase" ? "+" : "−"}{money(adjustment.amount)}
                  </span>
                </div>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {paymentMethodLabel(adjustment.payment_method)} · {adjustment.created_by_name} · autorizó {adjustment.authorized_by_name}
                </p>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {shift.opening_float_changes.length > 0 ? (
        <Block title="Correcciones del fondo inicial" icon={<Pencil size={17} />}>
          <div className="divide-y divide-border">
            {shift.opening_float_changes.map((change) => (
              <div key={change.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <strong className="font-heading text-sm">{change.reason}</strong>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    {change.changed_by_name} · {dateTime(change.created_at)}
                  </p>
                </div>
                <span className="shrink-0 text-right font-data text-xs">
                  <span className="text-muted-foreground line-through">{money(change.previous_amount)}</span>
                  <strong className="ml-2 text-gold">{money(change.new_amount)}</strong>
                </span>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {shift.close_note ? (
        <Block title="Nota del cierre" icon={<ReceiptText size={17} />}>
          <p className="font-body text-sm text-foreground">{shift.close_note}</p>
        </Block>
      ) : null}
    </div>
  );
}
