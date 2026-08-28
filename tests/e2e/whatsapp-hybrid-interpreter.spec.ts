import { expect, test } from "@playwright/test";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import {
  createConversation,
  handleConversationMessage,
  withDeliveryQuote,
} from "@/lib/whatsapp/conversation-engine";
import {
  handleHybridConversationMessage,
  type SemanticInterpreter,
} from "@/lib/whatsapp/hybrid-interpreter";
import type { MenuItem } from "@/types/database";

const now = "2026-08-26T00:00:00.000Z";
const catalog = buildConversationCatalog([
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
    categories: { id: "sushis", name: "Sushis", sort_order: 1, is_active: true },
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
] as unknown as MenuItem[]);

test("Gemini puede desambiguar dos unidades configuradas en una sola frase", async () => {
  const diagnostics: Array<{ outcome: string; operationCount?: number }> = [];
  const interpreter: SemanticInterpreter = async () => ({
    intent: "cart_operations",
    confidence: 0.98,
    operations: [
      { kind: "add", productId: "california", quantity: 1, optionIds: ["res"] },
      { kind: "add", productId: "california", quantity: 1, optionIds: ["pollo"] },
    ],
  });

  const result = await handleHybridConversationMessage({
    state: createConversation("5216440000000"),
    message: "Y sería un california de carne y otro de pollo",
    catalog,
    interpreter,
    onDiagnostic: (event) => diagnostics.push(event),
  });

  expect(result.state.cart).toHaveLength(2);
  expect(result.state.cart.map((line) => line.selectedModifiers[0]?.optionName)).toEqual([
    "Res",
    "Pollo",
  ]);
  expect(result.state.total).toBe(250);
  expect(result.reply).toContain("1 California de Res");
  expect(result.reply).toContain("1 California de Pollo");
  expect(diagnostics).toEqual([
    expect.objectContaining({ outcome: "applied", operationCount: 2 }),
  ]);
});

test("rechaza identificadores inventados por Gemini y conserva el carrito", async () => {
  const interpreter: SemanticInterpreter = async () => ({
    intent: "cart_operations",
    confidence: 0.99,
    operations: [
      { kind: "add", productId: "producto-inventado", quantity: 2, optionIds: [] },
    ],
  });
  const state = createConversation("5216440000000");

  const result = await handleHybridConversationMessage({
    state,
    message: "Ponme dos especiales de la casa",
    catalog,
    interpreter,
  });

  expect(result.state.cart).toEqual([]);
  expect(result.action).toBe("none");
  expect(result.reply).toContain("confirmar cuál producto");
});

test("si Gemini falla el motor local responde y no pierde el carrito", async () => {
  const interpreter: SemanticInterpreter = async () => {
    throw new Error("429 quota exceeded");
  };

  const result = await handleHybridConversationMessage({
    state: createConversation("5216440000000"),
    message: "Quiero un California",
    catalog,
    interpreter,
  });

  expect(result.state.cart).toHaveLength(1);
  expect(result.state.stage).toBe("awaiting_modifiers");
  expect(result.reply).toContain("Elige");
});

test("si Gemini falla en una distribución compleja no acepta un pedido parcial", async () => {
  const diagnostics: Array<{ outcome: string; reason?: string }> = [];
  const interpreter: SemanticInterpreter = async () => {
    throw new Error("timeout");
  };

  const result = await handleHybridConversationMessage({
    state: createConversation("5216440000000"),
    message: "Un California de carne y otro de pollo",
    catalog,
    interpreter,
    onDiagnostic: (event) => diagnostics.push(event),
  });

  expect(result.state.cart).toEqual([]);
  expect(result.state.ambiguityCount).toBe(0);
  expect(result.reply).toContain("confirmar cuál producto");
  expect(diagnostics).toEqual([
    expect.objectContaining({ outcome: "clarification", reason: "timeout" }),
  ]);
});

test("el diagnóstico no contiene el mensaje, teléfono, carrito ni secretos", async () => {
  const diagnostics: unknown[] = [];
  const interpreter: SemanticInterpreter = async () => ({
    intent: "unknown",
    confidence: 0.1,
    operations: [],
  });

  await handleHybridConversationMessage({
    state: createConversation("5216440000000"),
    message: "Ponme dos especiales de la casa",
    catalog,
    interpreter,
    onDiagnostic: (event) => diagnostics.push(event),
  });

  const serialized = JSON.stringify(diagnostics);
  expect(serialized).not.toContain("5216440000000");
  expect(serialized).not.toContain("especiales de la casa");
  expect(serialized).not.toContain("productId");
  expect(serialized).not.toContain("api");
});

test("no consulta Gemini cuando el mensaje contiene una dirección", async () => {
  let calls = 0;
  const interpreter: SemanticInterpreter = async () => {
    calls += 1;
    return { intent: "unknown", confidence: 0, operations: [] };
  };
  const state = {
    ...createConversation("5216440000000"),
    stage: "awaiting_address" as const,
  };

  await handleHybridConversationMessage({
    state,
    message: "Las Palmas 1747, colonia Villas del Palmar",
    catalog,
    interpreter,
  });

  expect(calls).toBe(0);
});

test("conserva producto, cierre, domicilio y pago expresados en un solo mensaje", async () => {
  const interpreter: SemanticInterpreter = async ({ message }) => {
    expect(message).toBe("Dos California de res");
    return {
      intent: "cart_operations",
      confidence: 0.99,
      operations: [],
      actions: [{
        kind: "cart_operation",
        operationKind: "add",
        productId: "california",
        quantity: 2,
        optionIds: ["res"],
      }],
    };
  };

  const result = await handleHybridConversationMessage({
    state: createConversation("5216440000000"),
    message: "Dos California de res, sería todo a domicilio y pago transferencia",
    catalog,
    interpreter,
  });

  expect(result.state.cart).toHaveLength(2);
  expect(result.state.serviceType).toBe("domicilio");
  expect(result.state.pendingPaymentMethod).toBe("transferencia");
  expect(result.state.stage).toBe("awaiting_beverage");

  const addressState = handleConversationMessage(result.state, "no gracias", catalog).state;
  const quoted = withDeliveryQuote(
    { ...addressState, address: "Calle Prueba 123", addressConfirmed: true },
    {
      id: "quote-1",
      formattedAddress: "Calle Prueba 123, Centro",
      colony: "Centro",
      latitude: 27.48,
      longitude: -109.93,
      distanceMeters: 2_000,
      baseFee: 30,
      surcharge: 0,
      totalFee: 30,
    }
  );
  expect(quoted.payment?.method).toBe("transferencia");
  expect(quoted.stage).toBe("awaiting_confirmation");
});
