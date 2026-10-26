"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  Ban,
  ExternalLink,
  Loader2,
  MessageCircle,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentFlow, formatPaymentMoney } from "@/components/payments/payment-flow";
import { useOrderStore, type OrderWithItems } from "@/lib/stores";
import { useCashShiftStore } from "@/lib/stores";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import { formatOrderLocation } from "@/lib/order-location";
import type { PaymentReceipt } from "@/types/payments";
import { formatPhoneForDisplay } from "@/lib/phone";
import {
  finalizeDeliveryAction,
  markDeliveryDriverOnWayAction,
  startDeliverySearchAction,
} from "@/lib/actions/delivery-status";
import {
  deliveryLaneForOrder,
  shouldCompleteOrderAfterPayment,
} from "@/lib/whatsapp/delivery-lifecycle";
import {
  getBusinessDeliveryOriginsForOrdersAction,
} from "@/lib/actions/business-delivery-settings";
import {
  googleMapsSearchUrl,
  type BusinessDeliveryOrigin,
} from "@/lib/business-delivery";
import {
  buildDeliveryDriverMessage,
  buildDeliveryDriverWhatsappHref,
} from "@/lib/delivery-driver-message";
import { handoffMarketplaceOrderAction } from "@/lib/actions/business-marketplace";
import {
  isLocalDeliveryOrder,
  isMarketplaceOrder,
  marketplaceCashDifference,
  marketplacePaymentLabel,
  marketplacePlatformLabel,
  parseMarketplaceCashAmount,
  shouldCollectMarketplaceCash,
} from "@/lib/marketplace-orders";
import {
  orderCustomerTotal,
  orderExternalDeliveryFee,
  orderProductsBalance,
  orderProductsTotal,
} from "@/lib/order-totals";
import { ORDER_TYPE_VISUALS } from "@/lib/order-visuals";
import {
  ALL_BUSINESSES_FILTER,
  BusinessScopeFilter,
} from "@/components/shared/business-scope-filter";
import {
  canManageOrderPreparation,
  filterOperationalOrdersByMembershipScope,
  getOrderReadableBusinessContexts,
} from "@/lib/multibusiness/business-context-selection";
import {
  areOrdersFromSameDiningTable,
  getBusinessTableAccountKey,
  getOpenOrdersForBusinessTableAccount,
  groupDiningOrdersByTable,
} from "@/lib/table-order-groups";

function formatTimeElapsed(dateString: string): string {
  const minutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  comedor: { label: "Comedor", className: ORDER_TYPE_VISUALS.comedor.badge },
  domicilio: { label: "Domicilio", className: ORDER_TYPE_VISUALS.domicilio.badge },
  para_llevar: { label: "Para llevar", className: ORDER_TYPE_VISUALS.para_llevar.badge },
};

interface StatusViewProps {
  onEditOrder?: (order: OrderWithItems) => void;
  onAddOrderForTable?: (tableId: string, tableNumber: string) => void;
}

function outstanding(order: OrderWithItems) {
  return orderProductsBalance(order);
}

function paymentMethodLabel(method: OrderWithItems["payment_method_requested"]) {
  if (method === "efectivo") return "Efectivo";
  if (method === "tarjeta") return "Tarjeta";
  if (method === "transferencia") return "Transferencia";
  return "Por definir";
}

