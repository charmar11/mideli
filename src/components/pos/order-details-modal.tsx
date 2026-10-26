"use client";

import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  Phone,
  Send,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, RestaurantTable, TableMapLabel, TableZone } from "@/types/database";
import type { MarketplaceOrderSelection, MarketplacePlatform, MarketplaceProductAvailability } from "@/lib/marketplace-orders";
import { getPickupChannelOptionState, getUnavailableMarketplaceProductNames, marketplacePaymentLabel, marketplacePlatformLabel } from "@/lib/marketplace-orders";
import type { ManualDeliveryPlaceSuggestion } from "@/lib/actions/delivery";
import type { BusinessCustomerAddress, BusinessCustomerMatch } from "@/types/business-customers";
import { formatPhoneForDisplay } from "@/lib/phone";
import { toOrderTimeInputValue } from "@/lib/order-scheduling";
import { ORDER_TYPE_VISUALS } from "@/lib/order-visuals";
import { getDeliveryWarningReviewLabel } from "@/lib/pos-delivery-warning";
import {
  hasRequiredLocalDeliveryPayment,
  type LocalDeliveryPaymentMethod,
} from "@/lib/local-delivery-payment";
import { UNREGISTERED_DELIVERY_COLONY } from "@/lib/whatsapp/delivery-pricing";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import { TablePicker } from "./table-picker";

type OrderType = "comedor" | "domicilio" | "para_llevar";
type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | null;

