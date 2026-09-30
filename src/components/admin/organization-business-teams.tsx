"use client";

import { useEffect, useState } from "react";
import { Building2, CircleAlert, Loader2, RefreshCw, UsersRound } from "lucide-react";
import {
  listOrganizationBusinessTeamsAction,
  type OrganizationBusinessTeam,
} from "@/lib/actions/users";
import { STAFF_ROLE_CAPABILITY_OPTIONS } from "@/lib/staff-roles";

const capabilityLabels = new Map(
  STAFF_ROLE_CAPABILITY_OPTIONS.map((capability) => [capability.code, capability.label]),
);

export function OrganizationBusinessTeams() {
  const [teams, setTeams] = useState<OrganizationBusinessTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTeams() {
    setLoading(true);
    setError(null);
    const result = await listOrganizationBusinessTeamsAction();
    if (result.error) {
      setError(result.error);
    } else {
      setTeams(result.teams);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTeams(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="space-y-3" aria-labelledby="organization-teams-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            Consulta de solo lectura
          </p>
          <h2 id="organization-teams-title" className="mt-1 font-heading text-lg font-bold">
            Equipos por negocio
          </h2>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
            Coordinación puede revisar quién pertenece a cada equipo y su rango. Sólo el dueño del local puede hacer cambios.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTeams()}
          disabled={loading}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
          Actualizar equipos
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-border bg-card font-body text-sm text-muted-foreground">
          <Loader2 size={17} className="animate-spin text-brand" aria-hidden />
          Cargando equipos…
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 font-body text-sm text-foreground">
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
            {error}
          </p>
          <button
            type="button"
            onClick={() => void loadTeams()}
            className="min-h-10 rounded-lg border border-border px-3 font-heading text-xs font-bold text-foreground"
          >
            Reintentar
          </button>
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
          <Building2 size={23} className="mx-auto text-muted-foreground" aria-hidden />
          <p className="mt-2 font-heading text-sm font-bold">Todavía no hay negocios para consultar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <details key={team.businessId} className="group rounded-2xl border border-border bg-card">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none transition hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-brand/60 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Building2 size={17} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-heading text-sm font-bold">{team.businessName}</span>
                    <span className="mt-0.5 block font-body text-xs text-muted-foreground">
                      {team.members.length} {team.members.length === 1 ? "persona asignada" : "personas asignadas"}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-heading text-[11px] font-bold text-muted-foreground">
                  <UsersRound size={13} aria-hidden />
                  Ver equipo
                </span>
              </summary>

              <div className="border-t border-border p-3 sm:p-4">
                {team.members.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center font-body text-xs text-muted-foreground">
                    Este negocio todavía no tiene personal asignado.
                  </p>
                ) : (
                  <ul className="grid gap-2 md:grid-cols-2">
                    {team.members.map((member) => (
                      <li
                        key={member.membershipId}
                        className="min-w-0 rounded-xl border border-border bg-background p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate font-heading text-sm font-bold text-foreground">
                              {member.fullName}
                            </span>
                            {member.roleDescription ? (
                              <span className="mt-1 block font-body text-xs leading-5 text-muted-foreground">
                                {member.roleDescription}
                              </span>
                            ) : null}
                          </span>
                          <span className="inline-flex min-h-7 items-center rounded-full border border-brand/20 bg-brand/8 px-2.5 font-heading text-[11px] font-bold text-brand">
                            {member.roleName}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-1 font-heading text-[10px] font-bold ${
                              member.status === "active"
                                ? "bg-success/10 text-success"
                                : "bg-surface-raised text-muted-foreground"
                            }`}
                          >
                            {member.status === "active" ? "Activo" : "Inactivo"}
                          </span>
                          {member.capabilityCodes.map((code) => {
                            const label = capabilityLabels.get(code);
                            return label ? (
                              <span
                                key={code}
                                className="rounded-full border border-border px-2 py-1 font-body text-[10px] text-muted-foreground"
                              >
                                {label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
