import { create } from "zustand";

interface UIState {
  activeCategory: string | null;
  cartOpen: boolean;
  searchQuery: string;
  setActiveCategory: (category: string | null) => void;
  setCartOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeCategory: null,
  cartOpen: false,
  searchQuery: "",

  setActiveCategory: (category) => set({ activeCategory: category }),
  setCartOpen: (open) => set({ cartOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
