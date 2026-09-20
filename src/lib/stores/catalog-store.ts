import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem } from "@/types/database";
import { removeManagedProductImage } from "@/lib/product-images";
import { useBusinessContextStore } from "./business-context-store";

interface CatalogState {
  categories: Category[];
  menuItems: MenuItem[];
  /** Business whose catalog is currently shown in the POS. */
  catalogBusinessId: string | null;
  loading: boolean;
  lastError: string | null;
  fetchCatalog: (force?: boolean) => Promise<void>;
  fetchCatalogForBusiness: (businessId: string, force?: boolean) => Promise<boolean>;
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
      | "business_id"
      | "created_at"
      | "updated_at"
    >
  ) => Promise<MenuItem | null>;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => Promise<boolean>;
  deleteMenuItem: (id: string) => Promise<boolean>;
}

let catalogRequest: Promise<void> | null = null;
let scopedCatalogRequest: Promise<boolean> | null = null;
let catalogFetchedAt = 0;
let catalogScopeKey = "";
const CATALOG_CACHE_MS = 30_000;

async function getCatalogScope() {
  const context = useBusinessContextStore.getState();
  await context.ensureLoaded();
  const nextContext = useBusinessContextStore.getState();
  return {
    businessId: nextContext.selectedBusinessId,
    legacyFallback: nextContext.legacyFallback,
    key: nextContext.legacyFallback
      ? "legacy"
      : `business:${nextContext.selectedBusinessId ?? "none"}`,
  };
}

