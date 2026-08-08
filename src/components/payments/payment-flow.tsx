"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Loader2,
  Minus,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  Scissors,
  ShieldCheck,
  Split,
  Tag,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { listPaymentAuthorizersAction } from "@/lib/actions/users";
import { useOrderStore } from "@/lib/stores";
import { formatOrderLocation } from "@/lib/order-location";
import type { Order, OrderItem } from "@/types/database";
import type {
  PaymentAuthorizer,
  PaymentItemAllocationInput,
  PaymentMethod,
  PaymentOrderAllocationInput,
  PaymentReceipt,
  PaymentTenderInput,
} from "@/types/payments";

interface PayableItem extends OrderItem {
  menu_item_name?: string;
}

export interface PayableOrder extends Order {
  items: PayableItem[];
}

type SplitMode = "complete" | "equal" | "products";
type FlowStage = "account" | "method" | "receipt";
type TenderMode = PaymentMethod | "combined";

interface PaymentFlowProps {
  orders: PayableOrder[];
  onClose: () => void;
  onCompleted?: (receipt: PaymentReceipt) => void;
  title?: string;
}

interface RemainingLine {
  order: PayableOrder;
  item: PayableItem;
  remainingQuantity: number;
  unitTotal: number;
  remainingTotal: number;
}

