"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  WhatsappActionResult,
  WhatsappAdminConversation,
  WhatsappAdminMessage,
  WhatsappAdminRole,
  WhatsappControlData,
} from "@/lib/whatsapp/admin-types";
import { readWhatsappServerConfig } from "@/lib/whatsapp/config.server";
import { geocodeDestination } from "@/lib/whatsapp/google-maps.server";
import { sendMetaTextMessage } from "@/lib/whatsapp/meta-provider";
import {
  loadWhatsappOperationsConfig,
  quoteWhatsappDelivery,
} from "@/lib/whatsapp/operations.server";
import { recordOutboundMessage } from "@/lib/whatsapp/repository.server";
import { isMissingWhatsappSchema } from "@/lib/whatsapp/schema-compat";
import type { WhatsappChannelSettings } from "@/types/database";

const CHANNEL_ROLES = new Set(["owner", "admin", "waiter", "supervisor"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

async function requireChannelUser(adminOnly = false) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Inicia sesión para continuar");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .single();
  if (error || !profile?.is_active) throw new Error("Esta cuenta no está activa");
  if (!CHANNEL_ROLES.has(profile.role)) throw new Error("No tienes acceso al canal de WhatsApp");
  if (adminOnly && !ADMIN_ROLES.has(profile.role)) {
    throw new Error("Solo el propietario o un administrador puede cambiar esta configuración");
  }

  return {
    userId: auth.user.id,
    role: profile.role as WhatsappAdminRole,
    admin: createAdminClient(),
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación";
}

function conversationStateAtStage(value: unknown, stage: "ordering" | "handoff") {
  const state = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return { ...state, stage, unknownCount: 0 };
}

function conversationContext(value: unknown): WhatsappAdminConversation["context"] {
  const state = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const cart = Array.isArray(state.cart) ? state.cart : [];
  const payment = state.payment && typeof state.payment === "object" && !Array.isArray(state.payment)
    ? (state.payment as Record<string, unknown>)
    : {};
  return {
    items: cart.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const line = value as Record<string, unknown>;
      if (typeof line.name !== "string") return [];
      return [{
        name: line.name,
        quantity: typeof line.quantity === "number" ? line.quantity : 1,
      }];
    }),
    total: typeof state.total === "number" ? state.total : 0,
    serviceType:
      state.serviceType === "domicilio" || state.serviceType === "para_llevar"
        ? state.serviceType
        : null,
    address: typeof state.address === "string" ? state.address : "",
    addressReference:
      typeof state.addressReference === "string" ? state.addressReference : "",
    paymentMethod: typeof payment.method === "string" ? payment.method : "",
  };
}

async function claimConversationForUser(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string,
  reason: string
) {
  const current = await admin
    .from("channel_conversations")
    .select("id,external_contact_id,state,assigned_to")
    .eq("id", conversationId)
    .single();
  if (current.error || !current.data) {
    throw current.error ?? new Error("No se encontró la conversación");
  }
  if (current.data.assigned_to && current.data.assigned_to !== userId) {
    throw new Error("Otra persona del equipo ya está atendiendo esta conversación");
  }

  const claimed = await admin
    .from("channel_conversations")
    .update({
      status: "handoff",
      stage: "handoff",
      bot_enabled: false,
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
      handoff_reason: reason,
      state: conversationStateAtStage(current.data.state, "handoff"),
    })
    .eq("id", conversationId)
    .or(`assigned_to.is.null,assigned_to.eq.${userId}`)
    .select("id,external_contact_id,state,assigned_to")
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) {
    throw new Error("Otra persona del equipo tomó esta conversación primero");
  }
  return claimed.data;
}

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId = "",
  metadata: Record<string, unknown> = {}
) {
  await createAdminClient()
    .from("whatsapp_admin_audit")
    .insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
}

export async function getWhatsappControlDataAction(): Promise<
  WhatsappActionResult<WhatsappControlData>
