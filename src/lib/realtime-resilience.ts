export const ACTIVE_ORDERS_TIMEOUT_MS = 12_000;

/** Sondeo de respaldo mientras el canal en vivo funciona: solo cubre eventos perdidos. */
export const ACTIVE_ORDERS_POLL_HEALTHY_MS = 60_000;
/** Sondeo cuando el canal en vivo está caído o reconectando. */
export const ACTIVE_ORDERS_POLL_DEGRADED_MS = 15_000;

export function getActiveOrdersPollInterval(realtimeHealthy: boolean) {
  return realtimeHealthy
    ? ACTIVE_ORDERS_POLL_HEALTHY_MS
    : ACTIVE_ORDERS_POLL_DEGRADED_MS;
}

export function getRealtimeReconnectDelay(attempt: number) {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(1_500 * 2 ** safeAttempt, 30_000);
}

export function createRequestDeadline(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("La consulta tardó demasiado"));
  }, Math.max(1, timeoutMs));

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}
