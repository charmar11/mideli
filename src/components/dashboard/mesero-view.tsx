"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CircleAlert,
  History as HistoryIcon,
  ShoppingBag,
  Plus,
  X,
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
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import type { OrderWithItems } from "@/lib/stores/order-store";
import {
  BusinessMenuSelector,
  CategoryTabs,
  ProductGrid,
  CartPanel,
} from "@/components/pos";
import { OrderDetailsModal } from "@/components/pos/order-details-modal";
import type { MenuItem, SelectedModifier } from "@/types/database";
import { ReadyOrderNotifier } from "./ready-order-notifier";
import { PushNotificationSettings } from "./push-notification-control";
import { useDashboardUserId } from "./dashboard-user-context";
import { CashShiftControl } from "@/components/cash/cash-shift-control";
import {
  ensurePosCustomerAction,
  getWhatsappPosDraftAction,
} from "@/lib/actions/whatsapp";
import { getCashAccessibleBusinessContexts } from "@/lib/multibusiness/business-context-selection";
import {
  quoteManualDeliveryAction,
  quoteManualDeliveryPlaceAction,
  searchManualDeliveryPlacesAction,
} from "@/lib/actions/delivery";
import type {
  PosCustomerMatch,
  WhatsappCustomerAddress,
  WhatsappPosDraft,
} from "@/lib/whatsapp/admin-types";
import { searchPosCustomersByPhoneAction } from "@/lib/actions/whatsapp";
import { distanceMetersToKilometers, normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";
import {
  clearPosCartDraft,
  readPosCartDraft,
  savePosCartDraft,
  type PosCartDraft,
} from "@/lib/pos-cart-draft";

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

const ComboModal = dynamic(
  () =>
    import("@/components/pos/combo-modal").then(
      (module) => module.ComboModal
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
  const userId = useDashboardUserId();
  const [mode, setMode] = useState<"pos" | "status" | "history">("pos");
  const [orderType, setOrderType] = useState<"comedor" | "domicilio" | "para_llevar">("comedor");
  const [tableNumber, setTableNumber] = useState("");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsappStatusOptIn, setWhatsappStatusOptIn] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [whatsappConversationId, setWhatsappConversationId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduledForLabel, setScheduledForLabel] = useState<string | null>(null);
  const [kitchenReleaseAt, setKitchenReleaseAt] = useState<string | null>(null);
  const [customerMatches, setCustomerMatches] = useState<PosCustomerMatch[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryColony, setDeliveryColony] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState({ latitude: null as number | null, longitude: null as number | null });
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [blockedCartReview, setBlockedCartReview] = useState<{
    businessNames: string[];
    itemIds: string[];
    payNow: boolean;
    allowUnconfirmedDelivery: boolean;
  } | null>(null);
  const [variationItem, setVariationItem] = useState<MenuItem | null>(null);
  const [comboItem, setComboItem] = useState<MenuItem | null>(null);
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
  const [draftHydratedUserId, setDraftHydratedUserId] = useState<string | null>(null);
  const draftPersistenceModeRef = useRef<"manual" | "external">("manual");
  const draftDetailsRef = useRef<Omit<PosCartDraft, "items">>({
    orderType,
    tableId,
    tableNumber,
    orderNotes,
    scheduledFor,
    scheduledForLabel,
    kitchenReleaseAt,
  });
  const addedFeedbackTimerRef = useRef<number | null>(null);

  const fetchCatalog = useCatalogStore((state) => state.fetchCatalog);
  const fetchCatalogForBusiness = useCatalogStore(
    (state) => state.fetchCatalogForBusiness
  );
  const subscribeToCatalog = useCatalogStore((state) => state.subscribeToCatalog);
  const menuItems = useCatalogStore((state) => state.menuItems);
  const catalogBusinessId = useCatalogStore((state) => state.catalogBusinessId);
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
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
  const businessContexts = useBusinessContextStore((state) => state.businesses);
  const multibusinessLegacyFallback = useBusinessContextStore(
    (state) => state.legacyFallback
  );
  const cashBusinesses = getCashAccessibleBusinessContexts(businessContexts);
  const activeMenuBusinessId = catalogBusinessId ?? selectedBusinessId;
  const editingOrderBusinessId = editingOrderId
    ? activeOrders.find((order) => order.id === editingOrderId)?.business_id ??
      catalogBusinessId
    : null;
  const editingBusinessName = businessContexts.find(
    (business) => business.business_id === editingOrderBusinessId
  )?.business_display_name;

  const cartItemCount = getItemCount();
  const cartTotal = getTotal();
  const readyCount = activeOrders.filter((o) => o.status === "ready").length;

  async function handleQuoteDelivery() {
    if (deliveryAddress.trim().length < 8 || deliveryQuoteLoading) return;
    setDeliveryQuoteLoading(true);
    const result = await quoteManualDeliveryAction(deliveryAddress, deliveryColony);
    setDeliveryQuoteLoading(false);
    if (!result.success) {
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      toast.error(result.error);
      return;
    }
    setDeliveryAddress(result.quote.formattedAddress);
    setDeliveryColony(result.quote.colony);
    setDeliveryFee(result.quote.totalFee);
    setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
    setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
    setDeliveryConfirmed(true);
    toast.success(`Domicilio confirmado · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee}`);
  }

  async function handleSelectDeliveryPlace(placeId: string, sessionToken: string) {
    setDeliveryQuoteLoading(true);
    const result = await quoteManualDeliveryPlaceAction(placeId, sessionToken);
    setDeliveryQuoteLoading(false);
    if (!result.success) {
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      toast.error(result.error);
      return;
    }
    setDeliveryAddress(result.quote.formattedAddress);
    setDeliveryColony(result.quote.colony);
    setDeliveryFee(result.quote.totalFee);
    setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
    setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
    setDeliveryConfirmed(true);
    toast.success(`Ubicación confirmada · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee}`);
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
    setDeliveryColony(address.colony);
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

  // Restore browser-only work before exposing POS controls; the server cannot read localStorage.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!userId) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has("whatsappConversation")) {
      draftPersistenceModeRef.current = "external";
      setCartItems([]);
      setDraftHydratedUserId(userId);
      return;
    }

    draftPersistenceModeRef.current = "manual";
    const draft = readPosCartDraft(userId);
    if (draft) {
      setCartItems(draft.items);
      setOrderType(draft.orderType);
      setTableId(draft.tableId);
      setTableNumber(draft.tableNumber);
      setOrderNotes(draft.orderNotes);
      setScheduledFor(draft.scheduledFor);
      setScheduledForLabel(draft.scheduledForLabel);
      setKitchenReleaseAt(draft.kitchenReleaseAt);
    } else {
      setCartItems([]);
      setOrderType("comedor");
      setTableId("");
      setTableNumber("");
      setOrderNotes("");
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
    }
    setDraftHydratedUserId(userId);
  }, [setCartItems, userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!userId || draftHydratedUserId !== userId) return;

    return useCartStore.subscribe((state, previousState) => {
      if (
        state.items === previousState.items ||
        draftPersistenceModeRef.current !== "manual"
      ) {
        return;
      }

      savePosCartDraft(userId, {
        ...draftDetailsRef.current,
        items: state.items,
      });
    });
  }, [draftHydratedUserId, userId]);

  useEffect(() => {
    draftDetailsRef.current = {
      orderType,
      tableId,
      tableNumber,
      orderNotes,
      scheduledFor,
      scheduledForLabel,
      kitchenReleaseAt,
    };

    if (
      !userId ||
      draftHydratedUserId !== userId ||
      draftPersistenceModeRef.current !== "manual"
    ) {
      return;
    }

    savePosCartDraft(userId, {
      ...draftDetailsRef.current,
      items,
    });
  }, [
    draftHydratedUserId,
    items,
    kitchenReleaseAt,
    orderNotes,
    orderType,
    scheduledFor,
    scheduledForLabel,
    tableId,
    tableNumber,
    userId,
  ]);

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
      const draftBusinessId = useBusinessContextStore.getState().selectedBusinessId;
      setCartItems(
        draft.items.map((item) => ({
          ...item,
          business_id: draftBusinessId ?? undefined,
        }))
      );
      setWhatsappConversationId(draft.conversationId);
      setOrderType(draft.orderType ?? "domicilio");
      setCustomerId(draft.customerId);
      setCustomerName(draft.customerName);
      setCustomerPhone(draft.phone);
      setWhatsappStatusOptIn(false);
      setDeliveryAddress(draft.address);
      setDeliveryColony(draft.colony);
      setDeliveryReference(draft.reference);
      setDeliveryFee(draft.deliveryFee);
      setDeliveryDistanceKm(distanceMetersToKilometers(draft.distanceMeters));
      setDeliveryConfirmed(draft.addressConfirmed);
      setDeliveryCoordinates({ latitude: draft.latitude, longitude: draft.longitude });
      setDeliveryPaymentMethod(draft.paymentMethod);
      setDeliveryCashTendered(draft.cashTendered);
      setOrderNotes(draft.notes);
      setScheduledFor(draft.scheduledFor);
      setScheduledForLabel(draft.scheduledForLabel);
      setKitchenReleaseAt(draft.kitchenReleaseAt);
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
      void import("@/components/pos/combo-modal");
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
      if (item.is_combo) {
        setComboItem(item);
      } else if (item.modifiers && item.modifiers.length > 0) {
        setVariationItem(item);
      } else {
        addItem(item.id, item.name, item.price, [], "", activeMenuBusinessId ?? undefined);
        markProductAdded(item);
      }
    },
    [activeMenuBusinessId, addItem, markProductAdded]
  );

  const handleComboConfirm = useCallback(
    (selectedModifiers: SelectedModifier[], notes: string) => {
      if (!comboItem) return;
      addItem(
        comboItem.id,
        comboItem.name,
        comboItem.price,
        selectedModifiers,
        notes,
        activeMenuBusinessId ?? undefined
      );
      markProductAdded(comboItem);
      setComboItem(null);
    },
    [activeMenuBusinessId, addItem, comboItem, markProductAdded]
  );

  const handleVariationConfirm = useCallback(
    (selectedModifiers: SelectedModifier[], notes: string) => {
      if (variationItem) {
        addItem(
          variationItem.id,
          variationItem.name,
          variationItem.price,
          selectedModifiers,
          notes,
          activeMenuBusinessId ?? undefined
        );
        markProductAdded(variationItem);
        setVariationItem(null);
      }
    },
    [activeMenuBusinessId, addItem, markProductAdded, variationItem]
  );

  async function handleSubmitOrder(
    payNow = false,
    allowUnconfirmedDelivery = false,
    itemsToSubmit = items,
  ) {
    if (isSubmitting) return;
    if (itemsToSubmit.length === 0) {
      toast.error(
        editingOrderId
          ? "El pedido no puede quedar vacío. Cancélalo desde Estado para conservarlo como cancelado en el historial."
          : "Agrega al menos un producto al pedido."
      );
      return;
    }
    const businessContextStore = useBusinessContextStore.getState();
    if (!businessContextStore.legacyFallback) {
      await businessContextStore.ensureLoaded(true);
      const refreshedContext = useBusinessContextStore.getState();
      const contextsById = new Map(
        refreshedContext.businesses.map((business) => [business.business_id, business]),
      );
      const unavailableItems = itemsToSubmit.filter((item) => {
        const businessId = item.business_id ?? refreshedContext.selectedBusinessId;
        if (!businessId) return true;
        const business = contextsById.get(businessId);
        return (
          !business ||
          business.business_lifecycle_status !== "active" ||
          business.business_license_available !== true
        );
      });
      if (unavailableItems.length > 0) {
        const unavailableBusinessIds = new Set(
          unavailableItems
            .map((item) => item.business_id ?? refreshedContext.selectedBusinessId)
            .filter((id): id is string => Boolean(id)),
        );
        setBlockedCartReview({
          businessNames: [...unavailableBusinessIds].map(
            (id) => contextsById.get(id)?.business_display_name ?? "Negocio no disponible",
          ),
          itemIds: unavailableItems.map((item) => item.id),
          payNow,
          allowUnconfirmedDelivery,
        });
        return;
      }
    }
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
    const cartBusinessIds = new Set(
      itemsToSubmit
        .map((item) => item.business_id)
        .filter((businessId): businessId is string => Boolean(businessId))
    );
    if (cartBusinessIds.size > 1 && orderType !== "comedor") {
      toast.error("Para enviar productos de varios negocios usa Comedor", {
        description: "Selecciona una mesa para crear una cuenta separada por negocio.",
      });
      return;
    }
    if (
      orderType === "domicilio" &&
      !allowUnconfirmedDelivery &&
      (!deliveryAddress.trim() || !deliveryColony.trim() || !deliveryConfirmed)
    ) {
      toast.error("Confirma el domicilio con Google Maps antes de enviar");
      return;
    }
    const phoneDigits = customerPhone.replace(/\D/g, "");
    const phoneIsUsable = phoneDigits.length >= 8 && phoneDigits.length <= 15;
    const persistedCustomerPhone = orderType === "domicilio"
      ? (phoneIsUsable ? customerPhone : "")
      : customerPhone;
    setIsSubmitting(true);
    let resolvedCustomerId = customerId;
    if (orderType !== "domicilio" ? phoneDigits.length > 0 : phoneIsUsable) {
      const customerResult = await ensurePosCustomerAction({
        customerId,
        phone: persistedCustomerPhone,
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
      resolvedCustomerId = null;
      setCustomerId(null);
    }
    let orderNumber = editingOrderNumber;
    let createdOrder: Awaited<ReturnType<typeof createOrder>>["order"] = null;
    let createdOrders: Array<{ id: string; number: number }> = [];
    let error: string | null = null;

    if (editingOrderId) {
      const result = await updateOrderWithItems(
        editingOrderId,
        itemsToSubmit,
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : "",
        orderType === "domicilio"
          ? {
              address: deliveryAddress,
              colony: deliveryColony,
              reference: deliveryReference,
              fee: deliveryFee,
              phone: persistedCustomerPhone,
              paymentMethod: deliveryPaymentMethod,
              cashTendered: deliveryCashTendered,
              whatsappStatusOptIn: whatsappStatusOptIn && phoneIsUsable,
              distanceMeters: deliveryDistanceKm === null ? null : Math.round(deliveryDistanceKm * 1000),
              latitude: deliveryCoordinates.latitude,
              longitude: deliveryCoordinates.longitude,
            }
          : undefined,
        orderNotes,
        resolvedCustomerId,
        persistedCustomerPhone,
        whatsappConversationId,
        scheduledFor && kitchenReleaseAt
          ? { scheduledFor, kitchenReleaseAt }
          : undefined
      );
      error = result.error;
    } else {
      const result = await createOrder(
        itemsToSubmit,
        orderType,
        orderNotes,
        tableNumber,
        customerName,
        orderType === "comedor" ? tableId : "",
        orderType === "domicilio"
          ? {
              address: deliveryAddress,
              colony: deliveryColony,
              reference: deliveryReference,
              fee: deliveryFee,
              phone: persistedCustomerPhone,
              paymentMethod: deliveryPaymentMethod,
              cashTendered: deliveryCashTendered,
              whatsappStatusOptIn: whatsappStatusOptIn && phoneIsUsable,
              distanceMeters: deliveryDistanceKm === null ? null : Math.round(deliveryDistanceKm * 1000),
              latitude: deliveryCoordinates.latitude,
              longitude: deliveryCoordinates.longitude,
            }
          : undefined,
        resolvedCustomerId,
        persistedCustomerPhone,
        whatsappConversationId,
        scheduledFor && kitchenReleaseAt
          ? { scheduledFor, kitchenReleaseAt }
          : undefined
      );
      error = result.error;
      createdOrder = result.order;
      createdOrders = result.orders ?? (result.order ? [result.order] : []);
      orderNumber = result.order?.number ?? null;
    }
    setIsSubmitting(false);

    if (error || !orderNumber) {
      toast.error(error ?? "Error al enviar el pedido");
      return;
    }

    const orderNumbers = createdOrders.map((order) => `#${order.number}`).join(", ");
    toast.success(
      editingOrderId
        ? `Pedido #${orderNumber} actualizado`
        : createdOrders.length > 1
          ? `Pedidos ${orderNumbers} enviados a preparación`
          : `Pedido #${orderNumber} enviado a cocina`,
      {
      description: `${itemsToSubmit.reduce((s, i) => s + i.quantity, 0)} artículos · ${orderType}${
        tableNumber ? ` · Mesa ${tableNumber}` : ""
      }`,
      }
    );
    const completedExternalDraft = draftPersistenceModeRef.current === "external";
    if (!completedExternalDraft && userId) clearPosCartDraft(userId);
    if (payNow && createdOrder) {
      const { data: savedItems, error: savedItemsError } = await createClient()
        .from("order_items")
        .select("id,order_id,menu_item_id,quantity,unit_price,notes,selected_modifiers,created_at")
        .eq("order_id", createdOrder.id);
      if (savedItemsError || !savedItems) {
        toast.error("El pedido se envió, pero no se pudo abrir el cobro. Puedes cobrarlo desde Estado.");
      } else {
        const names = new Map(itemsToSubmit.map((item) => [item.menu_item_id, item.name]));
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
    setScheduledFor(null);
    setScheduledForLabel(null);
    setKitchenReleaseAt(null);
    setCustomerMatches([]);
    setDeliveryAddress("");
    setDeliveryColony("");
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

  async function handleEditOrder(order: OrderWithItems) {
    if (
      order.business_id &&
      catalogBusinessId !== order.business_id &&
      !(await fetchCatalogForBusiness(order.business_id, true))
    ) {
      toast.error("No se pudo cargar el menú de este pedido", {
        description: "El pedido sigue sin cambios. Intenta de nuevo.",
      });
      return;
    }

    draftPersistenceModeRef.current = "external";
    if (userId) clearPosCartDraft(userId);
    const cartItems = order.items.map((item) => ({
      id: crypto.randomUUID(),
      menu_item_id: item.menu_item_id,
      business_id: order.business_id,
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
    setDeliveryColony(order.delivery_colony ?? "");
    setDeliveryReference(order.delivery_reference ?? "");
    setDeliveryFee(Number(order.delivery_fee ?? 0));
    setDeliveryDistanceKm(null);
    setDeliveryConfirmed(Boolean(order.delivery_address));
    setDeliveryPaymentMethod(order.payment_method_requested ?? null);
    setDeliveryCashTendered(order.requested_cash_tendered ?? null);
    setScheduledFor(order.scheduled_for ?? null);
    setScheduledForLabel(
      order.scheduled_for
        ? new Date(order.scheduled_for).toLocaleTimeString("es-MX", {
            hour: "numeric",
            minute: "2-digit",
          })
        : null
    );
    setKitchenReleaseAt(order.kitchen_release_at ?? null);
    setOrderNotes(order.notes ?? "");
    setMode("pos");
  }

  function applyLocalCartDraft(draft: PosCartDraft) {
    setCartItems(draft.items);
    setOrderType(draft.orderType);
    setTableId(draft.tableId);
    setTableNumber(draft.tableNumber);
    setOrderNotes(draft.orderNotes);
    setScheduledFor(draft.scheduledFor);
    setScheduledForLabel(draft.scheduledForLabel);
    setKitchenReleaseAt(draft.kitchenReleaseAt);
  }

  function handleAddOrderForTable(tableIdValue: string, tableNumberValue: string) {
    draftPersistenceModeRef.current = "manual";
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
    setScheduledFor(null);
    setScheduledForLabel(null);
    setKitchenReleaseAt(null);
    setCustomerMatches([]);
    setDeliveryAddress("");
    setDeliveryColony("");
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
    const wasEditingExternalOrder = draftPersistenceModeRef.current === "external";
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
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
      setCustomerMatches([]);
      setDeliveryAddress("");
      setDeliveryColony("");
      setDeliveryReference("");
      setDeliveryFee(0);
      setDeliveryConfirmed(false);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setOrderNotes("");
      setDeliveryPaymentMethod(null);
      setDeliveryCashTendered(null);
    }
    if (wasEditingExternalOrder) {
      draftPersistenceModeRef.current = "manual";
      const savedDraft = userId ? readPosCartDraft(userId) : null;
      if (savedDraft) {
        applyLocalCartDraft(savedDraft);
      } else {
        clear();
      }
    }
    setMode("pos");
  }

  const modeSwitcher = (
    <div className="mideli-pos-mode-switcher flex shrink-0 items-center gap-2 border-b border-border/70 bg-background px-2 py-1.5 sm:px-4 sm:py-2">
      <div className="flex min-w-0 flex-1 rounded-xl bg-surface p-1 shadow-card ring-1 ring-border sm:flex-none">
          <button
            data-tour="pos-new-order"
            type="button"
            aria-pressed={mode === "pos"}
            onClick={handleStartNewOrder}
            className={`inline-flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
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
            className={`inline-flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
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
            className={`inline-flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
              mode === "history"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HistoryIcon size={15} />
            Historial
          </button>
      </div>
      <CashShiftControl
        canOpenCash={multibusinessLegacyFallback}
        canCloseCash={multibusinessLegacyFallback}
        canManageCash={multibusinessLegacyFallback}
        cashBusinesses={multibusinessLegacyFallback ? undefined : cashBusinesses}
        preferredBusinessId={selectedBusinessId}
      />
      <PushNotificationSettings />
    </div>
  );

  if (userId && draftHydratedUserId !== userId) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-5 text-sm text-muted-foreground">
        Recuperando la comanda...
      </div>
    );
  }

  return (
    <div className="mideli-pos-shell flex h-full min-h-0 flex-col bg-background">
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
            {editingOrderId ? (
              <div className="mx-3 flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 sm:mx-4">
                <Building2 size={16} className="shrink-0 text-brand" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-heading text-xs font-bold">
                    Editando pedido #{editingOrderNumber}
                  </p>
                  <p className="truncate font-body text-[11px] text-muted-foreground">
                    {editingBusinessName ?? "Menú del pedido"}
                  </p>
                </div>
              </div>
            ) : (
              <BusinessMenuSelector />
            )}
            <CategoryTabs />
            <ProductGrid
              onProductClick={handleProductClick}
              addedProduct={addedProduct}
            />
          </div>

          <div className="hidden shrink-0 xl:flex">
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
              deliveryFee={deliveryFee}
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
            className="mideli-mobile-cart-dock mobile-cart-dock fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] inset-x-3 z-30 flex h-14 touch-manipulation items-center gap-3 rounded-2xl border border-white/10 bg-brand px-4 text-white shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] md:bottom-4 md:inset-x-auto md:right-4 md:min-w-72 xl:hidden"
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
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] xl:hidden"
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
                deliveryFee={deliveryFee}
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

      {comboItem ? (
        <ComboModal
          item={comboItem}
          onClose={() => setComboItem(null)}
          onConfirm={handleComboConfirm}
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
          deliveryColony={deliveryColony}
          deliveryReference={deliveryReference}
          deliveryFee={deliveryFee}
          deliveryDistanceKm={deliveryDistanceKm}
          deliveryConfirmed={deliveryConfirmed}
          deliveryLatitude={deliveryCoordinates.latitude}
          deliveryLongitude={deliveryCoordinates.longitude}
          paymentMethod={deliveryPaymentMethod}
          cashTendered={deliveryCashTendered}
          orderNotes={orderNotes}
          scheduledForLabel={scheduledForLabel}
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
            setDeliveryColony("");
            setDeliveryConfirmed(false);
            setDeliveryFee(0);
            setDeliveryDistanceKm(null);
            setDeliveryCoordinates({ latitude: null, longitude: null });
          }}
          onDeliveryReferenceChange={setDeliveryReference}
          onOrderNotesChange={setOrderNotes}
          onQuoteDelivery={() => void handleQuoteDelivery()}
          onSearchDeliveryPlaces={searchManualDeliveryPlacesAction}
          onSelectDeliveryPlace={handleSelectDeliveryPlace}
          deliveryQuoteLoading={deliveryQuoteLoading}
          onSubmit={(allowUnconfirmedDelivery) =>
            void handleSubmitOrder(false, allowUnconfirmedDelivery)
          }
          onPayAndSubmit={
            !editingOrderId && orderType !== "comedor"
              ? (allowUnconfirmedDelivery) =>
                  void handleSubmitOrder(true, allowUnconfirmedDelivery)
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

      {blockedCartReview ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBlockedCartReview(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="blocked-cart-title"
            className="w-full max-w-lg rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning">
                <CircleAlert size={21} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="blocked-cart-title" className="font-heading text-lg font-bold text-foreground">
                  Revisa la comanda antes de continuar
                </h2>
                <p className="mt-1 font-body text-sm leading-5 text-muted-foreground">
                  Algunos productos ya no están disponibles. Puedes conservar la comanda o quitarlos y continuar con los demás.
                </p>
              </div>
              <button
                type="button"
                aria-label="Conservar comanda y cerrar aviso"
                onClick={() => setBlockedCartReview(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <ul className="mt-5 space-y-2">
              {blockedCartReview.businessNames.map((name, index) => (
                <li key={`${name}-${index}`} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 font-heading text-sm font-semibold text-foreground">
                  <Building2 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBlockedCartReview(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                Conservar comanda
              </button>
              <button
                type="button"
                onClick={() => {
                  const review = blockedCartReview;
                  if (!review) return;
                  const blockedIds = new Set(review.itemIds);
                  const remainingItems = useCartStore
                    .getState()
                    .items.filter((item) => !blockedIds.has(item.id));
                  setCartItems(remainingItems);
                  setBlockedCartReview(null);
                  if (remainingItems.length === 0) {
                    toast.info("La comanda quedó vacía. Agrega productos disponibles para continuar.");
                    return;
                  }
                  void handleSubmitOrder(
                    review.payNow,
                    review.allowUnconfirmedDelivery,
                    remainingItems,
                  );
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white shadow-sm shadow-brand/20 hover:bg-brand-hover"
              >
                Quitar y continuar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
