import type { ConversationState } from "./types";

export type WhatsappQuickReply = {
  id: string;
  title: string;
};

export function quickRepliesForState(state: ConversationState): WhatsappQuickReply[] {
  if (state.stage === "awaiting_beverage") {
    return [
      { id: "show_beverages", title: "Ver bebidas" },
      { id: "skip_beverage", title: "No gracias" },
    ];
  }
  if (state.stage === "awaiting_fulfillment") {
    return [
      { id: "pickup", title: "Para recoger" },
      { id: "delivery", title: "A domicilio" },
    ];
  }
  if (state.stage === "awaiting_address_confirmation") {
    return [
      { id: "confirm_address", title: "Sí, es aquí" },
      { id: "change_address", title: "Cambiar dirección" },
      { id: "human_help", title: "Hablar con alguien" },
    ];
  }
  if (state.stage === "awaiting_payment") {
    return [
      { id: "cash", title: "Efectivo" },
      { id: "transfer", title: "Transferencia" },
    ];
  }
  if (state.stage === "awaiting_confirmation") {
    return [
      { id: "confirm_order", title: "Confirmar" },
      { id: "modify_order", title: "Modificar" },
    ];
  }
  return [];
}
