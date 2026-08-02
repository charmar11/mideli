"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";
import type {
  InventoryCount,
  InventoryItem,
  InventoryLot,
  InventoryMovement,
  InventoryPurchaseOrder,
} from "@/types/database";
import { InventoryEmpty, InventoryPanel, formatInventoryMoney } from "./inventory-ui";

type InventoryView = "overview" | "items" | "purchase" | "count" | "movements";

function isCountOverdue(item: InventoryItem, now: number) {
  if (!item.last_counted_at) return true;
  const dueAt = new Date(item.last_counted_at).getTime() + item.count_frequency_days * 86400000;
  return dueAt <= now;
}

export function InventoryDashboard({
  items,
  lots,
  counts,
  purchaseOrders,
  movements,
  isAdmin,
  onNavigate,
  onCreateItem,
}: {
  items: InventoryItem[];
  lots: InventoryLot[];
  counts: InventoryCount[];
  purchaseOrders: InventoryPurchaseOrder[];
  movements: InventoryMovement[];
  isAdmin: boolean;
  onNavigate: (view: InventoryView) => void;
  onCreateItem: () => void;
}) {
  const [now] = useState(() => Date.now());
  const activeItems = items.filter((item) => item.is_active);
  const critical = activeItems.filter((item) => item.current_stock <= item.minimum_stock);
  const overdue = activeItems.filter((item) => isCountOverdue(item, now));
  const expiryLimit = now + 7 * 86400000;
  const expiring = lots.filter(
    (lot) =>
      lot.expires_on &&
      new Date(`${lot.expires_on}T23:59:59`).getTime() <= expiryLimit &&
      lot.quantity_remaining > 0
  );
  const pendingPurchases = purchaseOrders.filter((order) =>
    order.status === "ordered" || order.status === "partially_received"
  );
  const reviewCounts = counts.filter((count) => count.status === "submitted");
  const inventoryValue = activeItems.reduce(
    (total, item) => total + Math.max(item.current_stock, 0) * item.cost_per_unit,
    0
  );
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const wasteCost = movements
    .filter(
      (movement) =>
        ["waste", "damage", "expired"].includes(movement.movement_type) &&
        new Date(movement.created_at).getTime() >= monthStart.getTime()
    )
    .reduce((total, movement) => {
      const item = items.find((candidate) => candidate.id === movement.inventory_item_id);
      return total + Math.abs(movement.quantity_change) * (item?.cost_per_unit ?? 0);
    }, 0);

  const attentionCount = critical.length + expiring.length + reviewCounts.length;

  if (activeItems.length === 0) {
    return (
      <InventoryPanel title="Inventario listo para configurar">
        <InventoryEmpty
          title={isAdmin ? "Agrega tu primer insumo" : "Aún no hay insumos configurados"}
          description={
            isAdmin
              ? "Empieza con los productos más importantes: carne, arroz, aceite, bebidas y empaques."
              : "Administración debe registrar los insumos antes de iniciar conteos o recepciones."
          }
          action={
            isAdmin ? (
              <ActionButton label="Crear primer insumo" onClick={onCreateItem} />
            ) : undefined
          }
        />
      </InventoryPanel>
    );
  }

  return (
    <div className="space-y-4">
      <section
        className={`overflow-hidden rounded-2xl border ${
          attentionCount > 0
            ? "border-warning/35 bg-warning-light/50"
            : "border-success/25 bg-success/8"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              attentionCount > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
            }`}
          >
            {attentionCount > 0 ? <TriangleAlert size={21} /> : <CheckCircle2 size={21} />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-base font-bold text-foreground sm:text-lg">
              {attentionCount > 0
                ? `${attentionCount} ${attentionCount === 1 ? "tarea necesita" : "tareas necesitan"} atención`
                : "Inventario al día"}
            </h1>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              {attentionCount > 0
                ? "Resuelve primero agotados, caducidades y diferencias."
                : "No hay faltantes ni diferencias pendientes."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-current/10 bg-background/25">
          <CompactMetric label="Críticos" value={critical.length} tone={critical.length ? "warning" : "normal"} />
          <CompactMetric label="Por caducar" value={expiring.length} tone={expiring.length ? "danger" : "normal"} />
          <CompactMetric label="Por recibir" value={pendingPurchases.length} tone="normal" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <InventoryPanel title="Qué hacer ahora" description="Tareas ordenadas por impacto en el servicio.">
          {attentionCount === 0 && overdue.length === 0 && pendingPurchases.length === 0 ? (
            <InventoryEmpty
              title="Todo está bajo control"
              description="Puedes iniciar un conteo rápido para mantener las cifras actualizadas."
              action={<ActionButton label="Contar críticos" onClick={() => onNavigate("count")} />}
            />
          ) : (
            <div className="divide-y divide-border/70">
              {critical.length > 0 ? (
                <TaskRow
                  icon={<AlertTriangle size={18} />}
                  tone="warning"
                  title={`${critical.length} insumos bajos o agotados`}
                  description={critical.slice(0, 3).map((item) => item.name).join(", ")}
                  action="Preparar compra"
                  onClick={() => onNavigate("purchase")}
                />
              ) : null}
              {expiring.length > 0 ? (
                <TaskRow
                  icon={<CalendarClock size={18} />}
                  tone="danger"
                  title={`${expiring.length} lotes próximos a caducar`}
                  description="Revisa, utiliza primero o registra la merma."
                  action="Revisar lotes"
                  onClick={() => onNavigate("movements")}
                />
              ) : null}
              {overdue.length > 0 ? (
                <TaskRow
                  icon={<ClipboardCheck size={18} />}
                  title={`${overdue.length} insumos pendientes de conteo`}
                  description="Confirma las existencias físicas del local."
                  action="Iniciar conteo"
                  onClick={() => onNavigate("count")}
                />
              ) : null}
              {pendingPurchases.length > 0 ? (
                <TaskRow
                  icon={<PackageCheck size={18} />}
                  title={`${pendingPurchases.length} compras esperan recepción`}
                  description="Registra cantidades, costos y caducidades al llegar."
                  action="Recibir"
                  onClick={() => onNavigate("purchase")}
                />
              ) : null}
              {reviewCounts.length > 0 ? (
                <TaskRow
                  icon={<TriangleAlert size={18} />}
                  tone="danger"
                  title={`${reviewCounts.length} diferencias requieren revisión`}
                  description="El inventario ya refleja el conteo físico y conserva la diferencia."
                  action={isAdmin ? "Conciliar" : "Ver conteos"}
                  onClick={() => onNavigate("count")}
                />
              ) : null}
            </div>
          )}
        </InventoryPanel>

        <div className="space-y-4">
          <InventoryPanel title="Rutina sencilla">
            <div className="space-y-3 p-4">
              <Routine checked={critical.length === 0} label="Revisar insumos críticos" />
              <Routine checked={overdue.length === 0} label="Contar lo pendiente" />
              <Routine checked={expiring.length === 0} label="Revisar caducidades" />
              <button
                type="button"
                onClick={() => onNavigate("count")}
                className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand font-heading text-xs font-bold text-white hover:bg-brand-hover"
              >
                <ClipboardCheck size={15} /> Conteo rápido
              </button>
            </div>
          </InventoryPanel>

          {isAdmin ? (
            <InventoryPanel title="Dinero en inventario">
              <div className="grid grid-cols-2 divide-x divide-border/70 p-4">
                <div className="pr-3">
                  <p className="font-body text-[11px] text-muted-foreground">Existencia actual</p>
                  <p className="mt-1 font-data text-lg font-bold text-foreground">{formatInventoryMoney(inventoryValue)}</p>
                </div>
                <div className="pl-3">
                  <p className="font-body text-[11px] text-muted-foreground">Merma del mes</p>
                  <p className={`mt-1 font-data text-lg font-bold ${wasteCost > 0 ? "text-warning" : "text-foreground"}`}>
                    {formatInventoryMoney(wasteCost)}
                  </p>
                </div>
              </div>
            </InventoryPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompactMetric({ label, value, tone }: { label: string; value: number; tone: "normal" | "warning" | "danger" }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className={`font-data text-xl font-bold ${tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground"}`}>{value}</p>
      <p className="mt-0.5 truncate font-body text-[10px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function TaskRow({ icon, tone = "normal", title, description, action, onClick }: { icon: React.ReactNode; tone?: "normal" | "warning" | "danger"; title: string; description: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-raised/50 sm:px-5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === "warning" ? "bg-warning-light text-warning" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-brand-light text-brand"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">{description}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 font-heading text-[11px] font-bold text-brand sm:flex">{action}<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
      <ArrowRight size={16} className="shrink-0 text-muted-foreground sm:hidden" />
    </button>
  );
}

function Routine({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${checked ? "bg-success/12 text-success" : "bg-warning-light text-warning"}`}>
        {checked ? <CheckCircle2 size={15} /> : <ShoppingCart size={14} />}
      </span>
      <span className="font-body text-xs text-foreground">{label}</span>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="h-10 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white hover:bg-brand-hover">{label}</button>;
}
