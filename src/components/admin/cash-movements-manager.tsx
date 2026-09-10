"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCashShiftStore } from "@/lib/stores";
import {
  currentBusinessMonth,
  dateLabel,
  effectiveAmount,
  monthLabel,
  monthRange,
  monthWeeks,
  movementTypeLabel,
  shiftMonth,
  summarizeMovements,
  type CashDayGroup,
  type CashPeriodSummary,
  type CashWeekGroup,
} from "@/lib/cash-movement-periods";
import type { CashAuthorizer, CashMovementRecord, CashMovementType } from "@/types/cash";

type MovementFilter = "all" | CashMovementType;
type StatusFilter = "all" | "active" | "corrected" | "voided";
type CorrectionMode = "correct" | "void";
type ViewLevel = "month" | "week" | "day";

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Hermosillo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function typeIcon(type: CashMovementType) {
  if (type === "fund_addition") return ArrowDownToLine;
  if (type === "withdrawal") return ArrowUpFromLine;
  return type === "correction" ? RotateCcw : CircleDollarSign;
}

function periodRangeLabel(startKey: string, endKey: string) {
  return `${dateLabel(startKey)} - ${dateLabel(endKey)}`;
}

function summaryTotal(summary: CashPeriodSummary) {
  return summary.expenses + summary.withdrawals + summary.funds;
}

function SummaryCards({ summary }: { summary: CashPeriodSummary }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
    <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Movimientos</p><p className="mt-2 font-data text-2xl font-black">{summary.count}</p></div>
    <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Gastos</p><p className="mt-2 font-data text-2xl font-black text-destructive">{money(summary.expenses)}</p></div>
    <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Retiros</p><p className="mt-2 font-data text-2xl font-black text-warning">{money(summary.withdrawals)}</p></div>
    <div className="rounded-2xl bg-surface p-4"><p className="font-body text-xs text-muted-foreground">Fondos agregados</p><p className="mt-2 font-data text-2xl font-black text-success">{money(summary.funds)}</p></div>
  </div>;
}

function PeriodTotals({ summary }: { summary: CashPeriodSummary }) {
  return <div className="mt-4 flex flex-wrap gap-2 font-body text-xs text-muted-foreground">
    <span className="rounded-full bg-destructive/10 px-3 py-2 text-destructive">Gastos {money(summary.expenses)}</span>
    <span className="rounded-full bg-warning/10 px-3 py-2 text-warning">Retiros {money(summary.withdrawals)}</span>
    <span className="rounded-full bg-success/10 px-3 py-2 text-success">Fondos {money(summary.funds)}</span>
    <span className="rounded-full bg-surface-raised px-3 py-2">Total {money(summaryTotal(summary))}</span>
  </div>;
}

