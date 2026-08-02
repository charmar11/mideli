"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AnaliticasError({ reset }: { reset: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 text-center ring-1 ring-foreground/10">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
          <AlertTriangle size={22} />
        </span>
        <h1 className="mt-4 font-heading text-xl font-bold">
          No pudimos cargar las analíticas
        </h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Revisa la conexión e inténtalo de nuevo. Los pedidos y cobros no se modificaron.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={reset}
          className="mt-5 h-11 rounded-xl bg-brand px-5 font-heading font-bold text-white hover:bg-brand-hover"
        >
          <RefreshCw />
          Reintentar
        </Button>
      </div>
    </div>
  );
}
