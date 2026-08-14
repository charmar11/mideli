import { createClient } from "@/lib/supabase/client";
import {
  getPushTopicColumn,
  type PushTopic,
} from "@/lib/push-notification-policy";

export type { PushTopic } from "@/lib/push-notification-policy";

export const WEB_PUSH_PUBLIC_KEY =
  "BIrydbbaDd7Es00U3lE3LvS3Za693T5fVBtzR3GpY34-SN0T64sH9vX_c2RtahyropfXtuypFIwNCVxgH4O6AvM";

export type PushStatus =
  | "checking"
  | "unsupported"
  | "install_required"
  | "denied"
  | "available"
  | "paused"
  | "production_required"
  | "error"
  | "enabled";

const LEGACY_DEVICE_ALERTS_KEY = "mideli.device-alerts-enabled";

function getDeviceAlertsKey(topic: PushTopic) {
  return `mideli.device-alerts-${topic}`;
}

function setDeviceAlertsEnabled(topic: PushTopic, enabled: boolean) {
  window.localStorage.setItem(
    getDeviceAlertsKey(topic),
    enabled ? "true" : "false"
  );
}

export function areDeviceAlertsEnabled(topic: PushTopic = "ready") {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(getDeviceAlertsKey(topic));
  if (stored !== null) return stored === "true";
  if (topic === "ready") {
    return window.localStorage.getItem(LEGACY_DEVICE_ALERTS_KEY) !== "false";
  }
  return false;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function getDeviceLabel() {
  if (/Mobile|Tablet|iPad|iPhone|iPod|Android/.test(navigator.userAgent)) {
    return "Dispositivo móvil";
  }
  return "Computadora";
}

function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushStatus(topic: PushTopic): Promise<PushStatus> {
  if (!supportsWebPush()) return "unsupported";
  if (process.env.NODE_ENV === "development") return "production_required";
  if (isAppleMobile() && !isStandaloneApp()) return "install_required";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "available";

  const { data, error } = await createClient()
    .from("push_subscriptions")
    .select("is_active,ready_alerts,kitchen_alerts")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return "available";
  const enabled = data.is_active && data[getPushTopicColumn(topic)] === true;
  setDeviceAlertsEnabled(topic, enabled);
  return enabled ? "enabled" : "paused";
}

export async function enablePushNotifications(
  topic: PushTopic
): Promise<PushStatus> {
  if (!supportsWebPush()) return "unsupported";
  if (process.env.NODE_ENV === "development") return "production_required";
  if (isAppleMobile() && !isStandaloneApp()) return "install_required";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "available";

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("El servicio de avisos no respondió")), 10000)
    ),
  ]);
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    }));

  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("El dispositivo devolvió una suscripción incompleta");
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_push_notification_topic", {
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.keys.p256dh,
    p_auth_key: serialized.keys.auth,
    p_topic: topic,
    p_enabled: true,
    p_device_label: getDeviceLabel(),
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved || saved[getPushTopicColumn(topic)] !== true) {
    throw new Error("El servidor no confirmó la activación del aviso");
  }

  setDeviceAlertsEnabled(topic, true);

  return "enabled";
}

export async function pausePushNotifications(
  topic: PushTopic
): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";

  if (!supportsWebPush() || process.env.NODE_ENV === "development") {
    setDeviceAlertsEnabled(topic, false);
    return "paused";
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    setDeviceAlertsEnabled(topic, false);
    return "paused";
  }

  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("El dispositivo devolvió una suscripción incompleta");
  }

  const { data, error } = await createClient().rpc("set_push_notification_topic", {
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.keys.p256dh,
    p_auth_key: serialized.keys.auth,
    p_topic: topic,
    p_enabled: false,
    p_device_label: getDeviceLabel(),
    p_user_agent: navigator.userAgent,
  });

  if (error) {
    throw new Error(error.message);
  }
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved || saved[getPushTopicColumn(topic)] !== false) {
    throw new Error("El servidor no confirmó la pausa del aviso");
  }

  setDeviceAlertsEnabled(topic, false);
  return "paused";
}
