"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RETRY_SECONDS = 5;

export function SessionRecoveryView() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  const [signingOut, setSigningOut] = useState(false);

  const retry = useCallback(() => {
    setSeconds(RETRY_SECONDS);
    router.refresh();
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          router.refresh();
          return RETRY_SECONDS;
        }

        return current - 1;
      });
    }, 1_000);

    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [retry, router]);

  async function returnToLogin() {
    setSigningOut(true);
    await createClient().auth.signOut();
    window.location.replace("/login");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <WifiOff aria-hidden size={24} />
        </div>
        <h1 className="mt-5 font-heading text-2xl font-bold tracking-[-0.02em]">
          Recuperando la conexión
        </h1>
        <p className="mt-2 font-body text-base leading-relaxed text-muted-foreground">
          Tu sesión sigue abierta. Mideli volverá a intentarlo en {seconds} s sin
          borrar tu acceso ni el trabajo del turno.
        </p>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={retry}
            className="action-warning inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-heading text-sm font-bold"
          >
            <RefreshCw aria-hidden size={18} />
            Intentar ahora
          </button>
          <button
            type="button"
            disabled={signingOut}
            onClick={returnToLogin}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-4 font-heading text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Cerrando sesión..." : "Cerrar sesión y volver al acceso"}
          </button>
        </div>
      </section>
    </main>
  );
}
