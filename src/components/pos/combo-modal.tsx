"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { toggleComboOptionSelection } from "@/lib/combo-selection";
import { useCatalogStore } from "@/lib/stores/catalog-store";
import type { MenuItem, SelectedModifier } from "@/types/database";

interface ComboModalProps {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (selectedModifiers: SelectedModifier[], notes: string) => void;
}

const money = new Intl.NumberFormat("es-MX");

export function ComboModal({ item, onClose, onConfirm }: ComboModalProps) {
  const menuItems = useCatalogStore((state) => state.menuItems);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const definition = item.combo_definition ?? { fixed_components: [], choice_groups: [] };
  const itemsById = useMemo(() => new Map(menuItems.map((candidate) => [candidate.id, candidate])), [menuItems]);
  const requiredGroups = definition.choice_groups.filter((group) => group.required);
  const isUsableAsComboComponent = (menuItemId: string) => {
    const product = itemsById.get(menuItemId);
    return Boolean(
      product?.is_active &&
      !product.is_combo &&
      product.sale_mode !== "standalone_only"
    );
  };
  const fixedComponentsAvailable = definition.fixed_components.every(
    (component) => isUsableAsComboComponent(component.menu_item_id)
  );
  const canAdd =
    fixedComponentsAvailable &&
    requiredGroups.every((group) => Boolean(selected[group.id])) &&
    definition.choice_groups.every((group) => {
      const option = group.options.find((candidate) => candidate.id === selected[group.id]);
      return !option || isUsableAsComboComponent(option.menu_item_id);
    });
  const selectedExtras = definition.choice_groups.reduce((sum, group) => {
    const option = group.options.find((candidate) => candidate.id === selected[group.id]);
    return sum + (option && !option.is_gift ? option.price_adjustment : 0);
  }, 0);

  function createSelection(): SelectedModifier[] {
    const fixed = definition.fixed_components.map((component) => ({
      group_id: `combo-fixed:${component.id}`,
      option_id: component.menu_item_id,
      group: "Incluye",
      option: `${component.quantity} × ${itemsById.get(component.menu_item_id)?.name ?? "Artículo"}${component.is_gift ? " (Regalo)" : ""}`,
      price: 0,
      combo_component_menu_item_id: component.menu_item_id,
      combo_component_quantity: component.quantity,
      combo_component_is_gift: Boolean(component.is_gift),
    }));
    const choices = definition.choice_groups.flatMap((group) => {
      const option = group.options.find((candidate) => candidate.id === selected[group.id]);
      if (!option) return [];
      const productName = itemsById.get(option.menu_item_id)?.name ?? "Artículo";
      return [{
        group_id: `combo-choice:${group.id}`,
        option_id: option.id,
        group: group.name,
        option: `${option.quantity > 1 ? `${option.quantity} × ` : ""}${option.label.trim() || productName}${option.is_gift ? " (Regalo)" : ""}`,
        price: option.is_gift ? 0 : option.price_adjustment,
        description: option.label.trim() && option.label.trim() !== productName ? productName : undefined,
        combo_component_menu_item_id: option.menu_item_id,
        combo_component_quantity: option.quantity,
        combo_component_is_gift: Boolean(option.is_gift),
      }];
    });
    return [...fixed, ...choices];
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="combo-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="combo-title" className="font-heading text-lg font-bold text-foreground">
              {item.name}
            </h2>
            {item.description ? (
              <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            ) : null}
            <p className="mt-2 font-data text-sm font-bold text-brand">${money.format(item.price)} precio base</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={19} />
          </button>
        </header>

        {!fixedComponentsAvailable ? (
          <p role="alert" className="border-b border-warning/30 bg-warning/10 px-4 py-3 font-body text-xs text-warning sm:px-5">
            Un producto incluido en este combo no está disponible. Avísale a quien administra el menú.
          </p>
        ) : null}

        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {definition.fixed_components.length > 0 ? (
            <section className="mb-5">
              <h3 className="mb-2 font-heading text-xs font-bold uppercase tracking-wide text-muted-foreground">Incluye</h3>
              <ul className="space-y-2">
                {definition.fixed_components.map((component) => (
                  <li key={component.id} className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5 font-body text-sm">
                    <span className="min-w-0">{component.quantity} × {itemsById.get(component.menu_item_id)?.name ?? "Producto no disponible"}</span>
                    <span className="shrink-0 font-heading text-xs font-bold text-success">
                      {component.is_gift ? "Regalo" : "Incluido"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="space-y-5">
            {definition.choice_groups.map((group) => (
              <fieldset key={group.id} className="border-0 p-0">
                <legend className="mb-2 font-heading text-sm font-bold text-foreground">
                  {group.name}{group.required ? <span className="ml-2 text-xs font-medium text-brand">Elige una</span> : <span className="ml-2 text-xs font-medium text-muted-foreground">Opcional</span>}
                </legend>
                <div className="grid gap-2">
                  {group.options.map((option) => {
                    const active = selected[group.id] === option.id;
                    const product = itemsById.get(option.menu_item_id);
                    const title = option.label.trim() || product?.name || "Producto no disponible";
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        disabled={!isUsableAsComboComponent(option.menu_item_id)}
                        onClick={() => setSelected((current) => toggleComboOptionSelection(current, group.id, option.id))}
                        className={`flex min-h-12 touch-manipulation items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-brand bg-brand-light" : "border-border bg-background hover:border-brand/50"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-heading text-sm font-semibold text-foreground">{title}</span>
                          {option.label.trim() && product?.name && option.label.trim() !== product.name ? (
                            <span className="block truncate font-body text-xs text-muted-foreground">{product.name}</span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-data text-xs font-bold text-brand">
                            {option.is_gift
                              ? "Regalo"
                              : option.price_adjustment > 0
                                ? `+$${money.format(option.price_adjustment)}`
                                : "Incluido"}
                          </span>
                          {active ? <Check size={16} className="text-brand" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <label className="mt-5 flex flex-col gap-1.5">
            <span className="font-heading text-xs font-bold text-muted-foreground">Nota para preparación</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Una indicación para este combo"
              rows={2}
              className="min-h-20 resize-y rounded-xl border border-border bg-background px-3 py-2.5 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:text-sm"
            />
          </label>
        </div>

        <footer className="border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-heading text-xs font-bold text-muted-foreground">Precio del combo</span>
            <span className="font-data text-xl font-bold text-foreground">${money.format(item.price + selectedExtras)}</span>
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => onConfirm(createSelection(), notes)}
            className="min-h-12 w-full touch-manipulation rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agregar combo
          </button>
        </footer>
      </div>
    </div>
  );
}
