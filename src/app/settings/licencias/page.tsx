import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { BusinessLicensesManager, type PlatformBusinessLicense } from "@/components/admin/business-licenses-manager";
import { RinconBrand } from "@/components/auth/rincon-brand";
import { requirePlatformLicenseManager } from "@/lib/server/platform-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getTodayInHermosillo() {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Hermosillo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const parts = new Map(values.map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

export default async function BusinessLicensesPage() {
  await requirePlatformLicenseManager();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_platform_business_licenses");

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href="/settings/negocios" aria-label="Volver a negocios" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-surface-raised hover:text-foreground">
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <RinconBrand compact />
          <span aria-hidden className="h-7 w-px bg-border" />
          <span className="min-w-0">
            <span className="block font-body text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Control de plataforma</span>
            <span className="block font-heading text-sm font-bold text-foreground">Licencias</span>
          </span>
          <span className="ml-auto hidden items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-2 font-heading text-[11px] font-bold text-success sm:inline-flex">
            <CalendarDays size={14} aria-hidden /> Separadas por negocio
          </span>
        </div>
      </header>
      <BusinessLicensesManager
        initialLicenses={(data ?? []) as PlatformBusinessLicense[]}
        initialError={error ? "No se pudo cargar la información de licencias" : null}
        minimumDate={getTodayInHermosillo()}
      />
    </div>
  );
}
