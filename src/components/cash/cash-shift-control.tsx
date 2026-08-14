"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCashShiftStore } from "@/lib/stores";
import {
  buildBlindCashCountDisclosure,
  buildCashCloseBreakdown,
} from "@/lib/cash-close";
import type {
  CashAuthorizer,
  CashClosePreview,
  CashCountMode,
  CashDirection,
  CashMovementType,
} from "@/types/cash";

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5] as const;

type View = "summary" | "open" | "movement" | "count" | "result";

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberValue(value: string) {
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : 0;
}

function denominationTotal(counts: Record<string, number>) {
  return DENOMINATIONS.reduce(
    (total, denomination) => total + denomination * Number(counts[String(denomination)] ?? 0),
    0
  );
}

function shiftDuration(openedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

function ErrorMessage({ children }: { children?: string | null }) {
  return children ? (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 font-body text-xs text-destructive">
      {children}
    </p>
  ) : null;
}

function DenominationCounter({
  counts,
  onChange,
}: {
  counts: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  function setCount(key: string, value: number) {
    onChange({ ...counts, [key]: Math.max(0, Math.floor(value)) });
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {DENOMINATIONS.map((denomination) => {
        const key = String(denomination);
        const count = counts[key] ?? 0;
        return (
          <div key={key} className="rounded-xl border border-border bg-background/70 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-data text-xs font-bold text-gold">
                {money(denomination)}
              </span>
              <span className="truncate font-body text-[11px] text-muted-foreground">
                {money(denomination * count)}
              </span>
            </div>
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center overflow-hidden rounded-lg border border-border bg-surface">
              <button
                type="button"
                disabled={count <= 0}
                onClick={() => setCount(key, count - 1)}
                aria-label={`Quitar una pieza de ${money(denomination)}`}
                className="flex h-11 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Minus aria-hidden size={17} />
              </button>
              <input
                aria-label={`Cantidad de piezas de ${money(denomination)}`}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={count || ""}
                onChange={(event) => setCount(key, numberValue(event.target.value))}
                placeholder="0"
                className="h-11 min-w-0 border-x border-border bg-transparent px-1 text-center font-data text-base font-bold outline-none focus:bg-brand/8"
              />
              <button
                type="button"
                onClick={() => setCount(key, count + 1)}
                aria-label={`Agregar una pieza de ${money(denomination)}`}
                className="flex h-11 items-center justify-center text-success transition-colors hover:bg-success/10"
              >
                <Plus aria-hidden size={17} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuthorizationFields({
  authorizers,
  authorizerId,
  pin,
  onAuthorizerChange,
  onPinChange,
}: {
  authorizers: CashAuthorizer[];
  authorizerId: string;
  pin: string;
  onAuthorizerChange: (value: string) => void;
  onPinChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/8 p-3">
      <div className="mb-3 flex items-start gap-2">
        <LockKeyhole size={17} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <p className="font-heading text-sm font-bold">Autorización requerida</p>
          <p className="font-body text-xs text-muted-foreground">
            Un responsable confirma esta operación con su PIN.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={authorizerId}
          onChange={(event) => onAuthorizerChange(event.target.value)}
          className="h-11 rounded-xl border border-border bg-background px-3 font-body text-sm outline-none focus:border-warning"
        >
          <option value="">Seleccionar responsable</option>
          {authorizers.map((authorizer) => (
            <option key={authorizer.id} value={authorizer.id} disabled={!authorizer.pin_configured}>
              {authorizer.full_name}{authorizer.pin_configured ? "" : " · sin PIN"}
            </option>
          ))}
        </select>
        <input
          value={pin}
          onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="PIN de 4 dígitos"
          className="h-11 rounded-xl border border-border bg-background px-3 font-data text-sm tracking-[0.35em] outline-none focus:border-warning"
        />
      </div>
    </div>
  );
}

export function CashShiftControl() {
  const currentShift = useCashShiftStore((state) => state.currentShift);
  const loading = useCashShiftStore((state) => state.loading);
  const fetchCurrentShift = useCashShiftStore((state) => state.fetchCurrentShift);
  const openShift = useCashShiftStore((state) => state.openShift);
  const listAuthorizers = useCashShiftStore((state) => state.listAuthorizers);
  const authorizeAction = useCashShiftStore((state) => state.authorizeAction);
  const recordMovement = useCashShiftStore((state) => state.recordMovement);
  const previewClose = useCashShiftStore((state) => state.previewClose);
  const closeShift = useCashShiftStore((state) => state.closeShift);
  const subscribe = useCashShiftStore((state) => state.subscribe);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("summary");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [openingNote, setOpeningNote] = useState("");
  const [openingCounts, setOpeningCounts] = useState<Record<string, number>>({});
  const [movementType, setMovementType] = useState<CashMovementType>("fund_addition");
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementReason, setMovementReason] = useState("");
  const [countMode, setCountMode] = useState<CashCountMode>("denominations");
  const [closingCounts, setClosingCounts] = useState<Record<string, number>>({});
  const [countedCash, setCountedCash] = useState(0);
  const [closeNote, setCloseNote] = useState("");
  const [preview, setPreview] = useState<CashClosePreview | null>(null);
  const [authorizers, setAuthorizers] = useState<CashAuthorizer[]>([]);
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");

  useEffect(() => {
    void fetchCurrentShift();
    return subscribe();
  }, [fetchCurrentShift, subscribe]);

  useEffect(() => {
    if (!open || !currentShift) return;
    void listAuthorizers().then((result) => {
      if (result.data) setAuthorizers(result.data);
    });
  }, [currentShift, listAuthorizers, open]);

  const openingCountTotal = useMemo(() => denominationTotal(openingCounts), [openingCounts]);
  const closingCountTotal = useMemo(() => denominationTotal(closingCounts), [closingCounts]);
  const totals = currentShift?.operating_totals;
  const cashBreakdown = useMemo(
    () =>
      preview && currentShift
        ? buildCashCloseBreakdown({
            openingFloat: currentShift.opening_float,
            cashTotal: preview.cash_total ?? 0,
            fundInTotal: preview.fund_in_total ?? 0,
            withdrawalTotal: preview.withdrawal_total ?? 0,
            expenseTotal: preview.expense_total ?? 0,
            correctionTotal: preview.correction_total ?? 0,
          })
        : null,
    [currentShift, preview]
  );
  const blindCashDisclosure = useMemo(
    () =>
      currentShift
        ? buildBlindCashCountDisclosure(currentShift.opening_float)
        : null,
    [currentShift]
  );

  function resetAuthorization() {
    setAuthorizerId("");
    setPin("");
  }

  async function handleOpenShift() {
    const amount = openingCounts && Object.keys(openingCounts).length > 0 ? openingCountTotal : openingFloat;
    setWorking(true);
    setError(null);
    const result = await openShift({
      openingFloat: amount,
      denominations: openingCounts,
      note: openingNote,
    });
    setWorking(false);
    if (result.error) return setError(result.error);
    toast.success(`Caja #${result.data?.number} abierta`, { description: `Fondo inicial ${money(amount)}` });
    setView("summary");
  }

  function movementDirection(type: CashMovementType): CashDirection {
    return type === "fund_addition" ? "in" : type === "correction" ? "in" : "out";
  }

  async function handleMovement() {
    if (!currentShift) return;
    if (movementAmount <= 0 || !movementReason.trim() || !authorizerId || pin.length !== 4) {
      setError("Completa importe, motivo, responsable y PIN.");
      return;
    }
    setWorking(true);
    setError(null);
    const authorization = await authorizeAction({
      authorizerId,
      pin,
      shiftId: currentShift.id,
      action: "cash_movement",
      amount: movementAmount,
    });
    if (authorization.error || !authorization.data) {
      setWorking(false);
      setError(authorization.error);
      return;
    }
    const result = await recordMovement({
      shiftId: currentShift.id,
      type: movementType,
      direction: movementDirection(movementType),
      amount: movementAmount,
      reason: movementReason.trim(),
      authorization: authorization.data,
    });
    setWorking(false);
    if (result.error) return setError(result.error);
    toast.success("Movimiento registrado");
    setMovementAmount(0);
    setMovementReason("");
    resetAuthorization();
    setView("summary");
  }

  async function handlePreview() {
    if (!currentShift) return;
    const amount = countMode === "denominations" ? closingCountTotal : countedCash;
    if (amount < 0) return setError("El efectivo contado no es válido.");
    setWorking(true);
    setError(null);
    const result = await previewClose({
      shiftId: currentShift.id,
      countMode,
      denominations: closingCounts,
      countedCash: amount,
    });
    setWorking(false);
    if (result.error || !result.data) return setError(result.error);
    setPreview(result.data);
  }

  async function handleClose() {
    if (!currentShift || !preview) return;
    let authorization: string | null = null;
    if (preview.requires_authorization) {
      if (!authorizerId || pin.length !== 4) {
        setError("Selecciona un responsable e ingresa su PIN.");
        return;
      }
      const approved = await authorizeAction({
        authorizerId,
        pin,
        shiftId: currentShift.id,
        action: "close_difference",
        amount: Math.abs(preview.difference),
      });
      if (approved.error || !approved.data) return setError(approved.error);
      authorization = approved.data;
    }
    setWorking(true);
    setError(null);
    const result = await closeShift({
      shiftId: currentShift.id,
      countMode,
      denominations: closingCounts,
      countedCash: preview.counted_cash,
      note: closeNote,
      authorization,
    });
    setWorking(false);
    if (result.error) return setError(result.error);
    toast.success(`Caja #${currentShift.number} cerrada`);
    setView("result");
    setPreview(null);
    resetAuthorization();
  }

  function openDialog() {
    setError(null);
    setView(currentShift ? "summary" : "open");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={currentShift ? `Caja #${currentShift.number} abierta` : "Abrir caja"}
        aria-label={currentShift ? `Caja #${currentShift.number} abierta` : "Abrir caja"}
        className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 font-heading text-xs font-bold transition-colors ${
          currentShift
            ? "border-success/35 bg-success/10 text-success hover:bg-success/15"
            : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
        }`}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
        <span className="hidden sm:inline">
          {currentShift ? `Caja #${currentShift.number}` : "Abrir caja"}
        </span>
        <span className={`h-2 w-2 rounded-full ${currentShift ? "bg-success" : "bg-warning"}`} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gestión de caja"
        >
          <section className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-float sm:rounded-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <Landmark size={21} />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-black">
                    {view === "open" ? "Abrir caja" : view === "movement" ? "Movimiento de efectivo" : view === "count" ? "Cerrar y contar" : view === "result" ? "Turno cerrado" : `Caja #${currentShift?.number ?? ""}`}
                  </h2>
                  <p className="font-body text-xs text-muted-foreground">
                    {currentShift ? `Abierta por ${currentShift.opened_by_name} · ${shiftDuration(currentShift.opened_at)}` : "Una sola caja compartida para el local"}
                  </p>
                </div>
              </div>
              <button type="button" disabled={working} onClick={() => setOpen(false)} aria-label="Cerrar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
                <X size={19} />
              </button>
            </header>

            <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {view === "open" ? (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-warning/10 p-4">
                    <p className="font-heading text-sm font-bold text-warning">La caja está cerrada</p>
                    <p className="mt-1 font-body text-sm text-muted-foreground">Ábrela antes de registrar pedidos o cobros. El fondo inicial es el efectivo disponible al comenzar.</p>
                  </div>
                  <div>
                    <label className="mb-2 block font-heading text-sm font-bold">Fondo inicial</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-data text-gold">$</span>
                      <input type="number" inputMode="decimal" min="0" step="0.01" value={openingFloat || ""} onChange={(event) => setOpeningFloat(numberValue(event.target.value))} placeholder="0.00" className="h-14 w-full rounded-xl border border-border bg-background pl-9 pr-4 font-data text-xl font-bold outline-none focus:border-brand" />
                    </div>
                  </div>
                  <details className="rounded-2xl border border-border bg-background/40 p-3">
                    <summary className="cursor-pointer font-heading text-sm font-bold">Contar por denominaciones</summary>
                    <div className="mt-3"><DenominationCounter counts={openingCounts} onChange={setOpeningCounts} /></div>
                    <p className="mt-3 text-right font-data text-sm font-bold text-gold">Total contado {money(openingCountTotal)}</p>
                  </details>
                  <textarea value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} placeholder="Nota opcional del inicio" rows={2} className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm outline-none focus:border-brand" />
                  <ErrorMessage>{error}</ErrorMessage>
                  <button type="button" disabled={working} onClick={() => void handleOpenShift()} className="action-success inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">
                    {working ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    Abrir caja
                  </button>
                </div>
              ) : null}

              {view === "summary" && currentShift ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl bg-background/70 p-3"><p className="font-body text-xs text-muted-foreground">Cobros</p><p className="mt-1 font-data text-lg font-bold">{totals?.payment_count ?? 0}</p></div>
                    <div className="rounded-xl bg-background/70 p-3"><p className="font-body text-xs text-muted-foreground">Tarjeta</p><p className="mt-1 font-data text-lg font-bold">{money(totals?.card_total)}</p></div>
                    <div className="rounded-xl bg-background/70 p-3"><p className="font-body text-xs text-muted-foreground">Transferencia</p><p className="mt-1 font-data text-lg font-bold">{money(totals?.transfer_total)}</p></div>
                    <div className="rounded-xl bg-warning/10 p-3"><p className="font-body text-xs text-warning">Pendiente</p><p className="mt-1 font-data text-lg font-bold text-warning">{money(totals?.pending_balance)}</p></div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/50 p-4">
                    <div className="flex items-center gap-3"><WalletCards className="text-brand" size={20} /><div><p className="font-heading text-sm font-bold">Efectivo protegido</p><p className="font-body text-xs text-muted-foreground">El efectivo esperado se revela únicamente después del conteo ciego.</p></div></div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => { setError(null); setView("movement"); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-surface-raised font-heading text-sm font-bold hover:bg-border"><CircleDollarSign size={17} />Registrar movimiento</button>
                    <button type="button" onClick={() => { setError(null); setPreview(null); setView("count"); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-heading text-sm font-bold text-white hover:bg-brand-hover"><Calculator size={17} />Cerrar y hacer corte</button>
                  </div>
                </div>
              ) : null}

              {view === "movement" && currentShift ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["fund_addition", "Agregar fondo", ArrowDownToLine],
                      ["withdrawal", "Retiro", ArrowUpFromLine],
                      ["expense", "Gasto", ReceiptText],
                      ["correction", "Corrección", RotateCcw],
                    ] as const).map(([type, label, Icon]) => (
                      <button key={type} type="button" onClick={() => setMovementType(type)} className={`flex h-12 items-center justify-center gap-2 rounded-xl border font-heading text-xs font-bold ${movementType === type ? "border-brand bg-brand-light text-brand" : "border-border bg-background text-muted-foreground"}`}><Icon size={16} />{label}</button>
                    ))}
                  </div>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={movementAmount || ""} onChange={(event) => setMovementAmount(numberValue(event.target.value))} placeholder="Importe" className="h-13 w-full rounded-xl border border-border bg-background px-4 font-data text-lg font-bold outline-none focus:border-brand" />
                  <textarea value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="Motivo obligatorio" rows={2} className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm outline-none focus:border-brand" />
                  <AuthorizationFields authorizers={authorizers} authorizerId={authorizerId} pin={pin} onAuthorizerChange={setAuthorizerId} onPinChange={setPin} />
                  <ErrorMessage>{error}</ErrorMessage>
                  <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setView("summary")} className="h-12 rounded-xl bg-surface-raised font-heading text-sm font-bold">Cancelar</button><button type="button" disabled={working} onClick={() => void handleMovement()} className="action-success inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">{working ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Autorizar y registrar</button></div>
                </div>
              ) : null}

              {view === "count" && currentShift ? (
                <div className="space-y-4">
                  {!preview ? (
                    <>
                      {blindCashDisclosure ? (
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gold/25 bg-gold/5 p-4">
                          <div>
                            <p className="font-body text-xs text-muted-foreground">Fondo inicial registrado</p>
                            <p className="mt-1 font-heading text-sm font-bold">Dinero con el que inició el turno</p>
                          </div>
                          <strong className="shrink-0 font-data text-xl text-gold">
                            {money(blindCashDisclosure.openingFloat)}
                          </strong>
                        </div>
                      ) : null}
                      <div className="rounded-2xl bg-warning/10 p-4"><p className="font-heading text-sm font-bold text-warning">Conteo ciego</p><p className="mt-1 font-body text-xs text-muted-foreground">Cuenta el efectivo sin ver lo esperado. Después compararemos ambas cifras.</p></div>
                      <div className="grid grid-cols-2 rounded-xl bg-background p-1"><button type="button" onClick={() => setCountMode("denominations")} className={`h-10 rounded-lg font-heading text-xs font-bold ${countMode === "denominations" ? "bg-brand text-white" : "text-muted-foreground"}`}>Por billetes</button><button type="button" onClick={() => setCountMode("total")} className={`h-10 rounded-lg font-heading text-xs font-bold ${countMode === "total" ? "bg-brand text-white" : "text-muted-foreground"}`}>Total directo</button></div>
                      {countMode === "denominations" ? <><DenominationCounter counts={closingCounts} onChange={setClosingCounts} /><p className="text-right font-data text-base font-bold text-gold">Contado {money(closingCountTotal)}</p></> : <input type="number" inputMode="decimal" min="0" step="0.01" value={countedCash || ""} onChange={(event) => setCountedCash(numberValue(event.target.value))} placeholder="Efectivo contado" className="h-14 w-full rounded-xl border border-border bg-background px-4 font-data text-xl font-bold outline-none focus:border-brand" />}
                      <ErrorMessage>{error}</ErrorMessage>
                      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setView("summary")} className="h-12 rounded-xl bg-surface-raised font-heading text-sm font-bold">Volver</button><button type="button" disabled={working} onClick={() => void handlePreview()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-heading text-sm font-bold text-white disabled:opacity-50">{working ? <Loader2 size={17} className="animate-spin" /> : <Calculator size={17} />}Comparar conteo</button></div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-xl bg-background p-3"><p className="font-body text-xs text-muted-foreground">Contado</p><p className="mt-1 font-data text-lg font-bold">{money(preview.counted_cash)}</p></div><div className="rounded-xl bg-background p-3"><p className="font-body text-xs text-muted-foreground">Esperado</p><p className="mt-1 font-data text-lg font-bold">{money(preview.expected_cash)}</p></div><div className={`col-span-2 rounded-xl p-3 sm:col-span-1 ${Math.abs(preview.difference) <= 20 ? "bg-success/10" : "bg-destructive/10"}`}><p className="font-body text-xs text-muted-foreground">Diferencia</p><p className={`mt-1 font-data text-lg font-bold ${Math.abs(preview.difference) <= 20 ? "text-success" : "text-destructive"}`}>{money(preview.difference)}</p></div></div>
                      {cashBreakdown ? (
                        <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-heading text-sm font-bold">Cómo se calculó el efectivo</p>
                              <p className="mt-0.5 font-body text-xs text-muted-foreground">Incluye el dinero con el que inició el turno.</p>
                            </div>
                            <strong className="shrink-0 font-data text-base text-gold">{money(preview.expected_cash)}</strong>
                          </div>
                          <div className="space-y-2 border-t border-gold/15 pt-3">
                            {cashBreakdown.lines.map((line, index) => {
                              const isNegative = line.operation === "subtract" || line.amount < 0;
                              const sign = index === 0 ? "" : isNegative ? "−" : "+";
                              return (
                                <div key={line.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 font-body text-sm">
                                  <span className={index === 0 ? "font-bold text-foreground" : "text-muted-foreground"}>{line.label}</span>
                                  <span className="font-data text-muted-foreground">{sign}</span>
                                  <strong className="min-w-24 text-right font-data">{money(Math.abs(line.amount))}</strong>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-2xl border border-border bg-background/50 p-4"><div className="grid grid-cols-2 gap-y-2 font-body text-sm"><span className="text-muted-foreground">Venta neta</span><strong className="text-right font-data">{money(preview.net_sales)}</strong><span className="text-muted-foreground">Efectivo cobrado</span><strong className="text-right font-data">{money(preview.cash_total)}</strong><span className="text-muted-foreground">Tarjeta</span><strong className="text-right font-data">{money(preview.card_total)}</strong><span className="text-muted-foreground">Transferencia</span><strong className="text-right font-data">{money(preview.transfer_total)}</strong><span className="text-warning">Cuentas pendientes</span><strong className="text-right font-data text-warning">{preview.pending_order_count} · {money(preview.pending_balance)}</strong></div></div>
                      <textarea value={closeNote} onChange={(event) => setCloseNote(event.target.value)} placeholder="Nota opcional del cierre" rows={2} className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm outline-none focus:border-brand" />
                      {preview.requires_authorization ? <AuthorizationFields authorizers={authorizers} authorizerId={authorizerId} pin={pin} onAuthorizerChange={setAuthorizerId} onPinChange={setPin} /> : null}
                      <ErrorMessage>{error}</ErrorMessage>
                      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPreview(null)} className="h-12 rounded-xl bg-surface-raised font-heading text-sm font-bold">Recontar</button><button type="button" disabled={working} onClick={() => void handleClose()} className="action-success inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:opacity-50">{working ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />}Cerrar turno</button></div>
                    </>
                  )}
                </div>
              ) : null}

              {view === "result" ? (
                <div className="flex flex-col items-center py-8 text-center"><span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/12 text-success"><CheckCircle2 size={32} /></span><h3 className="font-heading text-xl font-black">Corte guardado</h3><p className="mt-2 max-w-sm font-body text-sm text-muted-foreground">El turno quedó cerrado e inmutable. Las cuentas pendientes siguen disponibles para el siguiente turno.</p><button type="button" onClick={() => setOpen(false)} className="mt-6 h-12 min-w-48 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white">Listo</button></div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
