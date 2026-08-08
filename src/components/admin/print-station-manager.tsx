"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Laptop,
  Loader2,
  Pause,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { SelectedModifier } from "@/types/database";

type PrintSettings = {
  auto_print_kitchen: boolean;
  paper_width_mm: number;
};

type PrintJobRow = {
  id: string;
  order_id: string;
  status: "queued" | "printing" | "printed" | "failed" | "cancelled";
  attempts: number;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
};

type KitchenPrintPayload = {
  job_id: string;
  attempt: number;
  order: {
    id: string;
    number: number;
    type: "comedor" | "domicilio" | "para_llevar";
    notes: string;
    table_number: string | null;
    table_zone_name: string | null;
    customer_name: string | null;
    created_at: string;
    created_by_name: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    notes: string;
    selected_modifiers: SelectedModifier[];
  }>;
};

const DEVICE_KEY = "mideli.print-station-device-id";

function getDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function statusLabel(status: PrintJobRow["status"]) {
  if (status === "queued") return "En espera";
  if (status === "printing") return "Imprimiendo";
  if (status === "printed") return "Impreso";
  if (status === "failed") return "Requiere atención";
  return "Cancelado";
}

function locationLabel(order: KitchenPrintPayload["order"]) {
  if (order.type === "domicilio") return order.customer_name || "Domicilio";
  if (order.type === "para_llevar") return order.customer_name || "Para llevar";
  return [order.table_zone_name, order.table_number].filter(Boolean).join(" · ") || "Comedor";
}

