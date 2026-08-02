"use client";

import { useActionState } from "react";
import { CalendarDays, CheckCircle2, Clock3, KeyRound, PauseCircle, Shield } from "lucide-react";
import {
  updateLicenseAction,
  type LicenseActionState,
} from "@/lib/actions/license";
import type { AppLicenseSnapshot } from "@/lib/license";

const STATUS_COPY = {
  active: { label: "Activa", className: "bg-success-light text-success", icon: CheckCircle2 },
  expired: { label: "Vencida", className: "bg-warning-light text-warning", icon: Clock3 },
  suspended: { label: "Suspendida", className: "bg-destructive/10 text-destructive", icon: PauseCircle },
  unavailable: { label: "Sin conexión", className: "bg-surface-raised text-muted-foreground", icon: Shield },
} as const;

const INITIAL_LICENSE_ACTION_STATE: LicenseActionState = {
  kind: "idle",
  message: "",
  submittedAt: 0,
};

function formatDate(value: string | null) {
  if (!value) return "No disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

export function LicenseControlPanel({
  license,
  minimumDate,
}: {
  license: AppLicenseSnapshot;
  minimumDate: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateLicenseAction,
    INITIAL_LICENSE_ACTION_STATE
  );
  const status = STATUS_COPY[license.state];
  const StatusIcon = status.icon;

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">Licencia Mideli</h2>
          </div>
          <span className={`inline-flex h-9 items-center gap-2 rounded-full px-3 font-heading text-xs font-bold ${status.className}`}>
            <StatusIcon size={15} /> {status.label}
          </span>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <p className="font-heading text-xs font-bold text-muted-foreground">Vigencia actual</p>
          <p className="mt-2 text-pretty font-body text-lg text-foreground">{formatDate(license.validUntil)}</p>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="font-body text-xs leading-5 text-muted-foreground">
            Cuando la fecha termina o suspendes el servicio, las rutas operativas quedan bloqueadas. Los datos no se eliminan.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">Control privado</h2>
            <p className="font-body text-xs text-muted-foreground">Cada cambio requiere tu clave maestra.</p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="font-heading text-xs font-bold text-muted-foreground">Clave de vendedor</span>
          <input
            name="secret"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Escribe tu clave privada"
            className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3.5 font-body text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </label>

        {state.kind !== "idle" ? (
          <div
            role="status"
            className={`mt-4 rounded-xl px-3.5 py-3 font-body text-sm ${
              state.kind === "success"
                ? "bg-success-light text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          name="operation"
          value="extend_30"
          disabled={pending}
          className="action-success mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-heading text-sm font-bold disabled:opacity-50"
        >
          <CalendarDays size={17} /> Activar 30 días
        </button>

        <div className="mt-5 border-t border-border pt-5">
          <label className="block">
            <span className="font-heading text-xs font-bold text-muted-foreground">O elegir fecha de vencimiento</span>
            <input
              name="validUntil"
              type="date"
              min={minimumDate}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 font-body text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <button
            type="submit"
            name="operation"
            value="set_date"
            disabled={pending}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-success/45 px-4 font-heading text-xs font-bold text-success transition-colors hover:bg-success-light disabled:opacity-50"
          >
            Guardar fecha elegida
          </button>
        </div>

        <button
          type="submit"
          name="operation"
          value="suspend"
          disabled={pending}
          className="action-danger mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:opacity-50"
        >
          <PauseCircle size={16} /> Suspender ahora
        </button>
      </section>
    </form>
  );
}
