import { expect, test } from "@playwright/test";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import {
  mapsProbeAddress,
  runWhatsappPilotBatch,
  semanticDiagnosticDetail,
  type WhatsappPilotEvaluatorDependencies,
} from "@/lib/whatsapp/pilot-evaluator";
import type { SemanticInterpreter } from "@/lib/whatsapp/hybrid-interpreter";
import {
  DEFAULT_GEMINI_MODEL,
  classifyGeminiHttpFailure,
  geminiRetryDelayMs,
} from "@/lib/whatsapp/gemini-policy";
import { geminiResponseSchema } from "@/lib/whatsapp/gemini-schema";
import { selectGeminiCatalogItems } from "@/lib/whatsapp/gemini-catalog-context";
import { resolveDrivingDistance } from "@/lib/whatsapp/google-route-distance";
import type { MenuItem } from "@/types/database";

const now = "2026-08-28T00:00:00.000Z";
const catalog = buildConversationCatalog([
  {
    id: "simple",
    category_id: "food",
    name: "Hamburguesa Sencilla",
    description: "Incluye papas.",
    price: 135,
    is_active: true,
    whatsapp_enabled: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "food", name: "Hamburguesas", sort_order: 1, is_active: true },
    modifiers: [],
  },
  {
    id: "double",
    category_id: "food",
    name: "Hamburguesa Doble",
    description: "Incluye papas.",
    price: 160,
    is_active: true,
    whatsapp_enabled: true,
    sort_order: 2,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "food", name: "Hamburguesas", sort_order: 1, is_active: true },
    modifiers: [],
  },
  {
    id: "california",
    category_id: "sushi",
    name: "California",
    description: "Res, pollo o camarón.",
    price: 125,
    is_active: true,
    whatsapp_enabled: true,
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
      ],
    }],
  },
  {
    id: "drink",
    category_id: "drinks",
    name: "Té Helado",
    description: "",
    price: 40,
    is_active: true,
    whatsapp_enabled: true,
    sort_order: 1,
    image_url: "",
    created_at: now,
    updated_at: now,
    categories: { id: "drinks", name: "Bebidas", sort_order: 3, is_active: true },
    modifiers: [],
  },
] as unknown as MenuItem[]);

const interpreter: SemanticInterpreter = async ({ message }) => {
  const normalized = message.toLocaleLowerCase("es-MX");
  if (normalized.includes("combo lunar")) {
    return { intent: "unknown", confidence: 0.1, operations: [], actions: [{ kind: "unknown" }] };
  }
  if (normalized.includes("no era")) {
    return {
      intent: "cart_operations",
      confidence: 0.99,
      operations: [],
      actions: [
        { kind: "cart_operation", operationKind: "remove", productId: "california", quantity: 1, optionIds: [] },
        { kind: "cart_operation", operationKind: "add", productId: "california", quantity: 1, optionIds: ["chicken"] },
      ],
    };
  }
  if (normalized.includes("cambia hamburguesa")) {
    return {
      intent: "cart_operations",
      confidence: 0.99,
      operations: [],
      actions: [
        { kind: "cart_operation", operationKind: "remove", productId: "simple", quantity: 1, optionIds: [] },
        { kind: "cart_operation", operationKind: "add", productId: "double", quantity: 1, optionIds: [] },
      ],
    };
  }
  if (normalized.includes("otro")) {
    return {
      intent: "cart_operations",
      confidence: 0.99,
      operations: [],
      actions: [
        { kind: "cart_operation", operationKind: "add", productId: "california", quantity: 1, optionIds: ["beef"] },
        { kind: "cart_operation", operationKind: "add", productId: "california", quantity: 1, optionIds: ["chicken"] },
      ],
    };
  }
  if (normalized.includes("hamburguesa sencilla")) {
    return {
      intent: "cart_operations",
      confidence: 0.99,
      operations: [],
      actions: [{ kind: "cart_operation", operationKind: "add", productId: "simple", quantity: 1, optionIds: [] }],
    };
  }
  return { intent: "unknown", confidence: 0.1, operations: [], actions: [{ kind: "unknown" }] };
};

function dependencies(): WhatsappPilotEvaluatorDependencies {
  return {
    catalog,
    interpreter,
    mapsValidAddress: "Dirección configurada del local",
    quoteDelivery: async (address) =>
      address.startsWith("Ciudad Obregón")
        ? { status: "needs_handoff", reason: "address_number_required" }
        : {
            status: "quoted",
            quote: {
              id: null,
              formattedAddress: "Domicilio validado",
              colony: "Centro",
              latitude: 27.48,
              longitude: -109.93,
              distanceMeters: 100,
              baseFee: 30,
              surcharge: 0,
              totalFee: 30,
            },
          },
  };
}

test("ejecuta 25 escenarios aislados en cinco bloques sin fallos críticos", async () => {
  const results = [];
  for (let batchIndex = 0; batchIndex < 5; batchIndex += 1) {
    const batch = await runWhatsappPilotBatch({ batchIndex, dependencies: dependencies() });
    expect(batch.results).toHaveLength(5);
    results.push(...batch.results);
  }

  expect(results).toHaveLength(25);
  expect(new Set(results.map((item) => item.id)).size).toBe(25);
  expect(results.filter((item) => item.critical)).toEqual([]);
  expect(results.filter((item) => item.status !== "passed")).toEqual([]);
});

test("rechaza bloques fuera del rango permitido", async () => {
  await expect(
    runWhatsappPilotBatch({ batchIndex: 5, dependencies: dependencies() })
  ).rejects.toThrow("invalid_pilot_batch");
});

