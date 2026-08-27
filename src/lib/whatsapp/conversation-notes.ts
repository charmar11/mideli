import { includesPhrase, normalizeText } from "./normalize";
import type { ConversationCartLine, ConversationState } from "./types";

export type DetectedConversationNote = {
  kind: "delivery" | "order" | "product";
  text: string;
  candidateLineIds: string[];
};

const ACCESS_PATTERN =
  /\b(pin|codigo|caseta|guardia|privada|porton|timbre|entrada|acceso|casa\s+(?:blanca|negra|azul|verde|roja|amarilla)|departamento|depto)\b/;
const PREPARATION_PATTERN =
  /\b(sin|mitad|aparte|separad[oa]|bien\s+cocid[oa]|poco|poquita|much[oa]|no\s+(?:le|les)?\s*pong|salsa\s+aparte|extra)\b/;
const ORDER_NOTE_PATTERN =
  /\b(nota|indicacion|observacion)\b.*\b(pedido|orden|general|todo)\b|\bpara\s+todo\s+el\s+pedido\b/;

function compactNote(value: string) {
  return value
    .trim()
    .replace(/^(?:nota|indicacion|indicación|observacion|observación)\s*(?:para|del|de)?\s*(?:todo\s+)?(?:el\s+)?(?:pedido|orden|producto)?\s*[:,-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function meaningfulProductTerms(line: ConversationCartLine) {
  const ignored = new Set(["de", "del", "la", "el", "los", "las", "una", "un"]);
  return normalizeText(line.name)
    .split(" ")
    .filter((word) => word.length >= 4 && !ignored.has(word));
}

function matchingLines(cart: ConversationCartLine[], text: string) {
  const direct = cart.filter((line) => includesPhrase(text, normalizeText(line.name)));
  if (direct.length > 0) return direct;

  return cart.filter((line) => {
    const terms = meaningfulProductTerms(line);
    return terms.some((term) => includesPhrase(text, term));
  });
}

export function detectConversationNote(
  state: ConversationState,
  message: string
): DetectedConversationNote | null {
  const text = normalizeText(message);
  const note = compactNote(message);
  if (!note || note.length < 3) return null;

  if (ACCESS_PATTERN.test(text)) {
    return { kind: "delivery", text: note, candidateLineIds: [] };
  }

  if (ORDER_NOTE_PATTERN.test(text)) {
    return { kind: "order", text: note, candidateLineIds: [] };
  }

  if (!PREPARATION_PATTERN.test(text) || state.cart.length === 0) return null;
  if (["sin bebida", "sin bebidas", "no gracias"].includes(text)) return null;

  const matched = matchingLines(state.cart, text);
  if (matched.length > 0) {
    return {
      kind: "product",
      text: note,
      candidateLineIds: matched.map((line) => line.id),
    };
  }

  const uniqueProducts = new Map(state.cart.map((line) => [line.menuItemId, line]));
  if (uniqueProducts.size === 1) {
    return {
      kind: "product",
      text: note,
      candidateLineIds: state.cart.map((line) => line.id),
    };
  }

  return {
    kind: "product",
    text: note,
    candidateLineIds: state.cart.map((line) => line.id),
  };
}

export function containsSensitiveAccessData(message: string) {
  const text = normalizeText(message);
  return ACCESS_PATTERN.test(text) && /\b\d{3,8}\b/.test(text);
}
