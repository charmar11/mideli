export type AuthSessionGuardDecision = "continue" | "recover" | "login";

export function resolveAuthSessionGuard(input: {
  hasSessionCookie: boolean;
  hasUser: boolean;
  isProtectedRoute: boolean;
  isRecoveryRoute: boolean;
}): AuthSessionGuardDecision {
  if (input.hasUser) return "continue";

  if (input.isRecoveryRoute || input.isProtectedRoute) {
    return input.hasSessionCookie ? "recover" : "login";
  }

  return "continue";
}
