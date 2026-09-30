import { Building2, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LicenseBlockedActions } from "@/components/license-blocked-actions";
import {
  getBusinessBrandColors,
  getBusinessLogoUrl,
  getReadableBrandForeground,
} from "@/lib/business-branding";
import { canSelectBusinessContext } from "@/lib/multibusiness/business-context-selection";
import { getBusinessLicenseGateBySlug } from "@/lib/business-license-server";
import { createClient } from "@/lib/supabase/server";
import type { BusinessContextRow } from "@/types/multibusiness";

export const dynamic = "force-dynamic";

export default async function BusinessLicenseBlockedPage() {
  const supabase = await createClient();
  const [contextResult, licenseResult, brandingResult] = await Promise.all([
    supabase.rpc("get_my_multibusiness_context"),
    supabase.rpc("get_my_business_license_availability"),
    supabase.rpc("get_my_business_branding"),
  ]);

  const canVerify = !contextResult.error && !licenseResult.error;
  const contexts = (contextResult.data ?? []) as BusinessContextRow[];
  const licenseAvailability = new Map(
    ((licenseResult.data ?? []) as Array<{
      business_id: string;
      is_available: boolean;
    }>).map((row) => [row.business_id, row.is_available]),
  );
  const scopedContexts = contexts.map((context) => ({
    ...context,
    business_license_available:
      canVerify && licenseAvailability.get(context.business_id) === true,
  }));
  const hasPlatformAccess = scopedContexts.some((context) =>
    context.capability_codes.some((code) => code.startsWith("platform.")),
  );
  if (hasPlatformAccess) redirect("/settings/licencias");

  const hasGlobalWaiterAccess = scopedContexts.some((context) =>
    context.capability_codes.includes("organization.manage_global_waiters"),
  );
  const hasAvailableBusiness = scopedContexts.some(
    (context) =>
      context.business_lifecycle_status === "active" &&
      context.business_license_available === true &&
      canSelectBusinessContext(context),
  );
  const hasDraftSetup = scopedContexts.some(
    (context) =>
      context.business_lifecycle_status === "draft" &&
      context.capability_codes.some((code) =>
        [
          "business.manage_catalog",
          "business.manage_inventory",
          "business.manage_staff",
        ].includes(code),
      ),
  );
  if (hasGlobalWaiterAccess) redirect("/dashboard");
  if (hasAvailableBusiness || hasDraftSetup) redirect("/dashboard");

  const blockedBusiness = scopedContexts.find(
    (context) => canSelectBusinessContext(context),
  );
  const gate = blockedBusiness
    ? await getBusinessLicenseGateBySlug(blockedBusiness.business_slug)
    : null;
  const brandingByBusinessId = new Map(
    ((brandingResult.data ?? []) as Array<{
      business_id: string;
      brand_logo_path: string | null;
      brand_primary_color: string | null;
      brand_accent_color: string | null;
    }>).map((row) => [row.business_id, row]),
  );
  const brand = blockedBusiness
    ? brandingByBusinessId.get(blockedBusiness.business_id)
    : null;
  const colors = blockedBusiness
    ? getBusinessBrandColors(
        blockedBusiness.business_slug,
        brand?.brand_primary_color,
        brand?.brand_accent_color,
      )
    : null;
  const logoUrl = brand ? getBusinessLogoUrl(brand.brand_logo_path) : null;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,var(--license-accent),transparent_68%)] opacity-15" style={{ "--license-accent": colors?.accent ?? "#35C77B" } as React.CSSProperties} />
      <section className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface shadow-float">
        <div className="border-b border-border px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
              style={{
                backgroundColor: colors?.primary ?? "var(--surface-raised)",
                color: colors ? getReadableBrandForeground(colors.primary) : "var(--foreground)",
              }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-full object-contain p-1.5" />
              ) : blockedBusiness ? (
                <Building2 size={22} aria-hidden />
              ) : (
                <ShieldCheck size={22} aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {blockedBusiness?.organization_name ?? "Rincón 404"}
              </p>
              <h1 className="truncate font-heading text-lg font-bold text-foreground sm:text-xl">
                {blockedBusiness?.business_display_name ?? "Revisión de acceso"}
              </h1>
            </div>
            <span className="hidden size-10 items-center justify-center rounded-xl bg-warning/10 text-warning sm:flex">
              <LockKeyhole size={18} aria-hidden />
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {canVerify && blockedBusiness && gate?.verified ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning/10 px-3 py-1.5 font-heading text-xs font-bold text-warning">
                <CircleAlert size={14} aria-hidden /> Acceso operativo pausado
              </span>
              <h2 className="mt-5 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {gate.status === "expired"
                  ? "Hay que regularizar los pagos pendientes"
                  : gate.status === "suspended"
                    ? "El acceso a este negocio está suspendido"
                    : gate.status === "unassigned"
                      ? "Este negocio aún no tiene una licencia asignada"
                      : gate.status === "emergency"
                        ? "La operación está en pausa técnica"
                        : gate.status === "paused"
                          ? "Este negocio está pausado"
                          : "No podemos confirmar el acceso ahora"}
              </h2>
              <p className="mt-3 max-w-prose font-body text-sm leading-6 text-muted-foreground sm:text-base">
                {gate.status === "expired"
                  ? `Para continuar usando ${blockedBusiness.business_display_name}, el responsable del local debe revisar y regularizar los pagos pendientes con Rincón 404. Al renovar el acceso, las funciones operativas se habilitarán de nuevo.`
                  : gate.status === "suspended"
                    ? "Contacta al coordinador de Rincón 404 para revisar el acceso de este negocio."
                    : gate.status === "unassigned"
                      ? "El coordinador de Rincón 404 debe asignar una licencia antes de habilitar la operación."
                      : gate.status === "emergency"
                        ? "Rincón 404 está revisando una condición técnica. Intenta comprobar el acceso más tarde."
                        : gate.status === "paused"
                          ? "El coordinador de Rincón 404 debe reactivar este negocio para continuar operando."
                          : "La disponibilidad del negocio no pudo confirmarse. Intenta comprobar el acceso en un momento."}
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning/10 px-3 py-1.5 font-heading text-xs font-bold text-warning">
                <CircleAlert size={14} aria-hidden /> No se pudo verificar
              </span>
              <h2 className="mt-5 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                No podemos confirmar el acceso ahora
              </h2>
              <p className="mt-3 font-body text-sm leading-6 text-muted-foreground sm:text-base">
                La verificación del negocio no respondió. Intenta comprobar el acceso en un momento; no se modificó ni eliminó información.
              </p>
            </>
          )}

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-background p-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <p className="font-body text-xs leading-5 text-muted-foreground sm:text-sm">
              Los datos históricos del negocio se conservan. Esta pantalla sólo bloquea la operación mientras se valida o renueva el acceso.
            </p>
          </div>

          <LicenseBlockedActions />
          <p className="mt-4 text-center font-body text-xs leading-5 text-muted-foreground">
            Si necesitas ayuda, contacta al responsable de Rincón 404.
          </p>
        </div>
      </section>
    </main>
  );
}