function hasModernScope(scope: Awaited<ReturnType<typeof getCatalogScope>>) {
  return !scope.legacyFallback;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  categories: [],
  menuItems: [],
  catalogBusinessId: null,
  loading: false,
  lastError: null,

  fetchCatalogForBusiness: async (businessId: string, force = false) => {
    const context = useBusinessContextStore.getState();
    await context.ensureLoaded();
    const currentContext = useBusinessContextStore.getState();
    const business = currentContext.businesses.find(
      (candidate) => candidate.business_id === businessId
    );

    if (
      currentContext.legacyFallback ||
      !business ||
      business.business_lifecycle_status !== "active"
    ) {
      set({
        lastError: "Este negocio no está disponible para recibir pedidos.",
      });
      return false;
    }

    const requestKey = `business:${businessId}`;
    if (
      !force &&
      get().catalogBusinessId === businessId &&
      catalogScopeKey === requestKey &&
      Date.now() - catalogFetchedAt < CATALOG_CACHE_MS &&
      (get().categories.length > 0 || get().menuItems.length > 0)
    ) {
      return true;
    }

    if (catalogRequest) await catalogRequest;
    if (scopedCatalogRequest) await scopedCatalogRequest;

    if (
      !force &&
      get().catalogBusinessId === businessId &&
      catalogScopeKey === requestKey &&
      Date.now() - catalogFetchedAt < CATALOG_CACHE_MS
    ) {
      return true;
    }

    const request = (async () => {
      set({ loading: true, lastError: null });
      try {
        const supabase = createClient();
        const [categoriesResult, menuItemsResult] = await Promise.all([
          supabase
            .from("categories")
            .select("id,business_id,name,sort_order,is_active,created_at,updated_at")
            .eq("business_id", businessId)
            .order("sort_order", { ascending: true }),
          supabase
            .from("menu_items")
            .select(
              "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
            )
            .eq("business_id", businessId)
            .order("sort_order", { ascending: true }),
        ]);

        const catalogError = categoriesResult.error ?? menuItemsResult.error;
        if (catalogError) {
          set({
            lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
          });
          return false;
        }

        set({
          categories: categoriesResult.data ?? [],
          menuItems: menuItemsResult.data ?? [],
          catalogBusinessId: businessId,
          lastError: null,
        });
        catalogScopeKey = requestKey;
        catalogFetchedAt = Date.now();
        return true;
      } catch {
        set({
          lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
        });
        return false;
      } finally {
        set({ loading: false });
      }
    })();

    scopedCatalogRequest = request;
    try {
      return await request;
    } finally {
      if (scopedCatalogRequest === request) scopedCatalogRequest = null;
    }
  },

  fetchCatalog: async (force = false) => {
    const initialScope = await getCatalogScope();
    if (hasModernScope(initialScope)) {
      if (!initialScope.businessId) {
        set({
          lastError: "No hay un negocio disponible para esta cuenta.",
        });
        return;
      }
      await get().fetchCatalogForBusiness(initialScope.businessId, force);
      return;
    }

    const hasCatalog = get().categories.length > 0 || get().menuItems.length > 0;
    if (catalogRequest) return catalogRequest;
    if (!force && hasCatalog && Date.now() - catalogFetchedAt < CATALOG_CACHE_MS) {
      const scope = await getCatalogScope();
      if (scope.key === catalogScopeKey) return;
    }

    catalogRequest = (async () => {
      set({ loading: true });
      try {
        const scope = await getCatalogScope();
        if (scope.key !== catalogScopeKey) {
          catalogScopeKey = scope.key;
          catalogFetchedAt = 0;
          set({ categories: [], menuItems: [], catalogBusinessId: null });
        }

        if (hasModernScope(scope) && !scope.businessId) {
          set({
            lastError: "No hay un negocio disponible para esta cuenta.",
          });
          return;
        }

        const supabase = createClient();
        let categoriesQuery = supabase
            .from("categories")
            .select("id,business_id,name,sort_order,is_active,created_at,updated_at")
            .order("sort_order", { ascending: true });
        let menuItemsQuery = supabase
            .from("menu_items")
            .select(
              "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
            )
            .order("sort_order", { ascending: true });
        if (scope.businessId) {
          categoriesQuery = categoriesQuery.eq("business_id", scope.businessId);
          menuItemsQuery = menuItemsQuery.eq("business_id", scope.businessId);
        }

        const [categoriesResult, menuItemsResult] = await Promise.all([
          categoriesQuery,
          menuItemsQuery,
        ]);

        const catalogError = categoriesResult.error ?? menuItemsResult.error;
        if (catalogError) {
          // Conservamos el último menú usable durante una caída breve. Vaciar
          // el catálogo aquí haría parecer que no existen productos y puede
          // llevar a capturas incompletas durante el turno.
          set({
            lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
          });
          return;
        }

        set({
          categories: categoriesResult.data ?? [],
          menuItems: menuItemsResult.data ?? [],
          catalogBusinessId: scope.businessId,
          lastError: null,
        });
        catalogFetchedAt = Date.now();
      } catch {
        set({
          lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
        });
      } finally {
        set({ loading: false });
        catalogRequest = null;
      }
    })();

    return catalogRequest;
  },

  fetchCategories: async () => {
    set({ loading: true });
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) {
      set({ loading: false, lastError: "No hay un negocio disponible para esta cuenta." });
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from("categories")
      .select("id,business_id,name,sort_order,is_active,created_at,updated_at")
      .order("sort_order", { ascending: true });
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query;

    if (!error && data) {
      set({ categories: data });
    }
    set({ loading: false });
  },

  fetchMenuItems: async () => {
    set({ loading: true });
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) {
      set({ loading: false, lastError: "No hay un negocio disponible para esta cuenta." });
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from("menu_items")
      .select(
        "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
      )
      .order("sort_order", { ascending: true });
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query;

    if (!error && data) {
      set({ menuItems: data });
    }
    set({ loading: false });
  },

  subscribeToCatalog: () => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (targetBusinessId?: string | null) => {
      catalogFetchedAt = 0;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        const businessId =
          targetBusinessId === undefined
            ? get().catalogBusinessId
            : targetBusinessId;
        if (businessId && !useBusinessContextStore.getState().legacyFallback) {
          void get().fetchCatalogForBusiness(businessId, true);
        } else {
          void get().fetchCatalog();
        }
      }, 150);
    };
    const refresh = () => scheduleRefresh();
    const handleBusinessChange = () =>
      scheduleRefresh(useBusinessContextStore.getState().selectedBusinessId);
    const channel = supabase
      .channel(`catalog-updates-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        refresh
      )
      .subscribe();
    if (typeof window !== "undefined") {
      window.addEventListener("mideli:business-changed", handleBusinessChange);
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("mideli:business-changed", handleBusinessChange);
      }
      void supabase.removeChannel(channel);
    };
  },

  createCategory: async (name: string) => {
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return null;
    const supabase = createClient();
    const nextSortOrder =
      get().categories.reduce(
        (highest, category) => Math.max(highest, category.sort_order ?? 0),
        -1
      ) + 1;
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name,
        sort_order: nextSortOrder,
        ...(scope.businessId ? { business_id: scope.businessId } : {}),
      })
      .select()
      .single();

    if (!error && data) {
      set((state) => ({ categories: [...state.categories, data] }));
      return data;
    }
    return null;
  },

  updateCategory: async (id: string, updates: Partial<Category>) => {
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return false;
    const supabase = createClient();
    let query = supabase
      .from("categories")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query.select("id").maybeSingle();

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
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return false;
    const supabase = createClient();
    let query = supabase
      .from("categories")
      .delete()
      .eq("id", id);
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query.select("id").maybeSingle();

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
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return false;
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
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return null;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        ...item,
        ...(scope.businessId ? { business_id: scope.businessId } : {}),
      })
      .select()
      .single();

    if (!error && data) {
      set((state) => ({ menuItems: [...state.menuItems, data] }));
      return data;
    }
    return null;
  },

  updateMenuItem: async (id: string, updates: Partial<MenuItem>) => {
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return false;
    const supabase = createClient();
    let query = supabase
      .from("menu_items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query.select("id").maybeSingle();

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
    const scope = await getCatalogScope();
    if (hasModernScope(scope) && !scope.businessId) return false;
    const previousImage = get().menuItems.find((item) => item.id === id)?.image_url;
    const supabase = createClient();
    let query = supabase
      .from("menu_items")
      .delete()
      .eq("id", id);
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query.select("id").maybeSingle();

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
}));
