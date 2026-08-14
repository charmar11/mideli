export const ACTIVE_ORDERS_TIMEOUT_MS = 12_000;

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
