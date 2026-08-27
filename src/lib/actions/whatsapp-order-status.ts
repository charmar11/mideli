"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readWhatsappServerConfig } from "@/lib/whatsapp/config.server";
import { sendMetaTextMessage } from "@/lib/whatsapp/meta-provider";
import { recordOutboundMessage } from "@/lib/whatsapp/repository.server";
import { isMissingWhatsappSchema } from "@/lib/whatsapp/schema-compat";
import {
  finalOrderStatusForPayment,
  validDeliveryTransition,
} from "@/lib/whatsapp/delivery-lifecycle";
import type { Order } from "@/types/database";

type WhatsappOrderEvent = "in_preparation" | "ready_searching_driver" | "driver_on_way";
type DeliveryStatus = NonNullable<Order["delivery_status"]>;

type NotificationOutcome = {
  sent: boolean;
  reason?:
    | "not_whatsapp"
    | "notifications_disabled"
    | "migration_pending"
    | "duplicate"
    | "send_failed";
  eventId?: string;
  error?: string;
};

export type WhatsappDeliveryOperationDetails = {
  distanceMeters: number | null;
  notification: {
    id: string;
    event: WhatsappOrderEvent;
    status: "pending" | "sent" | "delivered" | "read" | "failed";
    lastError: string;
  } | null;
};

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
  return { userId: auth.user.id, role: profile.role };
}

async function recordDeliveryAudit(input: {
  actorId: string | null;
  orderId: string;
  action: string;
  previousStatus: DeliveryStatus;
  nextStatus: DeliveryStatus;
  origin: "manual" | "customer" | "kitchen";
}) {
  const { error } = await createAdminClient().from("whatsapp_admin_audit").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: "order",
    entity_id: input.orderId,
    metadata: {
      previous_status: input.previousStatus,
      next_status: input.nextStatus,
      origin: input.origin,
    },
  });
  if (error) {
    console.warn("El reparto cambió, pero no se pudo registrar la auditoría.");
    return false;
  }
  return true;
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
}): Promise<NotificationOutcome> {
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
    return { sent: true, eventId: input.eventId };
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
    return {
      sent: false,
      reason: "send_failed",
      eventId: input.eventId,
      error: detail,
    };
  }
}

