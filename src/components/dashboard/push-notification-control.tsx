"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  enablePushNotifications,
  getPushStatus,
  pausePushNotifications,
  type PushStatus,
} from "@/lib/push-notifications";
import { primeReadyOrderAudio } from "@/lib/ready-order-audio";

const STATUS_COPY: Record<PushStatus, string> = {
  checking: "Comprobando avisos",
  unsupported: "Este dispositivo no admite avisos Push",
  install_required: "Instala Mideli en la pantalla de inicio para activar avisos",
  denied: "Los avisos están bloqueados en la configuración del dispositivo",
  available: "Activar avisos de pedidos listos",
  paused: "Avisos pausados en este dispositivo",
  production_required: "Probar sonido de pedidos listos",
  enabled: "Avisos de pedidos listos activados",
};

export function PushNotificationControl() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void getPushStatus()
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch(() => {
        if (active) setStatus("available");
      });
    return () => {
      active = false;
    };
  }, []);

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
      if (status === "enabled") {
        const nextStatus = await pausePushNotifications();
        setStatus(nextStatus);
        toast.success("Avisos pausados", {
          description: "Este dispositivo no recibirá alertas hasta que vuelvas a activarlas.",
        });
        return;
      }

      const audioPromise = primeReadyOrderAudio(true);

      if (status === "production_required") {
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
        enablePushNotifications(),
        audioPromise,
      ]);
      setStatus(nextStatus);
      if (nextStatus === "enabled") {
        toast.success("Avisos activados", {
          description: audioReady
            ? "La tableta te avisará cuando cocina termine uno de tus pedidos."
            : "Push está activo. Toca otra vez la campana para probar el sonido.",
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
      title={STATUS_COPY[status]}
      aria-label={STATUS_COPY[status]}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
        status === "enabled"
          ? "border-success/35 bg-success/10 text-success"
          : status === "paused"
            ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
          : "border-border bg-surface text-muted-foreground hover:border-brand/45 hover:text-brand"
      }`}
    >
      {working || status === "checking" ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Icon size={16} />
      )}
      {status === "available" || status === "paused" ? (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
      ) : null}
    </button>
  );
}