function EmptyState({ message, detail }: { message: string; detail: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/45 px-5 text-center">
    <CircleDollarSign className="mb-3 text-muted-foreground/40" size={28} />
    <p className="font-heading text-sm font-bold">{message}</p>
    <p className="mt-1 max-w-md font-body text-xs text-muted-foreground">{detail}</p>
  </div>;
}

function Breadcrumbs({ level, month, week, day, onMonth, onWeek }: { level: ViewLevel; month: string; week: CashWeekGroup | null; day: CashDayGroup | null; onMonth: () => void; onWeek: () => void }) {
  return <div className="flex flex-wrap items-center gap-1 font-heading text-sm">
    <button type="button" onClick={onMonth} className={`rounded-lg px-2 py-2 ${level === "month" ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}>{monthLabel(month)}</button>
    {week ? <><ChevronRight size={15} className="text-muted-foreground" /><button type="button" onClick={onWeek} className={`rounded-lg px-2 py-2 ${level === "week" ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}>Semana {periodRangeLabel(week.startKey, week.endKey)}</button></> : null}
    {day ? <><ChevronRight size={15} className="text-muted-foreground" /><span className="rounded-lg bg-brand/12 px-2 py-2 capitalize text-brand">{dateLabel(day.key, { weekday: "long", day: "numeric", month: "long" })}</span></> : null}
  </div>;
}

function MovementList({ movements, onCorrect, onVoid }: { movements: CashMovementRecord[]; onCorrect: (movement: CashMovementRecord) => void; onVoid: (movement: CashMovementRecord) => void }) {
  if (movements.length === 0) return <EmptyState message="No hay movimientos en este día" detail="Cuando se registre un gasto, retiro o fondo aparecerá aquí." />;
  return <div className="space-y-2">
    {movements.map((movement) => {
      const Icon = typeIcon(movement.movement_type);
      const effective = effectiveAmount(movement);
      const isOut = movement.direction === "out";
      return <article key={movement.id} className="rounded-2xl border border-border bg-background/60 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${movement.correction_status === "voided" ? "bg-destructive/10 text-destructive" : isOut ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}><Icon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-sm font-bold">{movementTypeLabel(movement.movement_type)}</h3><span className="rounded-full bg-surface-raised px-2 py-1 font-data text-[10px] text-muted-foreground">Turno #{movement.shift_number}</span>{movement.correction_status !== "active" ? <span className={`rounded-full px-2 py-1 font-heading text-[10px] font-bold ${movement.correction_status === "voided" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{movement.correction_status === "voided" ? "Anulado" : "Corregido"}</span> : null}</div>
            <p className="mt-1 font-heading text-sm">{movement.reason}</p>
            <p className="mt-1 font-body text-xs text-muted-foreground">{movement.created_by_name} · autorizado por {movement.authorized_by_name} · {dateTime(movement.created_at)}</p>
            {movement.correction_reason ? <p className="mt-2 rounded-lg bg-warning/8 px-3 py-2 font-body text-xs text-warning">{movement.correction_reason} · {movement.corrected_by_name ?? "Administrador"}</p> : null}
          </div>
          <div className="shrink-0 text-right">{movement.corrected_amount !== null ? <><p className="font-data text-xs text-muted-foreground line-through">{money(movement.amount)}</p><p className={`font-data text-base font-black ${movement.corrected_amount === 0 ? "text-destructive" : isOut ? "text-warning" : "text-success"}`}>{money(movement.corrected_amount)}</p></> : <p className={`font-data text-base font-black ${isOut ? "text-destructive" : "text-success"}`}>{isOut ? "−" : "+"}{money(effective)}</p>}</div>
        </div>
        {movement.correction_status === "active" && movement.movement_type !== "correction" ? <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3"><button type="button" onClick={() => onCorrect(movement)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-raised px-3 font-heading text-xs font-bold hover:bg-border"><RotateCcw size={15} />Corregir importe</button><button type="button" onClick={() => onVoid(movement)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive/10 px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/15">Anular movimiento</button></div> : null}
      </article>;
    })}
  </div>;
}

export function CashMovementsManager() {
  const listMovements = useCashShiftStore((state) => state.listMovements);
  const listAuthorizers = useCashShiftStore((state) => state.listAuthorizers);
  const authorizeAction = useCashShiftStore((state) => state.authorizeAction);
  const correctMovement = useCashShiftStore((state) => state.correctMovement);
  const [month, setMonth] = useState(currentBusinessMonth);
  const [movements, setMovements] = useState<CashMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MovementFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<CashMovementRecord | null>(null);
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>("correct");
  const [correctedAmount, setCorrectedAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [authorizers, setAuthorizers] = useState<CashAuthorizer[]>([]);
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listMovements(monthRange(month));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setMovements(result.data ?? []);
  }, [listMovements, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return movements.filter((movement) => {
      const matchesType = type === "all" || movement.movement_type === type;
      const matchesStatus = status === "all" || movement.correction_status === status;
      const searchable = `${movement.reason} ${movement.created_by_name} ${movement.authorized_by_name} ${movement.shift_number}`.toLowerCase();
      return matchesType && matchesStatus && (!query || searchable.includes(query));
    });
  }, [movements, search, status, type]);

  const weeks = useMemo(() => monthWeeks(month, filtered), [filtered, month]);
  const selectedWeek = weeks.find((week) => week.key === selectedWeekKey) ?? null;
  const selectedDay = selectedWeek?.days.find((day) => day.key === selectedDayKey) ?? null;
  const summary = useMemo(() => summarizeMovements(filtered), [filtered]);

  const level: ViewLevel = selectedWeek ? (selectedDay ? "day" : "week") : "month";

  function navigateMonth(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedWeekKey(null);
    setSelectedDayKey(null);
  }

  function selectWeek(week: CashWeekGroup) {
    setSelectedWeekKey(week.key);
    setSelectedDayKey(null);
  }

  function selectDay(day: CashDayGroup) {
    setSelectedDayKey(day.key);
  }

  async function openCorrection(movement: CashMovementRecord, mode: CorrectionMode) {
    const result = await listAuthorizers();
    if (result.error) { toast.error(result.error); return; }
    setAuthorizers(result.data ?? []);
    setCorrectionTarget(movement);
    setCorrectionMode(mode);
    setCorrectedAmount(mode === "void" ? 0 : movement.amount);
    setReason("");
    setAuthorizerId("");
    setPin("");
  }

  function closeCorrection() {
    if (saving) return;
    setCorrectionTarget(null);
    setReason("");
    setAuthorizerId("");
    setPin("");
  }

  async function saveCorrection() {
    if (!correctionTarget) return;
    if (correctionMode === "correct" && correctedAmount < 0) { toast.error("El importe corregido no puede ser negativo"); return; }
    const nextAmount = correctionMode === "void" ? 0 : correctedAmount;
    const delta = Math.abs(Number(correctionTarget.amount) - Number(nextAmount));
    if (delta <= 0 || !reason.trim() || !authorizerId || pin.length !== 4) { toast.error("Completa el importe, motivo, responsable y PIN"); return; }
    setSaving(true);
    const authorization = await authorizeAction({ authorizerId, pin, shiftId: correctionTarget.shift_id, action: "cash_movement", amount: delta });
    if (authorization.error || !authorization.data) { setSaving(false); toast.error(authorization.error); return; }
    const result = await correctMovement({ movementId: correctionTarget.id, correctedAmount: nextAmount, reason: reason.trim(), authorization: authorization.data });
    setSaving(false);
    if (result.error) { toast.error(result.error); return; }
    closeCorrection();
    await load();
    toast.success(correctionMode === "void" ? "Movimiento anulado" : "Movimiento corregido", { description: "El importe original permanece en el historial para auditoría." });
  }

  const currentSummary = selectedDay?.summary ?? selectedWeek?.summary ?? summary;

  return <section className="mx-auto max-w-[1500px] p-3 sm:p-5 lg:p-6">
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-heading text-xl font-black">Gastos y movimientos</h2><p className="mt-1 font-body text-sm text-muted-foreground">Consulta la caja por mes, semana o día.</p></div><div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5"><button type="button" onClick={() => navigateMonth(shiftMonth(month, -1))} aria-label="Mes anterior" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"><ChevronLeft size={18} /></button><div className="min-w-36 text-center"><p className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Periodo</p><p className="font-heading text-sm font-bold capitalize">{monthLabel(month)}</p></div><button type="button" onClick={() => navigateMonth(shiftMonth(month, 1))} aria-label="Mes siguiente" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"><ChevronRight size={18} /></button><button type="button" onClick={() => void load()} aria-label="Actualizar movimientos" className="ml-1 flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-surface-raised hover:text-foreground"><RefreshCw size={16} /></button></div></div>
    <SummaryCards summary={summary} />
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:p-4 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar motivo, persona o turno" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-brand" /></div><div className="grid grid-cols-2 gap-2 sm:flex"><select value={type} onChange={(event) => setType(event.target.value as MovementFilter)} className="h-11 rounded-xl border border-border bg-background px-3 font-heading text-xs font-bold outline-none focus:border-brand"><option value="all">Todos los tipos</option><option value="expense">Gastos</option><option value="withdrawal">Retiros</option><option value="fund_addition">Fondos</option><option value="correction">Correcciones</option></select><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-11 rounded-xl border border-border bg-background px-3 font-heading text-xs font-bold outline-none focus:border-brand"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="corrected">Corregidos</option><option value="voided">Anulados</option></select></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4"><Breadcrumbs level={level} month={month} week={selectedWeek} day={selectedDay} onMonth={() => { setSelectedWeekKey(null); setSelectedDayKey(null); }} onWeek={() => setSelectedDayKey(null)} />{level !== "month" ? <button type="button" onClick={() => level === "day" ? setSelectedDayKey(null) : setSelectedWeekKey(null)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-background px-3 font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground"><ArrowLeft size={15} />Regresar</button> : null}</div>
      <div className="p-3 sm:p-4">{loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand" /></div> : error ? <div className="space-y-3"><EmptyState message="No se pudo cargar este periodo" detail={error} /><button type="button" onClick={() => void load()} className="mx-auto flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white"><RefreshCw size={16} />Reintentar</button></div> : level === "month" ? <><div className="mb-4 flex items-end justify-between gap-3"><div><p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Historial mensual</p><h3 className="mt-1 font-heading text-lg font-black capitalize">{monthLabel(month)}</h3></div><p className="font-body text-xs text-muted-foreground">{weeks.length} semanas · {summary.count} movimientos</p></div><div className="grid gap-3 xl:grid-cols-2">{weeks.map((week, index) => <button key={week.key} type="button" onClick={() => selectWeek(week)} className="group rounded-2xl border border-border bg-background/55 p-4 text-left transition-colors hover:border-brand/70 hover:bg-brand/5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><CalendarDays size={20} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="font-heading text-base font-black">Semana {index + 1}</strong><span className="font-body text-xs text-muted-foreground">{periodRangeLabel(week.startKey, week.endKey)}</span></span><span className="mt-1 block font-body text-xs text-muted-foreground">{week.summary.count} movimientos registrados</span></span><ChevronRight className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand" size={20} /></div><PeriodTotals summary={week.summary} /></button>)}</div></> : level === "week" && selectedWeek ? <><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Detalle semanal</p><h3 className="mt-1 font-heading text-lg font-black">{periodRangeLabel(selectedWeek.startKey, selectedWeek.endKey)}</h3></div><div className="text-right"><p className="font-body text-xs text-muted-foreground">Total de la semana</p><p className="font-data text-xl font-black text-brand">{money(summaryTotal(selectedWeek.summary))}</p></div></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{selectedWeek.days.map((day) => <button key={day.key} type="button" onClick={() => selectDay(day)} className={`group min-h-36 rounded-2xl border p-3 text-left transition-colors ${day.inMonth ? "border-border bg-background/55 hover:border-brand/70 hover:bg-brand/5" : "border-border/50 bg-background/25 opacity-60 hover:opacity-100"}`}><span className="flex items-start justify-between gap-2"><span><span className="block font-heading text-sm font-black capitalize">{dateLabel(day.key, { weekday: "short" })}</span><span className="mt-1 block font-data text-xs text-muted-foreground">{dateLabel(day.key)}</span></span><ChevronRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" /></span><strong className="mt-5 block font-data text-lg font-black">{money(summaryTotal(day.summary))}</strong><span className="mt-1 block font-body text-xs text-muted-foreground">{day.summary.count} {day.summary.count === 1 ? "movimiento" : "movimientos"}</span></button>)}</div></> : level === "day" && selectedDay ? <><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Detalle diario</p><h3 className="mt-1 font-heading text-lg font-black capitalize">{dateLabel(selectedDay.key, { weekday: "long", day: "numeric", month: "long" })}</h3></div><div className="text-right"><p className="font-body text-xs text-muted-foreground">Total del día</p><p className="font-data text-xl font-black text-brand">{money(summaryTotal(currentSummary))}</p></div></div><PeriodTotals summary={currentSummary} /><div className="mt-4"><MovementList movements={selectedDay.movements} onCorrect={(movement) => void openCorrection(movement, "correct")} onVoid={(movement) => void openCorrection(movement, "void")} /></div></> : <EmptyState message="Selecciona un periodo" detail="Regresa al mes para consultar sus semanas y días." />}</div>
    </section>
    {correctionTarget ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="cash-movement-correction-title" className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-warning/35 bg-surface p-4 shadow-float sm:rounded-2xl sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="cash-movement-correction-title" className="font-heading text-lg font-black">{correctionMode === "void" ? "Anular movimiento" : "Corregir importe"}</h2><p className="mt-1 font-body text-xs text-muted-foreground">Turno #{correctionTarget.shift_number} · {movementTypeLabel(correctionTarget.movement_type)}</p></div><button type="button" onClick={closeCorrection} aria-label="Cerrar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised"><X size={18} /></button></div><div className="mb-4 rounded-xl bg-background p-3"><div className="flex items-center justify-between gap-3"><span className="font-body text-sm text-muted-foreground">Importe original</span><strong className="font-data text-lg">{money(correctionTarget.amount)}</strong></div>{correctionMode === "void" ? <p className="mt-2 font-body text-xs text-destructive">El movimiento dejará de afectar los totales, pero permanecerá visible como anulado.</p> : null}</div>{correctionMode === "correct" ? <label className="mb-3 block"><span className="mb-1.5 block font-heading text-xs font-bold">Importe correcto</span><input type="number" inputMode="decimal" min="0" step="0.01" value={correctedAmount || ""} onChange={(event) => setCorrectedAmount(Number(event.target.value))} className="h-13 w-full rounded-xl border border-border bg-background px-4 font-data text-xl font-bold outline-none focus:border-brand" /></label> : null}<label className="mb-3 block"><span className="mb-1.5 block font-heading text-xs font-bold">Motivo obligatorio</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} placeholder="Ej. Se capturó $500 en lugar de $50" className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm outline-none focus:border-brand" /></label><div className="mb-4 rounded-xl border border-warning/30 bg-warning/8 p-3"><div className="mb-2 flex items-center gap-2 font-heading text-sm font-bold"><LockKeyhole size={16} className="text-warning" />Autorización requerida</div><div className="grid gap-2 sm:grid-cols-2"><select value={authorizerId} onChange={(event) => setAuthorizerId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-body text-sm"><option value="">Responsable</option>{authorizers.map((authorizer) => <option key={authorizer.id} value={authorizer.id} disabled={!authorizer.pin_configured}>{authorizer.full_name}{authorizer.pin_configured ? "" : " · sin PIN"}</option>)}</select><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" placeholder="PIN de 4 dígitos" className="h-11 rounded-xl border border-border bg-background px-3 font-data tracking-[0.3em]" /></div></div><div className="flex items-center gap-2 rounded-xl bg-brand/8 p-3 text-xs text-muted-foreground"><ShieldCheck size={16} className="shrink-0 text-brand" />El importe original se conserva para auditoría y el corte se recalcula con el importe corregido.</div><button type="button" disabled={saving} onClick={() => void saveCorrection()} className="action-success mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{correctionMode === "void" ? "Autorizar y anular" : "Autorizar y corregir"}</button></section></div> : null}
  </section>;
}
