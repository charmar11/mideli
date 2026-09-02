"use client";

import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  Phone,
  Send,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useState } from "react";
import type { CartItem, RestaurantTable, TableMapLabel, TableZone } from "@/types/database";
import type { PosCustomerMatch, WhatsappCustomerAddress } from "@/lib/whatsapp/admin-types";
import { formatPhoneForDisplay } from "@/lib/whatsapp/normalize";
import { ORDER_TYPE_VISUALS } from "@/lib/order-visuals";
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
  customerMatches: PosCustomerMatch[];
  customerSearchLoading: boolean;
  customerName: string;
  customerPhone: string;
  whatsappStatusOptIn: boolean;
  deliveryAddress: string;
  deliveryReference: string;
  deliveryFee: number;
  deliveryDistanceKm: number | null;
  deliveryConfirmed: boolean;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  paymentMethod: PaymentMethod;
  cashTendered: number | null;
  orderNotes: string;
  isSubmitting: boolean;
  isEditing: boolean;
  onClose: () => void;
  onTableIdChange: (id: string, label: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onWhatsappStatusOptInChange: (value: boolean) => void;
  onSelectCustomer: (customer: PosCustomerMatch) => void;
  onSelectCustomerAddress: (address: WhatsappCustomerAddress) => void;
  onDeliveryAddressChange: (value: string) => void;
  onDeliveryReferenceChange: (value: string) => void;
  onOrderNotesChange: (value: string) => void;
  onQuoteDelivery: () => void;
  deliveryQuoteLoading: boolean;
  onSubmit: () => void;
  onPayAndSubmit?: () => void;
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
  customerName,
  customerPhone,
  whatsappStatusOptIn,
  deliveryAddress,
  deliveryReference,
  deliveryFee,
  deliveryDistanceKm,
  deliveryConfirmed,
  deliveryLatitude,
  deliveryLongitude,
  paymentMethod,
  cashTendered,
  orderNotes,
  isSubmitting,
  isEditing,
  onClose,
  onTableIdChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onWhatsappStatusOptInChange,
  onSelectCustomer,
  onSelectCustomerAddress,
  onDeliveryAddressChange,
  onDeliveryReferenceChange,
  onOrderNotesChange,
  onQuoteDelivery,
  deliveryQuoteLoading,
  onSubmit,
  onPayAndSubmit,
}: OrderDetailsModalProps) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [savedAddressesOpen, setSavedAddressesOpen] = useState(false);
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
  const phoneSearchable = customerPhone.replace(/\D/g, "").length >= 4;
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (item.price + item.selected_modifiers.reduce((modifierTotal, modifier) => modifierTotal + modifier.price, 0)) *
        item.quantity,
    0
  );
  const total = subtotal + (orderType === "domicilio" ? deliveryFee : 0);
  const requirement = orderType === "comedor"
    ? { ready: Boolean(tableId || tableNumber), label: "Selecciona una mesa" }
    : orderType === "domicilio"
      ? { ready: Boolean(deliveryAddress.trim()) && deliveryConfirmed, label: "Confirma el domicilio con Maps" }
      : { ready: true, label: "Pedido listo para enviar" };
  const canSubmit = requirement.ready;
  const googleMapEmbedUrl =
    deliveryLatitude !== null && deliveryLongitude !== null
      ? `https://www.google.com/maps?q=${deliveryLatitude},${deliveryLongitude}&z=16&output=embed`
      : null;

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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
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
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className={`shrink-0 border-b px-3 py-2.5 sm:px-6 ${canSubmit ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"}`}
          aria-live="polite"
        >
          <div className={`flex items-center gap-2 font-heading text-xs font-bold ${canSubmit ? "text-success" : "text-warning"}`}>
            {canSubmit ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
            <span>{requirement.label}</span>
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
            <ul className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
              {items.map((item) => {
                const itemTotal =
                  (item.price + item.selected_modifiers.reduce((sum, modifier) => sum + modifier.price, 0)) *
                  item.quantity;
                return (
                  <li key={item.id} className="rounded-xl border border-border bg-surface px-2.5 py-2 sm:rounded-2xl sm:p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading text-xs font-bold text-foreground sm:text-sm">
                          <span className="mr-1 font-data text-brand">{item.quantity}x</span>
                          {item.name}
                        </p>
                        {item.selected_modifiers.length > 0 ? (
                          <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                            {item.selected_modifiers.map((modifier) => modifier.option).join(" · ")}
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
              })}
            </ul>

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
                <p className="font-heading text-sm font-bold text-foreground">Información de entrega</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">Solo completa lo que aplique</p>
              </div>
              {paymentMethod ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1.5 font-heading text-[10px] font-bold text-gold">
                  <CreditCard size={13} /> {paymentLabel(paymentMethod)}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid min-w-0 gap-2.5 sm:mt-4 sm:grid-cols-2 sm:gap-3">
              <label className="sm:col-span-2">
                  <span className="mb-1.5 flex items-center gap-1.5 font-heading text-xs font-bold text-muted-foreground">
                  <Phone size={13} className="text-brand" /> Teléfono del cliente {orderType === "comedor" ? "(opcional)" : null}
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={customerPhone ? formatPhoneForDisplay(customerPhone) : ""}
                  onChange={(event) => onCustomerPhoneChange(event.target.value)}
                  placeholder={orderType === "comedor" ? "Opcional para comedor" : "Teléfono o últimos 4 dígitos"}
                  className="h-12 w-full rounded-xl border border-brand/35 bg-background px-3 font-data text-sm text-foreground outline-none transition-colors placeholder:font-body placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground sm:placeholder:text-sm focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
                {phoneSearchable && (customerSearchLoading || customerMatches.length > 0) ? (
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
                        onClick={() => onSelectCustomer(customer)}
                        className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-3 text-left last:border-b-0 hover:bg-surface-raised ${
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
                {selectedCustomer && selectedCustomer.addresses.length > 0 && orderType === "domicilio" ? (
                  <div className="mt-2 rounded-xl border border-success/20 bg-success/5 p-2.5">
                    <button
                      type="button"
                      onClick={() => setSavedAddressesOpen((open) => !open)}
                      aria-expanded={savedAddressesOpen}
                      className="flex min-h-12 min-w-0 w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-heading text-[11px] font-bold uppercase tracking-wide text-success">
                          {selectedSavedAddress ? "Dirección seleccionada" : "Elegir dirección guardada"}
                        </span>
                        <span className="mt-0.5 block break-words whitespace-normal font-body text-xs leading-5 text-foreground">
                          {selectedSavedAddress?.formattedAddress || selectedSavedAddress?.addressText || `${selectedCustomer.addresses.length} direcciones disponibles`}
                        </span>
                      </span>
                      <ChevronDown size={17} className={`shrink-0 text-success transition-transform ${savedAddressesOpen ? "rotate-180" : ""}`} />
                    </button>
                    {savedAddressesOpen ? (
                      <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto border-t border-success/15 pt-2">
                        {selectedCustomer.addresses.map((address) => (
                          <button
                            key={address.id}
                            type="button"
                            onClick={() => {
                              onSelectCustomerAddress(address);
                              setSavedAddressesOpen(false);
                            }}
                           className={`flex min-h-12 min-w-0 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:border-success/50 ${selectedSavedAddress?.id === address.id ? "border-success/50 bg-success/10" : "border-border bg-background"}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block break-words whitespace-normal font-heading text-xs font-bold leading-5 text-foreground">
                                {address.formattedAddress || address.addressText}
                              </span>
                              <span className="block truncate font-body text-[11px] text-muted-foreground">
                                {address.label || (address.isDefault ? "Principal" : "Dirección del cliente")}
                              </span>
                            </span>
                            {address.isDefault ? (
                              <span className="shrink-0 rounded-full bg-success/12 px-2 py-1 font-heading text-[10px] font-bold text-success">
                                Principal
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </label>

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
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-background px-3 text-left transition-colors hover:border-brand/60"
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
                  <label className="sm:col-span-2 flex items-center gap-2.5 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={whatsappStatusOptIn}
                      onChange={(event) => onWhatsappStatusOptInChange(event.target.checked)}
                      className="h-4 w-4 shrink-0 accent-brand"
                    />
                    <span className="min-w-0">
                      <span className="block font-heading text-xs font-bold text-foreground">Avisar por WhatsApp cuando salga</span>
                      <span className="mt-0.5 block font-body text-[10px] leading-4 text-muted-foreground">Solo con autorización del cliente.</span>
                    </span>
                  </label>
                  <div className="flex items-end">
                    {paymentMethod ? (
                      <div className="flex min-h-12 w-full items-center rounded-xl border border-gold/20 bg-gold/8 px-3 font-body text-xs text-gold">
                        Pago indicado: <strong className="ml-1 font-heading">{paymentLabel(paymentMethod)}</strong>
                        {cashTendered ? <span className="ml-1">· paga con ${formatPrice(cashTendered)}</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Domicilio</span>
                    <textarea
                      value={deliveryAddress}
                      onChange={(event) => onDeliveryAddressChange(event.target.value)}
                      placeholder="Calle, número y colonia"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={onQuoteDelivery}
                      disabled={deliveryQuoteLoading || deliveryAddress.trim().length < 8}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-success px-3 font-heading text-sm font-bold text-white transition-colors hover:bg-success/85 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MapPin size={16} />
                      {deliveryQuoteLoading ? "Localizando domicilio..." : "Buscar y confirmar domicilio"}
                    </button>
                  </div>
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

              <label className="sm:col-span-2">
                <span className="mb-1.5 block font-heading text-xs font-bold text-muted-foreground">Nota general <span className="font-body font-normal">(opcional)</span></span>
                <textarea
                  value={orderNotes}
                  onChange={(event) => onOrderNotesChange(event.target.value)}
                  placeholder="Ej. mitad de un sabor y mitad de otro"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
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
              {onPayAndSubmit && !isEditing ? (
                <button
                  type="button"
                  onClick={onPayAndSubmit}
                  disabled={isSubmitting || !canSubmit}
                  className="order-2 flex min-h-16 min-w-0 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 font-heading text-sm font-bold transition-colors hover:bg-white/15 active:scale-[0.99] disabled:opacity-60 sm:order-1 sm:h-12 sm:min-h-0 sm:gap-2 sm:rounded-xl sm:px-4"
                >
                  <CreditCard size={18} /> Cobrar y enviar
                </button>
              ) : null}
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || !canSubmit}
                className="action-success order-1 flex min-h-16 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 font-heading text-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:h-12 sm:min-h-0 sm:gap-2 sm:rounded-xl sm:px-4"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {isEditing ? "Guardar cambios" : "Enviar a cocina"}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
