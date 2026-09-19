import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/multibusiness/constants";
import type { BusinessContextRow } from "@/types/multibusiness";

const MISSING_CONTEXT_CODES = new Set(["PGRST202", "42883", "42P01"]);

export type SelectedBusinessContext = {
  businessId: string | null;
  multibusinessAvailable: boolean;
};

/**
 * Resolves the browser's selected business against the authenticated user's
 * actual memberships. The cookie is only a navigation hint, never an
 * authorization mechanism.
 */
export async function getSelectedBusinessContext(
  supabase: SupabaseClient
): Promise<SelectedBusinessContext> {
  const { data, error } = await supabase.rpc("get_my_multibusiness_context");
  if (error) {
    if (MISSING_CONTEXT_CODES.has(error.code ?? "")) {
      return { businessId: null, multibusinessAvailable: false };
    }
    throw error;
  }

  const businesses = (data ?? []) as BusinessContextRow[];
  if (businesses.length === 0) {
    return { businessId: null, multibusinessAvailable: true };
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value;
  const selected =
    businesses.find((business) => business.business_id === requestedId) ??
    businesses.find((business) => business.business_lifecycle_status === "active") ??
    businesses[0];

  return {
    businessId: selected?.business_id ?? null,
    multibusinessAvailable: true,
  };
}

export async function getSelectedBusinessId(
  supabase: SupabaseClient
): Promise<string | null> {
  return (await getSelectedBusinessContext(supabase)).businessId;
}
