"use client";

import {
  ArrowLeftRight,
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Save,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listPaymentAuthorizersAction } from "@/lib/actions/users";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import type { PaymentAuthorizer, PaymentMethod } from "@/types/payments";

type TenderRow = {
  id: string;
  method: PaymentMethod;
  amount: number;
};

const METHODS: Array<{
  method: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { method: "efectivo", label: "Efectivo", icon: Banknote },
  { method: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { method: "transferencia", label: "Transferencia", icon: ArrowLeftRight },
];

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

function methodLabel(method: PaymentMethod) {
  return METHODS.find((entry) => entry.method === method)?.label ?? method;
}

export function PaymentMethodCorrectionDialog({
  transactionId,
  folio,
  viewerRole,
  closedShift,
  onClose,
  onCorrected,
}: {
  transactionId: string;
  folio: number;
  viewerRole: Profile["role"];
  closedShift: boolean;
  onClose: () => void;
  onCorrected: () => void | Promise<void>;
}) {
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [nextMethod, setNextMethod] = useState<PaymentMethod | "">("");
  const [reason, setReason] = useState("");
  const [authorizers, setAuthorizers] = useState<PaymentAuthorizer[]>([]);
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");
  const [authorizationToken, setAuthorizationToken] = useState<string | null>(null);
  const [authorizationKey, setAuthorizationKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [saving, setSaving] = useState(false);

  const requiresAuthorization = viewerRole === "waiter";
  const selectedTender = useMemo(
    () => tenders.find((tender) => tender.id === selectedTenderId) ?? null,
    [selectedTenderId, tenders]
  );

  useEffect(() => {
    let active = true;

    async function loadCorrectionContext() {
      const tendersPromise = createClient()
        .from("payment_tenders")
        .select("id,method,amount")
        .eq("transaction_id", transactionId)
        .order("created_at");
      const authorizersPromise = requiresAuthorization
        ? listPaymentAuthorizersAction()
        : Promise.resolve({ authorizers: [], error: null });

      const [tendersResult, authorizersResult] = await Promise.all([
        tendersPromise,
        authorizersPromise,
      ]);
      if (!active) return;

      setLoading(false);
      const rows = tendersResult.data as TenderRow[] | null;
      if (tendersResult.error || !rows?.length) {
        toast.error(
          tendersResult.error?.message ?? "No se encontraron los métodos del pago"
        );
        return;
      }

      setTenders(rows);
      setSelectedTenderId(rows[0].id);
      setAuthorizers(authorizersResult.authorizers);
      setAuthorizerId(authorizersResult.authorizers[0]?.id ?? "");
      if (authorizersResult.error) {
        toast.error(authorizersResult.error);
      }
    }

    void loadCorrectionContext();

    return () => {
      active = false;
    };
  }, [requiresAuthorization, transactionId]);

  function resetAuthorization() {
    setAuthorizationToken(null);
    setPin("");
    setAuthorizationKey(crypto.randomUUID());
  }

  function selectTender(tenderId: string) {
    setSelectedTenderId(tenderId);
    setNextMethod("");
    resetAuthorization();
  }

  async function authorizeCorrection() {
    if (
      !selectedTender ||
      !authorizerId ||
      pin.length !== 4 ||
      authorizing
    ) {
      return;
    }

    setAuthorizing(true);
    const { data, error } = await createClient().rpc(
      "authorize_payment_method_correction",
      {
        p_tender_id: selectedTender.id,
        p_authorizer_id: authorizerId,
        p_pin: pin,
        p_idempotency_key: authorizationKey,
      }
    );
    setAuthorizing(false);
    setPin("");

    if (error) {
      toast.error("No se pudo autorizar", { description: error.message });
      return;
    }

    if (!data) {
      toast.error("PIN incorrecto");
      return;
    }

    setAuthorizationToken(data as string);
    toast.success("Corrección autorizada");
  }

  async function saveCorrection() {
    if (!selectedTender || !nextMethod || saving) return;
    if (reason.trim().length < 4) {
      toast.error("Escribe el motivo de la corrección");
      return;
    }
    if (requiresAuthorization && !authorizationToken) {
      toast.error("Solicita la autorización del administrador");
      return;
    }

    setSaving(true);
    const { error } = await createClient().rpc("correct_payment_tender_method", {
      p_tender_id: selectedTender.id,
      p_new_method: nextMethod,
      p_reason: reason.trim(),
      p_authorization: authorizationToken,
    });
    setSaving(false);

    if (error) {
      toast.error("No se pudo corregir el método", { description: error.message });
      return;
    }

    toast.success(`Método corregido en el ticket ${folio}`);
    await onCorrected();
    onClose();
  }

  const canSave =
    !loading &&
    !saving &&
    Boolean(selectedTender) &&
    Boolean(nextMethod) &&
    reason.trim().length >= 4 &&
    (!requiresAuthorization || Boolean(authorizationToken));

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-correction-title"
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-float sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border p-4 sm:p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning">
            <ArrowLeftRight aria-hidden size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="payment-correction-title" className="font-heading text-lg font-bold">
              Corregir método de pago
            </h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Ticket {folio}. El cambio quedará registrado en la auditoría.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-40"
          >
            <X aria-hidden size={18} />
          </button>
        </header>

        <div className="pos-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-brand">
              <Loader2 aria-label="Cargando métodos" size={24} className="animate-spin" />
            </div>
          ) : (
            <>
              {closedShift ? (
                <div className="flex gap-3 rounded-xl bg-warning/10 p-3 text-warning">
                  <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0" />
                  <p className="font-body text-xs leading-relaxed">
                    Este pago pertenece a un corte cerrado. El corte original se conservará y el cambio se registrará como una reclasificación.
                  </p>
                </div>
              ) : null}

              {tenders.length > 1 ? (
                <fieldset>
                  <legend className="mb-2 font-heading text-sm font-bold">
                    Parte del pago a corregir
                  </legend>
                  <div className="space-y-2">
                    {tenders.map((tender) => (
                      <label
                        key={tender.id}
                        className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 transition-colors ${
                          selectedTenderId === tender.id
                            ? "border-brand bg-brand/10"
                            : "border-border bg-background"
                        }`}
                      >
                        <span className="font-heading text-sm font-bold">
                          {methodLabel(tender.method)}
                        </span>
                        <span className="ml-auto font-data text-sm font-bold text-gold">
                          {money(tender.amount)}
                        </span>
                        <input
                          type="radio"
                          name="tender"
                          value={tender.id}
                          checked={selectedTenderId === tender.id}
                          onChange={() => selectTender(tender.id)}
                          className="sr-only"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : selectedTender ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                  <span className="font-body text-sm text-muted-foreground">
                    Registrado como
                  </span>
                  <strong className="text-right font-heading text-sm">
                    {methodLabel(selectedTender.method)} · {money(selectedTender.amount)}
                  </strong>
                </div>
              ) : null}

              <fieldset disabled={!selectedTender}>
                <legend className="mb-2 font-heading text-sm font-bold">
                  Método correcto
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(({ method, label, icon: Icon }) => {
                    const isCurrent = selectedTender?.method === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => setNextMethod(method)}
                        className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 font-heading text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                          nextMethod === method
                            ? "border-success bg-success/12 text-success"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon aria-hidden size={20} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {nextMethod === "efectivo" ? (
                <p className="rounded-xl bg-warning/10 px-3 py-2 font-body text-xs leading-relaxed text-warning">
                  Se registrará el importe exacto como recibido y cambio de $0.00.
                </p>
              ) : null}

              <label className="block">
                <span className="mb-2 block font-heading text-sm font-bold">Motivo</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="Ej. Se registró tarjeta, pero el cliente pagó por transferencia"
                  className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand-light"
                />
              </label>

              {requiresAuthorization ? (
                <section className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldCheck aria-hidden size={17} className="text-brand" />
                    <h3 className="font-heading text-sm font-bold">
                      Autorización administrativa
                    </h3>
                    {authorizationToken ? (
                      <span className="ml-auto inline-flex items-center gap-1 font-body text-xs font-bold text-success">
                        <Check aria-hidden size={14} /> Autorizado
                      </span>
                    ) : null}
                  </div>

                  {authorizationToken ? (
                    <button
                      type="button"
                      onClick={resetAuthorization}
                      className="h-11 w-full rounded-xl bg-success/12 font-heading text-xs font-bold text-success hover:bg-success/18"
                    >
                      Cambiar autorización
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={authorizerId}
                        onChange={(event) => {
                          setAuthorizerId(event.target.value);
                          resetAuthorization();
                        }}
                        className="form-input"
                      >
                        {authorizers.length === 0 ? (
                          <option value="">Sin administradores disponibles</option>
                        ) : null}
                        {authorizers.map((authorizer) => (
                          <option key={authorizer.id} value={authorizer.id}>
                            {authorizer.full_name ||
                              (authorizer.role === "owner"
                                ? "Propietario"
                                : "Administrador")}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={4}
                          value={pin}
                          onChange={(event) =>
                            setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && pin.length === 4) {
                              void authorizeCorrection();
                            }
                          }}
                          placeholder="PIN de 4 dígitos"
                          className="form-input"
                        />
                        <button
                          type="button"
                          onClick={() => void authorizeCorrection()}
                          disabled={
                            authorizing ||
                            !selectedTender ||
                            !authorizerId ||
                            pin.length !== 4
                          }
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-xs font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {authorizing ? (
                            <Loader2 aria-hidden size={15} className="animate-spin" />
                          ) : (
                            <ShieldCheck aria-hidden size={15} />
                          )}
                          Autorizar
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border p-4 sm:p-5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="h-12 rounded-xl bg-surface-raised font-heading text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void saveCorrection()}
            className="action-success inline-flex h-12 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 aria-hidden size={17} className="animate-spin" />
            ) : (
              <Save aria-hidden size={17} />
            )}
            Guardar corrección
          </button>
        </footer>
      </section>
    </div>
  );
}
