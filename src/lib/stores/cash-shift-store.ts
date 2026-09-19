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
  CashMovementRecord,
} from "@/types/cash";
import { useBusinessContextStore } from "./business-context-store";

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
  correctOpeningFloat: (input: {
    shiftId: string;
    amount: number;
    reason: string;
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
  listMovements: (input?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<CashShiftResult<CashMovementRecord[]>>;
  correctMovement: (input: {
    movementId: string;
    correctedAmount: number;
    reason: string;
    authorization: string;
  }) => Promise<CashShiftResult<{ movement_id: string; shift_id: string; corrected_amount: number; correction_status: "corrected" | "voided" }>>;
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
let currentShiftScopeKey: string | null = null;
const CURRENT_SHIFT_CACHE_MS = 10_000;

interface CashScope {
  businessId: string | null;
  legacyFallback: boolean;
}

interface CashRpcResult<T = unknown> {
  data: T | null;
  error: { message?: string } | null;
}

function message(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback;
}

async function getCashScope(): Promise<CashScope> {
  const context = useBusinessContextStore.getState();
  await context.ensureLoaded();
  const current = useBusinessContextStore.getState();
  return {
    businessId: current.selectedBusinessId,
    legacyFallback: current.legacyFallback,
  };
}

async function invokeCashAction<T>(
  action: string,
  payload: Record<string, unknown>,
  legacyFunction: string,
  providedScope?: CashScope
): Promise<CashRpcResult<T>> {
  const scope = providedScope ?? (await getCashScope());
  if (!scope.legacyFallback && !scope.businessId) {
    return {
      data: null,
      error: { message: "No hay un negocio disponible para esta cuenta." },
    };
  }

  const supabase = createClient();
  const result = scope.legacyFallback
    ? await supabase.rpc(legacyFunction, payload)
    : await supabase.rpc("multibusiness_cash_action", {
        p_business_id: scope.businessId,
        p_action: action,
        p_payload: payload,
      });

  return {
    data: (result.data as T | null) ?? null,
    error: result.error,
  };
}

export const useCashShiftStore = create<CashShiftState>((set, get) => ({
  currentShift: null,
  loading: false,
  lastError: null,

  fetchCurrentShift: async (force = false) => {
    const scope = await getCashScope();
    const scopeKey = scope.legacyFallback ? "legacy" : scope.businessId;
    if (
      !force &&
      currentShiftScopeKey === scopeKey &&
      Date.now() - currentShiftFetchedAt < CURRENT_SHIFT_CACHE_MS
    ) {
      return get().currentShift;
    }
    if (currentShiftRequest) return currentShiftRequest;

    currentShiftRequest = (async () => {
      set({ loading: true });
      try {
        const { data, error } = await invokeCashAction<CashShift>(
          "current",
          {},
          "get_current_cash_shift",
          scope
        );
        const shift = error || !data ? null : data;
        currentShiftFetchedAt = Date.now();
        currentShiftScopeKey = scopeKey;
        set({
          currentShift: shift,
          loading: false,
          lastError: error ? message(error, "No se pudo consultar la caja") : null,
        });
        return shift;
      } finally {
        currentShiftRequest = null;
      }
    })();

    return currentShiftRequest;
  },

  openShift: async ({ openingFloat, denominations = {}, note = "" }) => {
    const { data, error } = await invokeCashAction<CashShift>("open", {
      p_opening_float: openingFloat,
      p_opening_denominations: denominations,
      p_note: note,
    }, "open_cash_shift");
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo abrir la caja") };
    }
    const shift = data as CashShift;
    currentShiftFetchedAt = Date.now();
    set({ currentShift: shift, lastError: null });
    return { data: shift, error: null };
  },

  correctOpeningFloat: async ({ shiftId, amount, reason }) => {
    const { data, error } = await invokeCashAction<CashShift>(
      "correct_opening",
      {
        p_shift_id: shiftId,
        p_new_amount: amount,
        p_reason: reason,
      },
      "correct_cash_shift_opening_float"
    );
    if (error || !data) {
      return {
        data: null,
        error: message(error, "No se pudo corregir el fondo inicial"),
      };
    }
    const shift = data as CashShift;
    currentShiftFetchedAt = Date.now();
    set({ currentShift: shift, lastError: null });
    return { data: shift, error: null };
  },

  listAuthorizers: async () => {
    const { data, error } = await invokeCashAction<unknown[]>(
      "list_authorizers",
      {},
      "list_cash_authorizers"
    );
    if (error) {
      return { data: null, error: message(error, "No se pudieron cargar los autorizadores") };
    }
    return { data: (data ?? []) as unknown as CashAuthorizer[], error: null };
  },

  authorizeAction: async ({ authorizerId, pin, shiftId, action, amount }) => {
    const { data, error } = await invokeCashAction<string>("authorize", {
      p_authorizer_id: authorizerId,
      p_pin: pin,
      p_shift_id: shiftId,
      p_action: action,
      p_amount: amount,
    }, "authorize_cash_action");
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo autorizar la operación") };
    }
    return { data: data as string, error: null };
  },

  recordMovement: async ({ shiftId, type, direction, amount, reason, authorization }) => {
    const { data, error } = await invokeCashAction<{ shift: CashShift }>(
      "record_movement",
      {
      p_shift_id: shiftId,
      p_movement_type: type,
      p_direction: direction,
      p_amount: amount,
      p_reason: reason,
      p_authorization: authorization,
      },
      "record_cash_movement"
    );
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo registrar el movimiento") };
    }
    const result = data as { shift: CashShift };
    currentShiftFetchedAt = Date.now();
    set({ currentShift: result.shift });
    return { data: result.shift, error: null };
  },

  previewClose: async ({ shiftId, countMode, denominations = {}, countedCash }) => {
    const { data, error } = await invokeCashAction<CashClosePreview>("preview_close", {
      p_shift_id: shiftId,
      p_count_mode: countMode,
      p_denominations: denominations,
      p_counted_cash: countedCash ?? null,
    }, "preview_cash_shift_close");
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
    const { data, error } = await invokeCashAction<CashShift>("close", {
      p_shift_id: shiftId,
      p_count_mode: countMode,
      p_denominations: denominations,
      p_counted_cash: countedCash ?? null,
      p_note: note,
      p_authorization: authorization,
    }, "close_cash_shift");
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo cerrar la caja") };
    }
    const shift = data as CashShift;
    currentShiftFetchedAt = Date.now();
    set({ currentShift: null, lastError: null });
    return { data: shift, error: null };
  },

  listHistory: async () => {
    const { data, error } = await invokeCashAction<unknown[]>("list_history", {
      p_limit: 100,
      p_offset: 0,
    }, "list_cash_shifts");
    if (error) {
      return { data: null, error: message(error, "No se pudo cargar el historial de caja") };
    }
    return { data: (data ?? []) as unknown as CashShift[], error: null };
  },

  getDetail: async (shiftId) => {
    const { data, error } = await invokeCashAction<CashShiftDetail>(
      "detail",
      { p_shift_id: shiftId },
      "get_cash_shift_detail"
    );
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo cargar el corte") };
    }
    return { data: data as CashShiftDetail, error: null };
  },

  listMovements: async ({ since = null, until = null } = {}) => {
    const { data, error } = await invokeCashAction<unknown[]>("list_movements", {
      p_since: since,
      p_until: until,
      p_limit: 500,
      p_offset: 0,
    }, "list_cash_movements");
    if (error) {
      return {
        data: null,
        error: message(error, "No se pudieron cargar los gastos y movimientos"),
      };
    }
    return { data: (data ?? []) as unknown as CashMovementRecord[], error: null };
  },

  correctMovement: async ({ movementId, correctedAmount, reason, authorization }) => {
    const { data, error } = await invokeCashAction<{
      movement_id: string;
      shift_id: string;
      corrected_amount: number;
      correction_status: "corrected" | "voided";
    }>("correct_movement", {
      p_movement_id: movementId,
      p_corrected_amount: correctedAmount,
      p_reason: reason,
      p_authorization: authorization,
    }, "correct_cash_movement");
    if (error || !data) {
      return {
        data: null,
        error: message(error, "No se pudo corregir el movimiento"),
      };
    }
    currentShiftFetchedAt = 0;
    return {
      data: data as {
        movement_id: string;
        shift_id: string;
        corrected_amount: number;
        correction_status: "corrected" | "voided";
      },
      error: null,
    };
  },

  recordAdjustment: async ({
    shiftId,
    paymentMethod,
    direction,
    amount,
    reason,
    authorization,
  }) => {
    const { data, error } = await invokeCashAction<CashShiftDetail>("adjustment", {
      p_shift_id: shiftId,
      p_payment_method: paymentMethod,
      p_direction: direction,
      p_amount: amount,
      p_reason: reason,
      p_authorization: authorization,
    }, "record_cash_shift_adjustment");
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo registrar la corrección") };
    }
    return { data: data as CashShiftDetail, error: null };
  },

  archiveShift: async ({ shiftId, reason }) => {
    const { data, error } = await invokeCashAction<{ id: string }>("archive", {
      p_shift_id: shiftId,
      p_reason: reason,
    }, "archive_cash_shift");
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo eliminar el corte") };
    }
    return { data: data as { id: string }, error: null };
  },

  restoreShift: async (shiftId) => {
    const { data, error } = await invokeCashAction<{ id: string }>(
      "restore",
      { p_shift_id: shiftId },
      "restore_cash_shift"
    );
    if (error || !data) {
      return { data: null, error: message(error, "No se pudo restaurar el corte") };
    }
    return { data: data as { id: string }, error: null };
  },

  getDeletionImpact: async (shiftId) => {
    const { data, error } = await invokeCashAction<CashShiftDeletionImpact>(
      "deletion_impact",
      { p_shift_id: shiftId },
      "get_cash_shift_deletion_impact"
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
    const { data, error } = await invokeCashAction<{
      id: string;
      number: number;
      deleted: boolean;
    }>("delete", {
      p_shift_id: shiftId,
      p_reason: reason,
      p_confirmation: confirmation,
    }, "permanently_delete_cash_shift");
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
    const businessChanged = () => {
      currentShiftFetchedAt = 0;
      currentShiftScopeKey = null;
      currentShiftRequest = null;
      set({ currentShift: null, lastError: null });
      void get().fetchCurrentShift(true);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("mideli:business-changed", businessChanged);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("mideli:business-changed", businessChanged);
      void supabase.removeChannel(channel);
    };
  },
}));
