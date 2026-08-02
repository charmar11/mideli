"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Category, InventoryItem, InventoryRecipe, MenuItem } from "@/types/database";
import { InventoryEmpty, formatInventoryMoney } from "./inventory-ui";
import { RecipeEditor } from "./recipe-editor";
import {
  buildRecipeLibrary,
  type ProductRecipeSummary,
  type RecipeCoverageStatus,
} from "./recipe-utils";

const STATUS_COPY: Record<RecipeCoverageStatus, { label: string; className: string }> = {
  configured: { label: "Configurada", className: "bg-success/12 text-success" },
  partial: { label: "Parcial", className: "bg-warning-light text-warning" },
  missing: { label: "Sin receta", className: "bg-surface-raised text-muted-foreground" },
};

function RecipeStatusIcon({ status }: { status: RecipeCoverageStatus }) {
  if (status === "configured") return <CheckCircle2 size={15} />;
  if (status === "partial") return <AlertCircle size={15} />;
  return <CircleDashed size={15} />;
}

function RecipeProductCard({
  summary,
  isAdmin,
  onOpen,
}: {
  summary: ProductRecipeSummary;
  isAdmin: boolean;
  onOpen: () => void;
}) {
  const status = STATUS_COPY[summary.status];
  const remainingIngredients = Math.max(0, summary.ingredientNames.length - 2);

  return (
    <article
      className="flex min-h-44 flex-col rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/35 sm:p-5"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 176px" }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-[10px] uppercase tracking-wider text-muted-foreground">{summary.categoryName}</p>
          <h3 className="mt-1 truncate font-heading text-base font-bold text-foreground">{summary.menuItem.name}</h3>
        </div>
        <span className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-heading text-[10px] font-bold ${status.className}`}>
          <RecipeStatusIcon status={summary.status} /> {status.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {summary.ingredientNames.length > 0 ? (
          <>
            {summary.ingredientNames.slice(0, 2).map((name) => (
              <span key={name} className="max-w-full truncate rounded-full bg-background px-2.5 py-1 font-body text-[11px] text-muted-foreground">{name}</span>
            ))}
            {remainingIngredients > 0 ? <span className="rounded-full bg-background px-2.5 py-1 font-data text-[10px] font-bold text-muted-foreground">+{remainingIngredients}</span> : null}
          </>
        ) : (
          <p className="font-body text-xs text-muted-foreground">Todavía no se descuenta ningún ingrediente.</p>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="font-body text-[10px] text-muted-foreground">
            {summary.totalTargets === 1
              ? summary.configuredTargets === 1 ? "Receta base lista" : "Falta la receta base"
              : `${summary.configuredTargets} de ${summary.totalTargets} secciones`}
          </p>
          <p className="mt-1 font-data text-sm font-bold text-gold">{formatInventoryMoney(summary.estimatedBaseCost)} <span className="font-body text-[10px] font-normal text-muted-foreground">base</span></p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 font-heading text-xs font-bold text-white hover:bg-brand-hover">
          {isAdmin
            ? summary.status === "missing" ? "Crear receta" : "Ver o editar"
            : "Ver receta"} <ChevronRight size={15} />
        </button>
      </div>
    </article>
  );
}

export function RecipeLibrary({
  menuItems,
  categories,
  items,
  recipes,
  isAdmin,
}: {
  menuItems: MenuItem[];
  categories: Category[];
  items: InventoryItem[];
  recipes: InventoryRecipe[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RecipeCoverageStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const summaries = useMemo(
    () => buildRecipeLibrary(menuItems, categories, items, recipes),
    [categories, items, menuItems, recipes]
  );
  const counts = useMemo(() => ({
    configured: summaries.filter((summary) => summary.status === "configured").length,
    partial: summaries.filter((summary) => summary.status === "partial").length,
    missing: summaries.filter((summary) => summary.status === "missing").length,
  }), [summaries]);
  const filteredSummaries = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("es-MX");
    return summaries.filter((summary) =>
      (statusFilter === "all" || summary.status === statusFilter) &&
      (categoryFilter === "all" || summary.menuItem.category_id === categoryFilter) &&
      (!query || summary.menuItem.name.toLocaleLowerCase("es-MX").includes(query))
    );
  }, [categoryFilter, deferredSearch, statusFilter, summaries]);
  const selectedSummary = summaries.find((summary) => summary.menuItem.id === selectedProductId) ?? null;
  const activeCategories = categories.filter((category) => category.is_active && menuItems.some((item) => item.is_active && item.category_id === category.id));

  return (
    <div className="space-y-5" data-tour="inventory-recipes">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Recetas del menú</h2>
          <p className="mt-1 max-w-2xl font-body text-sm text-muted-foreground">Revisa qué descuenta cada producto y completa lo que falta.</p>
        </div>
        <p className="font-body text-xs text-muted-foreground">{summaries.length} productos activos</p>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label="Filtrar por estado">
        {([
          ["configured", "Configuradas", counts.configured, CheckCircle2],
          ["partial", "Parciales", counts.partial, AlertCircle],
          ["missing", "Sin receta", counts.missing, CircleDashed],
        ] as const).map(([value, label, count, Icon]) => {
          const active = statusFilter === value;
          return (
            <button key={value} type="button" aria-pressed={active} onClick={() => setStatusFilter((current) => current === value ? "all" : value)} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 transition-colors ${active ? "bg-brand text-white" : "border border-border bg-surface text-muted-foreground hover:text-foreground"}`}>
              <Icon size={16} />
              <span className="min-w-0 text-left">
                <span className="block font-data text-sm font-bold leading-none">{count}</span>
                <span className="mt-1 block truncate font-heading text-[10px] font-bold sm:text-xs">{label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
          <Search size={17} className="shrink-0 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" className="min-w-0 flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda" className="text-muted-foreground hover:text-foreground"><X size={16} /></button> : null}
        </div>
        <label className="relative flex min-h-11 items-center rounded-xl border border-border bg-surface pl-10 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
          <SlidersHorizontal size={16} className="pointer-events-none absolute left-3 text-muted-foreground" />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrar por categoría" className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-3 font-heading text-xs font-bold text-foreground outline-none">
            <option value="all">Todas las categorías</option>
            {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <InventoryEmpty title="No hay productos activos" description="Crea o activa productos en Menú antes de configurar sus recetas." />
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <InventoryEmpty title="No encontramos recetas" description="Cambia la búsqueda o limpia los filtros para volver a ver los productos." action={<button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); }} className="h-10 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white">Limpiar filtros</button>} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredSummaries.map((summary) => (
            <RecipeProductCard key={summary.menuItem.id} summary={summary} isAdmin={isAdmin} onOpen={() => setSelectedProductId(summary.menuItem.id)} />
          ))}
        </div>
      )}

      {!isAdmin ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="font-body text-xs text-muted-foreground">Esta vista es de consulta. Administración puede modificar las recetas.</p>
        </div>
      ) : null}

      {selectedSummary ? <RecipeEditor key={selectedSummary.menuItem.id} summary={selectedSummary} items={items} isAdmin={isAdmin} onClose={() => setSelectedProductId(null)} /> : null}
    </div>
  );
}
