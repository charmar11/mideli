"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, CircleAlert, Loader2, Save, Store, Truck } from "lucide-react";
import {
  getBusinessMarketplaceSettingsAction,
  listBusinessMarketplaceTargetsAction,
  saveBusinessMarketplaceSettingsAction,
  type MarketplacePlatform,
} from "@/lib/actions/business-marketplace";

type Target = { id: string; name: string; slug: string };
type Product = { menuItemId: string; name: string; menuPrice: number };
type PlatformDraft = {
  isEnabled: boolean;
  commissionRate: string;
  prices: Record<string, string>;
  availability: Record<string, boolean>;
};
type SettingsDraft = Record<MarketplacePlatform, PlatformDraft>;

const PLATFORM_INFO: Array<{ id: MarketplacePlatform; name: string; description: string }> = [
  { id: "uber_eats", name: "Uber Eats", description: "Los pedidos quedan marcados como pagados en la app." },
  { id: "didi_food", name: "Didi Food", description: "Elige en cada pedido si se pagó en la app o si el repartidor entrega efectivo." },
];

function emptyPlatformDraft(): PlatformDraft {
  return { isEnabled: false, commissionRate: "", prices: {}, availability: {} };
}

function emptyDraft(): SettingsDraft {
  return { uber_eats: emptyPlatformDraft(), didi_food: emptyPlatformDraft() };
}

function money(value: number) {
  return `$${new Intl.NumberFormat("es-MX").format(value)}`;
}

