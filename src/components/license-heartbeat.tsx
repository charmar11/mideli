"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { APP_LICENSE_ID, resolveLicense, type AppLicenseRecord } from "@/lib/license";
import { createClient } from "@/lib/supabase/client";

const PROTECTED_PREFIXES = ["/dashboard", "/menu", "/settings"];

export function LicenseHeartbeat() {
  const pathname = usePathname();
  const isBlockedPage = pathname === "/sistema-bloqueado";
  const shouldCheck = isBlockedPage || PROTECTED_PREFIXES.some((route) => pathname.startsWith(route));

  const checkLicense = useCallback(async () => {
    if (!shouldCheck) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("app_license")
      .select("id, status, valid_until, updated_at")
      .eq("id", APP_LICENSE_ID)
      .maybeSingle();

    if (error || !data) return;
    const license = resolveLicense(data as AppLicenseRecord);

    if (!license.isActive && !isBlockedPage) {
      window.location.replace("/sistema-bloqueado");
    } else if (license.isActive && isBlockedPage) {
      window.location.replace("/dashboard");
    }
  }, [isBlockedPage, shouldCheck]);

  useEffect(() => {
    if (!shouldCheck) return;

    const supabase = createClient();
    void checkLicense();
    const interval = window.setInterval(() => void checkLicense(), 60_000);
    const channel = supabase
      .channel("app-license-heartbeat")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_license", filter: `id=eq.${APP_LICENSE_ID}` },
        () => void checkLicense()
      )
      .subscribe();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkLicense();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", checkLicense);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", checkLicense);
    };
  }, [checkLicense, shouldCheck]);

  return null;
}
