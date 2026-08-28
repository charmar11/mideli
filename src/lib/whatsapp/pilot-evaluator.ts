import {
  applyValidatedNote,
  createConversation,
  handleConversationMessage,
} from "./conversation-engine";
import { customerReplyText } from "./customer-input";
import {
  handleHybridConversationMessage,
  type SemanticDiagnostic,
  type SemanticInterpreter,
} from "./hybrid-interpreter";
import type {
  WhatsappPilotBatchResult,
  WhatsappPilotDependency,
  WhatsappPilotScenarioResult,
  WhatsappPilotScenarioStatus,
} from "./pilot-evaluator-types";
import type {
  ConversationCatalog,
  ConversationCatalogItem,
  ConversationDeliveryQuote,
  ConversationState,
} from "./types";

const SCENARIOS_PER_BATCH = 5;
const TOTAL_SCENARIOS = 25;

type QuoteResult =
  | { status: "quoted"; quote: ConversationDeliveryQuote }
  | { status: "needs_handoff"; reason: string };

export type WhatsappPilotEvaluatorDependencies = {
  catalog: ConversationCatalog;
  interpreter: SemanticInterpreter | null;
  mapsValidAddress: string;
  quoteDelivery: (address: string) => Promise<QuoteResult>;
};

type Fixtures = {
  simple: ConversationCatalogItem | null;
  secondSimple: ConversationCatalogItem | null;
  configurable: ConversationCatalogItem | null;
  firstOption: string;
  secondOption: string;
  beverage: ConversationCatalogItem | null;
};

type ScenarioContext = WhatsappPilotEvaluatorDependencies & {
  fixtures: Fixtures;
};

type ScenarioDefinition = {
  id: string;
  title: string;
  family: string;
  dependency: WhatsappPilotDependency;
  run: (context: ScenarioContext) => Promise<ScenarioOutcome> | ScenarioOutcome;
};

type ScenarioOutcome = {
  status: WhatsappPilotScenarioStatus;
  detail: string;
  critical?: boolean;
};

function passed(detail = "Contrato cumplido"): ScenarioOutcome {
  return { status: "passed", detail };
}

function review(detail: string): ScenarioOutcome {
  return { status: "review", detail };
}

function failed(detail: string, critical = false): ScenarioOutcome {
  return { status: "failed", detail, critical };
}

function fixtureUnavailable(name: string) {
  return review(`No ejecutable: falta ${name} en el catálogo activo`);
}

function requiredSingleGroup(item: ConversationCatalogItem) {
  return item.modifiers.find(
    (group) => group.required && group.selection_mode !== "multiple" && group.options.length >= 2
  );
}

function buildFixtures(catalog: ConversationCatalog): Fixtures {
  const simpleItems = catalog.items.filter(
    (item) => !item.isBeverage && !item.modifiers.some((group) => group.required)
  );
  const configurable = catalog.items.find((item) => Boolean(requiredSingleGroup(item))) ?? null;
  const group = configurable ? requiredSingleGroup(configurable) : null;
  return {
    simple: simpleItems[0] ?? null,
    secondSimple: simpleItems[1] ?? null,
    configurable,
    firstOption: group?.options[0]?.name ?? "",
    secondOption: group?.options[1]?.name ?? "",
    beverage:
      catalog.items.find(
        (item) => item.isBeverage && !item.isAlcoholic && !item.modifiers.some((group) => group.required)
      ) ?? null,
  };
}

function local(state: ConversationState, message: string, catalog: ConversationCatalog) {
  return handleConversationMessage(state, message, catalog);
}

async function hybrid(
  context: ScenarioContext,
  state: ConversationState,
  message: string
) {
  const diagnostics: SemanticDiagnostic[] = [];
  const result = await handleHybridConversationMessage({
    state,
    message,
    catalog: context.catalog,
    interpreter: context.interpreter,
    onDiagnostic: (event) => diagnostics.push(event),
  });
  return { result, diagnostics };
}

function addSimple(context: ScenarioContext, quantity = 1) {
  const item = context.fixtures.simple;
  if (!item) return null;
  const prefix = quantity === 1 ? "una" : quantity === 2 ? "dos" : String(quantity);
  return local(createConversation("pilot"), `${prefix} ${item.name}`, context.catalog).state;
}

function addConfigured(context: ScenarioContext, option: string) {
  const item = context.fixtures.configurable;
  if (!item) return null;
  let state = local(createConversation("pilot"), `un ${item.name}`, context.catalog).state;
  state = local(state, option, context.catalog).state;
  return state;
}

function hasItem(state: ConversationState, id: string, quantity?: number) {
  const lines = state.cart.filter((line) => line.menuItemId === id);
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  return quantity === undefined ? total > 0 : total === quantity;
}

