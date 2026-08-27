"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
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
    install_required: "Instala Mideli en la pantalla de inicio para activar avisos",
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
};

export function PushNotificationControl({ topic }: PushNotificationControlProps) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void getPushStatus(topic)
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
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
      toast.error("Activa las notificaciones de Mideli desde la configuración del dispositivo");
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
          toast.info("Los avisos Push se activan en la versión publicada de Mideli");
          return;
        }
        const audioReady = await audioPromise;
        toast[audioReady ? "success" : "info"](
          audioReady ? "Sonido de pedidos listo" : "Toca de nuevo para probar el sonido",
          {
            description: "Los avisos Push se activan en la versión publicada de Mideli.",
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

  const Icon =
    status === "denied" || status === "unsupported" || status === "paused"
      ? BellOff
      : Bell;
  return (
    <button
      type="button"
      onClick={handleClick}
      title={statusCopy(status, topic)}
      aria-label={statusCopy(status, topic)}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
        status === "enabled"
          ? "border-success/35 bg-success/10 text-success"
          : status === "paused"
            ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
            : status === "error"
              ? "border-destructive/35 bg-destructive/10 text-destructive"
          : "border-border bg-surface text-muted-foreground hover:border-brand/45 hover:text-brand"
      }`}
    >
      {working || status === "checking" ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Icon size={16} />
      )}
      {status === "available" || status === "paused" || status === "error" ? (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
      ) : null}
    </button>
  );
}
