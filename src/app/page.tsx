import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { AccessBrandPanel } from "@/components/auth/access-brand-panel";

export default function Home() {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.08fr_0.92fr]">
      <AccessBrandPanel />

      <main className="flex items-center px-7 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">
            <LockKeyhole size={22} />
          </span>
          <h2 className="mt-6 text-balance font-heading text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
            Acceso del equipo Mideli
          </h2>
          <p className="mt-4 text-pretty font-body text-base leading-7 text-muted-foreground">
            Abre tu espacio de trabajo según tu función. Cada persona verá únicamente las herramientas que necesita.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white shadow-md shadow-brand/25 transition-[background-color,transform] hover:bg-brand-hover active:scale-[0.98]"
          >
            Entrar al sistema <ArrowRight size={17} />
          </Link>

          <div className="mt-8 flex items-start gap-3 border-t border-border pt-6">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="font-heading text-sm font-bold text-foreground">Acceso protegido</p>
              <p className="mt-1 font-body text-sm leading-6 text-muted-foreground">
                Mesero, cocina y administración trabajan con permisos separados.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
