import type { ConversationResult, ConversationState } from "./types";

export function respectHumanHandoffSetting(
  result: ConversationResult,
  previousState: ConversationState,
  enabled: boolean
): ConversationResult {
  if (enabled || result.action !== "handoff") return result;
  return {
    state: {
      ...result.state,
      stage: previousState.stage === "handoff" ? "ordering" : previousState.stage,
    },
    action: "none",
    reply:
      "No pude resolver esa parte con seguridad. Escríbeme solo el producto, cambio o dato que deseas indicar y lo intentamos de nuevo 😊",
  };
}

