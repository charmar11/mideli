import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantTable, TableMapLabel, TableShape, TableZone } from "@/types/database";

interface TableState {
  zones: TableZone[];
  tables: RestaurantTable[];
  labels: TableMapLabel[];
  loading: boolean;
  fetchTables: (force?: boolean) => Promise<void>;
  createZone: (name: string) => Promise<TableZone | null>;
  updateZone: (id: string, updates: Partial<TableZone>) => Promise<boolean>;
  deactivateZone: (id: string) => Promise<boolean>;
  createTable: (input: {
    name: string;
    zone_id: string | null;
    shape?: TableShape;
    capacity?: number;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
    rotation?: number;
  }) => Promise<RestaurantTable | null>;
  updateTable: (
    id: string,
    updates: Partial<RestaurantTable>
  ) => Promise<boolean>;
  deactivateTable: (id: string) => Promise<boolean>;
  createLabel: (input?: Partial<TableMapLabel>) => Promise<TableMapLabel | null>;
  updateLabel: (id: string, updates: Partial<TableMapLabel>) => Promise<boolean>;
  deactivateLabel: (id: string) => Promise<boolean>;
}

let tablesRequest: Promise<void> | null = null;
let tablesFetchedAt = 0;
const TABLES_CACHE_MS = 30_000;
const DEFAULT_TABLE_WIDTH = 0.28;
const DEFAULT_TABLE_HEIGHT = 0.2;

function tableOverlaps(
  positionX: number,
  positionY: number,
  width: number,
  height: number,
  other: RestaurantTable
) {
  const otherWidth = Math.max(Number(other.width) || DEFAULT_TABLE_WIDTH, DEFAULT_TABLE_WIDTH);
  const otherHeight = Math.max(Number(other.height) || DEFAULT_TABLE_HEIGHT, DEFAULT_TABLE_HEIGHT);
  return (
    Math.abs(positionX - Number(other.position_x)) < (width + otherWidth) / 2 &&
    Math.abs(positionY - Number(other.position_y)) < (height + otherHeight) / 2
  );
}

function findTablePosition(
  existingTables: RestaurantTable[],
  requestedPosition: { positionX: number; positionY: number } | undefined,
  width: number,
  height: number
) {
  if (
    requestedPosition &&
    requestedPosition.positionX >= width / 2 &&
    requestedPosition.positionX <= 1 - width / 2 &&
    requestedPosition.positionY >= height / 2 &&
    requestedPosition.positionY <= 1 - height / 2 &&
    !existingTables.some((table) =>
      tableOverlaps(
        requestedPosition.positionX,
        requestedPosition.positionY,
        width,
        height,
        table
      )
    )
  ) {
    return requestedPosition;
  }

  const candidates = [
    0.18, 0.5, 0.82,
  ].flatMap((positionY) => [0.18, 0.5, 0.82].map((positionX) => ({ positionX, positionY })));
  const freeCandidate = candidates.find(
    ({ positionX, positionY }) =>
      !existingTables.some((table) =>
        tableOverlaps(
          positionX,
          positionY,
          width,
          height,
          table
        )
      )
  );

  return freeCandidate ?? candidates[existingTables.length % candidates.length];
}

export const useTableStore = create<TableState>((set, get) => ({
  zones: [],
  tables: [],
  labels: [],
  loading: false,

  fetchTables: async (force = false) => {
    if (force) tablesFetchedAt = 0;
    if (tablesRequest) return tablesRequest;
    if (!force && get().tables.length > 0 && Date.now() - tablesFetchedAt < TABLES_CACHE_MS) {
      return;
    }

    tablesRequest = (async () => {
      set({ loading: true });
      try {
        const supabase = createClient();
        const [{ data: zones }, { data: tables }, { data: labels }] = await Promise.all([
          supabase
            .from("table_zones")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("restaurant_tables")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("table_map_labels")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
        ]);

        if (zones) set({ zones: zones as TableZone[] });
        if (tables) set({ tables: tables as RestaurantTable[] });
        if (labels) set({ labels: labels as TableMapLabel[] });
        tablesFetchedAt = Date.now();
      } finally {
        set({ loading: false });
        tablesRequest = null;
      }
    })();

    return tablesRequest;
  },

  createZone: async (name) => {
    const supabase = createClient();
    const nextSortOrder = get().zones.length;
    const { data, error } = await supabase
      .from("table_zones")
      .insert({
        name: name.trim(),
        sort_order: nextSortOrder,
        position_x: 0.04,
        position_y: 0.04,
        width: 0.29,
        height: 0.32,
      })
      .select()
      .single();

    if (error || !data) return null;
    const zone = data as TableZone;
    set((state) => ({ zones: [...state.zones, zone] }));
    return zone;
  },

  updateZone: async (id, updates) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("table_zones")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({
      zones: state.zones.map((zone) =>
        zone.id === id ? { ...zone, ...updates } : zone
      ),
    }));
    return true;
  },

  deactivateZone: async (id) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("table_zones")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({
      zones: state.zones.filter((zone) => zone.id !== id),
      tables: state.tables.filter((table) => table.zone_id !== id),
    }));
    return true;
  },

  createTable: async (input) => {
    const supabase = createClient();
    const existingTables = get().tables.filter((table) => table.zone_id === input.zone_id);
    const width = input.width ?? DEFAULT_TABLE_WIDTH;
    const height = input.height ?? DEFAULT_TABLE_HEIGHT;
    const position = findTablePosition(
      existingTables,
      input.position_x !== undefined && input.position_y !== undefined
        ? { positionX: input.position_x, positionY: input.position_y }
        : undefined,
      width,
      height
    );
    const { data, error } = await supabase
      .from("restaurant_tables")
      .insert({
        name: input.name.trim(),
        zone_id: input.zone_id,
        shape: input.shape ?? "square",
        capacity: input.capacity ?? 2,
        position_x: position.positionX,
        position_y: position.positionY,
        width,
        height,
        rotation: input.rotation ?? 0,
      })
      .select()
      .single();

    if (error || !data) return null;
    const table = data as RestaurantTable;
    set((state) => ({ tables: [...state.tables, table] }));
    return table;
  },

  updateTable: async (id, updates) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("restaurant_tables")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === id ? { ...table, ...updates } : table
      ),
    }));
    return true;
  },

  deactivateTable: async (id) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("restaurant_tables")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({
      tables: state.tables.filter((table) => table.id !== id),
    }));
    return true;
  },

  createLabel: async (input = {}) => {
    const supabase = createClient();
    const nextSortOrder = get().labels.length;
    const { data, error } = await supabase
      .from("table_map_labels")
      .insert({
        label_text: input.label_text?.trim() || "Referencia",
        position_x: input.position_x ?? 0.4,
        position_y: input.position_y ?? 0.08,
        width: input.width ?? 0.2,
        height: input.height ?? 0.1,
        background_color: input.background_color ?? "#2A242E",
        text_color: input.text_color ?? "#FBF8E7",
        border_color: input.border_color ?? "#F5145F",
        sort_order: input.sort_order ?? nextSortOrder,
      })
      .select()
      .single();

    if (error || !data) return null;
    const label = data as TableMapLabel;
    set((state) => ({ labels: [...state.labels, label] }));
    return label;
  },

  updateLabel: async (id, updates) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("table_map_labels")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({
      labels: state.labels.map((label) =>
        label.id === id ? { ...label, ...updates } : label
      ),
    }));
    return true;
  },

  deactivateLabel: async (id) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("table_map_labels")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) return false;
    set((state) => ({ labels: state.labels.filter((label) => label.id !== id) }));
    return true;
  },
}));
