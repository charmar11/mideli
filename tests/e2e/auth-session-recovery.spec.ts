import { expect, test } from "@playwright/test";
import { resolveAuthSessionGuard } from "../../src/lib/auth-session-guard";
import { SUPABASE_SESSION_COOKIE_OPTIONS } from "../../src/lib/supabase/cookie-options";

test("una cookie de sesión permite intentar recuperación antes de mandar al login", () => {
  expect(
    resolveAuthSessionGuard({
      hasSessionCookie: true,
      hasUser: false,
      isProtectedRoute: true,
      isRecoveryRoute: false,
    }),
  ).toBe("recover");
});

test("la pantalla de recuperación no expulsa una sesión que todavía puede renovarse", () => {
  expect(
    resolveAuthSessionGuard({
      hasSessionCookie: true,
      hasUser: false,
      isProtectedRoute: false,
      isRecoveryRoute: true,
    }),
  ).toBe("recover");
});

test("sin cookie válida se conserva el regreso al login", () => {
  for (const route of [
    { isProtectedRoute: true, isRecoveryRoute: false },
    { isProtectedRoute: false, isRecoveryRoute: true },
  ]) {
    expect(
      resolveAuthSessionGuard({
        hasSessionCookie: false,
        hasUser: false,
        ...route,
      }),
    ).toBe("login");
  }
});

test("rutas públicas no requieren sesión y los usuarios verificados continúan", () => {
  expect(
    resolveAuthSessionGuard({
      hasSessionCookie: false,
      hasUser: false,
      isProtectedRoute: false,
      isRecoveryRoute: false,
    }),
  ).toBe("continue");

  expect(
    resolveAuthSessionGuard({
      hasSessionCookie: true,
      hasUser: true,
      isProtectedRoute: true,
      isRecoveryRoute: false,
    }),
  ).toBe("continue");
});

test("las cookies de sesión sobreviven al cierre normal del navegador", () => {
  expect(SUPABASE_SESSION_COOKIE_OPTIONS).toMatchObject({
    path: "/",
    sameSite: "lax",
    maxAge: 400 * 24 * 60 * 60,
  });
});