test("usa la dirección configurada del local para la prueba válida de Maps", () => {
  const value = mapsProbeAddress({
    latitude: 27.503311,
    longitude: -109.936335,
    fallbackAddress: "Dirección del local",
  });

  expect(value).toBe("Dirección del local");
});

test("acepta distancia cero solo cuando la ruta contiene puntos próximos", () => {
  expect(
    resolveDrivingDistance(
      { latitude: 27.503311, longitude: -109.936335 },
      { latitude: 27.50332, longitude: -109.93634 },
      { routes: [{}] }
    )
  ).toBe(0);
  expect(
    resolveDrivingDistance(
      { latitude: 27.503311, longitude: -109.936335 },
      { latitude: 27.51, longitude: -109.93 },
      { routes: [{ distanceMeters: 1253 }] }
    )
  ).toBe(1253);
  expect(() =>
    resolveDrivingDistance(
      { latitude: 27.503311, longitude: -109.936335 },
      { latitude: 27.51, longitude: -109.93 },
      { routes: [{}] }
    )
  ).toThrow("route_not_found");
});

test("traduce fallos de Gemini sin exponer contenido ni credenciales", () => {
  expect(
    semanticDiagnosticDetail([
      {
        outcome: "clarification",
        durationMs: 120,
        providerDurationMs: 118,
        reason: "auth",
      },
    ])
  ).toBe("Gemini rechazó la credencial configurada");
});

test("expone autenticación de Gemini en los escenarios afectados", async () => {
  const broken = dependencies();
  broken.interpreter = async () => {
    throw new Error("gemini_http_401");
  };

  const splitBatch = await runWhatsappPilotBatch({ batchIndex: 1, dependencies: broken });
  const paymentBatch = await runWhatsappPilotBatch({ batchIndex: 3, dependencies: broken });
  const split = splitBatch.results.find((item) => item.id === "split-options");
  const payment = paymentBatch.results.find((item) => item.id === "early-payment");

  expect(split).toMatchObject({
    status: "failed",
    critical: true,
    detail: "Gemini rechazó la credencial configurada",
  });
  expect(payment).toMatchObject({
    status: "failed",
    critical: true,
    detail: "Gemini rechazó la credencial configurada",
  });
});

test("usa Gemini 3.1 Flash-Lite como modelo gratuito predeterminado", () => {
  expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
});

test("clasifica errores de Gemini sin exponer el cuerpo del proveedor", () => {
  expect(
    classifyGeminiHttpFailure(400, {
      error: {
        details: [{ reason: "API_KEY_INVALID" }],
      },
    })
  ).toBe("auth");
  expect(classifyGeminiHttpFailure(400, { error: { status: "INVALID_ARGUMENT" } }))
    .toBe("invalid_request");
  expect(classifyGeminiHttpFailure(404, { error: { status: "NOT_FOUND" } }))
    .toBe("model_unavailable");
  expect(classifyGeminiHttpFailure(429, { error: { status: "RESOURCE_EXHAUSTED" } }))
    .toBe("quota");
  expect(classifyGeminiHttpFailure(503, { error: { status: "UNAVAILABLE" } }))
    .toBe("provider_error");
});

test("reintenta una vez solo los fallos temporales dentro del presupuesto", () => {
  expect(geminiRetryDelayMs({ status: 429, retryAfter: null })).toBe(350);
  expect(geminiRetryDelayMs({ status: 503, retryAfter: null })).toBe(350);
  expect(geminiRetryDelayMs({ status: 429, retryAfter: "1" })).toBe(1000);
  expect(geminiRetryDelayMs({ status: 429, retryAfter: "30" })).toBeNull();
  expect(geminiRetryDelayMs({ status: 400, retryAfter: null })).toBeNull();
  expect(geminiRetryDelayMs({ status: 403, retryAfter: null })).toBeNull();
});

test("muestra causas diferenciadas para configuración incompatible", () => {
  expect(
    semanticDiagnosticDetail([
      {
        outcome: "clarification",
        durationMs: 80,
        providerDurationMs: 75,
        reason: "invalid_request",
      },
    ])
  ).toBe("Gemini recibió una configuración incompatible");
  expect(
    semanticDiagnosticDetail([
      {
        outcome: "clarification",
        durationMs: 80,
        providerDurationMs: 75,
        reason: "model_unavailable",
      },
    ])
  ).toBe("El modelo configurado de Gemini no está disponible");
});

test("el esquema de Gemini delega los límites numéricos a la validación local", () => {
  const serialized = JSON.stringify(geminiResponseSchema());
  expect(serialized).not.toContain('"minimum"');
  expect(serialized).not.toContain('"maximum"');
  expect(serialized).not.toContain('"maxItems"');
});

test("Gemini recibe solo el producto mencionado en vez del catálogo completo", () => {
  const selected = selectGeminiCatalogItems({
    message: "Quiero un California de Res y otro de Pollo",
    catalog,
    cartProductIds: [],
    selectedCategoryId: null,
  });

  expect(selected.map((item) => item.id)).toEqual(["california"]);
});

test("Gemini conserva el producto del carrito al interpretar un reemplazo", () => {
  const selected = selectGeminiCatalogItems({
    message: "cambia la hamburguesa sencilla por hamburguesa doble",
    catalog,
    cartProductIds: ["simple"],
    selectedCategoryId: null,
  });

  expect(selected.map((item) => item.id)).toEqual(["simple", "double"]);
});
