const MAX_DETAIL_LENGTH = 300;

function cleanDetail(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/(?:bearer|access[_ -]?token|api[_ -]?key|secret)\s*[:=]?\s*[^\s,;]+/gi, "[dato sensible oculto]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DETAIL_LENGTH);
}

export function safeErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return cleanDetail(error.message) || "Error desconocido";
  }
  if (!error || typeof error !== "object") return "Error desconocido";

  const candidate = error as { code?: unknown; message?: unknown };
  const code = cleanDetail(candidate.code);
  const message = cleanDetail(candidate.message);
  if (code && message) return `${code}: ${message}`.slice(0, MAX_DETAIL_LENGTH);
  return message || code || "Error desconocido";
}
