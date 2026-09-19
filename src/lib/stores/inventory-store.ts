import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type {
  InventoryCount,
  InventoryCountLine,
  InventoryItem,
  InventoryLot,
  InventoryMovement,
  InventoryMovementType,
  InventoryPurchaseOrder,
  InventoryPurchaseOrderLine,
  InventoryRecipe,
} from "@/types/database";
import { useBusinessContextStore } from "./business-context-store";

export type CountSubmissionLine = {
  line_id: string;
  counted_stock: number;
  reason_code: string;
  note: string;
};

export type PurchaseDraftLine = {
  inventory_item_id: string;
  ordered_purchase_quantity: number;
  expected_package_cost: number;
};

export type ReceiptDraftLine = {
  purchase_order_line_id: string | null;
  inventory_item_id: string;
  received_purchase_quantity: number;
  total_cost: number;
  expires_on: string | null;
  storage_location: string;
  update_reference_price: boolean;
};

export type InventoryItemDeletionResult = {
  id: string;
  name: string;
  recipes: number;
  movements: number;
  lots: number;
  count_lines: number;
  receipt_lines: number;
  purchase_lines: number;
};

type ActionResult<T = undefined> = {
  data: T | null;
  error: string | null;
};

interface InventoryState {
  items: InventoryItem[];
  recipes: InventoryRecipe[];
  movements: InventoryMovement[];
  counts: InventoryCount[];
  countLines: InventoryCountLine[];
  purchaseOrders: InventoryPurchaseOrder[];
  purchaseOrderLines: InventoryPurchaseOrderLine[];
  lots: InventoryLot[];
  loading: boolean;
  lastError: string | null;
  fetchInventory: () => Promise<void>;
  createItem: (input: {
    name: string;
    unit: string;
    current_stock: number;
    minimum_stock: number;
    target_stock: number;
    cost_per_unit: number;
    purchase_unit: string;
    purchase_conversion_factor: number;
    minimum_purchase_quantity: number;
    preferred_supplier: string;
    preferred_supplier_phone: string;
    storage_location: string;
    count_frequency_days: number;
    tracks_expiry: boolean;
    last_purchase_package_cost: number;
  }) => Promise<ActionResult<InventoryItem>>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<ActionResult>;
  deactivateItem: (id: string) => Promise<ActionResult>;
  reactivateItem: (id: string) => Promise<ActionResult>;
  deleteItemPermanently: (
    id: string,
    confirmation: string
  ) => Promise<ActionResult<InventoryItemDeletionResult>>;
  recordMovement: (
    id: string,
    quantityChange: number,
    movementType: Extract<
      InventoryMovementType,
      "purchase" | "adjustment" | "waste" | "internal_use" | "damage" | "expired"
    >,
    reasonCode: string,
    note: string
  ) => Promise<ActionResult<InventoryMovement>>;
  replaceRecipe: (
    menuItemId: string,
    modifierOptionId: string | null,
    recipes: Array<{ inventory_item_id: string; quantity: number }>,
    deleteRecipe?: boolean
  ) => Promise<ActionResult<InventoryRecipe[]>>;
  startCount: (scope: "full" | "critical") => Promise<ActionResult<string>>;
  cancelCount: (countId: string) => Promise<ActionResult>;
  completeCount: (
    countId: string,
    lines: CountSubmissionLine[],
    notes?: string
  ) => Promise<ActionResult<string>>;
  reviewCount: (countId: string) => Promise<ActionResult>;
  createPurchaseOrder: (
    supplier: string,
    lines: PurchaseDraftLine[],
    notes?: string
  ) => Promise<ActionResult<string>>;
  receiveInventory: (
    purchaseOrderId: string | null,
    supplier: string,
    lines: ReceiptDraftLine[],
    notes?: string
  ) => Promise<ActionResult<string>>;
}

function errorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback;
}

type InventoryScope = {
  businessId: string | null;
  legacyFallback: boolean;
  key: string;
};

