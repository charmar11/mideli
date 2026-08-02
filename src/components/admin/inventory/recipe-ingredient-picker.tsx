"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Check, PackagePlus, Search, X } from "lucide-react";
import type { InventoryItem } from "@/types/database";
import { formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";

export function RecipeIngredientPicker({
  items,
  selectedIds,
  onSelect,
  onClose,
}: {
  items: InventoryItem[];
  selectedIds: Set<string>;
  onSelect: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const filteredItems = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("es-MX");
    return items.filter(
      (item) =>
        item.is_active &&
        (!query || item.name.toLocaleLowerCase("es-MX").includes(query))
    );
  }, [deferredSearch, items]);

  return (
    <section className="rounded-2xl border border-border bg-background p-3 sm:p-4" aria-label="Seleccionar ingrediente">
      <div className="flex items-center gap-3">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar ingrediente"
            className="min-w-0 flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar selector de ingredientes" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground">
          <X size={17} />
        </button>
      </div>

      <div className="pos-scroll mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center py-7 text-center">
            <PackagePlus size={22} className="text-muted-foreground/45" />
            <p className="mt-2 font-heading text-xs font-bold text-foreground">No encontramos ingredientes</p>
            <p className="mt-1 font-body text-xs text-muted-foreground">Prueba con otro nombre.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={selected}
                onClick={() => onSelect(item)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-raised disabled:cursor-default disabled:opacity-55"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-success/12 text-success" : "bg-brand-light text-brand"}`}>
                  {selected ? <Check size={16} /> : <PackagePlus size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-xs font-bold text-foreground">{item.name}</span>
                  <span className="mt-0.5 block font-body text-[11px] text-muted-foreground">
                    {formatInventoryNumber(item.current_stock)} {item.unit} disponibles
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-data text-xs font-bold text-foreground">{formatInventoryMoney(item.cost_per_unit)}</span>
                  <span className="block font-body text-[10px] text-muted-foreground">por {item.unit}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
