"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

const TOUR_VERSION = 1;

type TourStep = {
  title: string;
  body: string;
  href?: string;
  selector?: string;
};

const ROLE_STEPS: Record<Profile["role"], TourStep[]> = {
  owner: adminSteps(),
  admin: adminSteps(),
  waiter: [
    { title: "Tu punto de venta", body: "Aquí armas pedidos, eliges el tipo de servicio y agregas productos.", href: "/dashboard/mesero", selector: "[data-tour='pos-new-order']" },
    { title: "Selecciona la mesa", body: "Primero arma la cuenta. Al finalizar podrás elegir la mesa directamente en el plano.", href: "/dashboard/mesero", selector: "[data-tour='pos-table-selection']" },
    { title: "Envíalo a cocina", body: "Revisa la cuenta y envíala. Cocina recibirá el pedido en tiempo real.", href: "/dashboard/mesero", selector: "[data-tour='pos-send-order']" },
    { title: "Pendientes e historial", body: "Consulta cuentas abiertas, cobra cuando corresponda y revisa tus ventas anteriores.", href: "/dashboard/mesero", selector: "[data-tour='pos-status']" },
  ],
  kitchen: [
    { title: "Pedidos pendientes", body: "Los pedidos nuevos aparecen aquí. El color y el cronómetro indican su prioridad.", href: "/dashboard/cocina", selector: "[data-tour='kds-pending']" },
    { title: "Empieza a preparar", body: "Acepta un pedido para que todo el equipo sepa que ya está en preparación.", href: "/dashboard/cocina", selector: "[data-tour='kds-order-grid']" },
    { title: "Marca como listo", body: "Cuando termines, marca el pedido como listo. El mesero recibirá el aviso.", href: "/dashboard/cocina", selector: "[data-tour='kds-order-grid']" },
  ],
  supervisor: [
    { title: "Dos vistas operativas", body: "Tu rol puede atender mesas y también apoyar en cocina, sin acceso a configuración administrativa.", href: "/dashboard/mesero", selector: "nav[aria-label='Vistas']" },
    { title: "Punto de venta", body: "Arma pedidos, elige la mesa, envía a cocina y cobra cuentas pendientes.", href: "/dashboard/mesero", selector: "[data-tour='pos-new-order']" },
    { title: "Pantalla de cocina", body: "Cambia a Cocina para aceptar, preparar y terminar pedidos.", href: "/dashboard/cocina", selector: "[data-tour='kds-order-grid']" },
  ],
};

function adminSteps(): TourStep[] {
  return [
    { title: "Bienvenido a Mideli", body: "Esta guía te mostrará dónde controlar el negocio. Puedes repetirla cuando quieras desde el botón de ayuda." },
    { title: "Personal", body: "Crea usuarios, define contraseñas y asigna permisos por rol.", selector: "a[href='/settings']" },
    { title: "Menú", body: "Edita productos, precios, variaciones, descripciones y disponibilidad.", selector: "a[href='/menu']" },
    { title: "Mesas", body: "Dibuja las zonas del local, ordena mesas y personaliza referencias visuales.", selector: "a[href='/settings/mesas']" },
    { title: "Inventario", body: "Crea insumos, registra compras, cuenta existencias y configura recetas.", selector: "a[href='/settings/inventario']" },
    { title: "Analíticas", body: "Revisa ventas, métodos de pago, productos y desempeño por periodo.", selector: "a[href='/dashboard/analiticas']" },
  ];
}