interface PreparedPayment {
  gross: number;
  items: PaymentItemAllocationInput[];
  orders: PaymentOrderAllocationInput[];
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatPaymentMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("es-MX", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function itemUnitTotal(item: PayableItem) {
  return roundMoney(
    item.unit_price +
      item.selected_modifiers.reduce((sum, modifier) => sum + modifier.price, 0)
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function distributeDiscount(
  grossByOrder: Array<{ orderId: string; gross: number }>,
  discount: number
) {
  let assigned = 0;
  return grossByOrder.map((entry, index) => {
    const isLast = index === grossByOrder.length - 1;
    const amount = isLast
      ? roundMoney(discount - assigned)
      : roundMoney((discount * entry.gross) / grossByOrder.reduce((sum, row) => sum + row.gross, 0));
    assigned = roundMoney(assigned + amount);
    return { ...entry, discount: Math.max(0, amount) };
  });
}

function prepareProportionalPayment(
  lines: RemainingLine[],
  target: number,
  ratio: number,
  discount: number
): PreparedPayment {
  const activeLines = lines.filter((line) => line.remainingQuantity > 0 && line.remainingTotal > 0);
  const totalWeight = activeLines.reduce((sum, line) => sum + line.remainingTotal, 0);
  let assigned = 0;
  const items = activeLines.map((line, index) => {
    const isLast = index === activeLines.length - 1;
    const lineTotal = isLast
      ? roundMoney(target - assigned)
      : roundMoney((target * line.remainingTotal) / totalWeight);
    assigned = roundMoney(assigned + lineTotal);
    return {
      orderId: line.order.id,
      allocation: {
        order_item_id: line.item.id,
        quantity: roundQuantity(line.remainingQuantity * ratio),
        line_total: Math.max(0, lineTotal),
      },
    };
  });

  const orderTotals = new Map<string, number>();
  for (const row of items) {
    orderTotals.set(
      row.orderId,
      roundMoney((orderTotals.get(row.orderId) ?? 0) + row.allocation.line_total)
    );
  }
  const discounted = distributeDiscount(
    Array.from(orderTotals, ([orderId, gross]) => ({ orderId, gross })),
    discount
  );

  return {
    gross: target,
    items: items.map((row) => row.allocation),
    orders: discounted.map((row) => ({
      order_id: row.orderId,
      gross_amount: row.gross,
      discount_amount: row.discount,
    })),
  };
}

function prepareProductPayment(
  lines: RemainingLine[],
  selectedQuantities: Record<string, number>,
  discount: number
): PreparedPayment {
  const selected = lines
    .map((line) => ({
      line,
      quantity: Math.min(
        line.remainingQuantity,
        Math.max(0, selectedQuantities[line.item.id] ?? 0)
      ),
    }))
    .filter((row) => row.quantity > 0);
  const items = selected.map((row) => ({
    orderId: row.line.order.id,
    allocation: {
      order_item_id: row.line.item.id,
      quantity: roundQuantity(row.quantity),
      line_total: roundMoney(row.line.unitTotal * row.quantity),
    },
  }));
  const gross = roundMoney(items.reduce((sum, row) => sum + row.allocation.line_total, 0));
  const orderTotals = new Map<string, number>();
  for (const row of items) {
    orderTotals.set(
      row.orderId,
      roundMoney((orderTotals.get(row.orderId) ?? 0) + row.allocation.line_total)
    );
  }
  const discounted = distributeDiscount(
    Array.from(orderTotals, ([orderId, orderGross]) => ({ orderId, gross: orderGross })),
    discount
  );
  return {
    gross,
    items: items.map((row) => row.allocation),
    orders: discounted.map((row) => ({
      order_id: row.orderId,
      gross_amount: row.gross,
      discount_amount: row.discount,
    })),
  };
}

function nextCashSuggestions(total: number) {
  const values = [
    total,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 200) * 200,
    Math.ceil(total / 500) * 500,
  ];
  return Array.from(new Set(values.map(roundMoney))).filter((value) => value >= total).slice(0, 4);
}

export function PaymentFlow({ orders, onClose, onCompleted, title }: PaymentFlowProps) {
  const [stage, setStage] = useState<FlowStage>("account");
  const [splitMode, setSplitMode] = useState<SplitMode>("complete");
  const [equalParts, setEqualParts] = useState(2);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [paidOffsets, setPaidOffsets] = useState<Record<string, number>>({});
  const [accountLoading, setAccountLoading] = useState(true);
  const [discountKind, setDiscountKind] = useState<"percent" | "fixed">("percent");
  const [discountInput, setDiscountInput] = useState("");
  const [authorizers, setAuthorizers] = useState<PaymentAuthorizer[]>([]);
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");
  const [authorization, setAuthorization] = useState<{
    token: string;
    amount: number;
    authorizerId: string;
  } | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [tipChoice, setTipChoice] = useState<0 | 10 | 15 | 20 | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const [tenderMode, setTenderMode] = useState<TenderMode>("efectivo");
  const [combinedAmounts, setCombinedAmounts] = useState<Record<PaymentMethod, string>>({
    efectivo: "",
    tarjeta: "",
    transferencia: "",
  });
  const [cashReceived, setCashReceived] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPaymentGuide, setShowPaymentGuide] = useState(false);
  const fetchActiveOrders = useOrderStore((state) => state.fetchActiveOrders);

  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      const itemIds = orders.flatMap((order) => order.items.map((item) => item.id));
      const supabase = createClient();
      if (itemIds.length > 0) {
        const { data: allocations, error } = await supabase
          .from("payment_item_allocations")
          .select("transaction_id,order_item_id,quantity")
          .in("order_item_id", itemIds);
        if (!error && allocations && allocations.length > 0) {
          const allocationRows = allocations as Array<{
            transaction_id: string;
            order_item_id: string;
            quantity: number;
          }>;
          const transactionIds = Array.from(new Set(allocationRows.map((row) => row.transaction_id)));
          const { data: transactions } = await supabase
            .from("payment_transactions")
            .select("id,status")
            .in("id", transactionIds)
            .eq("status", "completed");
          const transactionRows = (transactions ?? []) as Array<{ id: string }>;
          const completed = new Set(transactionRows.map((row) => row.id));
          const quantities: Record<string, number> = {};
          for (const allocation of allocationRows) {
            if (!completed.has(allocation.transaction_id)) continue;
            quantities[allocation.order_item_id] = roundQuantity(
              (quantities[allocation.order_item_id] ?? 0) + Number(allocation.quantity)
            );
          }
          if (!cancelled) setUsedQuantities(quantities);
        }
      }
      const result = await listPaymentAuthorizersAction();
      if (!cancelled) {
        setAuthorizers(result.authorizers);
        setAuthorizerId(result.authorizers[0]?.id ?? "");
        setAccountLoading(false);
      }
    }
    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  const remainingLines = useMemo<RemainingLine[]>(
    () =>
      orders.flatMap((order) =>
        order.items.map((item) => {
          const remainingQuantity = Math.max(
            0,
            roundQuantity(item.quantity - (usedQuantities[item.id] ?? 0))
          );
          const unitTotal = itemUnitTotal(item);
          return {
            order,
            item,
            remainingQuantity,
            unitTotal,
            remainingTotal: roundMoney(unitTotal * remainingQuantity),
          };
        })
      ),
    [orders, usedQuantities]
  );

  const accountBalance = useMemo(
    () =>
      roundMoney(
        orders.reduce((sum, order) => {
          const storedPaid = Number(order.paid_amount ?? (order.payment_status === "paid" ? order.total : 0));
          return sum + Math.max(0, order.total - storedPaid - (paidOffsets[order.id] ?? 0));
        }, 0)
      ),
    [orders, paidOffsets]
  );

  const selectedGross = useMemo(() => {
    if (splitMode === "products") {
      return roundMoney(
        remainingLines.reduce(
          (sum, line) =>
            sum +
            line.unitTotal *
              Math.min(line.remainingQuantity, Math.max(0, selectedQuantities[line.item.id] ?? 0)),
          0
        )
      );
    }
    if (splitMode === "equal") return roundMoney(accountBalance / equalParts);
    return accountBalance;
  }, [accountBalance, equalParts, remainingLines, selectedQuantities, splitMode]);

  const discountAmount = useMemo(() => {
    const input = Math.max(0, Number(discountInput) || 0);
    const raw = discountKind === "percent" ? selectedGross * Math.min(input, 99.99) / 100 : input;
    return Math.min(Math.max(0, roundMoney(raw)), Math.max(0, roundMoney(selectedGross - 0.01)));
  }, [discountInput, discountKind, selectedGross]);

  const discountAuthorized = Boolean(
    authorization &&
      authorization.amount === discountAmount &&
      authorization.authorizerId === authorizerId
  );

  const netBeforeTip = roundMoney(selectedGross - discountAmount);
  const tipAmount = useMemo(() => {
    if (tipChoice === "custom") return roundMoney(Math.max(0, Number(customTip) || 0));
    return roundMoney(netBeforeTip * tipChoice / 100);
  }, [customTip, netBeforeTip, tipChoice]);
  const paymentTotal = roundMoney(netBeforeTip + tipAmount);

  const preparedPayment = useMemo(() => {
    if (selectedGross <= 0) return { gross: 0, items: [], orders: [] } satisfies PreparedPayment;
    if (splitMode === "products") {
      return prepareProductPayment(remainingLines, selectedQuantities, discountAmount);
    }
    const ratio = accountBalance > 0 ? Math.min(1, selectedGross / accountBalance) : 0;
    return prepareProportionalPayment(
      remainingLines,
      selectedGross,
      splitMode === "complete" ? 1 : ratio,
      discountAmount
    );
  }, [accountBalance, discountAmount, remainingLines, selectedGross, selectedQuantities, splitMode]);

  const accountName =
    title ??
    (orders[0]?.table_number
      ? `Cuenta · ${formatOrderLocation(orders[0])}`
      : orders.length === 1
        ? `Pedido #${orders[0].number}`
        : `${orders.length} pedidos`);

  async function authorizeDiscount() {
    if (!authorizerId || !/^\d{4}$/.test(pin) || discountAmount <= 0) {
      setErrorMessage("Selecciona un administrador y escribe su PIN de 4 dígitos");
      return;
    }
    setAuthorizing(true);
    setErrorMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("authorize_payment_discount", {
      p_authorizer_id: authorizerId,
      p_pin: pin,
      p_idempotency_key: idempotencyKey,
      p_discount_amount: discountAmount,
    });
    setAuthorizing(false);
    setPin("");
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (!data) {
      setErrorMessage("PIN incorrecto. Después de 5 intentos se bloquea durante 10 minutos");
      return;
    }
    setAuthorization({
      token: data as string,
      amount: discountAmount,
      authorizerId,
    });
    toast.success("Descuento autorizado");
  }

  function goToMethod() {
    setErrorMessage(null);
    if (accountLoading) return;
    if (preparedPayment.items.length === 0 || selectedGross <= 0) {
      setErrorMessage("Selecciona al menos un producto para cobrar");
      return;
    }
    if (selectedGross > accountBalance + 0.001) {
      setErrorMessage("La selección supera el saldo disponible");
      return;
    }
    if (discountAmount > 0 && !discountAuthorized) {
      setErrorMessage("Autoriza el descuento antes de continuar");
      return;
    }
    setCashReceived(String(paymentTotal));
    setCombinedAmounts({ efectivo: "", tarjeta: String(paymentTotal), transferencia: "" });
    setStage("method");
  }

  function buildTenders(): PaymentTenderInput[] | null {
    if (tenderMode !== "combined") {
      const tender: PaymentTenderInput = { method: tenderMode, amount: paymentTotal };
      if (tenderMode === "efectivo") {
        const received = roundMoney(Number(cashReceived) || 0);
        if (received < paymentTotal) return null;
        tender.cash_received = received;
      }
      return [tender];
    }

    const tenders: PaymentTenderInput[] = [];
    for (const method of Object.keys(METHOD_LABELS) as PaymentMethod[]) {
      const amount = roundMoney(Number(combinedAmounts[method]) || 0);
      if (amount <= 0) continue;
      tenders.push(
        method === "efectivo"
          ? { method, amount, cash_received: roundMoney(Number(cashReceived) || 0) }
          : { method, amount }
      );
    }
    if (tenders.length < 2) return null;
    if (roundMoney(tenders.reduce((sum, tender) => sum + tender.amount, 0)) !== paymentTotal) return null;
    const cash = tenders.find((tender) => tender.method === "efectivo");
    if (cash && (cash.cash_received ?? 0) < cash.amount) return null;
    return tenders;
  }

  async function finalizePayment() {
    const tenders = buildTenders();
    if (!tenders) {
      setErrorMessage(
        tenderMode === "combined"
          ? "Usa al menos dos métodos y distribuye exactamente el total"
          : "El efectivo recibido no cubre el cobro"
      );
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("finalize_payment", {
      p_idempotency_key: idempotencyKey,
      p_order_allocations: preparedPayment.orders,
      p_item_allocations: preparedPayment.items,
      p_tenders: tenders,
      p_tip_amount: tipAmount,
      p_discount_authorization: discountAuthorized ? authorization?.token ?? null : null,
    });
    setSubmitting(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo registrar el pago");
      return;
    }

    const nextReceipt = data as PaymentReceipt;
    setReceipt(nextReceipt);
    setStage("receipt");
    setPaidOffsets((current) => {
      const next = { ...current };
      for (const allocation of preparedPayment.orders) {
        next[allocation.order_id] = roundMoney(
          (next[allocation.order_id] ?? 0) + allocation.gross_amount
        );
      }
      return next;
    });
    setUsedQuantities((current) => {
      const next = { ...current };
      for (const allocation of preparedPayment.items) {
        next[allocation.order_item_id] = roundQuantity(
          (next[allocation.order_item_id] ?? 0) + allocation.quantity
        );
      }
      return next;
    });
    void fetchActiveOrders();
    onCompleted?.(nextReceipt);
    toast.success(`Pago registrado. Ticket ${nextReceipt.transaction.folio}`);
  }

  function continueWithRemaining() {
    setReceipt(null);
    setStage("account");
    setIdempotencyKey(crypto.randomUUID());
    setAuthorization(null);
    setDiscountInput("");
    setTipChoice(0);
    setCustomTip("");
    setSelectedQuantities({});
    setTenderMode("efectivo");
    setCombinedAmounts({ efectivo: "", tarjeta: "", transferencia: "" });
    setCashReceived("");
    if (splitMode === "equal") setEqualParts((current) => Math.max(1, current - 1));
  }

  function updateProductQuantity(line: RemainingLine, delta: number) {
    setSelectedQuantities((current) => ({
      ...current,
      [line.item.id]: Math.min(
        line.remainingQuantity,
        Math.max(0, roundQuantity((current[line.item.id] ?? 0) + delta))
      ),
    }));
  }

  function fillTender(method: PaymentMethod) {
    const otherTotal = (Object.keys(METHOD_LABELS) as PaymentMethod[])
      .filter((candidate) => candidate !== method)
      .reduce((sum, candidate) => sum + (Number(combinedAmounts[candidate]) || 0), 0);
    const remainder = Math.max(0, roundMoney(paymentTotal - otherTotal));
    setCombinedAmounts((current) => ({ ...current, [method]: remainder ? String(remainder) : "" }));
    if (method === "efectivo") setCashReceived(String(remainder));
  }

  const combinedTotal = roundMoney(
    (Object.keys(METHOD_LABELS) as PaymentMethod[]).reduce(
      (sum, method) => sum + (Number(combinedAmounts[method]) || 0),
      0
    )
  );
  const cashApplied =
    tenderMode === "efectivo"
      ? paymentTotal
      : tenderMode === "combined"
        ? Number(combinedAmounts.efectivo) || 0
        : 0;
  const change = Math.max(0, roundMoney((Number(cashReceived) || 0) - cashApplied));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-flow-title"
        className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-float sm:max-h-[92dvh] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          {stage === "method" ? (
            <button
              type="button"
              onClick={() => setStage("account")}
              aria-label="Volver a la cuenta"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              {stage === "receipt" ? <CheckCircle2 size={20} /> : <ReceiptText size={20} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="payment-flow-title" className="truncate font-heading text-base font-bold sm:text-lg">
              {stage === "receipt" ? "Pago completado" : accountName}
            </h2>
            <p className="font-body text-xs text-muted-foreground">
              {stage === "account" ? "1. Cuenta" : stage === "method" ? "2. Pago" : "3. Ticket"}
            </p>
          </div>
          {stage !== "receipt" ? (
            <div className="hidden items-center gap-1 sm:flex" aria-label="Progreso del cobro">
              {["Cuenta", "Pago", "Ticket"].map((label, index) => {
                const active = index <= (stage === "account" ? 0 : 1);
                return (
                  <span key={label} className="flex items-center gap-1">
                    <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${active ? "bg-brand text-white" : "bg-surface-raised text-muted-foreground"}`}>
                      {label}
                    </span>
                    {index < 2 ? <ChevronRight size={12} className="text-muted-foreground/50" /> : null}
                  </span>
                );
              })}
            </div>
          ) : null}
          {stage !== "receipt" ? (
            <button
              type="button"
              onClick={() => setShowPaymentGuide(true)}
              aria-label="Abrir guía de cobro"
              title="Guía de cobro"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-brand"
            >
              <CircleHelp aria-hidden size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar cobro"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-40"
          >
            <X size={19} />
          </button>
        </header>

        {stage === "receipt" && receipt ? (
          <ReceiptSuccess
            receipt={receipt}
            remainingBalance={accountBalance}
            onClose={onClose}
            onContinue={continueWithRemaining}
          />
        ) : (
          <div className="pos-scroll min-h-0 flex-1 overflow-y-auto">
            {stage === "account" ? (
              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
                <div className="space-y-5">
                  <section>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-base font-bold">¿Qué parte vas a cobrar?</h3>
                        <p className="font-body text-xs text-muted-foreground">
                          Saldo de {orders.length} pedido{orders.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="font-data text-2xl font-bold text-brand">{formatPaymentMoney(accountBalance)}</p>
                    </div>
                    {orders.length > 1 ? (
                      <div className="mb-3 rounded-xl bg-warning-light px-3 py-2 font-body text-xs leading-5 text-warning">
                        Esta cuenta incluye todos los pedidos abiertos de la mesa, incluso los que siguen en cocina.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2">
                      <SplitModeButton active={splitMode === "complete"} onClick={() => setSplitMode("complete")} icon={<Utensils size={17} />} label="Cuenta completa" />
                      <SplitModeButton active={splitMode === "equal"} onClick={() => setSplitMode("equal")} icon={<Split size={17} />} label="Partes iguales" />
                      <SplitModeButton active={splitMode === "products"} onClick={() => setSplitMode("products")} icon={<Scissors size={17} />} label="Por productos" />
                    </div>
                  </section>

                  {splitMode === "equal" ? (
                    <section className="rounded-2xl bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-heading text-sm font-bold">Dividir la cuenta</h3>
                          <p className="font-body text-xs text-muted-foreground">Cobra una parte y continúa con la siguiente.</p>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl bg-surface p-1">
                          <button type="button" onClick={() => setEqualParts((value) => Math.max(2, value - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised"><Minus size={15} /></button>
                          <span className="w-7 text-center font-data text-base font-bold">{equalParts}</span>
                          <button type="button" onClick={() => setEqualParts((value) => Math.min(12, value + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised"><Plus size={15} /></button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <span className="font-body text-xs text-muted-foreground">Cada parte</span>
                        <span className="font-data text-lg font-bold text-foreground">{formatPaymentMoney(selectedGross)}</span>
                      </div>
                    </section>
                  ) : null}

                  {splitMode === "products" ? (
                    <section>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="font-heading text-sm font-bold">Productos de esta parte</h3>
                        <button type="button" onClick={() => setSelectedQuantities({})} className="font-heading text-xs font-bold text-brand hover:text-brand-hover">Limpiar</button>
                      </div>
                      <div className="space-y-2">
                        {remainingLines.filter((line) => line.remainingQuantity > 0).map((line) => {
                          const selected = selectedQuantities[line.item.id] ?? 0;
                          return (
                            <div key={line.item.id} className="flex items-center gap-3 rounded-xl bg-background p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-heading text-sm font-bold">{line.item.menu_item_name ?? "Producto"}</p>
                                <p className="font-body text-xs text-muted-foreground">
                                  Pedido #{line.order.number} · {formatPaymentMoney(line.unitTotal)} c/u · {formatQuantity(line.remainingQuantity)} disponibles
                                </p>
                              </div>
                              <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
                                <button type="button" onClick={() => updateProductQuantity(line, -1)} disabled={selected <= 0} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised disabled:opacity-30"><Minus size={14} /></button>
                                <span className="w-8 text-center font-data text-sm font-bold">{formatQuantity(selected)}</span>
                                <button type="button" onClick={() => updateProductQuantity(line, 1)} disabled={selected >= line.remainingQuantity} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised disabled:opacity-30"><Plus size={14} /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <section className="rounded-2xl bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Tag size={16} className="text-brand" />
                      <h3 className="font-heading text-sm font-bold">Descuento</h3>
                      {discountAuthorized ? <span className="ml-auto inline-flex items-center gap-1 font-body text-xs text-success"><ShieldCheck size={14} /> Autorizado</span> : null}
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-2">
                      <div className="flex rounded-xl bg-surface p-1">
                        <button type="button" onClick={() => setDiscountKind("percent")} aria-pressed={discountKind === "percent"} className={`flex h-10 w-10 items-center justify-center rounded-lg ${discountKind === "percent" ? "bg-brand text-white" : "text-muted-foreground"}`}><Percent size={15} /></button>
                        <button type="button" onClick={() => setDiscountKind("fixed")} aria-pressed={discountKind === "fixed"} className={`flex h-10 w-10 items-center justify-center rounded-lg ${discountKind === "fixed" ? "bg-brand text-white" : "text-muted-foreground"}`}><Banknote size={15} /></button>
                      </div>
                      <label className="relative">
                        <span className="sr-only">Valor del descuento</span>
                        <input inputMode="decimal" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} placeholder="Sin descuento" className="form-input pr-10" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-data text-xs text-muted-foreground">{discountKind === "percent" ? "%" : "$"}</span>
                      </label>
                    </div>
                    {discountAmount > 0 && !discountAuthorized ? (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <select value={authorizerId} onChange={(event) => setAuthorizerId(event.target.value)} className="form-input">
                          {authorizers.length === 0 ? <option value="">Sin administradores disponibles</option> : null}
                          {authorizers.map((authorizer) => <option key={authorizer.id} value={authorizer.id}>{authorizer.full_name || (authorizer.role === "owner" ? "Dueño" : "Administrador")}</option>)}
                        </select>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="PIN de 4 dígitos" className="form-input" />
                          <button type="button" onClick={() => void authorizeDiscount()} disabled={authorizing || pin.length !== 4} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-raised px-4 font-heading text-xs font-bold text-foreground hover:bg-border disabled:opacity-40">
                            {authorizing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            Autorizar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-2xl bg-background p-4">
                    <h3 className="mb-3 font-heading text-sm font-bold">Propina opcional</h3>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0, 10, 15, 20].map((value) => (
                        <button key={value} type="button" onClick={() => setTipChoice(value as 0 | 10 | 15 | 20)} className={`h-10 rounded-xl font-data text-xs font-bold ${tipChoice === value ? "bg-brand text-white" : "bg-surface text-muted-foreground hover:text-foreground"}`}>{value}%</button>
                      ))}
                      <button type="button" onClick={() => setTipChoice("custom")} className={`h-10 rounded-xl font-heading text-[10px] font-bold ${tipChoice === "custom" ? "bg-brand text-white" : "bg-surface text-muted-foreground hover:text-foreground"}`}>Otra</button>
                    </div>
                    {tipChoice === "custom" ? <input inputMode="decimal" value={customTip} onChange={(event) => setCustomTip(event.target.value)} placeholder="Monto de propina" className="form-input mt-2" /> : null}
                  </section>

                  <PaymentSummary gross={selectedGross} discount={discountAmount} tip={tipAmount} total={paymentTotal} />
                </div>
              </div>
            ) : (
              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                  <h3 className="font-heading text-base font-bold">¿Cómo pagará?</h3>
                  <p className="mb-4 font-body text-xs text-muted-foreground">Puedes registrar uno o combinar varios métodos.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <TenderModeButton active={tenderMode === "efectivo"} onClick={() => setTenderMode("efectivo")} icon={<Banknote size={19} />} label="Efectivo" />
                    <TenderModeButton active={tenderMode === "tarjeta"} onClick={() => setTenderMode("tarjeta")} icon={<CreditCard size={19} />} label="Tarjeta" />
                    <TenderModeButton active={tenderMode === "transferencia"} onClick={() => setTenderMode("transferencia")} icon={<ArrowLeftRight size={19} />} label="Transferencia" />
                    <TenderModeButton active={tenderMode === "combined"} onClick={() => { setTenderMode("combined"); const first = roundMoney(paymentTotal / 2); setCombinedAmounts({ efectivo: String(first), tarjeta: String(roundMoney(paymentTotal - first)), transferencia: "" }); setCashReceived(String(first)); }} icon={<Split size={19} />} label="Combinar" />
                  </div>

                  {tenderMode === "combined" ? (
                    <div className="mt-4 space-y-2 rounded-2xl bg-background p-4">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => (
                        <div key={method} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
                          <span className="font-heading text-xs font-bold">{METHOD_LABELS[method]}</span>
                          <input inputMode="decimal" value={combinedAmounts[method]} onChange={(event) => { const value = event.target.value; setCombinedAmounts((current) => ({ ...current, [method]: value })); if (method === "efectivo" && !cashReceived) setCashReceived(value); }} placeholder="$0" className="form-input text-right font-data" />
                          <button type="button" onClick={() => fillTender(method)} className="h-10 rounded-xl px-3 font-heading text-[10px] font-bold text-brand hover:bg-brand-light">Completar</button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="font-body text-xs text-muted-foreground">Distribuido</span>
                        <span className={`font-data text-sm font-bold ${combinedTotal === paymentTotal ? "text-success" : "text-warning"}`}>{formatPaymentMoney(combinedTotal)} / {formatPaymentMoney(paymentTotal)}</span>
                      </div>
                    </div>
                  ) : null}

                  {(tenderMode === "efectivo" || (tenderMode === "combined" && Number(combinedAmounts.efectivo) > 0)) ? (
                    <div className="mt-4 rounded-2xl bg-background p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label htmlFor="cash-received" className="font-heading text-sm font-bold">Efectivo recibido</label>
                        <input id="cash-received" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} className="form-input w-32 text-right font-data text-base font-bold" />
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {nextCashSuggestions(cashApplied).map((suggestion) => <button key={suggestion} type="button" onClick={() => setCashReceived(String(suggestion))} className="h-10 rounded-xl bg-surface font-data text-xs font-bold text-muted-foreground hover:text-foreground">{formatPaymentMoney(suggestion)}</button>)}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <span className="font-body text-xs text-muted-foreground">Cambio</span>
                        <span className="font-data text-xl font-bold text-success">{formatPaymentMoney(change)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <PaymentSummary gross={selectedGross} discount={discountAmount} tip={tipAmount} total={paymentTotal} emphasis />
                  <div className="rounded-xl bg-gold-light px-3 py-3 font-body text-xs leading-5 text-gold">
                    Tarjeta y transferencia solo registran el cobro. La operación se realiza en la terminal o banca externa.
                  </div>
                </div>
              </div>
            )}

            {errorMessage ? (
              <div role="alert" className="mx-4 mb-4 rounded-xl bg-destructive/10 px-4 py-3 font-body text-sm text-destructive sm:mx-5">
                {errorMessage}
              </div>
            ) : null}
          </div>
        )}

        {stage !== "receipt" ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="font-body text-[11px] text-muted-foreground">{stage === "account" ? "Total de esta parte" : "Total a registrar"}</p>
              <p className="font-data text-xl font-bold text-foreground">{formatPaymentMoney(paymentTotal)}</p>
            </div>
            {stage === "account" ? (
              <button type="button" onClick={goToMethod} disabled={accountLoading || selectedGross <= 0} className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40">
                {accountLoading ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                Continuar
              </button>
            ) : (
              <button type="button" onClick={() => void finalizePayment()} disabled={submitting} className="action-success inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-xl px-5 font-heading text-sm font-bold disabled:cursor-wait disabled:opacity-50">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {submitting ? "Registrando..." : "Confirmar pago"}
              </button>
            )}
          </footer>
        ) : null}
      </div>
      {showPaymentGuide ? <PaymentGuide onClose={() => setShowPaymentGuide(false)} /> : null}
    </div>
  );
}

const PAYMENT_GUIDE_STEPS = [
  {
    title: "Elige qué vas a cobrar",
    body: "Cuenta completa liquida todo el saldo abierto de la mesa, incluso si se acumuló en varios pedidos. Si cierras el cobro, la cuenta permanece pendiente sin cambios.",
  },
  {
    title: "Divide en partes iguales",
    body: "Selecciona cuántas personas pagarán. Registra una parte y usa Cobrar siguiente parte hasta terminar. Cada pago genera su propio ticket.",
  },
  {
    title: "Divide por productos",
    body: "Marca la cantidad de cada producto que pagará la persona actual. Lo no seleccionado permanece en la cuenta para cobrarlo después.",
  },
  {
    title: "Descuento y propina",
    body: "El descuento puede ser porcentaje o monto fijo y requiere el PIN de una persona autorizada. La propina se agrega únicamente a esta parte del cobro.",
  },
  {
    title: "Efectivo, tarjeta o transferencia",
    body: "En efectivo captura lo recibido para calcular el cambio. Tarjeta y transferencia registran la operación realizada fuera de Mideli.",
  },
  {
    title: "Pago combinado",
    body: "Combinar permite pagar una parte en efectivo y otra con tarjeta o transferencia. La suma distribuida debe ser exactamente igual al total antes de confirmar.",
  },
  {
    title: "Ticket y correcciones",
    body: "Al confirmar se crea un ticket de 48 mm. Puedes reimprimirlo desde Historial. Administración también puede corregir el método de pago dejando un motivo en auditoría.",
  },
] as const;

function PaymentGuide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = PAYMENT_GUIDE_STEPS[index];

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="payment-guide-title" className="w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-surface shadow-float sm:rounded-2xl">
        <div className="h-1 bg-surface-raised">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${((index + 1) / PAYMENT_GUIDE_STEPS.length) * 100}%` }} />
        </div>
        <header className="flex items-start gap-3 border-b border-border p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"><CircleHelp aria-hidden size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Cobro · {index + 1} de {PAYMENT_GUIDE_STEPS.length}</p>
            <h2 id="payment-guide-title" className="mt-1 font-heading text-base font-bold">{step.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar guía" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X aria-hidden size={17} /></button>
        </header>
        <div className="p-5">
          <p className="font-body text-sm leading-6 text-muted-foreground">{step.body}</p>
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 font-heading text-xs font-bold text-muted-foreground disabled:opacity-30"><ArrowLeft aria-hidden size={15} /> Atrás</button>
            {index === PAYMENT_GUIDE_STEPS.length - 1 ? (
              <button type="button" onClick={onClose} className="action-success ml-auto inline-flex h-11 items-center gap-2 rounded-xl px-4 font-heading text-xs font-bold"><Check aria-hidden size={15} /> Entendido</button>
            ) : (
              <button type="button" onClick={() => setIndex((current) => Math.min(PAYMENT_GUIDE_STEPS.length - 1, current + 1))} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white">Siguiente <ArrowRight aria-hidden size={15} /></button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SplitModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl px-2 text-center font-heading text-[11px] font-bold transition-colors sm:text-xs ${active ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-background text-muted-foreground hover:text-foreground"}`}>
      {icon}
      {label}
    </button>
  );
}

function TenderModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-20 flex-col items-center justify-center gap-2 rounded-xl font-heading text-xs font-bold transition-colors ${active ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-background text-muted-foreground hover:text-foreground"}`}>
      {icon}
      {label}
    </button>
  );
}

function PaymentSummary({ gross, discount, tip, total, emphasis = false }: { gross: number; discount: number; tip: number; total: number; emphasis?: boolean }) {
  return (
    <section className={`rounded-2xl p-4 ${emphasis ? "bg-ink text-white" : "bg-background"}`}>
      <div className="space-y-2 font-body text-sm">
        <div className="flex justify-between gap-3 text-muted-foreground"><span>Consumo</span><span className="font-data">{formatPaymentMoney(gross)}</span></div>
        {discount > 0 ? <div className="flex justify-between gap-3 text-success"><span>Descuento</span><span className="font-data">-{formatPaymentMoney(discount)}</span></div> : null}
        {tip > 0 ? <div className="flex justify-between gap-3 text-gold"><span>Propina</span><span className="font-data">{formatPaymentMoney(tip)}</span></div> : null}
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
        <span className="font-heading text-sm font-bold">Total</span>
        <span className={`font-data text-2xl font-bold ${emphasis ? "text-white" : "text-brand"}`}>{formatPaymentMoney(total)}</span>
      </div>
    </section>
  );
}

function ReceiptSuccess({ receipt, remainingBalance, onClose, onContinue }: { receipt: PaymentReceipt; remainingBalance: number; onClose: () => void; onContinue: () => void }) {
  return (
    <div className="pos-scroll min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-5">
      <div className="mx-auto grid max-w-3xl gap-5 lg:grid-cols-[1fr_auto]">
        <div className="order-2 flex flex-col justify-center lg:order-1">
          <CheckCircle2 size={34} className="mb-3 text-success" />
          <h3 className="font-heading text-xl font-bold">Cobro registrado correctamente</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Ticket {receipt.transaction.folio} · {formatPaymentMoney(receipt.transaction.total_amount)}
          </p>
          <p className="mt-5 rounded-xl bg-surface px-3 py-2 font-body text-xs text-muted-foreground">
            Formato optimizado para rollo de 48 mm.
          </p>
          <button type="button" onClick={() => window.print()} className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-heading text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover">
            <Printer size={17} />
            Imprimir ticket
          </button>
          {remainingBalance > 0.001 ? (
            <button type="button" onClick={onContinue} className="action-success mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold">
              <Split size={17} />
              Cobrar siguiente parte · {formatPaymentMoney(remainingBalance)}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="mt-2 h-11 rounded-xl font-heading text-sm font-bold text-muted-foreground hover:bg-surface hover:text-foreground">Cerrar</button>
        </div>
        <ReceiptPaper receipt={receipt} />
      </div>
    </div>
  );
}

export function ReceiptDialog({ receipt, onClose, reprint = true }: { receipt: PaymentReceipt; onClose: () => void; reprint?: boolean }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Vista previa del ticket" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-float sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <ReceiptText size={19} className="text-brand" />
          <div className="min-w-0 flex-1"><h2 className="font-heading text-base font-bold">Ticket {receipt.transaction.folio}</h2><p className="font-body text-xs text-muted-foreground">Vista previa de reimpresión</p></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button>
        </header>
        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto bg-background p-4">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            <p className="w-full rounded-xl bg-surface px-3 py-2 text-center font-body text-xs text-muted-foreground">
              Vista previa para rollo de 48 mm
            </p>
            <ReceiptPaper receipt={receipt} reprint={reprint} />
          </div>
        </div>
        <footer className="flex gap-2 border-t border-border px-4 py-3"><button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl font-heading text-sm font-bold text-muted-foreground hover:bg-surface-raised">Cerrar</button><button type="button" onClick={() => window.print()} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-heading text-sm font-bold text-white"><Printer size={17} /> Imprimir</button></footer>
      </div>
    </div>
  );
}

function ReceiptPaper({ receipt, reprint = false }: { receipt: PaymentReceipt; reprint?: boolean }) {
  const transaction = receipt.transaction;
  const date = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Hermosillo",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(transaction.created_at));
  const orderNumbers = receipt.orders.map((order) => `#${order.number}`).join(", ");
  return (
    <article
      className="payment-receipt-print-root order-1 w-full shrink-0 bg-[#fffdf4] px-5 py-6 text-[#111] shadow-float lg:order-2"
      style={{ maxWidth: "181px", ["--ticket-width" as string]: "48mm" }}
    >
      <div className="text-center">
        <p className="font-brand text-3xl text-[#111]">Mideli</p>
        <p className="mt-1 font-heading text-[11px] font-bold uppercase tracking-[0.14em]">Burger & Sushi</p>
        <p className="mt-2 font-body text-[10px] leading-4">C. Yaqui 404 Oriente<br />Cd. Obregón, Sonora</p>
        {reprint ? <p className="mt-2 font-data text-[10px] font-bold tracking-[0.18em]">REIMPRESIÓN</p> : null}
      </div>
      <div className="my-4 border-t border-dashed border-[#777]" />
      <div className="space-y-1 font-data text-[10px]">
        <p className="flex justify-between gap-3"><span>Ticket</span><strong>{transaction.folio}</strong></p>
        <p className="flex justify-between gap-3"><span>Pedido</span><strong>{orderNumbers}</strong></p>
        <p className="flex justify-between gap-3"><span>Fecha</span><strong className="text-right">{date}</strong></p>
        {transaction.table_number ? <p className="flex justify-between gap-3"><span>Mesa</span><strong>{transaction.table_number}</strong></p> : null}
        {transaction.customer_name ? <p className="flex justify-between gap-3"><span>Cliente</span><strong className="text-right">{transaction.customer_name}</strong></p> : null}
        <p className="flex justify-between gap-3"><span>Atendió</span><strong className="text-right">{transaction.charged_by_name ?? "Personal Mideli"}</strong></p>
      </div>
      <div className="my-4 border-t border-dashed border-[#777]" />
      <div className="space-y-3">
        {receipt.items.map((item) => (
          <div key={`${item.order_item_id}-${item.quantity}`}>
            <div className="grid grid-cols-[auto_1fr_auto] gap-1 font-body text-[10px] font-bold">
              <span>{formatQuantity(item.quantity)}x</span><span>{item.item_name}</span><span>{formatPaymentMoney(item.line_total)}</span>
            </div>
            {item.selected_modifiers.length > 0 ? (
              <div className="ml-4 mt-1 space-y-0.5 font-body text-[10px] text-[#444]">
                {item.selected_modifiers.map((modifier, index) => <p key={`${modifier.option}-${index}`}>+ {modifier.option}{modifier.price > 0 ? ` ${formatPaymentMoney(modifier.price)}` : ""}{modifier.description ? `: ${modifier.description}` : ""}</p>)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="my-4 border-t border-dashed border-[#777]" />
      <div className="space-y-1 font-data text-[10px]">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatPaymentMoney(transaction.subtotal_amount)}</span></p>
        {transaction.discount_amount > 0 ? <p className="flex justify-between"><span>Descuento</span><span>-{formatPaymentMoney(transaction.discount_amount)}</span></p> : null}
        {transaction.tip_amount > 0 ? <p className="flex justify-between"><span>Propina</span><span>{formatPaymentMoney(transaction.tip_amount)}</span></p> : null}
        <p className="mt-2 flex justify-between font-heading text-sm font-bold"><span>Total</span><span>{formatPaymentMoney(transaction.total_amount)}</span></p>
      </div>
      <div className="my-4 border-t border-dashed border-[#777]" />
      <div className="space-y-1 font-data text-[10px]">
        {receipt.tenders.map((tender, index) => <p key={`${tender.method}-${index}`} className="flex justify-between"><span>{METHOD_LABELS[tender.method]}</span><span>{formatPaymentMoney(tender.amount)}</span></p>)}
        {transaction.cash_received > 0 ? <p className="flex justify-between"><span>Recibido</span><span>{formatPaymentMoney(transaction.cash_received)}</span></p> : null}
        {transaction.change_given > 0 ? <p className="flex justify-between"><span>Cambio</span><span>{formatPaymentMoney(transaction.change_given)}</span></p> : null}
      </div>
      {transaction.status === "voided" ? <p className="mt-4 border border-[#111] py-1 text-center font-data text-[10px] font-bold">PAGO ANULADO</p> : null}
      <p className="mt-6 text-center font-heading text-[11px] font-bold">Gracias por tu compra</p>
    </article>
  );
}
