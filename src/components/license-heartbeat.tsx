"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { canSelectBusinessContext } from "@/lib/multibusiness/business-context-selection";
import { createClient } from "@/lib/supabase/client";
import type { BusinessContextRow } from "@/types/multibusiness";

const PROTECTED_PREFIXES = ["/dashboard", "/menu", "/settings"];

export function LicenseHeartbeat() {
  const pathname = usePathname();
  const isBlockedPage = pathname === "/sistema-bloqueado";
  const shouldCheck = isBlockedPage || PROTECTED_PREFIXES.some((route) => pathname.startsWith(route));

  const checkAccess = useCallback(async () => {
    if (!shouldCheck) return;

    const supabase = createClient();
    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (contextResult.error) return;

    const contexts = (contextResult.data ?? []) as BusinessContextRow[];
    const availabilityByBusiness = new Map(
      ((licenseResult.data ?? []) as Array<{
        business_id: string;
        is_available: boolean;
      }>).map((row) => [row.business_id, row.is_available]),
    );
    const licenseVerified = !licenseResult.error;
    const scopedContexts = contexts.map((context) => ({
      ...context,
      business_license_available:
        licenseVerified && availabilityByBusiness.get(context.business_id) === true,
    }));
    const hasPlatformAccess = scopedContexts.some((context) =>
      context.capability_codes.some((code) => code.startsWith("platform.")),
    );
    const hasGlobalWaiterAccess = scopedContexts.some((context) =>
      context.capability_codes.includes("organization.manage_global_waiters"),
    );
    const hasAvailableBusiness = scopedContexts.some(
      (context) =>
        context.business_lifecycle_status === "active" &&
        context.business_license_available === true &&
        canSelectBusinessContext(context),
    );
    const hasDraftSetup = scopedContexts.some(
      (context) =>
        context.business_lifecycle_status === "draft" &&
        context.capability_codes.some((code) =>
          [
            "business.manage_catalog",
            "business.manage_inventory",
            "business.manage_staff",
          ].includes(code),
        ),
    );
    const shouldLock =
      contexts.length > 0 &&
      !hasPlatformAccess &&
      !hasGlobalWaiterAccess &&
      !hasAvailableBusiness &&
      !hasDraftSetup;

    if (shouldLock && !isBlockedPage) {
      window.location.replace("/sistema-bloqueado");
    } else if (!shouldLock && isBlockedPage) {
      window.location.replace(
        hasPlatformAccess ? "/settings/licencias" : "/dashboard",
      );
    }
  }, [isBlockedPage, shouldCheck]);

  useEffect(() => {
    if (!shouldCheck) return;

    void checkAccess();
    const interval = window.setInterval(() => void checkAccess(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkAccess();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [checkAccess, shouldCheck]);

  return null;
}
