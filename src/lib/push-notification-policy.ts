export type PushTopic = "ready" | "kitchen";

export type PushClientSnapshot = {
  url: string;
  visibilityState?: string;
};

const TOPIC_COLUMNS: Record<PushTopic, "ready_alerts" | "kitchen_alerts"> = {
  ready: "ready_alerts",
  kitchen: "kitchen_alerts",
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
