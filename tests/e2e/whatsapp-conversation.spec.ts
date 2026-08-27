import { expect, test } from "@playwright/test";
import {
  createConversation,
  handleConversationMessage,
  recoverDeliveryQuote,
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
  {
    ...menuItems[0],
    id: "refresco",
    category_id: "bebidas",
    name: "Refresco",
    description: "Refresco de temporada.",
    price: 30,
    modifiers: [],
    categories: {
      id: "bebidas",
      name: "Bebidas",
      sort_order: 6,
      is_active: true,
    },
  },
]);

const configurableCatalog = buildConversationCatalog([
  {
    ...menuItems[0],
    categories: { id: "sushis", name: "Sushis", sort_order: 4, is_active: true },
    modifiers: [
      {
        id: "tipo",
        name: "Tipo",
        required: true,
        selection_mode: "single",
        options: [
          { id: "res", name: "Res", price: 0 },
          { id: "pollo", name: "Pollo", price: 0 },
          { id: "camaron", name: "Camarón", price: 0 },
        ],
      },
    ],
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

test("permite regresar a bebidas después de haber respondido que no", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Dos hamburguesas sencillas",
    navigationCatalog
  );
  result = handleConversationMessage(result.state, "Sería todo", navigationCatalog);
  result = handleConversationMessage(result.state, "No", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_fulfillment");

  result = handleConversationMessage(
    result.state,
    "Bueno sí deseo agregar bebida",
    navigationCatalog
  );
  expect(result.state.stage).toBe("browsing_catalog");
  expect(result.state.selectedCategoryId).toBe("__beverages__");
  expect(result.reply).toContain("Refresco");

  result = handleConversationMessage(result.state, "1", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_fulfillment");
  expect(result.state.cart.map((line) => line.name)).toEqual([
    "Hamburguesa Sencilla",
    "Refresco",
  ]);
  expect(result.reply).toContain("recoger o a domicilio");
});

test("agrega una bebida desde el resumen y acepta Confirmar literalmente", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_confirmation" as const,
    cart: [{
      id: "line-1",
      menuItemId: "hamburguesa-sencilla",
      categoryId: "hamburguesas",
      name: "Hamburguesa Sencilla",
      quantity: 1,
      unitPrice: 135,
      selectedModifiers: [],
      notes: "",
    }],
    serviceType: "domicilio" as const,
    address: "Sinagogas 1230, San Xavier",
    addressReference: "",
    deliveryQuote: {
      id: "quote-1",
      formattedAddress: "Sinagogas 1230, Misión de San Xavier",
      colony: "Misión de San Xavier",
      latitude: 27.45,
      longitude: -109.92,
      distanceMeters: 6_600,
      baseFee: 45,
      surcharge: 0,
      totalFee: 45,
    },
    payment: { method: "transferencia" as const, cashTendered: null },
    beveragesOffered: true,
    total: 180,
  };

  let result = handleConversationMessage(state, "Agrega bebida", navigationCatalog);
  expect(result.state.stage).toBe("browsing_catalog");
  expect(result.state.selectedCategoryId).toBe("__beverages__");

  result = handleConversationMessage(result.state, "1", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment?.method).toBe("transferencia");
  expect(result.state.deliveryQuote?.totalFee).toBe(45);
  expect(result.state.total).toBe(210);
  expect(result.reply).toContain("Resumen de tu pedido");
  expect(result.reply).toContain("Refresco");

  result = handleConversationMessage(result.state, "Confirmar", navigationCatalog);
  expect(result.state.stage).toBe("confirmed");
  expect(result.action).toBe("request_order_creation");
});

test("modificar sin detalle conserva el resumen y explica cambios válidos", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_confirmation" as const,
    cart: [{
      id: "line-1",
      menuItemId: "hamburguesa-sencilla",
      categoryId: "hamburguesas",
      name: "Hamburguesa Sencilla",
      quantity: 1,
      unitPrice: 135,
      selectedModifiers: [],
      notes: "",
    }],
    serviceType: "para_llevar" as const,
    payment: { method: "transferencia" as const, cashTendered: null },
    beveragesOffered: true,
    total: 135,
  };

  const result = handleConversationMessage(state, "Modificar", navigationCatalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment?.method).toBe("transferencia");
  expect(result.reply).toContain("agrega bebida");
  expect(result.reply).toContain("cambia el domicilio");
  expect(result.reply).not.toContain("No encontré ese producto");
});

