import { BusinessMarketplaceSettingsManager } from "@/components/admin/business-marketplace-settings-manager";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";

export default async function BusinessMarketplaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string | string[] }>;
}) {
  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const selected = await getSelectedBusinessContext(supabase);
  const requestedId = Array.isArray(params.businessId) ? params.businessId[0] : params.businessId;

  return <BusinessMarketplaceSettingsManager initialBusinessId={requestedId ?? selected.businessId} />;
}
