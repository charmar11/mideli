"use client";

import {
  Check,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createUserAction,
  deactivateUserAction,
  deleteUserAction,
  getCurrentUserRole,
  listProfilesAction,
  reactivateUserAction,
  resetUserPasswordAction,
  setStaffAuthorizationPinAction,
  updateUserRoleAction,
} from "@/lib/actions/users";
import type { StaffMember } from "@/types/database";

type StaffRole = StaffMember["role"];
type StatusFilter = "all" | "active" | "inactive";
type StatusChange = {
  member: StaffMember;
  action: "deactivate" | "reactivate";
};

const roleLabels: Record<StaffRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  waiter: "Mesero",
  kitchen: "Cocina",
  supervisor: "Supervisor",
};

const roleDescriptions: Record<StaffRole, string> = {
  owner: "Acceso total y control de la cuenta",
  admin: "Gestiona menú, personal e inventario",
  waiter: "Toma pedidos y cobra en el POS",
  kitchen: "Consulta y actualiza pedidos en cocina",
  supervisor: "Opera el POS y cocina, sin analíticas",
};

const roleColors: Record<StaffRole, string> = {
  owner: "border-brand/20 bg-brand/10 text-brand",
  admin: "border-gold/20 bg-gold/10 text-gold",
  waiter: "border-border bg-surface-raised text-muted-foreground",
  kitchen: "border-success/20 bg-success/10 text-success",
  supervisor: "border-sky-400/20 bg-sky-400/10 text-sky-300",
};

const roleOptions: StaffRole[] = [
  "owner",
  "admin",
  "supervisor",
  "waiter",
  "kitchen",
];

