import { LoginForm } from "@/components/auth/login-form";
import { getBrandThemeVariables, PLATFORM_BRAND_COLORS } from "@/lib/business-branding";

export function PlatformAccessScreen({
  redirectTo = "/dashboard",
}: {
  redirectTo?: string;
}) {
  return (
    <div
      data-business-theme="platform"
      style={getBrandThemeVariables(PLATFORM_BRAND_COLORS)}
      className="flex min-h-dvh min-w-0 items-center justify-center overflow-x-hidden bg-background px-5 py-10"
    >
      <main className="w-full max-w-sm">
        <header className="mb-9 text-center">
          <p className="font-heading text-xl font-extrabold tracking-[-0.025em] text-foreground">
            Rincón 404 Food Park
          </p>
        </header>
        <section aria-labelledby="login-title">
          <h1
            id="login-title"
            className="mb-7 text-center font-heading text-2xl font-bold tracking-[-0.025em] text-foreground sm:text-3xl"
          >
            Iniciar sesión
          </h1>
          <LoginForm redirectTo={redirectTo} />
        </section>
      </main>
    </div>
  );
}