test("no vuelve a pedir referencia después de omitirla y corregir el domicilio", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_address_reference" as const,
    serviceType: "domicilio" as const,
    address: "Sinagogas 1230, col San Xavier",
  };

  let result = handleConversationMessage(state, "Omitir", navigationCatalog);
  expect(result.action).toBe("request_delivery_quote");

  result = recoverDeliveryQuote(result.state, "address_low_confidence");
  result = handleConversationMessage(
    result.state,
    "Sinagogas, 1230, San Xavier",
    navigationCatalog
  );
  expect(result.state.stage).toBe("awaiting_delivery_quote");
  expect(result.action).toBe("request_delivery_quote");
  expect(result.reply).not.toContain("referencia");
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

test("distribuye variaciones distintas por unidad y conserva domicilio", () => {
  const first = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero 3 Californias para domicilio",
    configurableCatalog
  );

  expect(first.state.cart).toHaveLength(3);
  expect(first.state.cart.every((line) => line.quantity === 1)).toBeTruthy();
  expect(first.state.serviceType).toBe("domicilio");
  expect(first.state.stage).toBe("awaiting_modifiers");

  const second = handleConversationMessage(
    first.state,
    "Uno va ser de res, y los otros de camarón",
    configurableCatalog
  );

  expect(second.state.stage).toBe("ordering");
  expect(
    second.state.cart.map((line) => line.selectedModifiers[0]?.optionName)
  ).toEqual(["Res", "Camarón", "Camarón"]);
  expect(second.reply).toContain("1 California de Res");
  expect(second.reply).toContain("2 California de Camarón");
  expect(second.reply).toContain("domicilio");
});

test("interpreta así está bien como cierre del carrito sin transferir la conversación", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Una Hamburguesa Sencilla",
    navigationCatalog
  );
  expect(result.reply).toContain("¿Deseas agregar algo más?");

  result = handleConversationMessage(result.state, "Así está bien", navigationCatalog);

  expect(result.state.stage).toBe("awaiting_beverage");
  expect(result.action).toBe("none");
  expect(result.reply).toContain("Algo para tomar");
});

test("una afirmación breve después de agregar conserva el carrito y pide el siguiente producto", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Una Hamburguesa Sencilla",
    navigationCatalog
  );

  result = handleConversationMessage(result.state, "Sí", navigationCatalog);

  expect(result.state.stage).toBe("ordering");
  expect(result.state.cart).toHaveLength(1);
  expect(result.state.ambiguityCount).toBe(0);
  expect(result.reply).toContain("qué más");
});

test("aplica una misma variación a todas las unidades configurables", () => {
  let state = createConversation("5216440000000");
  state = handleConversationMessage(
    state,
    "Quiero 3 Californias",
    configurableCatalog
  ).state;

  const result = handleConversationMessage(
    state,
    "Todos de camarón",
    configurableCatalog
  );

  expect(result.state.stage).toBe("ordering");
  expect(result.state.cart).toHaveLength(3);
  expect(
    result.state.cart.every(
      (line) => line.selectedModifiers[0]?.optionName === "Camarón"
    )
  ).toBe(true);
  expect(result.reply).toContain("3 California de Camarón");
});

