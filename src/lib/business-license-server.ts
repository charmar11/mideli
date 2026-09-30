import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type BusinessLicenseGate = {
  verified: boolean;
  available: boolean;
  businessId: string | null;
  displayName: string | null;
  status:
    | "active"
    | "expired"
    | "suspended"
    | "unassigned"
    | "emergency"
    | "paused"
    | "unavailable";
};

function localDateIn(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export async function getBusinessLicenseGateBySlug(
  businessSlug: string,
): Promise<BusinessLicenseGate> {
  try {
    const admin = createAdminClient();
    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id,display_name,timezone,lifecycle_status")
      .eq("slug", businessSlug)
      .limit(1)
      .maybeSingle();
    if (businessError || !business) throw new Error("LICENSE_LOOKUP_UNAVAILABLE");

    const [licenseResult, emergencyResult] = await Promise.all([
      admin
        .from("business_licenses")
        .select("status,valid_until")
        .eq("business_id", business.id)
        .maybeSingle(),
      admin.from("app_license").select("status").eq("id", 1).maybeSingle(),
    ]);
    if (licenseResult.error || emergencyResult.error || !emergencyResult.data) {
      throw new Error("LICENSE_LOOKUP_UNAVAILABLE");
    }
    if (emergencyResult.data.status !== "active") {
      return {
        verified: true,
        available: false,
        businessId: business.id,
        displayName: business.display_name,
        status: "emergency",
      };
    }
    if (!licenseResult.data) {
      return {
        verified: true,
        available: false,
        businessId: business.id,
        displayName: business.display_name,
        status: "unassigned",
      };
    }
    if (licenseResult.data.status !== "active") {
      return {
        verified: true,
        available: false,
        businessId: business.id,
        displayName: business.display_name,
        status: "suspended",
      };
    }

    const timezone = business.timezone || "America/Hermosillo";
    const isCurrent = licenseResult.data.valid_until >= localDateIn(timezone);
    if (!isCurrent) {
      return {
        verified: true,
        available: false,
        businessId: business.id,
        displayName: business.display_name,
        status: "expired",
      };
    }
    if (business.lifecycle_status !== "active") {
      return {
        verified: true,
        available: false,
        businessId: business.id,
        displayName: business.display_name,
        status: business.lifecycle_status === "paused" ? "paused" : "unavailable",
      };
    }
    return {
      verified: true,
      available: true,
      businessId: business.id,
      displayName: business.display_name,
      status: "active",
    };
  } catch {
    return {
      verified: false,
      available: false,
      businessId: null,
      displayName: null,
      status: "unavailable",
    };
  }
}

export async function assertMideliWhatsappAvailable() {
  const gate = await getBusinessLicenseGateBySlug("mideli");
  if (!gate.verified || !gate.available) {
    throw new Error("WHATSAPP_BUSINESS_UNAVAILABLE");
  }
}

export async function isMideliWhatsappAvailable() {
  const gate = await getBusinessLicenseGateBySlug("mideli");
  return gate.verified && gate.available;
}
