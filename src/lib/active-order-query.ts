import { normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";
import type { Order, OrderItem } from "@/types/database";

export const ACTIVE_ORDER_ITEMS_SELECT =
  "order_items!order_items_order_id_fkey(id,order_id,menu_item_id,quantity,unit_price,notes,selected_modifiers,created_at,menu_items!order_items_menu_item_id_fkey(name))";

type EmbeddedOrderItem = OrderItem & {
  menu_items?: { name?: string } | { name?: string }[] | null;
};

export type ActiveOrderRow = Order & {
  order_items?: EmbeddedOrderItem[] | null;
};

export type ActiveOrderWithItems = Order & {
  items: Array<OrderItem & { menu_item_name?: string }>;
};

function relatedMenuItemName(item: EmbeddedOrderItem) {
  const relatedMenuItem = item.menu_items;
  const relatedName = Array.isArray(relatedMenuItem)
    ? relatedMenuItem[0]?.name
    : relatedMenuItem?.name;

  return relatedName?.trim() || null;
}

export function mapActiveOrderRows(
  rows: readonly ActiveOrderRow[],
  menuItemsMap: ReadonlyMap<string, string>
): ActiveOrderWithItems[] {
  return rows.map(({ order_items: embeddedItems, ...order }) => ({
    ...order,
    items: (embeddedItems ?? []).map((item) => ({
      ...item,
      selected_modifiers: normalizeWhatsappPosModifiers(item.selected_modifiers),
      menu_item_name:
        relatedMenuItemName(item) ??
        menuItemsMap.get(item.menu_item_id) ??
        "Producto eliminado",
    })),
  }));
}
