import { normalizePhone } from "./normalize";

export type NormalizedMetaMessage = {
  id: string;
  phone: string;
  phoneNumberId: string;
  timestamp: string;
  type: "text" | "location" | "unsupported";
  text: string;
  location: { latitude: number; longitude: number } | null;
};

export type NormalizedMetaStatus = {
  messageId: string;
  phone: string;
  status: string;
  timestamp: string;
};

export type NormalizedMetaWebhook = {
  messages: NormalizedMetaMessage[];
  statuses: NormalizedMetaStatus[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function messageText(message: Record<string, unknown>) {
  if (message.type === "text") {
    return stringValue(record(message.text)?.body);
  }
  if (message.type === "button") {
    return stringValue(record(message.button)?.text);
  }
  if (message.type === "interactive") {
    const interactive = record(message.interactive);
    return (
      stringValue(record(interactive?.button_reply)?.title) ||
      stringValue(record(interactive?.list_reply)?.title)
    );
  }
  return "";
}

function normalizeMessage(
  message: Record<string, unknown>,
  phoneNumberId: string
): NormalizedMetaMessage | null {
  const id = stringValue(message.id);
  const phone = normalizePhone(stringValue(message.from));
  if (!id || !phone) return null;

  const location = record(message.location);
  const latitude = typeof location?.latitude === "number" ? location.latitude : null;
  const longitude = typeof location?.longitude === "number" ? location.longitude : null;
  const hasLocation = latitude !== null && longitude !== null;
  const text = messageText(message);

  return {
    id,
    phone,
    phoneNumberId,
    timestamp: stringValue(message.timestamp),
    type: text ? "text" : hasLocation ? "location" : "unsupported",
    text,
    location: hasLocation ? { latitude, longitude } : null,
  };
}

function normalizeStatus(status: Record<string, unknown>): NormalizedMetaStatus | null {
  const messageId = stringValue(status.id);
  const phone = normalizePhone(stringValue(status.recipient_id));
  const statusName = stringValue(status.status);
  if (!messageId || !phone || !statusName) return null;
  return {
    messageId,
    phone,
    status: statusName,
    timestamp: stringValue(status.timestamp),
  };
}

export function normalizeMetaWebhook(payload: unknown): NormalizedMetaWebhook {
  const messages: NormalizedMetaMessage[] = [];
  const statuses: NormalizedMetaStatus[] = [];
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return { messages, statuses };

  for (const entry of records(root.entry)) {
    for (const change of records(entry.changes)) {
      if (change.field !== "messages") continue;
      const value = record(change.value);
      const phoneNumberId = stringValue(record(value?.metadata)?.phone_number_id);
      for (const message of records(value?.messages)) {
        const normalized = normalizeMessage(message, phoneNumberId);
        if (normalized) messages.push(normalized);
      }
      for (const status of records(value?.statuses)) {
        const normalized = normalizeStatus(status);
        if (normalized) statuses.push(normalized);
      }
    }
  }

  return { messages, statuses };
}