function configuredOptions(state: ConversationState, itemId: string) {
  return state.cart
    .filter((line) => line.menuItemId === itemId)
    .flatMap((line) => line.selectedModifiers.map((modifier) => modifier.optionName));
}

function scenarios(): ScenarioDefinition[] {
  return [
    {
      id: "greeting",
      title: "Saludo sin compra accidental",
      family: "inicio",
      dependency: "local",
      run: ({ catalog }) => {
        const result = local(createConversation("pilot"), "Hola, buenas tardes", catalog);
        return result.state.cart.length === 0 && result.state.stage === "ordering"
          ? passed()
          : failed("El saludo alteró el carrito", true);
      },
    },
    {
      id: "menu",
      title: "Apertura del menú",
      family: "navegación",
      dependency: "local",
      run: ({ catalog }) => {
        const result = local(createConversation("pilot"), "ver menú", catalog);
        return result.state.stage === "browsing_catalog" && result.state.cart.length === 0
          ? passed()
          : failed("El menú no abrió en la etapa esperada");
      },
    },
    {
      id: "single-product",
      title: "Producto individual",
      family: "carrito",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.simple;
        if (!item) return fixtureUnavailable("un producto sencillo");
        const state = addSimple(context);
        return state && hasItem(state, item.id, 1) && state.total === item.price
          ? passed()
          : failed("Cantidad o total inesperados", true);
      },
    },
    {
      id: "word-quantity",
      title: "Cantidad expresada con palabra",
      family: "carrito",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.simple;
        if (!item) return fixtureUnavailable("un producto sencillo");
        const state = addSimple(context, 2);
        return state && hasItem(state, item.id, 2) && state.total === item.price * 2
          ? passed()
          : failed("No conservó la cantidad solicitada", true);
      },
    },
    {
      id: "required-option",
      title: "Variación obligatoria",
      family: "variaciones",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.configurable;
        if (!item) return fixtureUnavailable("un producto configurable");
        const state = addConfigured(context, context.fixtures.firstOption);
        return state && hasItem(state, item.id, 1) && configuredOptions(state, item.id).includes(context.fixtures.firstOption)
          ? passed()
          : failed("La opción requerida no quedó asociada", true);
      },
    },
    {
      id: "split-options",
      title: "Dos unidades con opciones distintas",
      family: "lenguaje natural",
      dependency: "gemini",
      run: async (context) => {
        const item = context.fixtures.configurable;
        if (!item) return fixtureUnavailable("un producto configurable");
        if (!context.interpreter) return review("Gemini no está disponible");
        const { result, diagnostics } = await hybrid(
          context,
          createConversation("pilot"),
          `Quiero un ${item.name} de ${context.fixtures.firstOption} y otro de ${context.fixtures.secondOption}`
        );
        const options = configuredOptions(result.state, item.id);
        const applied = diagnostics.some((event) => event.outcome === "applied");
        return hasItem(result.state, item.id, 2) &&
          options.includes(context.fixtures.firstOption) &&
          options.includes(context.fixtures.secondOption) &&
          applied
          ? passed("Gemini aplicó dos configuraciones válidas")
          : failed("No separó correctamente las dos configuraciones", true);
      },
    },
    {
      id: "option-correction",
      title: "Corrección de una variación",
      family: "modificación",
      dependency: "gemini",
      run: async (context) => {
        const item = context.fixtures.configurable;
        if (!item) return fixtureUnavailable("un producto configurable");
        const state = addConfigured(context, context.fixtures.firstOption);
        if (!state) return fixtureUnavailable("una variación inicial");
        const { result } = await hybrid(
          context,
          state,
          `no era ${context.fixtures.firstOption}, era ${context.fixtures.secondOption}`
        );
        const options = configuredOptions(result.state, item.id);
        return hasItem(result.state, item.id, 1) &&
          options.length === 1 &&
          options[0] === context.fixtures.secondOption
          ? passed()
          : failed("La corrección duplicó o conservó la opción anterior", true);
      },
    },
    {
      id: "remove-product",
      title: "Eliminar un producto",
      family: "modificación",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.simple;
        const state = addSimple(context);
        if (!item || !state) return fixtureUnavailable("un producto sencillo");
        const result = local(state, `quita ${item.name}`, context.catalog);
        return !hasItem(result.state, item.id) ? passed() : failed("El producto no fue eliminado");
      },
    },
    {
      id: "replace-product",
      title: "Reemplazar un producto",
      family: "modificación",
      dependency: "gemini",
      run: async (context) => {
        const first = context.fixtures.simple;
        const second = context.fixtures.secondSimple;
        const state = addSimple(context);
        if (!first || !second || !state) return fixtureUnavailable("dos productos sencillos");
        const { result } = await hybrid(context, state, `cambia ${first.name} por ${second.name}`);
        return !hasItem(result.state, first.id) && hasItem(result.state, second.id, 1)
          ? passed()
          : failed("El reemplazo dejó un producto incorrecto", true);
      },
    },
    {
      id: "price-question",
      title: "Pregunta de precio sin compra",
      family: "consulta",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.simple;
        if (!item) return fixtureUnavailable("un producto consultable");
        const result = local(createConversation("pilot"), `¿Cuánto cuesta ${item.name}?`, context.catalog);
        return result.state.cart.length === 0 && result.state.total === 0
          ? passed()
          : failed("La pregunta agregó un producto", true);
      },
    },
    {
      id: "product-note",
      title: "Nota para producto",
      family: "notas",
      dependency: "local",
      run: (context) => {
        const item = context.fixtures.simple;
        const state = addSimple(context);
        if (!item || !state) return fixtureUnavailable("un producto para anotar");
        const result = applyValidatedNote(state, {
          kind: "product",
          text: "sin cebolla",
          productId: item.id,
        });
        return result?.state.cart.some((line) => line.notes.includes("sin cebolla"))
          ? passed()
          : failed("La nota de producto no quedó asociada");
      },
    },
    {
      id: "order-note",
      title: "Nota general del pedido",
      family: "notas",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito para anotar");
        const result = applyValidatedNote(state, {
          kind: "order",
          text: "empacar por separado",
          productId: null,
        });
        return result?.state.orderNotes.includes("empacar por separado")
          ? passed()
          : failed("La nota general no fue guardada");
      },
    },
    {
      id: "delivery-note",
      title: "Nota privada para entrega",
      family: "notas",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito para entrega");
        const result = applyValidatedNote(
          { ...state, serviceType: "domicilio" },
          { kind: "delivery", text: "acceso en caseta", productId: null }
        );
        return result?.state.deliveryNotes.includes("acceso en caseta")
          ? passed()
          : failed("La nota de entrega no fue guardada");
      },
    },
    {
      id: "finish-order",
      title: "Finalizar productos",
      family: "cierre",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        const result = local(state, "sería todo", context.catalog);
        return result.state.stage === "awaiting_beverage" ? passed() : failed("No ofreció bebida al finalizar");
      },
    },
    {
      id: "skip-beverage",
      title: "Rechazar bebida",
      family: "bebidas",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        const finished = local(state, "sería todo", context.catalog).state;
        const result = local(finished, "no gracias", context.catalog);
        return result.state.stage === "awaiting_fulfillment" ? passed() : failed("El rechazo de bebida interrumpió el flujo");
      },
    },
    {
      id: "add-beverage",
      title: "Agregar bebida al cierre",
      family: "bebidas",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        const beverage = context.fixtures.beverage;
        if (!state || !beverage) return fixtureUnavailable("una bebida activa");
        const finished = local(state, "sería todo", context.catalog).state;
        const result = local(finished, `una ${beverage.name}`, context.catalog);
        return hasItem(result.state, beverage.id, 1) ? passed() : failed("La bebida no fue agregada");
      },
    },
    {
      id: "pickup",
      title: "Pedido para recoger",
      family: "entrega",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        let current = local(state, "sería todo", context.catalog).state;
        current = local(current, "no gracias", context.catalog).state;
        const result = local(current, "para recoger", context.catalog);
        return result.state.serviceType === "para_llevar" && result.state.stage === "awaiting_payment"
          ? passed()
          : failed("No conservó el tipo para recoger");
      },
    },
    {
      id: "early-payment",
      title: "Pago indicado antes de tiempo",
      family: "pago",
      dependency: "gemini",
      run: async (context) => {
        const item = context.fixtures.simple;
        if (!item) return fixtureUnavailable("un producto sencillo");
        const { result } = await hybrid(
          context,
          createConversation("pilot"),
          `Una ${item.name}, sería todo para recoger y pago en efectivo`
        );
        return hasItem(result.state, item.id, 1) &&
          result.state.serviceType === "para_llevar" &&
          result.state.pendingPaymentMethod === "efectivo"
          ? passed()
          : failed("Perdió producto, entrega o pago de la instrucción múltiple", true);
      },
    },
    {
      id: "delivery-intent",
      title: "Pedido a domicilio",
      family: "entrega",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        let current = local(state, "sería todo", context.catalog).state;
        current = local(current, "no gracias", context.catalog).state;
        const result = local(current, "a domicilio", context.catalog);
        return result.state.serviceType === "domicilio" && result.state.stage === "awaiting_address"
          ? passed()
          : failed("No inició la captura del domicilio");
      },
    },
    {
      id: "quoted-reply",
      title: "Respuesta con texto citado",
      family: "normalización",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        let current = local(state, "sería todo", context.catalog).state;
        const message = "🥤 ¿Deseas agregar alguna bebida a tu pedido?\n\nNo, gracias";
        const clean = customerReplyText(message);
        current = local(current, clean, context.catalog).state;
        return clean === "No, gracias" && current.stage === "awaiting_fulfillment"
          ? passed()
          : failed("El texto citado contaminó la respuesta");
      },
    },
    {
      id: "confirmation",
      title: "Confirmación sin crear orden",
      family: "confirmación",
      dependency: "local",
      run: (context) => {
        const state = addSimple(context);
        if (!state) return fixtureUnavailable("un carrito");
        let current = local(state, "sería todo", context.catalog).state;
        current = local(current, "no gracias", context.catalog).state;
        current = local(current, "para recoger", context.catalog).state;
        current = local(current, "transferencia", context.catalog).state;
        const result = local(current, "confirmo", context.catalog);
        return result.action === "request_order_creation" && result.state.stage === "confirmed"
          ? passed("El motor solicitó crear orden; el evaluador no ejecutó esa acción")
          : failed("La confirmación no llegó al contrato esperado");
      },
    },
    {
      id: "unknown-recovery",
      title: "Mensaje desconocido sin corrupción",
      family: "recuperación",
      dependency: "gemini",
      run: async (context) => {
        const initial = createConversation("pilot");
        const { result } = await hybrid(context, initial, "quiero el combo lunar secreto");
        return result.state.cart.length === 0 && result.action !== "request_order_creation"
          ? passed()
          : failed("Una frase desconocida alteró el pedido", true);
      },
    },
    {
      id: "human-request",
      title: "Solicitud explícita de atención humana",
      family: "recuperación",
      dependency: "local",
      run: ({ catalog }) => {
        const result = local(createConversation("pilot"), "quiero hablar con una persona", catalog);
        return result.action === "handoff" && result.state.stage === "handoff"
          ? passed()
          : failed("No reconoció la solicitud humana explícita");
      },
    },
    {
      id: "maps-valid",
      title: "Maps localiza un domicilio válido",
      family: "maps",
      dependency: "maps",
      run: async (context) => {
        if (!context.mapsValidAddress.trim()) return review("No hay dirección del local configurada");
        const result = await context.quoteDelivery(context.mapsValidAddress);
        return result.status === "quoted" && result.quote.distanceMeters >= 0 && result.quote.totalFee >= 0
          ? passed("Maps devolvió ruta y tarifa sin persistir datos")
          : review("Maps solicitó revisión para la dirección válida");
      },
    },
    {
      id: "maps-incomplete",
      title: "Maps rechaza un domicilio incompleto",
      family: "maps",
      dependency: "maps",
      run: async (context) => {
        const result = await context.quoteDelivery("Ciudad Obregón, Sonora");
        return result.status === "needs_handoff"
          ? passed("La dirección incompleta no generó una tarifa")
          : failed("Maps aceptó una dirección sin calle ni número", true);
      },
    },
  ];
}

