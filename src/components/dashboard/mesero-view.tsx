"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  History as HistoryIcon,
  ShoppingBag,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  useCatalogStore,
  useCashShiftStore,
  useCartStore,
  useOrderStore,
  useTableStore,
} from "@/lib/stores";
import type { OrderWithItems } from "@/lib/stores/order-store";
import { CategoryTabs, ProductGrid, CartPanel } from "@/components/pos";
import { OrderDetailsModal } from "@/components/pos/order-details-modal";
import type { MenuItem, SelectedModifier } from "@/types/database";
import { ReadyOrderNotifier } from "./ready-order-notifier";
import { PushNotificationControl } from "./push-notification-control";
import { CashShiftControl } from "@/components/cash/cash-shift-control";
import {
  ensurePosCustomerAction,
  getWhatsappPosDraftAction,
} from "@/lib/actions/whatsapp";
import { quoteManualDeliveryAction } from "@/lib/actions/delivery";
import type {
  PosCustomerMatch,
  WhatsappCustomerAddress,
  WhatsappPosDraft,
} from "@/lib/whatsapp/admin-types";
import { searchPosCustomersByPhoneAction } from "@/lib/actions/whatsapp";
import { distanceMetersToKilometers, normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";

const StatusView = dynamic(
  () => import("./status-view").then((module) => module.StatusView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center font-body text-sm text-muted-foreground">
        Cargando estado...
      </div>
    ),
  }
);

const SalesHistory = dynamic(
  () => import("./sales-history").then((module) => module.SalesHistory),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center font-body text-sm text-muted-foreground">
        Cargando historial...
      </div>
    ),
  }
);

const VariationModal = dynamic(
  () =>
    import("@/components/modals/variation-modal").then(
      (module) => module.VariationModal
    ),
  { ssr: false }
);

const PaymentFlow = dynamic(
  () =>
    import("@/components/payments/payment-flow").then(
      (module) => module.PaymentFlow
    ),
  { ssr: false }
);

