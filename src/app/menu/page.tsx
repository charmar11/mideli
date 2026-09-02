"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import { useCatalogStore } from "@/lib/stores";
import { CategoryManager, ProductFormModal } from "@/components/admin";
import type { MenuItem } from "@/types/database";

export default function MenuPage() {
  const {
    categories,
    menuItems,
    loading,
    fetchCategories,
    fetchMenuItems,
    deleteMenuItem,
    updateMenuItem,
  } = useCatalogStore();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchMenuItems();
  }, [fetchCategories, fetchMenuItems]);

  function openNewItemForm() {
    setEditingItem(null);
    setShowProductForm(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setShowProductForm(true);
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    const deleted = await deleteMenuItem(id);
    if (!deleted) {
      toast.error("No se pudo eliminar el producto");
      return;
    }
    toast.success("Producto eliminado");
  }

  async function handleToggleItem(id: string, isActive: boolean) {
    const updated = await updateMenuItem(id, { is_active: !isActive });
    if (!updated) {
      toast.error("No se pudo actualizar el estado del producto");
    }
  }

  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );
  const filteredItems = useMemo(() => {
    const items = activeCategory
      ? menuItems.filter((item) => item.category_id === activeCategory)
      : menuItems;
    return [...items].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es-MX")
    );
  }, [activeCategory, menuItems]);
  const groupedItems = useMemo(() => {
    if (activeCategory) return [];
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const current = byCategory.get(item.category_id) ?? [];
      current.push(item);
      byCategory.set(item.category_id, current);
    }
    return orderedCategories
      .filter((category) => byCategory.has(category.id))
      .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }));
  }, [activeCategory, filteredItems, orderedCategories]);

  function renderMenuItem(item: MenuItem) {
    return (
      <div
        key={item.id}
        className={`group flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card transition-colors sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${
          !item.is_active ? "opacity-50" : ""
        }`}
      >
        <GripVertical
          size={16}
          className="hidden shrink-0 text-muted-foreground/30 sm:block"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 font-heading text-sm font-bold text-foreground sm:text-base">
              {item.name}
            </p>
            {item.modifiers && item.modifiers.length > 0 ? (
              <span className="rounded-md bg-gold-light px-2 py-0.5 font-heading text-[10px] font-semibold text-gold">
                {item.modifiers.length} mod{item.modifiers.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          {item.description ? (
            <p className="mt-1 line-clamp-2 font-body text-sm leading-5 text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
        <div className="flex w-full items-center justify-between gap-3 border-t border-border/70 pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
          <span className="font-data text-base font-bold text-brand">
            ${item.price}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => handleToggleItem(item.id, item.is_active)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer ${
                item.is_active
                  ? "text-success hover:text-warning"
                  : "text-muted-foreground hover:text-success"
              }`}
              title={item.is_active ? "Desactivar" : "Activar"}
              aria-label={`${item.is_active ? "Desactivar" : "Activar"} ${item.name}`}
            >
              {item.is_active ? "●" : "○"}
            </button>
            <button
              type="button"
              onClick={() => openEditItem(item)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
              title="Editar producto y variaciones"
              aria-label={`Editar producto y variaciones de ${item.name}`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteItem(item.id)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
              title="Eliminar producto"
              aria-label={`Eliminar producto ${item.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && categories.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="font-body text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-3 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Volver al panel"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-heading text-lg font-bold text-foreground">Menú</h1>
            <p className="font-body text-xs text-muted-foreground">
              Categorías y platillos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-full bg-brand-light px-3 py-1 font-heading text-[11px] font-bold text-brand sm:block">
            {menuItems.length} platillos
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card px-3 py-2 lg:hidden">
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 font-heading text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
                <Tags size={15} />
              </span>
              Administrar categorías
            </span>
            <ChevronDown size={18} className="text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-2 pt-3">
            <CategoryManager />
          </div>
        </details>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-card p-4 lg:block">
          <CategoryManager />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-sm font-bold text-foreground sm:text-base">
              {activeCategory
                ? categories.find((c) => c.id === activeCategory)?.name
                : "Todos los platillos"}
              </h2>
              <p className="mt-0.5 font-body text-xs text-muted-foreground">
                {filteredItems.length} {filteredItems.length === 1 ? "platillo" : "platillos"}
              </p>
            </div>
            <button
              onClick={() =>
                openNewItemForm()
              }
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 font-heading text-sm font-bold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:w-auto sm:text-xs"
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>

          <div className="pos-scroll flex min-h-16 flex-nowrap items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 sm:flex-wrap sm:overflow-visible sm:px-4">
            <button
              onClick={() => setActiveCategory(null)}
              className={`min-h-11 shrink-0 rounded-xl px-4 py-2 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer ${
                activeCategory === null
                  ? "bg-brand text-white"
                  : "bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {orderedCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`min-h-11 shrink-0 rounded-xl px-4 py-2 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer ${
                  activeCategory === cat.id
                    ? "bg-brand text-white"
                    : "bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="flex flex-col gap-6">
              {activeCategory ? (
                <div className="flex flex-col gap-2">
                  {filteredItems.map((item) => renderMenuItem(item))}
                </div>
              ) : (
                groupedItems.map((group) => (
                  <section key={group.category.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-1 pb-2">
                      <h3 className="font-heading text-base font-bold text-foreground sm:text-lg">
                        {group.category.name}
                      </h3>
                      <span className="font-data text-xs text-muted-foreground">
                        {group.items.length} {group.items.length === 1 ? "platillo" : "platillos"}
                      </span>
                    </div>
                    {group.items.map((item) => renderMenuItem(item))}
                  </section>
                ))
              )}

              {filteredItems.length === 0 && (
                <div className="rounded-xl border border-border bg-surface p-8 text-center">
                  <p className="font-body text-sm text-muted-foreground">
                    No hay productos en esta categoría
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {showProductForm && (
        <ProductFormModal
          item={editingItem}
          categoryId={activeCategory ?? categories[0]?.id ?? ""}
          onClose={() => {
            setShowProductForm(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}
