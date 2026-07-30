import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem } from "@/types/database";

interface CatalogState {
  categories: Category[];
  menuItems: MenuItem[];
  loading: boolean;
  fetchCatalog: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchMenuItems: () => Promise<void>;
  createCategory: (name: string) => Promise<Category | null>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  createMenuItem: (item: Omit<MenuItem, "id" | "created_at" | "updated_at">) => Promise<MenuItem | null>;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (id: string) => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  categories: [],
  menuItems: [],
  loading: false,

  fetchCatalog: async () => {
    set({ loading: true });
    const supabase = createClient();
    const [categoriesResult, menuItemsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,sort_order,is_active,created_at,updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("menu_items")
        .select(
          "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
        )
        .order("sort_order", { ascending: true }),
    ]);

    set({
      categories: categoriesResult.data ?? [],
      menuItems: menuItemsResult.data ?? [],
      loading: false,
    });
  },

  fetchCategories: async () => {
    set({ loading: true });
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,sort_order,is_active,created_at,updated_at")
      .order("sort_order", { ascending: true });

    if (!error && data) {
      set({ categories: data });
    }
    set({ loading: false });
  },

  fetchMenuItems: async () => {
    set({ loading: true });
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .select(
        "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
      )
      .order("sort_order", { ascending: true });

    if (!error && data) {
      set({ menuItems: data });
    }
    set({ loading: false });
  },

  createCategory: async (name: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .insert({ name })
      .select()
      .single();

    if (!error && data) {
      set((state) => ({ categories: [...state.categories, data] }));
      return data;
    }
    return null;
  },

  updateCategory: async (id: string, updates: Partial<Category>) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("categories")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      set((state) => ({
        categories: state.categories.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
    }
  },

  deleteCategory: async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id);

    if (!error) {
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
        menuItems: state.menuItems.filter((m) => m.category_id !== id),
      }));
    }
  },

  createMenuItem: async (item) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .insert(item)
      .select()
      .single();

    if (!error && data) {
      set((state) => ({ menuItems: [...state.menuItems, data] }));
      return data;
    }
    return null;
  },

  updateMenuItem: async (id: string, updates: Partial<MenuItem>) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("menu_items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      set((state) => ({
        menuItems: state.menuItems.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      }));
    }
  },

  deleteMenuItem: async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id);

    if (!error) {
      set((state) => ({
        menuItems: state.menuItems.filter((m) => m.id !== id),
      }));
    }
  },
}));
