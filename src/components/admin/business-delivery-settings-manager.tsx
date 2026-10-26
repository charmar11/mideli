"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getBusinessDeliverySettingsAction,
  listBusinessDeliverySettingsTargetsAction,
  resolveBusinessDeliveryOriginAction,
  saveBusinessDeliverySettingsAction,
  type DeliverySettingsTarget,
} from "@/lib/actions/business-delivery-settings";
import {
  googleMapsSearchUrl,
  type BusinessDeliveryRate,
  type BusinessDeliverySettings,
  type BusinessDeliverySurcharge,
} from "@/lib/business-delivery";

type DeliveryDraft = Omit<BusinessDeliverySettings, "businessId">;

function emptyDraft(): DeliveryDraft {
  return {
    originAddress: "",
    originLatitude: null,
    originLongitude: null,
    rates: [],
    surcharges: [],
  };
}

function moneyInput(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function statusLabel(status: string) {
  if (status === "active") return "Activo";
  if (status === "paused") return "Pausado";
  if (status === "draft") return "Borrador";
  return status;
}

export function BusinessDeliverySettingsManager({
  initialBusinessId,
  backHref,
}: {
  initialBusinessId: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<DeliverySettingsTarget[]>([]);
  const [mode, setMode] = useState<"platform" | "business" | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState(initialBusinessId ?? "");
  const [businessName, setBusinessName] = useState("");
  const [draft, setDraft] = useState<DeliveryDraft>(emptyDraft);
  const [originLookup, setOriginLookup] = useState("");
  const [targetsReady, setTargetsReady] = useState(false);
  const [settingsBusinessId, setSettingsBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const loading = !targetsReady || Boolean(selectedBusinessId && settingsBusinessId !== selectedBusinessId);

  const mapsHref = useMemo(() => googleMapsSearchUrl({
    latitude: draft.originLatitude,
    longitude: draft.originLongitude,
    address: draft.originAddress,
  }), [draft.originAddress, draft.originLatitude, draft.originLongitude]);

  useEffect(() => {
    let cancelled = false;
    void listBusinessDeliverySettingsTargetsAction().then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudieron cargar tus negocios.");
        setTargetsReady(true);
        return;
      }
      setMode(result.data.mode);
      setTargets(result.data.businesses);
      setTargetsReady(true);
      const requested = initialBusinessId && result.data.businesses.some((business) => business.id === initialBusinessId)
        ? initialBusinessId
        : result.data.businesses[0]?.id ?? "";
      setSelectedBusinessId(requested);
      if (!requested) {
        setError("No hay un negocio disponible para configurar.");
      }
    }).catch(() => {
      if (cancelled) return;
      setError("No se pudieron cargar tus negocios.");
      setTargetsReady(true);
    });
    return () => { cancelled = true; };
  }, [initialBusinessId]);

  useEffect(() => {
    if (!selectedBusinessId || !mode) return;
    let cancelled = false;
    void getBusinessDeliverySettingsAction(selectedBusinessId).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudo cargar la configuración.");
        setDraft(emptyDraft());
        setBusinessName(targets.find((business) => business.id === selectedBusinessId)?.name ?? "");
        setOriginLookup("");
        setDirty(false);
        setSettingsBusinessId(selectedBusinessId);
        return;
      }
      const settings = result.data;
      setError(null);
      setBusinessName(settings.businessName);
      setDraft({
        originAddress: settings.originAddress,
        originLatitude: settings.originLatitude,
        originLongitude: settings.originLongitude,
        rates: settings.rates,
        surcharges: settings.surcharges,
      });
      setOriginLookup(settings.originAddress);
      setDirty(false);
      setSettingsBusinessId(selectedBusinessId);
    }).catch(() => {
      if (cancelled) return;
      setError("No se pudo cargar la configuración.");
      setDirty(false);
      setSettingsBusinessId(selectedBusinessId);
    });
    return () => { cancelled = true; };
  }, [mode, selectedBusinessId, targets]);

  useEffect(() => {
    if (!selectedBusinessId || !mode) return;
    const nextUrl = mode === "platform"
      ? `/settings/entregas?businessId=${encodeURIComponent(selectedBusinessId)}`
      : "/settings/entregas";
    router.replace(nextUrl, { scroll: false });
  }, [mode, router, selectedBusinessId]);

  function chooseBusiness(value: string) {
    if (value === selectedBusinessId) return;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres cambiar de negocio y descartarlos?")) return;
    setError(null);
    setDirty(false);
    setSelectedBusinessId(value);
  }

  function updateDraft(patch: Partial<DeliveryDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function updateRate(rateId: string, patch: Partial<BusinessDeliveryRate>) {
    updateDraft({ rates: draft.rates.map((rate) => rate.id === rateId ? { ...rate, ...patch } : rate) });
  }

  function addRate() {
    const lastRate = [...draft.rates].sort((left, right) => left.maxDistanceKm - right.maxDistanceKm).at(-1);
    if (lastRate && lastRate.maxDistanceKm >= 100) return;
    const start = lastRate?.maxDistanceKm ?? 0;
    const nextRate: BusinessDeliveryRate = {
      id: crypto.randomUUID(),
      minDistanceKm: start,
      maxDistanceKm: Math.min(100, start + 1),
      fee: lastRate?.fee ?? 0,
      isActive: true,
    };
    updateDraft({ rates: [...draft.rates, nextRate] });
  }

  function updateSurcharge(surchargeId: string, patch: Partial<BusinessDeliverySurcharge>) {
    updateDraft({
      surcharges: draft.surcharges.map((surcharge) =>
        surcharge.id === surchargeId ? { ...surcharge, ...patch } : surcharge),
    });
  }

  function addSurcharge() {
    updateDraft({
      surcharges: [...draft.surcharges, {
        id: crypto.randomUUID(),
        colonyName: "",
        aliases: [],
        fee: 0,
        isActive: true,
      }],
    });
  }

  function resolveOrigin() {
    if (!selectedBusinessId) return;
    startTransition(async () => {
      const result = await resolveBusinessDeliveryOriginAction(selectedBusinessId, originLookup);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "No se pudo confirmar el origen.");
        return;
      }
      setDraft((current) => ({
        ...current,
        originAddress: result.data?.address ?? current.originAddress,
        originLatitude: result.data?.latitude ?? null,
        originLongitude: result.data?.longitude ?? null,
      }));
      setOriginLookup(result.data.address);
      setDirty(true);
      toast.success("Ubicación del local confirmada en Maps");
    });
  }

  function save() {
    if (!selectedBusinessId) return;
    if (originLookup.trim() && (
      !draft.originAddress ||
      draft.originLatitude === null ||
      draft.originLongitude === null
    )) {
      toast.error("Confirma la ubicación del local en Maps antes de guardar.");
      return;
    }
    startTransition(async () => {
      const result = await saveBusinessDeliverySettingsAction({
        businessId: selectedBusinessId,
        ...draft,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "No se pudo guardar la configuración.");
        return;
      }
      setDraft({
        originAddress: result.data.originAddress,
        originLatitude: result.data.originLatitude,
        originLongitude: result.data.originLongitude,
        rates: result.data.rates,
        surcharges: result.data.surcharges,
      });
      setOriginLookup(result.data.originAddress);
      setDirty(false);
      toast.success("Configuración de entregas guardada");
    });
  }

  return (
    <main className="mideli-settings-screen min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <Link
          href={backHref}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <MapPin size={19} />
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-bold text-foreground">Entregas</h1>
          <p className="flex items-center gap-1 truncate font-body text-xs text-muted-foreground">
            <Building2 size={12} /> {businessName || "Configuración por negocio"}
          </p>
        </div>
      </header>

      <div className="mideli-page-scroll pos-scroll overflow-y-auto p-3 pb-10 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-5xl">
          {targets.length > 1 ? (
            <label className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 font-heading text-xs font-bold text-muted-foreground">Configurar negocio</span>
              <select
                aria-label="Negocio para configurar entregas"
                value={selectedBusinessId}
                onChange={(event) => chooseBusiness(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-heading text-sm font-bold text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {targets.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name} · {statusLabel(business.lifecycleStatus)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? (
            <section role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4">
              <AlertCircle size={19} className="mt-0.5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="font-heading text-sm font-bold">No se pudo abrir Entregas</p>
                <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">{error}</p>
              </div>
            </section>
          ) : loading ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-surface font-body text-sm text-muted-foreground" role="status">
              Cargando configuración de {businessName || "entregas"}…
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
              <section className="py-5 sm:py-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-heading text-base font-bold text-foreground">Punto de salida</h2>
                    <p className="mt-1 max-w-2xl font-body text-sm leading-5 text-muted-foreground">
                      Esta dirección y ubicación se usarán para calcular distancias y para el enlace de Maps del repartidor.
                    </p>
                  </div>
                  {draft.originLatitude !== null && draft.originLongitude !== null ? (
                    <span className="inline-flex items-center gap-1.5 self-start font-body text-xs font-semibold text-success sm:self-auto">
                      <CheckCircle2 size={15} /> Ubicación confirmada
                    </span>
                  ) : null}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Dirección o enlace del local en Google Maps</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={originLookup}
                      maxLength={500}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOriginLookup(value);
                        setDraft((current) => ({
                          ...current,
                          originAddress: value === current.originAddress ? current.originAddress : "",
                          originLatitude: value === current.originAddress ? current.originLatitude : null,
                          originLongitude: value === current.originAddress ? current.originLongitude : null,
                        }));
                        setDirty(true);
                      }}
                      placeholder="Calle y número o pega un enlace de Maps"
                      className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-body text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                    <button
                      type="button"
                      onClick={resolveOrigin}
                      disabled={pending || originLookup.trim().length < 5}
                      className="inline-flex h-12 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-xl border border-brand/35 px-4 font-heading text-xs font-bold text-brand hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MapPin size={15} /> Confirmar ubicación
                    </button>
                  </div>
                </label>
                {draft.originAddress ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-heading text-xs font-bold text-foreground">{draft.originAddress}</p>
                      <p className="mt-1 font-data text-[11px] text-muted-foreground">
                        {draft.originLatitude !== null && draft.originLongitude !== null
                          ? `${draft.originLatitude.toFixed(6)}, ${draft.originLongitude.toFixed(6)}`
                          : "Falta confirmar el punto en Maps"}
                      </p>
                    </div>
                    {mapsHref ? (
                      <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 font-heading text-xs font-bold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                        Ver punto <ExternalLink size={13} />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 font-body text-xs text-warning">Sin un punto confirmado, no se podrá calcular el envío ni compartir el origen correcto.</p>
                )}
              </section>

              <section className="py-5 sm:py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-heading text-base font-bold text-foreground">Tarifas por distancia</h2>
                    <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">Se usa la distancia en auto de Google Maps. Los tramos no deben traslaparse.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addRate}
                    disabled={draft.rates.length >= 100 || Math.max(0, ...draft.rates.map((rate) => rate.maxDistanceKm)) >= 100}
                    className="inline-flex h-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 self-start rounded-lg border border-border px-3 font-heading text-xs font-bold text-foreground hover:bg-surface-raised disabled:opacity-50 sm:self-auto"
                  >
                    <Plus size={15} /> Agregar tramo
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {draft.rates.map((rate) => (
                    <div key={rate.id} className="grid grid-cols-2 items-end gap-2 rounded-xl bg-background p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                      <label className="min-w-0">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Desde km</span>
                        <input type="number" min="0" max="100" step="0.1" value={rate.minDistanceKm} onChange={(event) => updateRate(rate.id, { minDistanceKm: Number(event.target.value) })} className="h-11 w-full rounded-lg border border-border bg-surface px-2 font-data text-sm text-foreground outline-none focus:border-brand" />
                      </label>
                      <label className="min-w-0">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Hasta km</span>
                        <input type="number" min="0.1" max="100" step="0.1" value={rate.maxDistanceKm} onChange={(event) => updateRate(rate.id, { maxDistanceKm: Number(event.target.value) })} className="h-11 w-full rounded-lg border border-border bg-surface px-2 font-data text-sm text-foreground outline-none focus:border-brand" />
                      </label>
                      <label className="col-span-2 min-w-0 sm:col-span-1">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Envío estimado · MXN</span>
                        <span className="flex h-11 items-center rounded-lg border border-border bg-surface px-2 font-data text-sm text-foreground focus-within:border-brand"><span className="mr-1 text-muted-foreground">$</span><input type="number" min="0" max="10000" step="1" value={moneyInput(rate.fee)} onChange={(event) => updateRate(rate.id, { fee: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent outline-none" /></span>
                      </label>
                      <label className="col-span-1 flex min-h-11 items-center gap-2 font-body text-xs text-muted-foreground sm:col-span-1 sm:px-2">
                        <input type="checkbox" checked={rate.isActive} onChange={(event) => updateRate(rate.id, { isActive: event.target.checked })} className="size-5 accent-brand" /> Activo
                      </label>
                      <button type="button" aria-label={`Eliminar tramo de ${rate.minDistanceKm} a ${rate.maxDistanceKm} km`} disabled={draft.rates.length <= 1} onClick={() => updateDraft({ rates: draft.rates.filter((row) => row.id !== rate.id) })} className="col-span-1 flex h-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-30 sm:col-span-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="py-5 sm:py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-heading text-base font-bold text-foreground">Recargos por colonia</h2>
                    <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">Opcionales; se agregan al tramo de distancia. Puedes guardar alias para nombres alternativos en Maps.</p>
                  </div>
                  <button type="button" onClick={addSurcharge} disabled={draft.surcharges.length >= 250} className="inline-flex h-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 self-start rounded-lg border border-border px-3 font-heading text-xs font-bold text-foreground hover:bg-surface-raised disabled:opacity-50 sm:self-auto">
                    <Plus size={15} /> Agregar colonia
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {draft.surcharges.map((surcharge) => (
                    <div key={surcharge.id} className="grid grid-cols-1 gap-2 rounded-xl bg-background p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(7rem,0.6fr)_auto_auto] sm:items-end">
                      <label className="min-w-0">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Colonia</span>
                        <input value={surcharge.colonyName} maxLength={100} onChange={(event) => updateSurcharge(surcharge.id, { colonyName: event.target.value })} placeholder="Ej. Villa Bonita" className="h-11 w-full rounded-lg border border-border bg-surface px-2 font-body text-sm text-foreground outline-none focus:border-brand" />
                      </label>
                      <label className="min-w-0">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Alias · separados por coma</span>
                        <input value={surcharge.aliases.join(", ")} maxLength={500} onChange={(event) => updateSurcharge(surcharge.id, { aliases: event.target.value.split(",").map((alias) => alias.trim()).filter(Boolean) })} placeholder="Otro nombre que aparece en Maps" className="h-11 w-full rounded-lg border border-border bg-surface px-2 font-body text-sm text-foreground outline-none focus:border-brand" />
                      </label>
                      <label className="min-w-0">
                        <span className="mb-1 block font-body text-[11px] text-muted-foreground">Recargo · MXN</span>
                        <span className="flex h-11 items-center rounded-lg border border-border bg-surface px-2 font-data text-sm text-foreground focus-within:border-brand"><span className="mr-1 text-muted-foreground">$</span><input type="number" min="0" max="10000" step="1" value={moneyInput(surcharge.fee)} onChange={(event) => updateSurcharge(surcharge.id, { fee: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent outline-none" /></span>
                      </label>
                      <label className="flex min-h-11 items-center gap-2 font-body text-xs text-muted-foreground sm:px-2">
                        <input type="checkbox" checked={surcharge.isActive} onChange={(event) => updateSurcharge(surcharge.id, { isActive: event.target.checked })} className="size-5 accent-brand" /> Activo
                      </label>
                      <button type="button" aria-label={`Eliminar recargo ${surcharge.colonyName || "nuevo"}`} onClick={() => updateDraft({ surcharges: draft.surcharges.filter((row) => row.id !== surcharge.id) })} className="flex h-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {draft.surcharges.length === 0 ? <p className="rounded-xl bg-background px-3 py-4 font-body text-sm text-muted-foreground">No hay recargos por colonia. Puedes agregar uno cuando lo necesites.</p> : null}
                </div>
              </section>

              <section className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-6">
                <div className="flex items-start gap-2 font-body text-xs leading-5 text-muted-foreground">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
                  <p>La tarifa es solo un estimado para el local y el cliente. El mensaje al repartidor no muestra el monto del envío.</p>
                </div>
                <button type="button" onClick={save} disabled={pending || loading || !dirty} className="inline-flex h-12 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-xl bg-success px-5 font-heading text-sm font-bold text-white shadow-sm hover:bg-success/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success disabled:cursor-not-allowed disabled:opacity-50">
                  <Save size={16} /> {pending ? "Guardando…" : "Guardar cambios"}
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
