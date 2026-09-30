"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Store,
  UsersRound,
} from "lucide-react";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";

const SETUP_MODULES = [
  {
    capability: "business.manage_catalog",
    href: "/menu",
    title: "Menú",
    description: "Configura categorías, productos, precios y opciones de este local.",
    icon: ClipboardList,
  },
  {
    capability: "business.manage_inventory",
    href: "/settings/inventario",
    title: "Inventario",
    description: "Crea sus propios insumos, recetas, compras y existencias.",
    icon: Boxes,
  },
  {
    capability: "business.manage_staff",
    href: "/settings",
    title: "Personal",
    description: "Administra las cuentas y permisos del equipo del negocio.",
    icon: UsersRound,
  },
] as const;

export function BusinessSetupHome({ capabilities }: { capabilities: string[] }) {
  const ensureLoaded = useBusinessContextStore((state) => state.ensureLoaded);
  const loading = useBusinessContextStore((state) => state.loading);
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId,
  );

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const business = businesses.find(
    (candidate) => candidate.business_id === selectedBusinessId,
  );
  const modules = SETUP_MODULES.filter((module) =>
    capabilities.includes(module.capability),
  );
  const isPaused = business?.business_lifecycle_status === "paused";

  return (
    <div className="mideli-page-scroll pos-scroll h-full min-w-0 touch-pan-y overflow-y-auto overscroll-y-contain bg-background p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-6">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-light text-brand">
              <Store aria-hidden size={23} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
                Configuración del negocio
              </p>
              <h1 className="mt-1 break-words font-heading text-2xl font-bold text-foreground sm:text-3xl">
                {loading
                  ? "Cargando negocio…"
                  : business?.business_display_name ?? "Prepara tu negocio"}
              </h1>
              <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
                {isPaused
                  ? "Este negocio está pausado. Puedes revisar y preparar su configuración sin afectar los demás locales."
                  : "Aquí puedes terminar la configuración de este local. Su menú e inventario se mantienen separados de los demás negocios."}
              </p>
              {business ? (
                <span className="mt-3 inline-flex rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-heading text-xs font-bold text-warning">
                  {isPaused ? "Pausado" : "Borrador"}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-warning/30 bg-warning/8 p-4 sm:p-5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Aún no recibe pedidos ni cobra
          </h2>
          <p className="mt-1 font-body text-sm leading-6 text-muted-foreground">
            Mientras esté en preparación, configura primero sus productos, insumos,
            recetas y personal. No se copian existencias ni datos de otro negocio.
            La operación se habilita cuando la cuenta de plataforma active el local.
          </p>
        </section>

        <section aria-labelledby="setup-modules-title">
          <div className="mb-3">
            <h2 id="setup-modules-title" className="font-heading text-lg font-bold">
              Herramientas disponibles
            </h2>
            <p className="mt-1 font-body text-xs text-muted-foreground">
              Los cambios de estas secciones pertenecen únicamente a este negocio.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group flex min-h-28 touch-manipulation items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand/45 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-brand">
                    <Icon aria-hidden size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-sm font-bold text-foreground">
                      {module.title}
                    </span>
                    <span className="mt-1 block font-body text-xs leading-5 text-muted-foreground">
                      {module.description}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    size={17}
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </Link>
              );
            })}
          </div>
        </section>

        {modules.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 font-body text-sm text-muted-foreground">
            Esta cuenta todavía no tiene módulos de configuración asignados. Pide
            al administrador de plataforma que revise sus permisos.
          </p>
        ) : null}
      </div>
    </div>
  );
}
