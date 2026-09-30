"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  getBrandThemeVariables,
  getBusinessBrandColors,
  PLATFORM_BRAND_COLORS,
} from "@/lib/business-branding";
import { resolveBusinessBrandingContext } from "@/lib/multibusiness/business-context-selection";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";

export function BusinessBrandingBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const businesses = useBusinessContextStore((state) => state.businesses);
  const loaded = useBusinessContextStore((state) => state.loaded);
  const legacyFallback = useBusinessContextStore((state) => state.legacyFallback);
  const ensureLoaded = useBusinessContextStore((state) => state.ensureLoaded);
  const isPublicEntry = pathname === "/" || pathname.startsWith("/login");
  const shouldLoad = !isPublicEntry && !pathname.startsWith("/api/");

  useEffect(() => {
    if (shouldLoad) void ensureLoaded();
  }, [ensureLoaded, shouldLoad]);

  const localBusiness = loaded ? resolveBusinessBrandingContext(businesses) : null;
  const colors = localBusiness
    ? getBusinessBrandColors(
        localBusiness.business_slug,
        localBusiness.business_brand_primary_color,
        localBusiness.business_brand_accent_color,
      )
    : legacyFallback
      ? getBusinessBrandColors("mideli")
      : PLATFORM_BRAND_COLORS;
  const active = isPublicEntry || shouldLoad;

  return (
    <div
      className="contents"
      data-business-theme={active ? (localBusiness ? "local" : "platform") : undefined}
      style={active ? getBrandThemeVariables(colors) : undefined}
    >
      {children}
    </div>
  );
}
