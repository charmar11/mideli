"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Copy,
  Database,
  Gauge,
  Laptop,
  Loader2,
  Printer,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wifi,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getPushStatus, type PushStatus } from "@/lib/push-notifications";
import { isReadyOrderAudioUnlocked } from "@/lib/ready-order-audio";
import { createClient } from "@/lib/supabase/client";

type DiagnosticId =
  | "application"
  | "connectivity"
  | "session"
  | "database"
  | "realtime"
  | "pwa"
  | "alerts"
  | "printing";

type DiagnosticStatus = "idle" | "running" | "ok" | "warning" | "error";

type DiagnosticResult = {
  id: DiagnosticId;
  status: DiagnosticStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  checkedAt?: string;
};

type CheckDefinition = {
  id: DiagnosticId;
  title: string;
  description: string;
  icon: LucideIcon;
};

type CheckOutcome = Pick<DiagnosticResult, "status" | "message" | "detail">;

type HealthResponse = {
  status: string;
  version: string;
  timestamp: string;
};

const CHECKS: CheckDefinition[] = [
  {
    id: "application",
    title: "Aplicación",
    description: "Interfaz, reloj y versión disponible.",
    icon: Gauge,
  },
  {
    id: "connectivity",
    title: "Conectividad",
    description: "Red y respuesta del servidor de Mideli.",
    icon: Wifi,
  },
  {
    id: "session",
    title: "Sesión y permisos",
    description: "Usuario activo y acceso administrativo.",
    icon: ShieldCheck,
  },
  {
    id: "database",
    title: "Base de datos",
    description: "Consulta segura de solo lectura.",
    icon: Database,
  },
  {
    id: "realtime",
    title: "Tiempo real",
    description: "Canal temporal para cambios entre dispositivos.",
    icon: Radio,
  },
  {
    id: "pwa",
    title: "Aplicación instalada",
    description: "Manifiesto y servicio de la PWA.",
    icon: Laptop,
  },
  {
    id: "alerts",
    title: "Avisos y sonido",
    description: "Push del dispositivo y audio de pedidos listos.",
    icon: BellRing,
  },
  {
    id: "printing",
    title: "Impresión",
    description: "Estación automática y trabajos pendientes.",
    icon: Printer,
  },
];

const PUSH_LABELS: Record<PushStatus, string> = {
  checking: "comprobando",
  unsupported: "no compatible",
  install_required: "requiere instalación",
  denied: "bloqueado",
  available: "disponible sin activar",
  paused: "pausado",
  production_required: "disponible en la versión publicada",
  error: "error de conexión",
  enabled: "activo",
};

function initialResults() {
  return Object.fromEntries(
    CHECKS.map(({ id }) => [
      id,
      {
        id,
        status: "idle",
        message: "Sin comprobar",
      } satisfies DiagnosticResult,
    ])
  ) as Record<DiagnosticId, DiagnosticResult>;
}

function withAbortTimeout(milliseconds: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    finish: () => window.clearTimeout(timer),
  };
}

function friendlyFailure(id: DiagnosticId): string {
  const messages: Record<DiagnosticId, string> = {
    application: "La interfaz no pudo confirmar su estado.",
    connectivity: "Mideli no respondió dentro del tiempo esperado.",
    session: "No se pudo validar la sesión actual.",
    database: "No se pudo completar la consulta de lectura.",
    realtime: "El canal de tiempo real no logró conectarse.",
    pwa: "No se pudo revisar la instalación de la aplicación.",
    alerts: "No se pudo comprobar el estado de los avisos.",
    printing: "No se pudo consultar la estación de impresión.",
  };
  return messages[id];
}

async function checkApplication(): Promise<CheckOutcome> {
  return {
    status: "ok",
    message: "Interfaz lista para operar",
    detail: `Hora del dispositivo: ${new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date())}`,
  };
}

async function checkConnectivity(): Promise<CheckOutcome> {
  if (!navigator.onLine) {
    return {
      status: "error",
      message: "El dispositivo está sin conexión",
      detail: "Recupera la red y vuelve a comprobar.",
    };
  }

  const timeout = withAbortTimeout(5_000);
  try {
    const response = await fetch("/api/health", {
      cache: "no-store",
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error("health response");
    const payload = (await response.json()) as HealthResponse;
    if (payload.status !== "ok" || !payload.timestamp) throw new Error("health contract");

    return {
      status: "ok",
      message: "Servidor disponible",
      detail: `Versión ${payload.version}`,
    };
  } finally {
    timeout.finish();
  }
}

async function checkSession(): Promise<CheckOutcome> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("session unavailable");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) throw new Error("profile unavailable");
  if (profile.is_active === false) {
    return { status: "error", message: "El perfil está desactivado" };
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return {
      status: "error",
      message: "El perfil no tiene acceso administrativo",
    };
  }

  return {
    status: "ok",
    message: "Sesión administrativa válida",
    detail: profile.role === "owner" ? "Propietario" : "Administrador",
  };
}

