import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { BusinessContextRow } from "@/types/multibusiness";

const SELECTED_BUSINESS_STORAGE_KEY = "mideli:selected-business-id";
const MISSING_CONTEXT_CODES = new Set(["PGRST202", "42883", "42P01"]);

interface BusinessContextState {
  businesses: BusinessContextRow[];
  selectedBusinessId: string | null;
  selectedOrganizationId: string | null;
  loading: boolean;
  loaded: boolean;
  legacyFallback: boolean;
  error: string | null;
  ensureLoaded: (force?: boolean) => Promise<void>;
  selectBusiness: (businessId: string) => boolean;
  reset: () => void;
}

let contextRequest: Promise<void> | null = null;

function readStoredBusinessId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY);
}

function writeStoredBusinessId(businessId: string | null) {
  if (typeof window === "undefined") return;
  if (businessId) {
    window.localStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, businessId);
  } else {
    window.localStorage.removeItem(SELECTED_BUSINESS_STORAGE_KEY);
  }
}

function isMissingContextFunction(error: { code?: string | null } | null) {
  return Boolean(error?.code && MISSING_CONTEXT_CODES.has(error.code));
}

export const useBusinessContextStore = create<BusinessContextState>((set, get) => ({
  businesses: [],
  selectedBusinessId: null,
  selectedOrganizationId: null,
  loading: false,
  loaded: false,
  legacyFallback: false,
  error: null,

  ensureLoaded: async (force = false) => {
    if (contextRequest) return contextRequest;
    if (get().loaded && !force) return;

    contextRequest = (async () => {
      set({ loading: true, error: null });
      try {
        const { data, error } = await createClient().rpc(
          "get_my_multibusiness_context"
        );

        if (error) {
          if (isMissingContextFunction(error)) {
            // Production can receive the UI before the additive migrations.
            // In that window we keep the single-business behavior without
            // pretending that a multibusiness context was loaded.
            set({
              businesses: [],
              selectedBusinessId: null,
              selectedOrganizationId: null,
              legacyFallback: true,
              loaded: true,
              error: null,
            });
          } else {
            set({
              businesses: [],
              selectedBusinessId: null,
              selectedOrganizationId: null,
              legacyFallback: false,
              loaded: true,
              error: "No se pudo cargar el contexto de negocios",
            });
          }
          return;
        }

        const businesses = (data ?? []) as BusinessContextRow[];
        const storedId = readStoredBusinessId();
        const selected =
          businesses.find((business) => business.business_id === storedId) ??
          businesses.find((business) => business.business_lifecycle_status === "active") ??
          businesses[0] ??
          null;

        set({
          businesses,
          selectedBusinessId: selected?.business_id ?? null,
          selectedOrganizationId: selected?.organization_id ?? null,
          legacyFallback: false,
          loaded: true,
          error: null,
        });
        writeStoredBusinessId(selected?.business_id ?? null);
      } catch {
        set({
          businesses: [],
          selectedBusinessId: null,
          selectedOrganizationId: null,
          legacyFallback: false,
          loaded: true,
          error: "No se pudo cargar el contexto de negocios",
        });
      } finally {
        set({ loading: false });
        contextRequest = null;
      }
    })();

    return contextRequest;
  },

  selectBusiness: (businessId) => {
    const selected = get().businesses.find(
      (business) => business.business_id === businessId
    );
    if (!selected) return false;

    set({
      selectedBusinessId: selected.business_id,
      selectedOrganizationId: selected.organization_id,
    });
    writeStoredBusinessId(selected.business_id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mideli:business-changed"));
    }
    return true;
  },

  reset: () => {
    contextRequest = null;
    writeStoredBusinessId(null);
    set({
      businesses: [],
      selectedBusinessId: null,
      selectedOrganizationId: null,
      loading: false,
      loaded: false,
      legacyFallback: false,
      error: null,
    });
  },
}));
