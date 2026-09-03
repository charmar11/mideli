import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { serviceFunctionHeaders } from "@/lib/supabase/function-auth";
import { readWhatsappServerConfig } from "./config.server";
import {
  sendMetaReplyButtonsMessage,
  sendMetaTextMessage,
} from "./meta-provider";
import { recordOutboundMessage } from "./repository.server";
import { safeErrorDetail } from "./error-detail";

const INACTIVITY_MINUTES = 10;

function dueAt(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function notifyKitchen(orderId: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return false;
  const { error } = await createAdminClient().functions.invoke("send-order-notification", {
    body: { orderId, event: "new_order" },
    headers: serviceFunctionHeaders(serviceRoleKey),
  });
  if (error) {
    console.warn(`[WhatsApp Scheduler] No se pudo solicitar el aviso de Cocina: ${safeErrorDetail(error)}`);
    return false;
  }
  return true;
}

async function releaseScheduledOrders() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const due = await admin
    .from("orders")
    .select("id")
    .eq("source_channel", "whatsapp")
    .eq("status", "pending")
    .eq("schedule_status", "scheduled")
    .lte("kitchen_release_at", now)
    .is("kitchen_released_at", null)
    .limit(100);
  if (due.error) throw due.error;

  let released = 0;
  for (const order of due.data ?? []) {
    const claimed = await admin
      .from("orders")
      .update({ schedule_status: "released", kitchen_released_at: now, updated_at: now })
      .eq("id", order.id)
      .eq("status", "pending")
      .eq("schedule_status", "scheduled")
      .is("kitchen_released_at", null)
      .select("id")
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    released += 1;
    await notifyKitchen(order.id);
  }
  return released;
}

async function sendInactivityReminder(conversation: {
  id: string;
  external_contact_id: string;
}) {
  const config = readWhatsappServerConfig();
  if (config.provider !== "meta" || !config.accessToken || !config.phoneNumberId) return false;
  const providerConfig = {
    graphApiVersion: config.graphApiVersion,
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  };
  const sent = await sendMetaReplyButtonsMessage(
    {
      to: conversation.external_contact_id,
      body: "😊 ¿Quieres continuar con tu pedido? Tu carrito sigue guardado.",
      buttons: [
        { id: "inactivity:continue", title: "Sí, continuar" },
        { id: "inactivity:cancel", title: "Cancelar pedido" },
      ],
    },
    providerConfig
  );
  await recordOutboundMessage({
    conversationId: conversation.id,
    externalMessageId: sent.messageId,
    phone: conversation.external_contact_id,
    body: "😊 ¿Quieres continuar con tu pedido? Tu carrito sigue guardado.",
    metadata: { automation: "inactivity_reminder" },
  });
  return true;
}

async function processInactiveConversations() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const oldInbound = dueAt(INACTIVITY_MINUTES);
  const reminders = await admin
    .from("channel_conversations")
    .select("id,external_contact_id")
    .eq("provider", "meta")
    .eq("status", "active")
    .eq("bot_enabled", true)
    .not("stage", "in", "(handoff,confirmed,cancelled)")
    .not("last_inbound_at", "is", null)
    .lte("last_inbound_at", oldInbound)
    .is("inactivity_reminder_sent_at", null)
    .limit(100);
  if (reminders.error) throw reminders.error;

  let reminded = 0;
  for (const conversation of reminders.data ?? []) {
    const claimed = await admin
      .from("channel_conversations")
      .update({
        inactivity_reminder_sent_at: now,
        inactivity_deadline_at: new Date(Date.now() + INACTIVITY_MINUTES * 60_000).toISOString(),
      })
      .eq("id", conversation.id)
      .eq("status", "active")
      .is("inactivity_reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    try {
      if (await sendInactivityReminder(conversation)) reminded += 1;
    } catch (error) {
      await admin
        .from("channel_conversations")
        .update({ inactivity_reminder_sent_at: null, inactivity_deadline_at: null })
        .eq("id", conversation.id)
        .eq("inactivity_reminder_sent_at", now);
      console.warn(`[WhatsApp Scheduler] No se pudo enviar recordatorio: ${safeErrorDetail(error)}`);
    }
  }

  const expired = await admin
    .from("channel_conversations")
    .select("id,external_contact_id,inactivity_reminder_sent_at")
    .eq("provider", "meta")
    .eq("status", "active")
    .eq("bot_enabled", true)
    .not("inactivity_reminder_sent_at", "is", null)
    .lte("inactivity_deadline_at", now)
    .limit(100);
  if (expired.error) throw expired.error;

  let closed = 0;
  for (const conversation of expired.data ?? []) {
    const updated = await admin
      .from("channel_conversations")
      .update({ status: "closed", bot_enabled: false, closed_at: now })
      .eq("id", conversation.id)
      .eq("status", "active")
      .lte("inactivity_deadline_at", now)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    closed += 1;
    const config = readWhatsappServerConfig();
    if (config.provider === "meta" && config.accessToken && config.phoneNumberId) {
      try {
        const body = "Cierro este pedido por ahora para no dejarlo pendiente 😊 Cuando quieras, escríbenos y comenzamos de nuevo.";
        const sent = await sendMetaTextMessage(
          { to: conversation.external_contact_id, body },
          {
            graphApiVersion: config.graphApiVersion,
            phoneNumberId: config.phoneNumberId,
            accessToken: config.accessToken,
          }
        );
        await recordOutboundMessage({
          conversationId: conversation.id,
          externalMessageId: sent.messageId,
          phone: conversation.external_contact_id,
          body,
          metadata: { automation: "inactivity_close" },
        });
      } catch (error) {
        console.warn(`[WhatsApp Scheduler] Chat cerrado sin mensaje final: ${safeErrorDetail(error)}`);
      }
    }
  }
  return { reminded, closed };
}

export async function runWhatsappScheduler() {
  const [released, inactivity] = await Promise.all([
    releaseScheduledOrders(),
    processInactiveConversations(),
  ]);
  return { released, ...inactivity };
}
