"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore, type PurchaseDraftLine } from "@/lib/stores/inventory-store";
import type { InventoryItem, InventoryPurchaseOrder, InventoryPurchaseOrderLine } from "@/types/database";
import { InventoryEmpty, InventoryPanel, formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";

function suggestedPackages(item: InventoryItem) {
  const needed = Math.max(item.target_stock - item.current_stock, 0);
  if (needed <= 0) return 0;
  return Math.max(
    Math.ceil(needed / Math.max(item.purchase_conversion_factor, 0.0001)),
    Math.max(1, item.minimum_purchase_quantity)
  );
}

export function InventoryPurchasePanel({
  items,
  purchaseOrders,
  purchaseOrderLines,
  onReceive,
  onDirectReceive,
}: {
  items: InventoryItem[];
  purchaseOrders: InventoryPurchaseOrder[];
  purchaseOrderLines: InventoryPurchaseOrderLine[];
  onReceive: (purchaseOrderId: string) => void;
  onDirectReceive: () => void;
}) {
  const createPurchaseOrder = useInventoryStore((state) => state.createPurchaseOrder);
  const suggested = useMemo(
    () => items.filter((item) => item.is_active && suggestedPackages(item) > 0),
    [items]
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);

  const suggestedSuppliers = new Set(suggested.map((item) => item.preferred_supplier).filter(Boolean));
  const inferredSupplier = suggestedSuppliers.size === 1 ? Array.from(suggestedSuppliers)[0] : "";
  const pendingOrders = purchaseOrders.filter(
    (order) => order.status === "ordered" || order.status === "partially_received"
  );
  const itemMap = new Map(items.map((item) => [item.id, item]));

  async function createPurchase() {
    const lines: PurchaseDraftLine[] = suggested
      .filter((item) => selected[item.id] ?? true)
      .map((item) => ({
        inventory_item_id: item.id,
        ordered_purchase_quantity: Number(quantities[item.id] ?? suggestedPackages(item)),
        expected_package_cost: item.last_purchase_package_cost || item.cost_per_unit * item.purchase_conversion_factor,
      }))
      .filter((line) => Number.isFinite(line.ordered_purchase_quantity) && line.ordered_purchase_quantity > 0);
    if (lines.length === 0) {
      toast.error("Selecciona al menos un insumo");
      return;
    }
    setWorking(true);
    const result = await createPurchaseOrder(supplier.trim() || inferredSupplier, lines, notes.trim());
    setWorking(false);
    if (result.error) {
      toast.error("No se pudo guardar la compra", { description: result.error });
      return;
    }
    toast.success("Compra registrada", { description: "Quedó lista para recibir cuando llegue." });
    setNotes("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">Compras y recepción</h2>
          <p className="mt-1 font-body text-xs text-muted-foreground">Pide en cajas o paquetes. Mideli convierte todo a existencias reales.</p>
        </div>
        <button type="button" onClick={onDirectReceive} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 font-heading text-xs font-bold text-success hover:bg-success/15">
          <Truck size={16} /> Recibir sin pedido
        </button>
      </div>

      <InventoryPanel title="Compra sugerida" description="La cantidad se redondea por presentación y respeta el pedido mínimo." action={suggested.length > 0 ? <span className="rounded-full bg-warning-light px-2.5 py-1 font-heading text-[10px] font-bold text-warning">{suggested.length} por reabastecer</span> : null}>
        {suggested.length === 0 ? (
          <InventoryEmpty title="No necesitas comprar ahora" description="Todos los insumos están en su nivel ideal o por encima." />
        ) : (
          <div>
            <div className="divide-y divide-border/70">
              {suggested.map((item) => {
                const packages = suggestedPackages(item);
                const packageCost = item.last_purchase_package_cost || item.cost_per_unit * item.purchase_conversion_factor;
                const currentQuantity = Number(quantities[item.id] ?? packages);
                return (
                  <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:px-5">
                    <label className="flex min-w-0 items-start gap-3">
                      <input type="checkbox" checked={selected[item.id] ?? true} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))} className="mt-1 h-4 w-4 accent-brand" />
                      <span className="min-w-0">
                        <span className="block font-heading text-sm font-bold text-foreground">{item.name}</span>
                        <span className="mt-1 block font-body text-xs text-muted-foreground">Hay {formatInventoryNumber(item.current_stock)} {item.unit}. Ideal: {formatInventoryNumber(item.target_stock)}.</span>
                        <span className="mt-1 block font-body text-[11px] text-muted-foreground">1 {item.purchase_unit} = {formatInventoryNumber(item.purchase_conversion_factor)} {item.unit}{item.preferred_supplier ? ` · ${item.preferred_supplier}` : ""}</span>
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-heading text-[10px] font-bold text-muted-foreground">Comprar {item.purchase_unit}</span>
                      <input type="number" min="0.0001" step="0.0001" disabled={!selected[item.id]} value={quantities[item.id] ?? String(packages)} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="form-input h-10 disabled:opacity-40" />
                      <span className="mt-1 block text-right font-data text-[10px] text-muted-foreground">{formatInventoryMoney(Math.max(0, currentQuantity) * packageCost)} estimado</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 border-t border-border/70 bg-background/30 p-4 sm:grid-cols-2 sm:p-5">
              <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Proveedor</span><input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder={inferredSupplier || "Ej. Proveedor de carnes"} className="form-input" /></label>
              <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Nota opcional</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Entrega por la mañana" className="form-input" /></label>
        <button type="button" disabled={working} onClick={() => void createPurchase()} className="action-success inline-flex h-11 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:opacity-50 sm:col-span-2">{working ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />} Marcar como pedido</button>
            </div>
          </div>
        )}
      </InventoryPanel>

      <InventoryPanel title="Compras pendientes" description="Cuando llegue la mercancía, confirma cantidades y costo total.">
        {pendingOrders.length === 0 ? (
          <InventoryEmpty title="Nada pendiente por recibir" description="Las compras registradas aparecerán aquí." />
        ) : (
          <div className="divide-y divide-border/70">
            {pendingOrders.map((order) => {
              const lines = purchaseOrderLines.filter((line) => line.purchase_order_id === order.id);
              const remaining = lines.filter((line) => line.received_purchase_quantity < line.ordered_purchase_quantity);
              const estimated = lines.reduce((total, line) => total + line.ordered_purchase_quantity * line.expected_package_cost, 0);
              return (
                <div key={order.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"><PackageCheck size={18} /></span>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-heading text-sm font-bold">Compra #{order.number}</p><span className="rounded-full bg-surface-raised px-2 py-0.5 font-heading text-[10px] font-bold text-muted-foreground">{order.status === "partially_received" ? "Recepción parcial" : "En camino"}</span></div><p className="mt-1 truncate font-body text-xs text-muted-foreground">{order.supplier || "Proveedor sin definir"} · {remaining.map((line) => itemMap.get(line.inventory_item_id)?.name).filter(Boolean).slice(0, 3).join(", ")}</p><p className="mt-1 font-data text-xs font-bold text-foreground">{formatInventoryMoney(estimated)}</p></div>
              <button type="button" onClick={() => onReceive(order.id)} className="action-success inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold"><Check size={15} /> Recibir mercancía</button>
                </div>
              );
            })}
          </div>
        )}
      </InventoryPanel>
    </div>
  );
}