> {
  try {
    const { userId, role, admin } = await requireChannelUser();
    const operations = await loadWhatsappOperationsConfig();
    const serverConfig = readWhatsappServerConfig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [conversationResult, menuResult, failedResult, exceptionResult, notificationFailureResult] = await Promise.all([
      admin
        .from("channel_conversations")
        .select(
          "id,external_contact_id,status,stage,state,bot_enabled,assigned_to,handoff_reason,updated_at,last_inbound_at,last_outbound_at"
        )
        .eq("provider", "meta")
        .order("updated_at", { ascending: false })
        .limit(50),
      admin
        .from("menu_items")
        .select("id,name,is_active,whatsapp_enabled,categories(name)")
        .order("sort_order", { ascending: true }),
      admin
        .from("channel_messages")
        .select("id", { count: "exact", head: true })
        .eq("provider", "meta")
        .eq("status", "failed"),
      admin
        .from("whatsapp_schedule_exceptions")
        .select("id,service_date,is_open,opens_at,closes_at,note")
        .gte("service_date", new Date().toISOString().slice(0, 10))
        .order("service_date")
        .limit(60),
      admin
        .from("whatsapp_notification_events")
        .select("id,event_key,attempts,last_error,created_at,orders(number)")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    let conversationRows = conversationResult.data ?? [];
    if (conversationResult.error) {
      const fallback = await admin
        .from("channel_conversations")
        .select(
          "id,external_contact_id,status,stage,state,assigned_to,updated_at,last_inbound_at,last_outbound_at"
        )
        .eq("provider", "meta")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (fallback.error && !isMissingWhatsappSchema(fallback.error)) throw fallback.error;
      conversationRows = (fallback.data ?? []).map((row) => ({
          ...row,
          bot_enabled: row.status !== "handoff",
          handoff_reason: "",
        }));
    }

    const conversationIds = conversationRows.map((row) => row.id);
    const lastMessages = new Map<string, string>();
    if (conversationIds.length > 0) {
      const recent = await admin
        .from("channel_messages")
        .select("conversation_id,body,occurred_at")
        .in("conversation_id", conversationIds)
        .order("occurred_at", { ascending: false })
        .limit(200);
      for (const item of recent.data ?? []) {
        if (!lastMessages.has(item.conversation_id)) {
          lastMessages.set(item.conversation_id, item.body ?? "");
        }
      }
    }

    let catalogRows = menuResult.data ?? [];
    if (menuResult.error) {
      const fallback = await admin
        .from("menu_items")
        .select("id,name,is_active,categories(name)")
        .order("sort_order", { ascending: true });
      if (fallback.error) throw fallback.error;
      catalogRows = (fallback.data ?? []).map((row) => ({
        ...row,
        whatsapp_enabled: true,
      }));
    }

    const conversations: WhatsappAdminConversation[] = conversationRows.map((row) => ({
      id: row.id,
      phone: row.external_contact_id,
      status: row.status,
      stage: row.stage,
      botEnabled: row.bot_enabled ?? row.status !== "handoff",
      assignedTo: row.assigned_to,
      handoffReason: row.handoff_reason ?? "",
      updatedAt: row.updated_at,
      lastInboundAt: row.last_inbound_at,
      lastOutboundAt: row.last_outbound_at,
      lastMessage: lastMessages.get(row.id) ?? "Sin mensajes visibles",
      context: conversationContext(row.state),
    }));

    return {
      success: true,
      data: {
        role,
        userId,
        persisted: operations.persisted,
        settings: operations.settings,
        hours: operations.hours,
        scheduleExceptions: (exceptionResult.data ?? []).map((item) => ({
          id: item.id,
          serviceDate: item.service_date,
          isOpen: item.is_open,
          opensAt: item.opens_at,
          closesAt: item.closes_at,
          note: item.note ?? "",
        })),
        rates: operations.rates,
        surcharges: operations.surcharges,
        conversations,
        catalog: catalogRows.map((item) => {
          const relation = item.categories as unknown as
            | { name?: string }
            | Array<{ name?: string }>
            | null;
          const category = Array.isArray(relation) ? relation[0] : relation;
          return {
            id: item.id,
            name: item.name,
            categoryName: category?.name ?? "Sin categoría",
            isActive: item.is_active,
            whatsappEnabled: item.whatsapp_enabled ?? true,
          };
        }),
        metrics: {
          active: conversations.filter((item) => item.status === "active").length,
          handoff: conversations.filter((item) => item.status === "handoff").length,
          confirmedToday: conversations.filter(
            (item) => item.status === "confirmed" && new Date(item.updatedAt) >= today
          ).length,
          failedMessages: failedResult.count ?? 0,
        },
        diagnostics: {
          integrationEnabled: serverConfig.ordersEnabled,
          providerReady:
            serverConfig.provider === "meta" &&
            Boolean(serverConfig.accessToken && serverConfig.phoneNumberId),
          webhookSecurityReady: Boolean(serverConfig.verifyToken && serverConfig.appSecret),
          googleMapsReady: Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim()),
          storeOriginReady:
            Boolean(operations.settings.store_address) &&
            operations.settings.store_latitude !== null &&
            operations.settings.store_longitude !== null,
          dryRun: serverConfig.dryRun,
          orderCreationEnabled:
            serverConfig.orderCreationEnabled && operations.settings.create_orders_enabled,
          allowedTestPhones: serverConfig.allowedPhones.size,
          failedNotifications: (notificationFailureResult.data ?? []).map((item) => {
            const relation = item.orders as unknown as
              | { number?: number }
              | Array<{ number?: number }>
              | null;
            const order = Array.isArray(relation) ? relation[0] : relation;
            return {
              id: item.id,
              orderNumber: Number(order?.number ?? 0),
              eventKey: item.event_key,
              attempts: Number(item.attempts ?? 0),
              lastError: item.last_error ?? "",
              createdAt: item.created_at,
            };
          }),
        },
      },
    };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function locateWhatsappStoreAction(
  address: string
): Promise<WhatsappActionResult<{
  formattedAddress: string;
  latitude: number;
  longitude: number;
}>> {
  try {
    const cleanAddress = address.trim();
    if (cleanAddress.length < 8) throw new Error("Escribe la dirección completa del local");
    const { userId, admin } = await requireChannelUser(true);
    const location = await geocodeDestination(cleanAddress);
    const { error } = await admin
      .from("whatsapp_channel_settings")
      .update({
        store_address: location.formattedAddress,
        store_latitude: location.latitude,
        store_longitude: location.longitude,
        updated_by: userId,
      })
      .eq("id", 1);
    if (error) throw error;
    await audit(userId, "locate_store", "whatsapp_channel_settings", "1", {
      formattedAddress: location.formattedAddress,
    });
    revalidatePath("/dashboard/whatsapp");
    return {
      success: true,
      data: {
        formattedAddress: location.formattedAddress,
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function testWhatsappDeliveryAddressAction(
  address: string
): Promise<WhatsappActionResult<{
  status: "quoted" | "needs_handoff";
  formattedAddress?: string;
  distanceKm?: number;
  totalFee?: number;
  reason?: string;
}>> {
  try {
    const cleanAddress = address.trim();
    if (cleanAddress.length < 8) throw new Error("Escribe un domicilio completo para probar");
    await requireChannelUser(true);
    const operations = await loadWhatsappOperationsConfig();
    if (
      operations.settings.store_latitude === null ||
      operations.settings.store_longitude === null
    ) {
      throw new Error("Primero ubica y guarda la dirección del local");
    }
    const result = await quoteWhatsappDelivery({
      conversationId: null,
      address: cleanAddress,
      config: {
        ...operations,
        settings: { ...operations.settings, delivery_quotes_enabled: true },
      },
    });
    if (result.status === "needs_handoff") {
      return {
        success: true,
        data: { status: "needs_handoff", reason: result.reason },
      };
    }
    return {
      success: true,
      data: {
        status: "quoted",
        formattedAddress: result.quote.formattedAddress,
        distanceKm: Math.round((result.quote.distanceMeters / 1000) * 10) / 10,
        totalFee: result.quote.totalFee,
      },
    };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function updateWhatsappSettingsAction(
  input: Pick<
    WhatsappChannelSettings,
    | "receive_enabled"
    | "auto_reply_enabled"
    | "create_orders_enabled"
    | "delivery_quotes_enabled"
    | "status_notifications_enabled"
    | "human_handoff_enabled"
    | "message_retention_days"
    | "store_address"
    | "store_latitude"
    | "store_longitude"
    | "closed_message"
  >
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    const retention = Math.max(7, Math.min(365, Number(input.message_retention_days)));
    const payload = {
      ...input,
      message_retention_days: retention,
      store_address: input.store_address.trim().slice(0, 300),
      closed_message: input.closed_message.trim().slice(0, 500),
      updated_by: userId,
    };
    const { error } = await admin
      .from("whatsapp_channel_settings")
      .update(payload)
      .eq("id", 1);
    if (error) throw error;
    await audit(userId, "update_settings", "whatsapp_channel_settings", "1");
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function updateWhatsappHoursAction(
  hours: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    opensAt: string;
    closesAt: string;
  }>
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    if (hours.length !== 7) throw new Error("Configura los siete días de la semana");
    for (const item of hours) {
      if (item.dayOfWeek < 0 || item.dayOfWeek > 6 || item.opensAt === item.closesAt) {
        throw new Error("Hay un horario inválido");
      }
      const { error } = await admin
        .from("whatsapp_business_hours")
        .update({
          is_open: item.isOpen,
          opens_at: item.opensAt,
          closes_at: item.closesAt,
          updated_by: userId,
        })
        .eq("day_of_week", item.dayOfWeek);
      if (error) throw error;
    }
    await audit(userId, "update_hours", "whatsapp_business_hours");
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function saveWhatsappScheduleExceptionAction(input: {
  id?: string;
  serviceDate: string;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  note: string;
}): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate)) {
      throw new Error("Selecciona una fecha válida");
    }
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Hermosillo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (input.serviceDate < today) throw new Error("La fecha especial no puede estar en el pasado");
    if (input.isOpen && (!input.opensAt || !input.closesAt || input.opensAt === input.closesAt)) {
      throw new Error("Configura un horario especial válido");
    }
    const payload = {
      service_date: input.serviceDate,
      is_open: input.isOpen,
      opens_at: input.isOpen ? input.opensAt : null,
      closes_at: input.isOpen ? input.closesAt : null,
      note: input.note.trim().slice(0, 200),
      updated_by: userId,
    };
    const query = input.id
      ? admin.from("whatsapp_schedule_exceptions").update(payload).eq("id", input.id)
      : admin.from("whatsapp_schedule_exceptions").upsert(payload, { onConflict: "service_date" });
    const { error } = await query;
    if (error) throw error;
    await audit(userId, "save_schedule_exception", "whatsapp_schedule_exception", input.id ?? input.serviceDate);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function deleteWhatsappScheduleExceptionAction(
  id: string
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    const { error } = await admin.from("whatsapp_schedule_exceptions").delete().eq("id", id);
    if (error) throw error;
    await audit(userId, "delete_schedule_exception", "whatsapp_schedule_exception", id);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function updateWhatsappDeliveryRulesAction(input: {
  rates: Array<{ id: string; minDistanceKm: number; maxDistanceKm: number; fee: number }>;
  surcharges: Array<{ id: string; fee: number; isActive: boolean }>;
}): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    const rates = [...input.rates].sort((a, b) => a.minDistanceKm - b.minDistanceKm);
    for (let index = 0; index < rates.length; index += 1) {
      const rate = rates[index];
      if (
        !Number.isFinite(rate.minDistanceKm) ||
        !Number.isFinite(rate.maxDistanceKm) ||
        !Number.isFinite(rate.fee) ||
        rate.minDistanceKm < 0 ||
        rate.maxDistanceKm <= rate.minDistanceKm ||
        rate.fee < 0
      ) {
        throw new Error("Hay una tarifa de entrega inválida");
      }
      if (index > 0 && rate.minDistanceKm < rates[index - 1].maxDistanceKm) {
        throw new Error("Los rangos de distancia no pueden sobreponerse");
      }
      const { error } = await admin
        .from("whatsapp_delivery_rates")
        .update({
          min_distance_km: rate.minDistanceKm,
          max_distance_km: rate.maxDistanceKm,
          fee: Math.round(rate.fee),
          sort_order: index + 1,
          updated_by: userId,
        })
        .eq("id", rate.id);
      if (error) throw error;
    }
    for (const surcharge of input.surcharges) {
      if (!Number.isFinite(surcharge.fee) || surcharge.fee < 0) {
        throw new Error("Hay un recargo por colonia inválido");
      }
      const { error } = await admin
        .from("whatsapp_delivery_surcharges")
        .update({
          fee: Math.round(surcharge.fee),
          is_active: surcharge.isActive,
          updated_by: userId,
        })
        .eq("id", surcharge.id);
      if (error) throw error;
    }
    await audit(userId, "update_delivery_rules", "whatsapp_delivery_rules");
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function updateWhatsappCatalogItemAction(
  menuItemId: string,
  enabled: boolean
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    const { error } = await admin
      .from("menu_items")
      .update({ whatsapp_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", menuItemId);
    if (error) throw error;
    await audit(userId, enabled ? "enable_catalog_item" : "disable_catalog_item", "menu_item", menuItemId);
    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/menu");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function getWhatsappConversationMessagesAction(
  conversationId: string
): Promise<WhatsappActionResult<WhatsappAdminMessage[]>> {
  try {
    const { admin } = await requireChannelUser();
    const { data, error } = await admin
      .from("channel_messages")
      .select("id,direction,body,status,occurred_at")
      .eq("conversation_id", conversationId)
      .order("occurred_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return {
      success: true,
      data: (data ?? []).map((item) => ({
        id: item.id,
        direction: item.direction as "inbound" | "outbound",
        body: item.body,
        status: item.status,
        occurredAt: item.occurred_at,
      })),
    };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function claimWhatsappConversationAction(
  conversationId: string
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser();
    await claimConversationForUser(
      admin,
      conversationId,
      userId,
      "Tomada manualmente por el equipo"
    );
    await audit(userId, "claim_conversation", "channel_conversation", conversationId);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function sendWhatsappHumanReplyAction(
  conversationId: string,
  body: string
): Promise<WhatsappActionResult> {
  try {
    const cleanBody = body.trim();
    if (!cleanBody) throw new Error("Escribe un mensaje");
    const { userId, admin } = await requireChannelUser();
    const conversation = await claimConversationForUser(
      admin,
      conversationId,
      userId,
      "Atención manual activa"
    );

    const config = readWhatsappServerConfig();
    if (config.provider !== "meta" || !config.accessToken || !config.phoneNumberId) {
      throw new Error("Meta todavía no está configurado para enviar mensajes");
    }
    const sent = await sendMetaTextMessage(
      { to: conversation.external_contact_id, body: cleanBody },
      {
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
      }
    );
    await recordOutboundMessage({
      conversationId,
      externalMessageId: sent.messageId,
      phone: conversation.external_contact_id,
      body: cleanBody,
    });
    await audit(userId, "send_human_reply", "channel_conversation", conversationId);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function resumeWhatsappBotAction(
  conversationId: string
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser();
    const current = await admin
      .from("channel_conversations")
      .select("state")
      .eq("id", conversationId)
      .single();
    if (current.error) throw current.error;
    const { error } = await admin
      .from("channel_conversations")
      .update({
        status: "active",
        stage: "ordering",
        bot_enabled: true,
        assigned_to: null,
        assigned_at: null,
        handoff_reason: "",
        state: conversationStateAtStage(current.data.state, "ordering"),
      })
      .eq("id", conversationId);
    if (error) throw error;
    await audit(userId, "resume_bot", "channel_conversation", conversationId);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function closeWhatsappConversationAction(
  conversationId: string
): Promise<WhatsappActionResult> {
  try {
    const { userId, admin } = await requireChannelUser();
    const { error } = await admin
      .from("channel_conversations")
      .update({
        status: "closed",
        bot_enabled: false,
        closed_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    if (error) throw error;
    await audit(userId, "close_conversation", "channel_conversation", conversationId);
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}
