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
    const supabase = createClient();
    const results = await Promise.all([
      supabase
        .from("inventory_items")
        .select("*")
        .order("is_active", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("inventory_recipes").select("*").order("created_at"),
      supabase
        .from("inventory_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("inventory_counts")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30),
      supabase
        .from("inventory_count_lines")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("inventory_purchase_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("inventory_purchase_order_lines")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1000),
      supabase
        .from("inventory_lots")
        .select("*")
        .gt("quantity_remaining", 0)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .limit(500),
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
      lastError: firstError ? errorMessage(firstError, "No se pudo cargar el inventario") : null,
    });
  },

  createItem: async (input) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .insert(input)
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
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

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
    const supabase = createClient();
    const uniqueRecipes = Array.from(
      new Map(recipes.map((recipe) => [recipe.inventory_item_id, recipe])).values()
    );
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
