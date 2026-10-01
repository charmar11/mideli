import { expect, test } from "@playwright/test";
import {
  clearPosCartDraft,
  readPosCartDraft,
  savePosCartDraft,
  type PosDraftStorage,
} from "@/lib/pos-cart-draft";
import {
  classifyPosOrderRecovery,
  isPosCreationKey,
} from "@/lib/pos-order-recovery";

class MemoryStorage implements PosDraftStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }

  removeItem(key: string) {
    this.entries.delete(key);
  }

  keys() {
    return [...this.entries.keys()];
  }
}

const draft = {
  items: [
    {
      id: "line-1",
      menu_item_id: "product-1",
      business_id: "mideli-business",
      name: "Hamburguesa",
      price: 135,
      quantity: 2,
      notes: "Sin cebolla",
      selected_modifiers: [
        { group: "Extra", option: "Tocino", price: 20 },
      ],
    },
    {
      id: "line-2",
      menu_item_id: "product-2",
      business_id: "just-dipping-business",
      name: "Regular Box",
      price: 110,
      quantity: 1,
      notes: "",
      selected_modifiers: [],
    },
  ],
  orderType: "comedor" as const,
  tableId: "table-4",
  tableNumber: "4",
  orderNotes: "Entregar juntos",
  scheduledFor: null,
  scheduledForLabel: null,
  kitchenReleaseAt: null,
};

test("recupera una comanda completa pero separada por cuenta de usuario", () => {
  const storage = new MemoryStorage();

  expect(savePosCartDraft("waiter-a", draft, storage)).toBe(true);
  expect(readPosCartDraft("waiter-a", storage)).toEqual(draft);
  expect(readPosCartDraft("waiter-b", storage)).toBeNull();
  expect(storage.keys()).toHaveLength(1);
});

test("conserva la clave aleatoria de un envío pendiente al volver a leer el borrador", () => {
  const storage = new MemoryStorage();
  const attemptKey = "0d6c4a93-9480-4df7-a4e6-6b3a9b08b4e2";
  const pendingDraft = { ...draft, creationKey: attemptKey };

  expect(savePosCartDraft("waiter-a", pendingDraft, storage)).toBe(true);
  expect(readPosCartDraft("waiter-a", storage)).toEqual(pendingDraft);
});

test("acepta borradores previos que todavía no tenían clave de envío", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "mideli.pos-cart-draft.v1.waiter-a",
    JSON.stringify({ ...draft, version: 1 }),
  );

  expect(readPosCartDraft("waiter-a", storage)).toEqual(draft);
});

test("descarta borradores corruptos sin impedir continuar usando el POS", () => {
  const storage = new MemoryStorage();
  storage.setItem("mideli.pos-cart-draft.v1.waiter-a", "not-json");

  expect(readPosCartDraft("waiter-a", storage)).toBeNull();
  expect(storage.keys()).toHaveLength(0);
});

test("vaciar la comanda elimina el borrador persistido", () => {
  const storage = new MemoryStorage();

  savePosCartDraft("waiter-a", draft, storage);
  clearPosCartDraft("waiter-a", storage);

  expect(readPosCartDraft("waiter-a", storage)).toBeNull();
});

test("un borrador vacío no deja datos residuales", () => {
  const storage = new MemoryStorage();

  savePosCartDraft("waiter-a", { ...draft, items: [] }, storage);

  expect(storage.keys()).toHaveLength(0);
});

test("la estructura persistida no incluye datos personales ni de entrega", () => {
  const storage = new MemoryStorage();
  savePosCartDraft("waiter-a", draft, storage);
  const value = JSON.parse(
    storage.getItem(storage.keys()[0] ?? "") ?? "{}"
  ) as Record<string, unknown>;

  expect(Object.keys(value).sort()).toEqual(
    [
      "items",
      "kitchenReleaseAt",
      "orderNotes",
      "orderType",
      "scheduledFor",
      "scheduledForLabel",
      "tableId",
      "tableNumber",
      "version",
    ].sort()
  );
});

test("no permite borrar accidentalmente un borrador con un envío todavía pendiente", () => {
  const storage = new MemoryStorage();
  const pendingDraft = {
    ...draft,
    creationKey: "0d6c4a93-9480-4df7-a4e6-6b3a9b08b4e2",
  };
  savePosCartDraft("waiter-a", pendingDraft, storage);

  expect(
    savePosCartDraft(
      "waiter-a",
      { ...pendingDraft, items: [] },
      storage,
    ),
  ).toBe(false);
  expect(readPosCartDraft("waiter-a", storage)).toEqual(pendingDraft);
});

test("sólo confirma la recuperación si leyó todos los negocios esperados", () => {
  expect(
    classifyPosOrderRecovery(["business-a", "business-b"], ["business-b", "business-a"]),
  ).toBe("found");
  expect(
    classifyPosOrderRecovery(["business-a", "business-b"], ["business-a"]),
  ).toBe("unavailable");
  expect(classifyPosOrderRecovery(["business-a"], null)).toBe("not_found");
  expect(classifyPosOrderRecovery(["business-a"], null, true)).toBe("unavailable");
});

test("valida que la clave persistida sea un UUID", () => {
  expect(isPosCreationKey("0d6c4a93-9480-4df7-a4e6-6b3a9b08b4e2")).toBe(true);
  expect(isPosCreationKey("not-a-uuid")).toBe(false);
});
