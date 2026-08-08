"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import type { MenuItem, ModifierGroup, ModifierOption, SelectedModifier } from "@/types/database";

interface VariationModalProps {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (selectedModifiers: SelectedModifier[], notes: string) => void;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-MX").format(price);
}

export function VariationModal({ item, onClose, onConfirm }: VariationModalProps) {
  const [selected, setSelected] = useState<Record<string, SelectedModifier[]>>({});
  const [notes, setNotes] = useState("");

  function handleSelect(group: ModifierGroup, option: ModifierOption) {
    const groupKey = group.id ?? group.name;
    const selectionMode = group.selection_mode === "multiple" ? "multiple" : "single";
    const nextModifier: SelectedModifier = {
        group_id: group.id,
        option_id: option.id,
        group: group.name,
        option: option.name,
        price: option.price,
        description: option.description,
    };

    setSelected((previous) => {
      const current = previous[groupKey] ?? [];
      if (selectionMode === "single") {
        return { ...previous, [groupKey]: [nextModifier] };
      }

      const selectedIndex = current.findIndex(
        (modifier) => (modifier.option_id ?? modifier.option) === (option.id ?? option.name)
      );
      if (selectedIndex >= 0) {
        return {
          ...previous,
          [groupKey]: current.filter((_, index) => index !== selectedIndex),
        };
      }

      const maximum = Number(group.max_selections) || 0;
      if (maximum > 0 && current.length >= maximum) return previous;
      return { ...previous, [groupKey]: [...current, nextModifier] };
    });
  }

  const basePrice = item.price;
  const selectedModifiers = Object.values(selected).flat();
  const modifiersTotal = selectedModifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  const totalPrice = basePrice + modifiersTotal;
  const requiredGroups = item.modifiers.filter((g) => g.required);
  const allRequiredSelected = requiredGroups.every(
    (group) =>
      (selected[group.id ?? group.name]?.length ?? 0) >= Math.max(1, group.min_selections ?? 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="variation-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="variation-title" className="font-heading text-xl font-bold">
              {item.name}
            </h2>
            {item.description ? (
              <p className="mt-1 font-body text-sm text-muted-foreground">{item.description}</p>
            ) : null}
            <p className="mt-2 font-data text-base font-bold text-brand">
              ${formatPrice(basePrice)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {item.modifiers.map((group, groupIndex) => {
              const groupKey = group.id ?? group.name;
              const groupSelection = selected[groupKey] ?? [];
              const isMultiple = group.selection_mode === "multiple";
              const maximum = Number(group.max_selections) || 0;

              return (
                <fieldset key={group.id ?? groupIndex} className="border-0 p-0">
                  <legend className="mb-2 flex flex-wrap items-center gap-2 font-heading text-xs font-bold text-foreground">
                    {group.name}
                    {group.required ? (
                      <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold text-brand">
                        Obligatorio
                      </span>
                    ) : null}
                    <span className="font-body text-[10px] font-normal text-muted-foreground">
                      {isMultiple
                        ? maximum > 0
                          ? `Elige hasta ${maximum}`
                          : "Puedes elegir varias"
                        : "Elige una"}
                    </span>
                  </legend>
                  <div className="grid gap-2">
                    {group.options.map((option, optionIndex) => {
                      const optionKey = option.id ?? option.name;
                      const isSelected = groupSelection.some(
                        (modifier) =>
                          (modifier.option_id ?? modifier.option) === optionKey
                      );
                      const isAtMaximum =
                        isMultiple && maximum > 0 && groupSelection.length >= maximum;

                      return (
                        <button
                          key={option.id ?? optionIndex}
                          type="button"
                          onClick={() => handleSelect(group, option)}
                          aria-pressed={isSelected}
                          disabled={!isSelected && isAtMaximum}
                          className={`flex min-h-14 items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-brand bg-brand-light"
                              : "border-border bg-background hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-6 w-6 items-center justify-center border-2 ${
                                isMultiple ? "rounded-lg" : "rounded-full"
                              } ${
                                isSelected ? "border-brand bg-brand text-white" : "border-border"
                              }`}
                            >
                              {isSelected ? <Check size={14} strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-heading text-sm font-semibold">
                                {option.name}
                              </span>
                              {option.description ? (
                                <span className="mt-0.5 block font-body text-xs leading-relaxed text-muted-foreground">
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="font-data text-sm font-bold text-brand">
                            {option.price > 0 ? `+$${formatPrice(option.price)}` : "Incluido"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            <label className="flex flex-col gap-1.5">
              <span className="font-heading text-xs font-bold text-muted-foreground">Notas</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Sin cebolla, extra salsa…"
                rows={3}
                className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 font-body text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-border bg-ink px-5 py-4 text-white">
          <div className="mb-3 flex items-end justify-between">
            <span className="font-heading text-xs font-bold uppercase tracking-wider text-white/55">
              Total
            </span>
            <span className="font-data text-3xl font-bold">${formatPrice(totalPrice)}</span>
          </div>
          <button
            type="button"
            onClick={() => onConfirm(selectedModifiers, notes)}
            disabled={!allRequiredSelected}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-brand font-heading text-sm font-bold text-white shadow-lg shadow-brand/40 hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 disabled:shadow-none"
          >
            Agregar al pedido
          </button>
          {!allRequiredSelected ? (
            <p className="mt-2 text-center font-body text-xs text-white/50">
              Completa las opciones obligatorias
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
