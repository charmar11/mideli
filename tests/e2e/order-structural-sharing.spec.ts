import { expect, test } from "@playwright/test";
import {
  isDeepEqualData,
  reconcileOrderList,
} from "../../src/lib/order-structural-sharing";

type TestOrder = {
  id: string;
  status: string;
  total: number;
  items: Array<{ id: string; quantity: number; selected_modifiers: unknown }>;
};

const order = (id: string, status = "pending", quantity = 1): TestOrder => ({
  id,
  status,
  total: 100,
  items: [{ id: `${id}-item`, quantity, selected_modifiers: [{ name: "Sin cebolla" }] }],
});

test("compara datos planos anidados por contenido", () => {
  expect(isDeepEqualData(order("a"), order("a"))).toBe(true);
  expect(isDeepEqualData(order("a"), order("a", "ready"))).toBe(false);
  expect(isDeepEqualData(order("a"), order("a", "pending", 2))).toBe(false);
  expect(isDeepEqualData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  expect(isDeepEqualData([1, 2], [1, 2, 3])).toBe(false);
  expect(isDeepEqualData(null, {})).toBe(false);
});

test("si nada cambió devuelve exactamente el arreglo anterior", () => {
  const previous = [order("a"), order("b")];
  const next = [order("a"), order("b")];

  expect(reconcileOrderList(previous, next)).toBe(previous);
});

test("reutiliza los pedidos iguales y reemplaza solo el que cambió", () => {
  const previous = [order("a"), order("b"), order("c")];
  const next = [order("a"), order("b", "ready"), order("c")];

  const result = reconcileOrderList(previous, next);

  expect(result).not.toBe(previous);
  expect(result[0]).toBe(previous[0]);
  expect(result[1]).toBe(next[1]);
  expect(result[1].status).toBe("ready");
  expect(result[2]).toBe(previous[2]);
});

test("detecta pedidos nuevos, eliminados y cambios de orden", () => {
  const previous = [order("a"), order("b")];

  const added = reconcileOrderList(previous, [order("c"), order("a"), order("b")]);
  expect(added).not.toBe(previous);
  expect(added.map((item) => item.id)).toEqual(["c", "a", "b"]);
  expect(added[1]).toBe(previous[0]);

  const removed = reconcileOrderList(previous, [order("b")]);
  expect(removed).not.toBe(previous);
  expect(removed).toEqual([previous[1]]);
  expect(removed[0]).toBe(previous[1]);

  const reordered = reconcileOrderList(previous, [order("b"), order("a")]);
  expect(reordered).not.toBe(previous);
  expect(reordered[0]).toBe(previous[1]);
});

test("con lista anterior vacía devuelve la lista nueva", () => {
  const next = [order("a")];
  expect(reconcileOrderList([], next)).toBe(next);
});

test("dos listas vacías conservan la referencia anterior", () => {
  const previous: TestOrder[] = [];
  expect(reconcileOrderList(previous, [])).toBe(previous);
});
