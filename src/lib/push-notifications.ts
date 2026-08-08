import { createClient } from "@/lib/supabase/client";

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
  | "enabled";

const DEVICE_ALERTS_KEY = "mideli.device-alerts-enabled";

function setDeviceAlertsEnabled(enabled: boolean) {
  window.localStorage.setItem(DEVICE_ALERTS_KEY, enabled ? "true" : "false");
}

export function areDeviceAlertsEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(DEVICE_ALERTS_KEY) !== "false";
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

export async function getPushStatus(): Promise<PushStatus> {
  if (!supportsWebPush()) return "unsupported";
  if (!areDeviceAlertsEnabled()) return "paused";
  if (process.env.NODE_ENV === "development") return "production_required";
  if (isAppleMobile() && !isStandaloneApp()) return "install_required";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "available";

  const { data, error } = await createClient()
    .from("push_subscriptions")
    .select("is_active")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (error) return "enabled";
  if (!data) return "available";
  return data?.is_active === false ? "paused" : "enabled";
}

export async function enablePushNotifications(): Promise<PushStatus> {
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
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.keys.p256dh,
    p_auth_key: serialized.keys.auth,
    p_device_label: getDeviceLabel(),
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);

  setDeviceAlertsEnabled(true);

  return "enabled";
}

export async function pausePushNotifications(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";

  setDeviceAlertsEnabled(false);
  if (!supportsWebPush() || process.env.NODE_ENV === "development") return "paused";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "paused";

  const { error } = await createClient()
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("endpoint", subscription.endpoint);

  if (error) {
    setDeviceAlertsEnabled(true);
    throw new Error(error.message);
  }

  return "paused";
}
