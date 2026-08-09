"use client";

import { memo, useMemo } from "react";
import { Check, Search, Plus } from "lucide-react";
import { useCartStore, useCatalogStore, useUIStore } from "@/lib/stores";
import type { MenuItem } from "@/types/database";

interface ProductGridProps {
  onProductClick: (item: MenuItem) => void;
  addedProduct: { id: string; token: number } | null;
}

const priceFormatter = new Intl.NumberFormat("es-MX");

function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

export const ProductGrid = memo(function ProductGrid({
  onProductClick,
  addedProduct,
}: ProductGridProps) {
  const menuItems = useCatalogStore((state) => state.menuItems);
  const cartItems = useCartStore((state) => state.items);
  const activeCategory = useUIStore((state) => state.activeCategory);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("es-MX");

    return menuItems.filter((item) => {
      if (!item.is_active) return false;
      if (activeCategory && item.category_id !== activeCategory) return false;
      if (!query) return true;

      return (
        item.name.toLocaleLowerCase("es-MX").includes(query) ||
        item.description.toLocaleLowerCase("es-MX").includes(query)
      );
    });
  }, [activeCategory, menuItems, searchQuery]);

  const quantitiesByProduct = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of cartItems) {
      quantities.set(
        item.menu_item_id,
        (quantities.get(item.menu_item_id) ?? 0) + item.quantity
      );
    }
    return quantities;
  }, [cartItems]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-3 pb-2 sm:px-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar platillo…"
            className="h-12 w-full rounded-2xl border border-border bg-surface py-2 pl-11 pr-4 font-body text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </div>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-40 sm:px-4 md:pb-24 lg:pb-4">
        {filteredItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-card">
              <Search size={28} className="text-muted-foreground/50" />
            </div>
            <p className="font-heading text-sm font-semibold text-muted-foreground">
              {searchQuery ? "Sin resultados" : "No hay productos"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredItems.map((item) => {
              const quantityInCart = quantitiesByProduct.get(item.id) ?? 0;
              const wasJustAdded = addedProduct?.id === item.id;

              return (
              <button
                key={`${item.id}-${wasJustAdded ? addedProduct.token : "idle"}`}
                type="button"
                data-product-id={item.id}
                onClick={() => onProductClick(item)}
                className={`group relative flex min-h-[9rem] flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-card transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-float active:scale-[0.985] ${
                  wasJustAdded
                    ? "pos-product-added border-success/70"
                    : "border-border/80"
                }`}
              >
                {quantityInCart > 0 ? (
                  <span
                    className="absolute right-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-success px-2 font-data text-xs font-black text-ink shadow-md"
                    aria-label={`${quantityInCart} en el pedido`}
                  >
                    {quantityInCart}
                  </span>
                ) : null}
                {item.image_url ? (
                  <div className="h-28 w-full overflow-hidden bg-surface-raised">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-28 items-end bg-gradient-to-br from-brand/15 via-surface-raised to-gold-light px-3 pb-2">
                    <span className="font-brand text-2xl leading-none text-brand/40">M</span>
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-heading text-sm font-bold leading-snug text-foreground">
                      {item.name}
                    </span>
                    {item.modifiers?.length ? (
                      <span className="shrink-0 rounded-full bg-brand-light px-2 py-0.5 font-heading text-[10px] font-bold text-brand">
                        +
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <span className="line-clamp-2 font-body text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="font-data text-base font-bold text-brand">
                      ${formatPrice(item.price)}
                    </span>
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors ${
                        wasJustAdded
                          ? "bg-success text-ink"
                          : "bg-ink group-hover:bg-brand"
                      }`}
                    >
                      {wasJustAdded ? (
                        <Check size={18} strokeWidth={3} />
                      ) : (
                        <Plus size={18} strokeWidth={2.5} />
                      )}
                    </span>
                  </div>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
