"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  History as HistoryIcon,
  PackageCheck,
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
import type { MenuItem, SelectedModifier } from "@/types/database";
import { ReadyOrderNotifier } from "./ready-order-notifier";
import { PushNotificationControl } from "./push-notification-control";
import { CashShiftControl } from "@/components/cash/cash-shift-control";

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

const ConfirmOrderModal = dynamic(
  () =>
    import("@/components/modals/confirm-order-modal").then(
      (module) => module.ConfirmOrderModal
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

const MenuAvailabilityDialog = dynamic(
  () =>
    import("@/components/menu/menu-availability-dialog").then(
      (module) => module.MenuAvailabilityDialog
    ),
  { ssr: false }
);

export function MeseroView() {
  const [mode, setMode] = useState<"pos" | "status" | "history">("pos");
  const [orderType, setOrderType] = useState<"comedor" | "domicilio" | "para_llevar">("comedor");
  const [tableNumber, setTableNumber] = useState("");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [variationItem, setVariationItem] = useState<MenuItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<number | null>(null);
  const [createdOrderForPayment, setCreatedOrderForPayment] = useState<OrderWithItems | null>(null);
  const [addedProduct, setAddedProduct] = useState<{ id: string; token: number } | null>(null);
  const [addedAnnouncement, setAddedAnnouncement] = useState("");
  const [showAvailability, setShowAvailability] = useState(false);
  const addedFeedbackTimerRef = useRef<number | null>(null);

  const fetchCatalog = useCatalogStore((state) => state.fetchCatalog);
  const subscribeToCatalog = useCatalogStore((state) => state.subscribeToCatalog);
  const menuItems = useCatalogStore((state) => state.menuItems);
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clear = useCartStore((state) => state.clear);
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

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode !== "status" && requestedMode !== "history") return;
    const timer = window.setTimeout(() => setMode(requestedMode), 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      void import("@/components/modals/confirm-order-modal");
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
    setIsSubmitting(true);
    let orderNumber = editingOrderNumber;
    let createdOrder: Awaited<ReturnType<typeof createOrder>>["order"] = null;
    let error: string | null = null;

    if (editingOrderId) {
      const result = await updateOrderWithItems(
        editingOrderId,
        items,
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : ""
      );
      error = result.error;
    } else {
      const result = await createOrder(
        items,
        orderType,
        "",
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : ""
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
            selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
            menu_item_name: names.get(item.menu_item_id) ?? "Producto",
          })),
        });
      }
    }
    clear();
    setTableNumber("");
    setTableId("");
    setCustomerName("");
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setConfirmOpen(false);
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
    setMode("pos");
  }

  function handleStartNewOrder() {
    if (editingOrderId) {
      clear();
      setEditingOrderId(null);
      setEditingOrderNumber(null);
      setTableNumber("");
      setTableId("");
      setCustomerName("");
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
      <button
        type="button"
        onClick={() => setShowAvailability(true)}
        aria-label="Cambiar disponibilidad del menú"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-brand"
      >
        <PackageCheck size={16} />
      </button>
      <CashShiftControl />
      <PushNotificationControl />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ReadyOrderNotifier />
      <MenuAvailabilityDialog
        open={showAvailability}
        onClose={() => setShowAvailability(false)}
        source="pos"
      />
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
              onRequestSubmit={() => setConfirmOpen(true)}
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
                onRequestSubmit={() => setConfirmOpen(true)}
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

      {confirmOpen ? (
        <ConfirmOrderModal
          items={items}
          orderType={orderType}
          total={getTotal()}
          isSubmitting={isSubmitting}
          isEditing={Boolean(editingOrderId)}
          onConfirm={() => void handleSubmitOrder(false)}
          onPayAndConfirm={
            !editingOrderId && orderType !== "comedor"
              ? () => void handleSubmitOrder(true)
              : undefined
          }
          onClose={() => !isSubmitting && setConfirmOpen(false)}
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
