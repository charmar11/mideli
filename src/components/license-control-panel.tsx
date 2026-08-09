"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  LockKeyhole,
  LogOut,
  PauseCircle,
  PlayCircle,
  RotateCcwKey,
  Shield,
} from "lucide-react";
import { manageLicenseAction, type LicenseActionState } from "@/lib/actions/license";
import type {
  LicenseControlAccess,
  LicenseControlEvent,
} from "@/lib/license-control-server";
import type { AppLicenseSnapshot } from "@/lib/license";

const STATUS_COPY = {
  active: { label: "Activa", className: "bg-success-light text-success", icon: CheckCircle2 },
  expired: { label: "Vencida", className: "bg-warning-light text-warning", icon: Clock3 },
  suspended: { label: "Suspendida", className: "bg-destructive/10 text-destructive", icon: PauseCircle },
  unavailable: { label: "Sin conexión", className: "bg-surface-raised text-muted-foreground", icon: Shield },
} as const;

const EVENT_LABELS: Record<string, string> = {
  credential_created: "Acceso privado configurado",
  credential_changed: "Contraseña actualizada",
  credential_recovered: "Contraseña recuperada",
  access_locked: "Acceso bloqueado temporalmente",
  license_renewed: "Licencia renovada",
  license_date_changed: "Fecha de licencia ajustada",
  license_suspended: "Sistema suspendido",
  license_reactivated: "Sistema reactivado",
};

const INITIAL_STATE: LicenseActionState = { kind: "idle", message: "", submittedAt: 0 };

