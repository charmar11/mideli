import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LicenseControlPanel } from "@/components/license-control-panel";
import {
  getLicenseControlAccess,
  getLicenseControlEvents,
} from "@/lib/license-control-server";
import { getAppLicense } from "@/lib/license-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getTodayInHermosillo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Hermosillo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function LicenseControlPage() {
  const access = await getLicenseControlAccess();
  const [license, events] = access.authenticated
    ? await Promise.all([getAppLicense(), getLicenseControlEvents()])
    : [null, []];

  return (
    <main className="min-h-dvh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Volver al inicio" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="font-brand text-2xl text-brand">Mideli</p>
              <h1 className="font-heading text-lg font-bold text-foreground sm:text-xl">Control de licencia</h1>
            </div>
          </div>
          <span className="hidden items-center gap-2 font-body text-xs text-muted-foreground sm:flex">
            <ShieldCheck size={16} className="text-success" /> Acceso exclusivo del vendedor
          </span>
        </header>

        <LicenseControlPanel
          access={access}
          license={license}
          events={events}
          minimumDate={getTodayInHermosillo()}
        />
      </div>
    </main>
  );
}
