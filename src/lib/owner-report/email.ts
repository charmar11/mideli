import type {
  OwnerDailySalesData,
  OwnerOperationalData,
} from "@/lib/owner-report/types";
import { formatCurrency } from "@/lib/owner-report/metrics";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function methodLabel(method: string): string {
  if (method === "efectivo") return "Efectivo";
  if (method === "tarjeta") return "Tarjeta";
  return "Transferencia";
}

function metric(label: string, value: string, color = "#FBF8E7"): string {
  return `<td style="padding:14px;border:1px solid #3a333d;border-radius:12px;background:#211c23;width:50%;">
    <div style="font-size:11px;color:#b9aebc;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(label)}</div>
    <div style="margin-top:6px;font-size:22px;font-weight:800;color:${color};">${escapeHtml(value)}</div>
  </td>`;
}

export function renderOwnerDailyEmail(
  sales: OwnerDailySalesData,
  operation: OwnerOperationalData,
  options?: { preview?: boolean }
): string {
  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Hermosillo",
  }).format(new Date(`${sales.reportDate}T12:00:00-07:00`));
  const averageKitchen =
    operation.kitchen.averageMinutes === null
      ? "Sin datos"
      : `${Math.round(operation.kitchen.averageMinutes)} min`;

  return `<!doctype html>
  <html lang="es">
    <body style="margin:0;background:#100e12;color:#FBF8E7;font-family:Arial,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;">Ventas, caja, cocina e inventario de Mideli.</div>
      <main style="max-width:680px;margin:0 auto;padding:28px 18px;">
        <div style="font-size:34px;font-weight:800;color:#F5145F;">Mideli</div>
        <p style="margin:8px 0 0;color:#b9aebc;font-size:13px;">${options?.preview ? "Vista previa del reporte" : "Resumen diario del dueño"}</p>
        <h1 style="margin:26px 0 6px;font-size:25px;line-height:1.2;">Lo importante del día</h1>
        <p style="margin:0 0 20px;color:#b9aebc;text-transform:capitalize;">${escapeHtml(dateLabel)}</p>

        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px;">
          <tr>
            ${metric("Venta cobrada", formatCurrency(sales.revenue), "#F6DDA4")}
            ${metric("Pedidos pagados", String(sales.paidOrders))}
          </tr>
          <tr>
            ${metric("Ticket promedio", formatCurrency(sales.averageTicket))}
            ${metric("Por cobrar", formatCurrency(sales.pendingAmount), sales.pendingAmount > 0 ? "#F6A94A" : "#48C985")}
          </tr>
          <tr>
            ${metric("Tiempo de cocina", averageKitchen)}
            ${metric("Diferencia de caja", formatCurrency(operation.cash.difference), Math.abs(operation.cash.difference) > 0.009 ? "#FF637D" : "#48C985")}
          </tr>
        </table>

        <section style="margin-top:24px;padding:20px;border:1px solid #3a333d;border-radius:16px;background:#19161b;">
          <h2 style="margin:0 0 12px;font-size:17px;">Acciones recomendadas</h2>
          ${operation.actions
            .map(
              (action) => `<div style="padding:12px 0;border-top:1px solid #302a32;">
                <strong style="color:#FBF8E7;">${escapeHtml(action.title)}</strong>
                <div style="margin-top:4px;color:#b9aebc;font-size:13px;line-height:1.45;">${escapeHtml(action.detail)}</div>
              </div>`
            )
            .join("")}
        </section>

        <table role="presentation" style="width:100%;margin-top:24px;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#b9aebc;">Descuentos</td><td style="text-align:right;font-weight:700;">${escapeHtml(formatCurrency(sales.discounts))}</td></tr>
          <tr><td style="padding:8px 0;color:#b9aebc;">Propinas</td><td style="text-align:right;font-weight:700;">${escapeHtml(formatCurrency(sales.tips))}</td></tr>
          <tr><td style="padding:8px 0;color:#b9aebc;">Cancelaciones</td><td style="text-align:right;font-weight:700;">${sales.cancellations}</td></tr>
          <tr><td style="padding:8px 0;color:#b9aebc;">Pedidos demorados</td><td style="text-align:right;font-weight:700;">${operation.kitchen.delayedOrders}</td></tr>
          <tr><td style="padding:8px 0;color:#b9aebc;">Insumos bajos</td><td style="text-align:right;font-weight:700;">${operation.inventory.lowStockItems}</td></tr>
          <tr><td style="padding:8px 0;color:#b9aebc;">Merma estimada</td><td style="text-align:right;font-weight:700;">${escapeHtml(formatCurrency(operation.inventory.wasteCost))}</td></tr>
        </table>

        <section style="margin-top:24px;padding:20px;border-radius:16px;background:#211c23;">
          <h2 style="margin:0 0 12px;font-size:17px;">Métodos de pago</h2>
          ${
            sales.paymentMethods.length > 0
              ? sales.paymentMethods
                  .map(
                    (item) => `<div style="display:flex;justify-content:space-between;padding:7px 0;color:#b9aebc;">
                      <span>${methodLabel(item.method)}</span><strong style="color:#FBF8E7;">${escapeHtml(formatCurrency(item.amount))}</strong>
                    </div>`
                  )
                  .join("")
              : '<div style="color:#b9aebc;">No hubo cobros en el periodo.</div>'
          }
        </section>

        <section style="margin-top:16px;padding:20px;border-radius:16px;background:#211c23;">
          <h2 style="margin:0 0 12px;font-size:17px;">Productos con mayor venta</h2>
          ${
            sales.topProducts.length > 0
              ? sales.topProducts
                  .map(
                    (item) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;color:#b9aebc;">
                      <span>${escapeHtml(item.name)} · ${item.quantity}</span><strong style="color:#FBF8E7;">${escapeHtml(formatCurrency(item.revenue))}</strong>
                    </div>`
                  )
                  .join("")
              : '<div style="color:#b9aebc;">No hubo productos cobrados en el periodo.</div>'
          }
        </section>

        <p style="margin:28px 0 0;color:#817783;font-size:11px;line-height:1.5;">
          Los costos y márgenes son estimados y dependen de que las recetas y costos de compra estén actualizados.
        </p>
      </main>
    </body>
  </html>`;
}
