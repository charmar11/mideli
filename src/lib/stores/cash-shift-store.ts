import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type {
  CashAuthorizationAction,
  CashAuthorizer,
  CashClosePreview,
  CashCountMode,
  CashDirection,
  CashMovementType,
  CashShift,
  CashShiftDeletionImpact,
  CashShiftDetail,
} from "@/types/cash";

interface CashShiftResult<T> {
  data: T | null;
  error: string | null;
}

interface CashShiftState {
  currentShift: CashShift | null;
  loading: boolean;
  lastError: string | null;
  fetchCurrentShift: (force?: boolean) => Promise<CashShift | null>;
  openShift: (input: {
    openingFloat: number;
    denominations?: Record<string, number>;
    note?: string;
  }) => Promise<CashShiftResult<CashShift>>;
  listAuthorizers: () => Promise<CashShiftResult<CashAuthorizer[]>>;
  authorizeAction: (input: {
    authorizerId: string;
    pin: string;
    shiftId: string;
    action: CashAuthorizationAction;
    amount: number;
  }) => Promise<CashShiftResult<string>>;
  recordMovement: (input: {
    shiftId: string;
    type: CashMovementType;
    direction: CashDirection;
    amount: number;
    reason: string;
    authorization: string;
  }) => Promise<CashShiftResult<CashShift>>;
  previewClose: (input: {
    shiftId: string;
    countMode: CashCountMode;
    denominations?: Record<string, number>;
    countedCash?: number;
  }) => Promise<CashShiftResult<CashClosePreview>>;
  closeShift: (input: {
    shiftId: string;
    countMode: CashCountMode;
    denominations?: Record<string, number>;
    countedCash?: number;
    note?: string;
    authorization?: string | null;
  }) => Promise<CashShiftResult<CashShift>>;
  listHistory: () => Promise<CashShiftResult<CashShift[]>>;
  getDetail: (shiftId: string) => Promise<CashShiftResult<CashShiftDetail>>;
  recordAdjustment: (input: {
    shiftId: string;
    paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "otro";
    direction: "increase" | "decrease";
    amount: number;
    reason: string;
    authorization: string;
  }) => Promise<CashShiftResult<CashShiftDetail>>;
  archiveShift: (input: {
    shiftId: string;
    reason: string;
  }) => Promise<CashShiftResult<{ id: string }>>;
  restoreShift: (shiftId: string) => Promise<CashShiftResult<{ id: string }>>;
  getDeletionImpact: (
    shiftId: string
  ) => Promise<CashShiftResult<CashShiftDeletionImpact>>;
  permanentlyDeleteShift: (input: {
    shiftId: string;
    reason: string;
    confirmation: string;
  }) => Promise<CashShiftResult<{ id: string; number: number; deleted: boolean }>>;
  subscribe: () => () => void;
}

let currentShiftRequest: Promise<CashShift | null> | null = null;
let currentShiftFetchedAt = 0;
const CURRENT_SHIFT_CACHE_MS = 10_000;

function message(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback;
}

