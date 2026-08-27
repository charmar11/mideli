import "server-only";

import type {
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
    required: ["intent", "confidence", "operations", "serviceType"],
    properties: {
      intent: {
        type: "string",
        enum: ["cart_operations", "note", "finish_order", "continue_order", "unknown"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      serviceType: {
        type: "string",
        enum: ["domicilio", "para_llevar", "none"],
      },
      operations: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "productId", "quantity", "optionIds"],
          properties: {
            kind: { type: "string", enum: ["add", "remove", "set_quantity"] },
            productId: { type: "string" },
            quantity: { type: "integer", minimum: 1, maximum: 20 },
            optionIds: {
              type: "array",
              maxItems: 12,
              items: { type: "string" },
            },
          },
        },
      },
      note: {
        type: "object",
        nullable: true,
        additionalProperties: false,
        required: ["kind", "text", "productId"],
        properties: {
          kind: { type: "string", enum: ["delivery", "order", "product"] },
          text: { type: "string", maxLength: 500 },
          productId: { type: "string", nullable: true },
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
      "Devuelve IDs exactos del catálogo. Nunca inventes productos, opciones, precios ni cantidades.",
      "Si el cliente distribuye unidades, crea una operación add por cada configuración distinta.",
      "Ejemplo: un California de carne y otro de pollo puede mapear carne a Res solo si Res existe.",
      "Para cambios, usa remove y add; para ajustar el total de un producto usa set_quantity.",
      "Si el mensaje es una indicación de preparación, acceso o pedido, usa intent note y no cambies el carrito.",
      "Una nota de producto debe usar un productId que ya esté en el carrito. PIN, caseta y privada son delivery.",
      "Usa unknown y confianza baja si falta información importante.",
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
  const validIntents = new Set([
    "cart_operations",
    "note",
    "finish_order",
    "continue_order",
    "unknown",
  ]);
  if (typeof record.intent !== "string" || !validIntents.has(record.intent)) {
    throw new Error("invalid_semantic_intent");
  }
  const confidence = Number(record.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("invalid_semantic_confidence");
  }
  if (!Array.isArray(record.operations)) throw new Error("invalid_semantic_operations");
  const operations = record.operations.map((operation) => {
    if (!operation || typeof operation !== "object") {
      throw new Error("invalid_semantic_operation");
    }
    const candidate = operation as Record<string, unknown>;
    if (
      !["add", "remove", "set_quantity"].includes(String(candidate.kind)) ||
      typeof candidate.productId !== "string" ||
      !Number.isInteger(candidate.quantity) ||
      !Array.isArray(candidate.optionIds) ||
      !candidate.optionIds.every((optionId) => typeof optionId === "string")
    ) {
      throw new Error("invalid_semantic_operation");
    }
    return {
      kind: candidate.kind as "add" | "remove" | "set_quantity",
      productId: candidate.productId,
      quantity: Number(candidate.quantity),
      optionIds: candidate.optionIds as string[],
    };
  });
  const serviceType = record.serviceType;
  if (serviceType !== "none" && serviceType !== "domicilio" && serviceType !== "para_llevar") {
    throw new Error("invalid_semantic_service_type");
  }
  let note: SemanticInterpretation["note"] = null;
  if (record.note !== null && record.note !== undefined) {
    if (!record.note || typeof record.note !== "object" || Array.isArray(record.note)) {
      throw new Error("invalid_semantic_note");
    }
    const candidate = record.note as Record<string, unknown>;
    if (
      !["delivery", "order", "product"].includes(String(candidate.kind)) ||
      typeof candidate.text !== "string" ||
      candidate.text.length < 1 ||
      candidate.text.length > 500 ||
      (candidate.productId !== null && typeof candidate.productId !== "string")
    ) {
      throw new Error("invalid_semantic_note");
    }
    note = {
      kind: candidate.kind as "delivery" | "order" | "product",
      text: candidate.text,
      productId: candidate.productId as string | null,
    };
  }
  return {
    intent: record.intent as SemanticInterpretation["intent"],
    confidence,
    operations,
    serviceType: serviceType === "none" ? null : serviceType,
    note,
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
