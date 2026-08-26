import { expect, test } from "@playwright/test";
import {
  createConversation,
  handleConversationMessage,
  reconcileCartWithCatalog,
  unsupportedMessageHandoff,
  withDeliveryQuote,
} from "@/lib/whatsapp/conversation-engine";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import { normalizePhone, normalizeText, phoneAliases } from "@/lib/whatsapp/normalize";
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

const navigationCatalog = buildConversationCatalog([
  {
    ...menuItems[0],
    categories: { id: "sushis", name: "Sushis", sort_order: 4, is_active: true },
  },
  {
    ...menuItems[1],
    id: "hamburguesa-sencilla",
    category_id: "hamburguesas",
    name: "Hamburguesa Sencilla",
    description: "Incluye papas.",
    price: 135,
    modifiers: [],
    categories: {
      id: "hamburguesas",
      name: "Hamburguesas",
      sort_order: 1,
      is_active: true,
    },
  },
]);

test("normaliza texto y teléfonos mexicanos sin alterar el contenido útil", () => {
  expect(normalizeText("  DÓS   Califórnia!!! ")).toBe("dos california");
  expect(normalizePhone("+52 (644) 279-3641")).toBe("526442793641");
  expect(phoneAliases("+52 (644) 279-3641")).toEqual([
    "526442793641",
    "5216442793641",
  ]);
  expect(phoneAliases("5216442793641")).toEqual([
    "5216442793641",
    "526442793641",
  ]);
});

test("recibe un saludo sin contarlo como producto desconocido", () => {
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Hola, buenas tardes",
    catalog
  );

  expect(result.state.stage).toBe("ordering");
  expect(result.state.ambiguityCount).toBe(0);
  expect(result.reply).toContain("Bienvenido a Mideli");
  expect(result.reply).toContain("menú");
  expect(result.reply).toContain("👋");
  expect(result.reply).not.toContain("Caguama");
});

test("abre una categoría por nombre singular antes que el menú genérico", () => {
  for (const message of ["sushi", "sushi menú", "menú de sushi"]) {
    const result = handleConversationMessage(
      createConversation("5216440000000"),
      message,
      navigationCatalog
    );

    expect(result.state.stage).toBe("browsing_catalog");
    expect(result.state.selectedCategoryId).toBe("sushis");
    expect(result.reply).toContain("🍣");
    expect(result.reply).toContain("California");
    expect(result.reply).not.toContain("Hamburguesas\n");
  }
});

test("agrega un producto y abre otra categoría en el mismo mensaje", () => {
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Una hamburguesa sencilla y también quiero ver el menú de sushi",
    navigationCatalog
  );

  expect(result.state.cart).toHaveLength(1);
  expect(result.state.cart[0].name).toBe("Hamburguesa Sencilla");
  expect(result.state.stage).toBe("browsing_catalog");
  expect(result.state.selectedCategoryId).toBe("sushis");
  expect(result.reply).toContain("✅");
  expect(result.reply).toContain("California");
});

test("un no cordial fuera de una pregunta binaria no provoca transferencia", () => {
  const withCart = handleConversationMessage(
    createConversation("5216440000000"),
    "Una hamburguesa sencilla",
    navigationCatalog
  );
  const result = handleConversationMessage(withCart.state, "No gracias", navigationCatalog);

  expect(result.action).toBe("none");
  expect(result.state.stage).toBe("ordering");
  expect(result.state.ambiguityCount).toBe(0);
  expect(result.reply).toMatch(/terminamos tu pedido/i);
});

