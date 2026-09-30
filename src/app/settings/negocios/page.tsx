import { BusinessesManager } from "@/components/admin/businesses-manager";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessesSettingsPage() {
  const supabase = await createClient();
  const { data: contexts } = await supabase.rpc("get_my_multibusiness_context");
  const contextRows = (contexts ?? []) as Array<{
    capability_codes: string[] | null;
  }>;
  const showGlobalStaffLink = contextRows.some((context) =>
    context.capability_codes?.includes("organization.manage_global_waiters")
  );
  const showLicenseLink = contextRows.some((context) =>
    context.capability_codes?.includes("platform.manage_business_licenses")
  );

  return (
    <BusinessesManager
      showGlobalStaffLink={showGlobalStaffLink}
      showLicenseLink={showLicenseLink}
    />
  );
}
