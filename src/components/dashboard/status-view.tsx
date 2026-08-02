"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Flame,
  Hand,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentFlow, formatPaymentMoney } from "@/components/payments/payment-flow";
import { useOrderStore, type OrderWithItems } from "@/lib/stores";
import { useCashShiftStore } from "@/lib/stores";
import { formatOrderLocation } from "@/lib/order-location";
import type { PaymentReceipt } from "@/types/payments";

function formatTimeElapsed(dateString: string): string {
  const minutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  comedor: { label: "Comedor", className: "bg-brand-light text-brand" },
  domicilio: { label: "Domicilio", className: "bg-surface-raised text-muted-foreground" },
  para_llevar: { label: "Para llevar", className: "bg-surface-raised text-muted-foreground" },
};

interface StatusViewProps {
  onEditOrder?: (order: OrderWithItems) => void;
  onAddOrderForTable?: (tableId: string, tableNumber: string) => void;
}

function outstanding(order: OrderWithItems) {
  return Math.max(0, order.total - Number(order.paid_amount ?? 0));
}

export function StatusView({ onEditOrder }: StatusViewProps) {
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const lastError = useOrderStore((state) => state.lastError);
  const fetchActiveOrders = useOrderStore((state) => state.fetchActiveOrders);
  const markAsServed = useOrderStore((state) => state.markAsServed);
  const [, setTick] = useState(0);
  const [paymentOrders, setPaymentOrders] = useState<OrderWithItems[] | null>(null);
  const currentCashShift = useCashShiftStore((state) => state.currentShift);

  useEffect(() => {
    const interval = setInterval(() => setTick((current) => current + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const ready = activeOrders.filter((order) => order.status === "ready");
  const preparing = activeOrders.filter(
    (order) => order.status === "pending" || order.status === "in_kitchen"
  );

  async function handleDeliver(orderId: string, number: number) {
    const { error } = await markAsServed(orderId);
    if (error) toast.error("No se pudo marcar como entregado");
    else toast.success(`Pedido #${number} entregado`);
  }

  function openPayment(order: OrderWithItems) {
    if (!currentCashShift) {
      toast.error("Abre la caja antes de cobrar");
      return;
    }
    if (order.type !== "comedor" || (!order.table_id && !order.table_number)) {
      setPaymentOrders([order]);
      return;
    }
    const account = activeOrders.filter((candidate) => {
      const sameTable = order.table_id
        ? candidate.table_id === order.table_id
        : candidate.table_number === order.table_number;
      return sameTable && candidate.status !== "cancelled" && candidate.status !== "paid" && outstanding(candidate) > 0;
    });
    setPaymentOrders(account.length > 0 ? account : [order]);
  }

  async function handlePaymentCompleted(receipt: PaymentReceipt) {
    if (!paymentOrders || paymentOrders.length !== 1) return;
    const order = paymentOrders[0];
    if (order.type === "comedor" || order.status !== "ready") return;
    if (receipt.transaction.subtotal_amount + 0.001 < outstanding(order)) return;
    await handleDeliver(order.id, order.number);
  }

  return (
    <div className="pos-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
        {lastError ? (
          <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 p-4">
            <AlertCircle size={20} className="shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold">No se pudieron actualizar los pedidos</p>
              <p className="font-body text-xs text-muted-foreground">{lastError}</p>
            </div>
            <button type="button" onClick={() => void fetchActiveOrders()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/10">
              <RefreshCw size={14} />
              Reintentar
            </button>
          </div>
        ) : null}

        <StatusSection
          title="Listos para entregar"
          subtitle={`${ready.length} listo${ready.length !== 1 ? "s" : ""} · prioridad de entrega`}
          icon={<CheckCircle2 size={18} />}
          iconClassName="bg-success-light text-success"
          emptyIcon={<CheckCircle2 size={28} />}
          emptyText="No hay pedidos listos para entregar"
          orders={ready}
          onEditOrder={onEditOrder}
          onDeliver={handleDeliver}
          onPay={openPayment}
          ready
        />

        <StatusSection
          title="En preparación"
          subtitle={`${preparing.length} en cocina`}
          icon={<Flame size={18} />}
          iconClassName="bg-warning-light text-warning"
          emptyIcon={<ChefHat size={28} />}
          emptyText="Sin pedidos en preparación"
          orders={preparing}
          onEditOrder={onEditOrder}
        />
      </div>

      {paymentOrders ? (
        <PaymentFlow
          orders={paymentOrders}
          title={paymentOrders.length > 1 ? `Cuenta · ${formatOrderLocation(paymentOrders[0])}` : undefined}
          onClose={() => setPaymentOrders(null)}
          onCompleted={(receipt) => void handlePaymentCompleted(receipt)}
        />
      ) : null}
    </div>
  );
}

function StatusSection({
  title,
  subtitle,
  icon,
  iconClassName,
  emptyIcon,
  emptyText,
  orders,
  onEditOrder,
  onDeliver,
  onPay,
  ready = false,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconClassName: string;
  emptyIcon: ReactNode;
  emptyText: string;
  orders: OrderWithItems[];
  onEditOrder?: (order: OrderWithItems) => void;
  onDeliver?: (orderId: string, number: number) => void;
  onPay?: (order: OrderWithItems) => void;
  ready?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClassName}`}>{icon}</span>
        <div>
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <p className="font-body text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyBlock icon={emptyIcon} text={emptyText} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.map((order) => {
            const balance = outstanding(order);
            const isPaid = balance <= 0;
            const takeaway = order.type !== "comedor";
            return (
              <article key={order.id} className={`rounded-2xl bg-surface p-4 shadow-card ring-1 ${ready ? "ring-success/35" : order.status === "in_kitchen" ? "ring-warning/40" : "ring-border"}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-data text-2xl font-bold">#{order.number}</p>
                    <p className={`font-body text-xs ${ready ? "font-semibold text-success" : "text-muted-foreground"}`}>
                      {ready ? "Listo" : formatTimeElapsed(order.created_at)}
                      {ready ? ` · ${formatTimeElapsed(order.created_at)}` : ""}
                      {order.type === "comedor" ? ` · ${formatOrderLocation(order)}` : ""}
                      {order.customer_name ? ` · ${order.customer_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isPaid ? <span className="rounded-full bg-success-light px-2.5 py-1 font-heading text-[10px] font-bold text-success">Pagado</span> : null}
                    <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${TYPE_STYLES[order.type]?.className ?? TYPE_STYLES.comedor.className}`}>{TYPE_STYLES[order.type]?.label ?? "Comedor"}</span>
                    <button type="button" onClick={() => onEditOrder?.(order)} aria-label={`Editar pedido ${order.number}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-brand-light hover:text-brand"><Pencil size={15} /></button>
                  </div>
                </div>

                <ul className={`space-y-1 ${ready ? "mb-3" : ""}`}>
                  {order.items.map((item, index) => <li key={item.id || index} className="flex items-baseline gap-2"><span className="font-data text-xs font-bold text-brand">{item.quantity}x</span><span className="font-body text-sm">{item.menu_item_name}</span></li>)}
                </ul>

                {ready ? (
                  <div className={`mt-3 grid gap-2 ${isPaid ? "grid-cols-1" : "grid-cols-2"}`}>
                    <button type="button" onClick={() => onDeliver?.(order.id, order.number)} className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold ${takeaway && !isPaid ? "order-2 bg-surface-raised text-muted-foreground transition-colors hover:text-foreground" : "action-success"}`}>
                      <Hand size={14} />
                      Entregar
                    </button>
                    {!isPaid ? <button type="button" onClick={() => onPay?.(order)} className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold ${takeaway ? "action-success order-1" : "bg-ink text-white transition-colors hover:bg-ink/85"}`}><CreditCard size={14} />{takeaway ? "Cobrar y entregar" : `Cobrar ${formatPaymentMoney(balance)}`}</button> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyBlock({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface/70 px-6 py-12 text-center shadow-sm">
      <span className="text-muted-foreground/40">{icon}</span>
      <p className="font-heading text-sm font-semibold text-muted-foreground">{text}</p>
    </div>
  );
}
