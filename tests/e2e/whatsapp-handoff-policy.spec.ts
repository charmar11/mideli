import { expect, test } from "@playwright/test";
import { createConversation } from "@/lib/whatsapp/conversation-engine";
import { respectHumanHandoffSetting } from "@/lib/whatsapp/handoff-policy";
import { interactionForState } from "@/lib/whatsapp/quick-replies";

const catalog = { items: [], categories: [] };

test("la opción de atención humana controla transferencia y botones", () => {
  const state = createConversation("5216440000000");
  const handoff = {
    state: { ...state, stage: "handoff" as const },
    action: "handoff" as const,
    reply: "Una persona continuará contigo.",
  };

  expect(respectHumanHandoffSetting(handoff, state, true)).toEqual(handoff);
  const disabled = respectHumanHandoffSetting(handoff, state, false);
  expect(disabled.action).toBe("none");
  expect(disabled.state.stage).toBe("ordering");

  const interaction = interactionForState(state, catalog, {
    humanHandoffEnabled: false,
  });
  expect(interaction?.kind).toBe("buttons");
  if (interaction?.kind === "buttons") {
    expect(interaction.buttons.some((button) => button.id === "cmd:human")).toBeFalsy();
  }
});
