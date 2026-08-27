import {
  applyValidatedCartOperations,
  handleConversationMessage,
  type ValidatedCartOperation,
} from "./conversation-engine";
import { normalizeText } from "./normalize";
import type {
  ConversationCatalog,
  ConversationResult,
  ConversationServiceType,
  ConversationState,
} from "./types";

export type SemanticInterpretation = {
  intent: "cart_operations" | "finish_order" | "continue_order" | "unknown";
  confidence: number;
  operations: ValidatedCartOperation[];
  serviceType?: ConversationServiceType | null;
};

export type SemanticInterpreter = (input: {
  state: ConversationState;
  message: string;
  catalog: ConversationCatalog;
}) => Promise<SemanticInterpretation>;

export type SemanticDiagnostic = {
  outcome: "applied" | "local_fallback" | "clarification";
  durationMs: number;
  intent?: SemanticInterpretation["intent"];
  operationCount?: number;
  reason?: "low_confidence_or_invalid" | "timeout" | "quota" | "auth" | "provider_error";
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
  if (code === "gemini_http_429") return "quota";
  if (code === "gemini_http_401" || code === "gemini_http_403") return "auth";
  if (code.includes("abort") || code.includes("timeout")) return "timeout";
  return "provider_error";
}

function semanticStage(state: ConversationState) {
  return state.stage === "ordering" || state.stage === "browsing_catalog";
}

function containsPrivateCustomerData(message: string) {
  const text = normalizeText(message);
  return (
    /\b\d{7,}\b/.test(message) ||
    /\S+@\S+\.\S+/.test(message) ||
    /https?:\/\//i.test(message) ||
    (/\b(calle|avenida|colonia|fraccionamiento|privada|boulevard|blvd|numero|num)\b/.test(text) &&
      /\b\d{1,6}\b/.test(text)) ||
    /\b(me llamo|mi nombre es|soy el cliente|soy la cliente)\b/.test(text) ||
    /\b(efectivo|tarjeta|transferencia|clabe|cuenta bancaria)\b/.test(text)
  );
}

function likelyComplexOrder(message: string) {
  const text = normalizeText(message);
  return (
    text.length >= 18 &&
    (/\b(otro|otros|otra|otras|cambia|cambiame|reemplaza|quita|elimina)\b/.test(text) ||
      (/(\by\b|,)/.test(text) && /\b(un|uno|una|dos|tres|cuatro|cinco|1|2|3|4|5)\b/.test(text)))
  );
}

function localMisunderstood(
  previous: ConversationState,
  result: ConversationResult
) {
  return (
    result.action === "handoff" ||
    result.state.ambiguityCount > previous.ambiguityCount
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
  return quantityDelta > 0 || JSON.stringify(previous.cart) !== JSON.stringify(result.state.cart);
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
  catalog: ConversationCatalog
) {
  if (!Number.isFinite(interpretation.confidence) || interpretation.confidence < 0.65) {
    return null;
  }
  if (interpretation.intent === "finish_order") {
    return handleConversationMessage(state, "sería todo", catalog);
  }
  if (interpretation.intent === "continue_order") {
    return handleConversationMessage(state, "sí", catalog);
  }
  if (interpretation.intent !== "cart_operations") return null;
  return applyValidatedCartOperations(
    state,
    interpretation.operations,
    catalog,
    interpretation.serviceType ?? null
  );
}

export async function handleHybridConversationMessage(input: {
  state: ConversationState;
  message: string;
  catalog: ConversationCatalog;
  interpreter?: SemanticInterpreter | null;
  onDiagnostic?: (event: SemanticDiagnostic) => void;
}): Promise<ConversationResult> {
  const local = handleConversationMessage(input.state, input.message, input.catalog);
  if (
    !input.interpreter ||
    !semanticStage(input.state) ||
    containsPrivateCustomerData(input.message)
  ) {
    return local;
  }

  const shouldInterpret = likelyComplexOrder(input.message) || localMisunderstood(input.state, local);
  if (!shouldInterpret) return local;

  const startedAt = Date.now();
  try {
    const interpretation = await input.interpreter({
      state: input.state,
      message: input.message,
      catalog: input.catalog,
    });
    const applied = applySemanticResult(input.state, interpretation, input.catalog);
    if (applied) {
      emitDiagnostic(input.onDiagnostic, {
        outcome: "applied",
        durationMs: Date.now() - startedAt,
        intent: interpretation.intent,
        operationCount: interpretation.operations.length,
      });
      return applied;
    }
    const useLocal = localLooksComplete(input.state, local, input.message);
    emitDiagnostic(input.onDiagnostic, {
      outcome: useLocal ? "local_fallback" : "clarification",
      durationMs: Date.now() - startedAt,
      intent: interpretation.intent,
      operationCount: interpretation.operations.length,
      reason: "low_confidence_or_invalid",
    });
    return useLocal ? local : semanticClarification(input.state);
  } catch (error) {
    const useLocal = localLooksComplete(input.state, local, input.message);
    emitDiagnostic(input.onDiagnostic, {
      outcome: useLocal ? "local_fallback" : "clarification",
      durationMs: Date.now() - startedAt,
      reason: semanticErrorReason(error),
    });
    return useLocal ? local : semanticClarification(input.state);
  }
}
