"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Ban,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  CircleAlert,
  CreditCard,
  FileText,
  MapPin,
  Pencil,
  ReceiptText,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Split,
  Trash2,
  Truck,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteSalesHistoryOrder,
  fetchSalesHistory,
  type SalesHistoryOrder,
} from "@/lib/actions/sales";
import { getCurrentUserRole } from "@/lib/actions/users";
import {
  PaymentFlow,
  ReceiptDialog,
  formatPaymentMoney,
} from "@/components/payments/payment-flow";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/database";
import type { PaymentReceipt } from "@/types/payments";
import { formatOrderLocation } from "@/lib/order-location";
import { useCashShiftStore } from "@/lib/stores";
import { PaymentMethodCorrectionDialog } from "@/components/payments/payment-method-correction-dialog";

type StatusFilter = "all" | Order["status"];
type TypeFilter = "all" | Order["type"];
type PaymentFilter = "all" | "pending" | NonNullable<Order["payment_method"]>;

const TYPE_LABELS: Record<Order["type"], string> = {
  comedor: "Comedor",
  domicilio: "Domicilio",
  para_llevar: "Para llevar",
};

const PAYMENT_LABELS: Record<NonNullable<Order["payment_method"]>, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

const STATUS_META: Record<
  Order["status"],
  { label: string; className: string }
