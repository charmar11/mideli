"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  PackagePlus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/stores/inventory-store";
import type { InventoryItem } from "@/types/database";
import { formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";
import { RecipeIngredientPicker } from "./recipe-ingredient-picker";
import type { ProductRecipeSummary, RecipeTargetSummary } from "./recipe-utils";

type RecipeDraftRow = {
  inventoryItemId: string;
  quantity: string;
};

function targetDraft(target: RecipeTargetSummary): RecipeDraftRow[] {
  return target.ingredients.map((ingredient) => ({
    inventoryItemId: ingredient.recipe.inventory_item_id,
    quantity: String(Number(ingredient.recipe.quantity)),
  }));
}

function draftFingerprint(rows: RecipeDraftRow[]) {
  return JSON.stringify(
    rows.map((row) => ({
      inventoryItemId: row.inventoryItemId,
      quantity: Number(row.quantity || 0),
    }))
  );
}

function ingredientCountLabel(count: number) {
  return count === 1 ? "1 ingrediente" : `${count} ingredientes`;
}

export function RecipeEditor({
  summary,
  items,
  isAdmin,
  onClose,
}: {
  summary: ProductRecipeSummary;
  items: InventoryItem[];
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { replaceRecipe } = useInventoryStore();
  const [selectedTargetKey, setSelectedTargetKey] = useState("base");
  const initialTarget = summary.targets.find((target) => target.key === "base") ?? summary.targets[0];
  const [draft, setDraft] = useState<RecipeDraftRow[]>(() => targetDraft(initialTarget));
  const [originalDraft, setOriginalDraft] = useState<RecipeDraftRow[]>(() => targetDraft(initialTarget));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeTarget = summary.targets.find((target) => target.key === selectedTargetKey) ?? initialTarget;
  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedIds = useMemo(() => new Set(draft.map((row) => row.inventoryItemId)), [draft]);
  const dirty = draftFingerprint(draft) !== draftFingerprint(originalDraft);
  const estimatedCost = draft.reduce((total, row) => {
    const item = itemById.get(row.inventoryItemId);
    return total + Number(row.quantity || 0) * Number(item?.cost_per_unit ?? 0);
  }, 0);

  function selectTarget(target: RecipeTargetSummary) {
    if (dirty && !window.confirm("¿Cambiar de sección sin guardar estos cambios?")) return;
    const nextDraft = targetDraft(target);
    setSelectedTargetKey(target.key);
    setDraft(nextDraft);
    setOriginalDraft(nextDraft);
    setPickerOpen(false);
  }

  function closeEditor() {
    if (dirty && !window.confirm("¿Cerrar sin guardar los cambios de esta receta?")) return;
    onClose();
  }

  function addIngredient(item: InventoryItem) {
    if (selectedIds.has(item.id)) {
      toast.info(`${item.name} ya está en esta receta`);
      return;
    }
    setDraft((current) => [
      ...current,
      { inventoryItemId: item.id, quantity: "1" },
    ]);
    setPickerOpen(false);
  }

  async function saveRecipe() {
    if (!isAdmin) return;
    if (!activeTarget.canEdit) {
      toast.error("Esta opción necesita revisión en el menú antes de editarse");
      return;
    }
    if (draft.length === 0) {
      if (originalDraft.length === 0) return;
      if (!window.confirm(`¿Guardar ${activeTarget.label} como sin receta? Dejará de descontar ingredientes en ventas nuevas.`)) return;
      setSaving(true);
      const result = await replaceRecipe(summary.menuItem.id, activeTarget.optionId, [], true);
      setSaving(false);
      if (result.error) {
        toast.error("No se pudo guardar como sin receta", { description: result.error });
        return;
      }
      setDraft([]);
      setOriginalDraft([]);
      toast.success("Receta guardada como sin receta");
      return;
    }
    if (draft.some((row) => !row.inventoryItemId || !row.quantity.trim() || Number(row.quantity) <= 0)) {
      toast.error("Revisa las cantidades", { description: "Cada ingrediente necesita una cantidad mayor que cero." });
      return;
    }
    if (selectedIds.size !== draft.length) {
      toast.error("Hay ingredientes repetidos");
      return;
    }

    setSaving(true);
    const result = await replaceRecipe(
      summary.menuItem.id,
      activeTarget.optionId,
      draft.map((row) => ({
        inventory_item_id: row.inventoryItemId,
        quantity: Number(row.quantity),
      }))
    );
    setSaving(false);
    if (result.error) {
      toast.error("No se pudo guardar la receta", { description: result.error });
      return;
    }
    const savedDraft = (result.data ?? []).map((recipe) => ({
      inventoryItemId: recipe.inventory_item_id,
      quantity: String(Number(recipe.quantity)),
    }));
    setDraft(savedDraft);
    setOriginalDraft(savedDraft);
    toast.success("Receta guardada");
  }

  async function deleteRecipe() {
    if (!isAdmin) return;
    if (originalDraft.length === 0) return;
    if (!window.confirm(`¿Eliminar la receta de ${activeTarget.label}? Esta acción no cambia movimientos anteriores.`)) return;
    setSaving(true);
    const result = await replaceRecipe(summary.menuItem.id, activeTarget.optionId, [], true);
    setSaving(false);
    if (result.error) {
      toast.error("No se pudo eliminar la receta", { description: result.error });
      return;
    }
    setDraft([]);
    setOriginalDraft([]);
    toast.success("Receta eliminada");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/72 p-0 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
      <section role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title" className="flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:h-[min(88dvh,760px)] sm:rounded-3xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <PackagePlus size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="recipe-editor-title" className="truncate font-heading text-base font-bold text-foreground sm:text-lg">{summary.menuItem.name}</h2>
            <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">{summary.categoryName} · {summary.configuredTargets} de {summary.totalTargets} secciones configuradas</p>
          </div>
          <button type="button" onClick={closeEditor} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground" aria-label="Cerrar editor de receta">
            <X size={19} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav className="pos-scroll flex shrink-0 gap-2 overflow-x-auto border-b border-border p-3 lg:block lg:space-y-1 lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="Secciones de la receta">
            {summary.targets.map((target) => {
              const selected = target.key === activeTarget.key;
              return (
                <button
                  key={target.key}
                  type="button"
                  onClick={() => selectTarget(target)}
                  className={`flex min-h-12 min-w-40 shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-left lg:w-full lg:min-w-0 ${selected ? "bg-brand text-white" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? "bg-white/18" : target.orphaned ? "bg-warning-light text-warning" : target.configured ? "bg-success/12 text-success" : "bg-background text-muted-foreground"}`}>
                    {target.orphaned ? <AlertTriangle size={13} /> : target.configured ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-xs font-bold">{target.label}</span>
                    <span className={`mt-0.5 block truncate font-body text-[10px] ${selected ? "text-white/75" : "text-muted-foreground"}`}>
                      {target.group ? `${target.group.name} · ` : ""}
                      {target.ingredients.length > 0 ? ingredientCountLabel(target.ingredients.length) : "Sin configurar"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="pos-scroll min-h-0 overflow-y-auto">
            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-bold text-foreground">{activeTarget.label}</h3>
                    {activeTarget.orphaned ? <span className="rounded-full bg-warning-light px-2.5 py-1 font-heading text-[10px] font-bold text-warning">Requiere revisión</span> : null}
                  </div>
                  <p className="mt-1 max-w-xl font-body text-sm leading-5 text-muted-foreground">{activeTarget.description}</p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Costo estimado</p>
                  <p className="mt-0.5 font-data text-xl font-bold text-gold">{formatInventoryMoney(estimatedCost)}</p>
                </div>
              </div>

              {activeTarget.orphaned ? (
                <div className="flex gap-3 rounded-2xl border border-warning/25 bg-warning-light p-4 text-warning">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <p className="font-body text-xs leading-5">Esta opción ya no existe en el menú. Sus datos se conservan para revisión y no se pueden modificar desde aquí.</p>
                </div>
              ) : null}

              <div className="divide-y divide-border/70 rounded-2xl border border-border bg-background">
                {draft.length === 0 ? (
                  <div className="px-5 py-9 text-center">
                    <PackagePlus size={25} className="mx-auto text-muted-foreground/45" />
                    <p className="mt-3 font-heading text-sm font-bold text-foreground">Esta sección aún no tiene ingredientes</p>
                    <p className="mt-1 font-body text-xs text-muted-foreground">Agrega el primer ingrediente para calcular su consumo y costo.</p>
                  </div>
                ) : (
                  draft.map((row, index) => {
                    const item = itemById.get(row.inventoryItemId) ?? null;
                    return (
                      <div key={row.inventoryItemId || index} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_5rem_2.75rem] sm:items-center sm:px-4">
                        <div className="min-w-0">
                          <p className="truncate font-heading text-sm font-bold text-foreground">{item?.name ?? "Insumo no disponible"}</p>
                          <p className="mt-0.5 font-body text-[11px] text-muted-foreground">
                            {item ? `${formatInventoryNumber(item.current_stock)} ${item.unit} disponibles` : "Reemplázalo por un insumo activo"}
                          </p>
                        </div>
                        <label className="block">
                          <span className="mb-1 block font-body text-[10px] text-muted-foreground sm:hidden">Cantidad utilizada</span>
                          <div className="flex h-11 items-center overflow-hidden rounded-xl border border-border bg-surface focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0.0001"
                              step="0.0001"
                              value={row.quantity}
                              onChange={(event) => setDraft((current) => current.map((candidate, rowIndex) => rowIndex === index ? { ...candidate, quantity: event.target.value } : candidate))}
                              disabled={!isAdmin || activeTarget.orphaned}
                              className="min-w-0 flex-1 bg-transparent px-3 font-data text-sm font-bold text-foreground outline-none"
                              aria-label={`Cantidad de ${item?.name ?? "ingrediente"}`}
                            />
                            <span className="shrink-0 border-l border-border px-2 font-body text-[11px] text-muted-foreground">{item?.unit ?? "unidad"}</span>
                          </div>
                        </label>
                        <div className="flex items-center justify-between sm:block sm:text-right">
                          <span className="font-body text-[10px] text-muted-foreground sm:hidden">Costo</span>
                          <span className="font-data text-xs font-bold text-foreground">{formatInventoryMoney(Number(row.quantity || 0) * Number(item?.cost_per_unit ?? 0))}</span>
                        </div>
                        <button type="button" disabled={!isAdmin || activeTarget.orphaned} onClick={() => setDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="flex h-11 w-11 items-center justify-center justify-self-end rounded-xl border border-border text-muted-foreground hover:border-destructive/35 hover:text-destructive disabled:opacity-40" aria-label={`Quitar ${item?.name ?? "ingrediente"}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {isAdmin && !activeTarget.orphaned ? (
                <>
                  {pickerOpen ? (
                    <RecipeIngredientPicker items={activeItems} selectedIds={selectedIds} onSelect={addIngredient} onClose={() => setPickerOpen(false)} />
                  ) : (
                    <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand/35 font-heading text-xs font-bold text-brand hover:bg-brand-light sm:w-auto sm:px-4">
                      <PackagePlus size={16} /> Agregar ingrediente
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          {isAdmin && originalDraft.length > 0 && draft.length > 0 && activeTarget.canEdit ? (
            <button type="button" disabled={saving} onClick={() => void deleteRecipe()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-40">
              <Trash2 size={15} /> <span className="hidden sm:inline">Eliminar receta</span>
            </button>
          ) : null}
          <div className="flex-1" />
          <button type="button" onClick={closeEditor} className="h-11 rounded-xl px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground">Cerrar</button>
          {isAdmin && activeTarget.canEdit ? (
            <button type="button" disabled={saving || !dirty || (draft.length === 0 && originalDraft.length === 0)} onClick={() => void saveRecipe()} className="action-success inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {draft.length === 0 && originalDraft.length > 0 ? "Guardar como sin receta" : "Guardar receta"}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
