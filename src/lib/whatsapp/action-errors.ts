const SAFE_DATABASE_MESSAGES = [
  "No se puede eliminar este cliente",
  "Solo el propietario o un administrador puede eliminar clientes",
  "El cliente ya no existe",
  "Esta operación solo está disponible para el servidor",
];

type ErrorRecord = {
  code?: unknown;
  message?: unknown;
};

export function whatsappActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;

  if (!error || typeof error !== "object" || Array.isArray(error)) return fallback;

  const record = error as ErrorRecord;
  const errorMessage = typeof record.message === "string" ? record.message.trim() : "";
  if (errorMessage && SAFE_DATABASE_MESSAGES.some((prefix) => errorMessage.startsWith(prefix))) {
    return errorMessage;
  }

  if (record.code === "PGRST202") {
    return "La operación de clientes todavía no está disponible en el servidor. Recarga la página e inténtalo de nuevo.";
  }

  if (record.code === "42501") {
    return "No tienes permisos para eliminar clientes.";
  }

  return fallback;
}
