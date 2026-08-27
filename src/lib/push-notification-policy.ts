export type PushTopic = "ready" | "kitchen" | "whatsapp_attention";

export type PushClientSnapshot = {
  url: string;
  visibilityState?: string;
};

const TOPIC_COLUMNS: Record<
  PushTopic,
  "ready_alerts" | "kitchen_alerts" | "whatsapp_attention_alerts"
> = {
  ready: "ready_alerts",
  kitchen: "kitchen_alerts",
  whatsapp_attention: "whatsapp_attention_alerts",
};

export function getPushTopicColumn(topic: PushTopic) {
  return TOPIC_COLUMNS[topic];
}

export function shouldSuppressPushBanner(
  topic: PushTopic,
  clients: PushClientSnapshot[]
) {
  void topic;
  void clients;
  // A visible POS or Kitchen view is not a reliable replacement for Push:
  // Realtime can be reconnecting and mobile browsers may suspend the page.
  return false;
}
