export type LocalDeliveryPaymentMethod = "efectivo" | "transferencia";

export function isLocalDeliveryPaymentMethod(
  value: unknown
): value is LocalDeliveryPaymentMethod {
  return value === "efectivo" || value === "transferencia";
}

export function hasRequiredLocalDeliveryPayment(
  orderType: "comedor" | "domicilio" | "para_llevar",
  isMarketplaceOrder: boolean,
  paymentMethod: unknown
) {
  return orderType !== "domicilio" ||
    isMarketplaceOrder ||
    isLocalDeliveryPaymentMethod(paymentMethod);
}
