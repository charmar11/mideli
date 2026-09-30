"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        <label htmlFor="username" className="font-heading text-sm font-bold text-foreground">
          Usuario
        </label>
        <div className="flex h-[3.25rem] items-stretch overflow-hidden rounded-xl border border-border bg-background transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <input
            id="username"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="min-w-0 flex-1 bg-transparent px-3.5 font-body text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-heading text-sm font-bold text-foreground">
          Contraseña
        </label>
        <div className="flex h-[3.25rem] items-stretch overflow-hidden rounded-xl border border-border bg-background transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent px-3.5 font-body text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="inline-flex min-w-12 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 inline-flex h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
