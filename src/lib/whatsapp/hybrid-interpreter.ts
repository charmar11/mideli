import {
  applyValidatedCartOperations,
  applyValidatedNote,
  handleConversationMessage,
  type ValidatedCartOperation,
} from "./conversation-engine";
import { findCatalogProducts } from "./catalog";
import { includesPhrase, normalizeText } from "./normalize";
import { containsSensitiveAccessData } from "./conversation-notes";
import type {
  ConversationCatalog,
  ConversationPaymentMethod,
  ConversationResult,
  ConversationServiceType,
  ConversationState,
} from "./types";

export type SemanticAction =
  | {
      kind: "cart_operation";
      operationKind: ValidatedCartOperation["kind"];
      productId: string;
      quantity: number;
      optionIds: string[];
    }
  | {
      kind: "note";
      noteKind: "delivery" | "order" | "product";
      text: string;
      productId: string | null;
    }
  | { kind: "set_service"; serviceType: ConversationServiceType }
  | { kind: "set_payment"; method: ConversationPaymentMethod }
  | { kind: "finish_order" }
  | { kind: "continue_order" }
  | { kind: "confirm_order" }
  | { kind: "show_menu" }
  | { kind: "request_human" }
  | { kind: "unknown" };

export type SemanticInterpretation = {
  intent: "cart_operations" | "note" | "finish_order" | "continue_order" | "unknown";
  confidence: number;
  operations: ValidatedCartOperation[];
  serviceType?: ConversationServiceType | null;
  note?: {
    kind: "delivery" | "order" | "product";
    text: string;
    productId: string | null;
  } | null;
  actions?: SemanticAction[];
};

export type SemanticInterpreter = (input: {
  state: ConversationState;
  message: string;
  catalog: ConversationCatalog;
}) => Promise<SemanticInterpretation>;

export type SemanticDiagnostic = {
  outcome: "local_fast_path" | "applied" | "local_fallback" | "clarification";
  durationMs: number;
  localDurationMs?: number;
  providerDurationMs?: number;
  stage?: ConversationState["stage"];
  intent?: SemanticInterpretation["intent"];
  operationCount?: number;
  reason?:
    | "low_confidence_or_invalid"
    | "timeout"
    | "quota"
    | "auth"
    | "model_unavailable"
    | "invalid_request"
    | "invalid_response"
    | "provider_error";
};

function emitDiagnostic(
  listener: ((event: SemanticDiagnostic) => void) | undefined,
  event: SemanticDiagnostic
) {
  try {
    listener?.(event);
  } catch {
    // La observabilidad nunca debe interrumpir una conversación.
  }
}

function semanticErrorReason(error: unknown): SemanticDiagnostic["reason"] {
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  const code = error instanceof Error ? error.message : "";
  if (code === "gemini_quota" || code === "gemini_http_429") return "quota";
  if (
    code === "gemini_auth" ||
    code === "gemini_http_401" ||
    code === "gemini_http_403"
  ) return "auth";
  if (code === "gemini_model_unavailable") return "model_unavailable";
  if (code === "gemini_invalid_request") return "invalid_request";
  if (code === "gemini_invalid_response" || code.startsWith("invalid_semantic_")) {
    return "invalid_response";
  }
  if (code.includes("abort") || code.includes("timeout")) return "timeout";
  return "provider_error";
}

function semanticStage(state: ConversationState) {
  return [
    "ordering",
    "browsing_catalog",
    "awaiting_beverage",
    "awaiting_fulfillment",
    "awaiting_payment",
    "awaiting_confirmation",
  ].includes(state.stage);
}

function containsPrivateCustomerData(message: string) {
  const text = normalizeText(message);
  return (
    /\b\d{7,}\b/.test(message) ||
    containsSensitiveAccessData(message) ||
    /\S+@\S+\.\S+/.test(message) ||
    /https?:\/\//i.test(message) ||
    (/\b(calle|avenida|colonia|fraccionamiento|privada|boulevard|blvd|numero|num)\b/.test(text) &&
      /\b\d{1,6}\b/.test(text)) ||
    /\b(me llamo|mi nombre es|soy el cliente|soy la cliente)\b/.test(text) ||
    /\b(clabe|cuenta bancaria|numero de cuenta)\b/.test(text)
  );
}

