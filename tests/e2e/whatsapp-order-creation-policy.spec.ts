import { expect, test } from "@playwright/test";
import { canCreateWhatsappOrder } from "@/lib/whatsapp/order-creation-policy";

test("requiere permiso técnico y operativo para crear pedidos por WhatsApp", () => {
  expect(
    canCreateWhatsappOrder({ serverEnabled: false, operationsEnabled: true })
  ).toBe(false);
  expect(
    canCreateWhatsappOrder({ serverEnabled: true, operationsEnabled: false })
  ).toBe(false);
  expect(
    canCreateWhatsappOrder({ serverEnabled: true, operationsEnabled: true })
  ).toBe(true);
});
