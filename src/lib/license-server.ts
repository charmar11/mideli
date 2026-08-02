import "server-only";

import { APP_LICENSE_ID, resolveLicense, type AppLicenseRecord } from "@/lib/license";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAppLicense() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_license")
      .select("id, status, valid_until, updated_at")
      .eq("id", APP_LICENSE_ID)
      .maybeSingle();

    if (error) {
      console.error("No se pudo consultar la licencia", error.message);
      return resolveLicense(null);
    }

    return resolveLicense(data as AppLicenseRecord | null);
  } catch (error) {
    console.error("No se pudo consultar la licencia", error);
    return resolveLicense(null);
  }
}
