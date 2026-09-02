import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type NotificationEvent = "new_order" | "ready";
type NotificationTopic = "kitchen" | "ready";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type PushError = Error & { statusCode?: number };

const NEW_ORDER_ROLES = new Set(["owner", "admin", "waiter", "supervisor"]);
const READY_ORDER_ROLES = new Set(["owner", "admin", "kitchen", "supervisor"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function locationLabel(order: {
  type: string;
  table_zone_name: string | null;
  table_number: string | null;
  customer_name: string | null;
}) {
  if (order.type === "domicilio") {
    return order.customer_name
      ? `Domicilio · ${order.customer_name}`
      : "Pedido a domicilio";
  }
  if (order.type === "para_llevar") {
    return order.customer_name
      ? `Para llevar · ${order.customer_name}`
      : "Pedido para llevar";
  }

  const table = order.table_number?.trim();
  const tableLabel = table
    ? /^mesa\b/i.test(table)
      ? table
      : `Mesa ${table}`
    : "Mesa sin asignar";
  return [order.table_zone_name?.trim(), tableLabel].filter(Boolean).join(" · ");
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
  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  const subject = Deno.env.get("WEB_PUSH_SUBJECT") ?? supabaseUrl;
  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    console.error("El servicio de avisos no está configurado");
    return json({ error: "Servicio no configurado" }, 503);
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Solicitud no autorizada" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const isInternalRequest = token === serviceRoleKey;
  let userId: string | null = null;
  if (!isInternalRequest) {
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) {
      return json({ error: "Sesión no válida" }, 401);
    }
    userId = user.id;
  }

  const { orderId, event } = (await req.json().catch(() => ({}))) as {
    orderId?: string;
    event?: NotificationEvent;
  };
  if (!orderId || (event !== "new_order" && event !== "ready")) {
    return json({ error: "Evento de pedido incompleto" }, 400);
  }

  const [{ data: caller }, { data: order, error: orderError }] = await Promise.all([
    userId
      ? admin
          .from("profiles")
          .select("role,is_active")
          .eq("id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("orders")
      .select(
        "id,number,status,type,table_zone_name,table_number,customer_name,created_by,created_at,updated_at"
      )
      .eq("id", orderId)
      .maybeSingle(),
  ]);

  const allowedRoles = event === "new_order" ? NEW_ORDER_ROLES : READY_ORDER_ROLES;
  if (userId && (!caller?.is_active || !allowedRoles.has(caller.role))) {
    return json({ error: "No tienes permiso para enviar este aviso" }, 403);
  }
  if (orderError || !order) {
    return json({ error: "Pedido no encontrado" }, 404);
  }
  if (event === "new_order" && caller?.role === "waiter" && order.created_by !== userId) {
    return json({ error: "No puedes publicar otro pedido" }, 403);
  }
  if (event === "ready" && order.status !== "ready") {
    return json({ error: "El pedido no está listo" }, 409);
  }

  const topic: NotificationTopic = event === "new_order" ? "kitchen" : "ready";
  let transitionLogId: string | null = null;
  let eventKey = `${topic}:${order.id}`;

  if (event === "ready") {
    const { data: transition, error: transitionError } = await admin
      .from("order_status_log")
      .select("id")
      .eq("order_id", order.id)
      .eq("to_status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (transitionError || !transition) {
      return json({ error: "No se encontró la transición del pedido" }, 409);
    }
    transitionLogId = transition.id;
    eventKey = `${topic}:${transition.id}`;
  }

  const { data: eventId, error: claimError } = await admin.rpc(
    "claim_push_notification_event",
    {
      p_event_key: eventKey,
      p_order_id: order.id,
      p_topic: topic,
      p_transition_log_id: transitionLogId,
    }
  );
  if (claimError) {
    console.error("No se pudo reclamar el evento Push", claimError);
    return json({ error: "No se pudo preparar el aviso" }, 500);
  }
  if (!eventId) {
    return json({ sent: 0, duplicate: true });
  }

  const completeEvent = async (
    status: "sent" | "skipped" | "failed",
    counts: { sent?: number; failed?: number; expired?: number } = {},
    errorMessage = ""
  ) => {
    const { error: completionError } = await admin
      .from("push_notification_events")
      .update({
        status,
        sent_count: counts.sent ?? 0,
        failed_count: counts.failed ?? 0,
        expired_count: counts.expired ?? 0,
        error_message: errorMessage.slice(0, 500),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (completionError) {
      console.error("No se pudo cerrar el evento Push", completionError);
    }
  };

  const { data: activeProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  if (profilesError) {
    await completeEvent("failed", {}, profilesError.message);
    return json({ error: "No se pudieron preparar los destinatarios" }, 500);
  }

  const activeProfileIds = (activeProfiles ?? []).map((profile) => profile.id);
  if (activeProfileIds.length === 0) {
    await completeEvent("skipped");
    return json({ sent: 0, reason: "Sin perfiles activos" });
  }

  const topicColumn = topic === "kitchen" ? "kitchen_alerts" : "ready_alerts";
  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .in("user_id", activeProfileIds)
    .eq("is_active", true)
    .eq(topicColumn, true);
  if (subscriptionsError) {
    await completeEvent("failed", {}, subscriptionsError.message);
    return json({ error: "No se pudieron preparar los dispositivos" }, 500);
  }

  const activeSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];
  if (activeSubscriptions.length === 0) {
    await completeEvent("skipped");
    return json({ sent: 0, reason: "Sin dispositivos activos" });
  }

  const { data: orderItems } = await admin
    .from("order_items")
    .select("quantity")
    .eq("order_id", order.id);
  const itemCount = (orderItems ?? []).reduce(
    (total, item) => total + Number(item.quantity ?? 0),
    0
  );
  const destination = locationLabel(order);
  const itemSummary = `${itemCount} artículo${itemCount === 1 ? "" : "s"}`;
  const title =
    topic === "kitchen"
      ? `Nuevo pedido #${order.number}`
      : `Pedido #${order.number} listo`;
  const body =
    topic === "kitchen"
      ? `${destination} · ${itemSummary}`
      : `${destination}. Toca para entregarlo.`;
  const url =
    topic === "kitchen"
      ? `/dashboard/cocina?order=${order.id}`
      : `/dashboard/mesero?mode=status&order=${order.id}`;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title,
    body,
    topic,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `mideli-${topic}-${eventKey}`,
    data: {
      url,
      orderId: order.id,
      eventId,
      topic,
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
          { TTL: topic === "kitchen" ? 30 * 60 : 60 * 60, urgency: "high" }
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
    const { error: expirationError } = await admin
      .from("push_subscriptions")
      .update({
        is_active: false,
        ready_alerts: false,
        kitchen_alerts: false,
        updated_at: new Date().toISOString(),
      })
      .in("id", expiredIds);
    if (expirationError) {
      console.error("No se pudieron desactivar endpoints vencidos", expirationError);
    }
  }

  const finalStatus = sent > 0 ? "sent" : failed > 0 ? "failed" : "skipped";
  await completeEvent(
    finalStatus,
    { sent, failed, expired: expiredIds.length },
    failed > 0 ? "Uno o más dispositivos rechazaron el aviso" : ""
  );

  return json({ sent, failed, expired: expiredIds.length });
});
