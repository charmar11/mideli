import { expect, test } from "@playwright/test";
import {
  hasRequiredLocalDeliveryPayment,
  isLocalDeliveryPaymentMethod,
} from "@/lib/local-delivery-payment";

test("domicilio local requiere elegir efectivo o transferencia", () => {
  expect(hasRequiredLocalDeliveryPayment("domicilio", false, null)).toBe(false);
  expect(hasRequiredLocalDeliveryPayment("domicilio", false, "efectivo")).toBe(true);
  expect(hasRequiredLocalDeliveryPayment("domicilio", false, "transferencia")).toBe(true);
  expect(hasRequiredLocalDeliveryPayment("domicilio", false, "tarjeta")).toBe(false);
});

test("comedor, para llevar y pedidos de plataforma no requieren pago local", () => {
  expect(hasRequiredLocalDeliveryPayment("comedor", false, null)).toBe(true);
  expect(hasRequiredLocalDeliveryPayment("para_llevar", false, null)).toBe(true);
  expect(hasRequiredLocalDeliveryPayment("para_llevar", true, null)).toBe(true);
  expect(hasRequiredLocalDeliveryPayment("domicilio", true, null)).toBe(true);
});

test("solo acepta Efectivo o Transferencia como método del domicilio local", () => {
  expect(isLocalDeliveryPaymentMethod("efectivo")).toBe(true);
  expect(isLocalDeliveryPaymentMethod("transferencia")).toBe(true);
  expect(isLocalDeliveryPaymentMethod("tarjeta")).toBe(false);
  expect(isLocalDeliveryPaymentMethod(null)).toBe(false);
});
