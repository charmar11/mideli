import type { CartItem, SelectedModifier } from "@/types/database";

const POS_CART_DRAFT_VERSION = 1;
const STORAGE_KEY_PREFIX = "mideli.pos-cart-draft.v1.";

export type PosDraftOrderType = "comedor" | "domicilio" | "para_llevar";

export interface PosCartDraft {
  items: CartItem[];
  /** Random key for a POS submission whose database result is not yet confirmed. */
  creationKey?: string | null;
  orderType: PosDraftOrderType;
  tableId: string;
  tableNumber: string;
  orderNotes: string;
  scheduledFor: string | null;
  scheduledForLabel: string | null;
  kitchenReleaseAt: string | null;
}

interface StoredPosCartDraft extends PosCartDraft {
  version: typeof POS_CART_DRAFT_VERSION;
}

export type PosDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): PosDraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getStorageKey(userId: string) {
  const normalizedUserId = userId.trim();
  return normalizedUserId
    ? `${STORAGE_KEY_PREFIX}${encodeURIComponent(normalizedUserId)}`
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelectedModifier(value: unknown): value is SelectedModifier {
  if (!isRecord(value)) return false;

  return (
    typeof value.group === "string" &&
    typeof value.option === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    (value.group_id === undefined || typeof value.group_id === "string") &&
    (value.option_id === undefined || typeof value.option_id === "string") &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.combo_component_menu_item_id === undefined ||
      typeof value.combo_component_menu_item_id === "string") &&
    (value.combo_component_quantity === undefined ||
      (typeof value.combo_component_quantity === "number" &&
        Number.isFinite(value.combo_component_quantity))) &&
    (value.combo_component_is_gift === undefined ||
      typeof value.combo_component_is_gift === "boolean")
  );
}

function isCartItem(value: unknown): value is CartItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.menu_item_id === "string" &&
    (value.business_id === undefined || typeof value.business_id === "string") &&
    typeof value.name === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    value.price >= 0 &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0 &&
    typeof value.notes === "string" &&
    Array.isArray(value.selected_modifiers) &&
    value.selected_modifiers.every(isSelectedModifier)
  );
}

function isPosDraftOrderType(value: unknown): value is PosDraftOrderType {
  return value === "comedor" || value === "domicilio" || value === "para_llevar";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStoredDraft(value: unknown): value is StoredPosCartDraft {
  return (
    isRecord(value) &&
    value.version === POS_CART_DRAFT_VERSION &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(isCartItem) &&
    isPosDraftOrderType(value.orderType) &&
    typeof value.tableId === "string" &&
    typeof value.tableNumber === "string" &&
    typeof value.orderNotes === "string" &&
    isNullableString(value.scheduledFor) &&
    isNullableString(value.scheduledForLabel) &&
    isNullableString(value.kitchenReleaseAt) &&
    (value.creationKey === undefined || isNullableString(value.creationKey))
  );
}

export function readPosCartDraft(
  userId: string,
  storage: PosDraftStorage | null = getBrowserStorage()
): PosCartDraft | null {
  const key = getStorageKey(userId);
  if (!key || !storage) return null;

  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;

    const value: unknown = JSON.parse(serialized);
    if (!isStoredDraft(value)) {
      storage.removeItem(key);
      return null;
    }

    return {
      items: value.items,
      ...(value.creationKey !== undefined
        ? { creationKey: value.creationKey }
        : {}),
      orderType: value.orderType,
      tableId: value.tableId,
      tableNumber: value.tableNumber,
      orderNotes: value.orderNotes,
      scheduledFor: value.scheduledFor,
      scheduledForLabel: value.scheduledForLabel,
      kitchenReleaseAt: value.kitchenReleaseAt,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in private browsing or under quota limits.
    }
    return null;
  }
}

export function savePosCartDraft(
  userId: string,
  draft: PosCartDraft,
  storage: PosDraftStorage | null = getBrowserStorage()
) {
  const key = getStorageKey(userId);
  if (!key || !storage) return false;

  if (draft.items.length === 0 && !draft.creationKey) {
    clearPosCartDraft(userId, storage);
    return true;
  }
  if (draft.items.length === 0) return false;

  try {
    const serialized: StoredPosCartDraft = {
      ...draft,
      version: POS_CART_DRAFT_VERSION,
    };
    storage.setItem(key, JSON.stringify(serialized));
    return true;
  } catch {
    return false;
  }
}

export function clearPosCartDraft(
  userId: string,
  storage: PosDraftStorage | null = getBrowserStorage()
) {
  const key = getStorageKey(userId);
  if (!key || !storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Clearing a draft must never interrupt normal POS use.
  }
}