async function checkDatabase(): Promise<CheckOutcome> {
  const startedAt = performance.now();
  const { data, error } = await createClient()
    .from("app_license")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("database read failed");
  if (!data) {
    return {
      status: "warning",
      message: "La base respondió sin el registro esperado",
    };
  }

  return {
    status: "ok",
    message: "Lectura completada",
    detail: `${Math.round(performance.now() - startedAt)} ms de respuesta`,
  };
}

async function checkRealtime(): Promise<CheckOutcome> {
  const supabase = createClient();
  const channel = supabase.channel(`mideli-diagnostic-${crypto.randomUUID()}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("realtime timeout")),
        7_000
      );

      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timer);
          resolve();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          window.clearTimeout(timer);
          reject(new Error("realtime unavailable"));
        }
      });
    });

    return {
      status: "ok",
      message: "Canal conectado",
      detail: "La comunicación entre dispositivos está disponible.",
    };
  } finally {
    await supabase.removeChannel(channel);
  }
}

async function checkPwa(): Promise<CheckOutcome> {
  const manifestResponse = await fetch("/manifest.webmanifest", { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("manifest unavailable");

  if (!("serviceWorker" in navigator)) {
    return {
      status: "warning",
      message: "Este navegador no admite instalación PWA",
    };
  }

  if (process.env.NODE_ENV === "development") {
    return {
      status: "warning",
      message: "PWA pausada en localhost",
      detail: "El manifiesto está listo; Serwist se activa al publicar.",
    };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) {
    return {
      status: "warning",
      message: "La PWA todavía no está activa en este dispositivo",
    };
  }

  return {
    status: "ok",
    message: "PWA activa",
    detail: "Servicio de aplicación registrado.",
  };
}

async function checkAlerts(): Promise<CheckOutcome> {
  const [readyPushStatus, kitchenPushStatus, whatsappPushStatus, soundResponse] = await Promise.all([
    getPushStatus("ready"),
    getPushStatus("kitchen"),
    getPushStatus("whatsapp_attention"),
    fetch("/sounds/universfield-new-notification-051-494246.mp3", {
      method: "HEAD",
      cache: "no-store",
    }),
  ]);

  if (!soundResponse.ok) throw new Error("sound unavailable");
  const audioReady = isReadyOrderAudioUnlocked();
  const detail = `Entrega: ${PUSH_LABELS[readyPushStatus]}. Cocina: ${PUSH_LABELS[kitchenPushStatus]}. WhatsApp: ${PUSH_LABELS[whatsappPushStatus]}. Sonido: ${
    audioReady ? "habilitado" : "pendiente de interacción"
  }.`;

  if ([readyPushStatus, kitchenPushStatus, whatsappPushStatus].includes("denied")) {
    return {
      status: "error",
      message: "Los avisos están bloqueados",
      detail,
    };
  }
  if (
    (readyPushStatus === "enabled" || kitchenPushStatus === "enabled" || whatsappPushStatus === "enabled") &&
    audioReady
  ) {
    return { status: "ok", message: "Avisos y sonido listos", detail };
  }

  return {
    status: "warning",
    message:
      readyPushStatus === "production_required" ||
      kitchenPushStatus === "production_required" ||
      whatsappPushStatus === "production_required"
        ? "Los avisos Push se validan al publicar"
        : "Los avisos requieren atención en este dispositivo",
    detail,
  };
}

async function checkPrinting(): Promise<CheckOutcome> {
  const supabase = createClient();
  const [settingsResult, jobsResult] = await Promise.all([
    supabase
      .from("print_station_settings")
      .select("auto_print_kitchen,paper_width_mm")
      .eq("singleton", true)
      .maybeSingle(),
    supabase
      .from("print_jobs")
      .select("status")
      .in("status", ["queued", "failed"])
      .limit(50),
  ]);

  if (settingsResult.error || jobsResult.error) throw new Error("print read failed");
  if (!settingsResult.data) {
    return {
      status: "warning",
      message: "La estación todavía no tiene configuración",
    };
  }

  const jobs = jobsResult.data as Array<{ status: string }>;
  const queued = jobs.filter((job) => job.status === "queued").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const detail = `${queued} en espera, ${failed} con error, papel de ${settingsResult.data.paper_width_mm} mm.`;

  if (failed > 0) {
    return {
      status: "error",
      message: "Hay impresiones que requieren atención",
      detail,
    };
  }
  if (!settingsResult.data.auto_print_kitchen) {
    return {
      status: "warning",
      message: "Impresión automática pausada",
      detail,
    };
  }

  return {
    status: "ok",
    message: queued > 0 ? "Estación activa con trabajos en espera" : "Estación lista",
    detail,
  };
}

async function executeDiagnostic(id: DiagnosticId): Promise<DiagnosticResult> {
  const startedAt = performance.now();
  const runners: Record<DiagnosticId, () => Promise<CheckOutcome>> = {
    application: checkApplication,
    connectivity: checkConnectivity,
    session: checkSession,
    database: checkDatabase,
    realtime: checkRealtime,
    pwa: checkPwa,
    alerts: checkAlerts,
    printing: checkPrinting,
  };

  try {
    const outcome = await runners[id]();
    return {
      id,
      ...outcome,
      durationMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      id,
      status: "error",
      message: friendlyFailure(id),
      durationMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString(),
    };
  }
}

function statusLabel(status: DiagnosticStatus) {
  if (status === "ok") return "Correcto";
  if (status === "warning") return "Advertencia";
  if (status === "error") return "Error";
  if (status === "running") return "Comprobando";
  return "Sin comprobar";
}

function statusClasses(status: DiagnosticStatus) {
  if (status === "ok") return "border-success/30 bg-success/10 text-success";
  if (status === "warning") return "border-warning/30 bg-warning/10 text-warning";
  if (status === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-background text-muted-foreground";
}

function StatusIcon({ status }: { status: DiagnosticStatus }) {
  if (status === "running") return <Loader2 aria-hidden size={18} className="animate-spin" />;
  if (status === "ok") return <CheckCircle2 aria-hidden size={18} />;
  if (status === "warning") return <AlertTriangle aria-hidden size={18} />;
  if (status === "error") return <XCircle aria-hidden size={18} />;
  return <CircleDashed aria-hidden size={18} />;
}

function genericDeviceType() {
  if (window.innerWidth < 640) return "Dispositivo móvil";
  if (window.innerWidth < 1180) return "Tableta";
  return "Computadora";
}

function genericBrowser() {
  const agent = navigator.userAgent;
  if (/Firefox/i.test(agent)) return "Navegador Firefox";
  if (/AppleWebKit/i.test(agent) && !/Chrome|Chromium|Edg/i.test(agent)) {
    return "Navegador WebKit";
  }
  if (/Chrome|Chromium|Edg/i.test(agent)) return "Navegador Chromium";
  return "Navegador no identificado";
}

function genericSystem() {
  const agent = navigator.userAgent;
  if (/Windows/i.test(agent)) return "Windows";
  if (/Android/i.test(agent)) return "Sistema móvil Android";
  if (/iPad|iPhone|iPod/i.test(agent)) return "Sistema móvil";
  if (/Mac OS/i.test(agent)) return "macOS";
  if (/Linux/i.test(agent)) return "Linux";
  return "Sistema no identificado";
}

export function SystemDiagnostics() {
  const [results, setResults] = useState<Record<DiagnosticId, DiagnosticResult>>(
    initialResults
  );
  const [runningAll, setRunningAll] = useState(false);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    setResults((current) => {
      const next = { ...current };
      for (const { id } of CHECKS) {
        next[id] = { ...next[id], status: "running", message: "Comprobando" };
      }
      return next;
    });

    const completed = await Promise.all(CHECKS.map(({ id }) => executeDiagnostic(id)));
    setResults(
      Object.fromEntries(completed.map((result) => [result.id, result])) as Record<
        DiagnosticId,
        DiagnosticResult
      >
    );
    setRunningAll(false);
  }, []);

  const runSingle = useCallback(async (id: DiagnosticId) => {
    setResults((current) => ({
      ...current,
      [id]: { ...current[id], status: "running", message: "Comprobando" },
    }));
    const completed = await executeDiagnostic(id);
    setResults((current) => ({ ...current, [id]: completed }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void runAll(), 0);
    return () => window.clearTimeout(timer);
  }, [runAll]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      ok: values.filter((result) => result.status === "ok").length,
      warning: values.filter((result) => result.status === "warning").length,
      error: values.filter((result) => result.status === "error").length,
    };
  }, [results]);

  async function copySupportReport() {
    const report = {
      product: "Mideli",
      generated_at: new Date().toISOString(),
      route: window.location.pathname,
      environment: process.env.NODE_ENV,
      device: {
        type: genericDeviceType(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        browser: genericBrowser(),
        system: genericSystem(),
        online: navigator.onLine,
      },
      diagnostics: CHECKS.map(({ id, title }) => ({
        id,
        title,
        status: results[id].status,
        message: results[id].message,
        detail: results[id].detail,
        duration_ms: results[id].durationMs,
        checked_at: results[id].checkedAt,
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Reporte técnico copiado", {
        description: "No incluye contraseñas, tokens ni información de pedidos.",
      });
    } catch {
      toast.error("No se pudo copiar el reporte");
    }
  }

  const overallStatus: DiagnosticStatus = runningAll
    ? "running"
    : summary.error > 0
      ? "error"
      : summary.warning > 0
        ? "warning"
        : "ok";

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard/mesero" aria-label="Volver al panel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <ArrowLeft aria-hidden size={18} />
            </Link>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <Activity aria-hidden size={21} />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold sm:text-2xl">Diagnóstico</h1>
              <p className="mt-0.5 font-body text-sm text-muted-foreground">
                Comprueba Mideli antes de una demostración o turno.
              </p>
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copySupportReport()}
              className="h-11 flex-1 rounded-xl px-4 font-heading font-bold sm:flex-none"
            >
              <Copy aria-hidden />
              Copiar reporte
            </Button>
            <Button
              type="button"
              onClick={() => void runAll()}
              disabled={runningAll}
              className="h-11 flex-1 rounded-xl bg-brand px-4 font-heading font-bold text-white hover:bg-brand-hover sm:flex-none"
            >
              <RefreshCw aria-hidden className={runningAll ? "animate-spin" : ""} />
              Revisar todo
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-5 p-4 pb-24 sm:p-6 lg:p-8">
        <section
          aria-live="polite"
          className={`rounded-2xl border p-5 ${statusClasses(overallStatus)}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-current/10">
                <StatusIcon status={overallStatus} />
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold">
                  {runningAll
                    ? "Comprobando el sistema"
                    : summary.error > 0
                      ? "Hay funciones que requieren atención"
                      : summary.warning > 0
                        ? "Mideli funciona con algunas advertencias"
                        : "Mideli está listo para operar"}
                </h2>
                <p className="mt-1 font-body text-sm opacity-80">
                  Las advertencias de PWA y Push son normales mientras trabajas en localhost.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-background/35 px-4 py-2">
                <strong className="block font-data text-xl">{summary.ok}</strong>
                <span className="font-body text-xs">Correctas</span>
              </div>
              <div className="rounded-xl bg-background/35 px-4 py-2">
                <strong className="block font-data text-xl">{summary.warning}</strong>
                <span className="font-body text-xs">Avisos</span>
              </div>
              <div className="rounded-xl bg-background/35 px-4 py-2">
                <strong className="block font-data text-xl">{summary.error}</strong>
                <span className="font-body text-xs">Errores</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CHECKS.map((definition) => {
            const result = results[definition.id];
            const Icon = definition.icon;
            return (
              <article
                key={definition.id}
                className="flex min-h-56 flex-col rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-muted-foreground">
                    <Icon aria-hidden size={19} />
                  </span>
                  <span
                    className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-heading text-xs font-bold ${statusClasses(result.status)}`}
                  >
                    <StatusIcon status={result.status} />
                    {statusLabel(result.status)}
                  </span>
                </div>

                <h2 className="mt-4 font-heading text-lg font-bold">{definition.title}</h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  {definition.description}
                </p>
                <p className="mt-4 font-heading text-sm font-bold">{result.message}</p>
                {result.detail ? (
                  <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                    {result.detail}
                  </p>
                ) : null}

                <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <span className="flex items-center gap-1.5 font-data text-[11px] text-muted-foreground">
                    <Clock3 aria-hidden size={13} />
                    {result.durationMs === undefined ? "Sin medición" : `${result.durationMs} ms`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void runSingle(definition.id)}
                    disabled={result.status === "running" || runningAll}
                    aria-label={`Comprobar de nuevo ${definition.title}`}
                    className="h-10 rounded-xl px-3 font-heading text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      aria-hidden
                      className={result.status === "running" ? "animate-spin" : ""}
                    />
                    Repetir
                  </Button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-success" />
            <div>
              <h2 className="font-heading text-sm font-bold">Reporte seguro para soporte</h2>
              <p className="mt-1 max-w-3xl font-body text-sm leading-6 text-muted-foreground">
                El reporte incluye estados técnicos, tiempos y datos genéricos del dispositivo. No
                copia usuarios, contraseñas, PIN, tokens, clientes ni contenido de pedidos.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
