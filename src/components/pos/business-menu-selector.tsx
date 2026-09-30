"use client";

import { Building2, Check, ChevronDown, CircleOff, Loader2, PauseCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBusinessBrandColors,
  getBusinessLogoUrl,
  getReadableBrandForeground,
} from "@/lib/business-branding";
import {
  getMenuSelectableBusinessContexts,
  getOrderableBusinessContexts,
} from "@/lib/multibusiness/business-context-selection";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import { useCatalogStore } from "@/lib/stores/catalog-store";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Changes only the catalog shown inside the current comanda. It deliberately
 * does not change the global business cookie or the authorization context.
 */
export function BusinessMenuSelector() {
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
  const businessContextLoaded = useBusinessContextStore((state) => state.loaded);
  const ensureLoaded = useBusinessContextStore((state) => state.ensureLoaded);
  const catalogBusinessId = useCatalogStore((state) => state.catalogBusinessId);
  const catalogLoading = useCatalogStore((state) => state.loading);
  const clearCatalog = useCatalogStore((state) => state.clearCatalog);
  const fetchCatalogForBusiness = useCatalogStore(
    (state) => state.fetchCatalogForBusiness
  );
  const setActiveCategory = useUIStore((state) => state.setActiveCategory);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const [switchingBusinessId, setSwitchingBusinessId] = useState<string | null>(null);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const visibleBusinesses = useMemo(
    () => getMenuSelectableBusinessContexts(businesses),
    [businesses]
  );
  const orderableBusinesses = useMemo(
    () => getOrderableBusinessContexts(businesses),
    [businesses],
  );
  const activeBusinessId = orderableBusinesses.some(
    (business) => business.business_id === catalogBusinessId
  )
    ? catalogBusinessId
    : orderableBusinesses.find(
        (business) => business.business_id === selectedBusinessId
    )?.business_id ?? orderableBusinesses[0]?.business_id ?? null;
  const activeBusiness = orderableBusinesses.find(
    (business) => business.business_id === activeBusinessId,
  ) ?? null;
  const activeBrand = activeBusiness
    ? getBusinessBrandColors(
        activeBusiness.business_slug,
        activeBusiness.business_brand_primary_color,
        activeBusiness.business_brand_accent_color,
      )
    : null;

  useEffect(() => {
    if (
      !businessContextLoaded ||
      !catalogBusinessId ||
      visibleBusinesses.some(
        (business) => business.business_id === catalogBusinessId
      )
    ) {
      return;
    }

    clearCatalog();
    setActiveCategory(null);
    setSearchQuery("");
    if (activeBusinessId) {
      void fetchCatalogForBusiness(activeBusinessId, true);
    }
  }, [
    activeBusinessId,
    businessContextLoaded,
    catalogBusinessId,
    clearCatalog,
    fetchCatalogForBusiness,
    setActiveCategory,
    setSearchQuery,
    visibleBusinesses,
  ]);

  if (
    visibleBusinesses.length === 0 ||
    (visibleBusinesses.length === 1 && orderableBusinesses.length === 1)
  ) return null;

  async function handleBusinessChange(businessId: string) {
    const business = visibleBusinesses.find(
      (candidate) => candidate.business_id === businessId
    );
    if (
      !business ||
      business.business_lifecycle_status !== "active" ||
      business.business_license_available !== true
    ) return;
    if (businessId === activeBusinessId) return;

    setSwitchingBusinessId(businessId);
    setActiveCategory(null);
    setSearchQuery("");
    const loaded = await fetchCatalogForBusiness(businessId);
    setSwitchingBusinessId(null);

    if (!loaded) {
      toast.error("No se pudo cargar el menú", {
        description: "Conservamos la comanda actual. Intenta de nuevo.",
      });
    }
  }

  return (
    <section
      aria-label="Menús de los negocios"
      className="mideli-pos-business-selector shrink-0 border-b border-border bg-surface px-3 py-1.5 sm:px-4 sm:py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <label className="sr-only" htmlFor="pos-business-menu">
          Seleccionar menú del negocio
        </label>
        <div className="relative min-w-0 flex-1 xl:hidden">
          <Building2
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: activeBrand?.primary }}
          />
          <select
            id="pos-business-menu"
            value={activeBusinessId ?? ""}
            disabled={Boolean(switchingBusinessId)}
            onChange={(event) => void handleBusinessChange(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-10 font-heading text-sm font-bold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
            style={{ borderColor: activeBrand?.accent }}
          >
            {!activeBusinessId ? (
              <option value="" disabled>Sin menú disponible</option>
            ) : null}
            {visibleBusinesses.map((business) => (
              <option
                key={business.business_id}
                value={business.business_id}
                disabled={
                  business.business_lifecycle_status !== "active" ||
                  business.business_license_available !== true
                }
              >
                {business.business_display_name}
                {business.business_license_available !== true
                  ? " · No disponible"
                  : business.business_lifecycle_status !== "active"
                    ? " · Pausado"
                    : ""}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {catalogLoading || switchingBusinessId ? (
              <Loader2 size={16} className="animate-spin text-brand" />
            ) : (
              <ChevronDown size={16} />
            )}
          </span>
        </div>

        <div
        role="tablist"
        aria-label="Seleccionar menú del negocio"
          className="pos-scroll hidden min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5 xl:flex"
        >
          {visibleBusinesses.map((business) => {
            const isActive = business.business_id === activeBusinessId;
            const isPaused = business.business_lifecycle_status !== "active";
            const isUnavailable = business.business_license_available !== true;
            const isSwitching = switchingBusinessId === business.business_id;
            const brand = getBusinessBrandColors(
              business.business_slug,
              business.business_brand_primary_color,
              business.business_brand_accent_color,
            );
            const logoUrl = getBusinessLogoUrl(business.business_brand_logo_path);

            return (
              <button
                key={business.business_id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={isPaused || isUnavailable || Boolean(switchingBusinessId)}
                onClick={() => void handleBusinessChange(business.business_id)}
                style={isActive ? {
                  backgroundColor: brand.primary,
                  borderColor: brand.accent,
                  color: getReadableBrandForeground(brand.primary),
                } : undefined}
                className={`inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-2 rounded-xl border px-3.5 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive
                    ? "shadow-sm"
                  : isUnavailable
                    ? "border-border bg-background text-muted-foreground/60"
                    : isPaused
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground"
                }`}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="size-5 shrink-0 rounded object-contain" />
                ) : isUnavailable ? (
                  <CircleOff size={15} aria-hidden />
                ) : isPaused ? (
                  <PauseCircle size={15} aria-hidden />
                ) : isSwitching ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : isActive ? (
                  <Check size={15} strokeWidth={3} aria-hidden />
                ) : (
                  <Building2 size={15} aria-hidden />
                )}
                <span>{business.business_display_name}</span>
                {isUnavailable ? (
                  <span className="text-[10px]">No disponible</span>
                ) : isPaused ? (
                  <span className="text-[10px]">Pausado</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
