import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/multibusiness/constants";
import {
  hasOrderReadCapability,
  resolveBusinessContextSelection,
} from "@/lib/multibusiness/business-context-selection";
import type { BusinessContextRow } from "@/types/multibusiness";

const MISSING_CONTEXT_CODES = new Set(["PGRST202", "42883", "42P01"]);

export type SelectedBusinessContext = {
  businessId: string | null;
  /** Business ids the current session may query for the current operational view. */
  businessIds: string[];
  /** Active businesses where this session has a scoped order-read permission. */
  readableBusinessIds: string[];
  /** Active businesses owned by this session; destructive history actions use this only. */
  deletableBusinessIds: string[];
  multibusinessAvailable: boolean;
};

function canOperateOrganization(business: BusinessContextRow | null) {
  return Boolean(
    business?.capability_codes.some(
      (code) =>
        code === "organization.operate_orders" ||
        code === "organization.charge_orders"
    )
  );
}

/**
 * Resolves the browser's selected business against the authenticated user's
 * actual memberships. The cookie is only a navigation hint, never an
 * authorization mechanism.
 */
export async function getSelectedBusinessContext(
  supabase: SupabaseClient
): Promise<SelectedBusinessContext> {
  const contextResult = await supabase.rpc("get_my_multibusiness_context");
  const { data, error } = contextResult;
  if (error) {
    if (MISSING_CONTEXT_CODES.has(error.code ?? "")) {
      return {
        businessId: null,
        businessIds: [],
        readableBusinessIds: [],
        deletableBusinessIds: [],
        multibusinessAvailable: false,
      };
    }
    throw error;
  }

  const businesses = (data ?? []) as BusinessContextRow[];
  if (businesses.length === 0) {
    return {
      businessId: null,
      businessIds: [],
      readableBusinessIds: [],
      deletableBusinessIds: [],
      multibusinessAvailable: true,
    };
  }
  const cookieStore = await cookies();
  const requestedId = cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value;
  const activeBusinesses = businesses.filter(
    (business) => business.business_lifecycle_status === "active"
  );
  const selected = resolveBusinessContextSelection(
    activeBusinesses,
    [],
    requestedId
  );
  if (!selected) {
    return {
      businessId: null,
      businessIds: [],
      readableBusinessIds: [],
      deletableBusinessIds: [],
      multibusinessAvailable: true,
    };
  }
  const sameOrganizationBusinesses = businesses.filter(
    (business) =>
      business.organization_id === selected.organization_id &&
      business.business_lifecycle_status === "active"
  );
  const organizationBusinessIds = canOperateOrganization(selected)
    ? sameOrganizationBusinesses.map((business) => business.business_id)
    : [];
  const readableBusinessIds = sameOrganizationBusinesses
    .filter(hasOrderReadCapability)
    .map((business) => business.business_id);
  const deletableBusinessIds = sameOrganizationBusinesses
    .filter(
      (business) =>
        business.membership_role_code === "business_owner" &&
        hasOrderReadCapability(business)
    )
    .map((business) => business.business_id);

  return {
    businessId: selected?.business_id ?? null,
    businessIds:
      organizationBusinessIds.length > 0
        ? organizationBusinessIds
        : selected?.business_id
          ? [selected.business_id]
          : [],
    readableBusinessIds,
    deletableBusinessIds,
    multibusinessAvailable: true,
  };
}

export async function getSelectedBusinessId(
  supabase: SupabaseClient
): Promise<string | null> {
  return (await getSelectedBusinessContext(supabase)).businessId;
}
