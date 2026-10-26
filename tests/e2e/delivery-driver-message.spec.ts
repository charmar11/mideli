import { expect, test } from "@playwright/test";
import {
  formatDeliveryAddressForDriver,
  googleMapsSearchUrl,
} from "@/lib/business-delivery";
import {
  buildDeliveryDriverMessage,
  buildDeliveryDriverWhatsappHref,
} from "@/lib/delivery-driver-message";

test("arma el mensaje del repartidor con los dos mapas y solo calle, número y colonia", () => {
  const destination = formatDeliveryAddressForDriver(
    "Sinagogas 1230, Baldío, Misión de San Xavier, 85098 Ciudad Obregón, Sonora",
    "San Xavier",
  );
  expect(destination).toBe("Sinagogas 1230, San Xavier");

  const message = buildDeliveryDriverMessage({
    businessName: "Just Dipping",
    orderNumber: 35,
    customerName: "Antonio Valenzuela",
    customerPhone: "6441234567",
    originAddress: "C. Yaqui 404, Norte, Cajeme, Ciudad Obregón",
    originMapHref: "https://www.google.com/maps/search/?api=1&query=27.5,-109.9",
    deliveryAddress: "Sinagogas 1230, Baldío, Misión de San Xavier, 85098 Ciudad Obregón, Sonora",
    colony: "San Xavier",
    destinationMapHref: "https://www.google.com/maps/search/?api=1&query=27.6,-109.8",
    paymentMethod: "Transferencia",
  });

  expect(message).toBe([
    "*🛵 SALE PEDIDO DE JUST DIPPING*",
    "*Pedido #35*",
    "",
    "*👤 CLIENTE*",
    "*Nombre:* Antonio Valenzuela",
    "*Teléfono:* 644 123 4567",
    "",
    "*📍 RECOGER EN*",
    "C. Yaqui 404, Norte, Cajeme, Ciudad Obregón",
    "🗺️ *Maps:* https://www.google.com/maps/search/?api=1&query=27.5,-109.9",
    "",
    "*🏠 ENTREGAR A*",
    "Sinagogas 1230, San Xavier",
    "🗺️ *Maps:* https://www.google.com/maps/search/?api=1&query=27.6,-109.8",
    "",
    "*💳 COBRO*",
    "*Tipo de pago:* Transferencia",
  ].join("\n"));
  expect(message).toContain("*🛵 SALE PEDIDO DE JUST DIPPING*");
  expect(message).toContain("*Nombre:* Antonio Valenzuela");
  expect(message).toContain("*Teléfono:* 644 123 4567");
  expect(message).toContain("query=27.5,-109.9");
  expect(message).toContain("query=27.6,-109.8");
  expect(message).not.toContain("Baldío");
  expect(message).not.toContain("85098");
  expect(message).not.toContain("Productos:");
  expect(message).not.toContain("Total");
  expect(message).not.toContain("+ envío");
});

test("el mensaje de efectivo indica productos más envío, sin sumar ni usar el efectivo entregado", () => {
  const input = {
    businessName: "Mideli",
    orderNumber: 12,
    originAddress: "C. Yaqui 404",
    originMapHref: "https://www.google.com/maps/search/?api=1&query=27.5,-109.9",
    deliveryAddress: "Miguel Alemán 162, Centro, Cajeme, Sonora",
    colony: "Centro",
    destinationMapHref: "https://www.google.com/maps/search/?api=1&query=27.51,-109.91",
    paymentMethod: "Efectivo",
  };
  const legacyCashInput = { ...input, productAmount: "$150", cashAmount: "$500" };
  const cashMessage = buildDeliveryDriverMessage(legacyCashInput);
  expect(cashMessage).toContain("*Tipo de pago:* Efectivo");
  expect(cashMessage).toContain("*Productos:* $150 + envío");
  expect(cashMessage).not.toContain("$500");
  expect(cashMessage).not.toContain("Total:");

  const transferMessage = buildDeliveryDriverMessage({ ...input, paymentMethod: "Transferencia", productAmount: "$150" });
  expect(transferMessage).toContain("*Tipo de pago:* Transferencia");
  expect(transferMessage).not.toContain("Productos:");
  expect(transferMessage).not.toContain("+ envío");

  const cardMessage = buildDeliveryDriverMessage({ ...input, paymentMethod: "Tarjeta", productAmount: "$150" });
  expect(cardMessage).toContain("*Tipo de pago:* Tarjeta");
  expect(cardMessage).not.toContain("Productos:");
});

test("omite el bloque de cliente si nombre y teléfono no se registraron", () => {
  const message = buildDeliveryDriverMessage({
    businessName: "Just Dipping",
    orderNumber: 36,
    originAddress: "C. Yaqui 404",
    originMapHref: null,
    deliveryAddress: "Miguel Alemán 162, Centro",
    colony: "Centro",
    destinationMapHref: null,
    paymentMethod: "Por definir",
  });

  expect(message).not.toContain("CLIENTE");
  expect(message).not.toMatch(/\n{3,}/);
});

test("el enlace final abre WhatsApp con el formato completo codificado", () => {
  const href = buildDeliveryDriverWhatsappHref("SALE PEDIDO DE MIDELI\nMaps: https://maps.google.com");
  expect(href).toContain("https://wa.me/?text=");
  expect(decodeURIComponent(href.split("?text=")[1])).toContain("Maps: https://maps.google.com");
});

test("el enlace del mapa usa las coordenadas independientes del local", () => {
  expect(googleMapsSearchUrl({
    latitude: 27.503311,
    longitude: -109.936335,
    address: "C. Yaqui 404",
  })).toBe("https://www.google.com/maps/search/?api=1&query=27.503311,-109.936335");
});
