"use client";

import { Building2, Check, Loader2, PauseCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  const ensureLoaded = useBusinessContextStore((state) => state.ensureLoaded);
  const catalogBusinessId = useCatalogStore((state) => state.catalogBusinessId);
  const catalogLoading = useCatalogStore((state) => state.loading);
  const fetchCatalogForBusiness = useCatalogStore(
    (state) => state.fetchCatalogForBusiness
  );
  const setActiveCategory = useUIStore((state) => state.setActiveCategory);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const [switchingBusinessId, setSwitchingBusinessId] = useState<string | null>(null);
  const activeBusinessId = catalogBusinessId ?? selectedBusinessId;

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const visibleBusinesses = useMemo(
    () =>
      businesses.filter(
        (business) =>
          business.business_lifecycle_status !== "archived" &&
          business.business_lifecycle_status !== "retired"
      ),
    [businesses]
  );

  if (visibleBusinesses.length <= 1) return null;

  async function handleBusinessChange(businessId: string) {
    const business = visibleBusinesses.find(
      (candidate) => candidate.business_id === businessId
    );
    if (!business || business.business_lifecycle_status !== "active") return;
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
      className="shrink-0 border-b border-border bg-surface/80 px-3 py-2.5 sm:px-4"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
          <Building2 size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-xs font-bold text-foreground">Menús</p>
          <p className="font-body text-[11px] text-muted-foreground">
            Cambia de negocio sin perder la comanda
          </p>
        </div>
        {catalogLoading || switchingBusinessId ? (
          <Loader2 size={15} className="ml-auto animate-spin text-brand" aria-label="Cargando menú" />
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Seleccionar menú del negocio"
        className="pos-scroll flex min-w-0 gap-2 overflow-x-auto pb-0.5"
      >
        {visibleBusinesses.map((business) => {
          const isActive = business.business_id === activeBusinessId;
          const isPaused = business.business_lifecycle_status !== "active";
          const isSwitching = switchingBusinessId === business.business_id;

          return (
            <button
              key={business.business_id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={isPaused || Boolean(switchingBusinessId)}
              onClick={() => void handleBusinessChange(business.business_id)}
              className={`inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-2 rounded-xl border px-3.5 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${
                isActive
                  ? "border-brand bg-brand text-white shadow-md shadow-brand/20"
                  : isPaused
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-border bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground"
              }`}
            >
              {isPaused ? (
                <PauseCircle size={15} aria-hidden />
              ) : isSwitching ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : isActive ? (
                <Check size={15} strokeWidth={3} aria-hidden />
              ) : (
                <Building2 size={15} aria-hidden />
              )}
              <span>{business.business_display_name}</span>
              {isPaused ? <span className="text-[10px]">Pausado</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
