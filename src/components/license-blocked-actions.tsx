"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LicenseBlockedActions() {
  const [checking, setChecking] = useState(false);

  function retry() {
    setChecking(true);
    window.location.reload();
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={retry}
        disabled={checking}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-heading text-sm font-bold text-white shadow-md shadow-brand/20 transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        <RefreshCw size={17} className={checking ? "animate-spin" : ""} />
        {checking ? "Comprobando" : "Comprobar acceso"}
      </button>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-heading text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <LogOut size={17} /> Cerrar sesión
      </button>
    </div>
  );
}
