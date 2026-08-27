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

export type MetaLocationMessage = {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type MetaReplyButtonsMessage = {
  to: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
};

export type MetaListMessage = {
  to: string;
  body: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
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

async function sendMetaMessage(
  toValue: string,
  payload: Record<string, unknown>,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  const to = normalizeMetaRecipient(toValue);
  if (!to) throw new Error("Falta el destinatario de WhatsApp");
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
      ...payload,
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

export async function sendMetaTextMessage(
  message: MetaTextMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  const body = message.body.trim();
  if (!body) throw new Error("El mensaje de WhatsApp está vacío");
  if (body.length > 4096) throw new Error("El mensaje de WhatsApp es demasiado largo");
  return sendMetaMessage(
    message.to,
    { type: "text", text: { preview_url: false, body } },
    config,
    fetcher
  );
}

export async function sendMetaLocationMessage(
  message: MetaLocationMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  if (
    !Number.isFinite(message.latitude) ||
    !Number.isFinite(message.longitude) ||
    message.latitude < -90 ||
    message.latitude > 90 ||
    message.longitude < -180 ||
    message.longitude > 180
  ) {
    throw new Error("La ubicación de WhatsApp no es válida");
  }
  const name = message.name?.trim().slice(0, 1000);
  const address = message.address?.trim().slice(0, 1000);
  return sendMetaMessage(
    message.to,
    {
      type: "location",
      location: {
        latitude: message.latitude,
        longitude: message.longitude,
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
      },
    },
    config,
    fetcher
  );
}

export async function sendMetaReplyButtonsMessage(
  message: MetaReplyButtonsMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  const body = message.body.trim();
  if (!body) throw new Error("El mensaje de WhatsApp está vacío");
  if (body.length > 1024) throw new Error("El mensaje interactivo de WhatsApp es demasiado largo");
  if (message.buttons.length < 1 || message.buttons.length > 3) {
    throw new Error("WhatsApp admite entre uno y tres botones de respuesta");
  }
  const buttons = message.buttons.map((button) => {
    const id = button.id.trim().slice(0, 256);
    const title = button.title.trim().slice(0, 20);
    if (!id || !title) throw new Error("Los botones de WhatsApp necesitan identificador y texto");
    return { type: "reply", reply: { id, title } };
  });
  return sendMetaMessage(
    message.to,
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons },
      },
    },
    config,
    fetcher
  );
}

export async function sendMetaListMessage(
  message: MetaListMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch
) {
  const body = message.body.trim();
  const button = message.buttonText.trim().slice(0, 20);
  if (!body) throw new Error("El mensaje de WhatsApp está vacío");
  if (body.length > 1024) throw new Error("El mensaje interactivo de WhatsApp es demasiado largo");
  if (!button) throw new Error("La lista de WhatsApp necesita texto de apertura");
  if (message.sections.length < 1 || message.sections.length > 10) {
    throw new Error("La lista de WhatsApp necesita entre una y diez secciones");
  }

  let rowCount = 0;
  const sections = message.sections.map((section) => {
    if (section.rows.length < 1) {
      throw new Error("Cada sección de WhatsApp necesita al menos una opción");
    }
    const rows = section.rows.map((row) => {
      rowCount += 1;
      const id = row.id.trim().slice(0, 200);
      const title = row.title.trim().slice(0, 24);
      const description = row.description?.trim().slice(0, 72);
      if (!id || !title) {
        throw new Error("Las opciones de WhatsApp necesitan identificador y texto");
      }
      return {
        id,
        title,
        ...(description ? { description } : {}),
      };
    });
    const title = section.title?.trim().slice(0, 24);
    return { ...(title ? { title } : {}), rows };
  });
  if (rowCount > 10) throw new Error("WhatsApp admite hasta diez opciones por lista");

  return sendMetaMessage(
    message.to,
    {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button, sections },
      },
    },
    config,
    fetcher
  );
}
