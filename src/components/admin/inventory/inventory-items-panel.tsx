"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/stores/inventory-store";
import type { InventoryItem } from "@/types/database";
import {
  InventoryEmpty,
  InventoryPanel,
  StockStatus,
  formatInventoryMoney,
  formatInventoryNumber,
} from "./inventory-ui";
import { InventoryItemEditor } from "./inventory-item-editor";
import { InventoryItemDeleteDialog } from "./inventory-item-delete-dialog";

type ItemStatusFilter = "active" | "archived" | "all";

export function InventoryItemsPanel({
  items,
  isAdmin,
  initialEditorOpen = false,
}: {
  items: InventoryItem[];
  isAdmin: boolean;
  initialEditorOpen?: boolean;
}) {
  const { deactivateItem, reactivateItem } = useInventoryStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>("active");
  const [editingItem, setEditingItem] = useState<InventoryItem | "new" | null>(
    initialEditorOpen ? "new" : null
  );
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const statusCounts = useMemo(() => ({
    active: items.filter((item) => item.is_active).length,
    archived: items.filter((item) => !item.is_active).length,
  }), [items]);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    return items.filter(
      (item) =>
        (statusFilter === "all" || (statusFilter === "active" ? item.is_active : !item.is_active)) &&
        (!query || item.name.toLocaleLowerCase("es-MX").includes(query))
    );
  }, [items, search, statusFilter]);

  async function handleDeactivate(item: InventoryItem) {
    if (!window.confirm(`¿Archivar ${item.name}? Conservará su historial y podrás reactivarlo.`)) return;
    const result = await deactivateItem(item.id);
    if (result.error) toast.error("No se pudo archivar", { description: result.error });
    else toast.success("Insumo archivado");
  }

  async function handleReactivate(item: InventoryItem) {
    const result = await reactivateItem(item.id);
    if (result.error) toast.error("No se pudo reactivar", { description: result.error });
    else toast.success("Insumo reactivado");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {isAdmin ? (
          <button data-tour="inventory-new-item" type="button" onClick={() => setEditingItem("new")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover">
            <Plus size={16} /> Nuevo insumo
          </button>
        ) : null}
      </div>

      <InventoryPanel title="Almacén de insumos" description="Existencias, costos y datos de compra en un solo lugar.">
        <div className="flex flex-col gap-2 border-b border-border/70 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
            <Search size={17} className="shrink-0 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar insumo" className="min-w-0 flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground" />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda" className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"><X size={16} /></button> : null}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1" aria-label="Filtrar insumos por estado">
            {([
              ["active", "Activos", statusCounts.active],
              ["archived", "Archivados", statusCounts.archived],
              ["all", "Todos", items.length],
            ] as const).map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`h-9 rounded-lg px-2 font-heading text-[10px] font-bold transition-colors sm:px-3 ${statusFilter === value ? "bg-brand text-white" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}>
                {label} <span className="font-data">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <InventoryEmpty
            title={items.length === 0 ? "Crea tu primer insumo" : search ? "No encontramos coincidencias" : statusFilter === "active" ? "No hay insumos activos" : statusFilter === "archived" ? "No hay insumos archivados" : "No hay insumos"}
            description={items.length === 0 ? "Registra cómo lo compras y Mideli calculará automáticamente su costo por unidad." : search ? "Prueba con otro nombre." : statusFilter === "active" && statusCounts.archived > 0 ? "Tus insumos están archivados. Puedes consultarlos o reactivarlos." : "Cuando existan registros con este estado aparecerán aquí."}
            action={items.length === 0 && isAdmin ? <button type="button" onClick={() => setEditingItem("new")} className="h-11 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white">Crear primer insumo</button> : statusFilter === "active" && statusCounts.archived > 0 ? <button type="button" onClick={() => setStatusFilter("archived")} className="h-11 rounded-xl border border-brand/35 px-4 font-heading text-xs font-bold text-brand">Ver archivados</button> : undefined}
          />
        ) : (
          <div className="divide-y divide-border/70">
            {filteredItems.map((item) => (
              <article key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(9rem,.8fr)_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-heading text-sm font-bold text-foreground">{item.name}</h3>
                    <StockStatus current={item.current_stock} minimum={item.minimum_stock} />
                    {!item.is_active ? <span className="rounded-full bg-surface-raised px-2 py-1 font-heading text-[10px] font-bold text-muted-foreground">Inactivo</span> : null}
                  </div>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    {formatInventoryNumber(item.current_stock)} {item.unit} disponibles
                    {item.storage_location ? ` · ${item.storage_location}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:block">
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Compra</p>
                    <p className="mt-0.5 font-heading text-xs font-bold text-foreground">{formatInventoryNumber(item.purchase_conversion_factor)} {item.unit} por {item.purchase_unit}</p>
                  </div>
                  <div className="sm:mt-2">
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Costo unitario</p>
                    <p className="mt-0.5 font-data text-xs font-bold text-foreground">{formatInventoryMoney(item.cost_per_unit)}</p>
                  </div>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-1 justify-self-end">
                    <button type="button" onClick={() => setEditingItem(item)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-brand/35 hover:text-brand" aria-label={`Editar ${item.name}`}><Pencil size={15} /></button>
                    {item.is_active ? (
                      <button type="button" onClick={() => void handleDeactivate(item)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-warning/35 hover:text-warning" aria-label={`Archivar ${item.name}`} title="Archivar"><Archive size={15} /></button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void handleReactivate(item)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-success/35 hover:text-success" aria-label={`Reactivar ${item.name}`} title="Reactivar"><RotateCcw size={15} /></button>
              <button type="button" onClick={() => setDeletingItem(item)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20" aria-label={`Eliminar definitivamente ${item.name}`} title="Eliminar definitivamente"><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                ) : <ChevronRight size={18} className="justify-self-end text-muted-foreground" />}
              </article>
            ))}
          </div>
        )}
      </InventoryPanel>

      {editingItem ? <InventoryItemEditor item={editingItem === "new" ? null : editingItem} onClose={() => setEditingItem(null)} /> : null}
      {deletingItem ? <InventoryItemDeleteDialog item={deletingItem} onClose={() => setDeletingItem(null)} /> : null}
    </div>
  );
}
