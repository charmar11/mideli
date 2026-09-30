"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBusinessBrandColors,
  getBusinessLogoUrl,
  getReadableBrandForeground,
} from "@/lib/business-branding";
import {
  getBusinessLicenseEventsAction,
  manageBusinessLicenseAction,
  setPlatformEmergencySuspensionAction,
  type BusinessLicenseMutation,
} from "@/lib/actions/business-licenses";

type LicenseStatus = "active" | "expiring" | "expired" | "suspended" | "unlicensed";

export interface PlatformBusinessLicense {
  business_id: string;
  organization_id: string;
  slug: string;
  display_name: string;
  timezone: string;
  lifecycle_status: string;
  brand_logo_path: string | null;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  license_status: LicenseStatus;
  valid_until: string | null;
  days_remaining: number | null;
  is_available: boolean;
  global_emergency_suspended: boolean;
}

type LicenseOperation = BusinessLicenseMutation["operation"];

type LicenseEvent = {
  id: string;
  actor_name: string;
  event_type: string;
  previous_status: string | null;
  next_status: string;
  previous_valid_until: string | null;
  next_valid_until: string;
  note: string;
  created_at: string;
};

const STATUS_COPY: Record<LicenseStatus, { label: string; className: string }> = {
  active: { label: "Vigente", className: "bg-success/12 text-success" },
  expiring: { label: "Por vencer", className: "bg-warning/12 text-warning" },
  expired: { label: "Vencida", className: "bg-destructive/10 text-destructive" },
  suspended: { label: "Suspendida", className: "bg-destructive/10 text-destructive" },
  unlicensed: { label: "Sin asignar", className: "bg-surface-raised text-muted-foreground" },
};

