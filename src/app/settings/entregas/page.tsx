import { BusinessDeliverySettingsManager } from "@/components/admin/business-delivery-settings-manager";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";

export default async function BusinessDeliverySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string | string[] }>;
}) {
  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const selected = await getSelectedBusinessContext(supabase);
  const requestedId = Array.isArray(params.businessId) ? params.businessId[0] : params.businessId;
  const initialBusinessId = requestedId ?? selected.businessId;

  return (
    <BusinessDeliverySettingsManager
      initialBusinessId={initialBusinessId}
      backHref={requestedId ? "/settings/negocios" : "/dashboard"}
    />
  );
}
