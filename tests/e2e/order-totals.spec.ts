import { expect, test } from "@playwright/test";
import {
  orderCustomerTotal,
  orderExternalDeliveryFee,
  orderProductsBalance,
  orderProductsTotal,
} from "@/lib/order-totals";

test("separa productos Mideli, envío externo y total informativo", () => {
  const order = {
    type: "domicilio",
    total: 325,
    delivery_fee: 30,
    paid_amount: 100,
  } as const;

  expect(orderProductsTotal(order)).toBe(325);
  expect(orderExternalDeliveryFee(order)).toBe(30);
  expect(orderCustomerTotal(order)).toBe(355);
  expect(orderProductsBalance(order)).toBe(225);
});

test("no agrega envío a pedidos que no son domicilio", () => {
  const order = { type: "comedor", total: 160, delivery_fee: 30 } as const;

  expect(orderExternalDeliveryFee(order)).toBe(0);
  expect(orderCustomerTotal(order)).toBe(160);
});
