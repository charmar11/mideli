"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function PWAProvider({ children }: { children: ReactNode }) {
  const isDevelopment = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!isDevelopment || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        if (registration.active?.scriptURL.includes("/serwist/sw/")) {
          void registration.unregister();
        }
      }
    });
  }, [isDevelopment]);

  return (
    <SerwistProvider
      swUrl="/serwist/sw/sw.js"
      disable={isDevelopment}
      register={!isDevelopment}
      cacheOnNavigation={!isDevelopment}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