export function PrintStationManager() {
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [jobs, setJobs] = useState<PrintJobRow[]>([]);
  const [currentTicket, setCurrentTicket] = useState<KitchenPrintPayload | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const deviceIdRef = useRef("");
  const processingRef = useRef(false);
  const stationReady = settings !== null;
  const autoPrintEnabled = settings?.auto_print_kitchen ?? false;

  const loadStation = useCallback(async () => {
    const supabase = createClient();
    const [settingsResult, jobsResult] = await Promise.all([
      supabase
        .from("print_station_settings")
        .select("auto_print_kitchen,paper_width_mm")
        .eq("singleton", true)
        .maybeSingle(),
      supabase
        .from("print_jobs")
        .select("id,order_id,status,attempts,last_error,created_at,printed_at")
        .order("created_at", { ascending: false })
        .limit(16),
    ]);

    setLoading(false);
    if (settingsResult.error) {
      setConnected(false);
      toast.error("No se pudo consultar la estación de impresión");
      return;
    }

    setConnected(true);
    setSettings((settingsResult.data as PrintSettings | null) ?? {
      auto_print_kitchen: false,
      paper_width_mm: 48,
    });
    if (!jobsResult.error) setJobs((jobsResult.data ?? []) as PrintJobRow[]);
  }, []);

  const finishJob = useCallback(
    async (payload: KitchenPrintPayload, success: boolean, errorMessage?: string) => {
      const { error } = await createClient().rpc("finish_print_job", {
        p_job_id: payload.job_id,
        p_device_id: deviceIdRef.current,
        p_success: success,
        p_error: errorMessage ?? null,
      });
      if (error) throw error;
    },
    []
  );

  const processQueue = useCallback(async () => {
    if (
      processingRef.current ||
      !settings?.auto_print_kitchen ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    ) {
      return;
    }

    processingRef.current = true;
    setPrinting(true);
    const { data, error } = await createClient().rpc("claim_next_print_job", {
      p_device_id: deviceIdRef.current,
    });

    if (error) {
      processingRef.current = false;
      setPrinting(false);
      setConnected(false);
      return;
    }

    const payload = data as KitchenPrintPayload | null;
    if (!payload) {
      processingRef.current = false;
      setPrinting(false);
      return;
    }

    setCurrentTicket(payload);
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    try {
      window.print();
      await finishJob(payload, true);
      toast.success(`Pedido #${payload.order.number} enviado a la impresora`);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "No se pudo imprimir";
      await finishJob(payload, false, message).catch(() => undefined);
      toast.error("La impresión no terminó", { description: message });
    } finally {
      setCurrentTicket(null);
      processingRef.current = false;
      setPrinting(false);
      await loadStation();
      window.setTimeout(() => void processQueue(), 500);
    }
  }, [finishJob, loadStation, settings?.auto_print_kitchen]);

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    const initialLoad = window.setTimeout(() => void loadStation(), 0);

    const updateConnectivity = () => setConnected(navigator.onLine);
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [loadStation]);

  useEffect(() => {
    if (!stationReady) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`print-station-${deviceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs" },
        () => {
          void loadStation();
          void processQueue();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "print_station_settings" },
        () => void loadStation()
      )
      .subscribe((status: string) =>
        setConnected(status !== "CHANNEL_ERROR" && navigator.onLine)
      );

    const poll = window.setInterval(() => {
      void loadStation();
      void processQueue();
    }, 5000);

    void processQueue();
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [autoPrintEnabled, loadStation, processQueue, stationReady]);

  async function toggleStation() {
    if (!settings || saving) return;
    setSaving(true);
    const nextEnabled = !settings.auto_print_kitchen;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("print_station_settings")
      .update({
        auto_print_kitchen: nextEnabled,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("singleton", true);
    setSaving(false);

    if (error) {
      toast.error("No se pudo cambiar la estación", { description: error.message });
      return;
    }

    setSettings({ ...settings, auto_print_kitchen: nextEnabled });
    toast.success(nextEnabled ? "Impresión automática activada" : "Impresión automática pausada");
  }

  async function retryJob(jobId: string) {
    const { error } = await createClient().rpc("requeue_print_job", { p_job_id: jobId });
    if (error) {
      toast.error("No se pudo reintentar", { description: error.message });
      return;
    }
    toast.success("Trabajo devuelto a la cola");
    await loadStation();
    void processQueue();
  }

  const queuedCount = jobs.filter((job) => job.status === "queued" || job.status === "printing").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;

  return (
    <div className="pos-scroll h-full overflow-y-auto bg-background p-3 pb-10 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              Laptop de impresión
            </p>
            <h1 className="mt-1 font-heading text-2xl font-bold">Estación de cocina</h1>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Recibe pedidos en esta laptop y prepara cada ticket para una impresora USB de 48 mm.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStation()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-raised px-4 font-heading text-xs font-bold text-foreground disabled:opacity-50"
          >
            <RefreshCw aria-hidden size={16} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </header>

        <section className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
          <div className={`rounded-3xl border p-5 sm:p-6 ${settings?.auto_print_kitchen ? "border-success/45 bg-success/8" : "border-border bg-surface"}`}>
            <div className="flex items-start gap-4">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${settings?.auto_print_kitchen ? "bg-success text-ink" : "bg-surface-raised text-muted-foreground"}`}>
                {printing ? <Loader2 aria-hidden size={25} className="animate-spin" /> : <Printer aria-hidden size={25} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-lg font-bold">
                    {settings?.auto_print_kitchen ? "Estación activa" : "Estación pausada"}
                  </h2>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-data text-[10px] font-bold ${connected ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"}`}>
                    {connected ? <Wifi aria-hidden size={11} /> : <WifiOff aria-hidden size={11} />}
                    {connected ? "En línea" : "Sin conexión"}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
                  {settings?.auto_print_kitchen
                    ? "Mantén esta página abierta. Los pedidos nuevos se imprimen en orden y los pendientes se conservan si la laptop pierde conexión."
                    : "Actívala al iniciar el turno en la laptop conectada a la impresora. Mientras esté pausada no se crearán tickets automáticos nuevos."}
                </p>
                <button
                  type="button"
                  onClick={() => void toggleStation()}
                  disabled={!settings || saving}
                  className={`mt-5 inline-flex h-12 min-w-52 items-center justify-center gap-2 rounded-xl px-5 font-heading text-sm font-bold disabled:opacity-45 ${settings?.auto_print_kitchen ? "action-warning" : "action-success"}`}
                >
                  {saving ? <Loader2 aria-hidden size={17} className="animate-spin" /> : settings?.auto_print_kitchen ? <Pause aria-hidden size={17} /> : <Play aria-hidden size={17} />}
                  {settings?.auto_print_kitchen ? "Pausar impresión" : "Activar impresión"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-body text-xs text-muted-foreground">En cola</p>
              <p className="mt-1 font-data text-3xl font-bold text-gold">{queuedCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-body text-xs text-muted-foreground">Requieren atención</p>
              <p className={`mt-1 font-data text-3xl font-bold ${failedCount ? "text-destructive" : "text-success"}`}>{failedCount}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border p-4 sm:p-5">
            <Laptop aria-hidden size={20} className="text-brand" />
            <div>
              <h2 className="font-heading text-base font-bold">Actividad reciente</h2>
              <p className="font-body text-xs text-muted-foreground">La cola evita duplicados por pedido.</p>
            </div>
          </div>
          {jobs.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center">
              <CheckCircle2 aria-hidden size={30} className="text-success" />
              <p className="mt-3 font-heading text-sm font-bold">No hay tickets pendientes</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">Los pedidos nuevos aparecerán aquí.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <div key={job.id} className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${job.status === "failed" ? "bg-destructive/12 text-destructive" : job.status === "printed" ? "bg-success/12 text-success" : "bg-gold/12 text-gold"}`}>
                    {job.status === "failed" ? <AlertTriangle aria-hidden size={17} /> : job.status === "printed" ? <CheckCircle2 aria-hidden size={17} /> : <Printer aria-hidden size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-sm font-bold">{statusLabel(job.status)}</p>
                    <p className="truncate font-body text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(job.created_at))}
                      {job.attempts > 0 ? ` · intento ${job.attempts}` : ""}
                    </p>
                    {job.last_error ? <p className="mt-1 truncate font-body text-xs text-destructive">{job.last_error}</p> : null}
                  </div>
                  {job.status === "failed" ? (
                    <button type="button" onClick={() => void retryJob(job.id)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive/12 px-3 font-heading text-xs font-bold text-destructive hover:bg-destructive/20">
                      <RotateCcw aria-hidden size={14} /> Reintentar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gold/25 bg-gold/8 p-4 font-body text-xs leading-relaxed text-muted-foreground">
          Para impresión sin ventana de confirmación, configura el navegador de esta laptop en modo impresión directa y deja seleccionada la impresora USB de 48 mm como predeterminada. Sin ese modo, el sistema abrirá la vista de impresión para confirmar cada ticket.
        </section>
      </div>

      {currentTicket ? <KitchenTicket payload={currentTicket} /> : null}
    </div>
  );
}

function KitchenTicket({ payload }: { payload: KitchenPrintPayload }) {
  const { order, items } = payload;
  const createdAt = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Hermosillo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(order.created_at));

  return (
    <article className="kitchen-ticket-print-root fixed -left-[9999px] top-0 w-[48mm] bg-white px-[2.5mm] py-[3mm] text-black">
      <header className="border-b-2 border-black pb-2 text-center">
        <p className="font-heading text-[12px] font-black tracking-[0.16em]">COCINA</p>
        <p className="mt-1 font-data text-2xl font-black leading-none">#{order.number}</p>
        <p className="mt-1 font-heading text-[11px] font-black uppercase">{locationLabel(order)}</p>
      </header>
      <div className="border-b border-dashed border-black py-2 font-data text-[10px]">
        <p>{createdAt}</p>
        <p>Atendió: {order.created_by_name || "Personal"}</p>
      </div>
      <div className="space-y-3 py-3">
        {items.map((item) => (
          <section key={item.id}>
            <p className="font-heading text-sm font-black leading-tight">
              {item.quantity}x {item.name}
            </p>
            {item.selected_modifiers?.length ? (
              <div className="mt-1 space-y-0.5 pl-2 font-body text-[10px] leading-tight">
                {item.selected_modifiers.map((modifier, index) => (
                  <p key={`${modifier.option_id ?? modifier.option}-${index}`}>+ {modifier.option}</p>
                ))}
              </div>
            ) : null}
            {item.notes ? <p className="mt-1 border-l-2 border-black pl-1.5 font-body text-[10px] font-bold leading-tight">NOTA: {item.notes}</p> : null}
          </section>
        ))}
      </div>
      {order.notes ? <p className="border-t-2 border-black pt-2 font-body text-[10px] font-black">NOTA GENERAL: {order.notes}</p> : null}
      <p className="mt-3 border-t border-dashed border-black pt-2 text-center font-data text-[10px]">Mideli · impresión {payload.attempt}</p>
    </article>
  );
}
