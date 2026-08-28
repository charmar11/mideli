import "server-only";

import type {
  SemanticAction,
  SemanticInterpretation,
  SemanticInterpreter,
} from "./hybrid-interpreter";

const REQUEST_TIMEOUT_MS = 2_500;

type GeminiConfig = {
  apiKey: string;
  model: string;
};

function responseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["confidence", "actions"],
    properties: {
      confidence: { type: "number", minimum: 0, maximum: 1 },
      actions: {
        type: "array",
        maxItems: 16,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "operationKind",
            "productId",
            "quantity",
            "optionIds",
            "noteKind",
            "text",
          ],
          properties: {
            kind: {
              type: "string",
              enum: [
                "cart_operation",
                "note",
                "finish_order",
                "continue_order",
                "show_menu",
                "request_human",
                "unknown",
              ],
            },
            operationKind: {
              type: "string",
              enum: ["add", "remove", "set_quantity", "none"],
            },
            productId: { type: "string" },
            quantity: { type: "integer", minimum: 0, maximum: 20 },
            optionIds: {
              type: "array",
              maxItems: 12,
              items: { type: "string" },
            },
            noteKind: {
              type: "string",
              enum: ["delivery", "order", "product", "none"],
            },
            text: { type: "string", maxLength: 500 },
          },
        },
      },
    },
  };
}

function payloadForInterpreter(
  input: Parameters<SemanticInterpreter>[0]
) {
  return {
    instruction: [
      "Interpreta únicamente una instrucción de carrito para un restaurante mexicano.",
      "Devuelve un plan de acciones en el mismo orden en que el cliente las expresó.",
      "Devuelve IDs exactos del catálogo. Nunca inventes productos, opciones, precios ni cantidades.",
      "Si el cliente distribuye unidades, crea una operación add por cada configuración distinta.",
      "Ejemplo: un California de carne y otro de pollo puede mapear carne a Res solo si Res existe.",
      "Para cambios, usa remove y add; para ajustar el total de un producto usa set_quantity.",
      "Si el mensaje contiene varias instrucciones, conserva todas: agregar, quitar, corregir, anotar, terminar o mostrar menú.",
      "Resuelve referencias como ese, el otro, los dos, la segunda y el de pollo solo cuando el carrito permita una referencia única; de lo contrario usa unknown.",
      "Interpreta correcciones como no era res era pollo, mejor doble y quita el último respetando el carrito actual.",
      "Si el mensaje es una indicación de preparación, acceso o pedido, usa una acción note y no cambies el carrito por esa parte.",
      "Una nota de producto debe usar un productId que ya esté en el carrito. PIN, caseta y privada son delivery.",
      "Usa unknown y confianza baja si falta información importante. Una pregunta nunca es una compra.",
      "No redactes la respuesta al cliente; Mideli la genera.",
    ].join(" "),
    conversation: {
      stage: input.state.stage,
      serviceType: input.state.serviceType,
      cart: input.state.cart.map((line) => ({
        productId: line.menuItemId,
        productName: line.name,
        quantity: line.quantity,
        notes: line.notes,
        optionIds: line.selectedModifiers.map((modifier) => modifier.optionId),
      })),
    },
    customerMessage: input.message,
    catalog: input.catalog.items.map((item) => ({
      productId: item.id,
      name: item.name,
      description: item.description,
      category: item.categoryName,
      options: item.modifiers.map((group) => ({
        groupId: group.id,
        name: group.name,
        required: group.required,
        selectionMode: group.selection_mode ?? "single",
        optionValues: group.options.map((option) => ({
          optionId: option.id,
          name: option.name,
        })),
      })),
    })),
  };
}

function parseInterpretation(value: unknown): SemanticInterpretation {
  if (!value || typeof value !== "object") throw new Error("invalid_semantic_response");
  const record = value as Record<string, unknown>;
  const confidence = Number(record.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("invalid_semantic_confidence");
  }
  if (!Array.isArray(record.actions)) throw new Error("invalid_semantic_actions");
  const actions: SemanticAction[] = record.actions.map((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new Error("invalid_semantic_action");
    }
    const candidate = action as Record<string, unknown>;
    const kind = String(candidate.kind);
    if (kind === "cart_operation") {
      if (
        !["add", "remove", "set_quantity"].includes(String(candidate.operationKind)) ||
        typeof candidate.productId !== "string" ||
        !Number.isInteger(candidate.quantity) ||
        Number(candidate.quantity) < 1 ||
        !Array.isArray(candidate.optionIds) ||
        !candidate.optionIds.every((optionId) => typeof optionId === "string")
      ) {
        throw new Error("invalid_semantic_cart_action");
      }
      return {
        kind: "cart_operation",
        operationKind: candidate.operationKind as "add" | "remove" | "set_quantity",
        productId: candidate.productId,
        quantity: Number(candidate.quantity),
        optionIds: candidate.optionIds as string[],
      };
    }
    if (kind === "note") {
      if (
        !["delivery", "order", "product"].includes(String(candidate.noteKind)) ||
        typeof candidate.text !== "string" ||
        candidate.text.length < 1 ||
        candidate.text.length > 500 ||
        typeof candidate.productId !== "string"
      ) {
        throw new Error("invalid_semantic_note_action");
      }
      return {
        kind: "note",
        noteKind: candidate.noteKind as "delivery" | "order" | "product",
        text: candidate.text,
        productId: candidate.productId || null,
      };
    }
    if (["finish_order", "continue_order", "show_menu", "request_human", "unknown"].includes(kind)) {
      return { kind } as SemanticAction;
    }
    throw new Error("invalid_semantic_action_kind");
  });
  const cartActions = actions.filter(
    (action): action is Extract<SemanticAction, { kind: "cart_operation" }> =>
      action.kind === "cart_operation"
  );
  return {
    intent: cartActions.length > 0 ? "cart_operations" : "unknown",
    confidence,
    operations: cartActions.map((action) => ({
      kind: action.operationKind,
      productId: action.productId,
      quantity: action.quantity,
      optionIds: action.optionIds,
    })),
    serviceType: null,
    note: null,
    actions,
  };
}

export function createGeminiSemanticInterpreter(
  config: GeminiConfig
): SemanticInterpreter | null {
  if (!config.apiKey) return null;
  return async (input) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: JSON.stringify(payloadForInterpreter(input)) }],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
              responseJsonSchema: responseSchema(),
            },
          }),
          signal: controller.signal,
        }
      );
      if (!response.ok) throw new Error(`gemini_http_${response.status}`);
      const body = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("gemini_empty_response");
      return parseInterpretation(JSON.parse(text));
    } finally {
      clearTimeout(timeout);
    }
  };
}
