/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  data?: { url?: string; orderId?: string };
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
  const payload = (event.data?.json() ?? {}) as MideliPushPayload;
  const title = payload.title ?? "Pedido listo";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "Cocina terminó un pedido.",
      icon: payload.icon ?? "/icons/icon-192x192.png",
      badge: payload.badge ?? "/icons/icon-192x192.png",
      tag: payload.tag ?? "mideli-order-ready",
      data: payload.data ?? { url: "/dashboard/mesero?mode=status" },
    })
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
