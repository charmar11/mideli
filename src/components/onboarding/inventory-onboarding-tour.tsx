"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, Lightbulb, X } from "lucide-react";
import type { InventoryView } from "@/components/admin/inventory-manager";

const TOUR_STORAGE_VERSION = "v2";

type InventoryTourStep = {
  chapter: string;
  title: string;
  body: string;
  bullets?: string[];
  tip?: string;
  view: InventoryView;
  selector?: string;
};

const STEPS: InventoryTourStep[] = [
  {
    chapter: "Inicio",
    title: "Controla el inventario sin complicarte",
    body: "Esta guía recorre cada pestaña y explica qué hacer, cuándo hacerlo y cómo afecta las existencias. No modificará ningún dato.",
    bullets: [
      "Puedes salir y reiniciarla con el botón de interrogación.",
      "Los ejemplos son generales y no alteran información del local.",
    ],
    view: "overview",
  },
  {
    chapter: "Resumen",
    title: "Tu punto de partida diario",
    body: "Resumen ordena lo urgente para que no tengas que revisar todo el almacén.",
    bullets: [
      "Críticos: llegaron al mínimo o se agotaron.",
      "Por caducar: lotes que conviene utilizar primero.",
      "Por recibir: compras que aún no entran al almacén.",
    ],
    view: "overview",
    selector: "[data-tour='inventory-nav-overview']",
  },
  {
    chapter: "Resumen",
    title: "Prioridades, dinero y rutina",
    body: "Aquí ves el valor aproximado del inventario, la merma del mes y acciones ordenadas por impacto.",
    bullets: [
      "Atiende primero agotados y caducidades.",
      "Después recibe compras pendientes.",
      "Termina con un conteo rápido de productos críticos.",
    ],
    tip: "Revísalo al abrir el local y antes de preparar la compra del día.",
    view: "overview",
    selector: "[data-tour='inventory-view-overview']",
  },
  {
    chapter: "Insumos",
    title: "Lo que compras y consumes",
    body: "Un insumo es cualquier ingrediente, bebida, empaque o material cuya existencia quieras controlar.",
    bullets: [
      "Usa nombres claros y una unidad de uso consistente.",
      "Evita duplicar el mismo insumo con unidades diferentes.",
      "Busca y edita los registros desde esta pestaña.",
    ],
    view: "items",
    selector: "[data-tour='inventory-nav-items']",
  },
  {
    chapter: "Insumos",
    title: "Crear un insumo",
    body: "Nuevo insumo abre la ficha completa. Captura primero cómo se utiliza y después cómo se compra.",
    bullets: [
      "Existencia actual: lo que realmente tienes al registrarlo.",
      "Mínimo: punto donde debe aparecer una alerta.",
      "Existencia ideal: nivel al que quieres volver al comprar.",
    ],
    view: "items",
    selector: "[data-tour='inventory-new-item-header']",
  },
  {
    chapter: "Insumos",
    title: "Unidad de uso y unidad de compra",
    body: "La unidad de uso es lo que descuenta una receta. La unidad de compra es el paquete que entrega el proveedor.",
    bullets: [
      "Ejemplo: utilizas piezas, pero compras una caja.",
      "El factor de conversión indica cuántas unidades contiene cada compra.",
      "El costo total del paquete permite calcular el costo real por unidad.",
    ],
    tip: "Si compras 12 piezas por paquete, usa factor 12. No registres el precio del paquete como costo de una sola pieza.",
    view: "items",
    selector: "[data-tour='inventory-view-items']",
  },
  {
    chapter: "Insumos",
    title: "Proveedor, ubicación y archivo",
    body: "Completa proveedor, teléfono, ubicación y frecuencia de conteo para que otra persona pueda operar sin adivinar.",
    bullets: [
      "Archivar oculta el insumo sin destruir su historial.",
      "Reactívalo si vuelves a utilizarlo.",
      "Elimina solo registros nuevos que nunca tuvieron movimientos.",
    ],
    view: "items",
    selector: "[data-tour='inventory-view-items']",
  },
  {
    chapter: "Recetas",
    title: "Conecta cada venta con el almacén",
    body: "Una receta define cuánto se descuenta al vender un producto del menú.",
    bullets: [
      "Configurada: todas sus secciones tienen ingredientes.",
      "Parcial: todavía falta completar alguna variación.",
      "Sin receta: la venta no descontará insumos.",
    ],
    view: "recipes",
    selector: "[data-tour='inventory-nav-recipes']",
  },
  {
    chapter: "Recetas",
    title: "Producto base y variaciones",
    body: "Configura primero lo que siempre consume el producto. Después abre cada extra o variación y agrega únicamente lo adicional.",
    bullets: [
      "La base se descuenta en toda venta del producto.",
      "Una variación se descuenta solo cuando el cliente la selecciona.",
      "La cantidad siempre se expresa en la unidad de uso del insumo.",
    ],
    tip: "Una receta puede guardarse vacía para indicar conscientemente que ese producto no descuenta inventario.",
    view: "recipes",
    selector: "[data-tour='inventory-view-recipes']",
  },
  {
    chapter: "Recetas",
    title: "Comprueba el costo estimado",
    body: "El editor suma el costo de los ingredientes según su consumo. Úsalo para detectar recetas incompletas o productos con margen bajo.",
    bullets: [
      "Revisa cantidades cuando cambie la porción.",
      "Actualiza el costo desde una recepción, no desde la receta.",
      "Las ventas futuras usarán la receta guardada.",
    ],
    view: "recipes",
    selector: "[data-tour='inventory-view-recipes']",
  },
  {
    chapter: "Comprar",
    title: "Prepara cantidades sugeridas",
    body: "Comprar compara existencia actual, mínimo, nivel ideal y presentación de compra.",
    bullets: [
      "La sugerencia busca recuperar la existencia ideal.",
      "Respeta la cantidad mínima definida para el proveedor.",
      "Puedes ajustar el número de paquetes antes de guardar.",
    ],
    view: "purchase",
    selector: "[data-tour='inventory-nav-purchase']",
  },
  {
    chapter: "Comprar",
    title: "Pedido a proveedor o entrada directa",
    body: "Guarda un pedido cuando la mercancía llegará después. Usa entrada directa si ya tienes la compra frente a ti.",
    bullets: [
      "Guardar un pedido no aumenta existencias.",
      "Recibir mercancía sí aumenta existencias.",
      "Una entrega parcial conserva lo que falta por recibir.",
    ],
    view: "purchase",
    selector: "[data-tour='inventory-view-purchase']",
  },
  {
    chapter: "Comprar",
    title: "Recibe lo que realmente llegó",
    body: "Al recibir, captura paquetes reales, costo total y caducidad. Mideli convierte cantidades y recalcula el costo promedio.",
    bullets: [
      "No confirmes cantidades que el proveedor no entregó.",
      "Registra caducidad para utilizar primero lo más antiguo.",
      "El historial conserva proveedor, fecha y costo.",
    ],
    tip: "Cuenta y revisa la mercancía antes de confirmar la entrada.",
    view: "purchase",
    selector: "[data-tour='inventory-view-purchase']",
  },
  {
    chapter: "Contar",
    title: "Comprueba la existencia física",
    body: "Contar compara lo que existe en el sistema con lo que encuentras realmente en el local.",
    bullets: [
      "Rápido incluye agotados y existencias bajas.",
      "Completo incluye todos los insumos activos.",
      "Solo puede existir un conteo abierto a la vez.",
    ],
    view: "count",
    selector: "[data-tour='inventory-nav-count']",
  },
  {
    chapter: "Contar",
    title: "Captura primero, compara después",
    body: "Escribe la cantidad que ves. La cifra del sistema aparece después para que no influya en tu conteo.",
    bullets: [
      "Avanza insumo por insumo desde el celular.",
      "El borrador se conserva en este dispositivo.",
      "No finalices hasta revisar todas las ubicaciones.",
    ],
    view: "count",
    selector: "[data-tour='inventory-view-count']",
  },
  {
    chapter: "Contar",
    title: "Explica y concilia diferencias",
    body: "Cuando no coincide, selecciona un motivo y agrega una nota útil. El ajuste queda registrado, nunca oculto.",
    bullets: [
      "Puede indicar merma, recepción incorrecta o uso interno.",
      "Las diferencias importantes quedan para revisión administrativa.",
      "Finalizar actualiza la existencia con el conteo autorizado.",
    ],
    tip: "Una diferencia repetida suele señalar una receta incompleta o un procedimiento que falta registrar.",
    view: "count",
    selector: "[data-tour='inventory-view-count']",
  },
  {
    chapter: "Movimientos",
    title: "Registra salidas que no son ventas",
    body: "Merma, caducidad, daño y consumo interno deben registrarse en cuanto ocurren.",
    bullets: [
      "Selecciona el motivo correcto.",
      "Escribe una nota concreta.",
      "La salida conserva responsable, fecha y costo.",
    ],
    view: "movements",
    selector: "[data-tour='inventory-nav-movements']",
  },
  {
    chapter: "Movimientos",
    title: "La bitácora explica cada cambio",
    body: "El historial reúne compras, consumos por venta, devoluciones, conteos y mermas.",
    bullets: [
      "Busca por insumo, tipo o referencia.",
      "Los pedidos muestran su folio como referencia.",
      "Las caducidades ayudan a decidir qué lote utilizar primero.",
    ],
    view: "movements",
    selector: "[data-tour='inventory-view-movements']",
  },
  {
    chapter: "Rutina recomendada",
    title: "Qué hacer durante el turno",
    body: "Mantén el inventario útil con una rutina pequeña y constante.",
    bullets: [
      "Diario: revisar Resumen, recibir compras y registrar mermas.",
      "Cada pocos días: conteo rápido de críticos.",
      "Semanal: conteo completo y revisión de diferencias.",
      "Cuando cambie una porción: actualizar su receta.",
    ],
    tip: "La exactitud mejora más registrando cada movimiento a tiempo que haciendo un conteo enorme al final del mes.",
    view: "overview",
    selector: "[data-tour='inventory-view-overview']",
  },
  {
    chapter: "Listo",
    title: "Ya puedes operar el inventario",
    body: "Empieza creando los insumos principales, configura sus recetas y realiza un conteo inicial. Después usa Resumen como guía diaria.",
    bullets: [
      "El botón de interrogación reinicia esta guía.",
      "Archivar conserva historial; eliminar es excepcional.",
      "Toda diferencia importante debe tener una explicación.",
    ],
    view: "overview",
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
  return (
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }) ?? null
  );
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
    const timeout = window.setTimeout(updateRect, 180);
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
      // La guía sigue disponible aunque el dispositivo bloquee el almacenamiento.
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
        left: Math.max(12, Math.min(targetRect.left, viewportWidth - 392)),
        top: Math.max(12, Math.min(targetRect.bottom + 12, viewportHeight - 520)),
      }
    : undefined;
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      {targetRect ? (
        <div
          className="fixed rounded-xl ring-4 ring-brand ring-offset-4 ring-offset-background/80 transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: "0 0 0 9999px rgb(5 4 8 / 0.78)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-background/85" />
      )}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-tour-title"
        className={`pointer-events-auto fixed flex max-h-[calc(100dvh_-_1.5rem)] w-[calc(100%_-_1.5rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float ${
          targetRect
            ? ""
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={tooltipStyle}
      >
        <div className="h-1 bg-surface-raised">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <header className="flex items-start gap-3 border-b border-border p-4 pb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <Compass aria-hidden size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
              {currentStep.chapter} · {stepIndex + 1} de {STEPS.length}
            </p>
            <h2 id="inventory-tour-title" className="mt-1 font-heading text-base font-bold text-foreground">
              {currentStep.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={skip}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            aria-label="Cerrar guía"
          >
            <X aria-hidden size={17} />
          </button>
        </header>

        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <p className="font-body text-sm leading-6 text-muted-foreground">{currentStep.body}</p>
          {currentStep.bullets?.length ? (
            <ul className="mt-3 space-y-2">
              {currentStep.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 font-body text-xs leading-5 text-foreground">
                  <Check aria-hidden size={14} className="mt-0.5 shrink-0 text-success" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {currentStep.tip ? (
            <div className="mt-4 flex gap-2 rounded-xl bg-gold/10 p-3 text-gold">
              <Lightbulb aria-hidden size={16} className="mt-0.5 shrink-0" />
              <p className="font-body text-xs leading-5">{currentStep.tip}</p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-border p-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => showStep(stepIndex - 1)}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden size={15} /> Atrás
            </button>
          ) : (
            <button type="button" onClick={skip} className="h-11 rounded-xl px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground">
              Omitir
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover"
          >
            {stepIndex === STEPS.length - 1 ? (
              <>
                <Check aria-hidden size={15} /> Terminar
              </>
            ) : (
              <>
                Siguiente <ArrowRight aria-hidden size={15} />
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}
