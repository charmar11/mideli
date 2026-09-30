"use client";

import { Plus, Trash2 } from "lucide-react";
import type {
  ComboChoiceGroupDefinition,
  ComboChoiceOptionDefinition,
  ComboComponentDefinition,
  ComboDefinition,
  MenuItem,
} from "@/types/database";

interface ComboBuilderProps {
  definition: ComboDefinition;
  items: MenuItem[];
  parentItemId?: string;
  onChange: (definition: ComboDefinition) => void;
}

const inputClass =
  "min-h-11 min-w-0 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

export function ComboBuilder({
  definition,
  items,
  parentItemId,
  onChange,
}: ComboBuilderProps) {
  const availableItems = items.filter(
    (candidate) =>
      candidate.id !== parentItemId &&
      candidate.is_active &&
      !candidate.is_combo &&
      candidate.sale_mode !== "standalone_only"
  );
  const itemNames = new Map(availableItems.map((candidate) => [candidate.id, candidate.name]));

  function updateFixed(index: number, updates: Partial<ComboComponentDefinition>) {
    onChange({
      ...definition,
      fixed_components: definition.fixed_components.map((component, i) =>
        i === index ? { ...component, ...updates } : component
      ),
    });
  }

  function addFixed() {
    onChange({
      ...definition,
      fixed_components: [
        ...definition.fixed_components,
        { id: crypto.randomUUID(), menu_item_id: "", quantity: 1 },
      ],
    });
  }

  function updateGroup(index: number, updates: Partial<ComboChoiceGroupDefinition>) {
    onChange({
      ...definition,
      choice_groups: definition.choice_groups.map((group, i) =>
        i === index ? { ...group, ...updates } : group
      ),
    });
  }

  function addGroup() {
    onChange({
      ...definition,
      choice_groups: [
        ...definition.choice_groups,
        {
          id: crypto.randomUUID(),
          name: "Elige una opción",
          required: true,
          options: [],
        },
      ],
    });
  }

  function updateOption(
    groupIndex: number,
    optionIndex: number,
    updates: Partial<ComboChoiceOptionDefinition>
  ) {
    onChange({
      ...definition,
      choice_groups: definition.choice_groups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              options: group.options.map((option, j) =>
                j === optionIndex ? { ...option, ...updates } : option
              ),
            }
          : group
      ),
    });
  }

  function addOption(groupIndex: number) {
    const option: ComboChoiceOptionDefinition = {
      id: crypto.randomUUID(),
      menu_item_id: "",
      label: "",
      quantity: 1,
      price_adjustment: 0,
    };
    onChange({
      ...definition,
      choice_groups: definition.choice_groups.map((group, i) =>
        i === groupIndex ? { ...group, options: [...group.options, option] } : group
      ),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-body text-sm leading-relaxed text-muted-foreground">
        El combo se cobra a un solo precio. Sus componentes aparecen en la comanda y
        cocina; sólo los extras marcados aumentan el total.
      </p>

      {availableItems.length === 0 ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 font-body text-sm text-warning">
        Agrega primero productos activos que puedan usarse en combos. Los productos marcados «Sólo como parte de un combo» también aparecen aquí.
        </p>
      ) : null}

      <section aria-labelledby="combo-fixed-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="combo-fixed-title" className="font-heading text-sm font-bold text-foreground">
              Incluye siempre
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Partes que se agregan automáticamente.
            </p>
          </div>
          <button
            type="button"
            disabled={availableItems.length === 0}
            onClick={addFixed}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-foreground hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <Plus size={15} /> Agregar
          </button>
        </div>

        {definition.fixed_components.map((component, index) => (
          <div key={component.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] items-end gap-2">
            <label className="min-w-0 font-heading text-xs font-semibold text-muted-foreground">
              Producto
              <select
                value={component.menu_item_id}
                onChange={(event) => updateFixed(index, { menu_item_id: event.target.value })}
                className={`${inputClass} mt-1.5`}
              >
                <option value="">Seleccionar</option>
                {component.menu_item_id && !itemNames.has(component.menu_item_id) ? (
                  <option value={component.menu_item_id}>Producto no disponible</option>
                ) : null}
                {availableItems.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}{candidate.sale_mode === "combo_only" ? " · sólo combo" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-heading text-xs font-semibold text-muted-foreground">
              Cantidad
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                value={component.quantity}
                onChange={(event) => updateFixed(index, { quantity: Number(event.target.value) })}
                className={`${inputClass} mt-1.5 px-2 text-center font-data`}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...definition,
                  fixed_components: definition.fixed_components.filter((_, i) => i !== index),
                })
              }
              aria-label={`Quitar componente ${itemNames.get(component.menu_item_id) ?? index + 1}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 size={16} />
            </button>
            <label className="col-span-3 flex min-h-11 items-center gap-2 rounded-xl bg-background/70 px-3 font-body text-sm text-foreground">
              <input
                type="checkbox"
                checked={Boolean(component.is_gift)}
                onChange={(event) => updateFixed(index, { is_gift: event.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              Este componente es un regalo en este combo
            </label>
          </div>
        ))}
      </section>

      <section aria-labelledby="combo-choices-title" className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="combo-choices-title" className="font-heading text-sm font-bold text-foreground">
              Opciones a elegir
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Por ejemplo, elegir una bebida para el combo.
            </p>
          </div>
          <button
            type="button"
            onClick={addGroup}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-foreground hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus size={15} /> Grupo
          </button>
        </div>

        {definition.choice_groups.map((group, groupIndex) => (
          <fieldset key={group.id} className="flex min-w-0 flex-col gap-3 border-0 border-t border-border/70 p-0 pt-3 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <input
                value={group.name}
                onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                aria-label="Nombre del grupo de opciones"
                placeholder="Ej. Elige tu bebida"
                className={`${inputClass} flex-1 font-heading font-semibold`}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...definition,
                    choice_groups: definition.choice_groups.filter((_, i) => i !== groupIndex),
                  })
                }
                aria-label={`Quitar grupo ${group.name || groupIndex + 1}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <label className="flex min-h-11 items-center gap-2 font-body text-sm text-foreground">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(event) => updateGroup(groupIndex, { required: event.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              El cliente debe elegir una opción
            </label>

            {group.options.map((option, optionIndex) => (
              <div key={option.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] items-end gap-2">
                <label className="min-w-0 font-heading text-xs font-semibold text-muted-foreground">
                  Producto
                  <select
                    value={option.menu_item_id}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, { menu_item_id: event.target.value })
                    }
                    className={`${inputClass} mt-1.5`}
                  >
                    <option value="">Seleccionar</option>
                    {option.menu_item_id && !itemNames.has(option.menu_item_id) ? (
                      <option value={option.menu_item_id}>Producto no disponible</option>
                    ) : null}
                    {availableItems.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}{candidate.sale_mode === "combo_only" ? " · sólo combo" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="font-heading text-xs font-semibold text-muted-foreground">
                  Extra $
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={option.price_adjustment}
                    disabled={Boolean(option.is_gift)}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, {
                        price_adjustment: Number(event.target.value),
                      })
                    }
                    className={`${inputClass} mt-1.5 px-2 text-center font-data`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateGroup(groupIndex, {
                      options: group.options.filter((_, i) => i !== optionIndex),
                    })
                  }
                  aria-label={`Quitar opción ${itemNames.get(option.menu_item_id) ?? optionIndex + 1}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Trash2 size={16} />
                </button>
                <label className="col-span-3 font-heading text-xs font-semibold text-muted-foreground">
                  Texto que verá la mesera
                  <input
                    value={option.label}
                    onChange={(event) => updateOption(groupIndex, optionIndex, { label: event.target.value })}
                    placeholder={itemNames.get(option.menu_item_id) ?? "Opcional: ej. Grande"}
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
                <label className="col-span-3 flex min-h-11 items-center gap-2 rounded-xl bg-background/70 px-3 font-body text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(option.is_gift)}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, {
                        is_gift: event.target.checked,
                        price_adjustment: event.target.checked ? 0 : option.price_adjustment,
                      })
                    }
                    className="h-4 w-4 accent-brand"
                  />
                  Esta opción es un regalo en este combo
                </label>
              </div>
            ))}
            <button
              type="button"
              disabled={availableItems.length === 0}
              onClick={() => addOption(groupIndex)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface px-3 font-heading text-xs font-bold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              <Plus size={14} /> Agregar opción
            </button>
          </fieldset>
        ))}
      </section>
    </div>
  );
}
