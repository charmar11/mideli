"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOrderStore, type OrderWithItems } from "@/lib/stores";
import {
  isReadyOrderAudioUnlocked,
  playReadyOrderSound,
  primeReadyOrderAudio,
  shouldPrimeReadyOrderAudio,
} from "@/lib/ready-order-audio";
import { formatOrderLocation } from "@/lib/order-location";
import { areDeviceAlertsEnabled } from "@/lib/push-notifications";

export function ReadyOrderNotifier() {
  const activeOrders = useOrderStore((state) => state.activeOrders);
  const loading = useOrderStore((state) => state.loading);
  const previousOrdersRef = useRef<Map<string, OrderWithItems>>(new Map());
  const hasHydratedRef = useRef(false);
  const hasObservedLoadRef = useRef(false);
  const soundWarningRef = useRef(false);

  useEffect(() => {
    if (!shouldPrimeReadyOrderAudio()) return;

    const unlockAudio = () => {
      if (isReadyOrderAudioUnlocked()) return;
      void primeReadyOrderAudio(false);
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("touchend", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchend", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const playReadySound = useCallback(() => {
    void playReadyOrderSound().then((played) => {
      if (played) return;
      if (soundWarningRef.current) return;
      soundWarningRef.current = true;
      toast.info("Toca la pantalla para activar las alertas de pedidos listos");
    });
  }, []);

  useEffect(() => {
    const currentOrders = new Map(activeOrders.map((order) => [order.id, order]));
    const previousOrders = previousOrdersRef.current;

    if (loading) {
      hasObservedLoadRef.current = true;
      return;
    }

    if (!hasHydratedRef.current) {
      // Do not announce orders that were already ready before the first sync.
      // If the store starts empty, wait until its first loading cycle finishes.
      if (!hasObservedLoadRef.current && activeOrders.length === 0) {
        return;
      }
      previousOrdersRef.current = currentOrders;
      hasHydratedRef.current = true;
      return;
    }

    {
      const readyOrders = activeOrders.filter(
        (order) =>
          order.status === "ready" &&
          previousOrders.get(order.id)?.status !== "ready"
      );

      if (readyOrders.length > 0) {
        if (!areDeviceAlertsEnabled()) {
          previousOrdersRef.current = currentOrders;
          return;
        }

        playReadySound();
        const orderNumbers = readyOrders.map((order) => `#${order.number}`).join(", ");
        const tableNames = readyOrders
          .map((order) => formatOrderLocation(order))
          .join(" · ");
        toast.success(
          readyOrders.length === 1
            ? `Pedido ${orderNumbers} listo para entregar`
            : `${readyOrders.length} pedidos listos para entregar`,
          {
            description: `${orderNumbers} · ${tableNames}`,
            duration: 7000,
          }
        );
      }
    }

    previousOrdersRef.current = currentOrders;
  }, [activeOrders, loading, playReadySound]);

  return null;
}
