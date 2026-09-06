import type { CashShiftDetail, CashShiftPaymentSummary } from "@/types/cash";

export type CashShiftDifferenceTone = "success" | "danger";

export function cashShiftDifferenceTone(
  difference: number | null | undefined
): CashShiftDifferenceTone {
  return Math.abs(Number(difference ?? 0)) <= 20 ? "success" : "danger";
}

export function cashShiftDuration(openedAt: string, closedAt: string | null) {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const minutes = Math.max(
    0,
    Math.floor((end - new Date(openedAt).getTime()) / 60_000)
  );
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours} h ${remainder} min` : `${remainder} min`;
}

export function cashShiftServiceCounts(payments: CashShiftPaymentSummary[]) {
  return payments.reduce(
    (counts, payment) => {
      if (payment.status !== "completed") return counts;
      const orderCount = Math.max(1, payment.order_numbers?.length ?? 0);
      const type = payment.order_type ?? "para_llevar";
      counts[type] += orderCount;
      return counts;
    },
    { comedor: 0, domicilio: 0, para_llevar: 0 }
  );
}

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

export function buildCashShiftShareText(shift: CashShiftDetail) {
  const counts = cashShiftServiceCounts(shift.payments);
  const lines = [
    `Corte Mideli #${shift.number}`,
    `${dateTime(shift.opened_at)} a ${dateTime(shift.closed_at)}`,
    `Responsable: ${shift.closed_by_name ?? shift.opened_by_name}`,
    "",
    `Pedidos cobrados: ${shift.payment_count}`,
    `Comedor: ${counts.comedor}`,
    `Para llevar: ${counts.para_llevar}`,
    `Domicilio: ${counts.domicilio}`,
    `Venta neta: ${money(shift.net_sales)}`,
    `Cobrado: ${money(shift.collected_total)}`,
    "",
    `Efectivo: ${money(shift.cash_total)}`,
    `Tarjeta: ${money(shift.card_total)}`,
    `Transferencia: ${money(shift.transfer_total)}`,
    "",
    `Efectivo esperado: ${money(shift.expected_cash)}`,
    `Efectivo contado: ${money(shift.counted_cash)}`,
    `Diferencia: ${money(shift.difference)}`,
  ];

  if (shift.pending_order_count > 0) {
    lines.push(
      "",
      `Pendientes transferidos: ${shift.pending_order_count}`,
      `Saldo pendiente: ${money(shift.pending_balance)}`
    );
  }

  return lines.join("\n");
}
