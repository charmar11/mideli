"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Hash,
  PackageCheck,
  PackageX,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogStore } from "@/lib/stores/catalog-store";
import type {
  MenuItem,
  MenuItemAvailabilityStatus,
} from "@/types/database";
import { cn } from "@/lib/utils";

type AvailabilitySource = "menu" | "kitchen" | "pos";

const statusLabel: Record<MenuItemAvailabilityStatus, string> = {
  available: "Disponible",
  limited: "Limitado",
  out_of_stock: "Agotado",
};

function currentStatus(item: MenuItem) {
  if (item.availability_status === "limited") {
    return `${item.available_quantity ?? 0} disponibles`;
  }
  return statusLabel[item.availability_status];
}

export function MenuAvailabilityDialog({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: AvailabilitySource;
}) {
  const categories = useCatalogStore((state) => state.categories);
  const menuItems = useCatalogStore((state) => state.menuItems);
  const fetchCatalog = useCatalogStore((state) => state.fetchCatalog);
  const subscribeToCatalog = useCatalogStore((state) => state.subscribeToCatalog);
  const setAvailability = useCatalogStore(
    (state) => state.setMenuItemAvailability
  );
  const [query, setQuery] = useState("");
  const [limitedItemId, setLimitedItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("5");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    void fetchCatalog();
    const unsubscribe = subscribeToCatalog();
    return unsubscribe;
  }, [fetchCatalog, open, subscribeToCatalog]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-MX");
    return menuItems
      .filter((item) => item.is_active)
      .filter((item) => {
        if (!normalized) return true;
        const category = categories.find(
          (candidate) => candidate.id === item.category_id
        );
        return (
          item.name.toLocaleLowerCase("es-MX").includes(normalized) ||
          category?.name.toLocaleLowerCase("es-MX").includes(normalized)
        );
      })
      .sort((a, b) => {
        const statusOrder = { out_of_stock: 0, limited: 1, available: 2 };
        return (
          statusOrder[a.availability_status] -
            statusOrder[b.availability_status] ||
          a.name.localeCompare(b.name, "es-MX")
        );
      });
  }, [categories, menuItems, query]);

  if (!open) return null;

  function applyStatus(
    item: MenuItem,
    status: MenuItemAvailabilityStatus,
    nextQuantity: number | null
  ) {
    setPendingId(item.id);
    startTransition(async () => {
      const result = await setAvailability(
        item.id,
        status,
        nextQuantity,
        source
      );
      setPendingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setLimitedItemId(null);
      toast.success(`${item.name}: ${statusLabel[status]}`);
    });
  }

  function startLimited(item: MenuItem) {
    setLimitedItemId(item.id);
    setQuantity(String(item.available_quantity && item.available_quantity > 0 ? item.available_quantity : 5));
  }

  function confirmLimited(item: MenuItem) {
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9999) {
      toast.error("Escribe una cantidad entre 1 y 9999");
      return;
    }
    applyStatus(item, "limited", parsed);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-float sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <PackageCheck size={21} />
            </span>
            <div>
              <h2 id="availability-title" className="font-heading text-lg font-bold">
                Disponibilidad del menú
              </h2>
              <p className="font-body text-xs text-muted-foreground">
                Agota o limita productos sin editar todo el menú.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"
            aria-label="Cerrar disponibilidad"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-border p-3 sm:p-4">
          <div className="relative">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto o categoría"
              autoFocus
              className="h-12 rounded-xl pl-10"
            />
          </div>
        </div>

        <div className="pos-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
          {filteredItems.map((item) => {
            const category = categories.find(
              (candidate) => candidate.id === item.category_id
            );
            const editingLimited = limitedItemId === item.id;
            const busy = isPending && pendingId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border bg-card p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-sm font-bold sm:text-base">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      {category?.name ?? "Sin categoría"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-lg px-2.5 py-1 font-data text-[10px] font-bold",
                      item.availability_status === "available" &&
                        "bg-success/12 text-success",
                      item.availability_status === "limited" &&
                        "bg-warning/12 text-warning",
                      item.availability_status === "out_of_stock" &&
                        "bg-destructive/12 text-destructive"
                    )}
                  >
                    {currentStatus(item)}
                  </span>
                </div>

                {editingLimited ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface-raised p-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 block font-heading text-xs font-bold">
                        Unidades disponibles
                      </span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={9999}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setLimitedItemId(null)}
                        className="h-11 rounded-xl"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="warning"
                        onClick={() => confirmLimited(item)}
                        disabled={busy}
                        className="h-11 rounded-xl"
                      >
                        <Hash /> Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={
                        item.availability_status === "available"
                          ? "success"
                          : "outline"
                      }
                      onClick={() => applyStatus(item, "available", null)}
                      disabled={busy}
                      className="h-11 rounded-xl px-2 text-xs"
                    >
                      <CheckCircle2 /> Disponible
                    </Button>
                    <Button
                      type="button"
                      variant={
                        item.availability_status === "limited"
                          ? "warning"
                          : "outline"
                      }
                      onClick={() => startLimited(item)}
                      disabled={busy}
                      className="h-11 rounded-xl px-2 text-xs"
                    >
                      <Hash /> Limitado
                    </Button>
                    <Button
                      type="button"
                      variant={
                        item.availability_status === "out_of_stock"
                          ? "danger"
                          : "outline"
                      }
                      onClick={() => applyStatus(item, "out_of_stock", null)}
                      disabled={busy}
                      className="h-11 rounded-xl px-2 text-xs"
                    >
                      <PackageX /> Agotado
                    </Button>
                  </div>
                )}
              </article>
            );
          })}

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <PackageX className="mx-auto text-muted-foreground" />
              <p className="mt-3 font-heading text-sm font-bold">Sin resultados</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Prueba con otro nombre o categoría.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
