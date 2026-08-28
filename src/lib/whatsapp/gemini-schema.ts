export function geminiResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["confidence", "actions"],
    properties: {
      confidence: { type: "number" },
      actions: {
        type: "array",
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
            quantity: { type: "integer" },
            optionIds: {
              type: "array",
              items: { type: "string" },
            },
            noteKind: {
              type: "string",
              enum: ["delivery", "order", "product", "none"],
            },
            text: { type: "string" },
          },
        },
      },
    },
  } as const;
}
