"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import type { InventoryView } from "@/components/admin/inventory-manager";

const TOUR_STORAGE_VERSION = "v1";

type InventoryTourStep = {
  title: string;
  body: string;
  view: InventoryView;
  selector?: string;
};

const STEPS: InventoryTourStep[] = [
  {
    title: "Tu inventario en un solo lugar",
    body: "Aquí controlas existencias, costos, compras, recetas, conteos y cualquier ajuste. La guía no modificará tus datos.",
    view: "overview",
  },
  {
    title: "Resumen",
    body: "Empieza aquí para ver insumos críticos, valor aproximado del almacén y acciones que necesitan atención.",
    view: "overview",
    selector: "[data-tour='inventory-nav-overview']",
  },
  {
    title: "Insumos",
    body: "Registra cada ingrediente como lo usas y como lo compras. Mideli convierte paquetes, calcula el costo unitario y conserva el historial al archivar.",
    view: "items",
    selector: "[data-tour='inventory-nav-items']",
  },
  {
    title: "Recetas",
    body: "Define cuánto consume cada producto base y cada variación. Al vender, esas cantidades se descuentan automáticamente del inventario.",
    view: "recipes",
    selector: "[data-tour='inventory-nav-recipes']",
  },
  {
    title: "Comprar",
    body: "Prepara pedidos a proveedores y registra lo que realmente recibes. El costo promedio se actualiza con la compra confirmada.",
    view: "purchase",
    selector: "[data-tour='inventory-nav-purchase']",
  },
  {
    title: "Contar",
    body: "Escribe la cantidad que encuentras físicamente. Mideli la compara con el sistema y solicita un motivo cuando existe una diferencia.",
    view: "count",
    selector: "[data-tour='inventory-nav-count']",
  },
  {
    title: "Movimientos",
    body: "Consulta la bitácora de compras, ventas, mermas, uso interno y correcciones. Aquí puedes saber por qué cambió una existencia.",
    view: "movements",
    selector: "[data-tour='inventory-nav-movements']",
  },
];

type TargetRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function findVisibleTarget(selector?: string) {
  if (!selector) return null;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

export function InventoryOnboardingTour({
  userId,
  view,
  restartSignal,
  onViewChange,
}: {
  userId: string | null;
  view: InventoryView;
  restartSignal: number;
  onViewChange: (view: InventoryView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const storageKey = userId
    ? `mideli.inventory-tour.${TOUR_STORAGE_VERSION}:${userId}`
    : null;
  const startTour = useCallback(() => {
    setTargetRect(null);
    setStepIndex(0);
    onViewChange("overview");
    setOpen(true);
  }, [onViewChange]);

  useEffect(() => {
    if (!storageKey) return;
    let shouldStart = false;
    try {
      shouldStart = !localStorage.getItem(storageKey);
    } catch {
      shouldStart = true;
    }
    if (!shouldStart) return;

    const timeout = window.setTimeout(startTour, 0);
    return () => window.clearTimeout(timeout);
  }, [startTour, storageKey]);

  useEffect(() => {
    if (restartSignal < 1) return;
    const timeout = window.setTimeout(startTour, 0);
    return () => window.clearTimeout(timeout);
  }, [restartSignal, startTour]);

  const currentStep = STEPS[stepIndex];

  useEffect(() => {
    if (!open || !currentStep.selector) return;
    const updateRect = () => {
      const target = findVisibleTarget(currentStep.selector);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    };
    const timeout = window.setTimeout(updateRect, 160);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep.selector, open, view]);

  if (!open || !currentStep) return null;

  function persist(value: "completed" | "skipped") {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // El tutorial sigue funcionando aunque el navegador bloquee storage.
    }
  }

  function showStep(nextIndex: number) {
    const nextStep = STEPS[nextIndex];
    setTargetRect(null);
    setStepIndex(nextIndex);
    onViewChange(nextStep.view);
  }

  function skip() {
    persist("skipped");
    setOpen(false);
  }

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      persist("completed");
      setOpen(false);
      onViewChange("overview");
      return;
    }
    showStep(stepIndex + 1);
  }

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const tooltipStyle = targetRect
    ? {
        left: Math.max(12, Math.min(targetRect.left, viewportWidth - 356)),
        top: targetRect.bottom + 12 < viewportHeight - 230
          ? targetRect.bottom + 12
          : Math.max(12, targetRect.top - 222),
      }
    : undefined;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      {targetRect ? (
        <div className="fixed rounded-xl ring-4 ring-brand ring-offset-4 ring-offset-background/80 transition-[top,left,width,height] duration-200 motion-reduce:transition-none" style={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height, boxShadow: "0 0 0 9999px rgb(5 4 8 / 0.76)" }} />
      ) : (
        <div className="absolute inset-0 bg-background/80" />
      )}

      <section role="dialog" aria-modal="true" aria-labelledby="inventory-tour-title" className={`pointer-events-auto fixed w-[calc(100%_-_1.5rem)] max-w-[344px] rounded-2xl border border-border bg-surface p-5 shadow-float ${targetRect ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`} style={tooltipStyle}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"><Compass size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Guía {stepIndex + 1} de {STEPS.length}</p>
            <h2 id="inventory-tour-title" className="mt-1 font-heading text-base font-bold text-foreground">{currentStep.title}</h2>
          </div>
          <button type="button" onClick={skip} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground" aria-label="Cerrar guía"><X size={17} /></button>
        </div>
        <p className="mt-4 font-body text-sm leading-6 text-muted-foreground">{currentStep.body}</p>
        <div className="mt-5 flex items-center gap-2">
          {stepIndex > 0 ? (
            <button type="button" onClick={() => showStep(stepIndex - 1)} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Atrás</button>
          ) : (
            <button type="button" onClick={skip} className="h-11 rounded-xl px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground">Omitir</button>
          )}
          <button type="button" onClick={next} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover">
            {stepIndex === STEPS.length - 1 ? <><Check size={15} /> Terminar</> : <>Siguiente <ArrowRight size={15} /></>}
          </button>
        </div>
      </section>
    </div>
  );
}
