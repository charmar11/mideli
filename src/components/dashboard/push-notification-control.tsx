"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  ChefHat,
  CircleAlert,
  Loader2,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  enablePushNotifications,
  getPushStatus,
  pausePushNotifications,
  type PushTopic,
  type PushStatus,
} from "@/lib/push-notifications";
import { primeReadyOrderAudio } from "@/lib/ready-order-audio";

const TOPIC_LABEL: Record<PushTopic, string> = {
  ready: "pedidos listos",
  kitchen: "pedidos nuevos",
  whatsapp_attention: "chats por atender",
};

function statusCopy(status: PushStatus, topic: PushTopic) {
  const label = TOPIC_LABEL[topic];
  const copy: Record<PushStatus, string> = {
    checking: `Comprobando avisos de ${label}`,
    unsupported: "Este dispositivo no admite avisos Push",
    install_required: "Instala la aplicación en la pantalla de inicio para activar avisos",
    denied: "Los avisos están bloqueados en la configuración del dispositivo",
    available: `Activar avisos de ${label}`,
    paused: `Avisos de ${label} pausados en este dispositivo`,
    production_required: `Los avisos de ${label} requieren la versión publicada`,
    error: `No se pudo comprobar los avisos de ${label}`,
    enabled: `Avisos de ${label} activados`,
  };
  return copy[status];
}

type PushNotificationControlProps = {
  topic: PushTopic;
  layout?: "icon" | "row";
};

export function PushNotificationControl({
  topic,
  layout = "icon",
}: PushNotificationControlProps) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getPushStatus(topic)
        .then((nextStatus) => {
          if (active) setStatus(nextStatus);
        })
        .catch(() => {
          if (active) setStatus("error");
        });
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [topic]);

  async function handleClick() {
    if (working) return;

    if (status === "install_required") {
      toast.info("Usa Compartir y después Agregar a pantalla de inicio en tu dispositivo");
      return;
    }
    if (status === "unsupported") {
      toast.error("Este navegador no permite avisos Push");
      return;
    }
    if (status === "denied") {
      toast.error("Activa las notificaciones de la aplicación desde la configuración del dispositivo");
      return;
    }

    setWorking(true);
    try {
      if (status === "error") {
        const nextStatus = await getPushStatus(topic);
        setStatus(nextStatus);
        return;
      }

      if (status === "enabled") {
        const nextStatus = await pausePushNotifications(topic);
        setStatus(nextStatus);
        toast.success("Avisos pausados", {
          description: "Este dispositivo no recibirá alertas hasta que vuelvas a activarlas.",
        });
        return;
      }

      const audioPromise =
        topic === "ready" ? primeReadyOrderAudio(true) : Promise.resolve(true);

      if (status === "production_required") {
        if (topic !== "ready") {
          toast.info("Los avisos Push se activan en la versión publicada del sistema");
          return;
        }
        const audioReady = await audioPromise;
        toast[audioReady ? "success" : "info"](
          audioReady ? "Sonido de pedidos listo" : "Toca de nuevo para probar el sonido",
          {
            description: "Los avisos Push se activan en la versión publicada del sistema.",
          }
        );
        return;
      }

      const [nextStatus, audioReady] = await Promise.all([
        enablePushNotifications(topic),
        audioPromise,
      ]);
      setStatus(nextStatus);
      if (nextStatus === "enabled") {
        toast.success("Avisos activados", {
          description: audioReady
            ? topic === "kitchen"
              ? "Este dispositivo te avisará cuando entre un pedido nuevo."
              : topic === "ready"
                ? "Este dispositivo te avisará cuando cocina termine un pedido."
                : "Este dispositivo te avisará cuando un chat necesite atención humana."
            : "Push está activo. El sonido local se habilita al tocar la pantalla.",
        });
      }
    } catch (error) {
      toast.error("No se pudieron activar los avisos", {
        description: error instanceof Error ? error.message : "Intenta de nuevo.",
      });
    } finally {
      setWorking(false);
    }
  }

  const TopicIcon =
    topic === "kitchen"
      ? ChefHat
      : topic === "whatsapp_attention"
        ? MessageCircle
        : Bell;
  const Icon =
    status === "denied" || status === "unsupported" || status === "paused"
      ? BellOff
      : TopicIcon;
  const StatusIcon =
    status === "denied" || status === "unsupported" || status === "paused"
      ? BellOff
      : status === "enabled"
        ? Check
        : CircleAlert;
  const statusLabel =
    status === "enabled"
      ? "Activo"
      : status === "paused"
        ? "Pausado"
        : status === "checking"
          ? "Comprobando"
          : "Inactivo";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={working || status === "checking"}
      title={statusCopy(status, topic)}
      aria-label={statusCopy(status, topic)}
      aria-pressed={status === "enabled"}
      className={
        layout === "row"
          ? `flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset disabled:cursor-wait disabled:opacity-70 ${
              status === "enabled"
                ? "border-success/35 bg-success/8"
                : status === "paused"
                  ? "border-warning/35 bg-warning/5"
                  : status === "error"
                    ? "border-destructive/35 bg-destructive/5"
                    : "border-border bg-background hover:border-brand/45"
            }`
          : `relative flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset disabled:cursor-wait disabled:opacity-70 ${
              status === "enabled"
                ? "border-success/35 bg-success/10 text-success"
                : status === "paused"
                  ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
                  : status === "error"
                    ? "border-destructive/35 bg-destructive/10 text-destructive"
                    : "border-border bg-surface text-muted-foreground hover:border-brand/45 hover:text-brand"
            }`
      }
    >
      {layout === "row" ? (
        <>
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
              status === "enabled"
                ? "bg-success/12 text-success"
                : status === "paused"
                  ? "bg-warning/12 text-warning"
                  : "bg-surface-raised text-muted-foreground"
            }`}
            aria-hidden
          >
            {working || status === "checking" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <TopicIcon size={16} />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-heading text-xs font-bold text-foreground">
              {TOPIC_LABEL[topic]}
            </span>
            <span className="truncate font-body text-[10px] leading-4 text-muted-foreground">
              {statusCopy(status, topic)}
            </span>
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 font-heading text-[10px] font-bold ${
              status === "enabled"
                ? "text-success"
                : status === "paused"
                  ? "text-warning"
                  : "text-muted-foreground"
            }`}
          >
            <StatusIcon size={12} aria-hidden />
            {statusLabel}
          </span>
        </>
      ) : (
        <>
          {working || status === "checking" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Icon size={16} />
          )}
          {status === "available" || status === "paused" || status === "error" ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
          ) : null}
        </>
      )}
    </button>
  );
}

export function PushNotificationSettings() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeWhenOutside(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="group relative shrink-0">
      <summary
        aria-label="Preferencias de notificaciones"
        title="Preferencias de notificaciones"
        className="flex h-11 w-11 cursor-pointer list-none touch-manipulation items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:border-brand/45 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
      >
        <Bell size={16} aria-hidden />
        <SlidersHorizontal
          size={9}
          aria-hidden
          className="absolute right-1.5 top-1.5 text-brand"
        />
      </summary>
      <div
        role="group"
        aria-label="Avisos de pedidos"
        className="absolute right-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-1rem))] rounded-2xl border border-border bg-surface p-3 shadow-float"
      >
        <p className="mb-2 px-1 font-heading text-xs font-bold text-foreground">
          Notificaciones
        </p>
        <div className="space-y-2">
          <PushNotificationControl topic="kitchen" layout="row" />
          <PushNotificationControl topic="ready" layout="row" />
        </div>
      </div>
    </details>
  );
}
