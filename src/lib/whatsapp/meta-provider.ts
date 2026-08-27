import { normalizePhone } from "./normalize";

export type MetaProviderConfig = {
  graphApiVersion: string;
  phoneNumberId: string;
  accessToken: string;
};

export type MetaTextMessage = {
  to: string;
  body: string;
};

function metaErrorInfo(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { detail: "", isTransient: false };
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return { detail: "", isTransient: false };
  }
  const value = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof value.code === "number") parts.push(`código ${value.code}`);
  if (typeof value.error_subcode === "number") {
    parts.push(`subcódigo ${value.error_subcode}`);
  }
  if (typeof value.type === "string" && /^[A-Za-z]+$/.test(value.type)) {
    parts.push(`tipo ${value.type}`);
  }
  if (typeof value.is_transient === "boolean") {
    parts.push(value.is_transient ? "transitorio" : "no transitorio");
  }
  return {
    detail: parts.length > 0 ? ` (${parts.join(", ")})` : "",
    isTransient: value.is_transient === true,
  };
}

function normalizeMetaRecipient(value: string) {
  const phone = normalizePhone(value);
  return /^521\d{10}$/.test(phone) ? `52${phone.slice(3)}` : phone;
}

export async function sendMetaTextMessage(
  message: MetaTextMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  const to = normalizeMetaRecipient(message.to);
  const body = message.body.trim();
  if (!to) throw new Error("Falta el destinatario de WhatsApp");
  if (!body) throw new Error("El mensaje de WhatsApp está vacío");
  if (body.length > 4096) throw new Error("El mensaje de WhatsApp es demasiado largo");
  if (!config.graphApiVersion || !config.phoneNumberId || !config.accessToken) {
    throw new Error("Falta la configuración privada de Meta");
  }

  const requestUrl = `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const requestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  } satisfies RequestInit;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(requestUrl, {
        ...requestInit,
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) {
        const payload = (await response.json()) as { messages?: Array<{ id?: string }> };
        const messageId = payload.messages?.[0]?.id;
        if (!messageId) throw new Error("Meta no devolvió el identificador del mensaje");
        return { messageId };
      }

      const payload = await response.json().catch(() => null);
      const errorInfo = metaErrorInfo(payload);
      const retryable = response.status === 429 || response.status >= 500 || errorInfo.isTransient;
      if (!retryable || attempt === 2) {
        throw new Error(
          `Meta rechazó el mensaje con estado ${response.status}${errorInfo.detail}`
        );
      }
    } catch (error) {
      if (attempt === 2) throw error;
      if (
        error instanceof Error &&
        error.message.startsWith("Meta rechazó el mensaje con estado")
      ) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }

  throw new Error("No se pudo enviar el mensaje a Meta");
}
