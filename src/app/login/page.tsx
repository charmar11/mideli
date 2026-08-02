import { LockKeyhole } from "lucide-react";
import { AccessBrandPanel } from "@/components/auth/access-brand-panel";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[0.94fr_1.06fr]">
      <AccessBrandPanel compact />

      <main className="flex items-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">
            <LockKeyhole size={22} />
          </span>
          <h1 className="mt-6 font-heading text-3xl font-bold tracking-[-0.03em] text-foreground">
            Iniciar sesión
          </h1>
          <p className="mt-2 mb-8 font-body text-base text-muted-foreground">
            Usa el usuario y la contraseña asignados para tu turno.
          </p>
          <LoginForm />
          <p className="mt-7 border-t border-border pt-5 text-center font-body text-sm text-muted-foreground">
            ¿No puedes entrar? Contacta al administrador del local.
          </p>
        </div>
      </main>
    </div>
  );
}
