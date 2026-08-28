import { findCatalogProducts } from "./catalog";
import type { ConversationCatalog, ConversationCatalogItem } from "./types";

const MAX_GEMINI_CATALOG_ITEMS = 12;

export function selectGeminiCatalogItems(input: {
  message: string;
  catalog: ConversationCatalog;
  cartProductIds: string[];
  selectedCategoryId: string | null;
}): ConversationCatalogItem[] {
  const selected: ConversationCatalogItem[] = [];
  const selectedIds = new Set<string>();
  const addItem = (item: ConversationCatalogItem | undefined) => {
    if (!item || selectedIds.has(item.id) || selected.length >= MAX_GEMINI_CATALOG_ITEMS) return;
    selectedIds.add(item.id);
    selected.push(item);
  };

  for (const match of findCatalogProducts(input.message, input.catalog)) {
    addItem(match.item);
  }

  for (const productId of input.cartProductIds) {
    addItem(input.catalog.items.find((item) => item.id === productId));
  }

  if (selectedIds.size === 0 && input.selectedCategoryId) {
    for (const item of input.catalog.items) {
      if (item.categoryId === input.selectedCategoryId) addItem(item);
    }
  }

  return selected;
}
