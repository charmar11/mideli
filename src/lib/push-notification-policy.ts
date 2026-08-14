export type PushTopic = "ready" | "kitchen";

export type PushClientSnapshot = {
  url: string;
  visibilityState?: string;
};

const TOPIC_COLUMNS: Record<PushTopic, "ready_alerts" | "kitchen_alerts"> = {
  ready: "ready_alerts",
  kitchen: "kitchen_alerts",
};

const TOPIC_PATHS: Record<PushTopic, string> = {
  ready: "/dashboard/mesero",
  kitchen: "/dashboard/cocina",
};

export function getPushTopicColumn(topic: PushTopic) {
  return TOPIC_COLUMNS[topic];
}

export function shouldSuppressPushBanner(
  topic: PushTopic,
  clients: PushClientSnapshot[]
) {
  const responsiblePath = TOPIC_PATHS[topic];

  return clients.some((client) => {
    if (client.visibilityState !== "visible") return false;
    try {
      return new URL(client.url).pathname === responsiblePath;
    } catch {
      return false;
    }
  });
}
