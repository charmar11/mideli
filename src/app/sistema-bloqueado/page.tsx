import { LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LicenseBlockedActions } from "@/components/license-blocked-actions";
import { getAppLicense } from "@/lib/license-server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Sin fecha disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

export default async function LicenseBlockedPage() {
  const license = await getAppLicense();
  if (license.isActive) redirect("/dashboard");

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-12">
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[38%] bg-ink lg:block" />
      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-[0.82fr_1.18fr]">
        <div className="flex min-h-56 flex-col justify-between bg-ink p-7 sm:p-9 lg:min-h-[32rem]">
          <span className="font-brand text-4xl text-brand">Mideli</span>
          <div>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/14 text-brand">
              <LockKeyhole size={27} />
            </span>
            <p className="mt-5 max-w-xs font-heading text-xl font-bold leading-snug text-white">
              La operación está protegida hasta renovar el acceso.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
          <h1 className="max-w-xl text-balance font-heading text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
            La licencia de este sistema necesita renovación
          </h1>
          <p className="mt-4 max-w-xl text-pretty font-body text-base leading-7 text-muted-foreground">
            Los pedidos y la información del local siguen protegidos. Cuando el proveedor reactive el servicio, el equipo podrá continuar donde se quedó.
          </p>

          <div className="mt-7 flex items-center gap-3 rounded-xl bg-background px-4 py-3.5">
            <ShieldCheck size={19} className="shrink-0 text-success" />
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Última vigencia registrada</p>
              <p className="mt-0.5 font-body text-sm text-muted-foreground">{formatDate(license.validUntil)}</p>
            </div>
          </div>

          <LicenseBlockedActions />
          <p className="mt-5 font-body text-xs leading-5 text-muted-foreground">
            Si el pago ya fue confirmado, usa “Comprobar acceso”.
          </p>
        </div>
      </section>
    </main>
  );
}
