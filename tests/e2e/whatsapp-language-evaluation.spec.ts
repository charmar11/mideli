import { expect, test } from "@playwright/test";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import {
  createConversation,
  handleConversationMessage,
  withDeliveryQuote,
  withPendingDeliveryQuote,
} from "@/lib/whatsapp/conversation-engine";
import { customerReplyText } from "@/lib/whatsapp/customer-input";
import type {
  ConversationCatalog,
  ConversationResult,
  ConversationState,
} from "@/lib/whatsapp/types";
import type { MenuItem } from "@/types/database";

const now = "2026-08-27T00:00:00.000Z";
const catalog: ConversationCatalog = buildConversationCatalog([
  {
    id: "burger-simple",
    category_id: "burgers",
    name: "Hamburguesa Sencilla",
    description: "Incluye papas.",
    price: 135,
    is_active: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "burgers", name: "Hamburguesas", sort_order: 1, is_active: true },
    modifiers: [],
  },
  {
    id: "burger-double",
    category_id: "burgers",
    name: "Hamburguesa Doble",
    description: "Incluye papas.",
    price: 160,
    is_active: true,
    sort_order: 2,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "burgers", name: "Hamburguesas", sort_order: 1, is_active: true },
    modifiers: [],
  },
  {
    id: "california",
    category_id: "sushi",
    name: "California",
    description: "Res, pollo o camarón.",
    price: 125,
    is_active: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "sushi", name: "Sushis", sort_order: 2, is_active: true },
    modifiers: [{
      id: "protein",
      name: "Tipo",
      required: true,
      selection_mode: "single",
      options: [
        { id: "beef", name: "Res", price: 0 },
        { id: "chicken", name: "Pollo", price: 0 },
        { id: "shrimp", name: "Camarón", price: 0 },
      ],
    }],
  },
  {
    id: "pepsi",
    category_id: "drinks",
    name: "Pepsi Black",
    description: "Botella.",
    price: 25,
    is_active: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "drinks", name: "Bebidas", sort_order: 3, is_active: true },
    modifiers: [],
  },
] as unknown as MenuItem[]);

type MessageCase = {
  family: string;
  message: string;
  state: () => ConversationState;
  verify: (result: ConversationResult) => void;
};

function stateWithBurger() {
  return handleConversationMessage(
    createConversation("5216440000000"),
    "una hamburguesa sencilla",
    catalog
  ).state;
}

function buildMessageCorpus() {
  const cases: MessageCase[] = [];
  const courtesies = [
    "",
    " por favor",
    " gracias",
    " porfa",
    " si se puede",
    " para mi pedido",
    " por favor gracias",
    " plis",
    " porfis",
    " de favor",
    " si son tan amables",
    " para llevarme",
  ];
  const greetings = ["hola", "buenas", "buen día", "buenas tardes", "buenas noches"];
  for (const greeting of greetings) {
    for (const suffix of courtesies) {
      cases.push({
        family: "saludo",
        message: `${greeting}${suffix}`,
        state: () => createConversation("5216440000000"),
        verify: (result) => {
          expect(result.state.cart).toHaveLength(0);
          expect(result.state.stage).toBe("ordering");
        },
      });
    }
  }

  const menuPhrases = ["menú", "ver menú", "quiero ver el menú", "muéstrame el menú", "menú completo"];
  for (const phrase of menuPhrases) {
    for (const suffix of courtesies) {
      cases.push({
        family: "menu",
        message: `${phrase}${suffix}`,
        state: () => createConversation("5216440000000"),
        verify: (result) => expect(result.state.stage).toBe("browsing_catalog"),
      });
    }
  }

  const quantityWords = ["una", "dos", "tres", "cuatro", "cinco", "6", "7", "8", "9", "10"];
  for (const quantity of quantityWords) {
    for (const suffix of courtesies) {
      cases.push({
        family: "producto",
        message: `${quantity} hamburguesa sencilla${suffix}`,
        state: () => createConversation("5216440000000"),
        verify: (result) => {
          expect(result.state.cart).toHaveLength(1);
          expect(result.state.total).toBeGreaterThanOrEqual(135);
        },
      });
    }
  }

  const donePhrases = [
    "sería todo",
    "eso es todo",
    "ya es todo",
    "nada más",
    "terminar",
    "finalizar",
    "con eso",
  ];
  for (const phrase of donePhrases) {
    for (const suffix of courtesies) {
      cases.push({
        family: "terminar",
        message: `${phrase}${suffix}`,
        state: stateWithBurger,
        verify: (result) => expect(result.state.stage).toBe("awaiting_beverage"),
      });
    }
  }

  const fulfillmentPhrases = [
    "a domicilio",
    "sería entrega",
    "quiero envío",
    "para recoger",
    "paso por él",
  ];
  for (const phrase of fulfillmentPhrases) {
    for (const suffix of courtesies) {
      cases.push({
        family: "entrega",
        message: `${phrase}${suffix}`,
        state: () => ({ ...stateWithBurger(), stage: "awaiting_fulfillment" }),
        verify: (result) => {
          expect(["domicilio", "para_llevar"]).toContain(result.state.serviceType);
          expect(result.action).not.toBe("handoff");
        },
      });
    }
  }

  const paymentPhrases = ["efectivo", "en efectivo", "transferencia", "por transferencia", "tarjeta"];
  for (const phrase of paymentPhrases) {
    for (const suffix of courtesies) {
      cases.push({
        family: "pago",
        message: `${phrase}${suffix}`,
        state: () => ({
          ...stateWithBurger(),
          stage: "awaiting_payment",
          serviceType: "para_llevar",
        }),
        verify: (result) => {
          expect(result.state.stage).toBe("awaiting_confirmation");
          expect(result.state.payment).not.toBeNull();
        },
      });
    }
  }

  const productQuestions = [
    "¿Cuánto cuesta la hamburguesa sencilla?",
    "¿Qué lleva la hamburguesa sencilla?",
    "¿Tienen hamburguesa sencilla?",
    "¿Hay hamburguesa sencilla disponible?",
  ];
  for (const phrase of productQuestions) {
    for (const suffix of courtesies) {
      cases.push({
        family: "consulta",
        message: `${phrase}${suffix}`,
        state: () => createConversation("5216440000000"),
        verify: (result) => {
          expect(result.state.cart).toHaveLength(0);
          expect(result.reply).toContain("$135");
        },
      });
    }
  }

  const promptBodies = [
    "¿Deseas agregar alguna bebida a tu pedido?",
    "¿Tu pedido será para recoger o a domicilio?",
    "¿Confirmas el pedido?",
    "¿Pagarás en efectivo o por transferencia?",
    "¿Dónde quieres guardar la indicación?",
  ];
  const freshReplies = ["No, gracias", "A domicilio", "Confirmar", "Efectivo", "A todo el pedido"];
  for (const prompt of promptBodies) {
    for (const reply of freshReplies) {
      for (const separator of ["\n", "\n\n", "\n> ", "\n• "]) {
        cases.push({
          family: "texto_citado",
          message: `${prompt}${separator}${reply}`,
          state: () => createConversation("5216440000000"),
          verify: () => expect(customerReplyText(`${prompt}${separator}${reply}`)).toBe(reply),
        });
      }
    }
  }

  return cases;
}

