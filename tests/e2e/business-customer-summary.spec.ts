import { expect, test } from "@playwright/test";
import {
  getPreferredBusinessCustomerAddress,
  getBusinessCustomerPaymentLabel,
  getBusinessCustomerOrderStatusLabel,
  getBusinessCustomerOrderTotal,
} from "@/lib/business-customer-presentation";
import type { BusinessCustomerOrderSummary } from "@/types/business-customers";

const order: BusinessCustomerOrderSummary = {
  id: "order-1",
  number: 42,
  type: "domicilio",
  status: "ready",
  total: 120,
  discountAmount: 10,
  deliveryAddress: "Puente de Rialto 1430",
  deliveryColony: "Puente Real",
  deliveryFee: 30,
  paymentStatus: "partial",
  createdAt: "2026-10-01T19:00:00.000Z",
};

test("el resumen descuenta lo cobrado y suma el envío solo en domicilio", () => {
  expect(getBusinessCustomerOrderTotal(order)).toBe(140);
  expect(getBusinessCustomerOrderTotal({ ...order, type: "comedor" })).toBe(110);
});

test("el resumen presenta el estado operativo del pedido en español", () => {
  expect(getBusinessCustomerOrderStatusLabel("ready")).toBe("Listo");
  expect(getBusinessCustomerOrderStatusLabel("cancelled")).toBe("Cancelado");
  expect(getBusinessCustomerPaymentLabel("partial")).toBe("Abonado");
});

test("la captura elige primero el domicilio marcado como principal", () => {
  const addresses = [
    {
      id: "address-recent",
      label: "Trabajo",
      addressText: "Calle Dos 20",
      reference: "",
      formattedAddress: "Calle Dos 20",
      colony: "Centro",
      latitude: null,
      longitude: null,
      deliveryFee: null,
      isDefault: false,
      confirmed: false,
      lastUsedAt: "2026-10-01T20:00:00.000Z",
    },
    {
      id: "address-home",
      label: "Casa",
      addressText: "Calle Uno 10",
      reference: "Portón negro",
      formattedAddress: "Calle Uno 10",
      colony: "Puente Real",
      latitude: 27.5,
      longitude: -109.9,
      deliveryFee: 30,
      isDefault: true,
      confirmed: true,
      lastUsedAt: "2026-09-01T20:00:00.000Z",
    },
  ];

  expect(getPreferredBusinessCustomerAddress(addresses)?.id).toBe("address-home");
  expect(getPreferredBusinessCustomerAddress(addresses.slice(0, 1))?.id).toBe("address-recent");
  expect(getPreferredBusinessCustomerAddress([])).toBeNull();
});