export function BusinessMarketplaceSettingsManager({ initialBusinessId }: { initialBusinessId: string | null }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(initialBusinessId ?? "");
  const [businessName, setBusinessName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [pageError, setPageError] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<"platform" | "business" | null>(null);
  const [targetsReady, setTargetsReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const loading = !targetsReady || Boolean(selectedBusinessId && !settingsReady);
  const enabledCount = useMemo(
    () => Number(draft.uber_eats.isEnabled) + Number(draft.didi_food.isEnabled),
    [draft],
  );

  useEffect(() => {
    let cancelled = false;
    void listBusinessMarketplaceTargetsAction().then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) {
        setPageError(result.error ?? "No se pudieron cargar tus negocios.");
        setTargetsReady(true);
        return;
      }
      setTargetMode(result.data.mode);
      setTargets(result.data.businesses);
      setTargetsReady(true);
      const requested = initialBusinessId && result.data.businesses.some((item) => item.id === initialBusinessId)
        ? initialBusinessId
        : result.data.businesses[0]?.id ?? "";
      setSelectedBusinessId(requested);
      if (!requested) {
        setPageError("Rincón 404 debe habilitar pedidos de plataformas en Negocios antes de configurarlos.");
      }
    }).catch(() => {
      if (cancelled) return;
      setPageError("No se pudieron cargar las plataformas.");
      setTargetsReady(true);
    });
    return () => { cancelled = true; };
  }, [initialBusinessId]);

  useEffect(() => {
    if (!selectedBusinessId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return null;
      setSettingsReady(false);
      setPageError(null);
      return getBusinessMarketplaceSettingsAction(selectedBusinessId);
    }).then((result) => {
      if (cancelled) return;
      if (!result) return;
      if (!result.success || !result.data) {
        setPageError(result.error ?? "No se pudo cargar la configuración.");
        setDraft(emptyDraft());
        setProducts([]);
        setSettingsReady(true);
        return;
      }
      const settingsData = result.data;
      const byPlatform = new Map(settingsData.settings.map((setting) => [setting.platform, setting]));
      const prices = new Map(settingsData.products.map((item) => [item.menuItemId, item]));
      const nextDraft = emptyDraft();
      for (const platform of PLATFORM_INFO) {
        const setting = byPlatform.get(platform.id);
        const savedPrices = new Map(settingsData.prices[platform.id].map((row) => [row.menuItemId, String(row.platformPrice)]));
        nextDraft[platform.id] = {
          isEnabled: setting?.isEnabled ?? false,
          commissionRate: setting?.commissionRate === null || setting?.commissionRate === undefined
            ? ""
            : String(setting.commissionRate),
          prices: Object.fromEntries([...prices.keys()].map((itemId) => [itemId, savedPrices.get(itemId) ?? ""])),
          availability: Object.fromEntries(
            [...prices.keys()].map((itemId) => [
              itemId,
              settingsData.availableProductIds[platform.id].includes(itemId),
            ]),
          ),
        };
      }
      setBusinessName(settingsData.businessName);
      setProducts(settingsData.products);
      setDraft(nextDraft);
      setDirty(false);
      setSettingsReady(true);
    }).catch(() => {
      if (cancelled) return;
      setPageError("No se pudo cargar la configuración.");
      setSettingsReady(true);
    });
    return () => { cancelled = true; };
  }, [selectedBusinessId]);

  function chooseBusiness(id: string) {
    if (id === selectedBusinessId) return;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres cambiar de negocio y descartarlos?")) return;
    setDirty(false);
    setSelectedBusinessId(id);
  }

  function updatePlatform(platform: MarketplacePlatform, patch: Partial<PlatformDraft>) {
    setDraft((current) => ({
      ...current,
      [platform]: { ...current[platform], ...patch },
    }));
    setDirty(true);
  }

  function save() {
    if (!selectedBusinessId || pending) return;
    startTransition(async () => {
      const platforms = PLATFORM_INFO.map(({ id }) => ({
        platform: id,
        isEnabled: draft[id].isEnabled,
        commissionRate: draft[id].commissionRate.trim() || null,
        prices: products.map((product) => ({
          menuItemId: product.menuItemId,
          price: draft[id].prices[product.menuItemId] ?? "",
          isAvailable: draft[id].availability[product.menuItemId] === true,
        })),
      }));
      const result = await saveBusinessMarketplaceSettingsAction({ businessId: selectedBusinessId, platforms });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo guardar.");
        return;
      }
      setDirty(false);
      toast.success("Configuración de plataformas guardada");
    });
  }

  return (
    <main className="min-h-full bg-background px-3 py-4 text-foreground sm:px-6 sm:py-7">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground">
          <ArrowLeft size={16} /> Volver al sistema
        </Link>

        <header className="mt-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand"><Store size={20} /></span>
              <div>
                <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Canales de venta</p>
                <h1 className="mt-1 font-heading text-xl font-bold sm:text-2xl">Pedidos de plataformas</h1>
                <p className="mt-1 max-w-2xl font-body text-sm leading-5 text-muted-foreground">
                  Configura Uber Eats y Didi Food sin mezclarlos con el reparto propio ni con los cobros locales.
                </p>
              </div>
            </div>
            {selectedBusinessId ? (
              <span className="rounded-full border border-success/25 bg-success/10 px-3 py-1.5 font-heading text-xs font-bold text-success">
                {enabledCount} de 2 activas
              </span>
            ) : null}
          </div>
          {targets.length > 1 ? (
            <label className="mt-5 block max-w-lg font-heading text-xs font-bold">
              Negocio
              <select value={selectedBusinessId} onChange={(event) => chooseBusiness(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
              </select>
            </label>
          ) : businessName ? (
            <p className="mt-4 font-heading text-sm font-bold">{businessName}</p>
          ) : null}
        </header>

        {pageError ? (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-warning" />
            <p className="font-body leading-5 text-muted-foreground">{pageError}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin text-brand" /> Cargando configuración…</div>
        ) : products.length > 0 ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {PLATFORM_INFO.map((platform) => (
              <section key={platform.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="border-b border-border p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${platform.id === "didi_food" ? "bg-warning/12 text-warning" : "bg-brand/12 text-brand"}`}><Truck size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-base font-bold">{platform.name}</h2>
                        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-heading text-xs font-bold">
                          <input type="checkbox" checked={draft[platform.id].isEnabled} onChange={(event) => updatePlatform(platform.id, { isEnabled: event.target.checked })} className="size-4 accent-brand" />
                          Activa
                        </label>
                      </div>
                      <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">{platform.description}</p>
                    </div>
                  </div>
                  <label className="mt-4 block font-heading text-xs font-bold text-muted-foreground">
                    Comisión de referencia (%) <span className="font-body font-normal">· opcional</span>
                    <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={draft[platform.id].commissionRate} onChange={(event) => updatePlatform(platform.id, { commissionRate: event.target.value })} placeholder="Sin configurar" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                    <span className="mt-1 block font-body text-[11px] font-normal leading-4">Es sólo una referencia. No altera caja ni calcula una liquidación.</span>
                  </label>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-heading text-sm font-bold">Productos y precios</h3>
                    <span className="font-body text-[11px] text-muted-foreground">Precio vacío = menú</span>
                  </div>
                  <p className="mt-1 font-body text-[11px] leading-4 text-muted-foreground">
                    Los productos nuevos empiezan desactivados aquí. Marca solo los que vendas en {platform.name}.
                  </p>
                  <div className="mt-3 max-h-[27rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {products.map((product) => (
                      <div key={product.menuItemId} className="grid gap-2 px-3 py-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate font-heading text-xs font-bold">{product.name}</span>
                            <span className="mt-0.5 block font-data text-[11px] text-muted-foreground">Precio del menú {money(product.menuPrice)}</span>
                          </span>
                          <label className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-1 font-heading text-[11px] font-bold">
                            <input
                              type="checkbox"
                              checked={draft[platform.id].availability[product.menuItemId] === true}
                              aria-label={`Disponible en ${platform.name}: ${product.name}`}
                              onChange={(event) => updatePlatform(platform.id, {
                                availability: {
                                  ...draft[platform.id].availability,
                                  [product.menuItemId]: event.target.checked,
                                },
                              })}
                              className="size-4 accent-brand"
                            />
                            Disponible
                          </label>
                        </div>
                        <label className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 font-body text-[11px] text-muted-foreground">
                          Precio en {platform.name}
                          <span className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-data text-xs">$</span>
                            <input
                              aria-label={`Precio ${platform.name} para ${product.name}`}
                              type="number"
                              min="0"
                              max="1000000"
                              step="1"
                              inputMode="numeric"
                              value={draft[platform.id].prices[product.menuItemId] ?? ""}
                              onChange={(event) => updatePlatform(platform.id, {
                                prices: {
                                  ...draft[platform.id].prices,
                                  [product.menuItemId]: event.target.value,
                                },
                              })}
                              placeholder={String(product.menuPrice)}
                              disabled={draft[platform.id].availability[product.menuItemId] !== true}
                              className="h-10 w-full rounded-lg border border-border bg-background pl-6 pr-2 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-body text-[11px] leading-4 text-muted-foreground">El precio configurado se guarda en cada pedido. Cambiarlo no modifica ventas anteriores.</p>
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {products.length > 0 ? (
          <div className="sticky bottom-2 z-10 mt-4 flex justify-end rounded-2xl border border-border bg-surface/95 p-2 shadow-float backdrop-blur sm:bottom-4 sm:p-3">
            <button type="button" onClick={save} disabled={pending || loading || !dirty || Boolean(pageError)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {pending ? <Loader2 size={17} className="animate-spin" /> : dirty ? <Save size={17} /> : <Check size={17} />}
              {pending ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        ) : null}

        {targetMode === "platform" ? (
          <p className="mt-4 font-body text-xs leading-5 text-muted-foreground">El acceso a cada plataforma se habilita por negocio desde Administración de Rincón 404. Los nuevos negocios comienzan desactivados.</p>
        ) : null}
      </div>
    </main>
  );
}
