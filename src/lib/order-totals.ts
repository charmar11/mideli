import type { Order } from "@/types/database";

type OrderTotalsInput = Pick<Order, "type" | "total" | "delivery_fee">;

/** Importe que corresponde a los productos y que liquida Mideli. */
export function orderProductsTotal(order: OrderTotalsInput) {
  return Math.max(0, Number(order.total ?? 0));
}

/** Importe que cobra por separado el repartidor externo. */
export function orderExternalDeliveryFee(order: OrderTotalsInput) {
  return order.type === "domicilio"
    ? Math.max(0, Number(order.delivery_fee ?? 0))
    : 0;
}

/** Total informativo que el cliente debe considerar para el domicilio. */
export function orderCustomerTotal(order: OrderTotalsInput) {
  return orderProductsTotal(order) + orderExternalDeliveryFee(order);
}

export function orderProductsBalance(
  order: OrderTotalsInput & Pick<Order, "paid_amount">
) {
  return Math.max(0, orderProductsTotal(order) - Number(order.paid_amount ?? 0));
}