const EVENT_COPY: Record<string, string> = {
  activated: "Licencia asignada",
  renewed: "Licencia renovada",
  date_changed: "Fecha modificada",
  suspended: "Licencia suspendida",
  reactivated: "Licencia reactivada",
  migrated: "Vigencia inicial migrada",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

function operationTitle(operation: LicenseOperation, businessName: string) {
  const labels: Record<LicenseOperation, string> = {
    activate: "Asignar licencia",
    renew: "Renovar licencia",
    set_date: "Cambiar vigencia",
    suspend: "Suspender licencia",
    reactivate: "Reactivar licencia",
  };
  return `${labels[operation]} · ${businessName}`;
}

function LicenseActionDialog({
  business,
  operation,
  minimumDate,
  busy,
  onClose,
  onSubmit,
}: {
  business: PlatformBusinessLicense;
  operation: LicenseOperation;
  minimumDate: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: BusinessLicenseMutation) => void;
}) {
  const [months, setMonths] = useState(1);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [validUntil, setValidUntil] = useState(minimumDate);
  const [note, setNote] = useState("");
  const requiresDate = operation === "set_date" || (operation === "activate" && useCustomDate);
  const needsMonths = operation === "renew" || (operation === "activate" && !useCustomDate);
  const requiresNote = operation === "suspend";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation === "activate") {
      onSubmit({
        operation,
        businessId: business.business_id,
        ...(useCustomDate ? { validUntil } : { months }),
      });
      return;
    }
    if (operation === "renew") {
      onSubmit({ operation, businessId: business.business_id, months });
      return;
    }
    if (operation === "set_date") {
      onSubmit({ operation, businessId: business.business_id, validUntil });
      return;
    }
    onSubmit({ operation, businessId: business.business_id, note });
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-action-title"
        onSubmit={submit}
        className="w-full max-w-lg rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <CalendarDays size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="license-action-title" className="font-heading text-lg font-bold text-foreground">
              {operationTitle(operation, business.display_name)}
            </h2>
            <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">
              La vigencia se administra manualmente por negocio. No se registran montos ni saldos.
            </p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground">
            <X size={18} aria-hidden />
          </button>
        </div>

        {needsMonths ? (
          <fieldset className="mt-6">
            <legend className="mb-2 font-heading text-sm font-bold text-foreground">
              {operation === "renew" ? "Extender por" : "Asignar por"}
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 6, 12].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={months === value}
                  onClick={() => setMonths(value)}
                  className={`min-h-12 rounded-xl border font-heading text-sm font-bold transition-colors ${
                    months === value
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value} {value === 1 ? "mes" : "meses"}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {operation === "activate" ? (
          <label className="mt-4 flex min-h-11 items-center gap-2 font-body text-sm text-muted-foreground">
            <input type="checkbox" checked={useCustomDate} onChange={(event) => setUseCustomDate(event.target.checked)} className="size-4 accent-brand" />
            Elegir una fecha final en vez de meses
          </label>
        ) : null}

        {requiresDate ? (
          <label className="mt-5 block font-heading text-sm font-bold text-foreground">
            Fecha de vigencia
            <input
              type="date"
              min={minimumDate}
              required
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-medium text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
        ) : null}

        {requiresNote ? (
          <label className="mt-5 block font-heading text-sm font-bold text-foreground">
            Motivo de suspensión
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 font-body text-sm font-medium text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Describe por qué se suspende el acceso"
            />
          </label>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={busy || (requiresDate && !validUntil) || (requiresNote && note.trim().length < 3)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-50">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
            {busy ? "Guardando" : "Confirmar cambio"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BusinessLicensesManager({
  initialLicenses,
  initialError,
  minimumDate,
}: {
  initialLicenses: PlatformBusinessLicense[];
  initialError: string | null;
  minimumDate: string;
}) {
  const router = useRouter();
  const licenses = initialLicenses;
  const loadError = initialError;
  const [dialog, setDialog] = useState<{
    business: PlatformBusinessLicense;
    operation: LicenseOperation;
  } | null>(null);
  const [events, setEvents] = useState<LicenseEvent[] | null>(null);
  const [eventsBusinessName, setEventsBusinessName] = useState("");
  const [emergencyDialog, setEmergencyDialog] = useState<"suspend" | "reactivate" | null>(null);
  const [emergencyNote, setEmergencyNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const emergencySuspended = licenses.some((license) => license.global_emergency_suspended);
  const counts = useMemo(
    () => ({
      available: licenses.filter((license) => license.is_available).length,
      inactive: licenses.filter((license) => !license.is_available).length,
      expiring: licenses.filter((license) => license.license_status === "expiring").length,
    }),
    [licenses],
  );

  function refresh() {
    router.refresh();
  }

  function submitLicenseChange(input: BusinessLicenseMutation) {
    startTransition(async () => {
      const result = await manageBusinessLicenseAction(input);
      if (!result.success) {
        toast.error(result.error ?? "No se pudo actualizar la licencia");
        return;
      }
      toast.success("Licencia actualizada");
      setDialog(null);
      refresh();
    });
  }

  async function showHistory(business: PlatformBusinessLicense) {
    setEvents(null);
    setEventsBusinessName(business.display_name);
    const result = await getBusinessLicenseEventsAction(business.business_id);
    if (result.error) {
      toast.error(result.error);
      setEvents([]);
      return;
    }
    setEvents(result.events as LicenseEvent[]);
  }

  function submitEmergencyChange() {
    if (!emergencyDialog) return;
    const suspend = emergencyDialog === "suspend";
    startTransition(async () => {
      const result = await setPlatformEmergencySuspensionAction({
        suspended: suspend,
        note: emergencyNote,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo cambiar el control técnico");
        return;
      }
      toast.success(suspend ? "Suspensión técnica activada" : "Sistema reactivado");
      setEmergencyDialog(null);
      setEmergencyNote("");
      refresh();
    });
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-brand">
              Administración de plataforma
            </p>
            <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Licencias por negocio
            </h1>
            <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
              Controla por separado la vigencia y disponibilidad de cada local. No se guardan importes ni saldos.
            </p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-heading text-sm font-bold text-muted-foreground hover:text-foreground">
            <RefreshCw size={16} aria-hidden /> Actualizar
          </button>
        </header>

        {loadError ? (
          <div role="alert" className="mb-5 rounded-2xl border border-destructive/25 bg-destructive/8 p-4 font-body text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        <section aria-label="Resumen de licencias" className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "Operativas", value: counts.available, icon: ShieldCheck, color: "text-success" },
            { label: "No disponibles", value: counts.inactive, icon: PauseCircle, color: "text-warning" },
            { label: "Por vencer", value: counts.expiring, icon: Clock3, color: "text-gold" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-background ${item.color}`}><Icon size={20} aria-hidden /></span>
                <div>
                  <p className="font-body text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 font-data text-2xl font-bold text-foreground">{item.value}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mb-7 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning"><AlertTriangle size={20} aria-hidden /></span>
              <div>
                <h2 className="font-heading text-sm font-bold text-foreground">Suspensión técnica global</h2>
                <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                  Es una medida extraordinaria distinta de las licencias comerciales. Si se activa, detiene la operación de todos los negocios.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:shrink-0">
              <span className={`rounded-full px-3 py-1.5 font-heading text-xs font-bold ${emergencySuspended ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                {emergencySuspended ? "Activa" : "Inactiva"}
              </span>
              <button
                type="button"
                onClick={() => setEmergencyDialog(emergencySuspended ? "reactivate" : "suspend")}
                disabled={isPending}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 font-heading text-xs font-bold disabled:opacity-50 ${emergencySuspended ? "border-success/25 text-success hover:bg-success/10" : "border-destructive/25 text-destructive hover:bg-destructive/10"}`}
              >
                {emergencySuspended ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                {emergencySuspended ? "Reactivar sistema" : "Suspender sistema"}
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="license-businesses-title" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="license-businesses-title" className="font-heading text-lg font-bold text-foreground">Negocios registrados</h2>
              <p className="mt-1 font-body text-xs text-muted-foreground">Cada licencia conserva su propio estado y fecha final.</p>
            </div>
            <span className="rounded-full bg-surface-raised px-3 py-1 font-data text-xs font-bold text-muted-foreground">{licenses.length}</span>
          </div>

          {licenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center font-body text-sm text-muted-foreground">
              No hay negocios disponibles para administrar.
            </div>
          ) : licenses.map((license) => {
            const colors = getBusinessBrandColors(
              license.slug,
              license.brand_primary_color,
              license.brand_accent_color,
            );
            const logo = getBusinessLogoUrl(license.brand_logo_path);
            const status = STATUS_COPY[license.license_status];
            return (
              <article key={license.business_id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ backgroundColor: colors.primary, color: getReadableBrandForeground(colors.primary) }}>
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="size-full object-contain p-1.5" />
                      ) : <Building2 size={21} aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-base font-bold text-foreground">{license.display_name}</h3>
                        <span className={`rounded-full px-2.5 py-1 font-heading text-[11px] font-bold ${status.className}`}>{status.label}</span>
                        {license.lifecycle_status !== "active" ? (
                          <span className="rounded-full bg-surface-raised px-2.5 py-1 font-heading text-[11px] font-semibold text-muted-foreground">
                            {license.lifecycle_status === "draft" ? "Borrador" : license.lifecycle_status === "paused" ? "Pausado" : license.lifecycle_status}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-data text-xs text-muted-foreground">{license.slug} · {license.timezone}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-xs text-muted-foreground">
                        <span>Vigencia hasta <strong className="font-heading text-foreground">{formatDate(license.valid_until)}</strong></span>
                        {license.days_remaining !== null ? (
                          <span>{license.days_remaining < 0 ? `Venció hace ${Math.abs(license.days_remaining)} días` : `${license.days_remaining} días restantes`}</span>
                        ) : <span>Sin vigencia asignada</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                    {license.license_status === "unlicensed" ? (
                      <button type="button" onClick={() => setDialog({ business: license, operation: "activate" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-3 font-heading text-xs font-bold text-white hover:bg-brand-hover">
                        <CalendarDays size={15} /> Asignar vigencia
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setDialog({ business: license, operation: "renew" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-3 font-heading text-xs font-bold text-white hover:bg-brand-hover">
                          <RefreshCw size={15} /> Renovar
                        </button>
                        <button type="button" onClick={() => setDialog({ business: license, operation: "set_date" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                          <CalendarDays size={15} /> Cambiar fecha
                        </button>
                        {license.license_status === "suspended" ? (
                          <button type="button" onClick={() => setDialog({ business: license, operation: "reactivate" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-success/25 px-3 font-heading text-xs font-bold text-success hover:bg-success/10">
                            <PlayCircle size={15} /> Reactivar
                          </button>
                        ) : (
                          <button type="button" onClick={() => setDialog({ business: license, operation: "suspend" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-destructive/25 px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/10">
                            <PauseCircle size={15} /> Suspender
                          </button>
                        )}
                      </>
                    )}
                    <button type="button" onClick={() => void showHistory(license)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                      <History size={15} /> Historial
                    </button>
                  </div>
                </div>
                {license.license_status === "expiring" ? (
                  <p className="mt-4 rounded-xl border border-warning/20 bg-warning/8 px-3 py-2 font-body text-xs text-warning">
                    Esta licencia vence pronto. Puedes renovarla antes de que se interrumpa la operación.
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>

      {dialog ? (
        <LicenseActionDialog
          key={`${dialog.business.business_id}-${dialog.operation}`}
          business={dialog.business}
          operation={dialog.operation}
          minimumDate={minimumDate}
          busy={isPending}
          onClose={() => !isPending && setDialog(null)}
          onSubmit={submitLicenseChange}
        />
      ) : null}

      {emergencyDialog ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="emergency-title" className="w-full max-w-lg rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float sm:rounded-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning"><AlertTriangle size={20} /></span>
              <div className="min-w-0 flex-1">
                <h2 id="emergency-title" className="font-heading text-lg font-bold text-foreground">{emergencyDialog === "suspend" ? "Suspender todo el sistema" : "Reactivar todo el sistema"}</h2>
                <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">{emergencyDialog === "suspend" ? "Detendrá temporalmente las operaciones de todos los negocios. Úsalo sólo como medida técnica extraordinaria." : "Volverá a permitir la operación de los negocios con licencia vigente."}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setEmergencyDialog(null)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button>
            </div>
            <label className="mt-5 block font-heading text-sm font-bold text-foreground">
              Motivo para el historial
              <textarea value={emergencyNote} onChange={(event) => setEmergencyNote(event.target.value)} maxLength={500} minLength={3} rows={3} className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 font-body text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" placeholder="Escribe por qué se realiza este cambio" />
            </label>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setEmergencyDialog(null)} disabled={isPending} className="min-h-12 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:bg-surface-raised">Cancelar</button>
              <button type="button" onClick={submitEmergencyChange} disabled={isPending || emergencyNote.trim().length < 3} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-warning px-4 font-heading text-sm font-bold text-ink disabled:opacity-50">
                {isPending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                Confirmar cambio
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {events !== null ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="license-history-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float sm:rounded-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-background text-brand"><History size={20} /></span>
              <div className="min-w-0 flex-1">
                <h2 id="license-history-title" className="font-heading text-lg font-bold text-foreground">Historial de licencia</h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">{eventsBusinessName}</p>
              </div>
              <button type="button" aria-label="Cerrar historial" onClick={() => setEvents(null)} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button>
            </div>
            <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-background">
              {events.length === 0 ? (
                <p className="p-5 text-center font-body text-sm text-muted-foreground">Todavía no hay cambios registrados.</p>
              ) : events.map((event) => (
                <article key={event.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-sm font-bold text-foreground">{EVENT_COPY[event.event_type] ?? "Cambio de licencia"}</h3>
                    <time className="font-body text-xs text-muted-foreground">{formatDateTime(event.created_at)}</time>
                  </div>
                  <p className="mt-1 font-body text-xs text-muted-foreground">Por {event.actor_name} · Vigencia hasta {formatDate(event.next_valid_until)}</p>
                  {event.note ? <p className="mt-2 whitespace-pre-wrap font-body text-sm leading-5 text-foreground">{event.note}</p> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
