import type {
  BusinessCustomerAddress,
  BusinessCustomerOrderSummary,
} from "@/types/business-customers";

export function getPreferredBusinessCustomerAddress(
  addresses: BusinessCustomerAddress[]
) {
  return addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
}

export function getBusinessCustomerOrderTotal(order: BusinessCustomerOrderSummary) {
  const productsAfterDiscount = Math.max(0, order.total - order.discountAmount);
  return productsAfterDiscount + (order.type === "domicilio" ? order.deliveryFee : 0);
}

export function getBusinessCustomerOrderStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "in_kitchen":
      return "Preparando";
    case "ready":
      return "Listo";
    case "served":
      return "Entregado";
    case "paid":
      return "Pagado";
    case "cancelled":
      return "Cancelado";
    default:
      return "Pedido";
  }
}

export function getBusinessCustomerPaymentLabel(paymentStatus: string) {
  if (paymentStatus === "paid") return "Liquidado";
  if (paymentStatus === "partial") return "Abonado";
  return "Pendiente de cobro";
}
