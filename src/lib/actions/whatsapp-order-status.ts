"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readWhatsappServerConfig } from "@/lib/whatsapp/config.server";
import { sendMetaTextMessage } from "@/lib/whatsapp/meta-provider";
import { recordOutboundMessage } from "@/lib/whatsapp/repository.server";
import { isMissingWhatsappSchema } from "@/lib/whatsapp/schema-compat";

type WhatsappOrderEvent = "in_preparation" | "ready_searching_driver" | "driver_on_way";

const STAFF_ROLES = new Set(["owner", "admin", "waiter", "kitchen", "supervisor"]);

async function requireStaff() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("No autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .single();
  if (!profile?.is_active || !STAFF_ROLES.has(profile.role)) {
    throw new Error("Sin permisos para actualizar el pedido");
  }
}

function eventMessage(event: WhatsappOrderEvent, orderNumber: number, orderType: string) {
  if (event === "in_preparation") {
    return `🔥 Tu pedido #${orderNumber} ya está en preparación.`;
  }
  if (event === "driver_on_way") {
    return `🛵 Tu pedido #${orderNumber} va en camino. Ten tu pago listo si elegiste efectivo.`;
  }
  if (orderType === "domicilio") {
    return `✅ Tu pedido #${orderNumber} está listo. Estamos buscando repartidor.`;
  }
  return `✅ Tu pedido #${orderNumber} está listo para recoger.`;
}

async function sendWhatsappEvent(input: {
  eventId: string;
  event: WhatsappOrderEvent;
  orderNumber: number;
  orderType: string;
  conversationId: string;
  phone: string;
  attempts: number;
}) {
  const admin = createAdminClient();
  const body = eventMessage(input.event, input.orderNumber, input.orderType);
  try {
    const config = readWhatsappServerConfig();
    if (config.provider !== "meta" || !config.accessToken || !config.phoneNumberId) {
      throw new Error("Meta no está configurado para enviar mensajes");
    }
    const sent = await sendMetaTextMessage(
      { to: input.phone, body },
      {
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
      }
    );
    await recordOutboundMessage({
      conversationId: input.conversationId,
      externalMessageId: sent.messageId,
      phone: input.phone,
      body,
    });
    await admin
      .from("whatsapp_notification_events")
      .update({
        status: "sent",
        external_message_id: sent.messageId,
        attempts: input.attempts,
        sent_at: new Date().toISOString(),
        last_error: "",
      })
      .eq("id", input.eventId);
    return { sent: true } as const;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error al enviar";
    await admin
      .from("whatsapp_notification_events")
      .update({
        status: "failed",
        attempts: input.attempts,
        last_error: detail.slice(0, 300),
      })
      .eq("id", input.eventId);
    throw error;
  }
}

async function notifyWhatsappOrder(orderId: string, event: WhatsappOrderEvent) {
  await requireStaff();
  const admin = createAdminClient();
  const order = await admin
    .from("orders")
    .select("id,number,type,source_channel,channel_conversation_id")
    .eq("id", orderId)
    .single();
  if (isMissingWhatsappSchema(order.error)) {
    return { sent: false, reason: "migration_pending" } as const;
  }
  if (order.error || !order.data) throw new Error("No se encontró el pedido");
  if (order.data.source_channel !== "whatsapp" || !order.data.channel_conversation_id) {
    return { sent: false, reason: "not_whatsapp" } as const;
  }

  const settings = await admin
    .from("whatsapp_channel_settings")
    .select("status_notifications_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (settings.error || !settings.data?.status_notifications_enabled) {
    return { sent: false, reason: "notifications_disabled" } as const;
  }

  const conversation = await admin
    .from("channel_conversations")
    .select("external_contact_id")
    .eq("id", order.data.channel_conversation_id)
    .single();
  if (conversation.error || !conversation.data) throw new Error("No se encontró la conversación");

  const inserted = await admin
    .from("whatsapp_notification_events")
    .insert({
      order_id: orderId,
      conversation_id: order.data.channel_conversation_id,
      event_key: event,
      status: "pending",
      attempts: 1,
    })
    .select("id")
    .single();
  if (inserted.error?.code === "23505") {
    return { sent: false, reason: "duplicate" } as const;
  }
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error("No se pudo registrar el aviso");

  return sendWhatsappEvent({
    eventId: inserted.data.id,
    event,
    orderNumber: order.data.number,
    orderType: order.data.type,
    conversationId: order.data.channel_conversation_id,
    phone: conversation.data.external_contact_id,
    attempts: 1,
  });
}

export async function retryWhatsappNotificationAction(eventId: string) {
  try {
    await requireStaff();
    const admin = createAdminClient();
    const event = await admin
      .from("whatsapp_notification_events")
      .select("id,event_key,status,attempts,conversation_id,orders(number,type),channel_conversations(external_contact_id)")
      .eq("id", eventId)
      .single();
    if (event.error || !event.data) throw new Error("No se encontró la notificación");
    if (event.data.status !== "failed") {
      throw new Error("Esta notificación ya no está pendiente de reintento");
    }
    const orderRelation = event.data.orders as unknown as
      | { number?: number; type?: string }
      | Array<{ number?: number; type?: string }>
      | null;
    const conversationRelation = event.data.channel_conversations as unknown as
      | { external_contact_id?: string }
      | Array<{ external_contact_id?: string }>
      | null;
    const order = Array.isArray(orderRelation) ? orderRelation[0] : orderRelation;
    const conversation = Array.isArray(conversationRelation)
      ? conversationRelation[0]
      : conversationRelation;
    if (!order?.number || !order.type || !conversation?.external_contact_id) {
      throw new Error("La notificación no tiene los datos necesarios para reenviarse");
    }
    await sendWhatsappEvent({
      eventId: event.data.id,
      event: event.data.event_key as WhatsappOrderEvent,
      orderNumber: order.number,
      orderType: order.type,
      conversationId: event.data.conversation_id,
      phone: conversation.external_contact_id,
      attempts: Number(event.data.attempts ?? 0) + 1,
    });
    return { success: true, sent: true };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "No se pudo reenviar la notificación",
    };
  }
}

export async function notifyWhatsappOrderStatusAction(
  orderId: string,
  status: "in_kitchen" | "ready"
) {
  try {
    await requireStaff();
    if (status === "ready") {
      await createAdminClient()
        .from("orders")
        .update({ delivery_status: "searching_driver" })
        .eq("id", orderId)
        .eq("source_channel", "whatsapp")
        .eq("type", "domicilio");
    }
    return {
      success: true,
      ...(await notifyWhatsappOrder(
        orderId,
        status === "in_kitchen" ? "in_preparation" : "ready_searching_driver"
      )),
    };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "No se pudo avisar al cliente",
    };
  }
}

export async function markWhatsappDriverOnWayAction(orderId: string) {
  try {
    await requireStaff();
    const admin = createAdminClient();
    const updated = await admin
      .from("orders")
      .update({ delivery_status: "driver_on_way" })
      .eq("id", orderId)
      .eq("source_channel", "whatsapp")
      .eq("type", "domicilio")
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new Error("Este pedido no corresponde a un domicilio de WhatsApp");
    }
    return { success: true, ...(await notifyWhatsappOrder(orderId, "driver_on_way")) };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar el reparto",
    };
  }
}
