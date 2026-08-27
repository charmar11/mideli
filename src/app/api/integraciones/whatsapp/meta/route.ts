import { readWhatsappServerConfig } from "@/lib/whatsapp/config.server";
import { processMetaWebhook } from "@/lib/whatsapp/meta-runtime.server";
import { normalizeMetaWebhook } from "@/lib/whatsapp/meta-webhook";
import { safeEqualSecret, verifyMetaSignature } from "@/lib/whatsapp/meta-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = readWhatsappServerConfig();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode !== "subscribe" ||
    !challenge ||
    !safeEqualSecret(verifyToken, config.verifyToken)
  ) {
    return new Response("Verificación rechazada", { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const config = readWhatsappServerConfig();
  console.info("[WhatsApp Meta] Webhook recibido.");
  if (!config.ordersEnabled || config.provider !== "meta") {
    console.warn("[WhatsApp Meta] Integración desactivada.");
    return Response.json({ ok: false, reason: "integration_disabled" }, { status: 503 });
  }
  if (!config.appSecret) {
    console.warn("[WhatsApp Meta] Falta la configuración privada.");
    return Response.json({ ok: false, reason: "configuration_missing" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      config.appSecret
    )
  ) {
    console.warn("[WhatsApp Meta] Firma rechazada.");
    return Response.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const normalized = normalizeMetaWebhook(payload);
  const acceptedMessages =
    !config.dryRun && config.allowedPhones.size === 0
      ? normalized.messages
      : normalized.messages.filter((message) => config.allowedPhones.has(message.phone));
  console.info(
    `[WhatsApp Meta] Evento válido. Mensajes=${normalized.messages.length}, permitidos=${acceptedMessages.length}, estados=${normalized.statuses.length}.`
  );

  const startedAt = Date.now();
  const processing = await processMetaWebhook(
    { messages: acceptedMessages, statuses: normalized.statuses },
    config
  );
  const durationMs = Date.now() - startedAt;
  console.info(
    `[WhatsApp Meta] Procesamiento terminado en ${durationMs}ms. Procesados=${processing.processed}, duplicados=${processing.duplicates}, respuestas=${processing.repliesSent}, fallos_envío=${processing.replyFailures}, fallos_proceso=${processing.processingFailures}.`
  );

  if (processing.processingFailures > 0) {
    return Response.json(
      { ok: false, reason: "processing_failed", durationMs },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    dryRun: config.dryRun,
    acceptedMessages: acceptedMessages.length,
    receivedStatuses: normalized.statuses.length,
    processedMessages: processing.processed,
    durationMs,
  });
}