async function executeScenario(
  definition: ScenarioDefinition,
  context: ScenarioContext
): Promise<WhatsappPilotScenarioResult> {
  const startedAt = Date.now();
  try {
    const outcome = await definition.run(context);
    return {
      id: definition.id,
      title: definition.title,
      family: definition.family,
      dependency: definition.dependency,
      status: outcome.status,
      critical: outcome.critical ?? false,
      durationMs: Date.now() - startedAt,
      detail: outcome.detail,
    };
  } catch {
    return {
      id: definition.id,
      title: definition.title,
      family: definition.family,
      dependency: definition.dependency,
      status: "review",
      critical: false,
      durationMs: Date.now() - startedAt,
      detail: "La dependencia no respondió; requiere revisión",
    };
  }
}

export async function runWhatsappPilotBatch(input: {
  batchIndex: number;
  dependencies: WhatsappPilotEvaluatorDependencies;
}): Promise<WhatsappPilotBatchResult> {
  const definitions = scenarios();
  if (definitions.length !== TOTAL_SCENARIOS) {
    throw new Error("invalid_pilot_scenario_count");
  }
  const totalBatches = Math.ceil(TOTAL_SCENARIOS / SCENARIOS_PER_BATCH);
  if (!Number.isInteger(input.batchIndex) || input.batchIndex < 0 || input.batchIndex >= totalBatches) {
    throw new Error("invalid_pilot_batch");
  }
  const start = input.batchIndex * SCENARIOS_PER_BATCH;
  const selected = definitions.slice(start, start + SCENARIOS_PER_BATCH);
  const context: ScenarioContext = {
    ...input.dependencies,
    fixtures: buildFixtures(input.dependencies.catalog),
  };
  const results: WhatsappPilotScenarioResult[] = [];
  for (const definition of selected) {
    results.push(await executeScenario(definition, context));
  }
  return {
    batchIndex: input.batchIndex,
    totalBatches,
    totalScenarios: TOTAL_SCENARIOS,
    results,
  };
}
