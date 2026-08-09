"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fullEmail = email.includes("@") ? email : `${email}@mideli.com`;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: fullEmail,
      password,
    });

    if (error) {
      setError("Usuario o contraseña incorrectos");
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 font-body text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-heading text-xs font-bold text-muted-foreground">
          Usuario
        </label>
        <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-border bg-background focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="Ej. admin"
            autoFocus
            className="min-w-0 flex-1 bg-transparent px-3.5 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-heading text-xs font-bold text-muted-foreground">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-12 rounded-xl border border-border bg-background px-3.5 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-brand font-heading text-sm font-bold text-white shadow-md shadow-brand/25 transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Entrando…" : "Entrar al turno"}
      </button>
    </form>
  );
}