function formatLastAccess(value: string | null) {
  if (!value) return "Nunca ha ingresado";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) || "??").toUpperCase();
}

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<StaffMember[]>([]);
  const [viewerRole, setViewerRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<StaffRole>("waiter");
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffMember | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "waiter" as StaffRole,
  });

  const isOwner = viewerRole === "owner";

  useEffect(() => {
    void Promise.all([loadProfiles(), getCurrentUserRole()]).then(([, role]) => {
      setViewerRole(role as StaffRole | null);
    });
  }, []);

  async function loadProfiles() {
    setLoading(true);
    const { profiles: nextProfiles, error } = await listProfilesAction();
    if (error) {
      toast.error(error);
    } else {
      setProfiles(nextProfiles);
    }
    setLoading(false);
  }

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && profile.is_active) ||
        (statusFilter === "inactive" && !profile.is_active);
      const matchesSearch =
        !normalizedSearch ||
        profile.full_name.toLowerCase().includes(normalizedSearch) ||
        profile.email?.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [profiles, search, statusFilter]);

  const activeCount = profiles.filter((profile) => profile.is_active).length;
  const inactiveCount = profiles.length - activeCount;

  function handleAddUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullEmail = newUser.email.includes("@")
      ? newUser.email.trim()
      : `${newUser.email.trim()}@mideli.com`;

    startTransition(async () => {
      const result = await createUserAction({
        email: fullEmail,
        password: newUser.password,
        fullName: newUser.full_name,
        role: newUser.role,
      });

      if (!result.success || result.error) {
        toast.error(result.error ?? "Error al crear usuario");
        return;
      }

      toast.success(`Acceso creado para ${fullEmail}`);
      setNewUser({ email: "", password: "", full_name: "", role: "waiter" });
      setShowAddForm(false);
      await loadProfiles();
    });
  }

  function openMember(member: StaffMember) {
    setSelectedMember(member);
    setRoleDraft(member.role);
  }

  function handleRoleSave() {
    if (!selectedMember || roleDraft === selectedMember.role) return;

    startTransition(async () => {
      const result = await updateUserRoleAction(selectedMember.id, roleDraft);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo actualizar el rol");
        return;
      }

      toast.success("Rol actualizado");
      setSelectedMember(null);
      await loadProfiles();
    });
  }

  function askStatusChange(member: StaffMember) {
    setStatusChange({
      member,
      action: member.is_active ? "deactivate" : "reactivate",
    });
  }

  function confirmStatusChange() {
    if (!statusChange) return;
    const { member, action } = statusChange;

    startTransition(async () => {
      const result =
        action === "deactivate"
          ? await deactivateUserAction(member.id)
          : await reactivateUserAction(member.id);

      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo actualizar el acceso");
        return;
      }

      toast.success(
        action === "deactivate"
          ? "Acceso desactivado. El historial se conservó."
          : "Acceso reactivado"
      );
      setStatusChange(null);
      setSelectedMember(null);
      await loadProfiles();
    });
  }

  function openPasswordDialog(member: StaffMember) {
    setPasswordTarget(member);
    setPasswordDraft("");
    setShowPassword(false);
  }

  function handlePasswordSave() {
    if (!passwordTarget) return;

    startTransition(async () => {
      const result = await resetUserPasswordAction(
        passwordTarget.id,
        passwordDraft
      );
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo actualizar la contraseña");
        return;
      }

      toast.success("Contraseña actualizada");
      setPasswordTarget(null);
      setPasswordDraft("");
    });
  }

  function openPinDialog(member: StaffMember) {
    setPinTarget(member);
    setPinDraft("");
  }

  function handlePinSave() {
    if (!pinTarget || !/^\d{4}$/.test(pinDraft)) return;
    startTransition(async () => {
      const result = await setStaffAuthorizationPinAction(pinTarget.id, pinDraft);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo guardar el PIN");
        return;
      }
      toast.success("PIN de autorización actualizado");
      setPinTarget(null);
      setPinDraft("");
    });
  }

  function askDeleteMember(member: StaffMember) {
    setSelectedMember(null);
    setDeleteTarget(member);
  }

  function confirmDeleteMember() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteUserAction(deleteTarget.id);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo eliminar al empleado");
        return;
      }

      toast.success("Personal eliminado permanentemente");
      setDeleteTarget(null);
      await loadProfiles();
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <Link
          href="/dashboard"
          className="rounded-xl bg-surface-raised p-2.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Volver al dashboard"
        >
          <ChevronDown size={18} className="rotate-90" />
        </Link>
        <div>
          <p className="font-data text-[10px] font-bold uppercase tracking-[0.22em] text-brand">
            Administración
          </p>
          <h1 className="font-heading text-lg font-bold text-foreground">
            Equipo y accesos
          </h1>
        </div>
        <div className="ml-auto hidden items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1.5 sm:flex">
          <ShieldCheck size={14} className="text-success" />
          <span className="font-heading text-[11px] font-bold text-success">
            Historial protegido
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <UsersRound size={21} />
                </div>
                <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                  Personas que hacen funcionar Mideli
                </h2>
                <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
                  Administra quién puede entrar al sistema. Al desactivar a una persona,
                  sus pedidos y movimientos permanecen intactos para tus reportes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm((current) => !current)}
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showAddForm ? <X size={17} /> : <UserPlus size={17} />}
                {showAddForm ? "Cerrar formulario" : "Agregar empleado"}
              </button>
            </div>
          </section>

          <section className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </p>
              <p className="mt-2 font-data text-2xl font-bold text-foreground">{profiles.length}</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">cuentas creadas</p>
            </div>
            <div className="rounded-2xl border border-success/20 bg-success/5 p-4 sm:p-5">
              <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-success">
                Activos
              </p>
              <p className="mt-2 font-data text-2xl font-bold text-foreground">{activeCount}</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">con acceso hoy</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Inactivos
              </p>
              <p className="mt-2 font-data text-2xl font-bold text-foreground">{inactiveCount}</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">historial conservado</p>
            </div>
          </section>

          {showAddForm && (
            <section className="rounded-2xl border border-brand/25 bg-brand/5 p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <Plus size={18} />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">
                    Crear acceso nuevo
                  </h2>
                  <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                    Entrégale estas credenciales al empleado de forma privada. Podrá usar el
                    sistema según el rol elegido.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="font-heading text-xs font-bold text-foreground">Nombre completo</span>
                    <input
                      type="text"
                      value={newUser.full_name}
                      onChange={(event) =>
                        setNewUser({ ...newUser, full_name: event.target.value })
                      }
                      required
                      placeholder="Ej. Ana López"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="font-heading text-xs font-bold text-foreground">Usuario o correo</span>
                    <div className="flex h-11 overflow-hidden rounded-xl border border-border bg-background transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                      <input
                        type="text"
                        value={newUser.email}
                        onChange={(event) =>
                          setNewUser({ ...newUser, email: event.target.value })
                        }
                        required
                        placeholder="ana"
                        className="min-w-0 flex-1 bg-transparent px-3 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                      {!newUser.email.includes("@") && (
                        <span className="flex items-center border-l border-border bg-surface px-2 font-data text-[11px] text-muted-foreground">
                          @mideli.com
                        </span>
                      )}
                    </div>
                  </label>
                  <label className="space-y-1.5">
                    <span className="font-heading text-xs font-bold text-foreground">Contraseña inicial</span>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(event) =>
                        setNewUser({ ...newUser, password: event.target.value })
                      }
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-heading text-xs font-bold text-foreground">Rol de acceso</span>
                    {!isOwner && (
                      <span className="font-body text-[11px] text-muted-foreground">
                        El rol Dueño requiere autorización del dueño actual
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {roleOptions.map((role) => {
                      const selected = newUser.role === role;
                      const disabled = role === "owner" && !isOwner;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setNewUser({ ...newUser, role })}
                          disabled={disabled}
                          className={`rounded-xl border p-3 text-left transition ${
                            selected
                              ? "border-brand bg-brand/10 shadow-sm"
                              : "border-border bg-background hover:border-brand/50"
                          } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-heading text-xs font-bold text-foreground">
                              {roleLabels[role]}
                            </span>
                            {selected && <Check size={14} className="text-brand" />}
                          </span>
                          <span className="mt-1 block font-body text-[11px] leading-4 text-muted-foreground">
                            {roleDescriptions[role]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    disabled={isPending}
                    className="h-10 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending && <Loader2 size={14} className="animate-spin" />}
                    Crear acceso
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">Personal registrado</h2>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    Edita permisos o controla el acceso sin perder la operación histórica.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadProfiles()}
                  disabled={loading || isPending}
                  className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-border px-3 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50 lg:self-auto"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  Actualizar
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nombre o correo"
                    className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <div className="flex rounded-xl border border-border bg-background p-1">
                  {(
                    [
                      ["all", "Todos"],
                      ["active", "Activos"],
                      ["inactive", "Inactivos"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className={`rounded-lg px-3 py-1.5 font-heading text-[11px] font-bold transition ${
                        statusFilter === value
                          ? "bg-brand text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-14 font-body text-sm text-muted-foreground">
                <Loader2 size={18} className="animate-spin text-brand" />
                Cargando personal...
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised text-muted-foreground">
                  <UsersRound size={20} />
                </div>
                <p className="mt-3 font-heading text-sm font-bold text-foreground">
                  {profiles.length === 0 ? "Aún no hay empleados" : "No hay coincidencias"}
                </p>
                <p className="mt-1 max-w-xs font-body text-xs leading-5 text-muted-foreground">
                  {profiles.length === 0
                    ? "Agrega el primer acceso para que tu equipo pueda operar Mideli."
                    : "Prueba con otro nombre o cambia el filtro de estado."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredProfiles.map((profile) => (
                  <article
                    key={profile.id}
                    className={`flex flex-col gap-4 p-4 transition hover:bg-surface/60 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                      !profile.is_active ? "opacity-70" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-heading text-sm font-bold ${
                          profile.is_active ? "bg-brand/10 text-brand" : "bg-surface-raised text-muted-foreground"
                        }`}
                      >
                        {getInitials(profile.full_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-heading text-sm font-bold text-foreground">
                            {profile.full_name || "Sin nombre"}
                          </h3>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-heading text-[10px] font-bold ${
                              profile.is_active
                                ? "border-success/20 bg-success/10 text-success"
                                : "border-border bg-surface-raised text-muted-foreground"
                            }`}
                          >
                            {profile.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Mail size={12} />
                            {profile.email ?? "Correo no disponible"}
                          </span>
                          <span className="hidden text-border sm:inline">•</span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={12} />
                            {formatLastAccess(profile.last_sign_in_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span
                        className={`rounded-lg border px-2.5 py-1.5 font-heading text-[11px] font-bold ${roleColors[profile.role]}`}
                      >
                        {roleLabels[profile.role]}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openMember(profile)}
                          disabled={isPending}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 font-heading text-xs font-bold text-muted-foreground transition hover:border-brand/40 hover:text-foreground disabled:opacity-50"
                          title="Editar permisos"
                        >
                          <Pencil size={14} />
                          <span className="hidden md:inline">Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPasswordDialog(profile)}
                          disabled={isPending}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-2.5 text-muted-foreground transition hover:border-gold/40 hover:text-gold disabled:opacity-50"
                          title="Definir contraseña"
                        >
                          <KeyRound size={14} />
                        </button>
                        {profile.role === "owner" || profile.role === "admin" || profile.role === "supervisor" ? (
                          <button
                            type="button"
                            onClick={() => openPinDialog(profile)}
                            disabled={isPending}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-2.5 text-muted-foreground transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
                            title="Definir PIN de descuentos"
                          >
                            <ShieldCheck size={14} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => askStatusChange(profile)}
                          disabled={isPending}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 font-heading text-xs font-bold transition disabled:opacity-50 ${
                            profile.is_active
                              ? "border-warning/25 text-warning hover:bg-warning-light"
                              : "border-success/20 text-success hover:bg-success/10"
                          }`}
                          title={profile.is_active ? "Desactivar acceso" : "Reactivar acceso"}
                        >
                          {profile.is_active ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                          <span className="hidden md:inline">
                            {profile.is_active ? "Desactivar" : "Reactivar"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedMember(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-dialog-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 font-heading text-sm font-bold text-brand">
                  {getInitials(selectedMember.full_name)}
                </div>
                <div>
                  <h2 id="member-dialog-title" className="font-heading text-base font-bold text-foreground">
                    {selectedMember.full_name || "Sin nombre"}
                  </h2>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    {selectedMember.email ?? "Correo no disponible"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-surface-raised hover:text-foreground"
                aria-label="Cerrar"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="font-heading text-xs font-bold text-foreground">Rol de acceso</span>
                <select
                  value={roleDraft}
                  onChange={(event) => setRoleDraft(event.target.value as StaffRole)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role} disabled={role === "owner" && !isOwner}>
                      {roleLabels[role]} · {roleDescriptions[role]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-heading text-xs font-bold text-foreground">Estado de la cuenta</p>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {selectedMember.is_active
                        ? "Puede iniciar sesión y operar Mideli."
                        : "No puede iniciar sesión. Su historial permanece guardado."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 font-heading text-[10px] font-bold ${
                      selectedMember.is_active
                        ? "border-success/20 bg-success/10 text-success"
                        : "border-border bg-surface-raised text-muted-foreground"
                    }`}
                  >
                    {selectedMember.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => askDeleteMember(selectedMember)}
                disabled={isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-2 font-heading text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Eliminar permanentemente
              </button>
              <p className="mt-1 font-body text-[11px] leading-4 text-muted-foreground">
                Solo se permite si no tiene pedidos ni actividad registrada.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="h-10 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRoleSave}
                disabled={isPending || roleDraft === selectedMember.role}
                className="action-success inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </section>
        </div>
      )}

      {statusChange && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              {statusChange.action === "deactivate" ? <UserRoundX size={20} /> : <UserRoundCheck size={20} />}
            </div>
            <h2 className="mt-4 font-heading text-lg font-bold text-foreground">
              {statusChange.action === "deactivate" ? "Desactivar acceso" : "Reactivar acceso"}
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              {statusChange.action === "deactivate"
                ? `¿Quieres desactivar a ${statusChange.member.full_name || "este empleado"}? Ya no podrá entrar, pero sus pedidos, cobros y movimientos seguirán disponibles.`
                : `¿Quieres devolverle el acceso a ${statusChange.member.full_name || "este empleado"}? Podrá iniciar sesión de nuevo con su contraseña actual.`}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setStatusChange(null)}
                disabled={isPending}
                className="h-10 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmStatusChange}
                disabled={isPending}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:opacity-50 ${
                  statusChange.action === "deactivate"
                    ? "action-warning"
                    : "action-success"
                }`}
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                {statusChange.action === "deactivate" ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-destructive/25 bg-card p-5 shadow-2xl sm:p-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 size={20} />
            </div>
            <h2 id="delete-dialog-title" className="mt-4 font-heading text-lg font-bold text-foreground">
              Eliminar personal
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              ¿Eliminar permanentemente a {deleteTarget.full_name || "esta persona"}? Esta acción borra su acceso y su perfil.
            </p>
            <div className="mt-4 rounded-xl border border-gold/20 bg-gold/5 p-3 font-body text-xs leading-5 text-gold">
              Si tiene pedidos o actividad registrada, la operación será rechazada para proteger el historial. En ese caso usa “Desactivar”.
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isPending}
                className="h-10 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteMember}
                disabled={isPending}
                className="action-danger inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </section>
        </div>
      )}

      {passwordTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-gold/25 bg-card p-5 shadow-2xl sm:p-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/10 text-gold">
              <KeyRound size={20} />
            </div>
            <h2 id="password-dialog-title" className="mt-4 font-heading text-lg font-bold text-foreground">
              Definir contraseña
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              Crea una contraseña para {passwordTarget.full_name || "este empleado"}. El cambio se aplica de inmediato.
            </p>
            <label className="mt-5 block space-y-2">
              <span className="font-heading text-xs font-bold text-foreground">Nueva contraseña</span>
              <div className="flex h-11 items-center overflow-hidden rounded-xl border border-border bg-background transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handlePasswordSave();
                  }}
                  minLength={6}
                  autoFocus
                  placeholder="Mínimo 6 caracteres"
                  className="min-w-0 flex-1 bg-transparent px-3 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-raised hover:text-foreground"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="block font-body text-[11px] text-muted-foreground">
                Usa al menos 6 caracteres y compártela de forma privada.
              </span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                disabled={isPending}
                className="h-10 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePasswordSave}
                disabled={isPending || passwordDraft.length < 6}
                className="action-success inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Guardar contraseña
              </button>
            </div>
          </section>
        </div>
      )}

      {pinTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title" className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-float sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
              <ShieldCheck size={20} />
            </div>
            <h2 id="pin-dialog-title" className="mt-4 font-heading text-lg font-bold text-foreground">PIN de autorización</h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              Define un PIN privado de 4 dígitos para {pinTarget.full_name || "este responsable"}. Se solicitará para descuentos y operaciones sensibles de caja.
            </p>
            <label className="mt-5 block space-y-2">
              <span className="font-heading text-xs font-bold text-foreground">Nuevo PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                autoFocus
                value={pinDraft}
                onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(event) => { if (event.key === "Enter") handlePinSave(); }}
                placeholder="••••"
                className="form-input text-center font-data text-xl tracking-[0.45em]"
              />
              <span className="block font-body text-[11px] text-muted-foreground">Después de 5 intentos fallidos se bloquea durante 10 minutos.</span>
            </label>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setPinTarget(null)} disabled={isPending} className="h-11 flex-1 rounded-xl font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised">Cancelar</button>
              <button type="button" onClick={handlePinSave} disabled={isPending || pinDraft.length !== 4} className="action-success inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:opacity-40">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Guardar PIN
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