export function MeseroView() {
  const [mode, setMode] = useState<"pos" | "status" | "history">("pos");
  const [orderType, setOrderType] = useState<"comedor" | "domicilio" | "para_llevar">("comedor");
  const [tableNumber, setTableNumber] = useState("");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsappStatusOptIn, setWhatsappStatusOptIn] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [whatsappConversationId, setWhatsappConversationId] = useState<string | null>(null);
  const [customerMatches, setCustomerMatches] = useState<PosCustomerMatch[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState({ latitude: null as number | null, longitude: null as number | null });
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [variationItem, setVariationItem] = useState<MenuItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [deliveryCashTendered, setDeliveryCashTendered] = useState<number | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<number | null>(null);
  const [createdOrderForPayment, setCreatedOrderForPayment] = useState<OrderWithItems | null>(null);
  const [addedProduct, setAddedProduct] = useState<{ id: string; token: number } | null>(null);
  const [addedAnnouncement, setAddedAnnouncement] = useState("");
  const addedFeedbackTimerRef = useRef<number | null>(null);

  const fetchCatalog = useCatalogStore((state) => state.fetchCatalog);
  const subscribeToCatalog = useCatalogStore((state) => state.subscribeToCatalog);
  const menuItems = useCatalogStore((state) => state.menuItems);
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clear = useCartStore((state) => state.clear);
  const setCartItems = useCartStore((state) => state.setItems);
  const getItemCount = useCartStore((state) => state.getItemCount);
  const getTotal = useCartStore((state) => state.getTotal);
    const zones = useTableStore((state) => state.zones);
    const tables = useTableStore((state) => state.tables);
    const labels = useTableStore((state) => state.labels);
  const fetchTables = useTableStore((state) => state.fetchTables);
  const createOrder = useOrderStore((state) => state.createOrder);
  const updateOrderWithItems = useOrderStore((state) => state.updateOrderWithItems);
  const fetchActiveOrders = useOrderStore((state) => state.fetchActiveOrders);
  const subscribeToOrders = useOrderStore((state) => state.subscribeToOrders);
  const setMenuItemsMap = useOrderStore((state) => state.setMenuItemsMap);
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const currentCashShift = useCashShiftStore((state) => state.currentShift);

  const cartItemCount = getItemCount();
  const cartTotal = getTotal();
  const readyCount = activeOrders.filter((o) => o.status === "ready").length;

  async function handleQuoteDelivery() {
    if (deliveryAddress.trim().length < 8 || deliveryQuoteLoading) return;
    setDeliveryQuoteLoading(true);
    const result = await quoteManualDeliveryAction(deliveryAddress);
    setDeliveryQuoteLoading(false);
    if (!result.success) {
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      toast.error(result.error);
      return;
    }
    setDeliveryAddress(result.quote.formattedAddress);
    setDeliveryFee(result.quote.totalFee);
    setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
    setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
    setDeliveryConfirmed(true);
    toast.success(`Domicilio confirmado · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee}`);
  }

  function handleCustomerPhoneChange(value: string) {
    setCustomerPhone(value);
    const digits = value.replace(/\D/g, "");
    const selected = customerMatches.find((customer) => customer.id === customerId);
    if (selected && selected.phone !== digits) setCustomerId(null);
    if (digits.length < 4) {
      setCustomerMatches([]);
      setCustomerSearchLoading(false);
    }
  }

  function handleSelectCustomer(customer: PosCustomerMatch) {
    setCustomerId(customer.id);
    setCustomerPhone(customer.phone);
    setCustomerName(customer.displayName);
  }

  function handleSelectCustomerAddress(address: WhatsappCustomerAddress) {
    setDeliveryAddress(address.formattedAddress || address.addressText);
    setDeliveryReference(address.reference);
    setDeliveryFee(address.deliveryFee ?? 0);
    setDeliveryCoordinates({ latitude: address.latitude, longitude: address.longitude });
    setDeliveryConfirmed(
      address.confirmed &&
        address.latitude !== null &&
        address.longitude !== null &&
        address.deliveryFee !== null
    );
    setDeliveryDistanceKm(null);
    toast.success("Domicilio guardado seleccionado");
  }

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 4) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCustomerSearchLoading(true);
      void searchPosCustomersByPhoneAction(customerPhone).then((result) => {
        if (cancelled) return;
        setCustomerSearchLoading(false);
        setCustomerMatches(result.success ? result.data : []);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerPhone]);

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode !== "status" && requestedMode !== "history") return;
    const timer = window.setTimeout(() => setMode(requestedMode), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const conversationId = new URLSearchParams(window.location.search).get("whatsappConversation");
    if (!conversationId) return;
    let cancelled = false;
    void getWhatsappPosDraftAction(conversationId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const draft: WhatsappPosDraft = result.data;
      setCartItems(draft.items);
      setWhatsappConversationId(draft.conversationId);
      setOrderType(draft.orderType ?? "domicilio");
      setCustomerId(draft.customerId);
      setCustomerName(draft.customerName);
    setCustomerPhone(draft.phone);
      setWhatsappStatusOptIn(false);
      setDeliveryAddress(draft.address);
      setDeliveryReference(draft.reference);
      setDeliveryFee(draft.deliveryFee);
      setDeliveryDistanceKm(distanceMetersToKilometers(draft.distanceMeters));
      setDeliveryConfirmed(draft.addressConfirmed);
      setDeliveryCoordinates({ latitude: draft.latitude, longitude: draft.longitude });
      setDeliveryPaymentMethod(draft.paymentMethod);
      setDeliveryCashTendered(draft.cashTendered);
      setOrderNotes(draft.notes);
      setEditingOrderId(draft.orderId);
      setEditingOrderNumber(draft.orderNumber);
      setMode("pos");
      toast.success(draft.orderId
        ? `Pedido #${draft.orderNumber} cargado en Mesero`
        : "Pedido de WhatsApp cargado en Mesero");
    });
    return () => {
      cancelled = true;
    };
  }, [setCartItems]);

  useEffect(() => {
    void Promise.all([fetchCatalog(), fetchActiveOrders(), fetchTables()]);
    const unsubscribeOrders = subscribeToOrders();
    const unsubscribeCatalog = subscribeToCatalog();
    return () => {
      unsubscribeOrders();
      unsubscribeCatalog();
    };
  }, [
    fetchCatalog,
    fetchActiveOrders,
    fetchTables,
    subscribeToCatalog,
    subscribeToOrders,
  ]);

  useEffect(
    () => () => {
      if (addedFeedbackTimerRef.current) {
        window.clearTimeout(addedFeedbackTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    type IdleWindow = Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    const preload = () => {
      void import("./status-view");
      void import("./sales-history");
      void import("@/components/modals/variation-modal");
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 1500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(preload, 1000);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (menuItems.length > 0) {
      setMenuItemsMap(menuItems);
    }
  }, [menuItems, setMenuItemsMap]);

  const markProductAdded = useCallback((item: MenuItem) => {
    if (addedFeedbackTimerRef.current) {
      window.clearTimeout(addedFeedbackTimerRef.current);
    }
    setAddedProduct({ id: item.id, token: Date.now() });
    setAddedAnnouncement(`${item.name} agregado al pedido`);
    addedFeedbackTimerRef.current = window.setTimeout(() => {
      setAddedProduct(null);
      setAddedAnnouncement("");
    }, 700);
  }, []);

  const handleProductClick = useCallback(
    (item: MenuItem) => {
      if (item.modifiers && item.modifiers.length > 0) {
        setVariationItem(item);
      } else {
        addItem(item.id, item.name, item.price, []);
        markProductAdded(item);
      }
    },
    [addItem, markProductAdded]
  );

  const handleVariationConfirm = useCallback(
    (selectedModifiers: SelectedModifier[], notes: string) => {
      if (variationItem) {
        addItem(
          variationItem.id,
          variationItem.name,
          variationItem.price,
          selectedModifiers,
          notes
        );
        markProductAdded(variationItem);
        setVariationItem(null);
      }
    },
    [addItem, markProductAdded, variationItem]
  );

  async function handleSubmitOrder(payNow = false) {
    if (items.length === 0 || isSubmitting) return;
    if (!currentCashShift) {
      toast.error("Abre la caja antes de registrar pedidos", {
        description: "Usa el control Caja en la barra superior.",
      });
      return;
    }
    if (orderType === "comedor" && !tableId && !tableNumber) {
      toast.error("Selecciona una mesa en el plano antes de enviar el pedido");
      return;
    }
    if (orderType === "domicilio" && (!deliveryAddress.trim() || !deliveryConfirmed)) {
      toast.error("Confirma el domicilio con Google Maps antes de enviar");
      return;
    }
    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (orderType === "domicilio" && (phoneDigits.length < 8 || phoneDigits.length > 15)) {
      toast.error("Escribe el teléfono del cliente para continuar", {
        description: "Es el dato principal para identificar y reutilizar sus domicilios.",
      });
      return;
    }
    setIsSubmitting(true);
    let resolvedCustomerId = customerId;
    if (phoneDigits.length > 0) {
      const customerResult = await ensurePosCustomerAction({
        customerId,
        phone: customerPhone,
        displayName: customerName,
      });
      if (!customerResult.success) {
        setIsSubmitting(false);
        toast.error(customerResult.error);
        return;
      }
      resolvedCustomerId = customerResult.data.customerId;
      setCustomerId(resolvedCustomerId);
    } else {
      setCustomerId(null);
    }
    let orderNumber = editingOrderNumber;
    let createdOrder: Awaited<ReturnType<typeof createOrder>>["order"] = null;
    let error: string | null = null;

    if (editingOrderId) {
      const result = await updateOrderWithItems(
        editingOrderId,
        items,
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : "",
        orderType === "domicilio"
          ? {
              address: deliveryAddress,
              reference: deliveryReference,
              fee: deliveryFee,
              phone: customerPhone,
              paymentMethod: deliveryPaymentMethod,
              cashTendered: deliveryCashTendered,
              whatsappStatusOptIn,
              distanceMeters: deliveryDistanceKm === null ? null : Math.round(deliveryDistanceKm * 1000),
              latitude: deliveryCoordinates.latitude,
              longitude: deliveryCoordinates.longitude,
            }
          : undefined,
        orderNotes,
        resolvedCustomerId,
        customerPhone,
        whatsappConversationId
      );
      error = result.error;
    } else {
      const result = await createOrder(
        items,
        orderType,
        orderNotes,
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : "",
        orderType === "domicilio"
          ? {
              address: deliveryAddress,
              reference: deliveryReference,
              fee: deliveryFee,
              phone: customerPhone,
              paymentMethod: deliveryPaymentMethod,
              cashTendered: deliveryCashTendered,
              whatsappStatusOptIn,
              distanceMeters: deliveryDistanceKm === null ? null : Math.round(deliveryDistanceKm * 1000),
              latitude: deliveryCoordinates.latitude,
              longitude: deliveryCoordinates.longitude,
            }
          : undefined,
        resolvedCustomerId,
        customerPhone,
        whatsappConversationId
      );
      error = result.error;
      createdOrder = result.order;
      orderNumber = result.order?.number ?? null;
    }
    setIsSubmitting(false);

    if (error || !orderNumber) {
      toast.error(error ?? "Error al enviar el pedido");
      return;
    }

    toast.success(
      editingOrderId
        ? `Pedido #${orderNumber} actualizado`
        : `Pedido #${orderNumber} enviado a cocina`,
      {
      description: `${items.reduce((s, i) => s + i.quantity, 0)} artículos · ${orderType}${
        tableNumber ? ` · Mesa ${tableNumber}` : ""
      }`,
      }
    );
    if (payNow && createdOrder) {
      const { data: savedItems, error: savedItemsError } = await createClient()
        .from("order_items")
        .select("id,order_id,menu_item_id,quantity,unit_price,notes,selected_modifiers,created_at")
        .eq("order_id", createdOrder.id);
      if (savedItemsError || !savedItems) {
        toast.error("El pedido se envió, pero no se pudo abrir el cobro. Puedes cobrarlo desde Estado.");
      } else {
        const names = new Map(items.map((item) => [item.menu_item_id, item.name]));
        const persistedItems = savedItems as Array<{
          id: string;
          order_id: string;
          menu_item_id: string;
          quantity: number;
          unit_price: number;
          notes: string | null;
          selected_modifiers: unknown;
          created_at: string;
        }>;
        setCreatedOrderForPayment({
          ...createdOrder,
          payment_status: createdOrder.payment_status ?? "unpaid",
          paid_amount: Number(createdOrder.paid_amount ?? 0),
          items: persistedItems.map((item) => ({
            ...item,
            notes: item.notes ?? "",
            selected_modifiers: normalizeWhatsappPosModifiers(item.selected_modifiers),
            menu_item_name: names.get(item.menu_item_id) ?? "Producto",
          })),
        });
      }
    }
    clear();
    setTableNumber("");
    setTableId("");
    setCustomerName("");
    setCustomerPhone("");
    setWhatsappStatusOptIn(false);
    setCustomerId(null);
    setWhatsappConversationId(null);
    setCustomerMatches([]);
    setDeliveryAddress("");
    setDeliveryReference("");
    setDeliveryFee(0);
    setDeliveryDistanceKm(null);
    setDeliveryConfirmed(false);
    setDeliveryCoordinates({ latitude: null, longitude: null });
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setOrderNotes("");
    setDeliveryPaymentMethod(null);
    setDeliveryCashTendered(null);
    setDetailsOpen(false);
    setCartOpen(false);
    if (!payNow || !createdOrder) setMode("status");
  }

  function handleEditOrder(order: OrderWithItems) {
    const cartItems = order.items.map((item) => ({
      id: crypto.randomUUID(),
      menu_item_id: item.menu_item_id,
      name: item.menu_item_name ?? "Producto",
      price: item.unit_price,
      quantity: item.quantity,
      notes: item.notes,
      selected_modifiers: item.selected_modifiers,
    }));
    useCartStore.getState().setItems(cartItems);
    setEditingOrderId(order.id);
    setEditingOrderNumber(order.number);
    setOrderType(order.type);
    setTableId(order.table_id ?? "");
    setTableNumber(order.table_number ?? "");
    setCustomerName(order.customer_name ?? "");
    setCustomerPhone(order.customer_phone ?? "");
    setWhatsappStatusOptIn(order.whatsapp_status_opt_in ?? false);
    setCustomerId(order.customer_id ?? null);
    setWhatsappConversationId(
      order.source_channel === "whatsapp" ? order.channel_conversation_id ?? null : null
    );
    setDeliveryAddress(order.delivery_address ?? "");
    setDeliveryReference(order.delivery_reference ?? "");
    setDeliveryFee(Number(order.delivery_fee ?? 0));
    setDeliveryDistanceKm(null);
    setDeliveryConfirmed(Boolean(order.delivery_address));
    setDeliveryPaymentMethod(order.payment_method_requested ?? null);
    setDeliveryCashTendered(order.requested_cash_tendered ?? null);
    setOrderNotes(order.notes ?? "");
    setMode("pos");
  }

  function handleAddOrderForTable(tableIdValue: string, tableNumberValue: string) {
    clear();
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setOrderType("comedor");
    setTableId(tableIdValue);
    setTableNumber(tableNumberValue);
    setCustomerName("");
    setCustomerPhone("");
    setWhatsappStatusOptIn(false);
    setCustomerId(null);
    setWhatsappConversationId(null);
    setCustomerMatches([]);
    setDeliveryAddress("");
    setDeliveryReference("");
    setDeliveryFee(0);
    setDeliveryDistanceKm(null);
    setDeliveryConfirmed(false);
    setDeliveryCoordinates({ latitude: null, longitude: null });
    setOrderNotes("");
    setDeliveryPaymentMethod(null);
    setDeliveryCashTendered(null);
    setMode("pos");
  }

  function handleStartNewOrder() {
    if (editingOrderId || whatsappConversationId) {
      clear();
      setEditingOrderId(null);
      setEditingOrderNumber(null);
      setTableNumber("");
      setTableId("");
      setCustomerName("");
      setCustomerPhone("");
      setWhatsappStatusOptIn(false);
      setCustomerId(null);
      setWhatsappConversationId(null);
      setCustomerMatches([]);
      setDeliveryAddress("");
      setDeliveryReference("");
      setDeliveryFee(0);
      setDeliveryConfirmed(false);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setOrderNotes("");
      setDeliveryPaymentMethod(null);
      setDeliveryCashTendered(null);
    }
    setMode("pos");
  }

  const modeSwitcher = (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-background px-2 py-1.5 sm:px-4 sm:py-2">
      <div className="flex min-w-0 flex-1 rounded-xl bg-surface p-1 shadow-card ring-1 ring-border sm:flex-none">
          <button
            data-tour="pos-new-order"
            type="button"
            aria-pressed={mode === "pos"}
            onClick={handleStartNewOrder}
            className={`inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
              mode === "pos"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus size={15} />
            <span className="sm:hidden">Pedido</span>
            <span className="hidden sm:inline">Nuevo pedido</span>
          </button>
          <button
            data-tour="pos-status"
            type="button"
            aria-pressed={mode === "status"}
            onClick={() => setMode("status")}
            className={`inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
              mode === "status"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag size={15} />
            Estado
            {readyCount > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 font-data text-[10px] font-bold text-ink sm:h-5 sm:min-w-5">
                {readyCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-pressed={mode === "history"}
            onClick={() => setMode("history")}
            className={`inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
              mode === "history"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HistoryIcon size={15} />
            Historial
          </button>
      </div>
      <CashShiftControl />
      <PushNotificationControl topic="ready" />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ReadyOrderNotifier />
      {mode === "history" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {modeSwitcher}
          <SalesHistory />
        </div>
      ) : mode === "status" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {modeSwitcher}
          <StatusView
            onEditOrder={handleEditOrder}
            onAddOrderForTable={handleAddOrderForTable}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {modeSwitcher}
            <CategoryTabs />
            <ProductGrid
              onProductClick={handleProductClick}
              addedProduct={addedProduct}
            />
          </div>

          <div className="hidden shrink-0 lg:flex">
            <CartPanel
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              tableId={tableId}
              onTableIdChange={(id, label) => {
                setTableId(id);
                setTableNumber(label);
              }}
              tables={tables}
              zones={zones}
              labels={labels}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              customerPhone={customerPhone}
              onCustomerPhoneChange={setCustomerPhone}
              deliveryAddress={deliveryAddress}
              onDeliveryAddressChange={(value) => {
                setDeliveryAddress(value);
                setDeliveryConfirmed(false);
                setDeliveryFee(0);
                setDeliveryDistanceKm(null);
                setDeliveryCoordinates({ latitude: null, longitude: null });
              }}
              deliveryReference={deliveryReference}
              onDeliveryReferenceChange={setDeliveryReference}
              deliveryFee={deliveryFee}
              deliveryDistanceKm={deliveryDistanceKm}
              deliveryConfirmed={deliveryConfirmed}
              deliveryLatitude={deliveryCoordinates.latitude}
              deliveryLongitude={deliveryCoordinates.longitude}
              onQuoteDelivery={() => void handleQuoteDelivery()}
              deliveryQuoteLoading={deliveryQuoteLoading}
              onRequestSubmit={() => setDetailsOpen(true)}
            />
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-expanded={cartOpen}
            aria-label={`Abrir pedido${
              cartItemCount
                ? `, ${cartItemCount} ${cartItemCount === 1 ? "artículo" : "artículos"}`
                : ""
            }`}
            style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
            className="mobile-cart-dock fixed inset-x-3 z-30 flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-brand px-4 text-white shadow-float active:scale-[0.985] md:inset-x-auto md:right-4 md:min-w-64 lg:hidden"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <ShoppingBag size={19} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-heading text-sm font-bold leading-tight">Pedido</span>
              <span className="block truncate font-body text-[11px] text-white/75">
                {cartItemCount > 0
                  ? `${cartItemCount} ${cartItemCount === 1 ? "artículo" : "artículos"}`
                  : "Aún vacío"}
              </span>
            </span>
            <span className="font-data text-base font-black">
              ${cartTotal.toLocaleString("es-MX")}
            </span>
          </button>

          <span className="sr-only" aria-live="polite">
            {addedAnnouncement}
          </span>

          {cartOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] lg:hidden"
              onClick={(e) => {
                if (e.target === e.currentTarget) setCartOpen(false);
              }}
            >
              <CartPanel
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                tableId={tableId}
                onTableIdChange={(id, label) => {
                  setTableId(id);
                  setTableNumber(label);
                }}
                tables={tables}
                zones={zones}
                labels={labels}
                customerName={customerName}
                onCustomerNameChange={setCustomerName}
                customerPhone={customerPhone}
                onCustomerPhoneChange={setCustomerPhone}
                deliveryAddress={deliveryAddress}
                onDeliveryAddressChange={(value) => {
                  setDeliveryAddress(value);
                  setDeliveryConfirmed(false);
                  setDeliveryFee(0);
                  setDeliveryDistanceKm(null);
                  setDeliveryCoordinates({ latitude: null, longitude: null });
                }}
                deliveryReference={deliveryReference}
                onDeliveryReferenceChange={setDeliveryReference}
                deliveryFee={deliveryFee}
                deliveryDistanceKm={deliveryDistanceKm}
                deliveryConfirmed={deliveryConfirmed}
                deliveryLatitude={deliveryCoordinates.latitude}
                deliveryLongitude={deliveryCoordinates.longitude}
                onQuoteDelivery={() => void handleQuoteDelivery()}
                deliveryQuoteLoading={deliveryQuoteLoading}
                onRequestSubmit={() => setDetailsOpen(true)}
                onClose={() => setCartOpen(false)}
                isMobile
              />
            </div>
          ) : null}
        </div>
      )}

      {variationItem ? (
        <VariationModal
          item={variationItem}
          onClose={() => setVariationItem(null)}
          onConfirm={handleVariationConfirm}
        />
      ) : null}

      {detailsOpen ? (
        <OrderDetailsModal
          items={items}
          orderType={orderType}
          tableId={tableId}
          tableNumber={tableNumber}
          tables={tables}
          zones={zones}
          labels={labels}
          customerId={customerId}
          customerMatches={customerMatches}
          customerSearchLoading={customerSearchLoading}
          customerName={customerName}
          customerPhone={customerPhone}
          whatsappStatusOptIn={whatsappStatusOptIn}
          deliveryAddress={deliveryAddress}
          deliveryReference={deliveryReference}
          deliveryFee={deliveryFee}
          deliveryDistanceKm={deliveryDistanceKm}
          deliveryConfirmed={deliveryConfirmed}
          deliveryLatitude={deliveryCoordinates.latitude}
          deliveryLongitude={deliveryCoordinates.longitude}
          paymentMethod={deliveryPaymentMethod}
          cashTendered={deliveryCashTendered}
          orderNotes={orderNotes}
          isSubmitting={isSubmitting}
          isEditing={Boolean(editingOrderId)}
          onClose={() => !isSubmitting && setDetailsOpen(false)}
          onTableIdChange={(id, label) => {
            setTableId(id);
            setTableNumber(label);
          }}
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={handleCustomerPhoneChange}
          onWhatsappStatusOptInChange={setWhatsappStatusOptIn}
          onSelectCustomer={handleSelectCustomer}
          onSelectCustomerAddress={handleSelectCustomerAddress}
          onDeliveryAddressChange={(value) => {
            setDeliveryAddress(value);
            setDeliveryConfirmed(false);
            setDeliveryFee(0);
            setDeliveryDistanceKm(null);
            setDeliveryCoordinates({ latitude: null, longitude: null });
          }}
          onDeliveryReferenceChange={setDeliveryReference}
          onOrderNotesChange={setOrderNotes}
          onQuoteDelivery={() => void handleQuoteDelivery()}
          deliveryQuoteLoading={deliveryQuoteLoading}
          onSubmit={() => void handleSubmitOrder(false)}
          onPayAndSubmit={
            !editingOrderId && orderType !== "comedor"
              ? () => void handleSubmitOrder(true)
              : undefined
          }
        />
      ) : null}

      {createdOrderForPayment ? (
        <PaymentFlow
          orders={[createdOrderForPayment]}
          onClose={() => {
            setCreatedOrderForPayment(null);
            setMode("status");
          }}
        />
      ) : null}
    </div>
  );
}
