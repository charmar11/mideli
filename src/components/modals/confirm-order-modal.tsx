"use client";

import { Check, CreditCard, X, Loader2, UtensilsCrossed, Bike, Package } from "lucide-react";
import type { CartItem } from "@/types/database";

interface ConfirmOrderModalProps {
  items: CartItem[];
  orderType: "comedor" | "domicilio" | "para_llevar";
  total: number;
  deliveryFee?: number;
  isSubmitting: boolean;
  isEditing?: boolean;
  onConfirm: () => void;
  onPayAndConfirm?: () => void;
  onClose: () => void;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-MX").format(price);
}

const TYPE_INFO: Record<string, { label: string; icon: typeof UtensilsCrossed }> = {
  comedor: { label: "Comedor", icon: UtensilsCrossed },
  domicilio: { label: "Domicilio", icon: Bike },
  para_llevar: { label: "Para llevar", icon: Package },
};

export function ConfirmOrderModal({
  items,
  orderType,
  total,
  deliveryFee = 0,
  isSubmitting,
  isEditing = false,
  onConfirm,
  onPayAndConfirm,
  onClose,
}: ConfirmOrderModalProps) {
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const typeInfo = TYPE_INFO[orderType];
  const TypeIcon = typeInfo.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="confirm-title"
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="confirm-title" className="font-heading text-lg font-bold">
            {isEditing ? "Guardar cambios" : "Confirmar pedido"}
          </h2>
          {!isSubmitting ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-background px-3 py-3 ring-1 ring-border">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-white">
              <TypeIcon size={18} />
            </div>
            <div>
              <p className="font-heading text-sm font-bold">{typeInfo.label}</p>
              <p className="font-body text-xs text-muted-foreground">
                {totalItems} artículo{totalItems !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <ul className="space-y-3">
            {items.map((item) => {
              const itemTotal =
                (item.price +
                  item.selected_modifiers.reduce((sum, m) => sum + m.price, 0)) *
                item.quantity;
              return (
                <li key={item.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-data text-xs font-bold text-brand">
                        {item.quantity}x
                      </span>
                      <span className="font-heading text-sm font-bold">{item.name}</span>
                    </div>
                    {item.selected_modifiers.length > 0 ? (
                      <p className="ml-5 font-body text-xs text-muted-foreground">
                        {item.selected_modifiers
                          .map((m) =>
                            m.description ? `${m.option} (${m.description})` : m.option
                          )
                          .join(", ")}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="ml-5 font-body text-xs text-muted-foreground">
                        Nota: {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-data text-sm font-bold">
                    ${formatPrice(itemTotal)}
                  </span>
                </li>
              );
            })}
          </ul>
          {deliveryFee > 0 ? (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-body text-sm">
              <span>Envío a domicilio</span>
              <span className="font-data font-bold">${formatPrice(deliveryFee)}</span>
            </div>
          ) : null}
        </div>

        <div className="bg-ink px-5 py-4 text-white">
          <div className="mb-3 flex items-end justify-between">
            <span className="font-heading text-xs font-bold uppercase tracking-wider text-white/55">
              Total
            </span>
            <span className="font-data text-3xl font-bold">${formatPrice(total)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${onPayAndConfirm && !isEditing ? "bg-white/10 text-white hover:bg-white/15" : "action-success sm:col-span-2"}`}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {isEditing ? "Guardar cambios" : "Enviar a cocina"}
            </button>
            {onPayAndConfirm && !isEditing ? (
              <button
                type="button"
                onClick={onPayAndConfirm}
                disabled={isSubmitting}
                className="action-success flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                Cobrar y enviar
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
