"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Flame,
  Hand,
  Pencil,
  RefreshCw,
  Bike,
  Banknote,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentFlow, formatPaymentMoney } from "@/components/payments/payment-flow";
import { useOrderStore, type OrderWithItems } from "@/lib/stores";
import { useCashShiftStore } from "@/lib/stores";
import { formatOrderLocation } from "@/lib/order-location";
import type { PaymentReceipt } from "@/types/payments";
import {
  finalizeWhatsappDeliveryAction,
  getWhatsappDeliveryOperationsAction,
  markWhatsappDriverOnWayAction,
  notifyWhatsappOrderStatusAction,
  retryWhatsappNotificationAction,
  type WhatsappDeliveryOperationDetails,
} from "@/lib/actions/whatsapp-order-status";
import {
  deliveryLaneForOrder,
  shouldCompleteOrderAfterPayment,
} from "@/lib/whatsapp/delivery-lifecycle";

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

function paymentMethodLabel(method: OrderWithItems["payment_method_requested"]) {
  if (method === "efectivo") return "Efectivo";
  if (method === "tarjeta") return "Tarjeta";
  if (method === "transferencia") return "Transferencia";
  return "Por definir";
}

function formatDistance(distanceMeters: number | null | undefined) {
  if (distanceMeters === null || distanceMeters === undefined) return null;
  return distanceMeters < 1000
    ? `${distanceMeters} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function StatusView({ onEditOrder }: StatusViewProps) {
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const lastError = useOrderStore((state) => state.lastError);
  const fetchActiveOrders = useOrderStore((state) => state.fetchActiveOrders);
  const markAsServed = useOrderStore((state) => state.markAsServed);
  const [, setTick] = useState(0);
  const [paymentOrders, setPaymentOrders] = useState<OrderWithItems[] | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [deliveryDetails, setDeliveryDetails] = useState<
    Record<string, WhatsappDeliveryOperationDetails>
  >({});
  const currentCashShift = useCashShiftStore((state) => state.currentShift);

  useEffect(() => {
    const interval = setInterval(() => setTick((current) => current + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const ready = activeOrders.filter((order) => deliveryLaneForOrder(order) === "ready");
  const searchingDriver = activeOrders.filter(
    (order) => deliveryLaneForOrder(order) === "searching_driver"
  );
  const driverOnWay = activeOrders.filter(
    (order) => deliveryLaneForOrder(order) === "driver_on_way"
  );
  const preparing = activeOrders.filter(
    (order) => order.status === "pending" || order.status === "in_kitchen"
  );

  const deliveryOrderKey = useMemo(
    () =>
      activeOrders
        .filter(
          (order) =>
            order.status === "ready" &&
            order.source_channel === "whatsapp" &&
            order.type === "domicilio"
        )
        .map((order) => `${order.id}:${order.delivery_status ?? "pending"}`)
        .sort()
        .join(","),
    [activeOrders]
  );

  const loadDeliveryDetails = useCallback(async () => {
    const orderIds = deliveryOrderKey
      ? deliveryOrderKey.split(",").map((entry) => entry.split(":")[0])
      : [];
    if (orderIds.length === 0) return;
    const result = await getWhatsappDeliveryOperationsAction(orderIds);
    if (result.success) setDeliveryDetails(result.details);
  }, [deliveryOrderKey]);

  useEffect(() => {
    if (!deliveryOrderKey) return;
    let cancelled = false;
    const orderIds = deliveryOrderKey.split(",").map((entry) => entry.split(":")[0]);
    void getWhatsappDeliveryOperationsAction(orderIds).then((result) => {
      if (!cancelled && result.success) setDeliveryDetails(result.details);
    });
    return () => {
      cancelled = true;
    };
  }, [deliveryOrderKey]);

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
    await fetchActiveOrders();
    if (!shouldCompleteOrderAfterPayment(order)) return;
    if (receipt.transaction.subtotal_amount + 0.001 < outstanding(order)) return;
    await handleDeliver(order.id, order.number);
  }

  async function handleDriverOnWay(order: OrderWithItems) {
    setBusyOrderId(order.id);
    try {
      const result = await markWhatsappDriverOnWayAction(order.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const notificationReason = "reason" in result ? result.reason : undefined;
      if (result.sent) {
        toast.success(`Pedido #${order.number} en camino y cliente notificado`);
      } else if (notificationReason === "notifications_disabled") {
        toast.warning("Pedido en camino. Los avisos de WhatsApp están desactivados");
      } else if (notificationReason === "send_failed") {
        toast.warning("Pedido en camino. No se pudo avisar al cliente; puedes reintentar");
      } else {
        toast.info(`El pedido #${order.number} ya estaba actualizado`);
      }
      await fetchActiveOrders();
      await loadDeliveryDetails();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleStartDriverSearch(order: OrderWithItems) {
    setBusyOrderId(order.id);
    try {
      const result = await notifyWhatsappOrderStatusAction(order.id, "ready");
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.sent) toast.success("Búsqueda iniciada y cliente notificado");
      else if ("reason" in result && result.reason === "send_failed") {
        toast.warning("Búsqueda iniciada. No se pudo avisar al cliente");
      } else toast.info("Búsqueda de repartidor iniciada");
      await fetchActiveOrders();
      await loadDeliveryDetails();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleFinalizeDelivery(order: OrderWithItems) {
    if (!window.confirm(`¿Finalizar la entrega del pedido #${order.number}?`)) return;
    setBusyOrderId(order.id);
    try {
      const result = await finalizeWhatsappDeliveryAction(order.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Entrega del pedido #${order.number} finalizada`);
      await fetchActiveOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleRetryNotification(order: OrderWithItems, eventId: string) {
    setBusyOrderId(order.id);
    try {
      const result = await retryWhatsappNotificationAction(eventId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Aviso del pedido #${order.number} reenviado`);
      await loadDeliveryDetails();
    } finally {
      setBusyOrderId(null);
    }
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
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
          onRetryNotification={handleRetryNotification}
          deliveryDetails={deliveryDetails}
          busyOrderId={busyOrderId}
          ready
        />

        <StatusSection
          title="Buscando repartidor"
          subtitle={`${searchingDriver.length} pedido${searchingDriver.length !== 1 ? "s" : ""} por asignar`}
          icon={<Bike size={18} />}
          iconClassName="bg-warning-light text-warning"
          emptyIcon={<Bike size={28} />}
          emptyText="No hay domicilios buscando repartidor"
          orders={searchingDriver}
          onEditOrder={onEditOrder}
          onPay={openPayment}
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
          onRetryNotification={handleRetryNotification}
          deliveryDetails={deliveryDetails}
          busyOrderId={busyOrderId}
          ready
        />

        <StatusSection
          title="En camino"
          subtitle={`${driverOnWay.length} entrega${driverOnWay.length !== 1 ? "s" : ""} en trayecto`}
          icon={<Bike size={18} />}
          iconClassName="bg-success-light text-success"
          emptyIcon={<Bike size={28} />}
          emptyText="No hay pedidos en camino"
          orders={driverOnWay}
          onEditOrder={onEditOrder}
          onPay={openPayment}
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
          onRetryNotification={handleRetryNotification}
          deliveryDetails={deliveryDetails}
          busyOrderId={busyOrderId}
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
          deliveryDetails={deliveryDetails}
          busyOrderId={busyOrderId}
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
  onDriverOnWay,
  onStartDriverSearch,
  onFinalizeDelivery,
  onRetryNotification,
  deliveryDetails,
  busyOrderId,
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
  onDriverOnWay?: (order: OrderWithItems) => void;
  onStartDriverSearch?: (order: OrderWithItems) => void;
  onFinalizeDelivery?: (order: OrderWithItems) => void;
  onRetryNotification?: (order: OrderWithItems, eventId: string) => void;
  deliveryDetails: Record<string, WhatsappDeliveryOperationDetails>;
  busyOrderId: string | null;
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
            const isWhatsappDelivery =
              order.source_channel === "whatsapp" && order.type === "domicilio";
            const isBusy = busyOrderId === order.id;
            const details = deliveryDetails[order.id];
            const distance = formatDistance(details?.distanceMeters);
            const address = order.delivery_address?.trim() ?? "";
            const reference = order.delivery_reference?.trim() ?? "";
            const copyText = [address, reference ? `Referencia: ${reference}` : ""]
              .filter(Boolean)
              .join("\n");
            const mapHref = address
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
              : null;
            const requestedCash = Number(order.requested_cash_tendered ?? 0);
            const expectedChange = requestedCash > 0
              ? Math.max(0, requestedCash - order.total)
              : null;
            const failedNotification = details?.notification?.status === "failed"
              ? details.notification
              : null;
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

                {ready && isWhatsappDelivery ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-border bg-ink/45 p-3">
                    <div className="space-y-1.5 font-body text-xs">
                      <p className="font-heading font-bold text-cream">
                        {order.customer_name || "Cliente de WhatsApp"}
                      </p>
                      {order.customer_phone ? (
                        <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-cream">
                          <Phone size={13} /> {order.customer_phone}
                        </a>
                      ) : null}
                      <p className="flex items-start gap-1.5 text-muted-foreground">
                        <MapPin size={13} className="mt-0.5 shrink-0" />
                        <span>{address || "Domicilio no disponible"}</span>
                      </p>
                      {reference ? <p className="pl-[19px] text-muted-foreground">Referencia: {reference}</p> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-body text-xs">
                      <div className="rounded-lg bg-surface-raised p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reparto</p>
                        <p className="mt-1 font-data font-bold">{distance ?? "Distancia no disponible"}</p>
                        <p className="text-muted-foreground">Envío {formatPaymentMoney(Number(order.delivery_fee ?? 0))}</p>
                      </div>
                      <div className="rounded-lg bg-surface-raised p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cobro</p>
                        <p className="mt-1 font-heading font-bold">{paymentMethodLabel(order.payment_method_requested)}</p>
                        {requestedCash > 0 ? (
                          <p className="text-muted-foreground">
                            Recibe {formatPaymentMoney(requestedCash)}
                            {expectedChange ? ` · cambio ${formatPaymentMoney(expectedChange)}` : ""}
                          </p>
                        ) : (
                          <p className={isPaid ? "text-success" : "text-warning"}>
                            {isPaid ? "Pagado" : `Pendiente ${formatPaymentMoney(balance)}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {mapHref ? (
                        <a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-surface-raised font-heading text-xs font-bold text-cream hover:bg-border">
                          <ExternalLink size={13} /> Abrir Maps
                        </a>
                      ) : <span />}
                      <button
                        type="button"
                        disabled={!copyText}
                        onClick={() => {
                          void navigator.clipboard.writeText(copyText).then(
                            () => toast.success("Domicilio copiado"),
                            () => toast.error("No se pudo copiar el domicilio")
                          );
                        }}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-surface-raised font-heading text-xs font-bold text-cream hover:bg-border disabled:opacity-50"
                      >
                        <Copy size={13} /> Copiar
                      </button>
                    </div>

                    {failedNotification ? (
                      <p className="rounded-lg bg-destructive/10 p-2 font-body text-xs text-destructive">
                        El pedido avanzó, pero el aviso por WhatsApp falló.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {ready ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {isWhatsappDelivery ? (
                      <>
                        {order.delivery_status === "driver_on_way" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onFinalizeDelivery?.(order)}
                            className="action-success col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Finalizar entrega
                          </button>
                        ) : order.delivery_status === "searching_driver" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDriverOnWay?.(order)}
                            className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-warning/15 font-heading text-xs font-bold text-warning transition-colors hover:bg-warning/25 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Bike size={15} />}
                            Repartidor en camino
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onStartDriverSearch?.(order)}
                            className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-warning/15 font-heading text-xs font-bold text-warning transition-colors hover:bg-warning/25 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Bike size={15} />}
                            Iniciar búsqueda de repartidor
                          </button>
                        )}
                        {!isPaid ? (
                          <button type="button" disabled={isBusy} onClick={() => onPay?.(order)} className="col-span-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-ink font-heading text-xs font-bold text-white transition-colors hover:bg-ink/85 disabled:opacity-60">
                            <Banknote size={14} /> Cobrar {formatPaymentMoney(balance)}
                          </button>
                        ) : null}
                        {failedNotification ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onRetryNotification?.(order, failedNotification.id)}
                            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-destructive/40 font-heading text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                          >
                            <RefreshCw size={13} /> Reintentar aviso al cliente
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onDeliver?.(order.id, order.number)} className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold ${order.type === "para_llevar" && !isPaid ? "order-2 bg-surface-raised text-muted-foreground transition-colors hover:text-foreground" : "action-success"} ${isPaid ? "col-span-2" : ""}`}>
                          <Hand size={14} /> Entregar
                        </button>
                        {!isPaid ? (
                          <button type="button" onClick={() => onPay?.(order)} className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold ${order.type === "para_llevar" ? "action-success order-1" : "bg-ink text-white transition-colors hover:bg-ink/85"}`}>
                            <CreditCard size={14} />
                            {order.type === "para_llevar" ? "Cobrar y entregar" : `Cobrar ${formatPaymentMoney(balance)}`}
                          </button>
                        ) : null}
                      </>
                    )}
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
