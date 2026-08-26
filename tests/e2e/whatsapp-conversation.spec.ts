import { expect, test } from "@playwright/test";
import {
  createConversation,
  handleConversationMessage,
} from "@/lib/whatsapp/conversation-engine";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import { normalizePhone, normalizeText } from "@/lib/whatsapp/normalize";
import type { MenuItem } from "@/types/database";

const now = "2026-08-25T00:00:00.000Z";

const menuItems: MenuItem[] = [
  {
    id: "california",
    category_id: "sushis",
    name: "California",
    description: "Res, pollo, camarón, tocino, tampico o surimi.",
    price: 125,
    is_active: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    modifiers: [
      {
        id: "toppings",
        name: "Toppings",
        required: false,
        selection_mode: "multiple",
        max_selections: 2,
        options: [
          { id: "dracarys", name: "Dracarys", price: 30 },
          { id: "especial", name: "Especial", price: 35 },
        ],
      },
    ],
  },
  {
    id: "boneless",
    category_id: "boneless",
    name: "Boneless",
    description: "10 a 12 piezas.",
    price: 159,
    is_active: true,
    sort_order: 2,
    image_url: "",
    created_at: now,
    updated_at: now,
    modifiers: [
      {
        id: "sabor",
        name: "Sabor",
        required: true,
        selection_mode: "single",
        options: [
          { id: "bbq", name: "BBQ", price: 0 },
          { id: "cajun", name: "Cajun", price: 0 },
          { id: "buffalo-ranch", name: "Buffalo Ranch", price: 0 },
        ],
      },
      {
        id: "cantidad",
        name: "Cantidad",
        required: true,
        selection_mode: "single",
        options: [
          { id: "10", name: "10 piezas", price: 0 },
          { id: "12", name: "12 piezas", price: 0 },
        ],
      },
      {
        id: "papas",
        name: "Complemento",
        required: false,
        selection_mode: "single",
        options: [{ id: "con-papas", name: "Con papas", price: 30 }],
      },
    ],
  },
  {
    id: "inactive",
    category_id: "hamburguesas",
    name: "Producto oculto",
    description: "",
    price: 1,
    is_active: false,
    sort_order: 3,
    image_url: "",
    created_at: now,
    updated_at: now,
    modifiers: [],
  },
];

const catalog = buildConversationCatalog(menuItems);

test("normaliza texto y teléfonos mexicanos sin alterar el contenido útil", () => {
  expect(normalizeText("  DÓS   Califórnia!!! ")).toBe("dos california");
  expect(normalizePhone("+52 (644) 279-3641")).toBe("526442793641");
});

test("agrega varios productos, cantidades y variaciones reales", () => {
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero 2 California y un Boneless BBQ de 12 piezas con papas",
    catalog
  );

  expect(result.state.cart).toHaveLength(2);
  expect(result.state.cart[0]).toMatchObject({ menuItemId: "california", quantity: 2 });
  expect(result.state.cart[1]).toMatchObject({ menuItemId: "boneless", quantity: 1 });
  expect(result.state.cart[1].selectedModifiers.map((item) => item.optionName)).toEqual([
    "BBQ",
    "12 piezas",
    "Con papas",
  ]);
  expect(result.state.total).toBe(439);
  expect(result.action).toBe("none");
});

test("pregunta por variaciones requeridas y completa la misma línea", () => {
  const first = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero un boneless",
    catalog
  );

  expect(first.state.stage).toBe("awaiting_modifiers");
  expect(first.reply).toContain("Sabor");

  const second = handleConversationMessage(
    first.state,
    "BBQ, 12 piezas y con papas",
    catalog
  );

  expect(second.state.stage).toBe("ordering");
  expect(second.state.cart[0].selectedModifiers.map((item) => item.optionName)).toEqual([
    "BBQ",
    "12 piezas",
    "Con papas",
  ]);
  expect(second.state.total).toBe(189);
});

test("no inventa productos y transfiere después de dos mensajes sin coincidencias", () => {
  const first = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero una pizza familiar",
    catalog
  );
  expect(first.state.cart).toHaveLength(0);
  expect(first.reply).toMatch(/no encontré/i);

  const second = handleConversationMessage(
    first.state,
    "Entonces una lasaña",
    catalog
  );
  expect(second.action).toBe("handoff");
  expect(second.state.stage).toBe("handoff");
  expect(second.state.cart).toHaveLength(0);
});

test("completa domicilio, efectivo y solicita crear solo después de confirmar", () => {
  const state = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero un California",
    catalog
  ).state;

  let result = handleConversationMessage(state, "Ya es todo", catalog);
  expect(result.state.stage).toBe("awaiting_fulfillment");
  expect(result.action).toBe("none");

  result = handleConversationMessage(result.state, "A domicilio", catalog);
  expect(result.state.stage).toBe("awaiting_address");

  result = handleConversationMessage(
    result.state,
    "Calle Kino 123, colonia Centro, portón negro",
    catalog
  );
  expect(result.state.stage).toBe("awaiting_payment");

  result = handleConversationMessage(result.state, "Efectivo, pago con 500", catalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment).toMatchObject({ method: "efectivo", cashTendered: 500 });
  expect(result.action).toBe("none");
  expect(result.reply).toContain("$125");

  result = handleConversationMessage(result.state, "Sí, confirmo", catalog);
  expect(result.state.stage).toBe("confirmed");
  expect(result.action).toBe("request_order_creation");
});

test("un producto inactivo nunca aparece como coincidencia", () => {
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero el producto oculto",
    catalog
  );
  expect(result.state.cart).toHaveLength(0);
});

test("tolera plural y un error ortográfico claro sin ampliar el catálogo", () => {
  const plural = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero dos Californias",
    catalog
  );
  expect(plural.state.cart[0]).toMatchObject({ menuItemId: "california", quantity: 2 });

  const typo = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero una califronia",
    catalog
  );
  expect(typo.state.cart[0]).toMatchObject({ menuItemId: "california", quantity: 1 });
});

test("permite cambiar cantidad y quitar un producto del carrito", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero un California",
    catalog
  );

  result = handleConversationMessage(result.state, "Cambia California a 3", catalog);
  expect(result.state.cart[0].quantity).toBe(3);
  expect(result.state.total).toBe(375);

  result = handleConversationMessage(result.state, "Quita California", catalog);
  expect(result.state.cart).toHaveLength(0);
  expect(result.state.total).toBe(0);
});
