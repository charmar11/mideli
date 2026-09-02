"use client";

import { memo, useMemo } from "react";
import { ListFilter } from "lucide-react";
import { useCatalogStore, useUIStore } from "@/lib/stores";

export const CategoryTabs = memo(function CategoryTabs() {
  const categories = useCatalogStore((state) => state.categories);
  const menuItems = useCatalogStore((state) => state.menuItems);
  const activeCategory = useUIStore((state) => state.activeCategory);
  const setActiveCategory = useUIStore((state) => state.setActiveCategory);
  const activeCats = categories.filter((category) => category.is_active);
  const { itemCounts, activeItemCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;

    for (const item of menuItems) {
      if (!item.is_active) continue;
      total += 1;
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    }

    return { itemCounts: counts, activeItemCount: total };
  }, [menuItems]);

  return (
    <div className="shrink-0 border-b border-border bg-background/80 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light text-brand">
            <ListFilter size={17} />
          </span>
          <div>
            <p className="font-heading text-sm font-bold text-foreground">Carta</p>
            <p className="font-body text-[11px] text-muted-foreground">
              {activeCats.length} categorías
            </p>
          </div>
        </div>

        <div className="pos-scroll min-w-0 flex-1 overflow-x-auto sm:overflow-visible">
          <div className="flex min-w-max flex-nowrap items-center gap-2 pb-0.5 sm:min-w-0 sm:flex-wrap">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              aria-current={activeCategory === null ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center gap-3 rounded-xl px-3.5 font-heading text-xs font-bold transition-colors sm:text-sm ${
                activeCategory === null
                  ? "bg-brand text-white shadow-md shadow-brand/20"
                  : "bg-surface text-muted-foreground ring-1 ring-border hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              <span>Todo el menú</span>
              <span className={activeCategory === null ? "text-white/70" : "text-muted-foreground"}>
                {activeItemCount}
              </span>
            </button>

            {activeCats.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  aria-current={isActive ? "page" : undefined}
                  title={category.name}
                  className={`flex h-10 shrink-0 items-center gap-3 rounded-xl px-3.5 font-heading text-xs font-bold transition-colors sm:text-sm ${
                    isActive
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-surface text-muted-foreground ring-1 ring-border hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  <span className="whitespace-nowrap">{category.name}</span>
                  <span className={isActive ? "text-white/70" : "text-muted-foreground"}>
                    {itemCounts.get(category.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
