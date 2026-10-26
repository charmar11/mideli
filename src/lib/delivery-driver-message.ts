import { formatDeliveryAddressForDriver } from "@/lib/business-delivery";
import { formatPhoneForDisplay } from "@/lib/phone";

export type DeliveryDriverMessageInput = {
  businessName: string | null | undefined;
  orderNumber: number;
  customerName?: string | null;
  customerPhone?: string | null;
  originAddress: string;
  originMapHref: string | null;
  deliveryAddress: string;
  colony: string;
  destinationMapHref: string | null;
  paymentMethod: string;
  productAmount?: string | null;
};

function messageLine(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildDeliveryDriverMessage(input: DeliveryDriverMessageInput) {
  const businessName = messageLine(input.businessName?.trim() || "Rincón 404");
  const customerName = messageLine(input.customerName ?? "");
  const customerPhone = input.customerPhone?.trim()
    ? formatPhoneForDisplay(messageLine(input.customerPhone))
    : "";
  const originAddress = messageLine(input.originAddress) || "Dirección del local no configurada";
  const destination = formatDeliveryAddressForDriver(input.deliveryAddress, input.colony);
  const paymentMethod = messageLine(input.paymentMethod) || "Por definir";
  const cashPayment = paymentMethod.toLocaleLowerCase("es-MX") === "efectivo";
  const originMapHref = input.originMapHref?.trim() || null;
  const destinationMapHref = input.destinationMapHref?.trim() || null;
  const productAmount = input.productAmount?.trim() || "";
  const customerLines = [
    "*👤 CLIENTE*",
    customerName ? `*Nombre:* ${customerName}` : null,
    customerPhone ? `*Teléfono:* ${customerPhone}` : null,
  ].filter((line): line is string => Boolean(line));
  const sections = [
    [
      `*🛵 SALE PEDIDO DE ${businessName.toLocaleUpperCase("es-MX")}*`,
      `*Pedido #${input.orderNumber}*`,
    ].join("\n"),
    customerLines.length > 1 ? customerLines.join("\n") : null,
    [
      "*📍 RECOGER EN*",
      originAddress,
      originMapHref ? `🗺️ *Maps:* ${originMapHref}` : null,
    ].filter((line): line is string => Boolean(line)).join("\n"),
    [
      "*🏠 ENTREGAR A*",
      destination,
      destinationMapHref ? `🗺️ *Maps:* ${destinationMapHref}` : null,
    ].filter((line): line is string => Boolean(line)).join("\n"),
    [
      "*💳 COBRO*",
      `*Tipo de pago:* ${paymentMethod}`,
      cashPayment && productAmount ? `*Productos:* ${productAmount} + envío` : null,
    ].filter((line): line is string => Boolean(line)).join("\n"),
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}

export function buildDeliveryDriverWhatsappHref(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
