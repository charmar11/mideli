"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  Archive,
  ArrowRightLeft,
  BookOpen,
  Building2,
  ChefHat,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Loader2,
  LogOut,
  MessageCircle,
  Pencil,
  PauseCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import { BusinessIdentityFields } from "@/components/admin/business-identity-fields";
import { OrganizationBusinessTeams } from "@/components/admin/organization-business-teams";
import { RinconBrand } from "@/components/auth/rincon-brand";
import {
  createBusinessWithOwnerAction,
  listManagedBusinessesAction,
  updateBusinessDetailsAction,
  updateBusinessOwnerCapabilitiesAction,
  createPlatformAdministratorAction,
  updateBusinessLifecycleAction,
  listBusinessOwnerTransferCandidatesAction,
  transferBusinessOwnerAction,
  type BusinessOwnerTransferCandidate,
  type ManagedBusiness,
  type ManagedOrganization,
} from "@/lib/actions/businesses";
import {
  BUSINESS_OWNER_CAPABILITIES,
  BUSINESS_OWNER_CAPABILITY_CODES,
  type BusinessOwnerCapabilityCode,
} from "@/lib/business-capabilities";
import type { BusinessLifecycleStatus } from "@/types/multibusiness";
import {
  getBusinessBrandColors,
  getBusinessLogoUrl,
  getReadableBrandForeground,
  PLATFORM_BRAND_COLORS,
} from "@/lib/business-branding";

const STATUS_LABELS: Record<BusinessLifecycleStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  archived: "Archivado",
  retired: "Retirado",
};

const STATUS_CLASSES: Record<BusinessLifecycleStatus, string> = {
  draft: "bg-gold/12 text-gold",
  active: "bg-success/12 text-success",
  paused: "bg-warning/12 text-warning",
  archived: "bg-muted/50 text-muted-foreground",
  retired: "bg-destructive/10 text-destructive",
};

type BusinessModule = {
  code: string;
  label: string;
  icon: LucideIcon;
};

const BUSINESS_MODULES: BusinessModule[] = [
  { code: "business.manage_catalog", label: "Catálogo", icon: BookOpen },
  { code: "business.manage_inventory", label: "Inventario", icon: ClipboardList },
  { code: "business.operate_orders", label: "Pedidos", icon: ClipboardList },
  { code: "business.update_preparation", label: "Cocina", icon: ChefHat },
  { code: "business.charge_orders", label: "Cobros", icon: CreditCard },
  { code: "business.manage_cash", label: "Caja", icon: WalletCards },
  { code: "business.manage_staff", label: "Personal", icon: Users },
];

type CreateDraft = {
  organizationId: string;
  displayName: string;
  slug: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  ownerName: string;
  ownerLogin: string;
  ownerPassword: string;
  capabilityCodes: BusinessOwnerCapabilityCode[];
};

const EMPTY_DRAFT: CreateDraft = {
  organizationId: "",
  displayName: "",
  slug: "",
  brandPrimaryColor: PLATFORM_BRAND_COLORS.primary,
  brandAccentColor: PLATFORM_BRAND_COLORS.accent,
  ownerName: "",
  ownerLogin: "",
  ownerPassword: "",
  capabilityCodes: [...BUSINESS_OWNER_CAPABILITY_CODES],
};

type EditDraft = {
  displayName: string;
  slug: string;
  timezone: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  capabilityCodes: BusinessOwnerCapabilityCode[];
};

type PlatformAdminDraft = {
  name: string;
  login: string;
  password: string;
};