function findVisibleTarget(selector?: string) {
  if (!selector) return null;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

export function RoleOnboardingTour({ role }: { role: Profile["role"] }) {
  const pathname = usePathname();
  const router = useRouter();
  const steps = useMemo(() => ROLE_STEPS[role], [role]);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const persist = useCallback(async (
    status: "in_progress" | "skipped" | "completed",
    currentStep: number
  ) => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("user_onboarding_progress").upsert({
      user_id: userId,
      role,
      version: TOUR_VERSION,
      status,
      current_step: currentStep,
      completed_steps: Array.from({ length: Math.max(0, currentStep) }, (_, index) => index),
      started_at: new Date().toISOString(),
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,role,version" });
  }, [role, userId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || cancelled) return;
      setUserId(auth.user.id);
      const { data } = await supabase
        .from("user_onboarding_progress")
        .select("status,current_step")
        .eq("user_id", auth.user.id)
        .eq("role", role)
        .eq("version", TOUR_VERSION)
        .maybeSingle();
      if (cancelled) return;
      if (!data || data.status === "not_started" || data.status === "in_progress") {
        setStepIndex(Math.min(Number(data?.current_step ?? 0), Math.max(steps.length - 1, 0)));
        setOpen(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [role, steps.length]);

  useEffect(() => {
    const restart = () => {
      setStepIndex(0);
      setOpen(true);
      void persist("in_progress", 0);
    };
    window.addEventListener("mideli:start-tour", restart);
    return () => window.removeEventListener("mideli:start-tour", restart);
  }, [persist]);

  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (!open || !currentStep) return;
    if (currentStep.href && pathname !== currentStep.href) {
      router.push(currentStep.href);
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const updateRect = () => {
      const target = findVisibleTarget(currentStep.selector);
      setTargetRect(target?.getBoundingClientRect() ?? null);
    };
    timeout = setTimeout(updateRect, 180);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, open, pathname, router]);

  if (!open || !currentStep) return null;

  function closeAsSkipped() {
    setOpen(false);
    void persist("skipped", stepIndex);
  }

  function next() {
    if (stepIndex >= steps.length - 1) {
      setOpen(false);
      void persist("completed", steps.length);
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    void persist("in_progress", nextIndex);
  }

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const tooltipStyle = targetRect
    ? {
        left: Math.max(12, Math.min(targetRect.left, viewportWidth - 356)),
        top: targetRect.bottom + 12 < viewportHeight - 210 ? targetRect.bottom + 12 : Math.max(12, targetRect.top - 202),
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none" aria-live="polite">
      {targetRect ? (
        <div className="fixed rounded-2xl ring-4 ring-brand ring-offset-4 ring-offset-background/80 transition-[top,left,width,height] duration-200" style={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height, boxShadow: "0 0 0 9999px rgb(5 4 8 / 0.72)" }} />
      ) : <div className="absolute inset-0 bg-background/76 backdrop-blur-[2px]" />}

      <section role="dialog" aria-modal="true" aria-labelledby="tour-title" className={`pointer-events-auto fixed w-[calc(100%_-_1.5rem)] max-w-[344px] rounded-3xl border border-border bg-surface p-5 shadow-float ${targetRect ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`} style={tooltipStyle}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-light text-brand"><Compass size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Guía {stepIndex + 1} de {steps.length}</p>
            <h2 id="tour-title" className="mt-1 font-heading text-base font-bold text-foreground">{currentStep.title}</h2>
          </div>
          <button type="button" onClick={closeAsSkipped} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground" aria-label="Cerrar guía"><X size={17} /></button>
        </div>
        <p className="mt-4 font-body text-sm leading-6 text-muted-foreground">{currentStep.body}</p>
        <div className="mt-5 flex items-center gap-2">
          {stepIndex > 0 ? <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground"><ArrowLeft size={15} /> Atrás</button> : <button type="button" onClick={closeAsSkipped} className="h-11 rounded-xl px-3 font-heading text-xs font-bold text-muted-foreground">Omitir</button>}
          <button type="button" onClick={next} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white shadow-lg shadow-brand/20">{stepIndex === steps.length - 1 ? <><Check size={15} /> Terminar</> : <>Siguiente <ArrowRight size={15} /></>}</button>
        </div>
      </section>
    </div>
  );
}