async function notifyWhatsappOrder(orderId: string, event: WhatsappOrderEvent) {
  const admin = createAdminClient();
  const order = await admin
    .from("orders")
    .select("id,number,type,source_channel,channel_conversation_id")
    .eq("id", orderId)
    .single();
  if (isMissingWhatsappSchema(order.error)) {
    return { sent: false, reason: "migration_pending" } satisfies NotificationOutcome;
  }
  if (order.error || !order.data) throw new Error("No se encontró el pedido");
  if (order.data.source_channel !== "whatsapp" || !order.data.channel_conversation_id) {
    return { sent: false, reason: "not_whatsapp" } satisfies NotificationOutcome;
  }

  const settings = await admin
    .from("whatsapp_channel_settings")
    .select("status_notifications_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (settings.error || !settings.data?.status_notifications_enabled) {
    return { sent: false, reason: "notifications_disabled" } satisfies NotificationOutcome;
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
    const existing = await admin
      .from("whatsapp_notification_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("event_key", event)
      .maybeSingle();
    return {
      sent: false,
      reason: "duplicate",
      eventId: existing.data?.id,
    } satisfies NotificationOutcome;
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

async function safelyNotifyWhatsappOrder(
  orderId: string,
  event: WhatsappOrderEvent
): Promise<NotificationOutcome> {
  try {
    return await notifyWhatsappOrder(orderId, event);
  } catch (error) {
    return {
      sent: false,
      reason: "send_failed",
      error: error instanceof Error ? error.message : "No se pudo registrar el aviso",
    };
  }
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
    const outcome = await sendWhatsappEvent({
      eventId: event.data.id,
      event: event.data.event_key as WhatsappOrderEvent,
      orderNumber: order.number,
      orderType: order.type,
      conversationId: event.data.conversation_id,
      phone: conversation.external_contact_id,
      attempts: Number(event.data.attempts ?? 0) + 1,
    });
    return outcome.sent
      ? { success: true, ...outcome }
      : {
          success: false,
          ...outcome,
          error: outcome.error ?? "No se pudo reenviar la notificación",
        };
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
    const actor = await requireStaff();
    let deliveryStatusChanged = false;
    if (status === "ready") {
      const admin = createAdminClient();
      const current = await admin
        .from("orders")
        .select("status,type,source_channel,delivery_status")
        .eq("id", orderId)
        .single();
      if (current.error || !current.data) throw new Error("No se encontró el pedido");
      if (
        current.data.source_channel === "whatsapp" &&
        current.data.type === "domicilio"
      ) {
        if (current.data.status !== "ready") {
          throw new Error("El pedido todavía no está listo para reparto");
        }
        const previous = current.data.delivery_status as DeliveryStatus;
        const transition = validDeliveryTransition(previous, "searching_driver");
        if (transition === "invalid" && previous !== "driver_on_way") {
          throw new Error("El pedido ya no puede volver a buscar repartidor");
        }
        if (transition === "advance") {
          const updated = await admin
            .from("orders")
            .update({ delivery_status: "searching_driver", updated_at: new Date().toISOString() })
            .eq("id", orderId)
            .eq("status", "ready")
            .eq("delivery_status", previous)
            .select("id")
            .maybeSingle();
          if (updated.error || !updated.data) {
            throw new Error("El reparto cambió en otro dispositivo. Actualiza e intenta de nuevo");
          }
          deliveryStatusChanged = true;
          await recordDeliveryAudit({
            actorId: actor.userId,
            orderId,
            action: "delivery_searching_driver",
            previousStatus: previous,
            nextStatus: "searching_driver",
            origin: "kitchen",
          });
        }
      }
    }
    return {
      success: true,
      deliveryStatusChanged,
      ...(await safelyNotifyWhatsappOrder(
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
    const actor = await requireStaff();
    const admin = createAdminClient();
    const current = await admin
      .from("orders")
      .select("status,type,source_channel,delivery_status")
      .eq("id", orderId)
      .single();
    if (current.error || !current.data) throw new Error("No se encontró el pedido");
    if (current.data.source_channel !== "whatsapp" || current.data.type !== "domicilio") {
      throw new Error("Este pedido no corresponde a un domicilio de WhatsApp");
    }
    if (current.data.status !== "ready") {
      throw new Error("El pedido debe estar listo antes de salir a reparto");
    }

    const previous = current.data.delivery_status as DeliveryStatus;
    const transition = validDeliveryTransition(previous, "driver_on_way");
    if (transition === "invalid") {
      throw new Error("El pedido no está en búsqueda de repartidor");
    }
    if (transition === "advance") {
      const updated = await admin
        .from("orders")
        .update({ delivery_status: "driver_on_way", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "ready")
        .eq("delivery_status", "searching_driver")
        .select("id")
        .maybeSingle();
      if (updated.error || !updated.data) {
        throw new Error("El reparto cambió en otro dispositivo. Actualiza e intenta de nuevo");
      }
      await recordDeliveryAudit({
        actorId: actor.userId,
        orderId,
        action: "delivery_driver_on_way",
        previousStatus: previous,
        nextStatus: "driver_on_way",
        origin: "manual",
      });
    }

    return {
      success: true,
      stateChanged: transition === "advance",
      ...(await safelyNotifyWhatsappOrder(orderId, "driver_on_way")),
    };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar el reparto",
    };
  }
}

export async function finalizeWhatsappDeliveryAction(orderId: string) {
  try {
    const actor = await requireStaff();
    const admin = createAdminClient();
    const current = await admin
      .from("orders")
      .select("status,type,source_channel,delivery_status,payment_status,channel_conversation_id")
      .eq("id", orderId)
      .single();
    if (current.error || !current.data) throw new Error("No se encontró el pedido");
    if (current.data.source_channel !== "whatsapp" || current.data.type !== "domicilio") {
      throw new Error("Este pedido no corresponde a un domicilio de WhatsApp");
    }
    const previous = current.data.delivery_status as DeliveryStatus;
    if (previous === "customer_received") {
      return { success: true, stateChanged: false };
    }
    if (current.data.status !== "ready" || previous !== "driver_on_way") {
      throw new Error("Solo puedes finalizar un pedido que ya va en camino");
    }

    const nextOrderStatus = finalOrderStatusForPayment(current.data.payment_status);
    const updated = await admin
      .from("orders")
      .update({
        delivery_status: "customer_received",
        status: nextOrderStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", "ready")
      .eq("delivery_status", "driver_on_way")
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new Error("El reparto cambió en otro dispositivo. Actualiza e intenta de nuevo");
    }
    await recordDeliveryAudit({
      actorId: actor.userId,
      orderId,
      action: "delivery_completed_manually",
      previousStatus: previous,
      nextStatus: "customer_received",
      origin: "manual",
    });
    if (current.data.channel_conversation_id) {
      const conversation = await admin
        .from("channel_conversations")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          bot_enabled: false,
        })
        .eq("id", current.data.channel_conversation_id);
      if (conversation.error) {
        console.warn("La entrega terminó, pero la conversación no pudo cerrarse.");
      }
    }
    return { success: true, stateChanged: true, orderStatus: nextOrderStatus };
  } catch (error) {
    return {
      success: false,
      stateChanged: false,
      error: error instanceof Error ? error.message : "No se pudo finalizar la entrega",
    };
  }
}

export async function getWhatsappDeliveryOperationsAction(orderIds: string[]) {
  try {
    await requireStaff();
    const uniqueIds = [...new Set(orderIds)].filter(Boolean).slice(0, 100);
    if (uniqueIds.length === 0) {
      return { success: true, details: {} as Record<string, WhatsappDeliveryOperationDetails> };
    }

    const admin = createAdminClient();
    const orders = await admin
      .from("orders")
      .select("id,channel_conversation_id,delivery_status")
      .in("id", uniqueIds)
      .eq("source_channel", "whatsapp")
      .eq("type", "domicilio");
    if (orders.error) throw orders.error;

    const conversationIds = (orders.data ?? [])
      .map((order) => order.channel_conversation_id)
      .filter((id): id is string => Boolean(id));
    const [quotes, notifications] = await Promise.all([
      conversationIds.length > 0
        ? admin
            .from("whatsapp_delivery_quotes")
            .select("conversation_id,distance_meters,created_at")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("whatsapp_notification_events")
        .select("id,order_id,event_key,status,last_error,created_at")
        .in("order_id", uniqueIds)
        .order("created_at", { ascending: false }),
    ]);
    if (quotes.error) throw quotes.error;
    if (notifications.error) throw notifications.error;

    const distanceByConversation = new Map<string, number | null>();
    for (const quote of quotes.data ?? []) {
      if (!distanceByConversation.has(quote.conversation_id)) {
        distanceByConversation.set(quote.conversation_id, quote.distance_meters ?? null);
      }
    }
    const notificationByOrder = new Map<
      string,
      WhatsappDeliveryOperationDetails["notification"]
    >();
    const expectedEventByOrder = new Map(
      (orders.data ?? []).map((order) => [
        order.id,
        order.delivery_status === "driver_on_way"
          ? "driver_on_way"
          : "ready_searching_driver",
      ])
    );
    for (const notification of notifications.data ?? []) {
      if (notificationByOrder.has(notification.order_id)) continue;
      if (notification.event_key !== expectedEventByOrder.get(notification.order_id)) continue;
      notificationByOrder.set(notification.order_id, {
        id: notification.id,
        event: notification.event_key as WhatsappOrderEvent,
        status: notification.status,
        lastError: notification.last_error ?? "",
      });
    }

    const details: Record<string, WhatsappDeliveryOperationDetails> = {};
    for (const order of orders.data ?? []) {
      details[order.id] = {
        distanceMeters: order.channel_conversation_id
          ? distanceByConversation.get(order.channel_conversation_id) ?? null
          : null,
        notification: notificationByOrder.get(order.id) ?? null,
      };
    }
    return { success: true, details };
  } catch (error) {
    return {
      success: false,
      details: {} as Record<string, WhatsappDeliveryOperationDetails>,
      error: error instanceof Error ? error.message : "No se pudo cargar el detalle de reparto",
    };
  }
}
