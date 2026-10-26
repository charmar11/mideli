"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CircleAlert,
  History as HistoryIcon,
  Loader2,
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
import {
  getMarketplaceConfigBusinessId,
  isMarketplacePosConfigReady,
  type MarketplaceProductAvailability,
} from "@/lib/marketplace-orders";
import {
  getBusinessMarketplacePosConfigAction,
  type MarketplaceOrderSelection,
  type MarketplacePlatform,
} from "@/lib/actions/business-marketplace";
import { ReadyOrderNotifier } from "./ready-order-notifier";
import { PushNotificationSettings } from "./push-notification-control";
import { useDashboardUserId } from "./dashboard-user-context";
import { CashShiftControl } from "@/components/cash/cash-shift-control";
import {
  getWhatsappPosDraftAction,
} from "@/lib/actions/whatsapp";
import {
  savePosBusinessCustomerAction,
  searchPosBusinessCustomersAction,
} from "@/lib/actions/business-customers";
import {
  getBusinessesMissingOpenCashShift,
  getCashAccessibleBusinessContexts,
} from "@/lib/multibusiness/business-context-selection";
import {
  quoteManualDeliveryAction,
  quoteManualDeliveryPlaceAction,
  searchManualDeliveryPlacesAction,
} from "@/lib/actions/delivery";
import { UNREGISTERED_DELIVERY_COLONY } from "@/lib/whatsapp/delivery-pricing";
import type { BusinessCustomerAddress, BusinessCustomerMatch } from "@/types/business-customers";
import { getPreferredBusinessCustomerAddress } from "@/lib/business-customer-presentation";
import { createTodayOrderSchedule } from "@/lib/order-scheduling";
import {
  hasRequiredLocalDeliveryPayment,
  isLocalDeliveryPaymentMethod,
} from "@/lib/local-delivery-payment";
import type { WhatsappPosDraft } from "@/lib/whatsapp/admin-types";
import { checkPosOrderAttemptAction } from "@/lib/actions/pos-order-recovery";
import { distanceMetersToKilometers, normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";
import {
  clearPosCartDraft,
  readPosCartDraft,
  savePosCartDraft,
  type PosCartDraft,
} from "@/lib/pos-cart-draft";
import {
  getPendingPosRecoveryAction,
  isPosCreationKey,
  type PendingPosRecoveryState,
} from "@/lib/pos-order-recovery";

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

type PendingColonyRetry =
  | { kind: "address"; address: string; colony: string }
  | {
      kind: "place";
      placeId: string;
      typedAddress: string;
      fallbackColony: string;
    };

function getDraftBusinessIds(
  draft: PosCartDraft,
  selectedBusinessId: string | null,
) {
  const menuItemsBusinessMap = useOrderStore.getState().menuItemsBusinessMap;
  const businessIds = draft.items.map(
    (item) =>
      item.business_id ??
      menuItemsBusinessMap.get(item.menu_item_id) ??
      selectedBusinessId,
  );
  if (businessIds.some((businessId) => !businessId)) return null;
  return [...new Set(businessIds.filter((id): id is string => Boolean(id)))];
}

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
  const [customerIdBusinessId, setCustomerIdBusinessId] = useState<string | null>(null);
  const [legacyWhatsappCustomerId, setLegacyWhatsappCustomerId] = useState<string | null>(null);
  const [whatsappConversationId, setWhatsappConversationId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduledForLabel, setScheduledForLabel] = useState<string | null>(null);
  const [kitchenReleaseAt, setKitchenReleaseAt] = useState<string | null>(null);
  const [customerMatches, setCustomerMatches] = useState<BusinessCustomerMatch[]>([]);
  const [customerMatchesBusinessId, setCustomerMatchesBusinessId] = useState<string | null>(null);
  const [customerMatchesPhone, setCustomerMatchesPhone] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryColony, setDeliveryColony] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [deliveryColonyMissing, setDeliveryColonyMissing] = useState(false);
  const [pendingColonyRetry, setPendingColonyRetry] = useState<PendingColonyRetry | null>(null);
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
  const [marketplaceSelection, setMarketplaceSelection] = useState<MarketplaceOrderSelection | null>(null);
  const [marketplaceConfig, setMarketplaceConfig] = useState<{
    key: string;
    loading: boolean;
    platforms: MarketplacePlatform[];
    prices: Record<string, Partial<Record<MarketplacePlatform, number>>>;
    availability: MarketplaceProductAvailability;
  }>({ key: "", loading: false, platforms: [], prices: {}, availability: {} });
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
  const [pendingCreationKey, setPendingCreationKey] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<PendingPosRecoveryState>(null);
  const draftPersistenceModeRef = useRef<"manual" | "external">("manual");
  const pendingCreationKeyRef = useRef<string | null>(null);
  const recoveryCheckInFlightRef = useRef(false);
  const deliveryQuoteRequestIdRef = useRef(0);
  const draftDetailsRef = useRef<Omit<PosCartDraft, "items">>({
    orderType,
    tableId,
    tableNumber,
    orderNotes,
    scheduledFor,
    scheduledForLabel,
    kitchenReleaseAt,
    marketplace: marketplaceSelection,
    deliveryPaymentMethod: isLocalDeliveryPaymentMethod(deliveryPaymentMethod)
      ? deliveryPaymentMethod
      : null,
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
  const menuItemsBusinessMap = useOrderStore((state) => state.menuItemsBusinessMap);
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const currentCashShift = useCashShiftStore((state) => state.currentShift);
  const checkCurrentShiftForBusiness = useCashShiftStore(
    (state) => state.checkCurrentShiftForBusiness,
  );
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
  const businessContexts = useBusinessContextStore((state) => state.businesses);
  const multibusinessLegacyFallback = useBusinessContextStore(
    (state) => state.legacyFallback
  );
  const cashBusinesses = getCashAccessibleBusinessContexts(businessContexts);
  const activeMenuBusinessId = catalogBusinessId ?? selectedBusinessId;
  const marketplaceItemIds = [...new Set(items.map((item) => item.menu_item_id))].sort();
  const marketplaceBusinessIds = [...new Set(items.map(
    (item) => item.business_id ?? menuItemsBusinessMap.get(item.menu_item_id) ?? activeMenuBusinessId,
  ).filter((id): id is string => Boolean(id)))];
  const marketplaceBusinessId = getMarketplaceConfigBusinessId(
    activeMenuBusinessId,
    marketplaceBusinessIds,
  );
  const marketplaceConfigKey = marketplaceBusinessId
    ? `${marketplaceBusinessId}:${marketplaceItemIds.join(",")}`
    : "";
  const marketplaceConfigReady = isMarketplacePosConfigReady(
    marketplaceConfig.key,
    marketplaceConfigKey,
    marketplaceConfig.loading,
  );
  const activeMarketplaceSelection = marketplaceConfigReady &&
    marketplaceSelection &&
    marketplaceConfig.platforms.includes(marketplaceSelection.platform)
      ? marketplaceSelection
      : null;
  const marketplaceScopeMismatch = Boolean(
    activeMenuBusinessId &&
    marketplaceBusinessIds.length === 1 &&
    marketplaceBusinessIds[0] !== activeMenuBusinessId,
  );
  const marketplaceConfigLoading = Boolean(
    detailsOpen && !editingOrderId && marketplaceBusinessId &&
    (marketplaceConfig.key !== marketplaceConfigKey || marketplaceConfig.loading),
  );
  const customerPhoneDigits = customerPhone.replace(/\D/g, "");
  const visibleCustomerMatches =
    customerMatchesBusinessId === activeMenuBusinessId &&
    customerMatchesPhone === customerPhoneDigits
      ? customerMatches
      : [];
  const editingOrderBusinessId = editingOrderId
    ? activeOrders.find((order) => order.id === editingOrderId)?.business_id ??
      catalogBusinessId
    : null;
  const editingBusinessName = businessContexts.find(
    (business) => business.business_id === editingOrderBusinessId
  )?.business_display_name;
  const activeBusinessTimeZone = businessContexts.find(
    (business) => business.business_id === (editingOrderBusinessId ?? activeMenuBusinessId)
  )?.business_timezone ?? "America/Hermosillo";

  const cartItemCount = getItemCount();
  const cartTotal = getTotal();
  const readyCount = activeOrders.filter((o) => o.status === "ready").length;

  useEffect(() => {
    if (!detailsOpen || editingOrderId || !marketplaceBusinessId || marketplaceItemIds.length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setMarketplaceConfig({
          key: marketplaceConfigKey,
          loading: true,
          platforms: [],
          prices: {},
          availability: {},
        });
        return getBusinessMarketplacePosConfigAction(marketplaceBusinessId, marketplaceItemIds);
      })
      .then((result) => {
        if (cancelled || !result) return;
        setMarketplaceConfig({
          key: marketplaceConfigKey,
          loading: false,
          platforms: result.success ? result.data?.platforms ?? [] : [],
          prices: result.success ? result.data?.prices ?? {} : {},
          availability: result.success ? result.data?.availability ?? {} : {},
        });
        setMarketplaceSelection((current) =>
          current && !result.data?.platforms.includes(current.platform) ? null : current,
        );
      })
      .catch(() => {
        if (!cancelled) setMarketplaceConfig({ key: marketplaceConfigKey, loading: false, platforms: [], prices: {}, availability: {} });
      });
    return () => { cancelled = true; };
  // Item IDs are serialized so the effect refreshes if the cart content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsOpen, editingOrderId, marketplaceBusinessId, marketplaceConfigKey]);

  const checkPendingPosOrder = useCallback(async () => {
    if (
      !userId ||
      draftHydratedUserId !== userId ||
      draftPersistenceModeRef.current !== "manual" ||
      recoveryCheckInFlightRef.current
    ) {
      return;
    }

    const storedDraft = readPosCartDraft(userId);
    const creationKey = storedDraft?.creationKey ?? pendingCreationKeyRef.current;
    if (creationKey === null) {
      pendingCreationKeyRef.current = null;
      setPendingCreationKey(null);
      setRecoveryState(null);
      return;
    }

    const draft = storedDraft ?? {
      ...draftDetailsRef.current,
      items: useCartStore.getState().items,
      creationKey,
    };
    if (draft.items.length === 0) {
      setRecoveryState("unavailable");
      return;
    }

    if (!isPosCreationKey(creationKey)) {
      setRecoveryState("unavailable");
      return;
    }

    recoveryCheckInFlightRef.current = true;
    setRecoveryState("checking");
    try {
      await useBusinessContextStore.getState().ensureLoaded(true);
      const businessIds = getDraftBusinessIds(
        draft,
        useBusinessContextStore.getState().selectedBusinessId,
      );
      if (!businessIds?.length) {
        setRecoveryState("unavailable");
        return;
      }

      const result = await checkPosOrderAttemptAction({
        creationKey,
        businessIds,
      });
      if (result.status === "unavailable") {
        setRecoveryState("unavailable");
        return;
      }
      if (result.status === "not_found") {
        setMode("pos");
        setRecoveryState("retry");
        return;
      }

      // Wait for a possibly stale initial load, then force a fresh query for the recovered order.
      await fetchActiveOrders();
      await fetchActiveOrders();
      if (useOrderStore.getState().lastError) {
        setRecoveryState("unavailable");
        return;
      }

      clearPosCartDraft(userId);
      pendingCreationKeyRef.current = null;
      setPendingCreationKey(null);
        setRecoveryState(null);
        clear();
        setOrderType("comedor");
        setMarketplaceSelection(null);
      setTableId("");
      setTableNumber("");
      setOrderNotes("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerId(null);
      setCustomerIdBusinessId(null);
      setLegacyWhatsappCustomerId(null);
      setWhatsappStatusOptIn(false);
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
      setDeliveryAddress("");
      setDeliveryColony("");
      setDeliveryReference("");
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      setDeliveryConfirmed(false);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setDeliveryPaymentMethod(null);
      setDeliveryCashTendered(null);
      setDetailsOpen(false);
      setCartOpen(false);
      const hasActiveRecoveredOrder = result.orderIds.some((orderId) =>
        useOrderStore
          .getState()
          .activeOrders.some((order) => order.id === orderId),
      );
      setMode(hasActiveRecoveredOrder ? "status" : "history");
    } catch {
      setRecoveryState("unavailable");
    } finally {
      recoveryCheckInFlightRef.current = false;
    }
  }, [
    clear,
    draftHydratedUserId,
    fetchActiveOrders,
    userId,
  ]);

  async function handleQuoteDelivery() {
    if (deliveryAddress.trim().length < 8 || deliveryQuoteLoading) return;
    const requestId = ++deliveryQuoteRequestIdRef.current;
    const pending: PendingColonyRetry = {
      kind: "address",
      address: deliveryAddress,
      colony: deliveryColony,
    };
    setPendingColonyRetry(pending);
    setDeliveryColonyMissing(false);
    setDeliveryQuoteLoading(true);
    try {
      const result = await quoteManualDeliveryAction(
        activeMenuBusinessId ?? "",
        deliveryAddress,
        deliveryColony
      );
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      if (!result.success) {
        setDeliveryConfirmed(false);
        setDeliveryFee(0);
        setDeliveryDistanceKm(null);
        setDeliveryCoordinates({ latitude: null, longitude: null });
        setDeliveryColonyMissing(result.reason === "colony_missing");
        if (result.reason !== "colony_missing") setPendingColonyRetry(null);
        toast.error(result.error);
        return;
      }
      setDeliveryAddress(result.quote.formattedAddress);
      setDeliveryColony(result.quote.colony);
      setDeliveryFee(result.quote.totalFee);
      setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
      setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
      setDeliveryConfirmed(true);
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.success(`Domicilio confirmado · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee}`);
    } catch {
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.error("Se perdió la conexión con Maps. Revisa la dirección e intenta de nuevo.");
    } finally {
      if (requestId === deliveryQuoteRequestIdRef.current) setDeliveryQuoteLoading(false);
    }
  }

  async function handleSelectDeliveryPlace(
    placeId: string,
    sessionToken: string,
    typedAddress: string,
    fallbackColony: string
  ) {
    const requestId = ++deliveryQuoteRequestIdRef.current;
    const pending: PendingColonyRetry = {
      kind: "place",
      placeId,
      typedAddress,
      fallbackColony,
    };
    setPendingColonyRetry(pending);
    setDeliveryColonyMissing(false);
    setDeliveryQuoteLoading(true);
    try {
      const result = await quoteManualDeliveryPlaceAction(
        activeMenuBusinessId ?? "",
        placeId,
        sessionToken,
        typedAddress,
        fallbackColony
      );
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      if (!result.success) {
        setDeliveryConfirmed(false);
        setDeliveryFee(0);
        setDeliveryDistanceKm(null);
        setDeliveryCoordinates({ latitude: null, longitude: null });
        setDeliveryColonyMissing(result.reason === "colony_missing");
        if (result.reason !== "colony_missing") setPendingColonyRetry(null);
        toast.error(result.error);
        return;
      }
      setDeliveryAddress(result.quote.formattedAddress);
      setDeliveryColony(result.quote.colony);
      setDeliveryFee(result.quote.totalFee);
      setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
      setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
      setDeliveryConfirmed(true);
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.success(`Ubicación confirmada · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee}`);
    } catch {
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.error("No se pudo confirmar esta sugerencia de Maps. El domicilio sigue en el campo; prueba otra opción.");
    } finally {
      if (requestId === deliveryQuoteRequestIdRef.current) setDeliveryQuoteLoading(false);
    }
  }

  async function handleQuoteDeliveryWithoutColony() {
    if (!deliveryColonyMissing || deliveryQuoteLoading) return;
    const requestId = ++deliveryQuoteRequestIdRef.current;
    const pending = pendingColonyRetry;
    setDeliveryQuoteLoading(true);
    try {
      const result = pending?.kind === "place"
        ? await quoteManualDeliveryPlaceAction(
            activeMenuBusinessId ?? "",
            pending.placeId,
            "",
            pending.typedAddress,
            pending.fallbackColony,
            true
          )
        : await quoteManualDeliveryAction(
            activeMenuBusinessId ?? "",
            pending?.kind === "address" ? pending.address : deliveryAddress,
            pending?.kind === "address" ? pending.colony : deliveryColony,
            true
          );
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      if (!result.success) {
        setDeliveryConfirmed(false);
        setDeliveryFee(0);
        setDeliveryDistanceKm(null);
        setDeliveryCoordinates({ latitude: null, longitude: null });
        setDeliveryColonyMissing(false);
        setPendingColonyRetry(null);
        toast.error(result.error);
        return;
      }

      setDeliveryAddress(result.quote.formattedAddress);
      setDeliveryColony(result.quote.colony || UNREGISTERED_DELIVERY_COLONY);
      setDeliveryFee(result.quote.totalFee);
      setDeliveryDistanceKm(Math.round((result.quote.distanceMeters / 1000) * 10) / 10);
      setDeliveryCoordinates({ latitude: result.quote.latitude, longitude: result.quote.longitude });
      setDeliveryConfirmed(true);
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.success(result.quote.colonyUnassigned
        ? `Ubicación confirmada · ${Math.round(result.quote.distanceMeters / 100) / 10} km · $${result.quote.totalFee} por distancia, sin recargo de colonia`
        : `Ubicación confirmada · ${Math.round(result.quote.distanceMeters / 100) / 10} km · envío $${result.quote.totalFee}`);
    } catch {
      if (requestId !== deliveryQuoteRequestIdRef.current) return;
      setDeliveryConfirmed(false);
      setDeliveryFee(0);
      setDeliveryDistanceKm(null);
      setDeliveryCoordinates({ latitude: null, longitude: null });
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
      toast.error("No se pudo calcular el envío por distancia. Revisa la calle o intenta de nuevo.");
    } finally {
      if (requestId === deliveryQuoteRequestIdRef.current) setDeliveryQuoteLoading(false);
    }
  }

  function handleCustomerPhoneChange(value: string) {
    setCustomerPhone(value);
    const digits = value.replace(/\D/g, "");
    const selected = visibleCustomerMatches.find((customer) => customer.id === customerId);
    if (selected && selected.phone !== digits) {
      setCustomerId(null);
      setCustomerIdBusinessId(null);
    }
    if (legacyWhatsappCustomerId) setLegacyWhatsappCustomerId(null);
    if (digits.length < 4) {
      setCustomerMatches([]);
      setCustomerSearchLoading(false);
    }
  }

  function handlePickupTimeChange(value: string) {
    if (!value) {
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
      return;
    }

    const result = createTodayOrderSchedule(value, {
      timeZone: activeBusinessTimeZone,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setScheduledFor(result.schedule.scheduledFor);
    setScheduledForLabel(result.schedule.label);
    setKitchenReleaseAt(result.schedule.kitchenReleaseAt);
  }

  function handleOrderTypeChange(nextType: "comedor" | "domicilio" | "para_llevar") {
    setOrderType(nextType);
    if (nextType !== "domicilio") {
      setDeliveryPaymentMethod(null);
      setDeliveryCashTendered(null);
    }
    if (nextType !== "para_llevar" && !whatsappConversationId) {
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
    }
    if (nextType !== "para_llevar") setMarketplaceSelection(null);
  }

  function handleSelectCustomer(customer: BusinessCustomerMatch) {
    deliveryQuoteRequestIdRef.current += 1;
    setDeliveryQuoteLoading(false);
    setCustomerId(customer.id);
    setCustomerIdBusinessId(activeMenuBusinessId);
    setLegacyWhatsappCustomerId(null);
    setCustomerPhone(customer.phone);
    setCustomerName(customer.displayName);
    setCustomerMatches([customer]);
    setCustomerMatchesBusinessId(activeMenuBusinessId);
    setCustomerMatchesPhone(customer.phone.replace(/\D/g, ""));
    setCustomerSearchLoading(false);
    if (orderType === "domicilio") {
      const preferredAddress = getPreferredBusinessCustomerAddress(customer.addresses);
      if (preferredAddress) {
        handleSelectCustomerAddress(preferredAddress);
      } else {
        setDeliveryColonyMissing(false);
        setPendingColonyRetry(null);
        setDeliveryAddress("");
        setDeliveryColony("");
        setDeliveryReference("");
        setDeliveryFee(0);
        setDeliveryDistanceKm(null);
        setDeliveryCoordinates({ latitude: null, longitude: null });
        setDeliveryConfirmed(false);
      }
    }
  }

  function handleSelectCustomerAddress(address: BusinessCustomerAddress) {
    deliveryQuoteRequestIdRef.current += 1;
    setDeliveryQuoteLoading(false);
    setDeliveryColonyMissing(false);
    setPendingColonyRetry(null);
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
  }

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 4 || !activeMenuBusinessId) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCustomerSearchLoading(true);
      void searchPosBusinessCustomersAction(activeMenuBusinessId, customerPhone).then((result) => {
        if (cancelled) return;
        setCustomerSearchLoading(false);
        setCustomerMatches(result.success ? result.data : []);
        setCustomerMatchesBusinessId(activeMenuBusinessId);
        setCustomerMatchesPhone(customerPhone.replace(/\D/g, ""));
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeMenuBusinessId, customerPhone]);

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
      pendingCreationKeyRef.current = null;
      setPendingCreationKey(null);
      setRecoveryState(null);
      setCartItems([]);
      setDraftHydratedUserId(userId);
      return;
    }

    draftPersistenceModeRef.current = "manual";
    const draft = readPosCartDraft(userId);
    const creationKey = draft?.creationKey ?? null;
    pendingCreationKeyRef.current = creationKey;
    setPendingCreationKey(creationKey);
    setRecoveryState(creationKey ? "checking" : null);
    if (draft) {
      setCartItems(draft.items);
      setOrderType(draft.orderType);
      setMarketplaceSelection(draft.marketplace ?? null);
      setTableId(draft.tableId);
      setTableNumber(draft.tableNumber);
      setOrderNotes(draft.orderNotes);
      setScheduledFor(draft.scheduledFor);
      setScheduledForLabel(draft.scheduledForLabel);
      setKitchenReleaseAt(draft.kitchenReleaseAt);
      setDeliveryPaymentMethod(
        draft.orderType === "domicilio" && !draft.marketplace
          ? draft.deliveryPaymentMethod ?? null
          : null
      );
    } else {
      setCartItems([]);
      setOrderType("comedor");
      setMarketplaceSelection(null);
      setTableId("");
      setTableNumber("");
      setOrderNotes("");
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
      setDeliveryPaymentMethod(null);
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
        creationKey: pendingCreationKeyRef.current,
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
      marketplace: marketplaceSelection,
      deliveryPaymentMethod: isLocalDeliveryPaymentMethod(deliveryPaymentMethod)
        ? deliveryPaymentMethod
        : null,
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
      creationKey: pendingCreationKeyRef.current,
    });
  }, [
    draftHydratedUserId,
    items,
    kitchenReleaseAt,
    marketplaceSelection,
    orderNotes,
    orderType,
    scheduledFor,
    scheduledForLabel,
    tableId,
    tableNumber,
    deliveryPaymentMethod,
    userId,
  ]);

  useEffect(() => {
    if (
      !userId ||
      draftHydratedUserId !== userId ||
      recoveryState !== "checking" ||
      draftPersistenceModeRef.current !== "manual"
    ) {
      return;
    }
    void checkPendingPosOrder();
  }, [
    checkPendingPosOrder,
    draftHydratedUserId,
    recoveryState,
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
      setCustomerId(null);
      setCustomerIdBusinessId(null);
      setLegacyWhatsappCustomerId(draft.customerId);
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
      if (pendingCreationKeyRef.current !== null) return;
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
      if (!comboItem || pendingCreationKeyRef.current !== null) return;
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
      if (variationItem && pendingCreationKeyRef.current === null) {
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
    if (
      isSubmitting ||
      (userId !== null && draftHydratedUserId !== userId) ||
      recoveryState === "checking" ||
      recoveryState === "unavailable" ||
      (pendingCreationKeyRef.current !== null && recoveryState !== "retry")
    ) return;
    if (!hasRequiredLocalDeliveryPayment(
      orderType,
      Boolean(activeMarketplaceSelection),
      deliveryPaymentMethod
    )) {
      toast.error("Selecciona cómo pagará el cliente", {
        description: "Elige Efectivo o Transferencia antes de enviar el domicilio.",
      });
      return;
    }
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
    const menuBusinessMap = useOrderStore.getState().menuItemsBusinessMap;
    const cartBusinessIds = new Set(
      itemsToSubmit
        .map((item) => item.business_id ?? menuBusinessMap.get(item.menu_item_id) ?? activeMenuBusinessId)
        .filter((businessId): businessId is string => Boolean(businessId))
    );
    if (cartBusinessIds.size > 1 && orderType !== "comedor") {
      toast.error("Para enviar productos de varios negocios usa Comedor", {
        description: "Selecciona una mesa para crear una cuenta separada por negocio.",
      });
      return;
    }
    if (orderType === "comedor" && !tableId && !tableNumber) {
      toast.error("Selecciona una mesa en el plano antes de enviar el pedido");
      return;
    }

    const orderBusinessIds = [...cartBusinessIds];
    if (orderBusinessIds.length > 0) {
      let cashShiftChecks: Awaited<ReturnType<typeof checkCurrentShiftForBusiness>>[];
      try {
        cashShiftChecks = await Promise.all(
          orderBusinessIds.map((businessId) => checkCurrentShiftForBusiness(businessId)),
        );
      } catch {
        toast.error("No se pudo verificar la caja de este pedido", {
          description: "Revisa la conexión e inténtalo de nuevo.",
        });
        return;
      }

      const failedCheck = cashShiftChecks.find((check) => check.error);
      if (failedCheck?.error) {
        toast.error("No se pudo verificar la caja del negocio", {
          description: "Revisa tu conexión o pide al responsable que confirme el turno.",
        });
        return;
      }

      const businessesWithoutOpenShift = getBusinessesMissingOpenCashShift(
        orderBusinessIds,
        cashShiftChecks.map((check) => check.data),
      );
      if (businessesWithoutOpenShift.length > 0) {
        const businessNames = businessesWithoutOpenShift.map(
          (businessId) =>
            businessContexts.find((business) => business.business_id === businessId)
              ?.business_display_name ?? "el negocio correspondiente",
        );
        toast.error(
          businessesWithoutOpenShift.length === 1
            ? `La caja de ${businessNames[0]} está cerrada`
            : "Hay negocios sin caja abierta",
          { description: "Pide al responsable que abra el turno antes de enviar el pedido." },
        );
        return;
      }
    } else if (!currentCashShift) {
      toast.error("Abre la caja antes de registrar pedidos", {
        description: "Usa el control Caja en la barra superior.",
      });
      return;
    }

    if (marketplaceSelection && !activeMarketplaceSelection) {
      toast.error("El canal elegido no corresponde al menú activo", {
        description: "Selecciona el menú del mismo negocio que los productos del pedido o vuelve a Para llevar.",
      });
      return;
    }
    if (activeMarketplaceSelection) {
      const selectedBusinessForPlatform = [...cartBusinessIds][0];
      if (
        editingOrderId ||
        orderType !== "para_llevar" ||
        cartBusinessIds.size !== 1 ||
        (activeMarketplaceSelection.platform === "uber_eats" && activeMarketplaceSelection.paymentMode !== "app") ||
        (activeMarketplaceSelection.platform === "didi_food" && !["app", "cash"].includes(activeMarketplaceSelection.paymentMode)) ||
        marketplaceConfig.key !== marketplaceConfigKey ||
        !marketplaceConfig.platforms.includes(activeMarketplaceSelection.platform) ||
        !selectedBusinessForPlatform
      ) {
        toast.error("Revisa el canal del pedido y los permisos de plataforma de este negocio.");
        return;
      }
      if (payNow) {
        toast.error("Los pedidos de plataforma se cobran según el método de la app, no desde la caja local.");
        return;
      }
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
    const orderSchedule = activeMarketplaceSelection
      ? null
      :
      (orderType === "para_llevar" || Boolean(whatsappConversationId)) &&
      scheduledFor &&
      kitchenReleaseAt
        ? { scheduledFor, kitchenReleaseAt }
        : editingOrderId && !whatsappConversationId
          ? null
          : undefined;
    setIsSubmitting(true);
    const customerBusinessIds = editingOrderId && editingOrderBusinessId
      ? [editingOrderBusinessId]
      : cartBusinessIds.size > 0
        ? [...cartBusinessIds]
        : activeMenuBusinessId
          ? [activeMenuBusinessId]
          : [];
    const customerIdMatchesOrderBusiness =
      customerBusinessIds.length === 1 && customerIdBusinessId === customerBusinessIds[0];
    let resolvedBusinessCustomerId =
      legacyWhatsappCustomerId || !customerIdMatchesOrderBusiness ? null : customerId;
    const resolvedBusinessCustomerIds: Record<string, string> = {};
    const resolvedLegacyCustomerId = legacyWhatsappCustomerId;
    if (phoneIsUsable && !legacyWhatsappCustomerId && customerBusinessIds.length > 0) {
      let customerResults: Awaited<ReturnType<typeof savePosBusinessCustomerAction>>[];
      try {
        customerResults = await Promise.all(customerBusinessIds.map((businessId) =>
          savePosBusinessCustomerAction({
            businessId,
            customerId: customerIdMatchesOrderBusiness ? customerId : null,
            phone: persistedCustomerPhone,
            displayName: customerName,
          })
        ));
      } catch {
        setIsSubmitting(false);
        toast.error("No se pudo guardar el cliente. La comanda sigue en pantalla.");
        return;
      }
      const failedCustomer = customerResults.find((result) => !result.success);
      if (failedCustomer) {
        setIsSubmitting(false);
        toast.error(failedCustomer.error ?? "No se pudo guardar el cliente de cada negocio.");
        return;
      }
      customerBusinessIds.forEach((businessId, index) => {
        const result = customerResults[index];
        if (result.success) resolvedBusinessCustomerIds[businessId] = result.data.customerId;
      });
      if (customerBusinessIds.length === 1) {
        resolvedBusinessCustomerId = resolvedBusinessCustomerIds[customerBusinessIds[0]];
        setCustomerId(resolvedBusinessCustomerId);
        setCustomerIdBusinessId(customerBusinessIds[0]);
      } else {
        resolvedBusinessCustomerId = null;
        setCustomerId(resolvedBusinessCustomerIds[activeMenuBusinessId ?? ""] ?? null);
        setCustomerIdBusinessId(
          resolvedBusinessCustomerIds[activeMenuBusinessId ?? ""] ? activeMenuBusinessId : null
        );
      }
    } else if (!legacyWhatsappCustomerId) {
      resolvedBusinessCustomerId = null;
      setCustomerId(null);
      setCustomerIdBusinessId(null);
    }
    let orderNumber = editingOrderNumber;
    let createdOrder: Awaited<ReturnType<typeof createOrder>>["order"] = null;
    let createdOrders: Array<{ id: string; number: number }> = [];
    let error: string | null = null;
    let orderCreationKey: string | undefined;
    let attemptOutcome: "committed" | "rejected" | "unknown" | undefined;

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
        resolvedLegacyCustomerId,
        persistedCustomerPhone,
        whatsappConversationId,
        orderSchedule,
        resolvedBusinessCustomerId
      );
      error = result.error;
    } else {
      if (draftPersistenceModeRef.current === "manual") {
        if (!userId) {
          setIsSubmitting(false);
          toast.error("Tu sesión expiró. Inicia sesión y vuelve a intentar.");
          return;
        }
        orderCreationKey = pendingCreationKeyRef.current ?? crypto.randomUUID();
        const attemptDraft: PosCartDraft = {
          items: itemsToSubmit,
          creationKey: orderCreationKey,
          orderType,
          tableId,
          tableNumber,
          orderNotes,
          scheduledFor,
          scheduledForLabel,
          kitchenReleaseAt,
          marketplace: activeMarketplaceSelection,
          deliveryPaymentMethod: isLocalDeliveryPaymentMethod(deliveryPaymentMethod)
            ? deliveryPaymentMethod
            : null,
        };
        if (!savePosCartDraft(userId, attemptDraft)) {
          setIsSubmitting(false);
          toast.error("No se pudo guardar el intento de envío", {
            description: "Revisa el almacenamiento del dispositivo antes de enviar la comanda.",
          });
          return;
        }
        pendingCreationKeyRef.current = orderCreationKey;
        setPendingCreationKey(orderCreationKey);
      }

      let result: Awaited<ReturnType<typeof createOrder>>;
      try {
        result = await createOrder(
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
          resolvedLegacyCustomerId,
          persistedCustomerPhone,
          whatsappConversationId,
        orderSchedule,
        orderCreationKey,
        resolvedBusinessCustomerId,
        resolvedBusinessCustomerIds,
        activeMarketplaceSelection,
        );
    } catch {
      setIsSubmitting(false);
      if (orderCreationKey) {
        setRecoveryState("unavailable");
        setDetailsOpen(false);
        toast.error("No se pudo confirmar si el pedido se envió", {
          description: "La comanda se conserva. Comprueba el envío antes de reintentar.",
        });
      } else {
        toast.error("No se pudo enviar el pedido. Intenta de nuevo.");
      }
      return;
      }
      error = result.error;
      attemptOutcome = result.attemptOutcome;
      createdOrder = result.order;
      createdOrders = result.orders ?? (result.order ? [result.order] : []);
      orderNumber = result.order?.number ?? null;
    }
    setIsSubmitting(false);

    if (error || !orderNumber) {
      if (orderCreationKey) {
        setRecoveryState("unavailable");
        setDetailsOpen(false);
      }

      if (orderCreationKey) {
        toast.error(
          attemptOutcome === "rejected"
            ? "El intento respondió con un error"
            : "No se pudo confirmar si el pedido se envió",
          {
            description: "Conservamos la comanda. Comprueba el envío antes de reintentar.",
          },
        );
      } else {
        toast.error(error ?? "Error al enviar el pedido");
      }
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
    if (orderCreationKey) {
      pendingCreationKeyRef.current = null;
      setPendingCreationKey(null);
      setRecoveryState(null);
    }
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
    setCustomerIdBusinessId(null);
    setLegacyWhatsappCustomerId(null);
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
    setDeliveryColonyMissing(false);
    setPendingColonyRetry(null);
    setDeliveryCoordinates({ latitude: null, longitude: null });
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setOrderNotes("");
    setDeliveryPaymentMethod(null);
    setDeliveryCashTendered(null);
    setMarketplaceSelection(null);
    setDetailsOpen(false);
    setCartOpen(false);
    if (!payNow || !createdOrder) setMode("status");
  }

  async function handleEditOrder(order: OrderWithItems) {
    if (pendingCreationKeyRef.current !== null) return;
    if (order.marketplace_platform) {
      toast.error("Los pedidos de plataforma no se editan después de enviarlos a preparación.");
      return;
    }
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
    setMarketplaceSelection(null);
    setTableId(order.table_id ?? "");
    setTableNumber(order.table_number ?? "");
    setCustomerName(order.customer_name ?? "");
    setCustomerPhone(order.customer_phone ?? "");
    setWhatsappStatusOptIn(order.whatsapp_status_opt_in ?? false);
    setCustomerId(order.source_channel === "whatsapp" ? null : order.business_customer_id ?? null);
    setCustomerIdBusinessId(
      order.source_channel === "whatsapp" || !order.business_customer_id
        ? null
        : order.business_id ?? catalogBusinessId
    );
    setLegacyWhatsappCustomerId(
      order.source_channel === "whatsapp" ? order.customer_id ?? null : null
    );
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
    pendingCreationKeyRef.current = draft.creationKey ?? null;
    setPendingCreationKey(draft.creationKey ?? null);
    setRecoveryState(draft.creationKey ? "checking" : null);
    setCartItems(draft.items);
    setOrderType(draft.orderType);
    setMarketplaceSelection(draft.marketplace ?? null);
    setTableId(draft.tableId);
    setTableNumber(draft.tableNumber);
    setOrderNotes(draft.orderNotes);
    setScheduledFor(draft.scheduledFor);
    setScheduledForLabel(draft.scheduledForLabel);
    setKitchenReleaseAt(draft.kitchenReleaseAt);
    setDeliveryPaymentMethod(
      draft.orderType === "domicilio" && !draft.marketplace
        ? draft.deliveryPaymentMethod ?? null
        : null
    );
  }

  function handleAddOrderForTable(tableIdValue: string, tableNumberValue: string) {
    if (pendingCreationKeyRef.current !== null) return;
    draftPersistenceModeRef.current = "manual";
    clear();
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setOrderType("comedor");
    setMarketplaceSelection(null);
    setTableId(tableIdValue);
    setTableNumber(tableNumberValue);
    setCustomerName("");
    setCustomerPhone("");
    setWhatsappStatusOptIn(false);
    setCustomerId(null);
    setCustomerIdBusinessId(null);
    setLegacyWhatsappCustomerId(null);
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
    setDeliveryColonyMissing(false);
    setPendingColonyRetry(null);
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
      setCustomerIdBusinessId(null);
      setLegacyWhatsappCustomerId(null);
      setWhatsappConversationId(null);
      setScheduledFor(null);
      setScheduledForLabel(null);
      setKitchenReleaseAt(null);
      setCustomerMatches([]);
      setDeliveryAddress("");
      setDeliveryColony("");
      setDeliveryReference("");
      setDeliveryFee(0);
      setDeliveryColonyMissing(false);
      setPendingColonyRetry(null);
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

  const pendingPosRecoveryAction = getPendingPosRecoveryAction(recoveryState);
  const recoveryNotice = pendingCreationKey !== null && recoveryState ? (
    <div
      role="status"
      aria-live="polite"
      className={`mx-2 flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 sm:mx-4 ${
        recoveryState === "unavailable"
          ? "border-warning/35 bg-warning/10"
          : "border-brand/25 bg-brand/5"
      }`}
    >
      {recoveryState === "checking" ? (
        <Loader2 size={17} className="shrink-0 animate-spin text-brand" aria-hidden />
      ) : (
        <CircleAlert
          size={17}
          className={`shrink-0 ${recoveryState === "unavailable" ? "text-warning" : "text-brand"}`}
          aria-hidden
        />
      )}
      <p className="min-w-0 flex-1 font-body text-xs leading-5 text-foreground">
        {recoveryState === "checking"
          ? "Comprobando si el pedido se envió..."
            : recoveryState === "retry"
            ? "El pedido aún no aparece. Conservamos la comanda sin cambios para evitar duplicados; completa los datos que falten y vuelve a enviarla."
            : "No pudimos confirmar el envío. Conservamos la comanda; comprueba el resultado antes de reintentar."}
      </p>
      {pendingPosRecoveryAction ? (
        <button
          type="button"
          onClick={() => {
            if (pendingPosRecoveryAction === "continue") {
              setMode("pos");
              setCartOpen(false);
              setDetailsOpen(true);
              return;
            }
            void checkPendingPosOrder();
          }}
          className="min-h-10 shrink-0 touch-manipulation rounded-lg border border-current/20 px-3 font-heading text-xs font-bold text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {pendingPosRecoveryAction === "continue"
            ? "Completar envío"
            : "Revisar envío"}
        </button>
      ) : null}
    </div>
  ) : null;

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
          {recoveryNotice}
          <SalesHistory />
        </div>
      ) : mode === "status" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {modeSwitcher}
          {recoveryNotice}
          <StatusView
            onEditOrder={handleEditOrder}
            onAddOrderForTable={handleAddOrderForTable}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {modeSwitcher}
            {recoveryNotice}
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
              onOrderTypeChange={handleOrderTypeChange}
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
              recoveryLocked={pendingCreationKey !== null}
              disableSubmit={
                recoveryState === "checking" || recoveryState === "unavailable"
              }
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
                onOrderTypeChange={handleOrderTypeChange}
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
                recoveryLocked={pendingCreationKey !== null}
                disableSubmit={
                  recoveryState === "checking" || recoveryState === "unavailable"
                }
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
          customerMatches={visibleCustomerMatches}
          customerSearchLoading={customerSearchLoading}
          customerSearchReady={
            customerMatchesBusinessId === activeMenuBusinessId &&
            customerMatchesPhone === customerPhoneDigits &&
            !customerSearchLoading
          }
          customerName={customerName}
          customerPhone={customerPhone}
          deliveryAddress={deliveryAddress}
          deliveryColony={deliveryColony}
          deliveryReference={deliveryReference}
          deliveryFee={deliveryFee}
          deliveryDistanceKm={deliveryDistanceKm}
          deliveryConfirmed={deliveryConfirmed}
          deliveryLatitude={deliveryCoordinates.latitude}
          deliveryLongitude={deliveryCoordinates.longitude}
          paymentMethod={deliveryPaymentMethod}
          orderNotes={orderNotes}
          scheduledForLabel={scheduledForLabel}
          scheduledFor={scheduledFor}
          businessTimeZone={activeBusinessTimeZone}
          isSubmitting={isSubmitting}
          disableSubmit={
            recoveryState === "checking" || recoveryState === "unavailable"
          }
          recoveryLocked={pendingCreationKey !== null}
          isEditing={Boolean(editingOrderId)}
          marketplacePlatforms={marketplaceConfigReady ? marketplaceConfig.platforms : []}
          marketplacePrices={marketplaceConfigReady ? marketplaceConfig.prices : {}}
          marketplaceAvailability={marketplaceConfigReady ? marketplaceConfig.availability : {}}
          marketplace={activeMarketplaceSelection}
          marketplaceConfigLoading={marketplaceConfigLoading}
          marketplaceScopeMismatch={marketplaceScopeMismatch}
          onClose={() => !isSubmitting && setDetailsOpen(false)}
          onTableIdChange={(id, label) => {
            setTableId(id);
            setTableNumber(label);
          }}
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={handleCustomerPhoneChange}
          onSelectCustomer={handleSelectCustomer}
          onSelectCustomerAddress={handleSelectCustomerAddress}
          onDeliveryAddressChange={(value) => {
            deliveryQuoteRequestIdRef.current += 1;
            setDeliveryQuoteLoading(false);
            setDeliveryColonyMissing(false);
            setPendingColonyRetry(null);
            setDeliveryAddress(value);
            setDeliveryColony("");
            setDeliveryConfirmed(false);
            setDeliveryFee(0);
            setDeliveryDistanceKm(null);
            setDeliveryCoordinates({ latitude: null, longitude: null });
          }}
          onDeliveryReferenceChange={setDeliveryReference}
          onDeliveryPaymentMethodChange={(method) => {
            setDeliveryPaymentMethod(method);
            setDeliveryCashTendered(null);
          }}
          onOrderNotesChange={setOrderNotes}
          onPickupTimeChange={handlePickupTimeChange}
          onQuoteDelivery={() => void handleQuoteDelivery()}
          deliveryColonyMissing={deliveryColonyMissing}
          onQuoteDeliveryWithoutColony={() => void handleQuoteDeliveryWithoutColony()}
          onSearchDeliveryPlaces={(input, sessionToken) =>
            activeMenuBusinessId
              ? searchManualDeliveryPlacesAction(activeMenuBusinessId, input, sessionToken)
              : Promise.resolve([])
          }
          onSelectDeliveryPlace={handleSelectDeliveryPlace}
          deliveryQuoteLoading={deliveryQuoteLoading}
          onSubmit={(allowUnconfirmedDelivery) =>
            void handleSubmitOrder(false, allowUnconfirmedDelivery)
          }
          onMarketplaceChange={(selection) => {
            setMarketplaceSelection(selection);
            if (selection) {
              setDeliveryPaymentMethod(null);
              setDeliveryCashTendered(null);
              setOrderType("para_llevar");
              setScheduledFor(null);
              setScheduledForLabel(null);
              setKitchenReleaseAt(null);
            }
          }}
          onSelectLocalDelivery={() => {
            setMarketplaceSelection(null);
            setOrderType("domicilio");
            setDeliveryPaymentMethod(null);
            setDeliveryCashTendered(null);
            setScheduledFor(null);
            setScheduledForLabel(null);
            setKitchenReleaseAt(null);
          }}
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
