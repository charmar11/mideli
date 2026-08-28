import type { ConversationDeliveryQuote } from "./types";

export function deliveryQuoteReply(
  subtotal: number,
  quote: ConversationDeliveryQuote,
  paymentMethod?: string | null
) {
  const distanceKm = Math.round((quote.distanceMeters / 1000) * 10) / 10;
  const surcharge = quote.surcharge > 0
    ? `\n🏘️ Recargo de zona: $${quote.surcharge}`
    : "";
  const total = subtotal + quote.totalFee;

  const nextStep = paymentMethod
    ? `Pago anotado: *${paymentMethod}*.\n\nRevisa el resumen para confirmar 😊`
    : "¿Pagarás en efectivo o por transferencia? 😊";
  return `🛵 *¡Sí llegamos hasta tu domicilio!*\n\n📍 ${quote.formattedAddress}\n📏 Distancia: ${distanceKm} km\n💰 Tarifa base: $${quote.baseFee}${surcharge}\n🛵 Envío total: *$${quote.totalFee}*\n🧾 Total con envío: *$${total}*\n\n${nextStep}`;
}

export function addressConfirmationReply(quote: ConversationDeliveryQuote) {
  return `📍 *Encontré este domicilio:*\n${quote.formattedAddress}\n\n¿Es aquí? Responde *sí* o envía otra dirección o ubicación.`;
}