interface OrderDetailsModalProps {
  items: CartItem[];
  orderType: OrderType;
  tableId: string;
  tableNumber: string;
  tables: RestaurantTable[];
  zones: TableZone[];
  labels: TableMapLabel[];
  customerId: string | null;
  customerMatches: BusinessCustomerMatch[];
  customerSearchLoading: boolean;
  customerSearchReady: boolean;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryColony: string;
  deliveryReference: string;
  deliveryFee: number;
  deliveryDistanceKm: number | null;
  deliveryConfirmed: boolean;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  paymentMethod: PaymentMethod;
  orderNotes: string;
  scheduledForLabel?: string | null;
  scheduledFor?: string | null;
  businessTimeZone: string;
  isSubmitting: boolean;
  disableSubmit?: boolean;
  recoveryLocked?: boolean;
  isEditing: boolean;
  marketplacePlatforms: MarketplacePlatform[];
  marketplacePrices: Record<string, Partial<Record<MarketplacePlatform, number>>>;
  marketplaceAvailability: MarketplaceProductAvailability;
  marketplace: MarketplaceOrderSelection | null;
  marketplaceConfigLoading?: boolean;
  marketplaceScopeMismatch?: boolean;
  onClose: () => void;
  onTableIdChange: (id: string, label: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onSelectCustomer: (customer: BusinessCustomerMatch) => void;
  onSelectCustomerAddress: (address: BusinessCustomerAddress) => void;
  onDeliveryAddressChange: (value: string) => void;
  onDeliveryReferenceChange: (value: string) => void;
  onDeliveryPaymentMethodChange: (value: LocalDeliveryPaymentMethod) => void;
  onOrderNotesChange: (value: string) => void;
  onPickupTimeChange: (value: string) => void;
  onQuoteDelivery: () => void;
  deliveryColonyMissing: boolean;
  onQuoteDeliveryWithoutColony: () => void;
  onSearchDeliveryPlaces: (input: string, sessionToken: string) => Promise<ManualDeliveryPlaceSuggestion[]>;
  onSelectDeliveryPlace: (
    placeId: string,
    sessionToken: string,
    typedAddress: string,
    fallbackColony: string
  ) => Promise<void>;
  deliveryQuoteLoading: boolean;
  onSubmit: (allowUnconfirmedDelivery?: boolean) => void;
  onPayAndSubmit?: (allowUnconfirmedDelivery?: boolean) => void;
  onMarketplaceChange: (selection: MarketplaceOrderSelection | null) => void;
  onSelectLocalDelivery: () => void;
}

const TYPE_INFO: Record<OrderType, { label: string; icon: typeof UtensilsCrossed }> = {
  comedor: { label: "Comedor", icon: UtensilsCrossed },
  domicilio: { label: "Domicilio", icon: Bike },
  para_llevar: { label: "Para llevar", icon: Package },
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-MX").format(price);
}

function paymentLabel(method: PaymentMethod) {
  if (method === "efectivo") return "Efectivo";
  if (method === "transferencia") return "Transferencia";
  if (method === "tarjeta") return "Tarjeta";
  return "Sin indicar";
}

function detailsTitle(orderType: OrderType) {
  if (orderType === "domicilio") return "Información de entrega";
  if (orderType === "para_llevar") return "Datos para recoger";
  return "Información del comedor";
}

function detailsDescription(orderType: OrderType) {
  if (orderType === "domicilio") return "Confirma el domicilio y completa lo necesario";
  if (orderType === "para_llevar") return "Completa lo necesario para entregar en mostrador";
  return "Completa la mesa y los datos que ayuden al equipo";
}

export function OrderDetailsModal({
  items,
  orderType,
  tableId,
  tableNumber,
  tables,
  zones,
  labels,
  customerId,
  customerMatches,
  customerSearchLoading,
  customerSearchReady,
  customerName,
  customerPhone,
  deliveryAddress,
  deliveryColony,
  deliveryReference,
  deliveryFee,
  deliveryDistanceKm,
  deliveryConfirmed,
  deliveryLatitude,
  deliveryLongitude,
  paymentMethod,
  orderNotes,
  scheduledForLabel,
  scheduledFor,
  businessTimeZone,
  isSubmitting,
  disableSubmit = false,
  recoveryLocked = false,
  isEditing,
  marketplacePlatforms,
  marketplacePrices,
  marketplaceAvailability,
  marketplace,
  marketplaceConfigLoading = false,
  marketplaceScopeMismatch = false,
  onClose,
  onTableIdChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onSelectCustomer,
  onSelectCustomerAddress,
  onDeliveryAddressChange,
  onDeliveryReferenceChange,
  onDeliveryPaymentMethodChange,
  onOrderNotesChange,
  onPickupTimeChange,
  onQuoteDelivery,
  deliveryColonyMissing,
  onQuoteDeliveryWithoutColony,
  onSearchDeliveryPlaces,
  onSelectDeliveryPlace,
  deliveryQuoteLoading,
  onSubmit,
  onPayAndSubmit,
  onMarketplaceChange,
  onSelectLocalDelivery,
}: OrderDetailsModalProps) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [deliveryWarningAction, setDeliveryWarningAction] = useState<"submit" | "pay" | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<ManualDeliveryPlaceSuggestion[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchComplete, setPlaceSearchComplete] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const typeInfo = TYPE_INFO[orderType];
  const TypeIcon = typeInfo.icon;
  const selectedTable = tables.find((table) => table.id === tableId);
  const selectedZone = selectedTable
    ? zones.find((zone) => zone.id === selectedTable.zone_id)
    : null;
  const selectedCustomer = customerMatches.find((customer) => customer.id === customerId) ?? null;
  const selectedSavedAddress = selectedCustomer?.addresses.find((address) =>
    address.formattedAddress === deliveryAddress || address.addressText === deliveryAddress
  ) ?? null;
  const phoneDigits = customerPhone.replace(/\D/g, "");
  const deliveryPhoneReady = phoneDigits.length >= 8 && phoneDigits.length <= 15;
  const phoneSearchable = phoneDigits.length >= 4;
  const itemBasePrice = useCallback((item: CartItem) =>
    marketplace
      ? marketplacePrices[item.menu_item_id]?.[marketplace.platform] ?? item.price
      : item.price, [marketplace, marketplacePrices]);
  const subtotal = items.reduce(
    (sum, item) => sum +
      (itemBasePrice(item) + item.selected_modifiers.reduce((modifierTotal, modifier) => modifierTotal + modifier.price, 0)) * item.quantity,
    0,
  );
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
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
  const businessGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: CartItem[]; subtotal: number }>();
    for (const item of items) {
      const businessId = item.business_id ?? selectedBusinessId ?? "unknown";
      const current = groups.get(businessId) ?? {
        label: businessNames.get(businessId) ?? "Negocio seleccionado",
        items: [],
        subtotal: 0,
      };
      current.items.push(item);
      current.subtotal +=
        (itemBasePrice(item) +
          item.selected_modifiers.reduce(
            (modifierTotal, modifier) => modifierTotal + modifier.price,
            0
          )) * item.quantity;
      groups.set(businessId, current);
    }
    return [...groups.entries()].map(([businessId, group]) => ({
      businessId,
      ...group,
    }));
  }, [businessNames, items, itemBasePrice, selectedBusinessId]);
  const isMixedBusinessCart = businessGroups.length > 1;
  const mixedNeedsComedor = isMixedBusinessCart && orderType !== "comedor";
  const total = subtotal + (orderType === "domicilio" ? deliveryFee : 0);
  const requirement = orderType === "comedor"
    ? { ready: Boolean(tableId || tableNumber), label: "Selecciona una mesa" }
    : orderType === "domicilio"
      ? { ready: Boolean(deliveryAddress.trim()) && Boolean(deliveryColony.trim()) && deliveryConfirmed, label: "Confirma domicilio con Google Maps" }
      : { ready: true, label: "Pedido listo para enviar" };
  const deliveryNeedsLocationWarning = orderType === "domicilio" && !requirement.ready;
  const deliveryNeedsPhoneWarning = orderType === "domicilio" && !deliveryPhoneReady;
  const deliveryNeedsWarning = deliveryNeedsLocationWarning || deliveryNeedsPhoneWarning;
  const pickupChannelOptionState = getPickupChannelOptionState(orderType, marketplace);
  const deliveryPaymentReady = hasRequiredLocalDeliveryPayment(
    orderType,
    Boolean(marketplace),
    paymentMethod
  );
  const deliveryPaymentMissing = !deliveryPaymentReady;
  const canSubmit = !mixedNeedsComedor && !marketplaceConfigLoading &&
    (orderType === "domicilio" || requirement.ready) &&
    deliveryPaymentReady &&
    (!marketplace || marketplacePlatforms.includes(marketplace.platform)) &&
    (!marketplace || getUnavailableMarketplaceProductNames(marketplace.platform, items, marketplaceAvailability).length === 0);
  const unavailableMarketplaceProductNames = marketplace
    ? getUnavailableMarketplaceProductNames(marketplace.platform, items, marketplaceAvailability)
    : [];
  const statusReady = !mixedNeedsComedor && requirement.ready && !deliveryNeedsPhoneWarning && deliveryPaymentReady;
  const statusLabel = mixedNeedsComedor
    ? "Para varios negocios, selecciona Comedor"
    : deliveryNeedsLocationWarning
      ? "Domicilio pendiente. Se pedirá confirmación al enviar"
    : deliveryNeedsPhoneWarning
      ? "Teléfono no registrado. Se pedirá confirmación al enviar"
      : deliveryPaymentMissing
        ? "Selecciona Efectivo o Transferencia"
      : requirement.label;
  const googleMapEmbedUrl =
    deliveryLatitude !== null && deliveryLongitude !== null
      ? `https://www.google.com/maps?q=${deliveryLatitude},${deliveryLongitude}&z=16&output=embed`
      : null;

  const renderSummaryItem = (item: CartItem) => {
    const itemTotal =
      (itemBasePrice(item) +
        item.selected_modifiers.reduce(
          (sum, modifier) => sum + modifier.price,
          0
        )) * item.quantity;
    return (
      <li
        key={item.id}
        className="rounded-xl border border-border bg-surface px-2.5 py-2 sm:rounded-2xl sm:p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-xs font-bold text-foreground sm:text-sm">
              <span className="mr-1 font-data text-brand">{item.quantity}x</span>
              {item.name}
            </p>
            {item.selected_modifiers.length > 0 ? (
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                {item.selected_modifiers
                  .map((modifier) =>
                    modifier.group && modifier.group !== "Incluye"
                      ? `${modifier.group}: ${modifier.option}`
                      : modifier.option
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {item.notes ? (
              <p className="mt-1 font-body text-xs text-muted-foreground">Nota: {item.notes}</p>
            ) : null}
          </div>
          <span className="shrink-0 font-data text-sm font-bold text-foreground">
            ${formatPrice(itemTotal)}
          </span>
        </div>
      </li>
    );
  };

  function newPlacesSession() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (!sessionTokenRef.current) sessionTokenRef.current = newPlacesSession();
  }, []);

  useEffect(() => {
    if (
      orderType !== "domicilio" ||
      deliveryConfirmed ||
      deliveryQuoteLoading ||
      deliveryAddress.trim().length < 3
    ) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPlaceSearchLoading(true);
      try {
        const suggestions = await onSearchDeliveryPlaces(
          deliveryAddress,
          sessionTokenRef.current ?? newPlacesSession()
        );
        if (!cancelled) setPlaceSuggestions(suggestions);
      } catch {
        if (!cancelled) setPlaceSuggestions([]);
      } finally {
        if (!cancelled) {
          setPlaceSearchLoading(false);
          setPlaceSearchComplete(true);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    deliveryAddress,
    deliveryConfirmed,
    deliveryQuoteLoading,
    onSearchDeliveryPlaces,
    orderType,
  ]);

  function handleDeliveryAddressChange(value: string) {
    setPlaceSuggestions([]);
    setPlaceSearchComplete(false);
    onDeliveryAddressChange(value);
  }

  async function handlePlaceSelect(suggestion: ManualDeliveryPlaceSuggestion) {
    const sessionToken = sessionTokenRef.current ?? newPlacesSession();
    const typedAddress = deliveryAddress;
    const fallbackColony = deliveryColony;
    setPlaceSuggestions([]);
    setPlaceSearchComplete(false);
    // Invalidate any old quote without replacing the text the operator typed.
    onDeliveryAddressChange(typedAddress);
    sessionTokenRef.current = newPlacesSession();
    await onSelectDeliveryPlace(suggestion.placeId, sessionToken, typedAddress, fallbackColony);
  }

  function requestSubmit(action: "submit" | "pay") {
    if (deliveryNeedsWarning) {
      setDeliveryWarningAction(action);
      return;
    }
    if (action === "pay") {
      onPayAndSubmit?.();
    } else {
      onSubmit();
    }
  }

  function confirmUnconfirmedDelivery() {
    const action = deliveryWarningAction;
    setDeliveryWarningAction(null);
    if (action === "pay") {
      onPayAndSubmit?.(true);
    } else if (action === "submit") {
      onSubmit(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-x-hidden bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        className="flex h-[100dvh] min-w-0 w-full max-w-5xl flex-col overflow-hidden rounded-none border border-border bg-surface shadow-float sm:h-[min(90dvh,800px)] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Volver al pedido"
              className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="font-heading text-base font-bold text-foreground sm:text-lg" id="order-details-title">
                Datos del pedido
              </p>
              <p className="hidden truncate font-body text-xs text-muted-foreground sm:block">
                Revisa la comanda y completa lo necesario antes de enviarla
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar"
            className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>
        {scheduledForLabel ? (
          <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 font-body text-xs text-gold sm:mx-6">
            <span aria-hidden>🕒</span>
            Pedido programado para hoy a las <strong>{scheduledForLabel}</strong>
          </div>
        ) : null}

        <div
          className={`shrink-0 border-b px-3 py-2.5 sm:px-6 ${statusReady ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"}`}
          aria-live="polite"
        >
          <div className={`flex items-center gap-2 font-heading text-xs font-bold ${statusReady ? "text-success" : "text-warning"}`}>
            {statusReady ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-x-hidden overflow-y-hidden lg:grid-cols-[minmax(17rem,0.85fr)_minmax(24rem,1.15fr)]">
          <div className="hidden max-h-[34dvh] min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain border-b border-border bg-background/45 p-3 sm:max-h-none sm:p-6 lg:block lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${ORDER_TYPE_VISUALS[orderType].icon}`}>
                <TypeIcon size={19} />
              </div>
              <div>
                <p className="font-heading text-sm font-bold">{typeInfo.label}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {items.reduce((sum, item) => sum + item.quantity, 0)} artículos
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between sm:mt-5">
              <h2 className="font-heading text-sm font-bold text-foreground">Comanda</h2>
              <span className="hidden font-data text-xs text-muted-foreground sm:inline">{items.length} líneas</span>
            </div>
            {isMixedBusinessCart ? (
              <div className="mt-2 space-y-3 sm:mt-3">
                <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 font-body text-xs leading-5 text-warning">
                  Se crearán {businessGroups.length} pedidos relacionados, uno por negocio, con su propia cuenta.
                </p>
                {businessGroups.map((group) => (
                  <section key={group.businessId}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                      <h3 className="font-heading text-[11px] font-bold uppercase tracking-wide text-brand">
                        {group.label}
                      </h3>
                      <span className="font-data text-[11px] text-muted-foreground">
                        ${formatPrice(group.subtotal)}
                      </span>
                    </div>
                    <ul className="space-y-1.5 sm:space-y-2">
                      {group.items.map(renderSummaryItem)}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
                {items.map(renderSummaryItem)}
              </ul>
            )}

            <div className="mt-3 space-y-1.5 border-t border-border pt-3 font-body text-xs sm:mt-5 sm:space-y-2 sm:pt-4 sm:text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-data">${formatPrice(subtotal)}</span>
              </div>
              {orderType === "domicilio" && deliveryFee > 0 ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Envío</span>
                  <span className="font-data">${formatPrice(deliveryFee)}</span>
                </div>
              ) : null}
              <div className="flex items-end justify-between pt-2">
                <span className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-data text-2xl font-bold text-brand sm:text-3xl">${formatPrice(total)}</span>
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain bg-surface p-3 sm:p-6">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-heading text-sm font-bold text-foreground">
                  {marketplace ? `Pedido de ${marketplacePlatformLabel(marketplace.platform)}` : detailsTitle(orderType)}
                </p>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {marketplace ? "Sin domicilio ni envío local. Se prepara y entrega al repartidor de la plataforma." : detailsDescription(orderType)}
                </p>
              </div>
              {marketplace ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1.5 font-heading text-[10px] font-bold text-gold">
                  <CreditCard size={13} /> {marketplacePaymentLabel(marketplace.platform, marketplace.paymentMode)}
                </span>
              ) : paymentMethod ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1.5 font-heading text-[10px] font-bold text-gold">
                  <CreditCard size={13} /> {paymentLabel(paymentMethod)}
                </span>
              ) : null}
            </div>

            {!isEditing && orderType !== "comedor" && (marketplacePlatforms.length > 0 || marketplaceConfigLoading || marketplaceScopeMismatch) ? (
              <section aria-label="Canal de venta" className="mt-3 rounded-2xl border border-border bg-background p-3 sm:mt-4 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-xs font-bold text-foreground">Tipo de entrega</h2>
                    <p className="mt-1 font-body text-[11px] text-muted-foreground">Elige domicilio local, para llevar o una plataforma.</p>
                  </div>
                  {marketplaceConfigLoading ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : null}
                </div>
                {marketplaceScopeMismatch ? (
                  <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 font-body text-[11px] leading-4 text-muted-foreground">
                    El menú activo y los productos del pedido son de negocios distintos. Vuelve al menú correspondiente para ver sus plataformas y precios.
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    aria-pressed={orderType === "domicilio" && !marketplace}
                    onClick={onSelectLocalDelivery}
                    className={`min-h-11 rounded-xl border px-3 font-heading text-xs font-bold transition-colors ${orderType === "domicilio" && !marketplace ? "border-brand bg-brand/12 text-brand" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
                  >Domicilio local</button>
                  {pickupChannelOptionState !== "hidden" ? (
                    <button
                      type="button"
                      aria-pressed={pickupChannelOptionState === "selected"}
                      onClick={() => onMarketplaceChange(null)}
                      className={`min-h-11 rounded-xl border px-3 font-heading text-xs font-bold transition-colors ${pickupChannelOptionState === "selected" ? "border-brand bg-brand/12 text-brand" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
                    >Para llevar</button>
                  ) : null}
                  {marketplacePlatforms.map((platform) => {
                    const selected = marketplace?.platform === platform;
                    const uberEats = platform === "uber_eats";
                    const label = marketplacePlatformLabel(platform) ?? "Plataforma";

                    return (
                      <button
                        key={platform}
                        type="button"
                        aria-label={label}
                        aria-pressed={selected}
                        onClick={() => onMarketplaceChange({ platform, paymentMode: "app" })}
                        className={`flex min-h-12 items-center justify-center rounded-xl border px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${uberEats
                          ? selected
                            ? "border-[#06C167] bg-[#06C167]/10 shadow-[inset_0_0_0_1px_#06C167]"
                            : "border-[#06C167]/35 bg-[#142328] hover:border-[#06C167]"
                          : selected
                            ? "border-[#FF7D41] bg-[#FF7D41]/10 shadow-[inset_0_0_0_1px_#FF7D41]"
                            : "border-[#FF7D41]/35 bg-[#FF7D41]/5 hover:border-[#FF7D41]"}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-8 items-center justify-center rounded-md px-2 ${uberEats ? "bg-[#F6F0EA]" : "bg-[#FF7D41]"}`}
                        >
                          <Image
                            src={uberEats ? "/marketplaces/uber-eats.svg" : "/marketplaces/didi-food-white.svg"}
                            alt=""
                            width={96}
                            height={17}
                            className="h-[17px] w-24 object-contain"
                          />
                        </span>
                        <span className="sr-only">{label}</span>
                      </button>
                    );
                  })}
                </div>
                {marketplace?.platform === "didi_food" ? (
                  <fieldset className="mt-3">
                    <legend className="font-heading text-[11px] font-bold text-muted-foreground">¿Cómo pagará el repartidor?</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([
                        { value: "app", label: "Pagado en la app" },
                        { value: "cash", label: "Efectivo al entregar" },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={marketplace.paymentMode === option.value}
                          onClick={() => onMarketplaceChange({ platform: "didi_food", paymentMode: option.value })}
                          className={`min-h-11 rounded-xl border px-2.5 font-heading text-[11px] font-bold transition-colors ${marketplace.paymentMode === option.value ? "border-gold bg-gold/10 text-gold" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
                        >{option.label}</button>
                      ))}
                    </div>
                    {marketplace.paymentMode === "cash" ? (
                      <p className="mt-2 font-body text-[11px] leading-4 text-muted-foreground">El importe real se anotará cuando se entregue al repartidor. No se calcula ni se agrega al pedido por adelantado.</p>
                    ) : null}
                  </fieldset>
                ) : null}
                {marketplace && unavailableMarketplaceProductNames.length > 0 ? (
                  <div role="alert" className="mt-3 rounded-xl border border-warning/30 bg-warning/8 p-3">
                    <p className="font-heading text-xs font-bold text-warning">
                      No disponible en {marketplacePlatformLabel(marketplace.platform)}
                    </p>
                    <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                      {unavailableMarketplaceProductNames.join(", ")}. Quita esos productos o cambia el tipo de entrega para continuar.
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="mt-3 grid min-w-0 gap-2.5 sm:mt-4 sm:grid-cols-2 sm:gap-3">
              <div className="sm:col-span-2">
                  <span className="mb-1.5 flex items-center gap-1.5 font-heading text-xs font-bold text-muted-foreground">
                  <Phone size={13} className="text-brand" /> Teléfono del cliente <span className="font-body font-normal">(opcional)</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={customerPhone ? formatPhoneForDisplay(customerPhone) : ""}
                  onChange={(event) => onCustomerPhoneChange(event.target.value)}
                  placeholder={orderType === "domicilio" ? "Celular del cliente (opcional)" : orderType === "comedor" ? "Opcional para comedor" : "Teléfono o últimos 4 dígitos"}
                  className="h-12 w-full rounded-xl border border-brand/35 bg-background px-3 font-data text-sm text-foreground outline-none transition-colors placeholder:font-body placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground sm:placeholder:text-sm focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
                {phoneSearchable && (customerSearchLoading || customerSearchReady) ? (
                  <div className="mt-2 max-h-64 touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-border bg-background">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="font-heading text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {customerSearchLoading ? "Buscando clientes..." : "Coincidencias"}
                      </span>
                      {customerMatches.length > 0 ? (
                        <span className="font-data text-[10px] text-muted-foreground">{customerMatches.length}</span>
                      ) : null}
                    </div>
                    {customerMatches.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          onSelectCustomer(customer);
                        }}
                        className={`flex min-h-12 w-full touch-manipulation items-center justify-between gap-3 border-b border-border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset last:border-b-0 hover:bg-surface-raised ${
                          customer.id === customerId ? "bg-brand/10" : ""
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-heading text-sm font-bold text-foreground">
                            {customer.displayName || "Cliente sin nombre"}
                          </span>
                          <span className="block font-data text-xs text-muted-foreground">{formatPhoneForDisplay(customer.phone)}</span>
                        </span>
                        <span className="shrink-0 font-body text-[11px] text-muted-foreground">
                          {customer.addresses.length} domicilio{customer.addresses.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    ))}
                    {!customerSearchLoading && customerMatches.length === 0 ? (
                      <p className="px-3 py-3 font-body text-xs text-muted-foreground">
                        No hay un cliente registrado con ese teléfono. Puedes continuar y guardarlo en el pedido.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {selectedCustomer && orderType === "domicilio" ? (
                  <label className="mt-2 block rounded-xl border border-success/20 bg-success/5 p-2.5">
                    <span className="mb-1.5 block font-heading text-[11px] font-bold uppercase tracking-wide text-success">
                      {selectedCustomer.addresses.length > 0 ? "Domicilios guardados" : "Domicilio del cliente"}
                    </span>
                    <select
                      value={selectedSavedAddress?.id ?? ""}
                      onChange={(event) => {
                        const address = selectedCustomer.addresses.find((candidate) => candidate.id === event.target.value);
                        if (address) {
                          onSelectCustomerAddress(address);
                        } else {
                          onDeliveryAddressChange("");
                          onDeliveryReferenceChange("");
                        }
                      }}
                      className="h-11 w-full rounded-lg border border-success/25 bg-background px-3 font-body text-xs text-foreground outline-none focus:border-success focus:ring-2 focus:ring-success/20"
                    >
                      <option value="">Escribir otro domicilio…</option>
                      {selectedCustomer.addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label || (address.isDefault ? "Principal" : "Domicilio")} · {address.formattedAddress || address.addressText} · Col. {address.colony || "No registrada"}
                        </option>
                      ))}
                    </select>
                    {selectedSavedAddress ? (
                      <span className="mt-1.5 block font-heading text-[11px] font-bold text-gold">
                        🏘️ Colonia: {selectedSavedAddress.colony || "No registrada"}
                      </span>
                    ) : (
                      <span className="mt-1.5 block font-body text-[11px] text-muted-foreground">
                        El domicilio nuevo se guardará en el cliente al enviar el pedido.
                      </span>
                    )}
                  </label>
                ) : null}
              </div>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Nombre del cliente <span className="font-body font-normal">(opcional)</span></span>
                <input
                  value={customerName}
                  onChange={(event) => onCustomerNameChange(event.target.value)}
                  placeholder="Nombre del cliente"
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 font-heading text-sm text-foreground outline-none transition-colors placeholder:font-body placeholder:font-normal placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>

              {orderType === "comedor" ? (
                <div className="sm:col-span-2">
                  <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Mesa</span>
                  <button
                    type="button"
                    onClick={() => setTablePickerOpen(true)}
                    disabled={recoveryLocked}
                    className="flex h-12 w-full touch-manipulation items-center justify-between rounded-xl border border-border bg-background px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:border-brand/60 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UtensilsCrossed size={17} className={selectedTable ? "text-brand" : "text-muted-foreground"} />
                      <span className="truncate font-heading text-sm font-semibold text-foreground">
                        {selectedTable?.name ?? tableNumber ?? "Elegir mesa"}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                  {selectedTable ? (
                    <p className="mt-1.5 px-1 font-body text-xs text-muted-foreground">
                      {selectedZone?.name ?? "Zona sin nombre"} · {selectedTable.capacity} personas
                    </p>
                  ) : null}
                  {tablePickerOpen ? (
                    <TablePicker
                      zones={zones}
                      tables={tables}
                      labels={labels}
                      selectedTableId={tableId}
                      onClose={() => setTablePickerOpen(false)}
                      onConfirm={(table) => {
                        onTableIdChange(table.id, table.name);
                        setTablePickerOpen(false);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}

              {orderType === "domicilio" ? (
                <>
                  {!marketplace ? <fieldset className="sm:col-span-2">
                    <legend className="mb-1.5 font-heading text-xs font-bold text-muted-foreground">
                      ¿Cómo pagará el cliente? <span className="font-body font-normal">(obligatorio)</span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["efectivo", "Efectivo"],
                        ["transferencia", "Transferencia"],
                      ] as const).map(([method, label]) => {
                        const selected = paymentMethod === method;
                        return (
                          <button
                            key={method}
                            type="button"
                            aria-pressed={selected}
                            disabled={recoveryLocked || isSubmitting}
                            onClick={() => onDeliveryPaymentMethodChange(method)}
                            className={`flex min-h-12 touch-manipulation items-center justify-between gap-2 rounded-xl border px-3 text-left font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-55 ${selected ? "border-brand bg-brand/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-brand/60 hover:text-foreground"}`}
                          >
                            <span>{label}</span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-brand bg-brand text-white" : "border-muted-foreground/50"}`}>
                              {selected ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 font-body text-[11px] text-muted-foreground" aria-live="polite">
                      {paymentMethod === "efectivo"
                        ? "El mensaje al repartidor indicará productos + envío."
                        : paymentMethod === "transferencia"
                          ? "El mensaje al repartidor indicará transferencia."
                          : "Selecciona una opción para habilitar el envío."}
                    </p>
                  </fieldset> : null}
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Domicilio</span>
                    <textarea
                      value={deliveryAddress}
                      onChange={(event) => handleDeliveryAddressChange(event.target.value)}
                      placeholder="Calle y número, colonia, plaza o parque"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                    <span className="mt-1.5 block font-body text-[11px] leading-4 text-muted-foreground">
                      Si la sabes, añade la colonia en este mismo campo como “Col. Nombre” o “Fracc. Nombre”. También puedes buscar plazas y parques o pegar un enlace de Maps. Si es una zona nueva sin colonia oficial, aparecerá una opción para cotizar por distancia.
                    </span>
                    {!deliveryConfirmed && deliveryAddress.trim().length >= 3 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                        <div className="flex items-center justify-between border-b border-border px-3 py-2">
                          <span className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Buscar con Google Maps
                          </span>
                          <span className="font-body text-[10px] text-muted-foreground">Resultados cercanos</span>
                        </div>
                        {placeSearchLoading ? (
                          <div className="flex min-h-11 items-center gap-2 px-3 font-body text-xs text-muted-foreground">
                            <Loader2 size={14} className="animate-spin" /> Buscando ubicaciones...
                          </div>
                        ) : placeSuggestions.length > 0 ? (
                          <div className="divide-y divide-border">
                            {placeSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.placeId}
                                type="button"
                                disabled={deliveryQuoteLoading}
                                onClick={() => void handlePlaceSelect(suggestion)}
                                className="flex min-h-14 w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                              >
                                <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
                                <span className="min-w-0">
                                  <span className="block truncate font-heading text-xs font-bold text-foreground">
                                    {suggestion.primaryText}
                                  </span>
                                  <span className="mt-0.5 block truncate font-body text-[11px] text-muted-foreground">
                                    {suggestion.secondaryText || suggestion.description}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : placeSearchComplete ? (
                          <div className="px-3 py-2.5 font-body text-xs text-muted-foreground">
                            No hay sugerencias para ese texto. Puedes corregirlo o intentar la búsqueda manual.
                          </div>
                        ) : null}
                        <p className="border-t border-border px-3 py-2 font-body text-[10px] leading-4 text-muted-foreground">
                          Comprueba calle y número antes de elegir. Si no aparece, usa “Buscar y confirmar domicilio”.
                        </p>
                      </div>
                    ) : null}
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={onQuoteDelivery}
                      disabled={deliveryQuoteLoading || deliveryAddress.trim().length < 8}
                      className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-success px-3 font-heading text-sm font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:bg-success/85 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MapPin size={16} />
                      {deliveryQuoteLoading ? "Localizando domicilio..." : "Buscar y confirmar domicilio"}
                    </button>
                  </div>
                  {deliveryColonyMissing && !deliveryConfirmed ? (
                    <div className="sm:col-span-2 rounded-xl border border-warning/30 bg-warning/8 p-3">
                      <div className="flex items-start gap-2">
                        <CircleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
                        <div className="min-w-0">
                          <p className="font-heading text-xs font-bold text-warning">
                            Maps ubicó la calle, pero no reconoce una colonia
                          </p>
                          <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                            Si esta zona todavía no tiene colonia oficial, puedes calcular el envío por distancia. No se agregará recargo de colonia; confirma el precio con el repartidor.
                          </p>
                          <button
                            type="button"
                            onClick={onQuoteDeliveryWithoutColony}
                            disabled={deliveryQuoteLoading}
                            className="mt-2.5 inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-warning/40 bg-warning/12 px-3 font-heading text-xs font-bold text-warning transition-colors hover:bg-warning/20 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                          >
                            {deliveryQuoteLoading ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
                            Cotizar por distancia, sin colonia
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2 overflow-hidden rounded-2xl border border-border bg-background">
                    {googleMapEmbedUrl ? (
                      <iframe
                        title="Mapa del domicilio confirmado"
                        src={googleMapEmbedUrl}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        className="h-48 w-full border-0"
                      />
                    ) : (
                      <div className="flex h-32 flex-col items-center justify-center gap-2 px-5 text-center">
                        <MapPin size={24} className="text-muted-foreground/60" />
                        <p className="font-body text-xs text-muted-foreground">El mapa aparecerá después de localizar el domicilio</p>
                      </div>
                    )}
                    {deliveryConfirmed ? (
                      <div className="border-t border-success/15 bg-success/8 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-xs font-bold text-success">
                          <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> Punto confirmado</span>
                          {deliveryDistanceKm !== null ? <span>{deliveryDistanceKm.toFixed(1)} km</span> : null}
                          <span>Envío ${formatPrice(deliveryFee)}</span>
                        </div>
                        <p className={`mt-1 font-heading text-xs font-bold ${deliveryColony === UNREGISTERED_DELIVERY_COLONY ? "text-warning" : "text-gold"}`}>
                          🏘️ Colonia: {deliveryColony || "No registrada"}
                        </p>
                        {deliveryColony === UNREGISTERED_DELIVERY_COLONY ? (
                          <p className="mt-1 font-body text-[11px] leading-4 text-warning">
                            Envío calculado solo por distancia. Sin recargo de colonia.
                          </p>
                        ) : null}
                        {deliveryLatitude !== null && deliveryLongitude !== null ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${deliveryLatitude},${deliveryLongitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex min-h-8 items-center gap-1 font-heading text-xs font-bold text-success underline"
                          >
                            <MapPin size={13} /> Abrir en Google Maps
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Referencia o acceso <span className="font-body font-normal">(opcional)</span></span>
                    <input
                      value={deliveryReference}
                      onChange={(event) => onDeliveryReferenceChange(event.target.value)}
                      placeholder="Casa blanca, privada, pin, portón..."
                      className="h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                  </label>
                </>
              ) : null}

              {orderType === "para_llevar" && !marketplace ? (
                <label className="sm:col-span-2 rounded-xl border border-border bg-background/70 p-3">
                  <span className="mb-1.5 flex items-center gap-1.5 font-heading text-xs font-bold text-muted-foreground">
                    <Clock3 size={14} className="text-brand" /> Hora para recoger <span className="font-body font-normal">(opcional, hoy)</span>
                  </span>
                  <input
                    type="time"
                    value={toOrderTimeInputValue(scheduledFor, businessTimeZone)}
                    onChange={(event) => onPickupTimeChange(event.target.value)}
                    className="h-12 w-full rounded-xl border border-border bg-background px-3 font-data text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 sm:max-w-xs"
                  />
                  <span className="mt-1.5 block font-body text-[11px] leading-4 text-muted-foreground">
                    Déjalo vacío si el pedido se recogerá en cuanto esté listo.
                  </span>
                </label>
              ) : null}

              <label className="sm:col-span-2">
                <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Nota general <span className="font-body font-normal">(opcional)</span></span>
                <textarea
                  value={orderNotes}
                  onChange={(event) => onOrderNotesChange(event.target.value)}
                  disabled={recoveryLocked}
                  placeholder="Ej. mitad de un sabor y mitad de otro"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-ink px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-white sm:px-6 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex items-center justify-between gap-4 sm:block">
              <p className="font-heading text-xs font-bold uppercase tracking-wider text-white/55">Total</p>
              <p className="font-data text-xl font-bold sm:text-2xl">${formatPrice(total)}</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:min-w-[22rem]">
              {onPayAndSubmit && !isEditing && !marketplace ? (
                <button
                  type="button"
                  onClick={() => requestSubmit("pay")}
                  disabled={isSubmitting || disableSubmit || !canSubmit}
                  className="order-2 flex min-h-16 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 font-heading text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset hover:bg-white/15 active:scale-[0.99] disabled:opacity-60 sm:order-1 sm:h-12 sm:min-h-0 sm:gap-2 sm:rounded-xl sm:px-4"
                >
                  <CreditCard size={18} /> Cobrar y enviar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => requestSubmit("submit")}
                disabled={isSubmitting || disableSubmit || !canSubmit}
                className="action-success order-1 flex min-h-16 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-2xl px-4 font-heading text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:h-12 sm:min-h-0 sm:gap-2 sm:rounded-xl sm:px-4"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {isEditing ? "Guardar cambios" : "Enviar a preparación"}
              </button>
            </div>
          </div>
        </footer>
      </section>

      {deliveryWarningAction ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delivery-warning-title"
            className="w-full max-w-md rounded-2xl border border-warning/35 bg-surface p-5 shadow-float"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                <CircleAlert size={21} />
              </div>
              <div>
                  <h2 id="delivery-warning-title" className="font-heading text-base font-bold text-foreground">
                  Datos de entrega incompletos
                  </h2>
                <p className="mt-2 font-body text-sm leading-5 text-muted-foreground">
                  El pedido puede enviarse a cocina, pero quedará pendiente completar:
                </p>
                <ul className="mt-2 space-y-1 font-body text-sm leading-5 text-muted-foreground">
                  {deliveryNeedsLocationWarning ? <li>• Ubicación, colonia o cálculo de envío</li> : null}
                  {deliveryNeedsPhoneWarning ? <li>• Teléfono de contacto del cliente</li> : null}
                </ul>
                <p className="mt-2 font-body text-sm leading-5 text-muted-foreground">
                  Si estás seguro, puedes enviarlo así y completarlo después desde Estado.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeliveryWarningAction(null)}
                className="min-h-12 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
              >
                {getDeliveryWarningReviewLabel(
                  deliveryNeedsLocationWarning,
                  deliveryNeedsPhoneWarning,
                )}
              </button>
              <button
                type="button"
                onClick={confirmUnconfirmedDelivery}
                className="min-h-12 rounded-xl bg-warning px-4 font-heading text-sm font-bold text-ink transition-colors hover:bg-warning/85"
              >
                Enviar así
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