test("modifica una variación, reduce unidades y confirma el nuevo desglose", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero 3 Californias",
    configurableCatalog
  );
  result = handleConversationMessage(
    result.state,
    "Uno de res y los otros de camarón",
    configurableCatalog
  );

  result = handleConversationMessage(
    result.state,
    "Cambia uno de res por camarón",
    configurableCatalog
  );
  expect(result.state.cart.map((line) => line.selectedModifiers[0]?.optionName)).toEqual([
    "Camarón",
    "Camarón",
    "Camarón",
  ]);
  expect(result.reply).toContain("3 California de Camarón");

  result = handleConversationMessage(
    result.state,
    "Quita un California",
    configurableCatalog
  );
  expect(result.state.cart).toHaveLength(2);
  expect(result.state.total).toBe(250);
  expect(result.reply).toContain("2 California de Camarón");
});

test("aplica una modificación escrita directamente desde la confirmación", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero 2 Californias",
    configurableCatalog
  );
  result = handleConversationMessage(
    result.state,
    "Uno de res y otro de camarón",
    configurableCatalog
  );
  const awaitingConfirmation = {
    ...result.state,
    stage: "awaiting_confirmation" as const,
    payment: { method: "transferencia" as const, cashTendered: null },
  };

  result = handleConversationMessage(
    awaitingConfirmation,
    "Cámbiame uno de res por camarón",
    configurableCatalog
  );

  expect(result.state.stage).toBe("ordering");
  expect(result.state.payment).toBeNull();
  expect(result.state.cart.map((line) => line.selectedModifiers[0]?.optionName)).toEqual([
    "Camarón",
    "Camarón",
  ]);
  expect(result.reply).toContain("2 California de Camarón");
});

test("permite cambiar de domicilio a recoger después de cotizar", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_confirmation" as const,
    serviceType: "domicilio" as const,
    address: "Calle Uno 123",
    addressReference: "Casa blanca",
    deliveryQuote: {
      id: "quote-previous",
      formattedAddress: "Calle Uno 123",
      colony: "Centro",
      latitude: 27.49,
      longitude: -109.94,
      distanceMeters: 4_000,
      baseFee: 30,
      surcharge: 0,
      totalFee: 30,
    },
    cart: [
      {
        id: "line-1",
        menuItemId: "hamburguesa-sencilla",
        categoryId: "hamburguesas",
        name: "Hamburguesa Sencilla",
        quantity: 1,
        unitPrice: 135,
        selectedModifiers: [],
        notes: "",
      },
    ],
    total: 165,
  };

  const result = handleConversationMessage(
    state,
    "Mejor será para recoger",
    configurableCatalog
  );

  expect(result.state.stage).toBe("awaiting_payment");
  expect(result.state.serviceType).toBe("para_llevar");
  expect(result.state.address).toBeNull();
  expect(result.state.deliveryQuote).toBeNull();
  expect(result.state.total).toBe(135);
  expect(result.reply).toContain("cambié el pedido para recoger");
});

test("permite corregir el domicilio antes de confirmar", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_payment" as const,
    serviceType: "domicilio" as const,
    address: "Calle equivocada 123",
    addressReference: "Casa blanca",
    cart: [
      {
        id: "line-1",
        menuItemId: "burger",
        categoryId: "hamburguesas",
        name: "Hamburguesa Sencilla",
        quantity: 1,
        unitPrice: 135,
        selectedModifiers: [],
        notes: "",
      },
    ],
    total: 135,
  };

  const result = handleConversationMessage(
    state,
    "Quiero cambiar la dirección",
    configurableCatalog
  );

  expect(result.state.stage).toBe("awaiting_address");
  expect(result.state.address).toBeNull();
  expect(result.state.addressReference).toBe("");
  expect(result.reply).toContain("nueva dirección");
});

test("permite retirar un producto aunque el bot ya esté solicitando el pago", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_payment" as const,
    serviceType: "para_llevar" as const,
    cart: [
      {
        id: "line-1",
        menuItemId: "hamburguesa-sencilla",
        categoryId: "hamburguesas",
        name: "Hamburguesa Sencilla",
        quantity: 2,
        unitPrice: 135,
        selectedModifiers: [],
        notes: "",
      },
    ],
    total: 270,
  };

  const result = handleConversationMessage(
    state,
    "Quita una Hamburguesa Sencilla",
    configurableCatalog
  );

  expect(result.state.stage).toBe("ordering");
  expect(result.state.payment).toBeNull();
  expect(result.state.cart[0].quantity).toBe(1);
  expect(result.state.total).toBe(135);
  expect(result.reply).toContain("1 Hamburguesa Sencilla");
});

