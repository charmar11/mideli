"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RETRY_SECONDS = 5;

export function SessionRecoveryView() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const recoveryInFlight = useRef(false);
  const secondsRef = useRef(RETRY_SECONDS);

  const recoverSession = useCallback(async () => {
    if (recoveryInFlight.current) return;

    recoveryInFlight.current = true;

    try {
      const { data, error } = await createClient().auth.refreshSession();

      if (error || !data.session) {
        setRecoveryMessage(
          "No se pudo renovar todavía. Conservamos tu sesión y seguiremos intentando.",
        );
        return;
      }

      setRecoveryMessage("Sesión recuperada. Volviendo a la pantalla anterior.");
      router.refresh();
    } catch {
      setRecoveryMessage(
        "No se pudo renovar todavía. Conservamos tu sesión y seguiremos intentando.",
      );
    } finally {
      recoveryInFlight.current = false;
      setRecovering(false);
    }
  }, [router]);

  const retry = useCallback(() => {
    if (recoveryInFlight.current) return;
    secondsRef.current = RETRY_SECONDS;
    setSeconds(RETRY_SECONDS);
    setRecovering(true);
    void recoverSession();
  }, [recoverSession]);

  useEffect(() => {
    const initialAttempt = window.setTimeout(() => {
      setRecovering(true);
      void recoverSession();
    }, 0);

    const timer = window.setInterval(() => {
      const next = secondsRef.current <= 1 ? RETRY_SECONDS : secondsRef.current - 1;
      secondsRef.current = next;
      setSeconds(next);

      if (next === RETRY_SECONDS && !recoveryInFlight.current) {
        setRecovering(true);
        void recoverSession();
      }
    }, 1_000);

    window.addEventListener("online", retry);
    return () => {
      window.clearTimeout(initialAttempt);
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [recoverSession, retry]);

  function returnToLogin() {
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
          Estamos intentando renovar tu acceso sin cerrar la sesión ni borrar la
          comanda. Próximo intento en {seconds} s.
        </p>
        {recoveryMessage ? (
          <p role="status" className="mt-3 font-body text-sm text-muted-foreground">
            {recoveryMessage}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={retry}
            className="action-warning inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-heading text-sm font-bold"
          >
            <RefreshCw aria-hidden size={18} />
            {recovering ? "Renovando sesión…" : "Intentar ahora"}
          </button>
          <button
            type="button"
            onClick={returnToLogin}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-4 font-heading text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Volver al acceso
          </button>
        </div>
      </section>
    </main>
  );
}
