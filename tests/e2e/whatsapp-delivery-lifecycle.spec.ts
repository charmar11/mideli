import { expect, test } from "@playwright/test";
import {
  deliveryLaneForOrder,
  finalOrderStatusForPayment,
  isExplicitDeliveryReceipt,
  shouldCompleteOrderAfterPayment,
  validDeliveryTransition,
} from "@/lib/whatsapp/delivery-lifecycle";

test("cobrar un domicilio no completa ni retira el seguimiento", () => {
  expect(
    shouldCompleteOrderAfterPayment({ type: "domicilio", status: "ready" })
  ).toBe(false);
  expect(
    shouldCompleteOrderAfterPayment({ type: "para_llevar", status: "ready" })
  ).toBe(true);
  expect(
    shouldCompleteOrderAfterPayment({ type: "comedor", status: "ready" })
  ).toBe(false);
});

test("separa los domicilios listos entre búsqueda y trayecto", () => {
  expect(
    deliveryLaneForOrder({
      type: "domicilio",
      source_channel: "whatsapp",
      status: "ready",
      delivery_status: "searching_driver",
    })
  ).toBe("searching_driver");
  expect(
    deliveryLaneForOrder({
      type: "domicilio",
      source_channel: "whatsapp",
      status: "ready",
      delivery_status: "driver_on_way",
    })
  ).toBe("driver_on_way");
  expect(
    deliveryLaneForOrder({
      type: "para_llevar",
      source_channel: "pos",
      status: "ready",
      delivery_status: "pending",
    })
  ).toBe("ready");
});

test("finaliza como pagado o servido sin mezclar el reparto con el cobro", () => {
  expect(finalOrderStatusForPayment("paid")).toBe("paid");
  expect(finalOrderStatusForPayment("partial")).toBe("served");
  expect(finalOrderStatusForPayment("unpaid")).toBe("served");
});

test("solo una confirmación inequívoca cierra la entrega", () => {
  for (const message of [
    "gracias, ya llegó",
    "ya recibí",
    "ya me lo entregaron",
    "ya llegó el pedido",
  ]) {
    expect(isExplicitDeliveryReceipt(message)).toBe(true);
  }

  for (const message of ["gracias", "todavía no llega", "no ha llegado", "ya casi llega"]) {
    expect(isExplicitDeliveryReceipt(message)).toBe(false);
  }
});

test("las transiciones de reparto son idempotentes y no saltan estados", () => {
  expect(validDeliveryTransition("pending", "searching_driver")).toBe("advance");
  expect(validDeliveryTransition("searching_driver", "driver_on_way")).toBe("advance");
  expect(validDeliveryTransition("driver_on_way", "customer_received")).toBe("advance");
  expect(validDeliveryTransition("driver_on_way", "driver_on_way")).toBe("noop");
  expect(validDeliveryTransition("pending", "driver_on_way")).toBe("invalid");
  expect(validDeliveryTransition("customer_received", "driver_on_way")).toBe("invalid");
});