test("conserva el flujo reportado entre menú, dos categorías y rechazo de bebida", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Menú",
    navigationCatalog
  );
  result = handleConversationMessage(result.state, "1", navigationCatalog);
  expect(result.state.selectedCategoryId).toBe("hamburguesas");

  result = handleConversationMessage(
    result.state,
    "Una hamburguesa sencilla y también quiero ver el menú de sushi",
    navigationCatalog
  );
  expect(result.state.cart.map((line) => line.name)).toEqual(["Hamburguesa Sencilla"]);
  expect(result.state.selectedCategoryId).toBe("sushis");

  result = handleConversationMessage(result.state, "Un California", navigationCatalog);
  expect(result.state.cart.map((line) => line.name)).toEqual([
    "Hamburguesa Sencilla",
    "California",
  ]);

  result = handleConversationMessage(result.state, "Sería todo", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_beverage");
  result = handleConversationMessage(result.state, "No gracias", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_fulfillment");
  expect(result.action).toBe("none");
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
  expect(result.state.stage).toBe("awaiting_beverage");
  expect(result.reply).toContain("bebida");

  result = handleConversationMessage(result.state, "No gracias", catalog);
  expect(result.state.stage).toBe("awaiting_fulfillment");
  expect(result.action).toBe("none");

  result = handleConversationMessage(result.state, "A domicilio", catalog);
  expect(result.state.stage).toBe("awaiting_address");

  result = handleConversationMessage(
    result.state,
    "Calle Kino 123, colonia Centro, portón negro",
    catalog
  );
  expect(result.state.stage).toBe("awaiting_address_reference");

  result = handleConversationMessage(result.state, "Omitir", catalog);
  expect(result.state.stage).toBe("awaiting_delivery_quote");
  expect(result.action).toBe("request_delivery_quote");

  const quotedState = withDeliveryQuote(result.state, {
    id: "quote-1",
    formattedAddress: "Calle Kino 123, Centro",
    colony: "Centro",
    latitude: 27.49,
    longitude: -109.94,
    distanceMeters: 3500,
    baseFee: 30,
    surcharge: 0,
    totalFee: 30,
  });

  result = handleConversationMessage(quotedState, "Efectivo, pago con 500", catalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment).toMatchObject({ method: "efectivo", cashTendered: 500 });
  expect(result.action).toBe("none");
  expect(result.reply).toContain("$155");

  result = handleConversationMessage(result.state, "Sí, confirmo", catalog);
  expect(result.state.stage).toBe("confirmed");
  expect(result.action).toBe("request_order_creation");
});

test("ofrece reutilizar el último domicilio pero vuelve a cotizarlo", () => {
  const withAddress = {
    ...createConversation("5216440000000"),
    cart: [{
      id: "line-1",
      menuItemId: "california",
      categoryId: "sushis",
      name: "California",
      quantity: 1,
      unitPrice: 125,
      selectedModifiers: [],
      notes: "",
    }],
    total: 125,
    stage: "awaiting_fulfillment" as const,
    savedAddress: {
      id: "address-1",
      address: "Calle Kino 123, Centro",
      reference: "Portón negro",
    },
  };

  const delivery = handleConversationMessage(withAddress, "A domicilio", catalog);
  expect(delivery.reply).toContain("domicilio anterior");

  const reuse = handleConversationMessage(delivery.state, "Sí", catalog);
  expect(reuse.action).toBe("request_delivery_quote");
  expect(reuse.state.address).toBe("Calle Kino 123, Centro");
  expect(reuse.state.addressReference).toBe("Portón negro");
});

test("un producto inactivo nunca aparece como coincidencia", () => {
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero el producto oculto",
    catalog
  );
  expect(result.state.cart).toHaveLength(0);
});

test("un producto oculto solo de WhatsApp no aparece aunque siga activo en POS", () => {
  const whatsappCatalog = buildConversationCatalog([
    {
      ...menuItems[0],
      id: "solo-pos",
      name: "Solo POS",
      whatsapp_enabled: false,
    },
  ]);
  const result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero Solo POS",
    whatsappCatalog
  );
  expect(result.state.cart).toHaveLength(0);
});

test("retira un producto desactivado antes de crear el pedido y exige reconfirmar", () => {
  const original = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero un California y un Boneless BBQ de 12 piezas",
    catalog
  ).state;
  const withoutCalifornia = buildConversationCatalog([menuItems[1]]);

  const reconciliation = reconcileCartWithCatalog(
    {
      ...original,
      stage: "confirmed",
      payment: { method: "transferencia", cashTendered: null },
    },
    withoutCalifornia
  );

  expect(reconciliation.removed.map((line) => line.name)).toEqual(["California"]);
  expect(reconciliation.state.stage).toBe("ordering");
  expect(reconciliation.state.payment).toBeNull();
  expect(reconciliation.state.cart.map((line) => line.name)).toEqual(["Boneless"]);
  expect(reconciliation.state.total).toBe(159);
});

test("un archivo no compatible pasa la conversación a atención humana", () => {
  const result = unsupportedMessageHandoff(createConversation("5216440000000"));

  expect(result.action).toBe("handoff");
  expect(result.state.stage).toBe("handoff");
  expect(result.reply).toContain("persona del equipo");
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

test("permite pedir atención humana después de confirmar", () => {
  const state = { ...createConversation("5216442793641"), stage: "confirmed" as const };
  const result = handleConversationMessage(state, "quiero hablar con una persona", catalog);
  expect(result.action).toBe("handoff");
  expect(result.state.stage).toBe("handoff");
});

test("puede comenzar otro pedido desde una conversación confirmada", () => {
  const state = { ...createConversation("5216442793641"), stage: "confirmed" as const };
  const result = handleConversationMessage(state, "nuevo pedido", catalog);
  expect(result.state.stage).toBe("ordering");
  expect(result.state.cart).toHaveLength(0);
  expect(result.reply).toContain("menú");
});