> = {
  pending: { label: "Pendiente", className: "bg-warning-light text-warning" },
  in_kitchen: { label: "En cocina", className: "bg-warning-light text-warning" },
  ready: { label: "Listo", className: "bg-success-light text-success" },
  served: { label: "Entregado", className: "bg-brand-light text-brand" },
  paid: { label: "Pagado", className: "bg-success-light text-success" },
  cancelled: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(dateValue: string) {
  const selected = new Date(`${dateValue}T12:00:00`);
  const start = new Date(selected);
  start.setHours(0, 0, 0, 0);
  const end = new Date(selected);
  end.setHours(23, 59, 59, 999);
  return { desde: start.toISOString(), hasta: end.toISOString() };
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function OrderTypeIcon({
  type,
  size,
  className,
}: {
  type: Order["type"];
  size: number;
  className?: string;
}) {
  if (type === "domicilio") return <Truck size={size} className={className} />;
  if (type === "para_llevar") return <ShoppingBag size={size} className={className} />;
  return <Utensils size={size} className={className} />;
}

function PaymentMethodIcon({
  method,
  size,
  className,
}: {
  method: NonNullable<Order["payment_method"]>;
  size: number;
  className?: string;
}) {
  if (method === "efectivo") return <Banknote size={size} className={className} />;
  if (method === "transferencia") {
    return <ArrowLeftRight size={size} className={className} />;
  }
  return <CreditCard size={size} className={className} />;
}

function getItemsTotal(order: SalesHistoryOrder) {
  return order.items.reduce((total, item) => {
    const modifiersTotal = item.selected_modifiers.reduce(
      (sum, modifier) => sum + modifier.price,
      0
    );
    return total + (item.unit_price + modifiersTotal) * item.quantity;
  }, 0);
}

function isPendingPayment(order: SalesHistoryOrder) {
  return (
    order.status !== "cancelled" &&
    order.payment_status !== "paid" &&
    Number(order.paid_amount ?? 0) < order.total
  );
}

interface PendingTableAccount {
  key: string;
  tableNumber: string;
  zoneName: string | null;
  orders: SalesHistoryOrder[];
  total: number;
  itemCount: number;
}

function getPendingTableAccounts(orders: SalesHistoryOrder[]) {
  const accounts = new Map<string, PendingTableAccount>();
  for (const order of orders) {
    if (!isPendingPayment(order) || order.type !== "comedor" || !order.table_number) continue;
    const key = order.table_id ?? order.table_number;
    const account = accounts.get(key) ?? {
      key,
      tableNumber: order.table_number,
      zoneName: order.table_zone_name ?? null,
      orders: [],
      total: 0,
      itemCount: 0,
    };
    account.orders.push(order);
    account.total += Math.max(0, order.total - Number(order.paid_amount ?? 0));
    account.itemCount += order.items.reduce((sum, item) => sum + item.quantity, 0);
    accounts.set(key, account);
  }
  return Array.from(accounts.values()).sort((a, b) =>
    a.tableNumber.localeCompare(b.tableNumber, "es-MX", { numeric: true })
  );
}

function getPendingItemDetail(item: SalesHistoryOrder["items"][number]) {
  const modifiers = item.selected_modifiers
    .map((modifier) => `${modifier.group}: ${modifier.option}`)
    .join(", ");
  const notes = item.notes.trim() ? `Nota: ${item.notes.trim()}` : "";
  return [modifiers, notes].filter(Boolean).join(" · ");
}

function PendingAccountCard({
  account,
  expanded,
  onToggle,
  onPay,
}: {
  account: PendingTableAccount;
  expanded: boolean;
  onToggle: () => void;
  onPay: () => void;
}) {
  const itemRows = useMemo(
    () =>
      account.orders.flatMap((order) =>
        order.items.map((item) => ({
          id: item.id,
          orderNumber: order.number,
          quantity: item.quantity,
          name: item.menu_item_name,
          detail: getPendingItemDetail(item),
        }))
      ),
    [account.orders]
  );
  const visibleRows = expanded ? itemRows : itemRows.slice(0, 3);
  const hiddenCount = Math.max(0, itemRows.length - 3);
  const paidAmount = account.orders.reduce(
    (total, order) => total + Number(order.paid_amount ?? 0),
    0
  );
  const hasMultipleOrders = account.orders.length > 1;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-background/55 transition-colors focus-within:border-brand/45 hover:border-border-strong">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold">
            {formatOrderLocation({
              type: "comedor",
              table_number: account.tableNumber,
              table_zone_name: account.zoneName,
              customer_name: null,
            })}
          </h3>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            {account.orders.length} pedido{account.orders.length !== 1 ? "s" : ""} · {account.itemCount} producto{account.itemCount !== 1 ? "s" : ""}
          </p>
        </div>
        {paidAmount > 0 ? (
          <span className="shrink-0 rounded-full bg-success-light px-2.5 py-1 font-body text-[11px] font-bold text-success">
            Abonado {formatMoney(paidAmount)}
          </span>
        ) : null}
      </div>

      <div className="mx-3 overflow-hidden rounded-xl border border-border/80 bg-surface-raised/45">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
          <p className="font-heading text-xs font-bold text-foreground">Resumen de la cuenta</p>
          {hasMultipleOrders ? (
            <span className="font-body text-[11px] text-muted-foreground">
              {account.orders.length} pedidos juntos
            </span>
          ) : null}
        </div>

        {visibleRows.length > 0 ? (
          <div className="divide-y divide-border/65">
            {visibleRows.map((item) => (
              <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 px-3 py-2.5">
                <span className="flex min-h-6 min-w-7 items-center justify-center rounded-md bg-brand-light px-1.5 font-data text-xs font-bold text-brand">
                  {item.quantity}x
                </span>
                <p className="min-w-0 font-heading text-sm font-bold leading-6 text-foreground">
                  {item.name}
                </p>
                {hasMultipleOrders ? (
                  <span className="rounded-md bg-background px-1.5 py-1 font-data text-[10px] font-bold text-muted-foreground">
                    #{item.orderNumber}
                  </span>
                ) : null}
                {item.detail ? (
                  <p className="col-span-2 col-start-2 mt-0.5 break-words font-body text-xs leading-4 text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-4 font-body text-xs text-muted-foreground">
            No hay productos registrados en esta cuenta.
          </p>
        )}

        {hiddenCount > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-border/70 px-3 font-heading text-xs font-bold text-brand transition-colors hover:bg-brand-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
          >
            {expanded ? "Ocultar detalle" : `Ver ${hiddenCount} producto${hiddenCount !== 1 ? "s" : ""} más`}
            <ChevronDown
              size={15}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <span className="font-body text-xs font-semibold text-muted-foreground">Saldo pendiente</span>
          <p className="font-data text-xl font-bold text-brand">{formatMoney(account.total)}</p>
        </div>
        <button
          type="button"
          onClick={onPay}
          className="action-success inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-heading text-sm font-bold sm:w-auto"
        >
          <CreditCard size={16} />
          Cobrar cuenta
        </button>
      </div>
    </article>
  );
}

function OrderDetail({
  order,
  onClose,
  onDelete,
  onPay,
  onReceipt,
}: {
  order: SalesHistoryOrder;
  onClose?: () => void;
  onDelete?: () => void;
  onPay?: () => void;
  onReceipt?: () => void;
}) {
  const status = STATUS_META[order.status];

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light text-brand">
              <ReceiptText size={18} />
            </span>
            <p className="font-data text-xl font-bold">Pedido #{order.number}</p>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Eliminar pedido ${order.number} del historial`}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={17} />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="mb-1 font-body text-[11px] uppercase tracking-wider text-muted-foreground">
              Tipo
            </p>
            <div className="flex items-center gap-2 font-heading text-xs font-bold">
              <OrderTypeIcon type={order.type} size={15} className="text-brand" />
              {TYPE_LABELS[order.type]}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="mb-1 font-body text-[11px] uppercase tracking-wider text-muted-foreground">
              Estado
            </p>
            <span className={`inline-flex rounded-full px-2 py-1 font-heading text-[11px] font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-border bg-background/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-bold">Artículos</h3>
            <span className="font-body text-xs text-muted-foreground">
              {order.items.reduce((sum, item) => sum + item.quantity, 0)} piezas
            </span>
          </div>
          <div className="space-y-3">
            {order.items.map((item) => {
              const modifiersTotal = item.selected_modifiers.reduce(
                (sum, modifier) => sum + modifier.price,
                0
              );
              return (
                <div key={item.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-body text-sm font-bold">
                        <span className="mr-2 font-data text-brand">{item.quantity}x</span>
                        {item.menu_item_name}
                      </p>
                      {item.selected_modifiers.length > 0 ? (
                        <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
                          {item.selected_modifiers
                            .map(
                              (modifier) =>
                                `${modifier.option}${modifier.price > 0 ? ` +${formatMoney(modifier.price)}` : ""}`
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                      {item.notes ? (
                        <p className="mt-1 font-body text-xs italic text-muted-foreground">
                          Nota: {item.notes}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-data text-sm font-bold">
                      {formatMoney((item.unit_price + modifiersTotal) * item.quantity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 border-b border-border/70 pb-5">
          {order.table_number ? (
            <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
              <MapPin size={15} className="text-brand" />
              {formatOrderLocation(order)}
            </div>
          ) : null}
          {order.customer_name ? (
            <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
              <UserRound size={15} className="text-brand" />
              {order.customer_name}
            </div>
          ) : null}
          {order.created_by_name ? (
            <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
              <FileText size={15} className="text-brand" />
              Registrado por {order.created_by_name}
            </div>
          ) : null}
          {order.notes ? (
            <p className="rounded-xl bg-surface-raised px-3 py-2 font-body text-xs text-muted-foreground">
              Nota del pedido: {order.notes}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 pt-5">
          <div className="flex items-center justify-between font-body text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMoney(getItemsTotal(order))}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-heading text-base font-bold">Total</span>
            <span className="font-data text-2xl font-bold text-brand">{formatMoney(order.total)}</span>
          </div>
          <div className="flex items-center gap-2 font-body text-xs text-muted-foreground">
            {order.payment_status === "paid" && order.payment_method ? (
              <>
                <PaymentMethodIcon method={order.payment_method} size={15} className="text-success" />
                {PAYMENT_LABELS[order.payment_method]}
                {order.paid_at ? ` · ${formatDateTime(order.paid_at)}` : ""}
              </>
            ) : order.payment_status === "paid" ? (
              <>
                <Split size={15} className="text-success" />
                Pago completado con métodos combinados
              </>
            ) : (
              <>
                <CircleAlert size={15} className="text-warning" />
                {Number(order.paid_amount ?? 0) > 0
                  ? `Abonado ${formatMoney(Number(order.paid_amount))} · Saldo ${formatMoney(Math.max(0, order.total - Number(order.paid_amount)))}`
                  : "Pago pendiente"}
              </>
            )}
          </div>
          {onPay && isPendingPayment(order) ? (
            <button
              type="button"
              onClick={onPay}
              className="action-success mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold"
            >
              <CreditCard size={17} />
              Cobrar pedido
            </button>
          ) : null}
          {onReceipt && Number(order.paid_amount ?? 0) > 0 ? (
            <button
              type="button"
              onClick={onReceipt}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-raised font-heading text-xs font-bold text-foreground hover:bg-border"
            >
              <Printer size={16} />
              Ver tickets y reimprimir
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SalesHistory() {
  const [selectedDate, setSelectedDate] = useState(() => toInputDate(new Date()));
  const [orders, setOrders] = useState<SalesHistoryOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SalesHistoryOrder | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SalesHistoryOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [paymentOrders, setPaymentOrders] = useState<SalesHistoryOrder[] | null>(null);
  const [ticketChoices, setTicketChoices] = useState<Array<{ id: string; folio: number; status: "completed" | "voided"; total_amount: number; created_at: string }>>([]);
  const [ticketOrder, setTicketOrder] = useState<SalesHistoryOrder | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [correctionTicket, setCorrectionTicket] = useState<{ id: string; folio: number } | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [expandedPendingAccount, setExpandedPendingAccount] = useState<string | null>(null);
  const currentCashShift = useCashShiftStore((state) => state.currentShift);

  const range = useMemo(
    () => getDateRange(selectedDate),
    [selectedDate]
  );

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const result = await fetchSalesHistory(range);
    if (result.error) {
      toast.error(result.error);
      setOrders([]);
    } else {
      setOrders(result.orders);
      setSelectedOrder((current) =>
        current ? result.orders.find((order) => order.id === current.id) ?? null : null
      );
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    void getCurrentUserRole().then(setViewerRole);
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return orders.filter((order) => {
      const itemText = order.items.map((item) => item.menu_item_name).join(" ");
      const searchable = [
        String(order.number),
        order.table_zone_name ?? "",
        order.table_number ?? "",
        order.customer_name ?? "",
        order.created_by_name ?? "",
        itemText,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (statusFilter === "all" || order.status === statusFilter) &&
        (typeFilter === "all" || order.type === typeFilter) &&
        (paymentFilter === "all" ||
          (paymentFilter === "pending"
            ? isPendingPayment(order)
            : order.payment_method === paymentFilter))
      );
    });
  }, [orders, paymentFilter, search, statusFilter, typeFilter]);

  const pendingPaymentOrders = useMemo(
    () => orders.filter(isPendingPayment),
    [orders]
  );
  const pendingPaymentTotal = useMemo(
    () =>
      pendingPaymentOrders.reduce(
        (total, order) => total + Math.max(0, order.total - Number(order.paid_amount ?? 0)),
        0
      ),
    [pendingPaymentOrders]
  );
  const pendingTableAccounts = useMemo(
    () => getPendingTableAccounts(pendingPaymentOrders),
    [pendingPaymentOrders]
  );
  const canDeleteHistory = ["owner", "admin", "supervisor", "waiter"].includes(
    viewerRole ?? ""
  );

  function openPaymentModal(order: SalesHistoryOrder) {
    if (!currentCashShift) {
      toast.error("Abre la caja antes de cobrar");
      return;
    }
    setPaymentOrders([order]);
  }

  function openAccountPayment(account: PendingTableAccount) {
    if (!currentCashShift) {
      toast.error("Abre la caja antes de cobrar");
      return;
    }
    setPaymentOrders(account.orders);
  }

  async function openTickets(order: SalesHistoryOrder) {
    setTicketOrder(order);
    setTicketChoices([]);
    setTicketLoading(true);
    const supabase = createClient();
    const { data: allocations, error } = await supabase
      .from("payment_order_allocations")
      .select("transaction_id")
      .eq("order_id", order.id);
    if (error || !allocations?.length) {
      toast.error("No se encontraron tickets visibles para este pedido");
      setTicketOrder(null);
      setTicketLoading(false);
      return;
    }
    const allocationRows = allocations as Array<{ transaction_id: string }>;
    const ids = Array.from(new Set(allocationRows.map((row) => row.transaction_id)));
    const { data, error: transactionError } = await supabase
      .from("payment_transactions")
      .select("id,folio,status,total_amount,created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    setTicketLoading(false);
    if (transactionError || !data?.length) {
      toast.error("No tienes acceso a estos tickets");
      setTicketOrder(null);
      return;
    }
    setTicketChoices(data as typeof ticketChoices);
  }

  async function viewReceipt(transactionId: string) {
    setTicketLoading(true);
    const { data, error } = await createClient().rpc("get_payment_receipt", {
      p_transaction_id: transactionId,
    });
    setTicketLoading(false);
    if (error || !data) {
      toast.error(error?.message ?? "No se pudo abrir el ticket");
      return;
    }
    setReceipt(data as PaymentReceipt);
  }

  async function voidPayment(transactionId: string) {
    if (!window.confirm("¿Anular este pago? El saldo volverá a quedar pendiente.")) return;
    setTicketLoading(true);
    const { data, error } = await createClient().rpc("void_payment", {
      p_transaction_id: transactionId,
    });
    setTicketLoading(false);
    if (error || !data) {
      toast.error(error?.message ?? "No se pudo anular el pago");
      return;
    }
    toast.success("Pago anulado. La cuenta volvió a quedar pendiente");
    setTicketOrder(null);
    setTicketChoices([]);
    await loadHistory();
  }

  async function handleDeleteOrder() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const result = await deleteSalesHistoryOrder(deleteTarget.id);
    if (!result.success || result.error) {
      toast.error(result.error ?? "No se pudo eliminar el pedido");
    } else {
      setOrders((current) => current.filter((order) => order.id !== deleteTarget.id));
      setSelectedOrder((current) => (current?.id === deleteTarget.id ? null : current));
      toast.success(`Pedido #${deleteTarget.number} eliminado del historial`);
      setDeleteTarget(null);
    }
    setIsDeleting(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-8">
          <header className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-md shadow-brand/20">
                <CalendarDays size={21} />
              </span>
              <div>
                <h1 className="font-heading text-xl font-bold sm:text-2xl">Historial de ventas</h1>
                <p className="font-body text-sm text-muted-foreground">
                  Consulta pedidos, cobros y detalle del turno
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised px-4 font-heading text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </header>

          {pendingPaymentOrders.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-warning/35 bg-warning-light/40 p-4 shadow-card sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                <CircleAlert size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold text-foreground">
                  {pendingPaymentOrders.length} pedido{pendingPaymentOrders.length !== 1 ? "s" : ""} pendiente{pendingPaymentOrders.length !== 1 ? "s" : ""} de cobro
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  Total por cobrar: {formatMoney(pendingPaymentTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setPaymentFilter((current) => current === "pending" ? "all" : "pending");
                }}
                className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold transition-colors ${paymentFilter === "pending" ? "bg-warning text-ink shadow-md" : "border border-warning/40 text-warning hover:bg-warning/10"}`}
              >
                {paymentFilter === "pending" ? "Quitar filtro" : "Ver pendientes"}
              </button>
            </section>
          ) : null}

          {paymentFilter === "pending" && pendingTableAccounts.length > 0 ? (
            <section className="rounded-2xl border border-brand/25 bg-surface p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-base font-bold">Cuentas pendientes por mesa</h2>
                  <p className="font-body text-xs text-muted-foreground">Liquida todos los pedidos de una mesa en un solo cobro</p>
                </div>
                <span className="rounded-full bg-brand-light px-2.5 py-1 font-data text-xs font-bold text-brand">{pendingTableAccounts.length}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {pendingTableAccounts.map((account) => (
                  <PendingAccountCard
                    key={account.key}
                    account={account}
                    expanded={expandedPendingAccount === account.key}
                    onToggle={() =>
                      setExpandedPendingAccount((current) =>
                        current === account.key ? null : account.key
                      )
                    }
                    onPay={() => openAccountPayment(account)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <DayCalendar value={selectedDate} onChange={setSelectedDate} />
              </div>

              <div className="relative min-w-0 xl:w-72">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar pedido, mesa o producto"
                  className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-body text-sm outline-none placeholder:text-muted-foreground/70 focus:border-brand"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
              <FilterSelect
                label="Estado"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={[
                  ["all", "Todos los estados"],
                  ["paid", "Pagados"],
                  ["served", "Entregados"],
                  ["ready", "Listos"],
                  ["in_kitchen", "En cocina"],
                  ["pending", "Pendientes"],
                  ["cancelled", "Cancelados"],
                ]}
              />
              <FilterSelect
                label="Tipo"
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as TypeFilter)}
                options={[
                  ["all", "Todos los tipos"],
                  ["comedor", "Comedor"],
                  ["domicilio", "Domicilio"],
                  ["para_llevar", "Para llevar"],
                ]}
              />
              <FilterSelect
                label="Pago"
                value={paymentFilter}
                onChange={(value) => setPaymentFilter(value as PaymentFilter)}
                options={[
                  ["all", "Todos los pagos"],
                  ["pending", "Pendientes de cobro"],
                  ["efectivo", "Efectivo"],
                  ["tarjeta", "Tarjeta"],
                  ["transferencia", "Transferencia"],
                ]}
              />
              <span className="ml-auto self-center font-body text-xs text-muted-foreground">
                {filteredOrders.length} de {orders.length} pedidos
              </span>
            </div>
          </section>

          <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-base font-bold">Pedidos registrados</h2>
                  <p className="font-body text-xs text-muted-foreground">
                    Toca un pedido para ver sus artículos
                  </p>
                </div>
                <span className="rounded-full bg-surface-raised px-2.5 py-1 font-data text-xs text-muted-foreground">
                  {filteredOrders.length}
                </span>
              </div>

              {loading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <RefreshCw size={24} className="animate-spin text-brand" />
                  <p className="font-body text-sm">Cargando historial...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/35 px-6 text-center">
                  <ReceiptText size={34} className="mb-3 text-muted-foreground/50" />
                  <p className="font-heading text-sm font-bold">No encontramos pedidos</p>
                  <p className="mt-1 max-w-sm font-body text-xs text-muted-foreground">
                    Prueba con otro rango o limpia los filtros para ver más ventas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order) => (
                    <HistoryOrderRow
                      key={order.id}
                      order={order}
                      selected={selectedOrder?.id === order.id}
                      onClick={() => setSelectedOrder(order)}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside className="hidden min-h-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card xl:block">
              {selectedOrder ? (
                <OrderDetail
                  order={selectedOrder}
                  onDelete={canDeleteHistory ? () => setDeleteTarget(selectedOrder) : undefined}
                  onPay={() => openPaymentModal(selectedOrder)}
                  onReceipt={() => void openTickets(selectedOrder)}
                />
              ) : (
                <EmptyDetail />
              )}
            </aside>
          </div>
        </div>
      </div>

      {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-ink/60 p-2 backdrop-blur-sm xl:hidden sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedOrder(null);
          }}
        >
          <div className="flex max-h-[92vh] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float sm:mx-auto sm:max-w-lg">
            <OrderDetail
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onDelete={canDeleteHistory ? () => setDeleteTarget(selectedOrder) : undefined}
              onPay={() => openPaymentModal(selectedOrder)}
              onReceipt={() => void openTickets(selectedOrder)}
            />
          </div>
        </div>
      ) : null}

      {paymentOrders ? (
        <PaymentFlow
          orders={paymentOrders}
          title={paymentOrders.length > 1 ? `Cuenta · ${formatOrderLocation(paymentOrders[0])}` : undefined}
          onClose={() => setPaymentOrders(null)}
          onCompleted={() => void loadHistory()}
        />
      ) : null}

      {ticketOrder ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !ticketLoading) setTicketOrder(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Tickets del pedido" className="w-full max-w-lg rounded-t-2xl bg-surface p-5 shadow-float sm:rounded-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand"><ReceiptText size={19} /></span>
              <div className="min-w-0 flex-1"><h2 className="font-heading text-lg font-bold">Tickets del pedido #{ticketOrder.number}</h2><p className="font-body text-xs text-muted-foreground">Cada pago parcial conserva su propio comprobante.</p></div>
              <button type="button" onClick={() => setTicketOrder(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button>
            </div>
            {ticketLoading && ticketChoices.length === 0 ? <div className="flex h-32 items-center justify-center"><RefreshCw size={22} className="animate-spin text-brand" /></div> : (
              <div className="space-y-2">
                {ticketChoices.map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-3 rounded-xl bg-background p-3">
                    <div className="min-w-0 flex-1"><p className="font-data text-sm font-bold">Ticket {ticket.folio}</p><p className="font-body text-xs text-muted-foreground">{formatDateTime(ticket.created_at)} · {formatPaymentMoney(ticket.total_amount)}</p></div>
                    {ticket.status === "voided" ? <span className="rounded-full bg-destructive/10 px-2 py-1 font-heading text-[10px] font-bold text-destructive">Anulado</span> : null}
                    {(viewerRole === "owner" || viewerRole === "admin") && ticket.status === "completed" ? <button type="button" onClick={() => setCorrectionTicket({ id: ticket.id, folio: ticket.folio })} aria-label={`Corregir método del ticket ${ticket.folio}`} title="Corregir método de pago" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-warning/10 hover:text-warning"><Pencil size={16} /></button> : null}
                    {(viewerRole === "owner" || viewerRole === "admin") && ticket.status === "completed" ? <button type="button" onClick={() => void voidPayment(ticket.id)} aria-label={`Anular ticket ${ticket.folio}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Ban size={16} /></button> : null}
                    <button type="button" onClick={() => void viewReceipt(ticket.id)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-raised px-3 font-heading text-xs font-bold text-foreground hover:bg-border"><Printer size={15} /> Ver</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {receipt ? <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} /> : null}

      {correctionTicket ? (
        <PaymentMethodCorrectionDialog
          transactionId={correctionTicket.id}
          folio={correctionTicket.folio}
          onClose={() => setCorrectionTicket(null)}
          onCorrected={async () => {
            await loadHistory();
            if (ticketOrder) await openTickets(ticketOrder);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isDeleting) setDeleteTarget(null);
          }}
        >
          <div
            role="alertdialog"
            aria-labelledby="history-delete-title"
            aria-describedby="history-delete-description"
            className="w-full max-w-sm rounded-3xl border border-destructive/30 bg-surface p-6 shadow-float"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 size={22} />
            </div>
            <h3 id="history-delete-title" className="font-heading text-xl font-bold">
              Eliminar pedido #{deleteTarget.number}
            </h3>
            <p
              id="history-delete-description"
              className="mt-2 font-body text-sm leading-6 text-muted-foreground"
            >
              Se eliminarán el pedido y sus artículos del historial de forma permanente. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-12 flex-1 rounded-xl border border-border font-heading text-sm font-bold text-muted-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteOrder()}
                className="action-danger h-12 flex-1 rounded-xl font-heading text-sm font-bold disabled:cursor-wait disabled:opacity-60"
              >
                {isDeleting ? "Eliminando..." : "Eliminar pedido"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseCalendarDate(value));
}

function DayCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedDate = parseCalendarDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
  const canGoNext = monthStart < currentMonth;

  function selectDay(day: number) {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    if (date > today) return;
    onChange(toInputDate(date));
    setOpen(false);
  }

  function goToToday() {
    onChange(toInputDate(today));
    setViewMonth(currentMonth);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3.5 font-heading text-xs font-bold text-foreground transition-colors hover:border-border-strong focus:border-brand focus:outline-none"
      >
        <CalendarDays size={16} className="text-brand" />
        <span>{formatCalendarDate(value)}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Seleccionar día del historial"
          className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-float"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-heading text-sm font-bold capitalize">
              {new Intl.DateTimeFormat("es-MX", {
                month: "long",
                year: "numeric",
              }).format(viewMonth)}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() =>
                  setViewMonth(
                    new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Mes siguiente"
                disabled={!canGoNext}
                onClick={() =>
                  setViewMonth(
                    new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center">
            {["lu", "ma", "mi", "ju", "vi", "sá", "do"].map((day) => (
              <span key={day} className="py-1 font-data text-[10px] uppercase text-muted-foreground">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, index) => (
              <span key={`empty-${index}`} className="h-9" aria-hidden="true" />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
              const dateValue = toInputDate(date);
              const isSelected = dateValue === value;
              const isToday = date.getTime() === today.getTime();
              const isFuture = date > today;
              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={isFuture}
                  aria-label={`${day} de ${new Intl.DateTimeFormat("es-MX", { month: "long" }).format(date)}`}
                  aria-pressed={isSelected}
                  onClick={() => selectDay(day)}
                  className={`flex h-9 items-center justify-center rounded-lg font-data text-xs transition-colors ${
                    isSelected
                      ? "bg-brand font-bold text-white"
                      : isToday
                        ? "bg-brand-light font-bold text-brand"
                        : "text-foreground hover:bg-surface-raised"
                  } ${isFuture ? "cursor-not-allowed opacity-25" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={goToToday}
            className="mt-3 h-9 w-full rounded-lg border border-border bg-background font-heading text-xs font-bold text-muted-foreground hover:border-brand hover:text-brand"
          >
            Ir a hoy
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3">
      <span className="font-body text-[11px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 bg-transparent font-heading text-xs font-bold text-foreground outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue} className="bg-surface text-foreground">
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function HistoryOrderRow({
  order,
  selected,
  onClick,
}: {
  order: SalesHistoryOrder;
  selected: boolean;
  onClick: () => void;
}) {
  const status = STATUS_META[order.status];
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4 ${
        selected
          ? "border-brand/60 bg-brand-light/40"
          : "border-border bg-background/40 hover:border-border-strong hover:bg-background/80"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-brand text-white" : "bg-surface-raised text-muted-foreground"}`}>
        <OrderTypeIcon type={order.type} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-data text-sm font-bold">#{order.number}</span>
          <span className={`rounded-full px-2 py-0.5 font-heading text-[10px] font-bold ${status.className}`}>
            {status.label}
          </span>
        </span>
        <span className="mt-1 block truncate font-body text-xs text-muted-foreground">
          {formatTime(order.created_at)} · {TYPE_LABELS[order.type]}
          {order.type === "comedor" ? ` · ${formatOrderLocation(order)}` : ""}
          {order.customer_name ? ` · ${order.customer_name}` : ""}
        </span>
        <span className="mt-1 block truncate font-body text-xs text-muted-foreground/80">
          {itemsCount} {itemsCount === 1 ? "artículo" : "artículos"}
          {order.items.length > 0 ? ` · ${order.items[0].menu_item_name}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="font-data text-sm font-bold text-brand">{formatMoney(order.total)}</span>
        <ChevronRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center px-8 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised text-muted-foreground">
        <FileText size={22} />
      </span>
      <h3 className="font-heading text-sm font-bold">Selecciona un pedido</h3>
      <p className="mt-1 max-w-xs font-body text-xs leading-relaxed text-muted-foreground">
        Aquí verás los productos, modificadores, mesa y método de pago.
      </p>
    </div>
  );
}
