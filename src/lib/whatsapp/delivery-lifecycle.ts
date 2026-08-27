import { normalizeText } from "@/lib/whatsapp/normalize";
import type { Order } from "@/types/database";

type DeliveryStatus = NonNullable<Order["delivery_status"]>;

type DeliveryOrderSnapshot = Pick<Order, "type" | "status"> &
  Partial<Pick<Order, "source_channel" | "delivery_status">>;

export type DeliveryLane = "ready" | "searching_driver" | "driver_on_way" | null;
export type DeliveryTransitionResult = "advance" | "noop" | "invalid";

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus | null> = {
  pending: "searching_driver",
  searching_driver: "driver_on_way",
  driver_on_way: "customer_received",
  customer_received: null,
};

const RECEIPT_PHRASES = [
  "ya llego",
  "ya llego el pedido",
  "ya me llego",
  "ya recibi",
  "ya recibi el pedido",
  "recibi el pedido",
  "ya me lo entregaron",
  "gracias ya llego",
];

const RECEIPT_NEGATIONS = [
  "no llego",
  "no ha llegado",
  "todavia no llega",
  "aun no llega",
  "ya casi llega",
];

export function shouldCompleteOrderAfterPayment(
  order: Pick<Order, "type" | "status">
) {
  return order.type === "para_llevar" && order.status === "ready";
}

export function deliveryLaneForOrder(order: DeliveryOrderSnapshot): DeliveryLane {
  if (order.status !== "ready") return null;
  if (order.source_channel !== "whatsapp" || order.type !== "domicilio") {
    return "ready";
  }
  if (order.delivery_status === "searching_driver") return "searching_driver";
  if (order.delivery_status === "driver_on_way") return "driver_on_way";
  return "ready";
}

export function finalOrderStatusForPayment(
  paymentStatus: Order["payment_status"]
): Extract<Order["status"], "served" | "paid"> {
  return paymentStatus === "paid" ? "paid" : "served";
}

export function isExplicitDeliveryReceipt(message: string) {
  const text = normalizeText(message);
  if (RECEIPT_NEGATIONS.some((phrase) => text.includes(phrase))) return false;
  return RECEIPT_PHRASES.some(
    (phrase) => text === phrase || text.includes(phrase)
  );
}

export function validDeliveryTransition(
  current: DeliveryStatus,
  next: DeliveryStatus
): DeliveryTransitionResult {
  if (current === next) return "noop";
  return DELIVERY_TRANSITIONS[current] === next ? "advance" : "invalid";
}