function formatDistance(distanceMeters: number | null | undefined) {
  if (distanceMeters === null || distanceMeters === undefined || distanceMeters <= 0) return null;
  return distanceMeters < 1000
    ? `${distanceMeters} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function StatusView({ onEditOrder }: StatusViewProps) {
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const lastError = useOrderStore((state) => state.lastError);
  const fetchActiveOrders = useOrderStore((state) => state.fetchActiveOrders);
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const markAsServed = useOrderStore((state) => state.markAsServed);
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const [, setTick] = useState(0);
  const [paymentOrders, setPaymentOrders] = useState<OrderWithItems[] | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [marketplaceCashOrder, setMarketplaceCashOrder] = useState<OrderWithItems | null>(null);
  const [marketplaceCashInput, setMarketplaceCashInput] = useState("");
  const fetchCurrentShiftForBusiness = useCashShiftStore(
    (state) => state.fetchCurrentShiftForBusiness
  );
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedOrganizationId = useBusinessContextStore(
    (state) => state.selectedOrganizationId
  );
  const legacyBusinessContext = useBusinessContextStore(
    (state) => state.legacyFallback
  );
  const [deliveryOriginsState, setDeliveryOriginsState] = useState<{
    key: string;
    origins: Record<string, BusinessDeliveryOrigin>;
  }>({ key: "", origins: {} });
  const deliveryBusinessIdsKey = useMemo(
    () => [...new Set(activeOrders
      .filter((order) => order.type === "domicilio" && order.business_id)
      .map((order) => order.business_id as string))].sort().join(","),
    [activeOrders]
  );
  useEffect(() => {
    let cancelled = false;
    if (!deliveryBusinessIdsKey) return () => { cancelled = true; };
    void getBusinessDeliveryOriginsForOrdersAction(deliveryBusinessIdsKey.split(","))
      .then((result) => {
        if (cancelled) return;
        setDeliveryOriginsState({
          key: deliveryBusinessIdsKey,
          origins: result.success
            ? Object.fromEntries((result.data ?? []).map((origin) => [origin.businessId, origin]))
            : {},
        });
      })
      .catch(() => {
        if (!cancelled) setDeliveryOriginsState({ key: deliveryBusinessIdsKey, origins: {} });
      });
    return () => { cancelled = true; };
  }, [deliveryBusinessIdsKey]);
  const deliveryOrigins = deliveryOriginsState.key === deliveryBusinessIdsKey
    ? deliveryOriginsState.origins
    : {};
  const readableBusinesses = useMemo(
    () =>
      getOrderReadableBusinessContexts(
        businesses.filter(
          (business) => business.organization_id === selectedOrganizationId
        )
      ),
    [businesses, selectedOrganizationId]
  );
  const [businessFilter, setBusinessFilter] = useState(ALL_BUSINESSES_FILTER);

  const effectiveBusinessFilter =
    businessFilter === ALL_BUSINESSES_FILTER ||
    readableBusinesses.some((business) => business.business_id === businessFilter)
      ? businessFilter
      : ALL_BUSINESSES_FILTER;

  const operationalOrders = useMemo(
    () =>
      filterOperationalOrdersByMembershipScope(activeOrders, readableBusinesses),
    [activeOrders, readableBusinesses]
  );

  const visibleOrders = useMemo(
    () =>
      effectiveBusinessFilter === ALL_BUSINESSES_FILTER
        ? operationalOrders
        : operationalOrders.filter((order) => order.business_id === effectiveBusinessFilter),
    [operationalOrders, effectiveBusinessFilter]
  );

  useEffect(() => {
    const interval = setInterval(() => setTick((current) => current + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const ready = visibleOrders.filter((order) => deliveryLaneForOrder(order) === "ready");
  const searchingDriver = visibleOrders.filter(
    (order) => deliveryLaneForOrder(order) === "searching_driver"
  );
  const driverOnWay = visibleOrders.filter(
    (order) => deliveryLaneForOrder(order) === "driver_on_way"
  );
  const preparing = visibleOrders.filter(
    (order) => order.status === "pending" || order.status === "in_kitchen"
  );

  async function handleDeliver(orderId: string, number: number) {
    const { error } = await markAsServed(orderId);
    if (error) toast.error("No se pudo marcar como entregado");
    else toast.success(`Pedido #${number} entregado`);
  }

  async function openPayment(order: OrderWithItems) {
    try {
      const targetBusinessId = order.business_id ?? selectedBusinessId;
      const targetShift = await fetchCurrentShiftForBusiness(targetBusinessId);
      if (!targetShift) {
        toast.error("Abre la caja del negocio antes de cobrar");
        return;
      }
      if (order.type !== "comedor" || (!order.table_visit_id && !order.table_id && !order.table_number)) {
        setPaymentOrders([order]);
        return;
      }
      const account = getOpenOrdersForBusinessTableAccount(
        order,
        visibleOrders,
        (candidate) => outstanding(candidate) > 0
      );
      setPaymentOrders(account.length > 0 ? account : [order]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar el cobro");
    }
  }

  async function handleMarketplaceHandoff(order: OrderWithItems, cashReceived: number | null) {
    if (!order.business_id || !order.marketplace_platform) {
      toast.error("No se pudo identificar el negocio y la plataforma del pedido.");
      return;
    }
    setBusyOrderId(order.id);
    try {
      const result = await handoffMarketplaceOrderAction({
        businessId: order.business_id,
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
        cashReceived,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo registrar la entrega.");
        return;
      }
      setMarketplaceCashOrder(null);
      setMarketplaceCashInput("");
      toast.success(
        cashReceived === null
          ? `Pedido #${order.number} entregado al repartidor de ${marketplacePlatformLabel(result.data?.platform) ?? "la plataforma"}`
          : `Pedido #${order.number} entregado · ${formatPaymentMoney(cashReceived)} registrados en caja`,
      );
      await fetchActiveOrders();
    } catch {
      toast.error("No se pudo confirmar la entrega. Actualiza Estado antes de volver a intentarlo.");
    } finally {
      setBusyOrderId(null);
    }
  }

  function requestMarketplaceHandoff(order: OrderWithItems) {
    if (shouldCollectMarketplaceCash(order)) {
      setMarketplaceCashOrder(order);
      setMarketplaceCashInput("");
      return;
    }
    void handleMarketplaceHandoff(order, null);
  }

  function confirmMarketplaceCashHandoff() {
    if (!marketplaceCashOrder) return;
    const parsed = parseMarketplaceCashAmount(marketplaceCashInput);
    if (parsed.error || parsed.amount === null) {
      toast.error(parsed.error ?? "Escribe el efectivo recibido.");
      return;
    }
    void handleMarketplaceHandoff(marketplaceCashOrder, parsed.amount);
  }

  async function handleCancelOrder(order: OrderWithItems) {
    const paidAmount = Number(order.paid_amount ?? 0);
    if (paidAmount > 0 || order.payment_status === "partial" || order.payment_status === "paid") {
      toast.error("Primero debe corregirse o anularse el cobro de este pedido");
      return;
    }
    if (
      !window.confirm(
        `¿Cancelar el pedido #${order.number}? Se conservará en Historial como cancelado.`
      )
    ) {
      return;
    }

    setBusyOrderId(order.id);
    try {
      const result = await cancelOrder(order.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Pedido #${order.number} cancelado y conservado en Historial`);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handlePaymentCompleted(receipt: PaymentReceipt) {
    if (!paymentOrders || paymentOrders.length !== 1) return;
    const order = paymentOrders[0];
    await fetchActiveOrders();
    if (!shouldCompleteOrderAfterPayment(order)) return;
    if (receipt.transaction.subtotal_amount + 0.001 < outstanding(order)) return;
    await handleDeliver(order.id, order.number);
  }

  async function handlePreparationStatusChange(
    orderId: string,
    status: "in_kitchen" | "ready",
  ) {
    setBusyOrderId(orderId);
    try {
      const result = await updateOrderStatus(orderId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "in_kitchen" ? "Pedido en preparación" : "Pedido listo");
      await fetchActiveOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleDriverOnWay(order: OrderWithItems) {
    setBusyOrderId(order.id);
    try {
      const result = await markDeliveryDriverOnWayAction(order.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.stateChanged
        ? `Pedido #${order.number} en camino`
        : `El pedido #${order.number} ya estaba en camino`);
      await fetchActiveOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleStartDriverSearch(order: OrderWithItems) {
    setBusyOrderId(order.id);
    try {
      const result = await startDeliverySearchAction(order.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.stateChanged
        ? "Búsqueda de repartidor iniciada"
        : "El pedido ya está buscando repartidor");
      await fetchActiveOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleFinalizeDelivery(order: OrderWithItems) {
    if (!window.confirm(`¿Finalizar la entrega del pedido #${order.number}?`)) return;
    setBusyOrderId(order.id);
    try {
      const result = await finalizeDeliveryAction(order.id);
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

  return (
    <div className="mideli-page-scroll pos-scroll h-full min-w-0 touch-pan-y overscroll-y-contain overflow-x-hidden overflow-y-auto p-3 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-8">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-sm font-bold">Pedidos activos</p>
            <p className="font-body text-xs text-muted-foreground">
              Cada negocio conserva su propio estado y cobro.
            </p>
          </div>
          <BusinessScopeFilter
            businesses={readableBusinesses}
            value={effectiveBusinessFilter}
            onChange={setBusinessFilter}
          />
        </div>
        {lastError ? (
          <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 p-4">
            <AlertCircle size={20} className="shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold">No se pudieron actualizar los pedidos</p>
              <p className="font-body text-xs text-muted-foreground">{lastError}</p>
            </div>
            <button type="button" onClick={() => void fetchActiveOrders()} className="inline-flex h-11 shrink-0 touch-manipulation items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset hover:bg-destructive/10">
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
          ordersForPayment={visibleOrders}
          deliveryOrigins={deliveryOrigins}
          onEditOrder={onEditOrder}
          onCancelOrder={handleCancelOrder}
          legacyBusinessContext={legacyBusinessContext}
          onDeliver={handleDeliver}
          onPay={openPayment}
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
          onMarketplaceHandoff={requestMarketplaceHandoff}
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
          ordersForPayment={visibleOrders}
          deliveryOrigins={deliveryOrigins}
          onEditOrder={onEditOrder}
          onCancelOrder={handleCancelOrder}
          legacyBusinessContext={legacyBusinessContext}
          onPay={openPayment}
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
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
          ordersForPayment={visibleOrders}
          deliveryOrigins={deliveryOrigins}
          onEditOrder={onEditOrder}
          onCancelOrder={handleCancelOrder}
          legacyBusinessContext={legacyBusinessContext}
          onPay={openPayment}
          onDriverOnWay={handleDriverOnWay}
          onStartDriverSearch={handleStartDriverSearch}
          onFinalizeDelivery={handleFinalizeDelivery}
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
          ordersForPayment={visibleOrders}
          deliveryOrigins={deliveryOrigins}
          onEditOrder={onEditOrder}
          onCancelOrder={handleCancelOrder}
          legacyBusinessContext={legacyBusinessContext}
          busyOrderId={busyOrderId}
          onStartPreparation={(orderId) =>
            void handlePreparationStatusChange(orderId, "in_kitchen")
          }
          onMarkReady={(orderId) =>
            void handlePreparationStatusChange(orderId, "ready")
          }
        />
      </div>

      {paymentOrders ? (
        <PaymentFlow
          orders={paymentOrders}
          title={paymentOrders[0]?.type === "comedor" && (paymentOrders[0].table_visit_id || paymentOrders[0].table_id || paymentOrders[0].table_number)
            ? `Cuenta · ${formatOrderLocation(paymentOrders[0])} · ${businesses.find((business) => business.business_id === paymentOrders[0].business_id)?.business_display_name ?? "Negocio"}`
            : paymentOrders.length > 1
              ? `Cuenta · ${formatOrderLocation(paymentOrders[0])}`
              : undefined}
          onClose={() => setPaymentOrders(null)}
          onCompleted={(receipt) => void handlePaymentCompleted(receipt)}
        />
      ) : null}
      {marketplaceCashOrder ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/75 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="marketplace-cash-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-float sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-warning">Didi Food · efectivo</p>
                <h2 id="marketplace-cash-title" className="mt-1 font-heading text-lg font-bold">¿Cuánto efectivo recibiste?</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground">Pedido #{marketplaceCashOrder.number}. Anota el importe real que te entregó el repartidor.</p>
              </div>
              <button type="button" onClick={() => setMarketplaceCashOrder(null)} aria-label="Cerrar" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button>
            </div>
            <label className="mt-4 block font-heading text-xs font-bold text-muted-foreground">
              Efectivo recibido en caja
              <input autoFocus type="number" inputMode="numeric" min="0" max="1000000" step="1" value={marketplaceCashInput} onChange={(event) => setMarketplaceCashInput(event.target.value)} placeholder="Importe en pesos" className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 font-data text-lg text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            </label>
            {marketplaceCashInput && Number.isSafeInteger(Number(marketplaceCashInput)) ? (
              <p className="mt-2 font-body text-xs text-muted-foreground">Diferencia respecto al ticket: {formatPaymentMoney(marketplaceCashDifference(Number(marketplaceCashOrder.total), Number(marketplaceCashInput)))}</p>
            ) : null}
            <p className="mt-2 font-body text-[11px] leading-4 text-muted-foreground">Ese importe se suma una sola vez al efectivo esperado del corte de este negocio. No crea un cobro normal.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMarketplaceCashOrder(null)} disabled={busyOrderId === marketplaceCashOrder.id} className="min-h-11 rounded-xl border border-border font-heading text-xs font-bold">Cancelar</button>
              <button type="button" onClick={confirmMarketplaceCashHandoff} disabled={busyOrderId === marketplaceCashOrder.id || !marketplaceCashInput.trim()} className="action-success inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:opacity-55">{busyOrderId === marketplaceCashOrder.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Confirmar entrega</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

interface TablePaymentAccountSummary {
  key: string;
  businessId: string | null;
  order: OrderWithItems;
  orderCount: number;
  balance: number;
}

function getTablePaymentAccounts(
  tableOrders: OrderWithItems[],
  ordersForPayment: OrderWithItems[]
): TablePaymentAccountSummary[] {
  const accounts = new Map<string, TablePaymentAccountSummary>();

  for (const tableOrder of tableOrders) {
    const key = getBusinessTableAccountKey(tableOrder);
    if (accounts.has(key)) continue;

    const openOrders = getOpenOrdersForBusinessTableAccount(
      tableOrder,
      ordersForPayment,
      (candidate) => outstanding(candidate) > 0
    );
    if (openOrders.length === 0) continue;

    accounts.set(key, {
      key,
      businessId: tableOrder.business_id ?? null,
      order: openOrders[0],
      orderCount: openOrders.length,
      balance: openOrders.reduce((total, order) => total + outstanding(order), 0),
    });
  }

  return [...accounts.values()];
}

function StatusSection({
  title,
  subtitle,
  icon,
  iconClassName,
  emptyIcon,
  emptyText,
  orders,
  ordersForPayment,
  deliveryOrigins,
  onEditOrder,
  onCancelOrder,
  legacyBusinessContext,
  onDeliver,
  onPay,
  onDriverOnWay,
  onStartDriverSearch,
  onFinalizeDelivery,
  onMarketplaceHandoff,
  onStartPreparation,
  onMarkReady,
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
  ordersForPayment: OrderWithItems[];
  deliveryOrigins: Record<string, BusinessDeliveryOrigin>;
  onEditOrder?: (order: OrderWithItems) => void;
  onCancelOrder?: (order: OrderWithItems) => void;
  legacyBusinessContext: boolean;
  onDeliver?: (orderId: string, number: number) => void;
  onPay?: (order: OrderWithItems) => void;
  onDriverOnWay?: (order: OrderWithItems) => void;
  onStartDriverSearch?: (order: OrderWithItems) => void;
  onFinalizeDelivery?: (order: OrderWithItems) => void;
  onMarketplaceHandoff?: (order: OrderWithItems) => void;
  onStartPreparation?: (orderId: string) => void;
  onMarkReady?: (orderId: string) => void;
  busyOrderId: string | null;
  ready?: boolean;
}) {
  const businesses = useBusinessContextStore((state) => state.businesses);
  const businessNames = useMemo(
    () =>
      new Map(
        businesses.map((business) => [
          business.business_id,
          business.business_display_name,
        ])
      ),
    [businesses]
  );

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
          {groupDiningOrdersByTable(orders).map((group) => {
            const isTableGroup = group.kind === "table";
            const groupOrders = isTableGroup ? group.orders : [group.order];
            const paymentTableOrders = isTableGroup
              ? ordersForPayment.filter((order) =>
                  areOrdersFromSameDiningTable(groupOrders[0], order)
                )
              : [];
            const tablePaymentAccounts = isTableGroup && ready
              ? getTablePaymentAccounts(paymentTableOrders, ordersForPayment)
              : [];
            const groupedBusinessNames = isTableGroup
              ? [...new Set(groupOrders
                  .map((order) => businessNames.get(order.business_id ?? ""))
                  .filter((name): name is string => Boolean(name)))]
              : [];

            return (
              <div
                key={group.key}
                className={isTableGroup
                  ? "col-span-full rounded-2xl border border-brand/25 bg-surface/65 p-3 shadow-card sm:p-4"
                  : "contents"}
              >
                {isTableGroup ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
                    <div>
                      <h3 className="font-heading text-base font-bold text-cream">
                        {formatOrderLocation(groupOrders[0])}
                      </h3>
                      <p className="font-body text-xs text-muted-foreground">
                        {groupOrders.length} pedido{groupOrders.length === 1 ? "" : "s"} en esta etapa
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {groupedBusinessNames.map((businessName) => (
                        <span key={businessName} className="rounded-full bg-surface-raised px-2.5 py-1 font-heading text-[10px] font-bold text-muted-foreground">
                          {businessName}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className={isTableGroup ? "grid gap-3 sm:grid-cols-2" : "contents"}>
          {groupOrders.map((order) => {
            const balance = outstanding(order);
            const isMarketplace = isMarketplaceOrder(order);
            const isPaid = isMarketplace
              ? order.marketplace_payment_mode === "app"
              : balance <= 0;
            const isDelivery = isLocalDeliveryOrder(order);
            const isBusy = busyOrderId === order.id;
            const distance = formatDistance(Number(order.delivery_distance_meters ?? 0));
            const address = order.delivery_address?.trim() ?? "";
            const colony = order.delivery_colony?.trim() ?? "";
            const reference = order.delivery_reference?.trim() ?? "";
            const deliveryFee = orderExternalDeliveryFee(order);
            const customerTotal = orderCustomerTotal(order);
            const destinationMapHref = order.delivery_latitude !== null && order.delivery_latitude !== undefined && order.delivery_longitude !== null && order.delivery_longitude !== undefined
              ? `https://www.google.com/maps/search/?api=1&query=${order.delivery_latitude},${order.delivery_longitude}`
              : address
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, colony].filter(Boolean).join(", "))}`
                : null;
            const requestedCash = Number(order.requested_cash_tendered ?? 0);
            const expectedChange = requestedCash > 0
              ? Math.max(0, requestedCash - customerTotal)
              : null;
            const business = businesses.find(
              (candidate) => candidate.business_id === order.business_id,
            );
            const deliveryOrigin = order.business_id
              ? deliveryOrigins[order.business_id]
              : undefined;
            const hasConfiguredOrigin = Boolean(
              deliveryOrigin?.originAddress &&
              deliveryOrigin.originLatitude !== null &&
              deliveryOrigin.originLongitude !== null
            );
            const originMapHref = deliveryOrigin
              ? googleMapsSearchUrl({
                  latitude: deliveryOrigin.originLatitude,
                  longitude: deliveryOrigin.originLongitude,
                  address: deliveryOrigin.originAddress,
                })
              : null;
            const driverMessage = buildDeliveryDriverMessage({
              businessName: business?.business_display_name,
              orderNumber: order.number,
              customerName: order.customer_name,
              customerPhone: order.customer_phone,
              originAddress: deliveryOrigin?.originAddress ?? "",
              originMapHref,
              deliveryAddress: address,
              colony,
              destinationMapHref,
              paymentMethod: paymentMethodLabel(order.payment_method_requested),
              productAmount: formatPaymentMoney(orderProductsTotal(order)),
            });
            const whatsappShareHref = buildDeliveryDriverWhatsappHref(driverMessage);
            const canOperateOrderHere = legacyBusinessContext || Boolean(
              business?.capability_codes.includes("business.operate_orders") ||
              business?.capability_codes.includes("organization.operate_orders")
            );
            const canCancelOrder =
              canOperateOrderHere &&
              (!isMarketplace || !order.marketplace_handed_off_at) &&
              Number(order.paid_amount ?? 0) <= 0 &&
              order.payment_status !== "partial" &&
              order.payment_status !== "paid";
            const canManagePreparationHere = canManageOrderPreparation(business);
            const preparationStatusLabel =
              order.status === "pending"
                ? "Pendiente"
                : order.status === "in_kitchen"
                  ? "Preparando"
                  : "Listo";
            return (
              <article key={order.id} className={`rounded-2xl bg-surface p-4 shadow-card ring-1 ${ready ? "ring-success/35" : order.status === "in_kitchen" ? "ring-warning/40" : "ring-border"}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-data text-2xl font-bold">#{order.number}</p>
                    <p className={`font-body text-xs ${ready ? "font-semibold text-success" : "text-muted-foreground"}`}>
                      {ready
                        ? "Listo"
                        : `${preparationStatusLabel} · ${formatTimeElapsed(order.created_at)}`}
                      {ready ? ` · ${formatTimeElapsed(order.created_at)}` : ""}
                      {order.type === "comedor" ? ` · ${formatOrderLocation(order)}` : ""}
                      {order.customer_name ? ` · ${order.customer_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isMarketplace && order.marketplace_payment_mode === "app" ? (
                      <span className="rounded-full bg-success-light px-2.5 py-1 font-heading text-[10px] font-bold text-success">
                        Pagado en app
                      </span>
                    ) : !isMarketplace && isPaid ? (
                      <span className="rounded-full bg-success-light px-2.5 py-1 font-heading text-[10px] font-bold text-success">Pagado</span>
                    ) : null}
                    {order.business_id && businessNames.get(order.business_id) ? (
                      <span className="rounded-full bg-surface-raised px-2.5 py-1 font-heading text-[10px] font-bold text-muted-foreground">
                        {businessNames.get(order.business_id)}
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${TYPE_STYLES[order.type]?.className ?? TYPE_STYLES.comedor.className}`}>{TYPE_STYLES[order.type]?.label ?? "Comedor"}</span>
                    {isMarketplace ? (
                      <span className="rounded-full bg-warning/12 px-2.5 py-1 font-heading text-[10px] font-bold text-warning">
                        {marketplacePlatformLabel(order.marketplace_platform)}
                      </span>
                    ) : null}
                    {isMarketplace && order.marketplace_payment_mode === "cash" ? (
                      <span className="rounded-full bg-gold/12 px-2.5 py-1 font-heading text-[10px] font-bold text-gold">
                        {marketplacePaymentLabel(order.marketplace_platform, order.marketplace_payment_mode)}
                      </span>
                    ) : null}
                    {order.schedule_status === "scheduled" && order.scheduled_for ? (
                      <span className="rounded-full bg-gold/12 px-2.5 py-1 font-heading text-[10px] font-bold text-gold">
                        🕒 {new Intl.DateTimeFormat("es-MX", {
                          timeZone: business?.business_timezone ?? "America/Hermosillo",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(order.scheduled_for))}
                      </span>
                    ) : null}
                    {canOperateOrderHere && !isMarketplace ? (
                      <button type="button" onClick={() => void onEditOrder?.(order)} aria-label={`Editar pedido ${order.number}`} className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:bg-brand-light hover:text-brand"><Pencil size={15} /></button>
                    ) : null}
                    {canCancelOrder ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onCancelOrder?.(order)}
                        aria-label={`Cancelar pedido ${order.number}`}
                        title="Cancelar pedido y conservarlo en Historial"
                        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                      >
                        <Ban size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul className={`space-y-1 ${ready ? "mb-3" : ""}`}>
                  {order.items.map((item, index) => <li key={item.id || index} className="flex items-baseline gap-2"><span className="font-data text-xs font-bold text-brand">{item.quantity}x</span><span className="font-body text-sm">{item.menu_item_name}</span></li>)}
                </ul>

                {canManagePreparationHere && order.status === "pending" && onStartPreparation ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onStartPreparation(order.id)}
                    className="mt-3 inline-flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-warning/15 font-heading text-xs font-bold text-warning transition-colors hover:bg-warning/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Flame size={15} />}
                    Iniciar preparación
                  </button>
                ) : null}
                {canManagePreparationHere && order.status === "in_kitchen" && onMarkReady ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onMarkReady(order.id)}
                    className="mt-3 inline-flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-success/15 font-heading text-xs font-bold text-success transition-colors hover:bg-success/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Marcar listo
                  </button>
                ) : null}

                {ready && isDelivery ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-border bg-ink/45 p-3">
                    <div className="space-y-1.5 font-body text-xs">
                        <p className="font-heading font-bold text-cream">
                        {order.customer_name || "Cliente"}
                      </p>
                      {order.customer_phone ? (
                        <a href={`tel:+${order.customer_phone.replace(/^\+/, "")}`} className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-cream">
                          <Phone size={13} /> {formatPhoneForDisplay(order.customer_phone)}
                        </a>
                      ) : null}
                      <p className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
                        <MapPin size={13} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{address || "Domicilio no disponible"}</span>
                      </p>
                      <p className={`pl-[19px] font-heading text-xs font-bold ${colony ? "text-gold" : "text-warning"}`}>
                        🏘️ Colonia: {colony || "⚠️ No registrada"}
                      </p>
                      {reference ? <p className="pl-[19px] text-muted-foreground">Referencia: {reference}</p> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-body text-xs">
                      <div className="rounded-lg bg-surface-raised p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reparto</p>
                        <p className="mt-1 font-data font-bold">{distance ?? "Distancia no disponible"}</p>
                        <p className="text-muted-foreground">Envío externo {formatPaymentMoney(deliveryFee)} · lo cobra el repartidor</p>
                      </div>
                      <div className="rounded-lg bg-surface-raised p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cobro</p>
                        <p className="mt-1 font-heading font-bold">{paymentMethodLabel(order.payment_method_requested)}</p>
                        {requestedCash > 0 ? (
                          <p className="text-muted-foreground">
                            Cliente lleva {formatPaymentMoney(requestedCash)}
                            {expectedChange ? ` · cambio ${formatPaymentMoney(expectedChange)}` : ""}
                          </p>
                        ) : (
                          <p className={isPaid ? "text-success" : "text-warning"}>
                            {isPaid
                              ? order.payment_method === "transferencia"
                                ? "Productos pagados por transferencia"
                                : "Productos pagados"
                              : order.payment_method_requested === "transferencia"
                                ? "Transferencia indicada · verificar productos"
                                : `Pendiente productos ${formatPaymentMoney(balance)}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-2 font-body text-[11px] text-muted-foreground">
                      Total informativo del cliente: <span className="font-data font-bold text-cream">{formatPaymentMoney(customerTotal)}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {destinationMapHref ? (
                        <a href={destinationMapHref} target="_blank" rel="noreferrer" className="inline-flex h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg bg-surface-raised font-heading text-xs font-bold text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:bg-border">
                          <ExternalLink size={13} /> Abrir Maps
                        </a>
                      ) : null}
                      <a
                        href={whatsappShareHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasConfiguredOrigin || !originMapHref}
                        aria-label={`Compartir pedido ${order.number} con el repartidor por WhatsApp`}
                        title={hasConfiguredOrigin && originMapHref
                          ? "Abre WhatsApp con el mensaje listo para compartir manualmente"
                          : "Configura la dirección y ubicación del local en Control → Entregas"}
                        onClick={(event) => {
                          if (!hasConfiguredOrigin || !originMapHref) event.preventDefault();
                        }}
                        className={`inline-flex h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg font-heading text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset ${hasConfiguredOrigin && originMapHref ? "bg-success hover:bg-success/85" : "cursor-not-allowed bg-success/40"}`}
                      >
                        <MessageCircle size={13} />
                        {hasConfiguredOrigin && originMapHref
                          ? "Enviar a repartidor"
                          : "Configura origen del local"}
                      </a>
                    </div>
                  </div>
                ) : null}

                {ready ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {isMarketplace ? (
                      <button
                        type="button"
                        disabled={isBusy || !canOperateOrderHere}
                        onClick={() => onMarketplaceHandoff?.(order)}
                        className="action-success col-span-2 inline-flex h-12 touch-manipulation items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Hand size={15} />}
                        Entregado al repartidor de {marketplacePlatformLabel(order.marketplace_platform)}
                      </button>
                    ) : isDelivery && canOperateOrderHere ? (
                      <>
                        {order.delivery_status === "driver_on_way" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onFinalizeDelivery?.(order)}
                            className="action-success col-span-2 inline-flex h-12 touch-manipulation items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Finalizar entrega
                          </button>
                        ) : order.delivery_status === "searching_driver" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDriverOnWay?.(order)}
                            className="col-span-2 inline-flex h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-warning/15 font-heading text-xs font-bold text-warning transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-inset hover:bg-warning/25 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Bike size={15} />}
                            Repartidor en camino
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onStartDriverSearch?.(order)}
                            className="col-span-2 inline-flex h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-warning/15 font-heading text-xs font-bold text-warning transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-inset hover:bg-warning/25 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Bike size={15} />}
                            Iniciar búsqueda de repartidor
                          </button>
                        )}
                        {!isPaid ? (
                          <button type="button" disabled={isBusy} onClick={() => onPay?.(order)} className="col-span-2 inline-flex h-12 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-ink font-heading text-xs font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset hover:bg-ink/85 disabled:opacity-60">
                            <Banknote size={14} /> Cobrar productos {formatPaymentMoney(balance)}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onDeliver?.(order.id, order.number)} className={`inline-flex h-12 touch-manipulation items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${order.type === "para_llevar" && !isPaid ? "order-2 bg-surface-raised text-muted-foreground transition-colors hover:text-foreground" : "action-success"} ${isPaid ? "col-span-2" : ""}`}>
                          <Hand size={14} /> Entregar
                        </button>
                        {!isPaid && !isTableGroup ? (
                          <button type="button" onClick={() => onPay?.(order)} className={`inline-flex h-12 touch-manipulation items-center justify-center gap-1.5 rounded-xl font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset ${order.type === "para_llevar" ? "action-success order-1" : "bg-ink text-white transition-colors hover:bg-ink/85"}`}>
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

                {isTableGroup && ready && onPay && tablePaymentAccounts.length > 0 ? (
                  <div className="mt-3 border-t border-border/80 pt-3">
                    <p className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Cobro por negocio
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tablePaymentAccounts.map((account) => {
                        const businessName = account.businessId
                          ? businessNames.get(account.businessId)
                          : null;
                        const tableName = formatOrderLocation(groupOrders[0]);

                        return (
                          <button
                            key={account.key}
                            type="button"
                            disabled={busyOrderId === account.order.id}
                            onClick={() => onPay(account.order)}
                            aria-label={`Cobrar ${tableName} de ${businessName ?? "este negocio"}, ${formatPaymentMoney(account.balance)}`}
                            className="action-success inline-flex min-h-12 touch-manipulation items-center justify-between gap-3 rounded-xl px-3 py-2 text-left font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60 disabled:cursor-wait disabled:opacity-55"
                          >
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <Banknote size={16} className="shrink-0" />
                              <span className="min-w-0">
                                <span className="block">Cobrar mesa · {businessName ?? "Negocio"}</span>
                                <span className="block font-body text-[10px] font-medium opacity-80">
                                  {account.orderCount} pedido{account.orderCount === 1 ? "" : "s"} con saldo
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 font-data text-sm">{formatPaymentMoney(account.balance)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
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