test("evalúa al menos 500 mensajes por familias sin perder estado ni inventar compras", () => {
  const cases = buildMessageCorpus();
  expect(cases.length).toBeGreaterThanOrEqual(500);
  const familyCounts = new Map<string, number>();
  for (const entry of cases) {
    const result = handleConversationMessage(entry.state(), entry.message, catalog);
    entry.verify(result);
    familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
  }
  expect(familyCounts.size).toBeGreaterThanOrEqual(8);
});

function addBurger(state: ConversationState, phrase: string) {
  return handleConversationMessage(state, phrase, catalog).state;
}

test("completa 100 conversaciones con variantes, cambios, notas y domicilio", () => {
  for (let index = 0; index < 100; index += 1) {
    let state = createConversation(`521644${String(index).padStart(7, "0")}`);
    state = addBurger(state, index % 2 === 0 ? "dos hamburguesas sencillas" : "una hamburguesa sencilla");

    if (index % 4 === 1) {
      state = handleConversationMessage(
        state,
        "cambia hamburguesa sencilla por hamburguesa doble",
        catalog
      ).state;
      expect(state.cart.some((line) => line.menuItemId === "burger-double")).toBeTruthy();
    }
    if (index % 4 === 2) {
      state = handleConversationMessage(state, "sin cebolla en la hamburguesa sencilla", catalog).state;
      expect(state.cart.some((line) => line.notes.includes("sin cebolla"))).toBeTruthy();
    }

    state = handleConversationMessage(state, "sería todo", catalog).state;
    state = handleConversationMessage(state, "no gracias", catalog).state;

    if (index % 4 === 3) {
      state = handleConversationMessage(state, "a domicilio", catalog).state;
      state = handleConversationMessage(state, "Calle Prueba 123, colonia Centro", catalog).state;
      state = handleConversationMessage(state, "sin referencia", catalog).state;
      state = withPendingDeliveryQuote(state, {
        id: `quote-${index}`,
        formattedAddress: "Calle Prueba 123, Centro, Ciudad Obregón, Sonora",
        colony: "Centro",
        latitude: 27.48,
        longitude: -109.93,
        distanceMeters: 2_000,
        baseFee: 30,
        surcharge: 0,
        totalFee: 30,
      });
      const quoteResult = handleConversationMessage(state, "sí", catalog);
      expect(quoteResult.action).toBe("confirm_delivery_quote");
      state = withDeliveryQuote(quoteResult.state, quoteResult.state.pendingDeliveryQuote!);
      state = handleConversationMessage(state, "efectivo", catalog).state;
    } else {
      state = handleConversationMessage(state, "para recoger", catalog).state;
      state = handleConversationMessage(state, index % 2 === 0 ? "tarjeta" : "efectivo", catalog).state;
    }

    const confirmed = handleConversationMessage(state, "confirmo", catalog);
    expect(confirmed.state.stage).toBe("confirmed");
    expect(confirmed.action).toBe("request_order_creation");
    expect(confirmed.state.cart.length).toBeGreaterThan(0);
  }
});

test("entiende una corrección natural de variación sin duplicar el producto", () => {
  let state = handleConversationMessage(
    createConversation("5216440000000"),
    "un California",
    catalog
  ).state;
  state = handleConversationMessage(state, "res", catalog).state;
  const corrected = handleConversationMessage(state, "no era res, era pollo", catalog);

  expect(corrected.state.cart).toHaveLength(1);
  expect(corrected.state.cart[0].selectedModifiers[0]?.optionName).toBe("Pollo");
  expect(corrected.state.total).toBe(125);
});
