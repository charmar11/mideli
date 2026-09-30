"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Archive, Check, Loader2, Pencil, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  archiveBusinessStaffRoleAction,
  listBusinessStaffRolesAction,
  saveBusinessStaffRoleAction,
} from "@/lib/actions/users";
import {
  type BusinessStaffRole,
  type StaffRoleCapabilityOption,
} from "@/lib/staff-roles";

type Draft = {
  id: string | null;
  name: string;
  description: string;
  capabilityCodes: string[];
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  description: "",
  capabilityCodes: [],
};

function getCapabilityLabel(code: string, capabilities: StaffRoleCapabilityOption[]) {
  return capabilities.find((capability) => capability.code === code)?.label ?? code;
}

export function BusinessStaffRolesManager({
  businessName,
  onRolesChanged,
}: {
  businessName: string;
  onRolesChanged?: () => void;
}) {
  const [roles, setRoles] = useState<BusinessStaffRole[]>([]);
  const [capabilities, setCapabilities] = useState<StaffRoleCapabilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();

  const applyRolesResult = useCallback((result: Awaited<ReturnType<typeof listBusinessStaffRolesAction>>) => {
    if (result.error) {
      toast.error(result.error);
    } else {
      setRoles(result.roles);
      setCapabilities(result.capabilities);
    }
    setLoading(false);
  }, []);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    const result = await listBusinessStaffRolesAction();
    applyRolesResult(result);
  }, [applyRolesResult]);

  useEffect(() => {
    let cancelled = false;
    async function initializeRoles() {
      const result = await listBusinessStaffRolesAction();
      if (cancelled) return;
      applyRolesResult(result);
    }
    void initializeRoles();
    return () => {
      cancelled = true;
    };
  }, [applyRolesResult]);

  const groupedCapabilities = useMemo(() => {
    const groups = new Map<string, StaffRoleCapabilityOption[]>();
    for (const capability of capabilities) {
      const group = groups.get(capability.group) ?? [];
      group.push(capability);
      groups.set(capability.group, group);
    }
    return [...groups.entries()];
  }, [capabilities]);

  function openNewRole() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEditRole(role: BusinessStaffRole) {
    setDraft({
      id: role.id,
      name: role.name,
      description: role.description,
      capabilityCodes: [...role.capabilities],
    });
  }

  function toggleCapability(code: string) {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.capabilityCodes.includes(code);
      return {
        ...current,
        capabilityCodes: selected
          ? current.capabilityCodes.filter((item) => item !== code)
          : [...current.capabilityCodes, code],
      };
    });
  }

  function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    startTransition(async () => {
      const result = await saveBusinessStaffRoleAction({
        roleId: draft.id,
        name: draft.name,
        description: draft.description,
        capabilityCodes: draft.capabilityCodes,
      });
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo guardar el rango");
        return;
      }
      toast.success(draft.id ? "Rango actualizado" : "Rango creado");
      setDraft(null);
      await loadRoles();
      onRolesChanged?.();
    });
  }

  function archiveRole(role: BusinessStaffRole) {
    if (!window.confirm(`¿Archivar el rango “${role.name}”? El historial del personal se conserva.`)) return;
    startTransition(async () => {
      const result = await archiveBusinessStaffRoleAction(role.id);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo archivar el rango");
        return;
      }
      toast.success("Rango archivado");
      await loadRoles();
      onRolesChanged?.();
    });
  }

  const preview = draft?.capabilityCodes.length
    ? draft.capabilityCodes.map((code) => getCapabilityLabel(code, capabilities)).join(" · ")
    : "Sin permisos operativos";

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-base font-bold text-foreground">Rangos del equipo</h2>
            {!loading ? (
              <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 font-heading text-[10px] font-bold text-muted-foreground">
                {roles.length} {roles.length === 1 ? "rango" : "rangos"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
            Define qué puede hacer cada persona en {businessName}. El acceso global se configura por separado.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewRole}
          disabled={isPending || capabilities.length === 0}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        >
          <Plus size={16} aria-hidden />
          Crear rango
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-border bg-card font-body text-sm text-muted-foreground">
          <Loader2 size={17} className="animate-spin text-brand" /> Cargando rangos...
        </div>
      ) : roles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
          Aún no hay rangos. Crea uno para asignarlo al equipo.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <li key={role.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-sm font-bold text-foreground">{role.name}</h3>
                  {role.isSystem ? (
                    <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 font-heading text-[10px] font-bold text-muted-foreground">Integrado</span>
                  ) : null}
                  {role.assignable === false ? (
                    <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 font-heading text-[10px] font-bold text-warning">Permisos por revisar</span>
                  ) : null}
                </div>
                <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                  {role.description || "Sin descripción"}
                </p>
              </div>

              <div className="mt-3">
                <p className="mb-1.5 font-heading text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Permisos
                </p>
                {role.capabilities.length ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label={`Permisos de ${role.name}`}>
                    {role.capabilities.map((code) => (
                      <li
                        key={code}
                        className="rounded-lg border border-border bg-surface-raised px-2 py-1 font-body text-[11px] leading-4 text-foreground/90"
                      >
                        {getCapabilityLabel(code, capabilities)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-body text-xs text-muted-foreground">Sin permisos operativos</p>
                )}
              </div>

              {!role.isSystem ? (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <button type="button" onClick={() => openEditRole(role)} disabled={isPending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50">
                    <Pencil size={14} aria-hidden /> Editar
                  </button>
                  <button type="button" onClick={() => archiveRole(role)} disabled={isPending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/25 px-3 font-heading text-xs font-bold text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 disabled:opacity-50">
                    <Archive size={14} aria-hidden /> Archivar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="staff-role-title" className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="staff-role-title" className="font-heading text-lg font-bold text-foreground">{draft.id ? "Editar rango" : "Crear rango"}</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground">Solo afecta al equipo de {businessName}.</p>
              </div>
              <button type="button" onClick={() => setDraft(null)} disabled={isPending} aria-label="Cerrar" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"><X size={18} /></button>
            </div>

            <form onSubmit={saveRole} className="mt-5 space-y-4">
              <label className="block font-heading text-xs font-bold text-foreground">
                Nombre del rango
                <input required minLength={2} maxLength={48} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Mesero con caja" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
              </label>
              <label className="block font-heading text-xs font-bold text-foreground">
                Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
                <input maxLength={180} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Responsabilidades principales" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm font-normal text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
              </label>

              <fieldset className="space-y-3">
                <legend className="font-heading text-xs font-bold text-foreground">¿Qué puede hacer?</legend>
                {groupedCapabilities.map(([group, options]) => (
                  <div key={group} className="rounded-xl border border-border p-3">
                    <h3 className="mb-2 font-heading text-xs font-bold text-foreground">{group}</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((option) => {
                        const checked = draft.capabilityCodes.includes(option.code);
                        return (
                          <label key={option.code} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? "border-brand/35 bg-brand/8" : "border-border bg-background hover:bg-surface-raised"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleCapability(option.code)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                            <span>
                              <span className="block font-heading text-xs font-bold text-foreground">{option.label}</span>
                              <span className="mt-0.5 block font-body text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>

              <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                <div className="flex items-center gap-2 font-heading text-xs font-bold text-success"><ShieldCheck size={15} aria-hidden /> Resumen del rango</div>
                <p className="mt-1 font-body text-xs leading-5 text-foreground">{preview}</p>
                <p className="mt-1 font-body text-[11px] leading-4 text-muted-foreground">No incluye administración completa de caja ni permisos de otros negocios.</p>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setDraft(null)} disabled={isPending} className="min-h-11 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={isPending || draft.name.trim().length < 2} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-xs font-bold text-white disabled:opacity-50">
                  {isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Guardar rango
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
