"use client";

import { useMemo, useState } from "react";
import { CalendarClock, History, Loader2, PackageMinus, Search } from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/stores/inventory-store";
import type { InventoryItem, InventoryLot, InventoryMovement, InventoryMovementType } from "@/types/database";
import { InventoryEmpty, InventoryPanel, formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";

const LOSS_OPTIONS: Array<{
  value: Extract<InventoryMovementType, "waste" | "expired" | "damage" | "internal_use">;
  label: string;
}> = [
  { value: "waste", label: "Merma de preparación" },
  { value: "expired", label: "Producto caducado" },
  { value: "damage", label: "Producto dañado" },
  { value: "internal_use", label: "Consumo interno" },
];

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  purchase: "Entrada",
  adjustment: "Ajuste",
  consumption: "Venta",
  return: "Devolución",
  waste: "Merma",
  count_correction: "Corrección de conteo",
  internal_use: "Uso interno",
  damage: "Daño",
  expired: "Caducidad",
};

export function InventoryMovementsPanel({
  items,
  lots,
  movements,
  isAdmin,
}: {
  items: InventoryItem[];
  lots: InventoryLot[];
  movements: InventoryMovement[];
  isAdmin: boolean;
}) {
  const { recordMovement } = useInventoryStore();
  const [itemId, setItemId] = useState("");
  const [lossType, setLossType] = useState<(typeof LOSS_OPTIONS)[number]["value"]>("waste");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const activeItems = items.filter((item) => item.is_active);
  const expiringLots = lots
    .filter((lot) => lot.expires_on)
    .toSorted((a, b) => String(a.expires_on).localeCompare(String(b.expires_on)));
  const filteredMovements = movements.filter((movement) => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    const item = itemMap.get(movement.inventory_item_id);
    return !query || item?.name.toLocaleLowerCase("es-MX").includes(query) || MOVEMENT_LABELS[movement.movement_type].toLocaleLowerCase("es-MX").includes(query) || movement.reference_label.toLocaleLowerCase("es-MX").includes(query);
  });

  async function submitLoss() {
    const numericAmount = Number(amount);
    if (!itemId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Selecciona un insumo y escribe una cantidad");
      return;
    }
    setSaving(true);
    const result = await recordMovement(
      itemId,
      -numericAmount,
      lossType,
      lossType,
      note.trim() || LOSS_OPTIONS.find((option) => option.value === lossType)?.label || "Salida"
    );
    setSaving(false);
    if (result.error) {
      toast.error("No se pudo registrar la salida", { description: result.error });
      return;
    }
    toast.success("Salida registrada");
    setAmount("");
    setNote("");
  }

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <InventoryPanel title="Salida o merma" description="Registra de inmediato lo que se dañó, caducó o se usó fuera de una venta.">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            <label className="block lg:col-span-2"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Insumo</span><select value={itemId} onChange={(event) => setItemId(event.target.value)} className="form-input"><option value="">Seleccionar insumo</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatInventoryNumber(item.current_stock)} {item.unit}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Motivo</span><select value={lossType} onChange={(event) => setLossType(event.target.value as typeof lossType)} className="form-input">{LOSS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Cantidad</span><input type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="form-input" /></label>
            <label className="block sm:col-span-2 lg:col-span-3"><span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Qué ocurrió</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Producto dañado durante preparación" className="form-input" /></label>
        <button type="button" disabled={saving} onClick={() => void submitLoss()} className="action-warning inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl px-4 font-heading text-xs font-bold disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <PackageMinus size={16} />} Registrar salida</button>
          </div>
        </InventoryPanel>
      ) : null}

      {expiringLots.length > 0 ? (
        <InventoryPanel title="Próximas caducidades" description="Usa primero la mercancía con fecha más cercana.">
          <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
            {expiringLots.slice(0, 9).map((lot) => {
              const item = itemMap.get(lot.inventory_item_id);
              return (
                <div key={lot.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-warning"><CalendarClock size={15} /><p className="truncate font-heading text-xs font-bold text-foreground">{item?.name ?? "Insumo"}</p></div>
                  <p className="mt-2 font-data text-sm font-bold text-foreground">{formatInventoryNumber(lot.quantity_remaining)} {item?.unit ?? ""}</p>
                  <p className="mt-1 font-body text-[11px] text-muted-foreground">Caduca {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(`${lot.expires_on}T12:00:00`))}</p>
                </div>
              );
            })}
          </div>
        </InventoryPanel>
      ) : null}

      <InventoryPanel title="Historial de movimientos" description="Entradas, ventas, devoluciones, conteos y mermas con trazabilidad.">
        <div className="border-b border-border/70 p-3 sm:p-4">
          <div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por insumo, tipo o referencia" className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none placeholder:text-muted-foreground" />
          </div>
        </div>
        {filteredMovements.length === 0 ? (
          <InventoryEmpty title="Todavía no hay movimientos" description="Las compras, ventas, conteos y mermas aparecerán aquí." />
        ) : (
          <div className="divide-y divide-border/70">
            {filteredMovements.map((movement) => {
              const item = itemMap.get(movement.inventory_item_id);
              const positive = movement.quantity_change > 0;
              return (
                <div key={movement.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_9rem_8rem] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><History size={14} className="shrink-0 text-muted-foreground" /><p className="truncate font-heading text-xs font-bold text-foreground">{item?.name ?? "Insumo eliminado"}</p></div>
                    <p className="mt-1 truncate font-body text-[11px] text-muted-foreground">{MOVEMENT_LABELS[movement.movement_type]}{movement.reference_label ? ` · ${movement.reference_label}` : ""}</p>
                  </div>
                  <div>
                    <p className={`font-data text-sm font-bold ${positive ? "text-success" : "text-warning"}`}>{positive ? "+" : ""}{formatInventoryNumber(movement.quantity_change)} {item?.unit ?? ""}</p>
                    {movement.unit_cost_snapshot !== null ? <p className="mt-0.5 font-body text-[10px] text-muted-foreground">{formatInventoryMoney(Math.abs(movement.quantity_change) * movement.unit_cost_snapshot)}</p> : null}
                  </div>
                  <time className="font-body text-[11px] text-muted-foreground sm:text-right" dateTime={movement.created_at}>{new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.created_at))}</time>
                </div>
              );
            })}
          </div>
        )}
      </InventoryPanel>
    </div>
  );
}
