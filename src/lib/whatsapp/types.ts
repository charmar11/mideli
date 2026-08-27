import type { ModifierGroup } from "@/types/database";

export type ConversationStage =
  | "ordering"
  | "browsing_catalog"
  | "awaiting_modifiers"
  | "awaiting_beverage"
  | "awaiting_fulfillment"
  | "awaiting_address"
  | "awaiting_address_reference"
  | "awaiting_delivery_quote"
  | "awaiting_address_confirmation"
  | "awaiting_payment"
  | "awaiting_cash_tendered"
  | "awaiting_confirmation"
  | "awaiting_note_target"
  | "awaiting_edit_action"
  | "awaiting_edit_item"
  | "awaiting_edit_quantity"
  | "awaiting_edit_modifier_group"
  | "awaiting_edit_modifier_option"
  | "awaiting_edit_modifier_more"
  | "awaiting_note_scope"
  | "awaiting_note_item"
  | "awaiting_note_quantity_scope"
  | "awaiting_note_text"
  | "handoff"
  | "confirmed"
  | "cancelled";

export type ConversationAction =
  | "none"
  | "handoff"
  | "request_delivery_quote"
  | "send_address_confirmation"
  | "confirm_delivery_quote"
  | "mark_customer_received"
  | "request_order_creation";

export type ConversationServiceType = "domicilio" | "para_llevar";

export type ConversationResumeStage =
  | "awaiting_fulfillment"
  | "awaiting_payment"
  | "awaiting_confirmation";

export type ConversationPayment = {
  method: "efectivo" | "tarjeta" | "transferencia";
  cashTendered: number | null;
};

export type ConversationDeliveryQuote = {
  id: string | null;
  formattedAddress: string;
  colony: string;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number;
  baseFee: number;
  surcharge: number;
  totalFee: number;
};

export type ConversationSavedAddress = {
  id: string;
  address: string;
  reference: string;
  latitude: number | null;
  longitude: number | null;
  confirmed: boolean;
};

export type ConversationAddressSource =
  | "text"
  | "shared_location"
  | "saved_confirmed"
  | "saved_unconfirmed";

export type ConversationPendingNote = {
  text: string;
  candidateLineIds: string[];
  attempts: number;
  resumeStage: ConversationStage;
};

export type ConversationEditAction =
  | "add"
  | "remove"
  | "quantity"
  | "modifiers"
  | "note"
  | "fulfillment"
  | "address"
  | "payment";

export type ConversationEditContext = {
  action: ConversationEditAction | null;
  targetLineId: string | null;
  targetGroupId: string | null;
  returnStage: "ordering" | "awaiting_confirmation";
};

export type ConversationGuidedNote = {
  scope: "product" | "order" | "delivery" | null;
  targetLineId: string | null;
  quantityScope: "all" | "one" | null;
  returnStage: "ordering" | "awaiting_confirmation";
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
  categoryId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedModifiers: ConversationModifier[];
  notes: string;
};

export type ConversationCartReconciliation = {
  state: ConversationState;
  removed: ConversationCartLine[];
  alternatives: ConversationCatalogItem[];
};

export type ConversationState = {
  phone: string;
  stage: ConversationStage;
  cart: ConversationCartLine[];
  total: number;
  pendingLineId: string | null;
  serviceType: ConversationServiceType | null;
  address: string | null;
  addressReference: string;
  addressReferenceCollected: boolean;
  addressSource: ConversationAddressSource | null;
  addressConfirmed: boolean;
  addressConfirmationAttempts: number;
  deliveryQuote: ConversationDeliveryQuote | null;
  pendingDeliveryQuote: ConversationDeliveryQuote | null;
  deliveryQuoteAttempts: number;
  savedAddress: ConversationSavedAddress | null;
  payment: ConversationPayment | null;
  orderNotes: string;
  deliveryNotes: string;
  pendingNote: ConversationPendingNote | null;
  editContext: ConversationEditContext | null;
  guidedNote: ConversationGuidedNote | null;
  beveragesOffered: boolean;
  catalogPage: number;
  selectedCategoryId: string | null;
  pendingBrowseCategoryId: string | null;
  resumeAfterBeverage: ConversationResumeStage | null;
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
  description: string;
  normalizedName: string;
  price: number;
  categoryId: string;
  categoryName: string;
  categorySortOrder: number;
  sortOrder: number;
  isBeverage: boolean;
  isAlcoholic: boolean;
  modifiers: ModifierGroup[];
};

export type ConversationCatalogCategory = {
  id: string;
  name: string;
  normalizedName: string;
  sortOrder: number;
};

export type ConversationCatalog = {
  items: ConversationCatalogItem[];
  categories: ConversationCatalogCategory[];
};

export type CatalogProductMatch = {
  item: ConversationCatalogItem;
  start: number;
  end: number;
  quantity: number;
  segment: string;
};
