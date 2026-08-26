import type { ModifierGroup } from "@/types/database";

export type ConversationStage =
  | "ordering"
  | "awaiting_modifiers"
  | "awaiting_fulfillment"
  | "awaiting_address"
  | "awaiting_payment"
  | "awaiting_confirmation"
  | "handoff"
  | "confirmed"
  | "cancelled";

export type ConversationAction =
  | "none"
  | "handoff"
  | "request_order_creation";

export type ConversationServiceType = "domicilio" | "para_llevar";

export type ConversationPayment = {
  method: "efectivo" | "tarjeta" | "transferencia";
  cashTendered: number | null;
};

export type ConversationModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
};

export type ConversationCartLine = {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedModifiers: ConversationModifier[];
  notes: string;
};

export type ConversationState = {
  phone: string;
  stage: ConversationStage;
  cart: ConversationCartLine[];
  total: number;
  pendingLineId: string | null;
  serviceType: ConversationServiceType | null;
  address: string | null;
  payment: ConversationPayment | null;
  ambiguityCount: number;
  nextLineNumber: number;
};

export type ConversationResult = {
  state: ConversationState;
  reply: string;
  action: ConversationAction;
};

export type ConversationCatalogItem = {
  id: string;
  name: string;
  normalizedName: string;
  price: number;
  modifiers: ModifierGroup[];
};

export type ConversationCatalog = {
  items: ConversationCatalogItem[];
};

export type CatalogProductMatch = {
  item: ConversationCatalogItem;
  start: number;
  end: number;
  quantity: number;
  segment: string;
};
