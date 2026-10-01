import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem } from "@/types/database";
import { removeManagedProductImage } from "@/lib/product-images";
import {
  BUSINESS_CATALOG_CACHE_MS,
  cacheBusinessCatalog,
  clearBusinessCatalogCache,
  readBusinessCatalog,
} from "@/lib/catalog-cache";
import { useBusinessContextStore } from "./business-context-store";

interface CatalogState {
  categories: Category[];
  menuItems: MenuItem[];
  /** Business whose catalog is currently shown in the POS. */
  catalogBusinessId: string | null;
  loading: boolean;
  lastError: string | null;
  clearCatalog: () => void;
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
const scopedCatalogRequests = new Map<string, Promise<boolean>>();
let catalogFetchedAt = 0;
let catalogScopeKey = "";
let catalogDisplayRequestId = 0;
let catalogCacheRevision = 0;
const CATALOG_CACHE_MS = BUSINESS_CATALOG_CACHE_MS;
const MENU_ITEM_SELECT =
  "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,is_combo,combo_definition,sale_mode,image_url,created_at,updated_at";
const MENU_ITEM_COMBO_SELECT =
  "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,is_combo,combo_definition,image_url,created_at,updated_at";
const MENU_ITEM_LEGACY_SELECT =
  "id,business_id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at";

function isMissingComboColumns(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    (message.includes("is_combo") || message.includes("combo_definition"))
  );
}

function isMissingSaleModeColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    message.includes("sale_mode")
  );
}

async function loadMenuItems(
  supabase: ReturnType<typeof createClient>,
  businessId?: string
) {
  const load = async (selection: string) => {
    let query = supabase
      .from("menu_items")
      .select(selection)
      .order("sort_order", { ascending: true });
    if (businessId) query = query.eq("business_id", businessId);
    return query;
  };

  let result = await load(MENU_ITEM_SELECT);
  if (result.error && isMissingSaleModeColumn(result.error)) {
    result = await load(MENU_ITEM_COMBO_SELECT);
  }
  if (result.error && isMissingComboColumns(result.error)) {
    result = await load(MENU_ITEM_LEGACY_SELECT);
  }
  if (result.error) return result;

  return {
    ...result,
    data: (result.data ?? []).map((item: MenuItem) => ({
      ...item,
      is_combo: Boolean(item.is_combo),
      sale_mode: item.sale_mode ?? "both",
      combo_definition: item.combo_definition ?? {
        fixed_components: [],
        choice_groups: [],
      },
    })),
  };
}

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

function canLoadBusinessCatalog(business: {
  business_license_available?: boolean;
  business_lifecycle_status: string;
  capability_codes: string[];
}) {
  return (
    business.business_license_available === true ||
    (business.business_lifecycle_status === "draft" &&
      business.capability_codes.includes("business.manage_catalog"))
  );
}

