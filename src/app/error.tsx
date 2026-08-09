"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);

    if (process.env.NODE_ENV !== "production") {
      console.error("Mideli application error", error);
    }
  }, [error]);

  return (
    <main className="flex min-h-[70dvh] items-center justify-center bg-background p-5 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 text-center shadow-float sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
          <AlertTriangle aria-hidden size={26} />
        </span>
        <p className="mt-5 font-body text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          Recuperación segura
        </p>
        <h1 className="mt-2 font-heading text-2xl font-bold">Esta vista no pudo continuar</h1>
        <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">
          Mideli detuvo esta pantalla para evitar más problemas. Mostrar este aviso no realiza
          cambios adicionales en pedidos, cobros o inventario.
        </p>

        {error.digest ? (
          <p className="mt-4 rounded-xl bg-background px-4 py-3 font-data text-xs text-muted-foreground">
            Referencia: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            onClick={reset}
            className="h-12 rounded-xl bg-brand font-heading font-bold text-white hover:bg-brand-hover"
          >
            <RefreshCw aria-hidden />
            Reintentar
          </Button>
          <Button
            variant="outline"
            render={<Link href="/dashboard" />}
            className="h-12 rounded-xl font-heading font-bold"
          >
            <Home aria-hidden />
            Volver al inicio
          </Button>
        </div>
      </section>
    </main>
  );
}
