"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Info, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getBusinessReceiptSettingsAction,
  saveBusinessReceiptSettingsAction,
  type BusinessReceiptSettings,
} from "@/lib/actions/business-receipts";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";

type ReceiptForm = {
  receiptName: string;
  address: string;
  phone: string;
  footer: string;
  paperWidthMm: 48 | 58;
};

const EMPTY_FORM: ReceiptForm = {
  receiptName: "",
  address: "",
  phone: "",
  footer: "",
  paperWidthMm: 48,
};

function formFromSettings(settings: BusinessReceiptSettings): ReceiptForm {
  return {
    receiptName: settings.receiptName,
    address: settings.address,
    phone: settings.phone,
    footer: settings.footer,
    paperWidthMm: settings.paperWidthMm,
  };
}

export function BusinessReceiptSettingsManager() {
  const selectedBusinessId = useBusinessContextStore((state) => state.selectedBusinessId);
  const ensureBusinessContext = useBusinessContextStore((state) => state.ensureLoaded);
  const [settings, setSettings] = useState<BusinessReceiptSettings | null>(null);
  const [form, setForm] = useState<ReceiptForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState<{
    businessId: string | null;
    status: "loading" | "ready" | "error";
    error: string | null;
  }>({ businessId: null, status: "loading", error: null });
  const loading = loadState.businessId !== selectedBusinessId || loadState.status === "loading";
  const loadError = loadState.businessId === selectedBusinessId && loadState.status === "error"
    ? loadState.error
    : null;
  const activeSettings = settings?.businessId === selectedBusinessId ? settings : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureBusinessContext();
        const result = await getBusinessReceiptSettingsAction();
        if (cancelled) return;
        if (!result.success || !result.data) {
          const error = result.error ?? "No se pudo cargar la configuración del ticket.";
          toast.error(error);
          setSettings(null);
          setForm(EMPTY_FORM);
          setLoadState({ businessId: selectedBusinessId, status: "error", error });
          return;
        }
        setSettings(result.data);
        setForm(formFromSettings(result.data));
        setLoadState({ businessId: result.data.businessId, status: "ready", error: null });
      } catch {
        if (cancelled) return;
        const error = "No se pudo cargar la configuración del ticket.";
        toast.error(error);
        setSettings(null);
        setForm(EMPTY_FORM);
        setLoadState({ businessId: selectedBusinessId, status: "error", error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureBusinessContext, selectedBusinessId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await saveBusinessReceiptSettingsAction(form);
    setSaving(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "No se pudo guardar la configuración");
      return;
    }
    setSettings(result.data);
    setForm(formFromSettings(result.data));
    setLoadState({ businessId: result.data.businessId, status: "ready", error: null });
    toast.success("Configuración del ticket guardada");
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex items-start gap-3 border-b border-border p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <Printer size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold">Ticket de pedido</h2>
          <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
            {activeSettings?.businessName ?? "Este negocio"} · formato compacto, sin logo.
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p role="alert" className="font-body text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadState({ businessId: selectedBusinessId, status: "loading", error: null });
              void getBusinessReceiptSettingsAction().then((result) => {
                if (!result.success || !result.data) {
                  setLoadState({
                    businessId: selectedBusinessId,
                    status: "error",
                    error: result.error ?? "No se pudo cargar la configuración del ticket.",
                  });
                  return;
                }
                setSettings(result.data);
                setForm(formFromSettings(result.data));
                setLoadState({ businessId: result.data.businessId, status: "ready", error: null });
              }).catch(() => {
                setLoadState({
                  businessId: selectedBusinessId,
                  status: "error",
                  error: "No se pudo cargar la configuración del ticket.",
                });
              });
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-surface-raised px-4 font-heading text-xs font-bold text-foreground hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : (
      <form onSubmit={save} className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-heading text-xs font-bold">Nombre en el ticket</span>
            <input
              value={form.receiptName}
              onChange={(event) => setForm((current) => ({ ...current, receiptName: event.target.value }))}
              maxLength={100}
              placeholder={activeSettings?.businessName ?? "Nombre del negocio"}
              disabled={loading || saving}
              className="h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
            <span className="block font-body text-[11px] text-muted-foreground">Si lo dejas vacío, se usa el nombre del negocio.</span>
          </label>

          <label className="block space-y-1.5">
            <span className="font-heading text-xs font-bold">Ancho del rollo</span>
            <select
              value={form.paperWidthMm}
              onChange={(event) => setForm((current) => ({ ...current, paperWidthMm: Number(event.target.value) as 48 | 58 }))}
              disabled={loading || saving}
              className="h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            >
              <option value={48}>48 mm</option>
              <option value={58}>58 mm</option>
            </select>
            <span className="block font-body text-[11px] text-muted-foreground">
              Selecciona el mismo ancho en las opciones de impresión del dispositivo.
            </span>
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="font-heading text-xs font-bold">Dirección del local</span>
            <textarea
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              maxLength={300}
              rows={2}
              placeholder="Calle, número y colonia"
              disabled={loading || saving}
              className="min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-heading text-xs font-bold">Teléfono del local</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              maxLength={40}
              inputMode="tel"
              placeholder="Teléfono de contacto"
              disabled={loading || saving}
              className="h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-heading text-xs font-bold">Mensaje al final</span>
            <textarea
              value={form.footer}
              onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))}
              maxLength={240}
              rows={2}
              placeholder="Gracias por tu compra"
              disabled={loading || saving}
              className="min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 font-body text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/8 p-3.5 sm:flex-row sm:items-start">
          <Info size={17} className="mt-0.5 shrink-0 text-warning" />
          <p className="font-body text-xs leading-5 text-muted-foreground">
            Desde Historial se abre la impresión del dispositivo. En iPad, la impresora debe admitir AirPrint y estar en la misma red Wi‑Fi. En Android puede requerirse el servicio de impresión o la app del fabricante. La app no empareja impresoras Bluetooth directamente.
          </p>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="submit"
            disabled={loading || saving || !activeSettings}
            className="inline-flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] disabled:cursor-wait disabled:opacity-55 sm:w-auto"
          >
            <Save size={16} />
            {saving ? "Guardando..." : "Guardar ticket"}
          </button>
        </div>
      </form>
      )}
    </section>
  );
}