async function getInventoryScope(): Promise<InventoryScope> {
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

async function invokeModernInventoryAction<T>(
  scope: InventoryScope,
  action: string,
  payload: Record<string, unknown>
): Promise<{ handled: boolean; result: ActionResult<T> }> {
  if (scope.legacyFallback) {
    return { handled: false, result: { data: null, error: null } };
  }
  if (!scope.businessId) {
    return {
      handled: true,
      result: {
        data: null,
        error: "No hay un negocio disponible para esta cuenta.",
      },
    };
  }

  const { data, error } = await createClient().rpc(
    "multibusiness_inventory_action",
    {
      p_business_id: scope.businessId,
      p_action: action,
      p_payload: payload,
    }
  );
  return {
    handled: true,
    result: {
      data: (data ?? null) as T | null,
      error: error ? errorMessage(error, "No se pudo operar el inventario") : null,
    },
  };
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  recipes: [],
  movements: [],
  counts: [],
  countLines: [],
  purchaseOrders: [],
  purchaseOrderLines: [],
  lots: [],
  loading: false,
  lastError: null,

  fetchInventory: async () => {
    set({ loading: true, lastError: null });
    try {
      const scope = await getInventoryScope();
      const supabase = createClient();
      if (!scope.legacyFallback && !scope.businessId) {
        set({
          loading: false,
          lastError: "No hay un negocio disponible para esta cuenta.",
        });
        return;
      }

      let itemsQuery = supabase
        .from("inventory_items")
        .select("*")
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });
      let recipesQuery = supabase.from("inventory_recipes").select("*").order("created_at");
      let movementsQuery = supabase
        .from("inventory_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      let countsQuery = supabase
        .from("inventory_counts")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      let countLinesQuery = supabase
        .from("inventory_count_lines")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      let purchaseOrdersQuery = supabase
        .from("inventory_purchase_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      let purchaseOrderLinesQuery = supabase
        .from("inventory_purchase_order_lines")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1000);
      let lotsQuery = supabase
        .from("inventory_lots")
        .select("*")
        .gt("quantity_remaining", 0)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .limit(500);

      if (scope.businessId) {
        itemsQuery = itemsQuery.eq("business_id", scope.businessId);
        recipesQuery = recipesQuery.eq("business_id", scope.businessId);
        movementsQuery = movementsQuery.eq("business_id", scope.businessId);
        countsQuery = countsQuery.eq("business_id", scope.businessId);
        countLinesQuery = countLinesQuery.eq("business_id", scope.businessId);
        purchaseOrdersQuery = purchaseOrdersQuery.eq("business_id", scope.businessId);
        purchaseOrderLinesQuery = purchaseOrderLinesQuery.eq("business_id", scope.businessId);
        lotsQuery = lotsQuery.eq("business_id", scope.businessId);
      }

      const results = await Promise.all([
        itemsQuery,
        recipesQuery,
        movementsQuery,
        countsQuery,
        countLinesQuery,
        purchaseOrdersQuery,
        purchaseOrderLinesQuery,
        lotsQuery,
      ]);

      const firstError = results.find((result) => result.error)?.error;
      set({
        items: (results[0].data ?? []) as InventoryItem[],
        recipes: (results[1].data ?? []) as InventoryRecipe[],
        movements: (results[2].data ?? []) as InventoryMovement[],
        counts: (results[3].data ?? []) as InventoryCount[],
        countLines: (results[4].data ?? []) as InventoryCountLine[],
        purchaseOrders: (results[5].data ?? []) as InventoryPurchaseOrder[],
        purchaseOrderLines: (results[6].data ?? []) as InventoryPurchaseOrderLine[],
        lots: (results[7].data ?? []) as InventoryLot[],
        loading: false,
        lastError: firstError
          ? errorMessage(firstError, "No se pudo cargar el inventario")
          : null,
      });
    } catch {
      set({ loading: false, lastError: "No se pudo cargar el inventario" });
    }
  },

  createItem: async (input) => {
    const scope = await getInventoryScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { data: null, error: "No hay un negocio disponible para esta cuenta." };
    }
    const modern = await invokeModernInventoryAction<InventoryItem>(
      scope,
      "create_item",
      input
    );
    if (modern.handled) {
      if (modern.result.error || !modern.result.data) return modern.result;
      const item = modern.result.data;
      set((state) => ({
        items: [...state.items, item].toSorted((a, b) => a.name.localeCompare(b.name)),
      }));
      return { data: item, error: null };
    }

    const supabase = createClient();
    const payload = scope.businessId
      ? { ...input, business_id: scope.businessId }
      : input;
    const { data, error } = await supabase
      .from("inventory_items")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo crear el insumo") };
    }
    const item = data as InventoryItem;
    set((state) => ({ items: [...state.items, item].toSorted((a, b) => a.name.localeCompare(b.name)) }));
    return { data: item, error: null };
  },

  updateItem: async (id, updates) => {
    const scope = await getInventoryScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { data: null, error: "No hay un negocio disponible para esta cuenta." };
    }
    const modern = await invokeModernInventoryAction<InventoryItem>(
      scope,
      "update_item",
      { ...updates, inventory_item_id: id }
    );
    if (modern.handled) {
      if (modern.result.error || !modern.result.data) {
        return {
          data: null,
          error: modern.result.error ?? "No se pudo actualizar el insumo",
        };
      }
      const item = modern.result.data;
      set((state) => ({
        items: state.items.map((current) => (current.id === id ? item : current)),
      }));
      return { data: undefined, error: null };
    }

    const supabase = createClient();
    const safeUpdates = { ...updates };
    delete safeUpdates.business_id;
    let query = supabase
      .from("inventory_items")
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (scope.businessId) query = query.eq("business_id", scope.businessId);
    const { data, error } = await query.select().maybeSingle();

    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo actualizar el insumo") };
    }
    const item = data as InventoryItem;
    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
    }));
    return { data: undefined, error: null };
  },

  deactivateItem: async (id) => {
    const result = await get().updateItem(id, { is_active: false });
    return result.error
      ? result
      : { data: undefined, error: null };
  },

  reactivateItem: async (id) => {
    const result = await get().updateItem(id, { is_active: true });
    return result.error
      ? result
      : { data: undefined, error: null };
  },

  deleteItemPermanently: async (id, confirmation) => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<InventoryItemDeletionResult>(
      scope,
      "delete_item",
      { inventory_item_id: id, confirmation }
    );
    if (modern.handled) return modern.result;

    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "delete_inventory_item_permanently",
      {
        p_inventory_item_id: id,
        p_confirmation: confirmation,
      }
    );
    if (error || !data) {
      return {
        data: null,
        error: errorMessage(error, "No se pudo eliminar el insumo"),
      };
    }

    await get().fetchInventory();
    return { data: data as InventoryItemDeletionResult, error: null };
  },

  recordMovement: async (id, quantityChange, movementType, reasonCode, note) => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<InventoryMovement>(
      scope,
      "movement",
      {
        inventory_item_id: id,
        quantity_change: quantityChange,
        movement_type: movementType,
        reason_code: reasonCode,
        note,
      }
    );
    if (modern.handled) {
      if (modern.result.error || !modern.result.data) return modern.result;
      const movement = modern.result.data;
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id && movement.resulting_stock !== null
            ? { ...item, current_stock: movement.resulting_stock, updated_at: movement.created_at }
            : item
        ),
        movements: [movement, ...state.movements],
      }));
      return { data: movement, error: null };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_inventory_movement", {
      p_inventory_item_id: id,
      p_quantity_change: quantityChange,
      p_movement_type: movementType,
      p_reason_code: reasonCode,
      p_note: note,
    });
    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo registrar el movimiento") };
    }

    const movement = data as InventoryMovement;
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id && movement.resulting_stock !== null
          ? { ...item, current_stock: movement.resulting_stock, updated_at: movement.created_at }
          : item
      ),
      movements: [movement, ...state.movements],
    }));
    return { data: movement, error: null };
  },

  replaceRecipe: async (
    menuItemId,
    modifierOptionId,
    recipes,
    deleteRecipe = false
  ) => {
    const scope = await getInventoryScope();
    const supabase = createClient();
    const uniqueRecipes = Array.from(
      new Map(recipes.map((recipe) => [recipe.inventory_item_id, recipe])).values()
    );
    const modern = await invokeModernInventoryAction<InventoryRecipe[]>(
      scope,
      "replace_recipe",
      {
        menu_item_id: menuItemId,
        modifier_option_id: modifierOptionId,
        components: uniqueRecipes,
        delete_recipe: deleteRecipe,
      }
    );
    if (modern.handled) {
      if (modern.result.error || !modern.result.data) return modern.result;
      const savedRecipes = modern.result.data;
      set((state) => ({
        recipes: [
          ...state.recipes.filter(
            (recipe) =>
              recipe.menu_item_id !== menuItemId ||
              (recipe.modifier_option_id ?? null) !== modifierOptionId
          ),
          ...savedRecipes,
        ],
      }));
      return { data: savedRecipes, error: null };
    }

    const { data, error } = await supabase.rpc("replace_inventory_recipe", {
      p_menu_item_id: menuItemId,
      p_modifier_option_id: modifierOptionId,
      p_components: uniqueRecipes,
      p_delete: deleteRecipe,
    });
    if (error) {
      return { data: null, error: errorMessage(error, "No se pudo guardar la receta") };
    }

    const savedRecipes = (data ?? []) as InventoryRecipe[];
    set((state) => ({
      recipes: [
        ...state.recipes.filter(
          (recipe) =>
            recipe.menu_item_id !== menuItemId ||
            (recipe.modifier_option_id ?? null) !== modifierOptionId
        ),
        ...savedRecipes,
      ],
    }));
    return { data: savedRecipes, error: null };
  },

  startCount: async (scope) => {
    const businessScope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<string>(
      businessScope,
      "start_count",
      { scope }
    );
    if (modern.handled) {
      return modern.result.data
        ? { data: String(modern.result.data), error: null }
        : { data: null, error: modern.result.error ?? "No se pudo iniciar el conteo" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("start_inventory_count", {
      p_scope: scope,
    });
    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo iniciar el conteo") };
    }
    await get().fetchInventory();
    return { data: String(data), error: null };
  },

  cancelCount: async (countId) => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<undefined>(
      scope,
      "cancel_count",
      { count_id: countId }
    );
    if (modern.handled) {
      return modern.result.error
        ? { data: null, error: modern.result.error }
        : { data: undefined, error: null };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_inventory_count", {
      p_count_id: countId,
    });
    if (error) {
      return { data: null, error: errorMessage(error, "No se pudo cancelar el conteo") };
    }
    await get().fetchInventory();
    return { data: undefined, error: null };
  },

  completeCount: async (countId, lines, notes = "") => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<string>(
      scope,
      "complete_count",
      { count_id: countId, lines, notes }
    );
    if (modern.handled) {
      return modern.result.data
        ? { data: String(modern.result.data), error: null }
        : { data: null, error: modern.result.error ?? "No se pudo completar el conteo" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("complete_inventory_count", {
      p_count_id: countId,
      p_lines: lines,
      p_notes: notes,
    });
    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo completar el conteo") };
    }
    await get().fetchInventory();
    return { data: String(data), error: null };
  },

  reviewCount: async (countId) => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<undefined>(
      scope,
      "review_count",
      { count_id: countId }
    );
    if (modern.handled) {
      return modern.result.error
        ? { data: null, error: modern.result.error }
        : { data: undefined, error: null };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("review_inventory_count", {
      p_count_id: countId,
    });
    if (error) {
      return { data: null, error: errorMessage(error, "No se pudo conciliar el conteo") };
    }
    await get().fetchInventory();
    return { data: undefined, error: null };
  },

  createPurchaseOrder: async (supplier, lines, notes = "") => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<string>(
      scope,
      "create_purchase",
      {
        supplier,
        lines,
        notes,
        expected_at: null,
      }
    );
    if (modern.handled) {
      if (!modern.result.data) {
        return {
          data: null,
          error: modern.result.error ?? "No se pudo crear la compra",
        };
      }
      await get().fetchInventory();
      return { data: String(modern.result.data), error: null };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_inventory_purchase_order", {
      p_supplier: supplier,
      p_lines: lines,
      p_notes: notes,
      p_expected_at: null,
    });
    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo crear la compra") };
    }
    await get().fetchInventory();
    return { data: String(data), error: null };
  },

  receiveInventory: async (purchaseOrderId, supplier, lines, notes = "") => {
    const scope = await getInventoryScope();
    const modern = await invokeModernInventoryAction<string>(
      scope,
      "receive_inventory",
      {
        purchase_order_id: purchaseOrderId,
        supplier,
        lines,
        notes,
      }
    );
    if (modern.handled) {
      if (!modern.result.data) {
        return {
          data: null,
          error: modern.result.error ?? "No se pudo registrar la recepción",
        };
      }
      await get().fetchInventory();
      return { data: String(modern.result.data), error: null };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("receive_inventory", {
      p_purchase_order_id: purchaseOrderId,
      p_supplier: supplier,
      p_lines: lines,
      p_notes: notes,
    });
    if (error || !data) {
      return { data: null, error: errorMessage(error, "No se pudo registrar la recepción") };
    }
    await get().fetchInventory();
    return { data: String(data), error: null };
  },
}));
