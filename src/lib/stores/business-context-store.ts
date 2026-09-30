import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { BusinessContextRow } from "@/types/multibusiness";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/multibusiness/constants";
import {
  getSelectableBusinessContexts,
  resolveBusinessContextSelection,
} from "@/lib/multibusiness/business-context-selection";

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
    document.cookie = `${SELECTED_BUSINESS_COOKIE}=${encodeURIComponent(businessId)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  } else {
    window.localStorage.removeItem(SELECTED_BUSINESS_STORAGE_KEY);
    document.cookie = `${SELECTED_BUSINESS_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

function isMissingContextFunction(error: { code?: string | null } | null) {
  return Boolean(error?.code && MISSING_CONTEXT_CODES.has(error.code));
}

function isOperationalBusiness(business: BusinessContextRow) {
  return (
    business.business_lifecycle_status === "active" &&
    business.business_license_available === true
  );
}

function isSetupBusiness(business: BusinessContextRow) {
  return (
    (business.business_lifecycle_status === "draft" ||
      (business.business_lifecycle_status === "paused" &&
        business.business_license_available === true)) &&
    business.capability_codes.some((capability) =>
      [
        "business.manage_catalog",
        "business.manage_inventory",
        "business.manage_staff",
      ].includes(capability)
    )
  );
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
        const client = createClient();
        const [contextResult, brandingResult, licenseResult] = await Promise.all([
          client.rpc("get_my_multibusiness_context"),
          client.rpc("get_my_business_branding"),
          client.rpc("get_my_business_license_availability"),
        ]);
        const { data, error } = contextResult;

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

        if (brandingResult.error) {
          console.error("No se pudo cargar la identidad de los negocios", {
            code: brandingResult.error.code,
          });
        }
        const brandingByBusinessId = new Map(
          ((brandingResult.data ?? []) as Array<{
            business_id: string;
            brand_logo_path: string | null;
            brand_primary_color: string | null;
            brand_accent_color: string | null;
          }>).map((brand) => [brand.business_id, brand]),
        );
        const licenseAvailabilityByBusinessId = new Map(
          ((licenseResult.data ?? []) as Array<{
            business_id: string;
            is_available: boolean;
          }>).map((license) => [license.business_id, license.is_available]),
        );
        const licenseCheckFailed = Boolean(licenseResult.error);
        if (licenseCheckFailed) {
          console.error("No se pudo verificar la disponibilidad de los negocios", {
            code: licenseResult.error?.code,
          });
        }
        const businesses = ((data ?? []) as BusinessContextRow[]).map((business) => {
          const brand = brandingByBusinessId.get(business.business_id);
          return {
            ...business,
            business_license_available:
              licenseAvailabilityByBusinessId.get(business.business_id) === true &&
              !licenseCheckFailed,
            business_brand_logo_path: brand?.brand_logo_path ?? null,
            business_brand_primary_color: brand?.brand_primary_color ?? null,
            business_brand_accent_color: brand?.brand_accent_color ?? null,
          };
        });
        const storedId = readStoredBusinessId();
        const activeBusinesses = businesses.filter(isOperationalBusiness);
        const setupBusinesses = businesses.filter(isSetupBusiness);
        const selected = resolveBusinessContextSelection(
          activeBusinesses,
          setupBusinesses,
          storedId
        );

        set({
          businesses,
          selectedBusinessId: selected?.business_id ?? null,
          selectedOrganizationId: selected?.organization_id ?? null,
          legacyFallback: false,
          loaded: true,
          error: licenseCheckFailed
            ? "No se pudo verificar la disponibilidad de los negocios"
            : null,
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
    if (
      !selected ||
      (!isOperationalBusiness(selected) && !isSetupBusiness(selected)) ||
      !getSelectableBusinessContexts(
        get().businesses.filter(
          (business) =>
            isOperationalBusiness(business) || isSetupBusiness(business)
        )
      ).some((business) => business.business_id === selected.business_id)
    ) {
      return false;
    }

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