function formatDate(value: string | null, includeTime = true) {
  if (!value) return "No disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

function Feedback({ state }: { state: LicenseActionState }) {
  if (state.kind === "idle") return null;
  return (
    <div
      role="status"
      className={`rounded-xl px-3.5 py-3 font-body text-sm ${
        state.kind === "success" ? "bg-success-light text-success" : "bg-destructive/10 text-destructive"
      }`}
    >
      {state.message}
    </div>
  );
}

function PasswordFields({ current = false }: { current?: boolean }) {
  return (
    <div className="grid gap-3">
      {current ? (
        <label className="grid gap-1.5">
          <span className="font-heading text-xs font-bold text-muted-foreground">Contraseña actual</span>
          <input name="currentPassword" type="password" required autoComplete="current-password" className="license-input" />
        </label>
      ) : null}
      <label className="grid gap-1.5">
        <span className="font-heading text-xs font-bold text-muted-foreground">Nueva contraseña</span>
        <input name="newPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password" className="license-input" />
      </label>
      <label className="grid gap-1.5">
        <span className="font-heading text-xs font-bold text-muted-foreground">Confirmar contraseña</span>
        <input name="confirmPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password" className="license-input" />
      </label>
    </div>
  );
}

function AccessPanel({
  access,
  formAction,
  pending,
  state,
}: {
  access: LicenseControlAccess;
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: LicenseActionState;
}) {
  const [recovering, setRecovering] = useState(false);
  const isSetup = !access.configured;

  if (isSetup || recovering) {
    return (
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl shadow-black/15 sm:p-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
          {isSetup ? <KeyRound size={22} /> : <RotateCcwKey size={22} />}
        </span>
        <h2 className="mt-5 font-heading text-xl font-bold text-foreground">
          {isSetup ? "Crea tu acceso de vendedor" : "Recuperar acceso privado"}
        </h2>
        <p className="mt-1 font-body text-sm leading-6 text-muted-foreground">
          {isSetup
            ? "Esta contraseña será la que usarás para renovar o suspender el sistema."
            : "Usa la clave de recuperación del servidor para establecer una contraseña nueva."}
        </p>
        <form action={formAction} className="mt-6 grid gap-4">
          <input type="hidden" name="operation" value={isSetup ? "setup" : "recover"} />
          <label className="grid gap-1.5">
            <span className="font-heading text-xs font-bold text-muted-foreground">Clave de recuperación</span>
            <input name="recoverySecret" type="password" required autoComplete="off" className="license-input" />
          </label>
          <PasswordFields />
          <Feedback state={state} />
          <button type="submit" disabled={pending} className="action-success h-12 rounded-xl font-heading text-sm font-bold disabled:opacity-50">
            {pending ? "Guardando..." : isSetup ? "Crear acceso privado" : "Guardar nueva contraseña"}
          </button>
        </form>
        {!isSetup ? (
          <button type="button" onClick={() => setRecovering(false)} className="mt-3 h-10 w-full font-heading text-xs font-bold text-muted-foreground hover:text-foreground">
            Volver a iniciar sesión
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl shadow-black/15 sm:p-7">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
        <LockKeyhole size={22} />
      </span>
      <h2 className="mt-5 font-heading text-xl font-bold text-foreground">Acceso privado</h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">Solo el vendedor puede administrar la vigencia.</p>
      {access.lockedUntil ? (
        <p className="mt-4 rounded-xl bg-warning-light px-3.5 py-3 font-body text-xs text-warning">
          Si el bloqueo sigue vigente, podrás intentar nuevamente después de {formatDate(access.lockedUntil)}.
        </p>
      ) : null}
      <form action={formAction} className="mt-6 grid gap-4">
        <input type="hidden" name="operation" value="login" />
        <label className="grid gap-1.5">
          <span className="font-heading text-xs font-bold text-muted-foreground">Contraseña de vendedor</span>
          <input name="password" type="password" required autoComplete="current-password" className="license-input" autoFocus />
        </label>
        <Feedback state={state} />
        <button type="submit" disabled={pending} className="action-success h-12 rounded-xl font-heading text-sm font-bold disabled:opacity-50">
          {pending ? "Verificando..." : "Entrar al control"}
        </button>
      </form>
      <button type="button" onClick={() => setRecovering(true)} className="mt-3 h-10 w-full font-heading text-xs font-bold text-muted-foreground hover:text-foreground">
        Recuperar contraseña
      </button>
    </section>
  );
}

export function LicenseControlPanel({
  access,
  license,
  events,
  minimumDate,
}: {
  access: LicenseControlAccess;
  license: AppLicenseSnapshot | null;
  events: LicenseControlEvent[];
  minimumDate: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(manageLicenseAction, INITIAL_STATE);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  useEffect(() => {
    if (state.kind === "success") router.refresh();
  }, [router, state.kind, state.submittedAt]);

  if (!access.authenticated || !license) {
    return <AccessPanel access={access} formAction={formAction} pending={pending} state={state} />;
  }

  const status = STATUS_COPY[license.state];
  const StatusIcon = status.icon;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <div className="grid gap-5">
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-brand">Suscripción mensual</p>
              <h2 className="mt-2 font-heading text-2xl font-bold text-foreground">Licencia Mideli</h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">Vigente hasta {formatDate(license.validUntil)}</p>
            </div>
            <span className={`inline-flex h-9 items-center gap-2 rounded-full px-3 font-heading text-xs font-bold ${status.className}`}>
              <StatusIcon size={15} /> {status.label}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 3, 6, 12].map((months) => (
              <form action={formAction} key={months}>
                <input type="hidden" name="operation" value="renew" />
                <input type="hidden" name="months" value={months} />
                <button type="submit" disabled={pending} className={`h-16 w-full rounded-xl border font-heading text-sm font-bold transition-colors disabled:opacity-50 ${months === 1 ? "border-success bg-success text-black hover:bg-success/90" : "border-border bg-background text-foreground hover:border-success/50 hover:bg-success-light"}`}>
                  {months} {months === 1 ? "mes" : "meses"}
                </button>
              </form>
            ))}
          </div>

          <form action={formAction} className="mt-5 grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="operation" value="set_date" />
            <label className="grid gap-1.5">
              <span className="font-heading text-xs font-bold text-muted-foreground">Fecha personalizada</span>
              <input name="validUntil" type="date" min={minimumDate} required className="license-input" />
            </label>
            <label className="grid gap-1.5">
              <span className="font-heading text-xs font-bold text-muted-foreground">Referencia opcional</span>
              <input name="paymentReference" maxLength={160} placeholder="Pago, folio o nota" className="license-input" />
            </label>
            <button type="submit" disabled={pending} className="h-11 rounded-xl border border-success/50 px-5 font-heading text-xs font-bold text-success hover:bg-success-light disabled:opacity-50">
              Guardar fecha
            </button>
          </form>

          <Feedback state={state} />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {license.state === "suspended" ? (
              <form action={formAction}>
                <input type="hidden" name="operation" value="reactivate" />
                <button type="submit" disabled={pending} className="action-success flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">
                  <PlayCircle size={17} /> Reactivar sistema
                </button>
              </form>
            ) : (
              <form action={formAction} className="contents">
                <input type="hidden" name="operation" value="suspend" />
                <input name="reason" required maxLength={500} placeholder="Motivo obligatorio para suspender" className="license-input sm:col-span-1" />
                <button type="submit" disabled={pending} className="action-danger flex h-11 w-full items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:opacity-50">
                  <PauseCircle size={16} /> Suspender ahora
                </button>
              </form>
            )}
          </div>
          <p className="mt-4 font-body text-xs leading-5 text-muted-foreground">
            Al suspender o vencer, las pantallas operativas y las escrituras quedan bloqueadas. Los datos se conservan intactos.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <History size={19} className="text-brand" />
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">Historial de control</h2>
              <p className="font-body text-xs text-muted-foreground">Últimos cambios de licencia y acceso.</p>
            </div>
          </div>
          <div className="mt-5 divide-y divide-border">
            {events.length ? events.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-heading text-sm font-bold text-foreground">{EVENT_LABELS[event.event_type] ?? "Cambio registrado"}</p>
                  {event.reason ? <p className="mt-1 font-body text-xs text-muted-foreground">{event.reason}</p> : null}
                </div>
                <time className="shrink-0 text-right font-data text-[11px] text-muted-foreground">{formatDate(event.created_at)}</time>
              </div>
            )) : (
              <p className="font-body text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>
            )}
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand"><KeyRound size={20} /></span>
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">Seguridad</h2>
            <p className="font-body text-xs text-muted-foreground">Sesión privada de 30 minutos.</p>
          </div>
        </div>

        {showPasswordChange ? (
          <form action={formAction} className="mt-5 grid gap-4">
            <input type="hidden" name="operation" value="change_password" />
            <PasswordFields current />
            <button type="submit" disabled={pending} className="action-success h-11 rounded-xl font-heading text-xs font-bold disabled:opacity-50">Cambiar contraseña</button>
            <button type="button" onClick={() => setShowPasswordChange(false)} className="h-10 font-heading text-xs font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowPasswordChange(true)} className="mt-5 h-11 w-full rounded-xl border border-border font-heading text-xs font-bold text-foreground hover:border-brand/50 hover:bg-brand-light">
            Cambiar contraseña
          </button>
        )}

        <form action={formAction} className="mt-3">
          <input type="hidden" name="operation" value="logout" />
          <button type="submit" disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50">
            <LogOut size={16} /> <span className="font-heading text-xs font-bold">Cerrar sesión privada</span>
          </button>
        </form>
      </aside>
    </div>
  );
}
