import { expect, test } from "@playwright/test";
import {
  ACTIVE_ORDER_ITEMS_SELECT,
  mapActiveOrderRows,
  type ActiveOrderRow,
} from "../../src/lib/active-order-query";
import type { Order } from "../../src/types/database";

const order = (id: string, businessId: string): Order => ({
  id,
  business_id: businessId,
  number: 1,
  status: "pending",
  type: "comedor",
  total: 100,
  notes: "",
  created_by: null,
  payment_method: null,
  payment_status: "unpaid",
  paid_amount: 0,
  paid_at: null,
  cancelled_at: null,
  created_at: "2026-10-02T18:00:00.000Z",
  updated_at: "2026-10-02T18:00:00.000Z",
});

test("la consulta incluye artículos y nombres mediante sus llaves foráneas", () => {
  expect(ACTIVE_ORDER_ITEMS_SELECT).toContain(
    "order_items!order_items_order_id_fkey"
  );
  expect(ACTIVE_ORDER_ITEMS_SELECT).toContain(
    "menu_items!order_items_menu_item_id_fkey(name)"
  );
});

test("cada pedido conserva únicamente sus artículos embebidos y su negocio", () => {
  const rows: ActiveOrderRow[] = [
    {
      ...order("order-mideli", "business-mideli"),
      order_items: [
        {
          id: "item-mideli",
          order_id: "order-mideli",
          menu_item_id: "product-mideli",
          quantity: 2,
          unit_price: 50,
          notes: "",
          selected_modifiers: [],
          created_at: "2026-10-02T18:00:00.000Z",
          menu_items: { name: "Hamburguesa" },
        },
      ],
    },
    {
      ...order("order-dipping", "business-dipping"),
      order_items: [
        {
          id: "item-dipping",
          order_id: "order-dipping",
          menu_item_id: "product-dipping",
          quantity: 1,
          unit_price: 100,
          notes: "",
          selected_modifiers: [],
          created_at: "2026-10-02T18:00:00.000Z",
          menu_items: [{ name: "Regular Box" }],
        },
      ],
    },
  ];

  const result = mapActiveOrderRows(rows, new Map());

  expect(
    result.map((entry) => [entry.business_id, entry.items[0]?.menu_item_name])
  ).toEqual([
    ["business-mideli", "Hamburguesa"],
    ["business-dipping", "Regular Box"],
  ]);
  expect(result[0].items[0].order_id).toBe("order-mideli");
  expect(result[1].items[0].order_id).toBe("order-dipping");
});

test("mantiene los fallbacks de nombre y los pedidos sin artículos", () => {
  const rows: ActiveOrderRow[] = [
    {
      ...order("order-fallback", "business-mideli"),
      order_items: [
        {
          id: "item-fallback",
          order_id: "order-fallback",
          menu_item_id: "product-cached",
          quantity: 1,
          unit_price: 25,
          notes: "",
          selected_modifiers: [],
          created_at: "2026-10-02T18:00:00.000Z",
          menu_items: null,
        },
        {
          id: "item-deleted",
          order_id: "order-fallback",
          menu_item_id: "product-deleted",
          quantity: 1,
          unit_price: 25,
          notes: "",
          selected_modifiers: [],
          created_at: "2026-10-02T18:00:00.000Z",
        },
      ],
    },
    { ...order("order-empty", "business-dipping"), order_items: null },
  ];

  const result = mapActiveOrderRows(
    rows,
    new Map([["product-cached", "Nombre desde caché"]])
  );

  expect(result[0].items.map((item) => item.menu_item_name)).toEqual([
    "Nombre desde caché",
    "Producto eliminado",
  ]);
  expect(result[1].items).toEqual([]);
});
