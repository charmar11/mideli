"use server";

import { getOrderReadableBusinessContexts } from "@/lib/multibusiness/business-context-selection";
import { createClient } from "@/lib/supabase/server";
import {
  classifyPosOrderRecovery,
  isPosCreationKey,
} from "@/lib/pos-order-recovery";
import type { BusinessContextRow } from "@/types/multibusiness";

interface CheckPosOrderAttemptInput {
  creationKey: string;
  businessIds: string[];
}

type CheckPosOrderAttemptResult =
  | { status: "found"; orderIds: string[] }
  | { status: "not_found" }
  | { status: "unavailable" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable(): { status: "unavailable" } {
  return { status: "unavailable" };
}

/**
 * Checks whether the current staff account's pending POS attempt committed.
 * Only a status is returned; order or customer data never crosses this action.
 */
export async function checkPosOrderAttemptAction(
  input: CheckPosOrderAttemptInput,
): Promise<CheckPosOrderAttemptResult> {
  if (
    !input ||
    !isPosCreationKey(input.creationKey) ||
    !Array.isArray(input.businessIds) ||
    input.businessIds.length === 0 ||
    input.businessIds.length > 20 ||
    input.businessIds.some((businessId) => !UUID_PATTERN.test(businessId))
  ) {
    return unavailable();
  }

  const expectedBusinessIds = [...new Set(input.businessIds)];
  if (expectedBusinessIds.length !== input.businessIds.length) return unavailable();

  try {
    const supabase = await createClient();
    const { data: authResult, error: authError } = await supabase.auth.getUser();
    const user = authResult.user;
    if (authError || !user) return unavailable();

    const [{ data: profile, error: profileError }, contextResult, licenseResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("is_active")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.rpc("get_my_multibusiness_context"),
        supabase.rpc("get_my_business_license_availability"),
      ]);

    if (
      profileError ||
      !profile?.is_active ||
      contextResult.error ||
      licenseResult.error
    ) {
      return unavailable();
    }

    const licenseByBusinessId = new Map(
      ((licenseResult.data ?? []) as Array<{
        business_id: string;
        is_available: boolean;
      }>).map((license) => [license.business_id, license.is_available]),
    );
    const readableContexts = getOrderReadableBusinessContexts(
      ((contextResult.data ?? []) as BusinessContextRow[]).map((business) => ({
        ...business,
        business_license_available:
          licenseByBusinessId.get(business.business_id) === true,
      })),
    );
    const readableById = new Map(
      readableContexts.map((business) => [business.business_id, business]),
    );
    const expectedContexts = expectedBusinessIds.map((businessId) =>
      readableById.get(businessId),
    );
    if (expectedContexts.some((business) => !business)) return unavailable();

    const organizationIds = new Set(
      expectedContexts.map((business) => business!.organization_id),
    );
    if (organizationIds.size !== 1) return unavailable();
    const [organizationId] = organizationIds;

    if (expectedBusinessIds.length === 1) {
      const { data: order, error } = await supabase
        .from("orders")
        .select("id,business_id")
        .eq("creation_key", input.creationKey)
        .eq("created_by", user.id)
        .maybeSingle();

      if (error) return unavailable();
      if (!order) return { status: "not_found" };
      const status = classifyPosOrderRecovery(expectedBusinessIds, [order.business_id]);
      return status === "found" ? { status, orderIds: [order.id] } : { status };
    }

    const { data: batch, error: batchError } = await supabase
      .from("order_batches")
      .select("id")
      .eq("creation_key", input.creationKey)
      .eq("created_by", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (batchError) return unavailable();
    if (!batch) return { status: "not_found" };

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,business_id")
      .eq("order_batch_id", batch.id)
      .eq("created_by", user.id);

    if (ordersError || !orders) return unavailable();
    const status = classifyPosOrderRecovery(
      expectedBusinessIds,
      orders.map((order) => order.business_id),
    );
    return status === "found"
      ? { status, orderIds: orders.map((order) => order.id) }
      : { status };
  } catch {
    return unavailable();
  }
}
