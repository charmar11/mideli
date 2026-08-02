"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Landmark,
  Loader2,
  LockKeyhole,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCashShiftStore } from "@/lib/stores";
import { formatOrderLocation } from "@/lib/order-location";
import type { CashAuthorizer, CashShift, CashShiftDetail } from "@/types/cash";

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "En curso";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function duration(shift: CashShift) {
  const end = shift.closed_at ? new Date(shift.closed_at).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - new Date(shift.opened_at).getTime()) / 60000));
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ShiftStatus({ shift }: { shift: CashShift }) {
  if (shift.status === "open") {
    return <span className="rounded-full bg-success/12 px-2.5 py-1 font-heading text-[11px] font-bold text-success">En curso</span>;
  }
  const difference = Number(shift.difference ?? 0);
  return (
    <span className={`rounded-full px-2.5 py-1 font-heading text-[11px] font-bold ${Math.abs(difference) <= 20 ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
      {difference === 0 ? "Cuadrado" : `Dif. ${money(difference)}`}
    </span>
  );
}

export function CashHistoryManager() {
  const listHistory = useCashShiftStore((state) => state.listHistory);
  const getDetail = useCashShiftStore((state) => state.getDetail);
  const listAuthorizers = useCashShiftStore((state) => state.listAuthorizers);
  const authorizeAction = useCashShiftStore((state) => state.authorizeAction);
  const recordAdjustment = useCashShiftStore((state) => state.recordAdjustment);

  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [selected, setSelected] = useState<CashShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMethod, setAdjustMethod] = useState<"efectivo" | "tarjeta" | "transferencia" | "otro">("efectivo");
  const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">("increase");
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [authorizers, setAuthorizers] = useState<CashAuthorizer[]>([]);
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listHistory();
    setLoading(false);
    if (result.error) return toast.error(result.error);
    setShifts(result.data ?? []);
  }, [listHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function choose(shift: CashShift) {
    setDetailLoading(true);
    const result = await getDetail(shift.id);
    setDetailLoading(false);
    if (result.error || !result.data) return toast.error(result.error ?? "No se pudo abrir el corte");
    setSelected(result.data);
  }

  async function openAdjustment() {
    const result = await listAuthorizers();
    if (result.error) return toast.error(result.error);
    setAuthorizers(result.data ?? []);
    setAdjusting(true);
  }

  async function saveAdjustment() {
    if (!selected || adjustAmount <= 0 || !adjustReason.trim() || !authorizerId || pin.length !== 4) {
      toast.error("Completa importe, motivo, responsable y PIN");
      return;
    }
    setSaving(true);
    const authorization = await authorizeAction({
      authorizerId,
      pin,
      shiftId: selected.id,
      action: "shift_adjustment",
      amount: adjustAmount,
    });
    if (authorization.error || !authorization.data) {
      setSaving(false);
      return toast.error(authorization.error);
    }
    const result = await recordAdjustment({
      shiftId: selected.id,
      paymentMethod: adjustMethod,
      direction: adjustDirection,
      amount: adjustAmount,
      reason: adjustReason.trim(),
      authorization: authorization.data,
    });
    setSaving(false);
    if (result.error || !result.data) return toast.error(result.error);
    setSelected(result.data);
    setAdjusting(false);
    setAdjustAmount(0);
    setAdjustReason("");
    setAuthorizerId("");
    setPin("");
    toast.success("Corrección registrada", { description: "El corte original no fue modificado." });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shifts.filter((shift) => {
      const searchable = `${shift.number} ${shift.opened_by_name} ${shift.closed_by_name ?? ""}`.toLowerCase();
      return (status === "all" || shift.status === status) && (!query || searchable.includes(query));
    });
  }, [search, shifts, status]);

  const summary = useMemo(() => {
    const closed = shifts.filter((shift) => shift.status === "closed");
    return {
      net: closed.reduce((sum, shift) => sum + Number(shift.net_sales), 0),
      collected: closed.reduce((sum, shift) => sum + Number(shift.collected_total), 0),
      differences: closed.reduce((sum, shift) => sum + Math.abs(Number(shift.difference ?? 0)), 0),
      count: closed.length,
    };
  }, [shifts]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex min-h-16 items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-6 print:hidden">
        <Link href="/dashboard/mesero" aria-label="Volver al punto de venta" className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"><ArrowLeft size={19} /></Link>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand"><Landmark size={20} /></span>
        <div className="min-w-0 flex-1"><h1 className="font-heading text-lg font-black">Caja y cortes</h1><p className="truncate font-body text-xs text-muted-foreground">Turnos, diferencias y auditoría de cobros</p></div>
        <button type="button" onClick={() => void load()} aria-label="Actualizar" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"><RefreshCw size={17} /></button>
      </header>

      <main className="mx-auto max-w-[1500px] p-3 sm:p-5 lg:p-6">
        <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4 print:hidden">
          <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Cortes cerrados</p><p className="mt-2 font-data text-2xl font-black">{summary.count}</p></div>
          <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Venta neta</p><p className="mt-2 font-data text-2xl font-black text-gold">{money(summary.net)}</p></div>
          <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Cobrado</p><p className="mt-2 font-data text-2xl font-black text-success">{money(summary.collected)}</p></div>
          <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Diferencias acumuladas</p><p className={`mt-2 font-data text-2xl font-black ${summary.differences > 0 ? "text-warning" : "text-success"}`}>{money(summary.differences)}</p></div>
        </div>

        <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-[390px_minmax(0,1fr)]">
          <section className={`${selected ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-border print:hidden`}>
            <div className="space-y-3 border-b border-border p-3">
              <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar folio o responsable" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-brand" /></div>
              <div className="grid grid-cols-3 rounded-xl bg-background p-1">{(["all", "open", "closed"] as const).map((value) => <button key={value} type="button" onClick={() => setStatus(value)} className={`h-9 rounded-lg font-heading text-xs font-bold ${status === value ? "bg-brand text-white" : "text-muted-foreground"}`}>{value === "all" ? "Todos" : value === "open" ? "Abiertos" : "Cerrados"}</button>)}</div>
            </div>
            <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="animate-spin text-brand" /></div> : filtered.length === 0 ? <div className="flex h-48 flex-col items-center justify-center text-center"><ReceiptText className="mb-2 text-muted-foreground/40" /><p className="font-heading text-sm font-bold">Sin cortes en este filtro</p></div> : filtered.map((shift) => (
                <button key={shift.id} type="button" onClick={() => void choose(shift)} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-transparent bg-background/60 p-3 text-left hover:border-brand/35">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised font-data text-sm font-black">#{shift.number}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate font-heading text-sm">{shift.opened_by_name}</strong><ShiftStatus shift={shift} /></span><span className="mt-1 block font-body text-xs text-muted-foreground">{dateTime(shift.opened_at)} · {duration(shift)}</span></span>
                  <ChevronRight size={17} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>

          <section className={`${selected ? "flex" : "hidden lg:flex"} min-h-0 flex-col`}>
            {detailLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-brand" /></div> : selected ? (
              <>
                <div className="flex items-center gap-3 border-b border-border p-4 print:border-black print:bg-white print:text-black">
                  <button type="button" onClick={() => setSelected(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised lg:hidden print:hidden"><ArrowLeft size={17} /></button>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-heading text-xl font-black">Corte #{selected.number}</h2><ShiftStatus shift={selected} /></div><p className="font-body text-xs text-muted-foreground print:text-gray-600">{dateTime(selected.opened_at)} a {dateTime(selected.closed_at)}</p></div>
                  {selected.status === "closed" ? <button type="button" onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-xl bg-surface-raised px-3 font-heading text-xs font-bold print:hidden"><Printer size={15} />Imprimir</button> : null}
                  {selected.status === "closed" ? <button type="button" onClick={() => void openAdjustment()} className="flex h-10 items-center gap-2 rounded-xl bg-warning/12 px-3 font-heading text-xs font-bold text-warning print:hidden"><RotateCcw size={15} /><span className="hidden sm:inline">Corregir</span></button> : null}
                </div>
                <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 print:overflow-visible print:bg-white print:text-black">
                  <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Venta neta" value={money(selected.net_sales)} tone="gold" /><Metric label="Cobrado" value={money(selected.collected_total)} tone="success" /><Metric label="Esperado" value={money(selected.expected_cash)} /><Metric label="Diferencia" value={money(selected.difference)} tone={Math.abs(Number(selected.difference ?? 0)) <= 20 ? "success" : "danger"} /></div>
                  <div className="mb-5 grid gap-4 xl:grid-cols-2">
                    <Block title="Métodos de pago" icon={<WalletCards size={17} />}><Rows rows={[["Efectivo", money(selected.cash_total), <Banknote key="cash" size={15} />],["Tarjeta", money(selected.card_total), <CreditCard key="card" size={15} />],["Transferencia", money(selected.transfer_total), <ArrowLeftRight key="transfer" size={15} />],["Propinas", money(selected.tip_total), null],["Descuentos", money(selected.discount_total), null]]} /></Block>
                    <Block title="Operación de caja" icon={<Landmark size={17} />}><Rows rows={[["Fondo inicial", money(selected.opening_float), null],["Entradas de fondo", money(selected.fund_in_total), null],["Retiros", money(selected.withdrawal_total), null],["Gastos", money(selected.expense_total), null],["Efectivo contado", money(selected.counted_cash), null]]} /></Block>
                  </div>
                  {selected.pending_orders.length > 0 ? <Block title={`Cuentas transferidas · ${selected.pending_orders.length}`} icon={<CircleAlert size={17} />}><div className="divide-y divide-border">{selected.pending_orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-heading text-sm font-bold">Pedido #{order.order_number}</p><p className="font-body text-xs text-muted-foreground">{formatOrderLocation({ type: order.order_type, table_number: order.table_number, table_zone_name: order.table_zone_name, customer_name: order.customer_name })}</p></div><strong className="font-data text-warning">{money(order.outstanding_amount)}</strong></div>)}</div></Block> : null}
                  {selected.movements.length > 0 ? <Block title="Movimientos autorizados" icon={<RotateCcw size={17} />}><div className="divide-y divide-border">{selected.movements.map((movement) => <div key={movement.id} className="py-3"><div className="flex justify-between gap-3"><strong className="font-heading text-sm">{movement.reason}</strong><span className={`font-data text-sm font-bold ${movement.direction === "in" ? "text-success" : "text-destructive"}`}>{movement.direction === "in" ? "+" : "−"}{money(movement.amount)}</span></div><p className="mt-1 font-body text-xs text-muted-foreground">{movement.created_by_name} · autorizó {movement.authorized_by_name} · {dateTime(movement.created_at)}</p></div>)}</div></Block> : null}
                  {selected.adjustments.length > 0 ? <Block title="Correcciones posteriores" icon={<LockKeyhole size={17} />}><div className="divide-y divide-border">{selected.adjustments.map((adjustment) => <div key={adjustment.id} className="py-3"><div className="flex justify-between gap-3"><strong className="font-heading text-sm">{adjustment.reason}</strong><span className={`font-data text-sm font-bold ${adjustment.direction === "increase" ? "text-success" : "text-destructive"}`}>{adjustment.direction === "increase" ? "+" : "−"}{money(adjustment.amount)}</span></div><p className="mt-1 font-body text-xs text-muted-foreground">{adjustment.payment_method} · {adjustment.created_by_name} · autorizó {adjustment.authorized_by_name}</p></div>)}</div></Block> : null}
                  <Block title={`Tickets · ${selected.payments.length}`} icon={<ReceiptText size={17} />}><div className="divide-y divide-border">{selected.payments.length === 0 ? <p className="py-4 text-center font-body text-sm text-muted-foreground">Sin cobros en este turno</p> : selected.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-heading text-sm font-bold">Ticket #{payment.folio}</p><p className="font-body text-xs text-muted-foreground">{formatOrderLocation({ type: payment.table_number ? "comedor" : "para_llevar", table_number: payment.table_number, table_zone_name: payment.table_zone_name, customer_name: payment.customer_name })} · {payment.charged_by_name}</p></div><strong className="font-data">{money(payment.total_amount)}</strong></div>)}</div></Block>
                </div>
              </>
            ) : <div className="flex flex-1 flex-col items-center justify-center text-center"><span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised text-muted-foreground"><Landmark size={25} /></span><h2 className="font-heading text-base font-bold">Selecciona un corte</h2><p className="mt-1 font-body text-sm text-muted-foreground">Aquí verás el detalle completo y su auditoría.</p></div>}
          </section>
        </div>
      </main>

      {adjusting && selected ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 sm:items-center sm:p-4"><section className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-4 shadow-float sm:rounded-2xl sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-lg font-black">Corregir corte #{selected.number}</h2><p className="font-body text-xs text-muted-foreground">Se agrega un registro; el corte original no cambia.</p></div><button type="button" onClick={() => setAdjusting(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground"><X size={18} /></button></div><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><select value={adjustMethod} onChange={(event) => setAdjustMethod(event.target.value as typeof adjustMethod)} className="h-11 rounded-xl border border-border bg-background px-3 font-body text-sm"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></select><select value={adjustDirection} onChange={(event) => setAdjustDirection(event.target.value as typeof adjustDirection)} className="h-11 rounded-xl border border-border bg-background px-3 font-body text-sm"><option value="increase">Sumar</option><option value="decrease">Restar</option></select></div><input type="number" inputMode="decimal" min="0" step="0.01" value={adjustAmount || ""} onChange={(event) => setAdjustAmount(Number(event.target.value))} placeholder="Importe" className="h-12 w-full rounded-xl border border-border bg-background px-3 font-data text-lg font-bold" /><textarea value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Motivo de la corrección" rows={2} className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm" /><div className="rounded-xl border border-warning/30 bg-warning/8 p-3"><div className="mb-2 flex items-center gap-2 font-heading text-sm font-bold"><LockKeyhole size={16} className="text-warning" />Autorización</div><div className="grid gap-2 sm:grid-cols-2"><select value={authorizerId} onChange={(event) => setAuthorizerId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-body text-sm"><option value="">Responsable</option>{authorizers.map((authorizer) => <option key={authorizer.id} value={authorizer.id} disabled={!authorizer.pin_configured}>{authorizer.full_name}{authorizer.pin_configured ? "" : " · sin PIN"}</option>)}</select><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" placeholder="PIN" className="h-11 rounded-xl border border-border bg-background px-3 font-data tracking-[0.3em]" /></div></div><button type="button" disabled={saving} onClick={() => void saveAdjustment()} className="action-success inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Autorizar y registrar</button></div></section></div> : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "gold" | "success" | "danger" }) {
  return <div className="rounded-xl bg-background/70 p-3 print:border print:border-gray-300 print:bg-white"><p className="font-body text-xs text-muted-foreground print:text-gray-600">{label}</p><p className={`mt-1 font-data text-lg font-black ${tone === "gold" ? "text-gold" : tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""}`}>{value}</p></div>;
}

function Block({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="mb-4 rounded-2xl border border-border bg-background/40 p-4 print:border-gray-300 print:bg-white"><h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-black">{icon}{title}</h3>{children}</section>;
}

function Rows({ rows }: { rows: Array<[string, string, React.ReactNode]> }) {
  return <div className="space-y-2">{rows.map(([label, value, icon]) => <div key={label} className="flex items-center justify-between gap-3 font-body text-sm"><span className="flex items-center gap-2 text-muted-foreground print:text-gray-600">{icon}{label}</span><strong className="font-data">{value}</strong></div>)}</div>;
}
