import { expect, test } from "@playwright/test";
import {
  areOrdersFromSameBusinessTableAccount,
  getOpenOrdersForBusinessTableAccount,
  groupDiningOrdersByTable,
} from "@/lib/table-order-groups";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    type: "comedor",
    table_visit_id: "visit-1",
    table_id: "table-1",
    table_number: "Mesa 1",
    table_zone_id: "zone-1",
    business_id: "mideli",
    business_account_id: "mideli-account-1",
    ...overrides,
  };
}

test("agrupa pedidos de distintos negocios cuando comparten la misma visita de mesa", () => {
  const groups = groupDiningOrdersByTable([
    order(),
    order({
      id: "order-2",
      business_id: "just-dipping",
      business_account_id: "dipping-account-1",
    }),
  ]);

  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    kind: "table",
    orders: [{ id: "order-1" }, { id: "order-2" }],
  });
});

test("no mezcla visitas distintas aunque sean la misma mesa física", () => {
  const firstVisit = order({ table_visit_id: "visit-1" });
  const secondVisit = order({ id: "order-2", table_visit_id: "visit-2" });

  expect(groupDiningOrdersByTable([firstVisit, secondVisit])).toHaveLength(2);
  expect(areOrdersFromSameBusinessTableAccount(firstVisit, secondVisit)).toBe(false);
});

test("el modal reúne saldos de la misma cuenta de mesa aunque estén en distintas etapas", () => {
  const orders = [
    { ...order({ id: "ready" }), status: "ready", balance: 80 },
    { ...order({ id: "preparing" }), status: "in_kitchen", balance: 40 },
    { ...order({ id: "cancelled" }), status: "cancelled", balance: 30 },
    { ...order({ id: "paid" }), status: "paid", balance: 0 },
    {
      ...order({ id: "other-business", business_id: "just-dipping", business_account_id: "dipping-account" }),
      status: "ready",
      balance: 100,
    },
    { ...order({ id: "other-visit", table_visit_id: "visit-2" }), status: "ready", balance: 90 },
  ];

  const openOrders = getOpenOrdersForBusinessTableAccount(
    orders[0],
    orders,
    (candidate) => candidate.balance > 0
  );

  expect(openOrders.map((candidate) => candidate.id)).toEqual(["ready", "preparing"]);
});

test("mantiene el cobro separado por negocio y cuenta dentro de una visita compartida", () => {
  const mideli = order();
  const justDipping = order({
    id: "order-2",
    business_id: "just-dipping",
    business_account_id: "dipping-account-1",
  });
  const secondMideliOrder = order({ id: "order-3" });

  expect(areOrdersFromSameBusinessTableAccount(mideli, justDipping)).toBe(false);
  expect(areOrdersFromSameBusinessTableAccount(mideli, secondMideliOrder)).toBe(true);
});

test("no agrupa pedidos para llevar o a domicilio por número de mesa coincidente", () => {
  const groups = groupDiningOrdersByTable([
    order(),
    order({ id: "order-2", type: "domicilio" }),
    order({ id: "order-3", type: "para_llevar" }),
  ]);

  expect(groups.map((group) => group.kind)).toEqual(["table", "order", "order"]);
});

test("agrupa pedidos legacy por zona y número solo cuando no tienen IDs de mesa", () => {
  const groups = groupDiningOrdersByTable([
    order({ table_visit_id: null, table_id: null, table_zone_id: "zone-1" }),
    order({
      id: "order-2",
      table_visit_id: null,
      table_id: null,
      table_zone_id: "zone-1",
    }),
    order({
      id: "order-3",
      table_visit_id: null,
      table_id: null,
      table_zone_id: "zone-2",
    }),
  ]);

  expect(groups).toHaveLength(2);
  expect(groups[0]).toMatchObject({ kind: "table", orders: [{ id: "order-1" }, { id: "order-2" }] });
});
