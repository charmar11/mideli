export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const MAX_GEMINI_ACTIONS = 16;
export const MAX_GEMINI_QUANTITY = 20;
export const MAX_GEMINI_OPTION_IDS = 12;

export type GeminiFailureReason =
  | "auth"
  | "quota"
  | "timeout"
  | "model_unavailable"
  | "invalid_request"
  | "invalid_response"
  | "provider_error";

function providerErrorReasons(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return [];
  const record = error as { status?: unknown; details?: unknown };
  const reasons = typeof record.status === "string" ? [record.status] : [];
  if (!Array.isArray(record.details)) return reasons;
  for (const detail of record.details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
    const reason = (detail as { reason?: unknown }).reason;
    if (typeof reason === "string") reasons.push(reason);
  }
  return reasons;
}

export function classifyGeminiHttpFailure(
  status: number,
  payload: unknown
): GeminiFailureReason {
  const reasons = providerErrorReasons(payload);
  if (
    status === 401 ||
    status === 403 ||
    reasons.some((reason) =>
      ["API_KEY_INVALID", "UNAUTHENTICATED", "PERMISSION_DENIED"].includes(reason)
    )
  ) {
    return "auth";
  }
  if (status === 429 || reasons.includes("RESOURCE_EXHAUSTED")) return "quota";
  if (status === 404 || reasons.includes("NOT_FOUND")) return "model_unavailable";
  if (status === 408 || status === 504 || reasons.includes("DEADLINE_EXCEEDED")) {
    return "timeout";
  }
  if (status === 400 || reasons.includes("INVALID_ARGUMENT")) return "invalid_request";
  return "provider_error";
}

export function geminiFailureCode(reason: GeminiFailureReason) {
  return `gemini_${reason}`;
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

export function geminiRetryDelayMs(input: {
  status: number;
  retryAfter: string | null;
}) {
  const retryable =
    input.status === 408 || input.status === 429 || input.status >= 500;
  if (!retryable) return null;
  const requestedDelay = retryAfterMilliseconds(input.retryAfter);
  if (requestedDelay === null) return 350;
  return requestedDelay <= 1_000 ? Math.max(350, requestedDelay) : null;
}