function invalidateCatalogCache(businessId?: string | null) {
  catalogCacheRevision += 1;
  clearBusinessCatalogCache(businessId ?? undefined);
  catalogFetchedAt = 0;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  categories: [],
  menuItems: [],
  catalogBusinessId: null,
  loading: false,
  lastError: null,

  clearCatalog: () => {
    catalogDisplayRequestId += 1;
    invalidateCatalogCache();
    catalogScopeKey = "";
    set({
      categories: [],
      menuItems: [],
      catalogBusinessId: null,
      loading: false,
      lastError: null,
    });
  },

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
      !canLoadBusinessCatalog(business)
    ) {
      get().clearCatalog();
      set({
        lastError: "Este negocio no está disponible para mostrar su menú.",
      });
      return false;
    }

    const requestKey = `business:${businessId}`;
    const requestId = ++catalogDisplayRequestId;
    if (force) invalidateCatalogCache(businessId);

    if (
      !force &&
      get().catalogBusinessId === businessId &&
      catalogScopeKey === requestKey &&
      Date.now() - catalogFetchedAt < CATALOG_CACHE_MS &&
      (get().categories.length > 0 || get().menuItems.length > 0)
    ) {
      return true;
    }

    const cachedCatalog = force
      ? null
      : readBusinessCatalog<Category, MenuItem>(businessId);
    if (cachedCatalog) {
      set({
        categories: cachedCatalog.categories,
        menuItems: cachedCatalog.menuItems,
        catalogBusinessId: businessId,
        loading: false,
        lastError: null,
      });
      catalogScopeKey = requestKey;
      catalogFetchedAt = Date.now();
      return true;
    }

    const pendingRequest = scopedCatalogRequests.get(businessId);
    if (pendingRequest) {
      const pendingResult = await pendingRequest;
      if (requestId !== catalogDisplayRequestId) return pendingResult;

      const refreshedCatalog = readBusinessCatalog<Category, MenuItem>(businessId);
      if (refreshedCatalog) {
        set({
          categories: refreshedCatalog.categories,
          menuItems: refreshedCatalog.menuItems,
          catalogBusinessId: businessId,
          loading: false,
          lastError: null,
        });
        catalogScopeKey = requestKey;
        catalogFetchedAt = Date.now();
        if (!force) return true;
      } else if (!force) {
        set({
          loading: false,
          lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
        });
        return pendingResult;
      }
    }

    const requestCacheRevision = catalogCacheRevision;
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
          loadMenuItems(supabase, businessId),
        ]);

        const catalogError = categoriesResult.error ?? menuItemsResult.error;
        if (catalogError) {
          if (requestId === catalogDisplayRequestId) {
            set({
              lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
            });
          }
          return false;
        }

        const catalog = {
          categories: categoriesResult.data ?? [],
          menuItems: menuItemsResult.data ?? [],
        };
        if (requestCacheRevision === catalogCacheRevision) {
          cacheBusinessCatalog(businessId, catalog);
        }
        if (requestId === catalogDisplayRequestId) {
          set({
            ...catalog,
            catalogBusinessId: businessId,
            lastError: null,
          });
          catalogScopeKey = requestKey;
          catalogFetchedAt = Date.now();
        }
        return true;
      } catch {
        if (requestId === catalogDisplayRequestId) {
          set({
            lastError: "No se pudo actualizar el menú. Mostramos la última versión.",
          });
        }
        return false;
      } finally {
        if (requestId === catalogDisplayRequestId) set({ loading: false });
      }
    })();

    scopedCatalogRequests.set(businessId, request);
    try {
      return await request;
    } finally {
      if (scopedCatalogRequests.get(businessId) === request) {
        scopedCatalogRequests.delete(businessId);
      }
    }
  },

  fetchCatalog: async (force = false) => {
    const initialScope = await getCatalogScope();
    if (hasModernScope(initialScope)) {
      if (!initialScope.businessId) {
        get().clearCatalog();
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
        if (scope.businessId) {
          categoriesQuery = categoriesQuery.eq("business_id", scope.businessId);
        }

        const [categoriesResult, menuItemsResult] = await Promise.all([
          categoriesQuery,
          loadMenuItems(supabase, scope.businessId ?? undefined),
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
    if (scope.businessId && !scope.legacyFallback) {
      const business = useBusinessContextStore.getState().businesses.find(
        (candidate) => candidate.business_id === scope.businessId,
      );
      if (!business || !canLoadBusinessCatalog(business)) {
        set({ categories: [], loading: false, lastError: "Este negocio no está disponible para mostrar su menú." });
        return;
      }
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
    if (scope.businessId && !scope.legacyFallback) {
      const business = useBusinessContextStore.getState().businesses.find(
        (candidate) => candidate.business_id === scope.businessId,
      );
      if (!business || !canLoadBusinessCatalog(business)) {
        set({ menuItems: [], loading: false, lastError: "Este negocio no está disponible para mostrar su menú." });
        return;
      }
    }
    const supabase = createClient();
    const { data, error } = await loadMenuItems(
      supabase,
      scope.businessId ?? undefined
    );

    if (!error && data) {
      set({ menuItems: data });
    }
    set({ loading: false });
  },

  subscribeToCatalog: () => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (targetBusinessId?: string | null) => {
      invalidateCatalogCache();
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
      invalidateCatalogCache(scope.businessId);
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

    invalidateCatalogCache(scope.businessId);
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

    invalidateCatalogCache(scope.businessId);
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

    invalidateCatalogCache(scope.businessId);
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
      invalidateCatalogCache(scope.businessId);
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

    invalidateCatalogCache(scope.businessId);
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

    invalidateCatalogCache(scope.businessId);
    set((state) => ({
      menuItems: state.menuItems.filter((m) => m.id !== id),
    }));
    if (previousImage) {
      await removeManagedProductImage(previousImage).catch(() => undefined);
    }
    return true;
  },
}));
