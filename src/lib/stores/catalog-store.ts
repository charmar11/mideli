import { create } from "zustand";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  MenuItem,
  MenuItemAvailabilityStatus,
} from "@/types/database";
import { removeManagedProductImage } from "@/lib/product-images";

interface CatalogState {
  categories: Category[];
  menuItems: MenuItem[];
  loading: boolean;
  fetchCatalog: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchMenuItems: () => Promise<void>;
  subscribeToCatalog: () => () => void;
  createCategory: (name: string) => Promise<Category | null>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  reorderCategories: (categoryIds: string[]) => Promise<boolean>;
  createMenuItem: (
    item: Omit<
      MenuItem,
      | "id"
      | "availability_status"
      | "available_quantity"
      | "availability_updated_at"
      | "availability_updated_by"
      | "created_at"
      | "updated_at"
    >
  ) => Promise<MenuItem | null>;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => Promise<boolean>;
  deleteMenuItem: (id: string) => Promise<boolean>;
  setMenuItemAvailability: (
    id: string,
    status: MenuItemAvailabilityStatus,
    quantity: number | null,
    source: "menu" | "kitchen" | "pos"
  ) => Promise<{ error: string | null }>;
}

let catalogRequest: Promise<void> | null = null;
let catalogFetchedAt = 0;
const CATALOG_CACHE_MS = 30_000;

export const useCatalogStore = create<CatalogState>((set, get) => ({
  categories: [],
  menuItems: [],
  loading: false,

  fetchCatalog: async () => {
    const hasCatalog = get().categories.length > 0 || get().menuItems.length > 0;
    if (catalogRequest) return catalogRequest;
    if (hasCatalog && Date.now() - catalogFetchedAt < CATALOG_CACHE_MS) return;

    catalogRequest = (async () => {
      set({ loading: true });
      try {
        const supabase = createClient();
        const [categoriesResult, menuItemsResult] = await Promise.all([
          supabase
            .from("categories")
            .select("id,name,sort_order,is_active,created_at,updated_at")
            .order("sort_order", { ascending: true }),
          supabase
            .from("menu_items")
            .select(
              "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,availability_status,available_quantity,availability_updated_at,availability_updated_by,created_at,updated_at"
            )
            .order("sort_order", { ascending: true }),
        ]);

        set({
          categories: categoriesResult.data ?? [],
          menuItems: menuItemsResult.data ?? [],
        });
        catalogFetchedAt = Date.now();
      } finally {
        set({ loading: false });
        catalogRequest = null;
      }
    })();

    return catalogRequest;
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
        "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,availability_status,available_quantity,availability_updated_at,availability_updated_by,created_at,updated_at"
      )
      .order("sort_order", { ascending: true });

    if (!error && data) {
      set({ menuItems: data });
    }
    set({ loading: false });
  },

  subscribeToCatalog: () => {
    const supabase = createClient();
    const channel = supabase
      .channel(`catalog-availability-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "menu_items" },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = payload.new as Partial<MenuItem>;
          if (!updated.id) return;
          set((state) => ({
            menuItems: state.menuItems.map((item) =>
              item.id === updated.id ? { ...item, ...updated } : item
            ),
          }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  createCategory: async (name: string) => {
    const supabase = createClient();
    const nextSortOrder =
      get().categories.reduce(
        (highest, category) => Math.max(highest, category.sort_order ?? 0),
        -1
      ) + 1;
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, sort_order: nextSortOrder })
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
    const { data, error } = await supabase
      .from("categories")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
    return true;
  },

  deleteCategory: async (id: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
      menuItems: state.menuItems.filter((m) => m.category_id !== id),
    }));
    return true;
  },

  reorderCategories: async (categoryIds: string[]) => {
    const previousCategories = get().categories;
    if (
      categoryIds.length !== previousCategories.length ||
      new Set(categoryIds).size !== previousCategories.length
    ) {
      return false;
    }

    const categoryById = new Map(
      previousCategories.map((category) => [category.id, category])
    );
    const reordered = categoryIds.map((id, index) => {
      const category = categoryById.get(id);
      return category ? { ...category, sort_order: index } : null;
    });

    if (reordered.some((category) => category === null)) {
      return false;
    }

    set({ categories: reordered as Category[] });

    const supabase = createClient();
    const { error } = await supabase.rpc("reorder_categories", {
      p_category_ids: categoryIds,
    });

    if (error) {
      set({ categories: previousCategories });
      return false;
    }

    catalogFetchedAt = Date.now();
    return true;
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
    const { data, error } = await supabase
      .from("menu_items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    set((state) => ({
      menuItems: state.menuItems.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
    return true;
  },

  deleteMenuItem: async (id: string) => {
    const previousImage = get().menuItems.find((item) => item.id === id)?.image_url;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    set((state) => ({
      menuItems: state.menuItems.filter((m) => m.id !== id),
    }));
    if (previousImage) {
      await removeManagedProductImage(previousImage).catch(() => undefined);
    }
    return true;
  },

  setMenuItemAvailability: async (id, status, quantity, source) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_menu_item_availability", {
      p_menu_item_id: id,
      p_status: status,
      p_quantity: status === "limited" ? quantity : null,
      p_source: source,
    });

    if (error || !data) {
      return {
        error: error?.message ?? "No se pudo cambiar la disponibilidad",
      };
    }

    const updated = data as MenuItem;
    set((state) => ({
      menuItems: state.menuItems.map((item) =>
        item.id === id ? { ...item, ...updated } : item
      ),
    }));
    catalogFetchedAt = Date.now();
    return { error: null };
  },
}));