const TIMEZONE_OPTIONS = [
  { value: "America/Hermosillo", label: "Hermosillo (Sonora)" },
  { value: "America/Mexico_City", label: "Ciudad de México" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Tijuana", label: "Tijuana" },
  { value: "America/Cancun", label: "Cancún" },
  { value: "UTC", label: "UTC" },
];

const EMPTY_PLATFORM_ADMIN_DRAFT: PlatformAdminDraft = {
  name: "Administrador de plataforma",
  login: "rincon404",
  password: "",
};

type LogoSaveResult = {
  success: boolean;
  path: string | null;
  error: string | null;
};

async function saveBusinessLogo(
  businessId: string,
  file: File | null,
  operation: "upload" | "remove",
): Promise<LogoSaveResult> {
  try {
    const form = new FormData();
    form.set("businessId", businessId);
    form.set("operation", operation);
    if (file) form.set("logo", file);

    const response = await fetch("/api/platform/business-brand-logo", {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as {
      success?: boolean;
      path?: string | null;
      error?: string;
      warning?: string | null;
    };
    if (!response.ok || !result.success) {
      return {
        success: false,
        path: null,
        error: result.error ?? "No se pudo guardar el logo",
      };
    }
    if (result.warning) toast.warning(result.warning);
    return { success: true, path: result.path ?? null, error: null };
  } catch {
    return {
      success: false,
      path: null,
      error: "No se pudo conectar para guardar el logo",
    };
  }
}

function CapabilitySelector({
  selectedCodes,
  onToggle,
}: {
  selectedCodes: readonly string[];
  onToggle: (code: BusinessOwnerCapabilityCode) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-border/80 bg-background/45 p-4">
      <legend className="px-1 font-heading text-xs font-bold text-foreground">
        Permisos del dueño
      </legend>
      <p className="mt-1 font-body text-[11px] leading-4 text-muted-foreground">
        Selecciona las áreas que podrá administrar u operar en este negocio. Puedes cambiarlo después.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {BUSINESS_OWNER_CAPABILITIES.map((capability) => {
          const checked = selectedCodes.includes(capability.code);
          const businessModule = BUSINESS_MODULES.find((item) => item.code === capability.code);
          const Icon = businessModule?.icon ?? ShieldCheck;
          const isRequired = capability.code === "business.manage_catalog";

          return (
            <label
              key={capability.code}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                checked
                  ? "border-success/35 bg-success/10"
                  : "border-border bg-surface-raised/50 hover:border-brand/40"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isRequired}
                onChange={() => onToggle(capability.code)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span className={`mt-0.5 shrink-0 ${checked ? "text-success" : "text-muted-foreground"}`}>
                <Icon size={16} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-xs font-bold text-foreground">
                  {capability.label}
                  {isRequired ? <span className="ml-1 font-body text-[10px] font-normal text-gold">obligatorio</span> : null}
                </span>
                <span className="mt-0.5 block font-body text-[10px] leading-4 text-muted-foreground">
                  {capability.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 font-body text-[11px] leading-4 text-muted-foreground">
        El Catálogo es obligatorio para que el dueño pueda configurar su menú. Cocina, pedidos, cobros y caja sólo operan cuando el negocio está activo.
      </p>
    </fieldset>
  );
}

function BusinessBrandBadge({ business }: { business: ManagedBusiness }) {
  const brand = getBusinessBrandColors(
    business.slug,
    business.brand_primary_color,
    business.brand_accent_color,
  );
  const logoUrl = getBusinessLogoUrl(business.brand_logo_path);

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-xl border bg-background p-1 object-contain"
        style={{ borderColor: brand.accent }}
      />
    );
  }

  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: brand.primary, color: getReadableBrandForeground(brand.primary) }}
    >
      <Building2 size={20} aria-hidden />
    </span>
  );
}

export function BusinessesManager({
  showGlobalStaffLink = false,
  showLicenseLink = false,
}: {
  showGlobalStaffLink?: boolean;
  showLicenseLink?: boolean;
}) {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<ManagedBusiness[]>([]);
  const [organizations, setOrganizations] = useState<ManagedOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [editingBusiness, setEditingBusiness] = useState<ManagedBusiness | null>(null);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [removeEditLogo, setRemoveEditLogo] = useState(false);
  const [showPlatformTransfer, setShowPlatformTransfer] = useState(false);
  const [ownerTransferBusiness, setOwnerTransferBusiness] = useState<ManagedBusiness | null>(null);
  const [ownerTransferCandidates, setOwnerTransferCandidates] = useState<BusinessOwnerTransferCandidate[]>([]);
  const [ownerTransferLoading, setOwnerTransferLoading] = useState(false);
  const [ownerTransferUserId, setOwnerTransferUserId] = useState("");
  const [ownerTransferReason, setOwnerTransferReason] = useState("");
  const [ownerTransferConfirmed, setOwnerTransferConfirmed] = useState(false);
  const [platformAdminDraft, setPlatformAdminDraft] = useState<PlatformAdminDraft>(EMPTY_PLATFORM_ADMIN_DRAFT);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    displayName: "",
    slug: "",
    timezone: "America/Hermosillo",
    brandPrimaryColor: PLATFORM_BRAND_COLORS.primary,
    brandAccentColor: PLATFORM_BRAND_COLORS.accent,
    capabilityCodes: [...BUSINESS_OWNER_CAPABILITY_CODES],
  });
  const [isPending, startTransition] = useTransition();

  async function handlePlatformLogout() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/login");
  }

  async function load() {
    setLoading(true);
    const result = await listManagedBusinessesAction();
    setLoading(false);
    if (result.error) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setBusinesses(result.businesses);
    setOrganizations(result.organizations);
    setDraft((current) => ({
      ...current,
      organizationId: current.organizationId || result.organizations[0]?.id || "",
    }));
  }

  async function startOwnerTransfer(business: ManagedBusiness) {
    setOwnerTransferBusiness(business);
    setOwnerTransferCandidates([]);
    setOwnerTransferUserId("");
    setOwnerTransferReason("");
    setOwnerTransferConfirmed(false);
    setOwnerTransferLoading(true);
    const result = await listBusinessOwnerTransferCandidatesAction(business.id);
    setOwnerTransferLoading(false);
    if (result.error) {
      setOwnerTransferBusiness(null);
      toast.error(result.error);
      return;
    }
    setOwnerTransferCandidates(result.candidates);
  }

  function submitOwnerTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerTransferBusiness || !ownerTransferUserId || !ownerTransferConfirmed) return;

    startTransition(async () => {
      const result = await transferBusinessOwnerAction({
        businessId: ownerTransferBusiness.id,
        newOwnerUserId: ownerTransferUserId,
        reason: ownerTransferReason,
      });
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo transferir el dueño");
        return;
      }
      toast.success(`El dueño de ${ownerTransferBusiness.display_name} fue actualizado`);
      setOwnerTransferBusiness(null);
      await load();
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateDraft(field: keyof CreateDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startEditing(business: ManagedBusiness) {
    const brand = getBusinessBrandColors(
      business.slug,
      business.brand_primary_color,
      business.brand_accent_color,
    );
    setEditingBusiness(business);
    setEditLogoFile(null);
    setRemoveEditLogo(false);
    setEditDraft({
      displayName: business.display_name,
      slug: business.slug,
      timezone: business.timezone,
      brandPrimaryColor: brand.primary,
      brandAccentColor: brand.accent,
      capabilityCodes: business.capability_codes.filter(
        (code): code is BusinessOwnerCapabilityCode =>
          BUSINESS_OWNER_CAPABILITY_CODES.includes(code as BusinessOwnerCapabilityCode),
      ),
    });
  }

  function toggleCreateCapability(code: BusinessOwnerCapabilityCode) {
    setDraft((current) => ({
      ...current,
      capabilityCodes: current.capabilityCodes.includes(code)
        ? current.capabilityCodes.filter((currentCode) => currentCode !== code)
        : [...current.capabilityCodes, code],
    }));
  }

  function toggleEditCapability(code: BusinessOwnerCapabilityCode) {
    setEditDraft((current) => ({
      ...current,
      capabilityCodes: current.capabilityCodes.includes(code)
        ? current.capabilityCodes.filter((currentCode) => currentCode !== code)
        : [...current.capabilityCodes, code],
    }));
  }

  function updateEditDraft(field: keyof EditDraft, value: string) {
    setEditDraft((current) => ({ ...current, [field]: value }));
  }

  function updatePlatformAdminDraft(field: keyof PlatformAdminDraft, value: string) {
    setPlatformAdminDraft((current) => ({ ...current, [field]: value }));
  }

  function submitPlatformTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createPlatformAdministratorAction(platformAdminDraft);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo crear el administrador de plataforma");
        return;
      }
      toast.success("Administrador de plataforma creado", {
        description: "Tu cuenta actual conserva únicamente el acceso a su negocio.",
      });
      setShowPlatformTransfer(false);
      setPlatformAdminDraft(EMPTY_PLATFORM_ADMIN_DRAFT);
      router.replace("/dashboard/mesero");
      router.refresh();
    });
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBusiness) return;

    startTransition(async () => {
      const { displayName, slug, timezone, capabilityCodes, brandPrimaryColor, brandAccentColor } = editDraft;
      const result = await updateBusinessDetailsAction({
        businessId: editingBusiness.id,
        displayName,
        slug,
        timezone,
        brandPrimaryColor,
        brandAccentColor,
      });
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo editar el negocio");
        return;
      }

      let logoSaveError: string | null = null;
      let savedLogoPath = editingBusiness.brand_logo_path;
      if (editLogoFile || removeEditLogo) {
        const logoResult = await saveBusinessLogo(
          editingBusiness.id,
          editLogoFile,
          editLogoFile ? "upload" : "remove",
        );
        if (!logoResult.success) {
          logoSaveError = logoResult.error ?? "No se pudo guardar el logo";
        } else {
          savedLogoPath = logoResult.path;
          setEditLogoFile(null);
          setRemoveEditLogo(false);
        }
      }

      const capabilityResult = await updateBusinessOwnerCapabilitiesAction({
        businessId: editingBusiness.id,
        capabilityCodes,
      });
      setEditingBusiness((current) => current ? {
        ...current,
        display_name: displayName,
        slug,
        timezone,
        brand_primary_color: brandPrimaryColor,
        brand_accent_color: brandAccentColor,
        brand_logo_path: savedLogoPath,
      } : current);
      if (!capabilityResult.success || capabilityResult.error) {
        toast.error(capabilityResult.error ?? "No se pudieron actualizar los permisos del dueño");
        await load();
        return;
      }

      if (logoSaveError) {
        toast.error("Se guardaron los datos del negocio, pero no el logo", {
          description: `${logoSaveError}. Puedes volver a intentarlo sin perder los demás cambios.`,
        });
        await load();
        return;
      }

      toast.success("Negocio y permisos actualizados");
      await useBusinessContextStore.getState().ensureLoaded(true);
      setEditingBusiness(null);
      await load();
    });
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBusinessWithOwnerAction(draft);
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo crear el negocio");
        return;
      }
      let logoSaveError: string | null = null;
      if (createLogoFile) {
        if (!result.businessId) {
          logoSaveError = "El negocio se creó, pero no se recibió su identificador para guardar el logo";
        } else {
          const logoResult = await saveBusinessLogo(result.businessId, createLogoFile, "upload");
          if (!logoResult.success) logoSaveError = logoResult.error ?? "No se pudo guardar el logo";
        }
      }
      if (logoSaveError) {
        toast.warning("El negocio se creó, pero el logo quedó pendiente", {
          description: `${logoSaveError}. Puedes subirlo desde Editar negocio.`,
        });
      } else {
        toast.success("Negocio creado como borrador", {
          description: "Actívalo después de revisar su catálogo y acceso.",
        });
      }
      setDraft({ ...EMPTY_DRAFT, capabilityCodes: [...BUSINESS_OWNER_CAPABILITY_CODES] });
      setCreateLogoFile(null);
      setShowCreate(false);
      await load();
    });
  }

  function changeLifecycle(business: ManagedBusiness, status: BusinessLifecycleStatus) {
    if (status === "retired") return;
    const actionLabel = status === "archived"
      ? "archivar"
      : status === "paused"
        ? "pausar"
        : status === "active"
          ? "activar"
          : "regresar a borrador";
    const reason = status === "paused" || status === "archived"
      ? window.prompt(`Escribe el motivo para ${actionLabel} ${business.display_name}`)
      : undefined;
    if ((status === "paused" || status === "archived") && reason === null) return;
    if (!window.confirm(`¿Quieres ${actionLabel} ${business.display_name}?`)) return;

    startTransition(async () => {
      const result = await updateBusinessLifecycleAction({
        businessId: business.id,
        status,
        reason: reason ?? undefined,
      });
      if (!result.success || result.error) {
        toast.error(result.error ?? "No se pudo actualizar el negocio");
        return;
      }
      toast.success(`Negocio ${STATUS_LABELS[status].toLowerCase()}`);
      await load();
    });
  }

  return (
    <div className="mideli-platform-screen flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <RinconBrand compact />
          <span aria-hidden className="h-8 w-px bg-border" />
          <span className="font-heading text-sm font-semibold text-muted-foreground">
            Administración
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-2 sm:flex">
              <ShieldCheck size={14} className="text-success" />
              <span className="font-heading text-[11px] font-bold text-success">
                Acceso protegido
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handlePlatformLogout()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:px-4"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Secciones de administración"
        className="border-b border-border bg-surface/70 px-4 sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto py-2">
          <Link
            href="/settings/negocios"
            aria-current="page"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white"
          >
            <Building2 size={15} aria-hidden />
            Negocios
          </Link>
          {showGlobalStaffLink ? (
            <Link
              href="/settings"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 font-heading text-xs font-bold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <Users size={15} aria-hidden />
              Personal global
            </Link>
          ) : null}
          {showLicenseLink ? (
            <Link
              href="/settings/licencias"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 font-heading text-xs font-bold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <ShieldCheck size={15} aria-hidden />
              Licencias
            </Link>
          ) : null}
        </div>
      </nav>

      <main className="mideli-page-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                Negocios
              </h1>
              <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
                Administra las cuentas, identidad y estado de cada local. Cada negocio conserva su propio catálogo, inventario, caja e historial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading || isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised px-4 font-heading text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => setShowCreate((current) => {
                  if (current) setCreateLogoFile(null);
                  return !current;
                })}
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover disabled:opacity-50"
              >
                {showCreate ? <X size={17} /> : <Plus size={17} />}
                {showCreate ? "Cerrar" : "Nuevo negocio"}
              </button>
            </div>
          </section>

          <section
            aria-label="Resumen de negocios"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-sm"
          >
            {([
              ["active", "activos", "bg-success"],
              ["draft", "borradores", "bg-gold"],
              ["paused", "pausados", "bg-warning"],
            ] as const).map(([status, label, dotClass]) => (
              <span key={status} className="inline-flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className={`size-2 rounded-full ${dotClass}`} />
                <span className="font-data font-bold text-foreground">
                  {businesses.filter((business) => business.lifecycle_status === status).length}
                </span>
                {label}
              </span>
            ))}
            <span className="text-muted-foreground">
              {businesses.length} locales registrados
            </span>
          </section>

          {showCreate ? (
            <form onSubmit={submitCreate} className="rounded-2xl border border-brand/30 bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <Plus size={18} />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold">Registrar un negocio</h2>
                  <p className="mt-1 font-body text-xs text-muted-foreground">La cuenta del dueño conservará su usuario y contraseña propios.</p>
                </div>
              </div>
              <BusinessIdentityFields
                name={draft.displayName}
                onNameChange={(value) => updateDraft("displayName", value)}
                primaryColor={draft.brandPrimaryColor}
                accentColor={draft.brandAccentColor}
                onPrimaryColorChange={(value) => updateDraft("brandPrimaryColor", value)}
                onAccentColorChange={(value) => updateDraft("brandAccentColor", value)}
                logoFile={createLogoFile}
                onLogoFileChange={setCreateLogoFile}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="font-body text-xs font-semibold text-muted-foreground">
                  Organización
                  <select required value={draft.organizationId} onChange={(event) => updateDraft("organizationId", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                    <option value="">Selecciona una organización</option>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </label>
                <label className="font-body text-xs font-semibold text-muted-foreground">
                  Identificador interno
                  <input required value={draft.slug} onChange={(event) => updateDraft("slug", event.target.value)} placeholder="Ej. just-dipping" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                  <span className="mt-1 block font-body text-[11px] font-normal text-muted-foreground">Puedes editarlo después si no existe otro igual en la organización.</span>
                </label>
                <label className="font-body text-xs font-semibold text-muted-foreground">
                  Nombre del dueño
                  <input required value={draft.ownerName} onChange={(event) => updateDraft("ownerName", event.target.value)} placeholder="Nombre completo" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                </label>
                <label className="font-body text-xs font-semibold text-muted-foreground">
                  Usuario para iniciar sesión
                  <input required autoComplete="username" value={draft.ownerLogin} onChange={(event) => updateDraft("ownerLogin", event.target.value)} placeholder="Ej. justdipping" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                  <span className="mt-1 block font-body text-[11px] font-normal text-muted-foreground">El dueño entrará con este usuario, sin escribir correo.</span>
                </label>
                <label className="font-body text-xs font-semibold text-muted-foreground">
                  Contraseña inicial
                  <input required minLength={8} type="password" autoComplete="new-password" value={draft.ownerPassword} onChange={(event) => updateDraft("ownerPassword", event.target.value)} placeholder="Mínimo 8 caracteres" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                </label>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand/20 bg-brand/5 p-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
                <p className="font-body text-xs leading-5 text-muted-foreground">
                  Por seguridad, el PIN de autorización no se define al crear el negocio. El dueño lo configura desde <strong className="text-foreground">Personal</strong> después de iniciar sesión.
                </p>
              </div>
              <div className="mt-5">
                <CapabilitySelector
                  selectedCodes={draft.capabilityCodes}
                  onToggle={toggleCreateCapability}
                />
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { setShowCreate(false); setCreateLogoFile(null); }} className="h-11 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
                <button type="submit" disabled={isPending || organizations.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white disabled:opacity-50">
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Crear como borrador
                </button>
              </div>
            </form>
          ) : null}

          {loadError ? (
            <section className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 p-4">
              <CircleAlert size={20} className="mt-0.5 shrink-0 text-destructive" />
              <div>
                <p className="font-heading text-sm font-bold">No se pudo cargar esta sección</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">{loadError}</p>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-bold">Locales registrados</h2>
                <p className="font-body text-xs text-muted-foreground">
                  Archivar conserva la información; no borra ventas ni inventario.
                </p>
              </div>
            </div>
            {loading ? (
              <div className="flex min-h-44 items-center justify-center rounded-2xl border border-border bg-card text-brand"><RefreshCw size={24} className="animate-spin" /></div>
            ) : businesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><Building2 size={28} className="mx-auto mb-3 text-muted-foreground/50" /><p className="font-heading text-sm font-bold">No hay negocios visibles</p></div>
            ) : (
              businesses.map((business) => (
                <article key={business.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <BusinessBrandBadge business={business} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-base font-bold">{business.display_name}</h3>
                          <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${STATUS_CLASSES[business.lifecycle_status]}`}>{STATUS_LABELS[business.lifecycle_status]}</span>
                        </div>
                        <p className="mt-1 font-data text-xs text-muted-foreground">{business.slug} · {business.organization_name}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 font-body text-xs text-muted-foreground">
                          <span>
                            Dueño: {business.owner_name ?? "Sin dueño asignado"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck size={13} aria-hidden />
                            {business.capability_codes.filter((code) =>
                              BUSINESS_MODULES.some((module) => module.code === code)
                            ).length} de {BUSINESS_MODULES.length} áreas habilitadas para el dueño
                          </span>
                          {business.lifecycle_status !== "active" ? (
                            <span className="text-gold">
                              El acceso operativo se habilita al activar el local.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-[24rem] lg:justify-end">
                      <button type="button" onClick={() => void startOwnerTransfer(business)} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-warning/30 px-3 font-heading text-xs font-bold text-warning hover:bg-warning/10 disabled:opacity-50"><ArrowRightLeft size={15} /> Cambiar dueño</button>
                      <button type="button" onClick={() => startEditing(business)} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand/30 px-3 font-heading text-xs font-bold text-brand hover:bg-brand/8 disabled:opacity-50"><Pencil size={15} /> Configurar</button>
                      {business.lifecycle_status === "draft" || business.lifecycle_status === "paused" ? (
                        <button type="button" onClick={() => changeLifecycle(business, "active")} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-3 font-heading text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={15} /> Activar</button>
                      ) : null}
                      {business.lifecycle_status === "active" ? (
                        <button type="button" onClick={() => changeLifecycle(business, "paused")} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-warning/30 px-3 font-heading text-xs font-bold text-warning hover:bg-warning/10 disabled:opacity-50"><PauseCircle size={15} /> Pausar</button>
                      ) : null}
                      {business.lifecycle_status !== "archived" && business.lifecycle_status !== "retired" ? (
                        <button type="button" onClick={() => changeLifecycle(business, "archived")} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-destructive/25 px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"><Archive size={15} /> Archivar</button>
                      ) : null}
                      {business.lifecycle_status === "archived" ? (
                        <button type="button" onClick={() => changeLifecycle(business, "draft")} disabled={isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-foreground hover:bg-surface-raised disabled:opacity-50"><RotateCcw size={15} /> Restaurar como borrador</button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>

          {showGlobalStaffLink ? <OrganizationBusinessTeams /> : null}

          <section className="border-t border-border pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                  <ShieldCheck size={18} aria-hidden />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold">Seguridad de plataforma</h2>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    Crea una cuenta independiente para administrar Rincón 404 y separa ese acceso de la cuenta que usas para tu negocio.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-expanded={showPlatformTransfer}
                aria-controls="platform-admin-transfer-form"
                onClick={() => setShowPlatformTransfer((current) => !current)}
                disabled={isPending}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-warning/30 px-4 font-heading text-xs font-bold text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
              >
                <ShieldCheck size={15} />
                {showPlatformTransfer ? "Cerrar" : "Crear administrador independiente"}
              </button>
            </div>

            {showPlatformTransfer ? (
              <form
                id="platform-admin-transfer-form"
                onSubmit={submitPlatformTransfer}
                className="mt-5 rounded-2xl border border-warning/25 bg-card p-5 sm:p-6"
              >
                <h3 className="font-heading text-base font-bold">
                  Nueva cuenta de plataforma
                </h3>
                <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                  Al confirmar, esta cuenta recibirá la administración de Rincón 404 y se retirará ese permiso de tu cuenta actual. Tu acceso de dueño, pedidos e historial del negocio se conservan.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <label className="font-body text-xs font-semibold text-muted-foreground">
                    Nombre visible
                    <input required maxLength={100} value={platformAdminDraft.name} onChange={(event) => updatePlatformAdminDraft("name", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                  </label>
                  <label className="font-body text-xs font-semibold text-muted-foreground">
                    Usuario
                    <input required maxLength={40} autoComplete="username" value={platformAdminDraft.login} onChange={(event) => updatePlatformAdminDraft("login", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                  </label>
                  <label className="font-body text-xs font-semibold text-muted-foreground">
                    Contraseña
                    <input required minLength={8} maxLength={100} type="password" autoComplete="new-password" value={platformAdminDraft.password} onChange={(event) => updatePlatformAdminDraft("password", event.target.value)} placeholder="Mínimo 8 caracteres" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                  </label>
                </div>
                <p className="mt-3 font-body text-[11px] text-muted-foreground">
                  Usa una contraseña distinta al usuario. No se guardará en el código ni en la auditoría.
                </p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setShowPlatformTransfer(false)} disabled={isPending} className="h-11 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar</button>
                  <button type="submit" disabled={isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-warning px-5 font-heading text-sm font-bold text-background disabled:opacity-50">
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Crear y separar cuentas
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      </main>

      {editingBusiness ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-business-title" className="max-h-[min(92dvh,58rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Editar negocio</p>
                <h2 id="edit-business-title" className="mt-1 font-heading text-xl font-bold">{editingBusiness.display_name}</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground">Los pedidos, inventario y ventas existentes conservarán su negocio.</p>
              </div>
              <button type="button" onClick={() => setEditingBusiness(null)} disabled={isPending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Cerrar edición"><X size={18} /></button>
            </div>
            <form onSubmit={submitEdit} className="mt-5 space-y-4">
              <BusinessIdentityFields
                name={editDraft.displayName}
                onNameChange={(value) => updateEditDraft("displayName", value)}
                primaryColor={editDraft.brandPrimaryColor}
                accentColor={editDraft.brandAccentColor}
                onPrimaryColorChange={(value) => updateEditDraft("brandPrimaryColor", value)}
                onAccentColorChange={(value) => updateEditDraft("brandAccentColor", value)}
                logoFile={editLogoFile}
                onLogoFileChange={(file) => {
                  setEditLogoFile(file);
                  if (file) setRemoveEditLogo(false);
                }}
                currentLogoPath={editingBusiness.brand_logo_path}
                removeCurrentLogoPending={removeEditLogo}
                onRemoveCurrentLogo={() => {
                  setEditLogoFile(null);
                  setRemoveEditLogo(true);
                }}
                onRestoreCurrentLogo={() => setRemoveEditLogo(false)}
              />
              <label className="block font-body text-xs font-semibold text-muted-foreground">
                Identificador interno
                <input required maxLength={60} value={editDraft.slug} onChange={(event) => updateEditDraft("slug", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                <span className="mt-1 block font-body text-[11px] font-normal text-muted-foreground">Sólo puede repetirse en organizaciones distintas.</span>
              </label>
              <label className="block font-body text-xs font-semibold text-muted-foreground">
                Zona horaria
                <select required value={editDraft.timezone} onChange={(event) => updateEditDraft("timezone", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                  {!TIMEZONE_OPTIONS.some((option) => option.value === editDraft.timezone) ? <option value={editDraft.timezone}>{editDraft.timezone}</option> : null}
                  {TIMEZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <CapabilitySelector
                selectedCodes={editDraft.capabilityCodes}
                onToggle={toggleEditCapability}
              />
              <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/8 p-3">
                <MessageCircle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <p className="font-body text-[11px] leading-4 text-muted-foreground">
                  WhatsApp permanece exclusivo de Mideli en esta etapa y no se asigna desde este selector.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setEditingBusiness(null)} disabled={isPending} className="h-11 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white disabled:opacity-50">
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {ownerTransferBusiness ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-transfer-title"
            className="max-h-[min(92dvh,48rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-warning">Cambio de autoridad</p>
                <h2 id="owner-transfer-title" className="mt-1 font-heading text-xl font-bold">Cambiar dueño de {ownerTransferBusiness.display_name}</h2>
                <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                  La cuenta y contraseña de la nueva persona se conservan. La persona anterior pierde sólo el rango de dueño de este local; otras asignaciones e historial permanecen.
                </p>
              </div>
              <button type="button" onClick={() => setOwnerTransferBusiness(null)} disabled={isPending || ownerTransferLoading} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Cerrar cambio de dueño"><X size={18} /></button>
            </div>

            {ownerTransferLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 font-body text-sm text-muted-foreground">
                <Loader2 size={17} className="animate-spin text-brand" /> Cargando cuentas existentes…
              </div>
            ) : ownerTransferCandidates.length === 0 ? (
              <div className="mt-5 rounded-xl border border-warning/25 bg-warning/8 p-4 font-body text-sm leading-6 text-muted-foreground">
                No hay cuentas activas del equipo disponibles para transferir. Primero agrega o vincula una cuenta desde la administración del personal del negocio.
              </div>
            ) : (
              <form onSubmit={submitOwnerTransfer} className="mt-5 space-y-4">
                <label className="block font-heading text-xs font-bold text-foreground">
                  Nuevo dueño
                  <select required value={ownerTransferUserId} onChange={(event) => setOwnerTransferUserId(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                    <option value="">Selecciona una cuenta existente</option>
                    {ownerTransferCandidates.map((candidate) => (
                      <option key={candidate.userId} value={candidate.userId}>
                        {candidate.fullName}{candidate.login ? ` · ${candidate.login}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {ownerTransferUserId ? (
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="font-heading text-xs font-bold text-foreground">Asignaciones que ya tiene</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(ownerTransferCandidates.find((candidate) => candidate.userId === ownerTransferUserId)?.assignments ?? []).map((assignment) => (
                        <span key={assignment} className="rounded-full border border-border px-2.5 py-1 font-body text-[10px] text-muted-foreground">{assignment}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <label className="block font-heading text-xs font-bold text-foreground">
                  Motivo del cambio
                  <textarea required minLength={4} maxLength={240} value={ownerTransferReason} onChange={(event) => setOwnerTransferReason(event.target.value)} rows={3} placeholder="Ej. Cambio de responsable acordado con el negocio" className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/8 p-3 font-body text-xs leading-5 text-foreground">
                  <input type="checkbox" checked={ownerTransferConfirmed} onChange={(event) => setOwnerTransferConfirmed(event.target.checked)} className="mt-1 size-4 accent-brand" />
                  <span>Confirmo que el nuevo dueño está autorizado. Sus permisos de módulos copiarán los del dueño actual. Esta acción se registra en auditoría.</span>
                </label>
                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setOwnerTransferBusiness(null)} disabled={isPending} className="min-h-11 rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar</button>
                  <button type="submit" disabled={isPending || !ownerTransferUserId || !ownerTransferConfirmed || ownerTransferReason.trim().length < 4} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-warning px-4 font-heading text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
                    {isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                    Transferir dueño
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
