"use client";

import { useState } from "react";
import {
  Bike,
  Minus,
  Package,
  Plus,
  Send,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCartStore } from "@/lib/stores";
import type { RestaurantTable, TableMapLabel, TableZone } from "@/types/database";
import { ORDER_TYPE_VISUALS } from "@/lib/order-visuals";
import { TablePicker } from "./table-picker";

interface CartPanelProps {
  orderType: "comedor" | "domicilio" | "para_llevar";
  onOrderTypeChange: (type: "comedor" | "domicilio" | "para_llevar") => void;
  tableId?: string;
  onTableIdChange?: (id: string, label: string) => void;
  tables?: RestaurantTable[];
  zones?: TableZone[];
  labels?: TableMapLabel[];
  deliveryFee?: number;
  onRequestSubmit: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

const priceFormatter = new Intl.NumberFormat("es-MX");

function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

const ORDER_TYPES = [
  { value: "comedor" as const, label: "Comedor", icon: UtensilsCrossed },
  { value: "domicilio" as const, label: "Domicilio", icon: Bike },
  { value: "para_llevar" as const, label: "Llevar", icon: Package },
];

export function CartPanel({
  orderType,
  onOrderTypeChange,
  tableId = "",
  onTableIdChange,
  tables = [],
  zones = [],
  labels = [],
  deliveryFee = 0,
  onRequestSubmit,
  onClose,
  isMobile = false,
}: CartPanelProps) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateNotes = useCartStore((state) => state.updateNotes);
  const getTotal = useCartStore((state) => state.getTotal);
  const total = getTotal() + (orderType === "domicilio" ? deliveryFee : 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className={`flex min-w-0 flex-col bg-surface ${
        isMobile
          ? "h-[88dvh] w-full rounded-t-3xl shadow-float md:h-[min(88dvh,48rem)] md:max-w-2xl md:rounded-3xl"
          : "h-full w-[min(26rem,40vw)] shrink-0 border-l border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/30">
            <ShoppingBag size={18} />
          </div>
          <div>
            <p className="font-heading text-base font-bold text-foreground">Pedido</p>
            <p className="font-body text-xs text-muted-foreground">
              {totalItems === 0
                ? "Vacío. Toca un platillo"
                : `${totalItems} artículo${totalItems !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {items.length > 0 ? (
            <button
              data-tour="pos-table-selection"
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-lg px-2.5 font-heading text-[11px] font-bold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset hover:bg-destructive/10 hover:text-destructive"
              title="Vaciar pedido"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Vaciar</span>
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar pedido"
              className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl bg-surface-raised text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-foreground"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-b border-border p-3">
        {ORDER_TYPES.map((type) => {
          const isActive = orderType === type.value;
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onOrderTypeChange(type.value)}
              className={`flex h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
                isActive
                  ? ORDER_TYPE_VISUALS[type.value].selected
                  : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground"
              }`}
            >
              <Icon size={18} />
              <span className="font-heading text-[11px] font-bold">{type.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pos-scroll min-h-0 min-w-0 flex-1 touch-pan-y overscroll-y-contain overflow-x-hidden overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background/50 p-6 text-center">
            <ShoppingBag size={32} className="text-muted-foreground/35" />
            <p className="font-heading text-sm font-bold text-muted-foreground">Armar pedido</p>
            <p className="font-body text-xs text-muted-foreground">
              Los platillos aparecen aquí al tocarlos
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const itemTotal =
                (item.price +
                  item.selected_modifiers.reduce((sum, modifier) => sum + modifier.price, 0)) *
                item.quantity;
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-base font-bold leading-snug text-foreground">
                        {item.name}
                      </p>
                      <p className="font-data text-sm text-muted-foreground">
                        ${formatPrice(item.price)} c/u
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Quitar ${item.name}`}
                      className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {item.selected_modifiers.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.selected_modifiers.map((modifier, index) => (
                        <span
                          key={`${modifier.group}-${modifier.option}-${index}`}
                          className="inline-flex flex-col rounded-xl bg-surface-raised px-2.5 py-1.5 font-body text-xs font-medium text-muted-foreground"
                        >
                          <span>
                            {modifier.option}
                            {modifier.price > 0 ? ` +$${formatPrice(modifier.price)}` : ""}
                          </span>
                          {modifier.description ? (
                            <span className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/80">
                              {modifier.description}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-full bg-surface-raised p-0.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        aria-label={`Reducir ${item.name}`}
                        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-surface text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-brand"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-9 text-center font-data text-base font-bold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label={`Aumentar ${item.name}`}
                        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-surface text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-brand"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="font-data text-base font-bold text-foreground">
                      ${formatPrice(itemTotal)}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={item.notes}
                    onChange={(event) => updateNotes(item.id, event.target.value)}
                    placeholder="Notas (sin cebolla...)"
                    className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="ticket-perforation w-full" aria-hidden />
      <div className="bg-ink p-4 text-white">
        <div className="mb-3 flex items-end justify-between">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-white/55">
            Total
          </span>
          <span className="font-data text-3xl font-bold tracking-tight">${formatPrice(total)}</span>
        </div>
        <button
          data-tour="pos-send-order"
          type="button"
          onClick={onRequestSubmit}
          disabled={items.length === 0}
          className="action-success flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-xl py-3.5 font-heading text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-inset disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 disabled:shadow-none"
        >
          <Send size={16} />
          Continuar con datos
        </button>
      </div>

      {tablePickerOpen ? (
        <TablePicker
            zones={zones}
            tables={tables}
            labels={labels}
          selectedTableId={tableId}
          onClose={() => setTablePickerOpen(false)}
          onConfirm={(table) => {
            onTableIdChange?.(table.id, table.name);
            setTablePickerOpen(false);
          }}
        />
      ) : null}

      {clearConfirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClearConfirmOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-float"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 size={20} />
            </div>
            <h2 id="clear-cart-title" className="mt-4 font-heading text-lg font-bold text-foreground">
              Vaciar pedido
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              Se quitarán los {totalItems} artículo{totalItems !== 1 ? "s" : ""} del pedido actual. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="h-11 touch-manipulation rounded-xl border border-border px-4 font-heading text-xs font-bold text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setClearConfirmOpen(false);
                }}
                className="action-danger inline-flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset"
              >
                <Trash2 size={14} />
                Vaciar pedido
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
