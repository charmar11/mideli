import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { getOrderReceiptTotals } from "@/lib/order-receipt";
import type { BusinessOrderPrintData } from "@/lib/actions/business-receipts";
import { getOrderReceiptPaymentLabel } from "@/components/printing/order-receipt-ticket";

const deliveryTicket: BusinessOrderPrintData = {
  businessId: "business-just-dipping",
  businessName: "Just Dipping",
  receiptName: "Just Dipping",
  address: "C. Yaqui 404, Norte",
  phone: "6441234567",
  footer: "Gracias por tu compra",
  paperWidthMm: 48,
  logoUrl: "/brand/just-dipping.png",
  order: {
    id: "order-1",
    number: 42,
    type: "domicilio",
    status: "ready",
    createdAt: "2026-10-01T19:00:00.000Z",
    tableLabel: null,
    customerName: "Ana",
    customerPhone: "6447654321",
    deliveryAddress: "Puente de Rialto 1430",
    deliveryColony: "Puente Real",
    deliveryReference: "Portón negro",
    deliveryFee: 30,
    productsSubtotal: 120,
    discountAmount: 10,
    paidAmount: 50,
    paymentStatus: "partial",
    paymentMethod: "efectivo",
    requestedPaymentMethod: "efectivo",
    marketplacePlatform: null,
    marketplacePaymentMode: null,
    marketplaceCashReceived: null,
    notes: "Sin cebolla",
  },
  items: [{
    name: "Regular Box",
    quantity: 1,
    unitPrice: 120,
    lineTotal: 120,
    notes: "Extra salsa",
    modifiers: [{ group: "Cambio", option: "Mac & Cheese", price: 10 }],
  }],
};
const wideDeliveryTicket: BusinessOrderPrintData = {
  ...deliveryTicket,
  paperWidthMm: 58,
};

const orderReceiptSource = readFileSync(
  resolve(process.cwd(), "src/components/printing/order-receipt-ticket.tsx"),
  "utf8",
);
const paymentReceiptSource = readFileSync(
  resolve(process.cwd(), "src/components/payments/payment-flow.tsx"),
  "utf8",
);
const printStylesSource = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

test("calcula el ticket de domicilio separando descuento, envío y saldo", () => {
  const totals = getOrderReceiptTotals(deliveryTicket.order);

  expect(totals.productsAfterDiscount).toBe(110);
  expect(totals.paidAmount).toBe(50);
  expect(totals.productsBalance).toBe(60);
  expect(totals.customerTotal).toBe(140);
});

test("el ticket de comedor no suma envío al total", () => {
  const totals = getOrderReceiptTotals({
    ...deliveryTicket.order,
    type: "comedor",
    deliveryFee: 30,
  });

  expect(totals.customerTotal).toBe(110);
  expect(totals.productsBalance).toBe(60);
});

test("el resumen de pago del ticket identifica Didi y el efectivo realmente recibido", () => {
  expect(getOrderReceiptPaymentLabel({
    ...deliveryTicket.order,
    marketplacePlatform: "didi_food",
    marketplacePaymentMode: "cash",
    marketplaceCashReceived: 275,
  })).toBe("Didi Food · efectivo recibido $275");
});

test("el resumen de pago distingue Uber pagado en app de efectivo local", () => {
  expect(getOrderReceiptPaymentLabel({
    ...deliveryTicket.order,
    marketplacePlatform: "uber_eats",
    marketplacePaymentMode: "app",
    marketplaceCashReceived: null,
  })).toBe("Uber Eats · pagado en app");
});

test("usa un formato compacto sin logos y conserva los campos de cada pedido", () => {
  expect(orderReceiptSource).not.toContain("<img");
  expect(paymentReceiptSource).not.toContain("<img");
  expect(paymentReceiptSource).not.toContain("C. Yaqui 404 Oriente");
  expect(orderReceiptSource).toContain("font-data text-[8px]");
  expect(orderReceiptSource).toContain("order.deliveryAddress");
  expect(orderReceiptSource).toContain("order.deliveryColony");
  expect(orderReceiptSource).toContain("order.deliveryReference");
  expect(orderReceiptSource).toContain("TOTAL CLIENTE");
  expect(orderReceiptSource).toContain("getOrderReceiptPaymentLabel(order)");
  expect(printStylesSource).toContain("margin: 1mm;");
});

test("mantiene el ancho de rollo configurado para cada negocio", () => {
  expect(deliveryTicket.paperWidthMm).toBe(48);
  expect(wideDeliveryTicket.paperWidthMm).toBe(58);
  expect(orderReceiptSource).toContain('"--ticket-width": `${data.paperWidthMm}mm`');
  expect(deliveryTicket.businessId).toBe(wideDeliveryTicket.businessId);
});
