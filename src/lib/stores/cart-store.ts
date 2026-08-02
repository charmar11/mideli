import { create } from "zustand";
import type { CartItem, SelectedModifier } from "@/types/database";

interface CartState {
  items: CartItem[];
  addItem: (
    menuItemId: string,
    name: string,
    price: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateNotes: (id: string, notes: string) => void;
  setItems: (items: CartItem[]) => void;
  clear: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (menuItemId, name, price, selectedModifiers, notes = "") => {
    const existingIndex = get().items.findIndex(
      (item) =>
        item.menu_item_id === menuItemId &&
        JSON.stringify(item.selected_modifiers) === JSON.stringify(selectedModifiers)
    );

    if (existingIndex >= 0) {
      set((state) => {
        const newItems = [...state.items];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
        };
        return { items: newItems };
      });
    } else {
      const newItem: CartItem = {
        id: crypto.randomUUID(),
        menu_item_id: menuItemId,
        name,
        price,
        quantity: 1,
        notes,
        selected_modifiers: selectedModifiers,
      };
      set((state) => ({ items: [...state.items, newItem] }));
    }
  },

  removeItem: (id: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  updateQuantity: (id: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(id);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, quantity } : item
      ),
    }));
  },

  updateNotes: (id: string, notes: string) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, notes } : item
      ),
    }));
  },

  setItems: (items: CartItem[]) => {
    set({ items });
  },

  clear: () => {
    set({ items: [] });
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => {
      const modifiersTotal = item.selected_modifiers.reduce(
        (modSum, mod) => modSum + mod.price,
        0
      );
      return sum + (item.price + modifiersTotal) * item.quantity;
    }, 0);
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