test("reemplaza un producto antes de confirmar", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Quiero una Hamburguesa Sencilla",
    configurableCatalog
  );
  result = handleConversationMessage(
    result.state,
    "Cambia la Hamburguesa Sencilla por un California de pollo",
    configurableCatalog
  );

  expect(result.state.cart).toHaveLength(1);
  expect(result.state.cart[0].name).toBe("California");
  expect(result.state.cart[0].selectedModifiers[0]?.optionName).toBe("Pollo");
  expect(result.state.total).toBe(125);
  expect(result.reply).toContain("California de Pollo");
});

test("recuerda domicilio y evita preguntarlo otra vez después de bebidas", () => {
  let result = handleConversationMessage(
    createConversation("5216440000000"),
    "Una Hamburguesa Sencilla para domicilio",
    configurableCatalog
  );
  expect(result.state.serviceType).toBe("domicilio");

  result = handleConversationMessage(result.state, "Sería todo", configurableCatalog);
  expect(result.state.stage).toBe("awaiting_beverage");
  result = handleConversationMessage(result.state, "No gracias", configurableCatalog);
  expect(result.state.stage).toBe("awaiting_address");
  expect(result.reply).toContain("dirección");
  expect(result.reply).not.toContain("recoger o a domicilio");
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

  result = handleConversationMessage(quotedState, "Efectivo", catalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment).toMatchObject({ method: "efectivo", cashTendered: null });
  expect(result.action).toBe("none");
  expect(result.reply).toContain("$155");

  result = handleConversationMessage(result.state, "Sí, confirmo", catalog);
  expect(result.state.stage).toBe("confirmed");
  expect(result.action).toBe("request_order_creation");
});

test("una conversación antigua que esperaba efectivo continúa al resumen", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_cash_tendered" as const,
    serviceType: "domicilio" as const,
    payment: { method: "efectivo" as const, cashTendered: null },
    cart: [
      {
        id: "line-1",
        menuItemId: "california",
        categoryId: "sushis",
        name: "California",
        quantity: 1,
        unitPrice: 125,
        selectedModifiers: [],
        notes: "",
      },
    ],
    total: 155,
  };

  const result = handleConversationMessage(state, "Efectivo por favor", catalog);
  expect(result.state.stage).toBe("awaiting_confirmation");
  expect(result.state.payment).toEqual({ method: "efectivo", cashTendered: null });
  expect(result.reply).toContain("Resumen de tu pedido");
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

test("pide una dirección más precisa antes de transferir una cotización fallida", () => {
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_delivery_quote" as const,
    serviceType: "domicilio" as const,
    address: "Dirección ambigua",
    addressReference: "Casa blanca",
  };

  const first = recoverDeliveryQuote(state, "address_not_found");
  expect(first.action).toBe("none");
  expect(first.state.stage).toBe("awaiting_address");
  expect(first.state.deliveryQuoteAttempts).toBe(1);
  expect(first.state.addressReference).toBe("Casa blanca");
  expect(first.reply).toContain("comparte tu ubicación");

  const corrected = handleConversationMessage(
    first.state,
    "Calle Kino 123, colonia Centro",
    catalog
  );
  expect(corrected.state.stage).toBe("awaiting_delivery_quote");
  expect(corrected.action).toBe("request_delivery_quote");
  expect(corrected.state.addressReference).toBe("Casa blanca");

  const second = recoverDeliveryQuote(
    { ...first.state, stage: "awaiting_delivery_quote" },
    "address_not_found"
  );
  expect(second.action).toBe("handoff");
  expect(second.state.stage).toBe("handoff");
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