export const useCashShiftStore = create<CashShiftState>((set, get) => ({
  currentShift: null,
  loading: false,
  lastError: null,

  fetchCurrentShift: async (force = false) => {
    if (!force && Date.now() - currentShiftFetchedAt < CURRENT_SHIFT_CACHE_MS) {
      return get().currentShift;
    }
    if (currentShiftRequest) return currentShiftRequest;

    currentShiftRequest = (async () => {
      set({ loading: true });
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_current_cash_shift");
      const shift = error || !data ? null : (data as CashShift);
      currentShiftFetchedAt = Date.now();
      set({
        currentShift: shift,
        loading: false,
        lastError: error ? message(error, "No se pudo consultar la caja") : null,
      });
      currentShiftRequest = null;
      return shift;
    })();

    return currentShiftRequest;
  },

  openShift: async ({ openingFloat, denominations = {}, note = "" }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("open_cash_shift", {
      p_opening_float: openingFloat,
      p_opening_denominations: denominations,
      p_note: note,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo abrir la caja") };
    }
    const shift = data as CashShift;
    currentShiftFetchedAt = Date.now();
    set({ currentShift: shift, lastError: null });
    return { data: shift, error: null };
  },

  listAuthorizers: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_cash_authorizers");
    if (error) {
      return { data: null, error: message(error, "No se pudieron cargar los autorizadores") };
    }
    return { data: (data ?? []) as unknown as CashAuthorizer[], error: null };
  },

  authorizeAction: async ({ authorizerId, pin, shiftId, action, amount }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("authorize_cash_action", {
      p_authorizer_id: authorizerId,
      p_pin: pin,
      p_shift_id: shiftId,
      p_action: action,
      p_amount: amount,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo autorizar la operación") };
    }
    return { data: data as string, error: null };
  },

  recordMovement: async ({ shiftId, type, direction, amount, reason, authorization }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_cash_movement", {
      p_shift_id: shiftId,
      p_movement_type: type,
      p_direction: direction,
      p_amount: amount,
      p_reason: reason,
      p_authorization: authorization,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo registrar el movimiento") };
    }
    const result = data as { shift: CashShift };
    currentShiftFetchedAt = Date.now();
    set({ currentShift: result.shift });
    return { data: result.shift, error: null };
  },

  previewClose: async ({ shiftId, countMode, denominations = {}, countedCash }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("preview_cash_shift_close", {
      p_shift_id: shiftId,
      p_count_mode: countMode,
      p_denominations: denominations,
      p_counted_cash: countedCash ?? null,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo calcular el corte") };
    }
    return { data: data as CashClosePreview, error: null };
  },

  closeShift: async ({
    shiftId,
    countMode,
    denominations = {},
    countedCash,
    note = "",
    authorization = null,
  }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("close_cash_shift", {
      p_shift_id: shiftId,
      p_count_mode: countMode,
      p_denominations: denominations,
      p_counted_cash: countedCash ?? null,
      p_note: note,
      p_authorization: authorization,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo cerrar la caja") };
    }
    const shift = data as CashShift;
    currentShiftFetchedAt = Date.now();
    set({ currentShift: null, lastError: null });
    return { data: shift, error: null };
  },

  listHistory: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_cash_shifts", {
      p_limit: 100,
      p_offset: 0,
    });
    if (error) {
      return { data: null, error: message(error, "No se pudo cargar el historial de caja") };
    }
    return { data: (data ?? []) as unknown as CashShift[], error: null };
  },

  getDetail: async (shiftId) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_cash_shift_detail", {
      p_shift_id: shiftId,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo cargar el corte") };
    }
    return { data: data as CashShiftDetail, error: null };
  },

  recordAdjustment: async ({
    shiftId,
    paymentMethod,
    direction,
    amount,
    reason,
    authorization,
  }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_cash_shift_adjustment", {
      p_shift_id: shiftId,
      p_payment_method: paymentMethod,
      p_direction: direction,
      p_amount: amount,
      p_reason: reason,
      p_authorization: authorization,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo registrar la corrección") };
    }
    return { data: data as CashShiftDetail, error: null };
  },

  archiveShift: async ({ shiftId, reason }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("archive_cash_shift", {
      p_shift_id: shiftId,
      p_reason: reason,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo eliminar el corte") };
    }
    return { data: data as { id: string }, error: null };
  },

  restoreShift: async (shiftId) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("restore_cash_shift", {
      p_shift_id: shiftId,
    });
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo restaurar el corte") };
    }
    return { data: data as { id: string }, error: null };
  },

  getDeletionImpact: async (shiftId) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "get_cash_shift_deletion_impact",
      { p_shift_id: shiftId }
    );
    if (error || !data) {
      return {
        data: null,
        error: message(error, "No se pudo revisar el contenido del corte"),
      };
    }
    return { data: data as CashShiftDeletionImpact, error: null };
  },

  permanentlyDeleteShift: async ({ shiftId, reason, confirmation }) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("permanently_delete_cash_shift", {
      p_shift_id: shiftId,
      p_reason: reason,
      p_confirmation: confirmation,
    });
    if (error || !data) {
      return {
        data: null,
        error: message(error, "No se pudo eliminar el corte definitivamente"),
      };
    }
    return {
      data: data as { id: string; number: number; deleted: boolean },
      error: null,
    };
  },

  subscribe: () => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        currentShiftFetchedAt = 0;
        void get().fetchCurrentShift(true);
      }, 150);
    };
    const channel = supabase
      .channel(`cash-shift-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_shifts" },
        refresh
      )
      .subscribe();
    const visibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", visibility);
      void supabase.removeChannel(channel);
    };
  },
}));
