/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import {
  shouldSuppressPushBanner,
  type PushTopic,
} from "@/lib/push-notification-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

type MideliPushPayload = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  topic?: PushTopic;
  data?: {
    url?: string;
    orderId?: string;
    eventId?: string;
    topic?: PushTopic;
  };
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching:
    self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1"
      ? []
      : defaultCache,
});

serwist.addEventListeners();

self.addEventListener("push", (event: PushEvent) => {
  let payload: MideliPushPayload = {};
  try {
    payload = (event.data?.json() ?? {}) as MideliPushPayload;
  } catch {
    payload = {};
  }
  const topic: PushTopic = payload.topic === "kitchen" ? "kitchen" : "ready";
  const title =
    payload.title ?? (topic === "kitchen" ? "Nuevo pedido" : "Pedido listo");
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const suppress = shouldSuppressPushBanner(
        topic,
        clients.map((client) => ({
          url: client.url,
          visibilityState:
            "visibilityState" in client
              ? String(client.visibilityState)
              : undefined,
        }))
      );
      if (suppress) return;

      await self.registration.showNotification(title, {
        body:
          payload.body ??
          (topic === "kitchen"
            ? "Entró un pedido nuevo."
            : "Cocina terminó un pedido."),
        icon: payload.icon ?? "/icons/icon-192x192.png",
        badge: payload.badge ?? "/icons/icon-192x192.png",
        tag:
          payload.tag ??
          (topic === "kitchen" ? "mideli-order-new" : "mideli-order-ready"),
        data:
          payload.data ??
          (topic === "kitchen"
            ? { url: "/dashboard/cocina", topic }
            : { url: "/dashboard/mesero?mode=status", topic }),
      });
    })()
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const destination = String(
    (event.notification.data as { url?: string } | undefined)?.url ??
      "/dashboard/mesero?mode=status"
  );

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => "focus" in client);
      if (sameOriginClient && "navigate" in sameOriginClient) {
        return sameOriginClient.navigate(destination).then(() => sameOriginClient.focus());
      }
      return self.clients.openWindow(destination);
    })
  );
});
