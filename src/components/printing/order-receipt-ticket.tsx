import type { CSSProperties } from "react";
import type { BusinessOrderPrintData } from "@/lib/actions/business-receipts";
import { formatPhoneForDisplay } from "@/lib/phone";
import { getOrderReceiptTotals } from "@/lib/order-receipt";

function money(value: number) {
  return `$${Math.max(0, value).toLocaleString("es-MX", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

type ReceiptPaymentDetails = Pick<
  BusinessOrderPrintData["order"],
  | "marketplacePlatform"
  | "marketplacePaymentMode"
  | "marketplaceCashReceived"
  | "paymentMethod"
  | "paymentStatus"
  | "paidAmount"
  | "requestedPaymentMethod"
>;

export function getOrderReceiptPaymentLabel(order: ReceiptPaymentDetails) {
  if (order.marketplacePlatform === "uber_eats") return "Uber Eats · pagado en app";
  if (order.marketplacePlatform === "didi_food" && order.marketplacePaymentMode === "app") return "Didi Food · pagado en app";
  if (order.marketplacePlatform === "didi_food" && order.marketplacePaymentMode === "cash") {
    return order.marketplaceCashReceived === null
      ? "Didi Food · efectivo al repartidor"
      : `Didi Food · efectivo recibido ${money(order.marketplaceCashReceived)}`;
  }
  if (order.paymentMethod === "efectivo") return "Efectivo";
  if (order.paymentMethod === "tarjeta") return "Tarjeta";
  if (order.paymentMethod === "transferencia") return "Transferencia";
  if (order.paymentStatus === "paid" && order.paidAmount > 0) return "Pago combinado";
  if (order.paidAmount > 0) return "Abono registrado";
  if (order.requestedPaymentMethod === "efectivo") return "Solicitó efectivo";
  if (order.requestedPaymentMethod === "tarjeta") return "Solicitó tarjeta";
  if (order.requestedPaymentMethod === "transferencia") return "Solicitó transferencia";
  return "Pendiente";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Hermosillo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OrderReceiptTicket({ data }: { data: BusinessOrderPrintData }) {
  const { order } = data;
  const { productsAfterDiscount, paidAmount, productsBalance, customerTotal } =
    getOrderReceiptTotals(order);
  const platformName = order.marketplacePlatform === "uber_eats"
    ? "Uber Eats"
    : order.marketplacePlatform === "didi_food"
      ? "Didi Food"
      : null;
  const service = platformName ?? (order.type === "domicilio"
    ? "Domicilio"
    : order.type === "para_llevar"
      ? "Para llevar"
      : order.tableLabel ?? "Comedor");

  return (
    <article
      className="order-ticket-print-root fixed -left-[10000px] top-0 box-border w-[48mm] bg-white px-[1.5mm] py-[1mm] font-data text-[8px] leading-[1.15] text-black"
      style={{ "--ticket-width": `${data.paperWidthMm}mm` } as CSSProperties}
      aria-hidden="true"
    >
      <header className="text-center leading-[1.15]">
        <p className="font-data text-[10px] font-bold leading-tight">
          {data.receiptName.trim() || data.businessName}
        </p>
        {data.address ? <p className="whitespace-pre-wrap">{data.address}</p> : null}
        {data.phone ? <p>{data.phone}</p> : null}
      </header>

      <div className="my-1 border-t border-dashed border-black" />
      <div className="space-y-0">
        <p className="font-data text-[9px] font-bold">PEDIDO #{order.number} · {dateTime(order.createdAt)}</p>
        <p>{service}</p>
        {order.status === "cancelled" ? (
          <p className="mt-0.5 border border-black px-1 py-0.5 text-center font-data font-bold">
            CANCELADO · NO PREPARAR NI ENTREGAR
          </p>
        ) : null}
      </div>

      {order.customerName || order.customerPhone ? (
        <section className="mt-1 break-words">
          <p>
            {order.customerName ? order.customerName : "Cliente"}
            {order.customerPhone ? ` · ${formatPhoneForDisplay(order.customerPhone)}` : ""}
          </p>
        </section>
      ) : null}

      {order.type === "domicilio" ? (
        <section className="mt-1 space-y-0 break-words">
          <p className="font-bold">ENTREGA</p>
          <p>{order.deliveryAddress || "Dirección no registrada"}</p>
          <p>Col. {order.deliveryColony || "No registrada"}</p>
          {order.deliveryReference ? <p>Ref. {order.deliveryReference}</p> : null}
        </section>
      ) : null}

      <div className="my-1 border-t border-dashed border-black" />
      <section className="space-y-1">
        {data.items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="break-inside-avoid">
            <div className="flex items-start justify-between gap-1">
              <p className="min-w-0 flex-1 font-data font-bold">
                {item.quantity}x {item.name}
              </p>
              <p className="shrink-0 font-data font-bold">{money(item.lineTotal)}</p>
            </div>
            {item.modifiers.map((modifier, modifierIndex) => (
              <p key={`${modifier.group}-${modifier.option}-${modifierIndex}`} className="pl-1">
                {modifier.group ? `${modifier.group}: ` : ""}{modifier.option}
                {modifier.price > 0 ? ` (+${money(modifier.price)})` : ""}
              </p>
            ))}
            {item.notes ? <p className="pl-1">Nota: {item.notes}</p> : null}
          </div>
        ))}
      </section>

      {order.notes ? <p className="mt-1 break-words">Nota: {order.notes}</p> : null}
      <div className="my-1 border-t border-dashed border-black" />
      <section className="space-y-0.5">
        <p className="flex justify-between gap-1"><span>Subtotal</span><span>{money(order.productsSubtotal)}</span></p>
        {order.discountAmount > 0 ? (
          <p className="flex justify-between gap-1"><span>Descuento</span><span>-{money(order.discountAmount)}</span></p>
        ) : null}
        <p className="flex justify-between gap-1 font-data font-bold">
          <span>{order.type === "domicilio" ? "Productos" : "TOTAL"}</span>
          <span>{money(productsAfterDiscount)}</span>
        </p>
        {order.type === "domicilio" ? (
          <>
            <p className="flex justify-between gap-1"><span>Envío</span><span>{money(order.deliveryFee)}</span></p>
            <p className="flex justify-between gap-1 font-data font-bold"><span>TOTAL CLIENTE</span><span>{money(customerTotal)}</span></p>
          </>
        ) : null}
      </section>

      <div className="my-1 border-t border-dashed border-black" />
      <section className="space-y-0">
        {!order.marketplacePlatform && paidAmount > 0 ? (
          <p className="flex justify-between gap-1"><span>Cobrado</span><span>{money(paidAmount)}</span></p>
        ) : null}
        {!order.marketplacePlatform && productsBalance > 0 ? (
          <p className="flex justify-between gap-1"><span>Saldo</span><span>{money(productsBalance)}</span></p>
        ) : null}
        <p>Pago: {getOrderReceiptPaymentLabel(order)}</p>
      </section>

      {data.footer ? (
        <footer className="mt-1 whitespace-pre-wrap border-t border-dashed border-black pt-1 text-center">
          {data.footer}
        </footer>
      ) : null}
    </article>
  );
}
