"use client";

import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Plus,
  CheckCircle2,
  Flame,
  ChefHat,
  Hand,
  Trash2,
  CreditCard,
  DollarSign,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCatalogStore,
  useCartStore,
  useOrderStore,
  useTableStore,
  type OrderWithItems,
} from "@/lib/stores";
import { CategoryTabs, ProductGrid, CartPanel } from "@/components/pos";
import { VariationModal, ConfirmOrderModal } from "@/components/modals";
import type { MenuItem, SelectedModifier } from "@/types/database";

export function MeseroView() {
  const [mode, setMode] = useState<"pos" | "status">("pos");
  const [orderType, setOrderType] = useState<"comedor" | "domicilio" | "para_llevar">("comedor");
  const [tableNumber, setTableNumber] = useState("");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [variationItem, setVariationItem] = useState<MenuItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { fetchCatalog, menuItems } = useCatalogStore();
  const { items, addItem, clear, getItemCount, getTotal } = useCartStore();
  const { tables, fetchTables } = useTableStore();
  const {
    createOrder,
    fetchActiveOrders,
    subscribeToOrders,
    setMenuItemsMap,
    activeOrders,
  } = useOrderStore();

  const cartItemCount = getItemCount();
  const readyCount = activeOrders.filter((o) => o.status === "ready").length;

  useEffect(() => {
    fetchCatalog();
    fetchActiveOrders();
    fetchTables();
    const unsubscribe = subscribeToOrders();
    return () => unsubscribe();
  }, [fetchCatalog, fetchActiveOrders, fetchTables, subscribeToOrders]);

  useEffect(() => {
    if (menuItems.length > 0) {
      setMenuItemsMap(menuItems);
    }
  }, [menuItems, setMenuItemsMap]);

  function handleProductClick(item: MenuItem) {
    if (item.modifiers && item.modifiers.length > 0) {
      setVariationItem(item);
    } else {
      addItem(item.id, item.name, item.price, []);
    }
  }

  function handleVariationConfirm(
    selectedModifiers: SelectedModifier[],
    notes: string
  ) {
    if (variationItem) {
      addItem(
        variationItem.id,
        variationItem.name,
        variationItem.price,
        selectedModifiers,
        notes
      );
      setVariationItem(null);
    }
  }

  async function handleSubmitOrder() {
    if (items.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    const { order, error } = await createOrder(
      items,
      orderType,
      "",
      tableNumber,
      customerName,
      orderType === "comedor" ? tableId : ""
    );
    setIsSubmitting(false);

    if (error || !order) {
      toast.error(error ?? "Error al enviar el pedido");
      return;
    }

    toast.success(`Pedido #${order.number} enviado a cocina`, {
      description: `${items.reduce((s, i) => s + i.quantity, 0)} artículos · ${orderType}${
        tableNumber ? ` · Mesa ${tableNumber}` : ""
      }`,
    });
    clear();
    setTableNumber("");
    setTableId("");
    setCustomerName("");
    setConfirmOpen(false);
    setCartOpen(false);
    setMode("status");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 sm:px-4">
        <div className="inline-flex rounded-2xl bg-surface p-1 shadow-card ring-1 ring-border">
          <button
            type="button"
            onClick={() => setMode("pos")}
            className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 font-heading text-sm font-bold transition-colors ${
              mode === "pos"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus size={16} />
            Nuevo pedido
          </button>
          <button
            type="button"
            onClick={() => setMode("status")}
            className={`relative inline-flex h-11 items-center gap-2 rounded-xl px-4 font-heading text-sm font-bold transition-colors ${
              mode === "status"
                ? "bg-brand text-white shadow-md shadow-brand/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag size={16} />
            Estado
            {readyCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1 font-data text-[10px] font-bold text-white">
                {readyCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {mode === "status" ? (
        <StatusView />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CategoryTabs />
            <ProductGrid onProductClick={handleProductClick} />
          </div>

          <div className="hidden lg:flex">
            <CartPanel
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              tableNumber={tableNumber}
              onTableNumberChange={setTableNumber}
              tableId={tableId}
              onTableIdChange={(id, label) => {
                setTableId(id);
                setTableNumber(label);
              }}
              tables={tables}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              onRequestSubmit={() => setConfirmOpen(true)}
            />
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Abrir pedido${cartItemCount ? `, ${cartItemCount} artículos` : ""}`}
            className="fixed bottom-20 right-4 z-30 flex h-16 items-center gap-2 rounded-full bg-brand px-5 text-white shadow-float lg:hidden"
          >
            <ShoppingBag size={22} />
            <span className="font-heading text-sm font-bold">
              {cartItemCount > 0 ? `${cartItemCount} · $${getTotal()}` : "Pedido"}
            </span>
          </button>

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
                tableNumber={tableNumber}
                onTableNumberChange={setTableNumber}
                tableId={tableId}
                onTableIdChange={(id, label) => {
                  setTableId(id);
                  setTableNumber(label);
                }}
                tables={tables}
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
          onConfirm={handleSubmitOrder}
          onClose={() => !isSubmitting && setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}

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

function StatusView() {
  const { activeOrders, markAsServed, cancelOrder, markAsPaid } = useOrderStore();
  const [, setTick] = useState(0);
  const [payModalOrder, setPayModalOrder] = useState<OrderWithItems | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<
    "efectivo" | "tarjeta" | "transferencia"
  >("efectivo");

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const pending = activeOrders.filter(
    (o) => o.status === "pending" || o.status === "in_kitchen"
  );
  const ready = activeOrders.filter((o) => o.status === "ready");

  async function handleDeliver(orderId: string, number: number) {
    const { error } = await markAsServed(orderId);
    if (error) toast.error("No se pudo marcar como entregado");
    else toast.success(`Pedido #${number} entregado`);
  }

  async function handleCancel(orderId: string, number: number) {
    if (!confirm(`¿Cancelar el pedido #${number}?`)) return;
    const { error } = await cancelOrder(orderId);
    if (error) toast.error(error);
    else toast.success(`Pedido #${number} cancelado`);
  }

  const cashNum = parseFloat(cashInput) || 0;
  const changeGiven = payModalOrder ? Math.max(0, cashNum - payModalOrder.total) : 0;

  async function handlePaySubmit() {
    if (!payModalOrder) return;
    if (selectedMethod === "efectivo" && cashNum < payModalOrder.total) {
      toast.error(
        `El efectivo ($${cashNum}) es menor al total ($${payModalOrder.total})`
      );
      return;
    }

    const { error } = await markAsPaid(
      payModalOrder.id,
      selectedMethod,
      selectedMethod === "efectivo" ? cashNum : undefined,
      selectedMethod === "efectivo" ? changeGiven : undefined
    );

    if (error) {
      toast.error(error);
    } else {
      toast.success(`Pedido #${payModalOrder.number} cobrado`);
      if (confirm("¿Imprimir ticket de consumo?")) window.print();
      setPayModalOrder(null);
      setCashInput("");
    }
  }

  return (
    <div className="pos-scroll h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-light text-warning">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold">En preparación</h2>
              <p className="font-body text-xs text-muted-foreground">
                {pending.length} en cocina
              </p>
            </div>
          </div>

          {pending.length === 0 ? (
            <EmptyBlock icon={<ChefHat size={28} />} text="Sin pedidos en preparación" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pending.map((order) => {
                const typeStyle = TYPE_STYLES[order.type] ?? TYPE_STYLES.comedor;
                const isKitchen = order.status === "in_kitchen";
                return (
                  <article
                    key={order.id}
                    className={`rounded-2xl border bg-surface p-4 shadow-card ${
                      isKitchen ? "border-warning/40" : "border-border"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-data text-2xl font-bold">#{order.number}</p>
                        <p className="font-body text-xs text-muted-foreground">
                          {formatTimeElapsed(order.created_at)}
                          {order.table_number ? ` · Mesa ${order.table_number}` : ""}
                          {order.customer_name ? ` · ${order.customer_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${typeStyle.className}`}
                        >
                          {typeStyle.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancel(order.id, order.number)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {order.items.map((item, i) => (
                        <li key={i} className="flex items-baseline gap-2">
                          <span className="font-data text-xs font-bold text-brand">
                            {item.quantity}x
                          </span>
                          <span className="font-body text-sm">{item.menu_item_name}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-light text-success">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold">Listos / cobrar</h2>
              <p className="font-body text-xs text-muted-foreground">
                {ready.length} listo{ready.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {ready.length === 0 ? (
            <EmptyBlock icon={<CheckCircle2 size={28} />} text="No hay pedidos listos" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {ready.map((order) => {
                const typeStyle = TYPE_STYLES[order.type] ?? TYPE_STYLES.comedor;
                return (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-success/35 bg-surface p-4 shadow-card"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-data text-2xl font-bold">#{order.number}</p>
                        <p className="font-body text-xs font-semibold text-success">
                          Listo · {formatTimeElapsed(order.created_at)}
                          {order.table_number ? ` · Mesa ${order.table_number}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${typeStyle.className}`}
                      >
                        {typeStyle.label}
                      </span>
                    </div>
                    <ul className="mb-3 space-y-1">
                      {order.items.map((item, i) => (
                        <li key={i} className="flex items-baseline gap-2">
                          <span className="font-data text-xs font-bold text-brand">
                            {item.quantity}x
                          </span>
                          <span className="font-body text-sm">{item.menu_item_name}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id, order.number)}
                        className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-ink font-heading text-xs font-bold text-white shadow-md transition-colors hover:bg-ink/85"
                      >
                        <Hand size={14} />
                        Entregado
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayModalOrder(order);
                          setCashInput(String(order.total));
                          setSelectedMethod("efectivo");
                        }}
                        className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-success font-heading text-xs font-bold text-white shadow-md shadow-success/20 transition-colors hover:bg-success/85"
                      >
                        <CreditCard size={14} />
                        Cobrar ${order.total}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {payModalOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayModalOrder(null);
          }}
        >
          <div
            role="dialog"
            aria-labelledby="pay-title"
            className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-float"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 id="pay-title" className="font-heading text-xl font-bold">
                  Cobrar #{payModalOrder.number}
                </h3>
                <p className="font-body text-xs text-muted-foreground">
                  {payModalOrder.type}
                  {payModalOrder.table_number
                    ? ` · Mesa ${payModalOrder.table_number}`
                    : ""}
                </p>
              </div>
              <p className="font-data text-3xl font-bold text-brand">
                ${payModalOrder.total}
              </p>
            </div>

            <p className="mb-2 font-heading text-xs font-bold text-muted-foreground">
              Método de pago
            </p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(
                [
                  { id: "efectivo" as const, label: "Efectivo", icon: DollarSign },
                  { id: "tarjeta" as const, label: "Tarjeta", icon: CreditCard },
                  {
                    id: "transferencia" as const,
                    label: "Transf.",
                    icon: ArrowLeftRight,
                  },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedMethod(id)}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border font-heading text-xs font-bold transition-colors ${
                    selectedMethod === id
                      ? "border-brand bg-brand-light text-brand"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            {selectedMethod === "efectivo" ? (
              <div className="mb-4 space-y-3 rounded-2xl border border-border bg-background p-4">
                <label className="flex items-center justify-between gap-2">
                  <span className="font-heading text-xs font-bold text-muted-foreground">
                    Recibido
                  </span>
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="h-11 w-32 rounded-xl border border-border bg-surface px-3 text-right font-data text-lg font-bold focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  />
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[payModalOrder.total, 100, 200, 500].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCashInput(String(val))}
                      className="h-10 rounded-xl border border-border bg-surface font-data text-xs font-bold hover:border-brand"
                    >
                      ${val}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-heading text-xs font-bold text-muted-foreground">
                    Cambio
                  </span>
                  <span className="font-data text-xl font-bold text-success">
                    ${changeGiven}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPayModalOrder(null)}
                className="h-12 flex-1 rounded-xl border border-border font-heading text-sm font-bold text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePaySubmit}
                className="h-12 flex-1 rounded-xl bg-success font-heading text-sm font-bold text-white shadow-md"
              >
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyBlock({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface/70 px-6 py-12 text-center shadow-sm">
      <span className="text-muted-foreground/40">{icon}</span>
      <p className="font-heading text-sm font-semibold text-muted-foreground">{text}</p>
    </div>
  );
}
