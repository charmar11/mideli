import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type PushError = Error & { statusCode?: number };

const ALLOWED_ROLES = new Set(["owner", "admin", "kitchen", "supervisor"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Servicio no configurado" }, 503);
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Sesión no válida" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);
  if (userError || !user) {
    return json({ error: "Sesión no válida" }, 401);
  }

  const { orderId } = (await req.json().catch(() => ({}))) as {
    orderId?: string;
  };
  if (!orderId) {
    return json({ error: "Falta el pedido" }, 400);
  }

  const [{ data: caller }, { data: order, error: orderError }] = await Promise.all([
    admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("orders")
      .select("id,number,status,type,table_number,created_by,updated_at")
      .eq("id", orderId)
      .maybeSingle(),
  ]);

  if (!caller?.is_active || !ALLOWED_ROLES.has(caller.role)) {
    return json({ error: "No tienes permiso para enviar avisos" }, 403);
  }
  if (orderError || !order || order.status !== "ready") {
    return json({ error: "El pedido no está listo" }, 409);
  }
  if (!order.created_by) {
    return json({ sent: 0, reason: "Pedido sin responsable" });
  }

  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  const subject = Deno.env.get("WEB_PUSH_SUBJECT") ?? supabaseUrl;
  if (!publicKey || !privateKey || !subject) {
    console.error("Web Push no está configurado");
    return json({ error: "Avisos no configurados" }, 503);
  }

  const targetUserIds = new Set<string>([order.created_by]);
  const { data: creatorProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", order.created_by)
    .maybeSingle();

  if (creatorProfile?.role === "owner" || creatorProfile?.role === "admin") {
    const { data: floorProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("role", ["waiter", "supervisor"]);
    for (const profile of floorProfiles ?? []) targetUserIds.add(profile.id);
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .in("user_id", [...targetUserIds])
    .eq("is_active", true)
    .eq("ready_alerts", true);

  if (subscriptionsError) {
    console.error("No se pudieron leer suscripciones", subscriptionsError);
    return json({ error: "No se pudieron preparar los avisos" }, 500);
  }

  const activeSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];
  if (activeSubscriptions.length === 0) {
    return json({ sent: 0, reason: "Sin dispositivos activos" });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const destination = order.table_number
    ? `Mesa ${order.table_number}`
    : order.type === "domicilio"
      ? "Pedido a domicilio"
      : "Pedido para llevar";
  const payload = JSON.stringify({
    title: `Pedido #${order.number} listo`,
    body: `${destination}. Toca para entregarlo.`,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `mideli-ready-${order.id}-${order.updated_at}`,
    data: {
      url: `/dashboard/mesero?mode=status&order=${order.id}`,
      orderId: order.id,
    },
  });

  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    activeSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth_key,
            },
          },
          payload,
          { TTL: 60 * 60, urgency: "high" }
        );
        sent += 1;
      } catch (error) {
        const pushError = error as PushError;
        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          expiredIds.push(subscription.id);
          return;
        }
        failed += 1;
        console.error("Falló un aviso Web Push", pushError.message);
      }
    })
  );

  if (expiredIds.length > 0) {
    await admin
      .from("push_subscriptions")
      .update({
        is_active: false,
        ready_alerts: false,
        kitchen_alerts: false,
        updated_at: new Date().toISOString(),
      })
      .in("id", expiredIds);
  }

  return json({ sent, failed, expired: expiredIds.length });
});
