"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore, type CountSubmissionLine } from "@/lib/stores/inventory-store";
import type { InventoryCount, InventoryCountLine, InventoryItem } from "@/types/database";
import { InventoryEmpty, InventoryPanel, formatInventoryNumber } from "./inventory-ui";

type DraftValue = { counted: string; reason: string; note: string };

const REASONS = [
  { value: "count_error", label: "Error de conteo anterior" },
  { value: "waste_unrecorded", label: "Merma no registrada" },
  { value: "receipt_error", label: "Recepción incorrecta" },
  { value: "internal_use", label: "Uso interno" },
  { value: "unknown", label: "Diferencia sin explicar" },
];

export function InventoryCountPanel({
  items,
  counts,
  countLines,
  isAdmin,
}: {
  items: InventoryItem[];
  counts: InventoryCount[];
  countLines: InventoryCountLine[];
  isAdmin: boolean;
}) {
  const { startCount, cancelCount, completeCount, reviewCount } = useInventoryStore();
  const activeCount = counts.find((count) => count.status === "draft") ?? null;
  const activeLines = useMemo(() => {
    if (!activeCount) return [];
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return countLines
      .filter((line) => line.count_id === activeCount.id)
      .toSorted((a, b) =>
        (itemMap.get(a.inventory_item_id)?.name ?? "").localeCompare(
          itemMap.get(b.inventory_item_id)?.name ?? ""
        )
      );
  }, [activeCount, countLines, items]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [draft, setDraft] = useState<Record<string, DraftValue>>(() => {
    if (!activeCount) return {};
    const storageKey = `mideli.inventory-count.v1.${activeCount.id}`;
    let stored: Record<string, DraftValue> = {};
    if (typeof window !== "undefined") {
      try {
        stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<
          string,
          DraftValue
        >;
      } catch {
        stored = {};
      }
    }
    return Object.fromEntries(
      activeLines.map((line) => [
        line.id,
        stored[line.id] ?? {
          counted: line.counted_stock === null ? "" : String(line.counted_stock),
          reason: line.reason_code,
          note: line.note,
        },
      ])
    );
  });
  const [index, setIndex] = useState(() => {
    const firstEmpty = activeLines.findIndex((line) => !draft[line.id]?.counted);
    return firstEmpty >= 0 ? firstEmpty : 0;
  });
  const [working, setWorking] = useState(false);
  const activeItemCount = items.filter((item) => item.is_active).length;

  useEffect(() => {
    if (!activeCount || Object.keys(draft).length === 0) return;
    localStorage.setItem(`mideli.inventory-count.v1.${activeCount.id}`, JSON.stringify(draft));
  }, [activeCount, draft]);

  async function handleStart(scope: "full" | "critical") {
    setWorking(true);
    const result = await startCount(scope);
    setWorking(false);
    if (result.error) toast.error("No se pudo iniciar el conteo", { description: result.error });
    else toast.success(scope === "critical" ? "Conteo rápido iniciado" : "Conteo completo iniciado");
  }

  function updateCurrent(updates: Partial<DraftValue>) {
    const line = activeLines[index];
    if (!line) return;
    setDraft((current) => {
      const previous = current[line.id] ?? { counted: "", reason: "", note: "" };
      return {
        ...current,
        [line.id]: { ...previous, ...updates },
      };
    });
  }

  async function handleComplete() {
    if (!activeCount) return;
    const submission: CountSubmissionLine[] = [];
    for (let lineIndex = 0; lineIndex < activeLines.length; lineIndex += 1) {
      const line = activeLines[lineIndex];
      const value = draft[line.id];
      const counted = Number(value?.counted);
      if (!value?.counted || !Number.isFinite(counted) || counted < 0) {
        setIndex(lineIndex);
        toast.error("Falta contar un insumo");
        return;
      }
      const difference = counted - line.expected_stock;
      if (difference !== 0 && !value.reason) {
        setIndex(lineIndex);
        toast.error("Selecciona el motivo de la diferencia");
        return;
      }
      submission.push({
        line_id: line.id,
        counted_stock: counted,
        reason_code: difference === 0 ? "" : value.reason,
        note: value.note,
      });
    }

    setWorking(true);
    const result = await completeCount(activeCount.id, submission);
    setWorking(false);
    if (result.error) {
      toast.error("No se pudo cerrar el conteo", { description: result.error });
      return;
    }
    localStorage.removeItem(`mideli.inventory-count.v1.${activeCount.id}`);
    toast.success(
      result.data === "submitted"
        ? "Conteo guardado para revisión"
        : "Inventario conciliado correctamente"
    );
  }

  async function handleCancel() {
    if (!activeCount) return;
    if (!window.confirm("¿Cancelar este conteo? El inventario no cambiará.")) return;
    setWorking(true);
    const result = await cancelCount(activeCount.id);
    setWorking(false);
    if (result.error) {
      toast.error("No se pudo cancelar el conteo", { description: result.error });
      return;
    }
    localStorage.removeItem(`mideli.inventory-count.v1.${activeCount.id}`);
    toast.success("Conteo cancelado");
  }

  async function handleRestartEmpty() {
    if (!activeCount) return;
    setWorking(true);
    const cancelled = await cancelCount(activeCount.id);
    if (cancelled.error) {
      setWorking(false);
      toast.error("No se pudo retirar el conteo vacío", { description: cancelled.error });
      return;
    }
    if (activeItemCount === 0) {
      setWorking(false);
      toast.success("Conteo vacío descartado", { description: "Reactiva o crea un insumo antes de comenzar otro." });
      return;
    }
    const restarted = await startCount(activeCount.scope);
    setWorking(false);
    if (restarted.error) {
      toast.error("El conteo anterior se descartó", { description: restarted.error });
      return;
    }
    toast.success("Conteo reiniciado correctamente");
  }

  async function handleReview(countId: string) {
    setWorking(true);
    const result = await reviewCount(countId);
    setWorking(false);
    if (result.error) toast.error("No se pudo conciliar", { description: result.error });
    else toast.success("Diferencia revisada y conciliada");
  }

  if (!activeCount) {
    const pendingReviews = counts.filter((count) => count.status === "submitted");
    return (
      <div className="space-y-4">
        <InventoryPanel title="Conteo físico" description="Cuenta primero, compara después. Mideli registra cada diferencia.">
          <ol className="grid border-b border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-border/70">
            <li className="px-4 py-3.5 sm:px-5">
              <p className="font-heading text-xs font-bold text-foreground">1. Elige qué contar</p>
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Rápido revisa existencias críticas. Completo incluye todos los insumos activos.</p>
            </li>
            <li className="border-t border-border/70 px-4 py-3.5 sm:border-t-0 sm:px-5">
              <p className="font-heading text-xs font-bold text-foreground">2. Captura lo que ves</p>
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Escribe la cantidad física real. Mideli hará la comparación después.</p>
            </li>
            <li className="border-t border-border/70 px-4 py-3.5 sm:border-t-0 sm:px-5">
              <p className="font-heading text-xs font-bold text-foreground">3. Explica diferencias</p>
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Si algo no coincide, registra el motivo y quedará listo para conciliación.</p>
            </li>
          </ol>
          {activeItemCount === 0 ? (
            <div className="border-b border-border/70 bg-warning-light px-4 py-3 sm:px-5">
              <p className="font-heading text-xs font-bold text-warning">No hay insumos activos para contar</p>
              <p className="mt-1 font-body text-xs text-warning/80">Ve a Insumos para crear uno o reactivar un registro archivado.</p>
            </div>
          ) : null}
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <button
              type="button"
              disabled={working || activeItemCount === 0}
              onClick={() => void handleStart("critical")}
              className="group flex min-h-28 items-center gap-4 rounded-2xl bg-brand p-4 text-left text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><ClipboardCheck size={21} /></span>
              <span><span className="block font-heading text-sm font-bold">Conteo rápido</span><span className="mt-1 block font-body text-xs text-white/75">Solo agotados y stock bajo.</span></span>
            </button>
            <button
              type="button"
              disabled={working || activeItemCount === 0}
              onClick={() => void handleStart("full")}
              className="group flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:border-brand/45 disabled:opacity-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-foreground"><RotateCcw size={20} /></span>
              <span><span className="block font-heading text-sm font-bold">Conteo completo</span><span className="mt-1 block font-body text-xs text-muted-foreground">Revisa todos los insumos activos.</span></span>
            </button>
          </div>
        </InventoryPanel>

        {pendingReviews.length > 0 ? (
          <InventoryPanel title="Diferencias por revisar" description="Variaciones importantes detectadas por cocina o supervisión.">
            <div className="divide-y divide-border/70">
              {pendingReviews.map((count) => (
                <div key={count.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-light text-warning"><ShieldCheck size={17} /></span>
                  <div className="min-w-0 flex-1"><p className="font-heading text-sm font-bold">Conteo del {new Date(count.completed_at ?? count.started_at).toLocaleDateString("es-MX")}</p><p className="mt-0.5 font-body text-xs text-muted-foreground">Requiere validación administrativa.</p></div>
                  {isAdmin ? <button type="button" disabled={working} onClick={() => void handleReview(count.id)} className="action-warning h-9 rounded-xl px-3 font-heading text-xs font-bold disabled:opacity-50">Conciliar</button> : null}
                </div>
              ))}
            </div>
          </InventoryPanel>
        ) : (
          <InventoryPanel>
            <InventoryEmpty title="Sin diferencias pendientes" description="Los conteos recientes ya están conciliados." />
          </InventoryPanel>
        )}
      </div>
    );
  }

  const currentLine = activeLines[index];
  const currentItem = currentLine ? itemMap.get(currentLine.inventory_item_id) : null;
  if (!currentLine || !currentItem) {
    return (
      <InventoryPanel>
        <InventoryEmpty
          title="Este conteo quedó vacío"
          description="La sesión no contiene insumos. Puedes retirarla con seguridad y comenzar de nuevo."
          action={(
            <button type="button" disabled={working} onClick={() => void handleRestartEmpty()} className={`h-11 rounded-xl px-4 font-heading text-xs font-bold disabled:opacity-50 ${activeItemCount > 0 ? "bg-brand text-white hover:bg-brand-hover" : "action-danger"}`}>
              {activeItemCount > 0 ? "Reiniciar conteo" : "Descartar conteo vacío"}
            </button>
          )}
        />
      </InventoryPanel>
    );
  }
  const currentValue = draft[currentLine.id] ?? { counted: "", reason: "", note: "" };
  const countedNumber = Number(currentValue.counted);
  const hasValidCount = currentValue.counted !== "" && Number.isFinite(countedNumber) && countedNumber >= 0;
  const difference = hasValidCount ? countedNumber - currentLine.expected_stock : 0;
  const completedCount = activeLines.filter((line) => draft[line.id]?.counted !== "").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <InventoryPanel>
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-heading text-sm font-bold">{activeCount.scope === "critical" ? "Conteo rápido" : "Conteo completo"}</h2><p className="mt-0.5 font-body text-xs text-muted-foreground">{completedCount} de {activeLines.length} capturados</p></div>
            <div className="flex items-center gap-2">
              <span className="font-data text-xs font-bold text-brand">{index + 1}/{activeLines.length}</span>
              <button
                type="button"
                disabled={working}
                onClick={() => void handleCancel()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                aria-label="Cancelar conteo"
                title="Cancelar conteo"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(4, (completedCount / Math.max(activeLines.length, 1)) * 100)}%` }} /></div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-5 rounded-xl bg-brand-light px-3.5 py-3">
            <p className="font-body text-xs leading-5 text-brand">Escribe lo que ves físicamente. Mideli mostrará la cantidad del sistema después de capturar.</p>
          </div>
          <div className="mb-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-xl font-bold text-foreground">{currentItem.name}</h3><p className="mt-1 font-body text-sm text-muted-foreground">{currentItem.storage_location || "Ubicación sin definir"} · Unidad: {currentItem.unit}</p></div>{currentItem.current_stock <= currentItem.minimum_stock ? <span className="rounded-full bg-warning-light px-2 py-1 font-heading text-[10px] font-bold text-warning">Crítico</span> : null}</div>
          </div>

          <label className="block">
            <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">Cantidad física</span>
            <div className="relative"><input autoFocus inputMode="decimal" type="number" min="0" step="0.001" value={currentValue.counted} onChange={(event) => updateCurrent({ counted: event.target.value })} placeholder="0" className="h-20 w-full rounded-2xl border border-border bg-background px-4 pr-20 text-center font-data text-3xl font-bold text-foreground outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-brand" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-body text-sm text-muted-foreground">{currentItem.unit}</span></div>
          </label>

          {hasValidCount ? (
            <div className={`mt-4 rounded-xl px-3.5 py-3 ${difference === 0 ? "bg-success/8" : "bg-warning-light"}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-body text-xs text-muted-foreground">Registrado en sistema</span><span className="font-data text-sm font-bold">{formatInventoryNumber(currentLine.expected_stock)} {currentItem.unit}</span></div>
              <div className="mt-1.5 flex items-center justify-between gap-3"><span className="font-heading text-xs font-bold">Diferencia</span><span className={`font-data text-sm font-bold ${difference === 0 ? "text-success" : "text-warning"}`}>{difference > 0 ? "+" : ""}{formatInventoryNumber(difference)}</span></div>
            </div>
          ) : null}

          {difference !== 0 ? (
            <div className="mt-4 space-y-3">
              <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">¿Por qué no coincide?</span><select value={currentValue.reason} onChange={(event) => updateCurrent({ reason: event.target.value })} className="form-input"><option value="">Seleccionar motivo</option>{REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Nota opcional</span><input value={currentValue.note} onChange={(event) => updateCurrent({ note: event.target.value })} placeholder="Ej. paquete abierto o producto dañado" className="form-input" /></label>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border/70 p-3 sm:p-4">
          <button type="button" disabled={index === 0 || working} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground disabled:opacity-30" aria-label="Insumo anterior"><ArrowLeft size={17} /></button>
          {index < activeLines.length - 1 ? (
            <button type="button" disabled={!hasValidCount || (difference !== 0 && !currentValue.reason) || working} onClick={() => setIndex((value) => Math.min(activeLines.length - 1, value + 1))} className="action-success flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Guardar y seguir <ArrowRight size={16} /></button>
          ) : (
            <button type="button" disabled={!hasValidCount || (difference !== 0 && !currentValue.reason) || working} onClick={() => void handleComplete()} className="action-success flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">{working ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Finalizar conteo</button>
          )}
        </div>
      </InventoryPanel>
    </div>
  );
}
