import { expect, test } from "@playwright/test";
import {
  buildDeliveryDriverMessage,
  buildDeliveryDriverWhatsappHref,
} from "@/lib/delivery-driver-message";
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
      source_channel: "pos",
      status: "ready",
      delivery_status: "searching_driver",
    })
  ).toBe("searching_driver");
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

test("el enlace manual al repartidor identifica el negocio y comparte ambos domicilios", () => {
  const message = buildDeliveryDriverMessage({
    businessName: "Just Dipping",
    orderNumber: 42,
    originAddress: "C. Yaqui 404, Ciudad Obregón",
    originMapHref: "https://maps.example/origen",
    deliveryAddress: "Av. Miguel Alemán 162, Centro, Ciudad Obregón",
    colony: "Centro",
    destinationMapHref: "https://maps.example/destino",
    paymentMethod: "Efectivo",
    productAmount: "$200",
  });

  expect(message).toContain("*🛵 SALE PEDIDO DE JUST DIPPING*");
  expect(message).toContain("*Pedido #42*");
  expect(message).toContain("*📍 RECOGER EN*\nC. Yaqui 404, Ciudad Obregón");
  expect(message).toContain("*🏠 ENTREGAR A*\nAv. Miguel Alemán 162, Centro");
  expect(message).toContain("https://maps.example/origen");
  expect(message).toContain("https://maps.example/destino");
  expect(message).toContain("*Productos:* $200 + envío");
  expect(message).toContain("*Tipo de pago:* Efectivo");
  expect(message).not.toContain("$45.00");
  expect(buildDeliveryDriverWhatsappHref(message)).toBe(
    `https://wa.me/?text=${encodeURIComponent(message)}`
  );
});

test("el mensaje manual usa la marca de Mideli o un fallback seguro", () => {
  const mideliMessage = buildDeliveryDriverMessage({
    businessName: "Mideli",
    orderNumber: 7,
    originAddress: "Origen Mideli",
    originMapHref: "https://maps.example/mideli",
    deliveryAddress: "Calle 1, Centro",
    colony: "Centro",
    paymentMethod: "Tarjeta",
    destinationMapHref: "https://maps.example/destino-1",
  });

  const fallbackMessage = buildDeliveryDriverMessage({
    businessName: " ",
    orderNumber: 8,
    originAddress: "Origen",
    originMapHref: "https://maps.example/origen",
    deliveryAddress: "Calle 2, Nueva",
    colony: "Nueva",
    paymentMethod: "Por definir",
    destinationMapHref: "https://maps.example/destino-2",
  });

  expect(mideliMessage).toContain("*🛵 SALE PEDIDO DE MIDELI*");
  expect(mideliMessage).toContain("*Pedido #7*");
  expect(fallbackMessage).toContain("*🛵 SALE PEDIDO DE RINCÓN 404*");
  expect(fallbackMessage).toContain("*Pedido #8*");
});