function semanticCustomerMessage(message: string) {
  return message
    .replace(/\b(?:(?:pago|pagaria|pagare|voy\s+a\s+pagar)\s+)?(?:en|por|con)?\s*(?:efectivo|transferencia|transfer|tarjeta)\b/gi, " ")
    .replace(/\b(?:a\s+domicilio|para\s+llevar|para\s+recoger|paso\s+por)\b/gi, " ")
    .replace(/\b(?:ser[ií]a\s+todo|eso\s+es\s+todo|ya\s+es\s+todo|nada\s+m[aá]s)\b/gi, " ")
    .replace(/[,.]\s*(?:y\s*)?$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function likelyComplexOrder(message: string) {
  const text = normalizeText(message);
  return (
    text.length >= 18 &&
    (/\b(otro|otros|otra|otras|cambia|cambiame|reemplaza|quita|elimina)\b/.test(text) ||
      (/(\by\b|,)/.test(text) && /\b(un|uno|una|dos|tres|cuatro|cinco|1|2|3|4|5)\b/.test(text)))
  );
}

function likelyNaturalNote(message: string) {
  const text = normalizeText(message);
  return /\b(sin|mitad|aparte|separado|separada|bien cocido|poco|extra|indicacion|nota)\b/.test(text);
}

function optionAliases(name: string) {
  const normalized = normalizeText(name);
  return normalized === "res" ? [normalized, "carne"] : [normalized];
}

function deterministicDistributedOptions(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const text = normalizeText(message);
  if (!/\b(otro|otra|otros|otras)\b/.test(text)) return null;
  const productMatches = findCatalogProducts(message, catalog);
  if (productMatches.length !== 1) return null;
  const productMatch = productMatches[0];
  const requiredGroups = productMatch.item.modifiers.filter(
    (group) => group.required && (group.selection_mode ?? "single") === "single"
  );
  if (requiredGroups.length !== 1) return null;
  const group = requiredGroups[0];
  const optionMatches = group.options
    .flatMap((option) =>
      optionAliases(option.name)
        .filter((alias) => includesPhrase(text, alias))
        .map((alias) => ({ option, alias, index: ` ${text} `.indexOf(` ${alias} `) }))
    )
    .filter((match, index, matches) =>
      matches.findIndex((candidate) => candidate.option.id === match.option.id) === index
    )
    .sort((left, right) => left.index - right.index);
  if (optionMatches.length < 2 || optionMatches.some((match) => !match.option.id)) return null;

  const quantity = Math.max(productMatch.quantity, optionMatches.length);
  const pending = applyValidatedCartOperations(
    state,
    [{ kind: "add", productId: productMatch.item.id, quantity, optionIds: [] }],
    catalog
  );
  if (!pending || pending.state.stage !== "awaiting_modifiers") return null;

  let canonicalMessage = text;
  for (const match of optionMatches) {
    const canonical = normalizeText(match.option.name);
    if (match.alias !== canonical) {
      canonicalMessage = ` ${canonicalMessage} `
        .replace(` ${match.alias} `, ` ${canonical} `)
        .trim();
    }
  }
  const completed = handleConversationMessage(pending.state, canonicalMessage, catalog);
  return completed.state.stage === "awaiting_modifiers" ? null : completed;
}

function deterministicActions(message: string, state: ConversationState): SemanticAction[] {
  const text = normalizeText(message);
  const actions: SemanticAction[] = [];
  if (/\b(domicilio|entrega|envio)\b/.test(text)) {
    actions.push({ kind: "set_service", serviceType: "domicilio" });
  } else if (/\b(recoger|para llevar|paso por)\b/.test(text)) {
    actions.push({ kind: "set_service", serviceType: "para_llevar" });
  }
  if (/\b(efectivo)\b/.test(text)) {
    actions.push({ kind: "set_payment", method: "efectivo" });
  } else if (/\b(transferencia|transfer)\b/.test(text)) {
    actions.push({ kind: "set_payment", method: "transferencia" });
  } else if (/\b(tarjeta)\b/.test(text)) {
    actions.push({ kind: "set_payment", method: "tarjeta" });
  }
  if (/\b(seria todo|eso es todo|ya es todo|nada mas|terminar|finalizar)\b/.test(text)) {
    actions.push({ kind: "finish_order" });
  }
  if (
    state.stage === "awaiting_confirmation" &&
    /^(?:si\s+)?confirm(?:o|ar)(?:\s+(?:el|mi)\s+pedido)?$/.test(text)
  ) {
    actions.push({ kind: "confirm_order" });
  }
  return actions;
}

function actionsForInterpretation(interpretation: SemanticInterpretation): SemanticAction[] {
  if (interpretation.actions) return interpretation.actions;
  if (interpretation.intent === "cart_operations") {
    return interpretation.operations.map((operation) => ({
      kind: "cart_operation" as const,
      operationKind: operation.kind,
      productId: operation.productId,
      quantity: operation.quantity,
      optionIds: operation.optionIds,
    }));
  }
  if (interpretation.intent === "note" && interpretation.note) {
    return [{
      kind: "note",
      noteKind: interpretation.note.kind,
      text: interpretation.note.text,
      productId: interpretation.note.productId,
    }];
  }
  if (interpretation.intent === "finish_order") return [{ kind: "finish_order" }];
  if (interpretation.intent === "continue_order") return [{ kind: "continue_order" }];
  return [{ kind: "unknown" }];
}

function mergeSemanticActions(
  interpretation: SemanticInterpretation,
  deterministic: SemanticAction[]
) {
  const inferred = actionsForInterpretation(interpretation).filter(
    (action) => action.kind !== "unknown"
  );
  const kinds = new Set<SemanticAction["kind"]>(
    inferred.map((action) => action.kind)
  );
  return [
    ...inferred.filter((action) => action.kind === "cart_operation" || action.kind === "note"),
    ...deterministic.filter((action) => !kinds.has(action.kind)),
    ...inferred.filter((action) => action.kind !== "cart_operation" && action.kind !== "note"),
  ].slice(0, 16);
}

function localMisunderstood(
  previous: ConversationState,
  result: ConversationResult
) {
  return (
    result.action === "handoff" ||
    result.state.ambiguityCount > previous.ambiguityCount ||
    result.reply.includes("No encontré ese producto")
  );
}

function cartQuantity(state: ConversationState) {
  return state.cart.reduce((total, line) => total + line.quantity, 0);
}

function localLooksComplete(
  previous: ConversationState,
  result: ConversationResult,
  message: string
) {
  if (localMisunderstood(previous, result)) return false;
  const text = normalizeText(message);
  const quantityDelta = Math.abs(cartQuantity(result.state) - cartQuantity(previous));
  if (/\b(otro|otros|otra|otras)\b/.test(text)) return quantityDelta >= 2;
  return (
    quantityDelta > 0 ||
    JSON.stringify(previous.cart) !== JSON.stringify(result.state.cart) ||
    previous.orderNotes !== result.state.orderNotes ||
    previous.deliveryNotes !== result.state.deliveryNotes
  );
}

function semanticClarification(state: ConversationState) {
  return {
    state: { ...state, stage: "ordering" as const, ambiguityCount: 0 },
    action: "none" as const,
    reply:
      "Quiero anotarlo exactamente como lo pediste 😊 Necesito confirmar cuál producto deseas, la cantidad y cómo quieres cada uno.",
  };
}

function applySemanticResult(
  state: ConversationState,
  interpretation: SemanticInterpretation,
  catalog: ConversationCatalog,
  extractedActions: SemanticAction[] = []
) {
  if (!Number.isFinite(interpretation.confidence) || interpretation.confidence < 0.65) {
    return null;
  }
  const actions = mergeSemanticActions(interpretation, extractedActions);
  if (actions.length === 0) return null;
  const cartOperations = actions
    .filter((action): action is Extract<SemanticAction, { kind: "cart_operation" }> =>
      action.kind === "cart_operation"
    )
    .map((action) => ({
      kind: action.operationKind,
      productId: action.productId,
      quantity: action.quantity,
      optionIds: action.optionIds,
    }));
  let current = state;
  let latest: ConversationResult | null = null;
  if (cartOperations.length > 0) {
    latest = applyValidatedCartOperations(current, cartOperations, catalog);
    if (!latest) return null;
    current = latest.state;
    if (current.stage === "awaiting_modifiers") return latest;
  }
  for (const action of actions) {
    if (action.kind === "cart_operation") continue;
    if (action.kind === "note") {
      latest = applyValidatedNote(current, {
        kind: action.noteKind,
        text: action.text,
        productId: action.productId,
      });
      if (!latest) return null;
      current = latest.state;
      continue;
    }
    if (action.kind === "set_service") {
      latest = handleConversationMessage(
        { ...current, stage: "ordering" },
        action.serviceType === "domicilio" ? "a domicilio" : "para recoger",
        catalog
      );
      current = latest.state;
      continue;
    }
    if (action.kind === "set_payment") {
      if (action.method === "tarjeta" && current.serviceType === "domicilio") return null;
      current = { ...current, pendingPaymentMethod: action.method };
      if (current.stage === "awaiting_payment") {
        latest = handleConversationMessage(current, action.method, catalog);
        current = latest.state;
      }
      continue;
    }
    if (action.kind === "finish_order") {
      latest = handleConversationMessage(
        { ...current, stage: "ordering" },
        "sería todo",
        catalog
      );
      current = latest.state;
      continue;
    }
    if (action.kind === "continue_order") {
      latest = handleConversationMessage(current, "sí", catalog);
      current = latest.state;
      continue;
    }
    if (action.kind === "show_menu") {
      latest = handleConversationMessage(current, "cmd:menu", catalog);
      current = latest.state;
      continue;
    }
    if (action.kind === "request_human") {
      latest = handleConversationMessage(current, "cmd:human", catalog);
      current = latest.state;
      continue;
    }
    if (action.kind === "confirm_order") {
      if (current.stage !== "awaiting_confirmation") return null;
      latest = handleConversationMessage(current, "confirmo", catalog);
      current = latest.state;
    }
  }
  return latest ?? null;
}

export async function handleHybridConversationMessage(input: {
  state: ConversationState;
  message: string;
  catalog: ConversationCatalog;
  interpreter?: SemanticInterpreter | null;
  onDiagnostic?: (event: SemanticDiagnostic) => void;
}): Promise<ConversationResult> {
  const totalStartedAt = Date.now();
  const distributed = deterministicDistributedOptions(
    input.state,
    input.message,
    input.catalog
  );
  const extractedActions = deterministicActions(input.message, input.state);
  if (distributed && extractedActions.length === 0) {
    emitDiagnostic(input.onDiagnostic, {
      outcome: "local_fast_path",
      durationMs: Date.now() - totalStartedAt,
      localDurationMs: Date.now() - totalStartedAt,
      stage: input.state.stage,
    });
    return distributed;
  }
  const localStartedAt = Date.now();
  const local = handleConversationMessage(input.state, input.message, input.catalog);
  const localDurationMs = Date.now() - localStartedAt;
  if (
    !input.interpreter ||
    !semanticStage(input.state) ||
    containsPrivateCustomerData(input.message)
  ) {
    emitDiagnostic(input.onDiagnostic, {
      outcome: "local_fast_path",
      durationMs: Date.now() - totalStartedAt,
      localDurationMs,
      stage: input.state.stage,
    });
    return local;
  }

  const shouldInterpret =
    likelyComplexOrder(input.message) ||
    likelyNaturalNote(input.message) ||
    localMisunderstood(input.state, local);
  if (!shouldInterpret) {
    emitDiagnostic(input.onDiagnostic, {
      outcome: "local_fast_path",
      durationMs: Date.now() - totalStartedAt,
      localDurationMs,
      stage: input.state.stage,
    });
    return local;
  }

  const startedAt = Date.now();
  try {
    const interpretation = await input.interpreter({
      state: input.state,
      message: semanticCustomerMessage(input.message) || input.message,
      catalog: input.catalog,
    });
    const applied = applySemanticResult(
      input.state,
      interpretation,
      input.catalog,
      extractedActions
    );
    if (applied) {
      emitDiagnostic(input.onDiagnostic, {
        outcome: "applied",
        durationMs: Date.now() - totalStartedAt,
        localDurationMs,
        providerDurationMs: Date.now() - startedAt,
        stage: input.state.stage,
        intent: interpretation.intent,
        operationCount: interpretation.operations.length,
      });
      return applied;
    }
    const useLocal = localLooksComplete(input.state, local, input.message);
    emitDiagnostic(input.onDiagnostic, {
      outcome: useLocal ? "local_fallback" : "clarification",
      durationMs: Date.now() - totalStartedAt,
      localDurationMs,
      providerDurationMs: Date.now() - startedAt,
      stage: input.state.stage,
      intent: interpretation.intent,
      operationCount: interpretation.operations.length,
      reason: "low_confidence_or_invalid",
    });
    return useLocal ? local : semanticClarification(input.state);
  } catch (error) {
    const useLocal = localLooksComplete(input.state, local, input.message);
    emitDiagnostic(input.onDiagnostic, {
      outcome: useLocal ? "local_fallback" : "clarification",
      durationMs: Date.now() - totalStartedAt,
      localDurationMs,
      providerDurationMs: Date.now() - startedAt,
      stage: input.state.stage,
      reason: semanticErrorReason(error),
    });
    return useLocal ? local : semanticClarification(input.state);
  }
}
