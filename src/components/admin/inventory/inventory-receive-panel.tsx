"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Calendar, Check, Loader2, PackageCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore, type ReceiptDraftLine } from "@/lib/stores/inventory-store";
import type { InventoryItem, InventoryPurchaseOrder, InventoryPurchaseOrderLine } from "@/types/database";
import { InventoryEmpty, InventoryPanel, formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";

type ReceiptRow = {
  key: string;
  purchaseOrderLineId: string | null;
  inventoryItemId: string;
  packageQuantity: string;
  totalCost: string;
  expiresOn: string;
  location: string;
  updateReferencePrice: boolean;
};

export function InventoryReceivePanel({
  items,
  purchaseOrders,
  purchaseOrderLines,
  selectedPurchaseOrderId,
  onSelectedPurchaseOrderChange,
  onBack,
}: {
  items: InventoryItem[];
  purchaseOrders: InventoryPurchaseOrder[];
  purchaseOrderLines: InventoryPurchaseOrderLine[];
  selectedPurchaseOrderId: string | null;
  onSelectedPurchaseOrderChange: (id: string | null) => void;
  onBack: () => void;
}) {
  const receiveInventory = useInventoryStore((state) => state.receiveInventory);
  const pendingOrders = purchaseOrders.filter(
    (order) => order.status === "ordered" || order.status === "partially_received"
  );
  const selectedOrder = pendingOrders.find((order) => order.id === selectedPurchaseOrderId) ?? null;
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [rows, setRows] = useState<ReceiptRow[]>(() => {
    if (!selectedOrder) return [];
    return purchaseOrderLines
      .filter((line) => line.purchase_order_id === selectedOrder.id && line.received_purchase_quantity < line.ordered_purchase_quantity)
      .map((line) => {
        const item = itemMap.get(line.inventory_item_id);
        const remaining = Math.max(line.ordered_purchase_quantity - line.received_purchase_quantity, 0);
        return {
          key: line.id,
          purchaseOrderLineId: line.id,
          inventoryItemId: line.inventory_item_id,
          packageQuantity: String(remaining),
          totalCost: String(remaining * (line.expected_package_cost || item?.last_purchase_package_cost || 0)),
          expiresOn: "",
          location: item?.storage_location ?? "",
          updateReferencePrice: true,
        };
      });
  });
  const [supplier, setSupplier] = useState(selectedOrder?.supplier ?? "");
  const [notes, setNotes] = useState("");
  const [itemToAdd, setItemToAdd] = useState("");
  const [working, setWorking] = useState(false);

  function addManualItem() {
    const item = itemMap.get(itemToAdd);
    if (!item || rows.some((row) => row.inventoryItemId === item.id)) return;
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        purchaseOrderLineId: null,
        inventoryItemId: item.id,
        packageQuantity: "",
        totalCost: String(item.last_purchase_package_cost || 0),
        expiresOn: "",
        location: item.storage_location,
        updateReferencePrice: true,
      },
    ]);
    setItemToAdd("");
  }

  function updateRow(key: string, updates: Partial<ReceiptRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...updates } : row)));
  }

  async function receive() {
    const validRows = rows.filter((row) => Number(row.packageQuantity) > 0);
    if (validRows.length === 0) {
      toast.error("Captura al menos una cantidad recibida");
      return;
    }
    if (validRows.some((row) => Number(row.totalCost) < 0 || !Number.isFinite(Number(row.totalCost)))) {
      toast.error("Revisa los costos totales");
      return;
    }
    const missingExpiry = validRows.find((row) => itemMap.get(row.inventoryItemId)?.tracks_expiry && !row.expiresOn);
    if (missingExpiry) {
      toast.error(`Captura la caducidad de ${itemMap.get(missingExpiry.inventoryItemId)?.name}`);
      return;
    }
    if (selectedOrder) {
      const exceeds = validRows.some((row) => {
        const line = purchaseOrderLines.find((candidate) => candidate.id === row.purchaseOrderLineId);
        if (!line) return false;
        return Number(row.packageQuantity) > line.ordered_purchase_quantity - line.received_purchase_quantity;
      });
      if (exceeds && !window.confirm("La cantidad supera lo pendiente de la compra. ¿Confirmar la recepción de más mercancía?")) return;
    }

    const lines: ReceiptDraftLine[] = validRows.map((row) => ({
      purchase_order_line_id: row.purchaseOrderLineId,
      inventory_item_id: row.inventoryItemId,
      received_purchase_quantity: Number(row.packageQuantity),
      total_cost: Number(row.totalCost),
      expires_on: row.expiresOn || null,
      storage_location: row.location.trim(),
      update_reference_price: row.updateReferencePrice,
    }));

    setWorking(true);
    const result = await receiveInventory(selectedOrder?.id ?? null, supplier.trim(), lines, notes.trim());
    setWorking(false);
    if (result.error) {
      toast.error("No se pudo recibir la mercancía", { description: result.error });
      return;
    }
    toast.success("Mercancía recibida", { description: "Existencias y costos quedaron actualizados." });
    onSelectedPurchaseOrderChange(null);
    onBack();
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Volver a compras</button>

      <InventoryPanel title="Entrada de inventario" description="Confirma lo que realmente llegó y cuánto pagaste.">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Compra relacionada</span><select value={selectedPurchaseOrderId ?? "manual"} onChange={(event) => onSelectedPurchaseOrderChange(event.target.value === "manual" ? null : event.target.value)} className="form-input"><option value="manual">Entrada sin pedido previo</option>{pendingOrders.map((order) => <option key={order.id} value={order.id}>Compra #{order.number} · {order.supplier || "Sin proveedor"}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Proveedor</span><input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nombre del proveedor" className="form-input" /></label>
        </div>
      </InventoryPanel>

      {!selectedOrder ? (
        <InventoryPanel title="Agregar insumos recibidos">
          <div className="flex flex-col gap-2 p-4 sm:flex-row sm:p-5">
            <select value={itemToAdd} onChange={(event) => setItemToAdd(event.target.value)} className="form-input min-w-0 flex-1"><option value="">Seleccionar insumo</option>{items.filter((item) => item.is_active && !rows.some((row) => row.inventoryItemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button type="button" disabled={!itemToAdd} onClick={addManualItem} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white disabled:opacity-40"><Plus size={15} /> Agregar</button>
          </div>
        </InventoryPanel>
      ) : null}

      <InventoryPanel title={selectedOrder ? `Compra #${selectedOrder.number}` : "Mercancía recibida"} description={selectedOrder ? "Puedes registrar una entrega parcial si no llegó todo." : "Agrega solamente lo que tienes físicamente enfrente."}>
        {rows.length === 0 ? (
          <InventoryEmpty title="No hay insumos para recibir" description={selectedOrder ? "Esta compra ya fue recibida por completo." : "Selecciona un insumo para comenzar."} />
        ) : (
          <div className="divide-y divide-border/70">
            {rows.map((row) => {
              const item = itemMap.get(row.inventoryItemId);
              if (!item) return null;
              const packageQuantity = Math.max(0, Number(row.packageQuantity) || 0);
              const totalCost = Math.max(0, Number(row.totalCost) || 0);
              const baseQuantity = packageQuantity * item.purchase_conversion_factor;
              const incomingUnitCost = baseQuantity > 0 ? totalCost / baseQuantity : 0;
              const newAverage = item.current_stock > 0 && baseQuantity > 0
                ? ((item.current_stock * item.cost_per_unit) + totalCost) / (item.current_stock + baseQuantity)
                : incomingUnitCost;
              return (
                <div key={row.key} className="p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div><h3 className="font-heading text-sm font-bold">{item.name}</h3><p className="mt-1 font-body text-xs text-muted-foreground">Hay {formatInventoryNumber(item.current_stock)} {item.unit} · 1 {item.purchase_unit} contiene {formatInventoryNumber(item.purchase_conversion_factor)} {item.unit}</p></div>
                    {!selectedOrder ? <button type="button" onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))} aria-label={`Quitar ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block font-heading text-[11px] font-bold text-muted-foreground">Cantidad recibida ({item.purchase_unit})</span><input type="number" min="0.0001" step="0.0001" value={row.packageQuantity} onChange={(event) => updateRow(row.key, { packageQuantity: event.target.value })} placeholder="Ej. 2" className="form-input" /></label>
                    <label className="block"><span className="mb-1.5 block font-heading text-[11px] font-bold text-muted-foreground">Costo total de esta entrega</span><input type="number" min="0" step="0.01" value={row.totalCost} onChange={(event) => updateRow(row.key, { totalCost: event.target.value })} placeholder="Ej. 1000" className="form-input" /></label>
                    <label className="block"><span className="mb-1.5 flex items-center gap-1 font-heading text-[11px] font-bold text-muted-foreground"><Calendar size={12} /> Caducidad {item.tracks_expiry ? "obligatoria" : "opcional"}</span><input type="date" required={item.tracks_expiry} value={row.expiresOn} onChange={(event) => updateRow(row.key, { expiresOn: event.target.value })} className="form-input" /></label>
                    <label className="block"><span className="mb-1.5 block font-heading text-[11px] font-bold text-muted-foreground">Dónde se guardó</span><input value={row.location} onChange={(event) => updateRow(row.key, { location: event.target.value })} placeholder="Refrigerador, almacén" className="form-input" /></label>
                  </div>

                  <div className="mt-4 grid gap-2 rounded-2xl border border-gold/25 bg-gold/8 p-4 sm:grid-cols-3">
                    <Preview label="Se agregarán" value={`${formatInventoryNumber(baseQuantity)} ${item.unit}`} />
                    <Preview label="Costo por unidad" value={formatInventoryMoney(incomingUnitCost)} />
                    <Preview label="Nuevo costo promedio" value={formatInventoryMoney(newAverage)} />
                  </div>
                  <button type="button" role="checkbox" aria-checked={row.updateReferencePrice} onClick={() => updateRow(row.key, { updateReferencePrice: !row.updateReferencePrice })} className="mt-3 inline-flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-background px-3 text-left sm:w-auto">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${row.updateReferencePrice ? "bg-brand text-white" : "bg-surface-raised text-transparent"}`}><Check size={14} /></span>
                    <span className="font-body text-xs text-foreground">Actualizar el precio habitual de {item.purchase_unit}</span>
                  </button>
                </div>
              );
            })}
            <div className="grid gap-3 bg-background/30 p-4 sm:p-5">
              <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Observación opcional</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Faltó una caja o cambió el precio" className="form-input" /></label>
        <button type="button" disabled={working} onClick={() => void receive()} className="action-success inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">{working ? <Loader2 size={17} className="animate-spin" /> : <PackageCheck size={17} />} Confirmar recepción</button>
            </div>
          </div>
        )}
      </InventoryPanel>
    </div>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return <div><p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-data text-sm font-bold text-foreground">{value}</p></div>;
}
