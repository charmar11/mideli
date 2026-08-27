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

const ALLOWED_ROLES = ["owner", "admin", "supervisor", "waiter"];
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  const subject = Deno.env.get("WEB_PUSH_SUBJECT") ?? supabaseUrl;
  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    return json({ error: "Servicio no configurado" }, 503);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== serviceRoleKey) {
    return json({ error: "Solicitud no autorizada" }, 401);
  }

  const { conversationId, eventKey } = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    eventKey?: string;
  };
  if (!conversationId || !eventKey) {
    return json({ error: "Evento de atención incompleto" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: eventId, error: claimError } = await admin.rpc(
    "claim_whatsapp_attention_push_event",
    {
      p_conversation_id: conversationId,
      p_event_key: eventKey,
    }
  );
  if (claimError) {
    console.error("No se pudo reclamar el aviso de atención", claimError);
    return json({ error: "No se pudo preparar el aviso" }, 500);
  }
  if (!eventId) return json({ sent: 0, duplicate: true });

  const complete = async (
    status: "sent" | "skipped" | "failed",
    counts: { sent?: number; failed?: number; expired?: number } = {},
    errorMessage = ""
  ) => {
    const { error } = await admin
      .from("whatsapp_attention_push_events")
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
    if (error) console.error("No se pudo cerrar el aviso de atención", error);
  };

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", ALLOWED_ROLES);
  if (profilesError) {
    await complete("failed", {}, profilesError.message);
    return json({ error: "No se pudieron preparar los destinatarios" }, 500);
  }

  const profileIds = (profiles ?? []).map((profile) => profile.id);
  if (profileIds.length === 0) {
    await complete("skipped");
    return json({ sent: 0, reason: "Sin perfiles activos" });
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .in("user_id", profileIds)
    .eq("is_active", true)
    .eq("whatsapp_attention_alerts", true);
  if (subscriptionsError) {
    await complete("failed", {}, subscriptionsError.message);
    return json({ error: "No se pudieron preparar los dispositivos" }, 500);
  }

  const activeSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];
  if (activeSubscriptions.length === 0) {
    await complete("skipped");
    return json({ sent: 0, reason: "Sin dispositivos activos" });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: "WhatsApp necesita atención",
    body: "Un cliente está esperando respuesta. Toca para abrir la conversación.",
    topic: "whatsapp_attention",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `mideli-whatsapp-attention-${eventKey}`,
    data: {
      url: `/dashboard/whatsapp?conversation=${encodeURIComponent(conversationId)}`,
      conversationId,
      eventId,
      topic: "whatsapp_attention",
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
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          },
          payload,
          { TTL: 15 * 60, urgency: "high" }
        );
        sent += 1;
      } catch (error) {
        const pushError = error as PushError;
        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          expiredIds.push(subscription.id);
          return;
        }
        failed += 1;
        console.error("Falló un aviso de atención", pushError.message);
      }
    })
  );

  if (expiredIds.length > 0) {
    const { error } = await admin
      .from("push_subscriptions")
      .update({
        is_active: false,
        ready_alerts: false,
        kitchen_alerts: false,
        whatsapp_attention_alerts: false,
        updated_at: new Date().toISOString(),
      })
      .in("id", expiredIds);
    if (error) console.error("No se pudieron desactivar endpoints vencidos", error);
  }

  const finalStatus = sent > 0 ? "sent" : failed > 0 ? "failed" : "skipped";
  await complete(
    finalStatus,
    { sent, failed, expired: expiredIds.length },
    failed > 0 ? "Uno o más dispositivos rechazaron el aviso" : ""
  );

  return json({ sent, failed, expired: expiredIds.length });
});
