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
  WhatsappCustomerDetail,
  WhatsappCustomerDirectory,
  WhatsappInboxSnapshot,
} from "@/lib/whatsapp/admin-types";
import type { WhatsappPilotBatchResult } from "@/lib/whatsapp/pilot-evaluator-types";
import { runWhatsappPilotBatchOnServer } from "@/lib/whatsapp/pilot-evaluator.server";
import { readWhatsappServerConfig } from "@/lib/whatsapp/config.server";
import {
  loadWhatsappCustomerDetail,
  loadWhatsappCustomerDirectory,
} from "@/lib/whatsapp/customers.server";
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

export async function runWhatsappPilotBatchAction(
  batchIndex: number
): Promise<WhatsappActionResult<WhatsappPilotBatchResult>> {
  try {
    await requireChannelUser(true);
    const data = await runWhatsappPilotBatchOnServer(batchIndex);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: message(error) };
  }
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
        notes: typeof line.notes === "string" ? line.notes : "",
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
    addressConfirmed: state.addressConfirmed === true,
    orderNotes: typeof state.orderNotes === "string" ? state.orderNotes : "",
    deliveryNotes: typeof state.deliveryNotes === "string" ? state.deliveryNotes : "",
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
    .select("id,external_contact_id,state,assigned_to,status")
    .eq("id", conversationId)
    .single();
  if (current.error || !current.data) {
    throw current.error ?? new Error("No se encontró la conversación");
  }
  if (!["active", "handoff", "confirmed"].includes(current.data.status)) {
    throw new Error("Esta conversación ya está cerrada");
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
    .in("status", ["active", "handoff", "confirmed"])
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

async function loadWhatsappConversations(
  admin: ReturnType<typeof createAdminClient>
): Promise<WhatsappAdminConversation[]> {
  const conversationResult = await admin
    .from("channel_conversations")
    .select(
      "id,external_contact_id,customer_id,status,stage,state,bot_enabled,assigned_to,handoff_reason,updated_at,last_inbound_at,last_outbound_at"
    )
    .eq("provider", "meta")
    .order("updated_at", { ascending: false })
    .limit(50);

  let conversationRows = conversationResult.data ?? [];
  if (conversationResult.error) {
    const fallback = await admin
      .from("channel_conversations")
      .select(
        "id,external_contact_id,customer_id,status,stage,state,assigned_to,updated_at,last_inbound_at,last_outbound_at"
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
  const customerIds = [...new Set(conversationRows.map((row) => row.customer_id))];
  const assignedIds = [
    ...new Set(
      conversationRows.flatMap((row) => row.assigned_to ? [row.assigned_to] : [])
    ),
  ];
  const lastMessages = new Map<string, {
    body: string;
    direction: "inbound" | "outbound";
    status: string;
  }>();
  const customers = new Map<string, string>();
  const assignees = new Map<string, string>();
  const latestOrders = new Map<string, WhatsappAdminConversation["latestOrder"]>();
  if (conversationIds.length > 0) {
    const recentPromise = admin
      .from("channel_messages")
      .select("conversation_id,body,direction,status,occurred_at")
      .in("conversation_id", conversationIds)
      .order("occurred_at", { ascending: false })
      .limit(300);
    const ordersPromise = admin
      .from("orders")
      .select(
        "id,number,status,type,total,payment_status,payment_method,delivery_status,delivery_address,delivery_reference,payment_method_requested,requested_cash_tendered,created_at,channel_conversation_id"
      )
      .in("channel_conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(100);
    const customersPromise = customerIds.length > 0
      ? admin.from("customers").select("id,display_name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null });
    const assigneesPromise = assignedIds.length > 0
      ? admin.from("profiles").select("id,full_name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null });

    const [recent, orders, customerResult, assigneeResult] = await Promise.all([
      recentPromise,
      ordersPromise,
      customersPromise,
      assigneesPromise,
    ]);
    if (recent.error) throw recent.error;
    if (orders.error) throw orders.error;
    if (customerResult.error) throw customerResult.error;
    if (assigneeResult.error) throw assigneeResult.error;

    for (const item of recent.data ?? []) {
      if (!lastMessages.has(item.conversation_id)) {
        lastMessages.set(item.conversation_id, {
          body: item.body ?? "",
          direction: item.direction as "inbound" | "outbound",
          status: item.status,
        });
      }
    }
    for (const customer of customerResult.data ?? []) {
      customers.set(customer.id, customer.display_name ?? "");
    }
    for (const profile of assigneeResult.data ?? []) {
      assignees.set(profile.id, profile.full_name ?? "");
    }
    for (const order of orders.data ?? []) {
      if (!order.channel_conversation_id || latestOrders.has(order.channel_conversation_id)) {
        continue;
      }
      latestOrders.set(order.channel_conversation_id, {
        id: order.id,
        number: order.number,
        status: order.status,
        type: order.type,
        total: Number(order.total ?? 0),
        paymentStatus: order.payment_status,
        deliveryStatus: order.delivery_status ?? "pending",
        deliveryAddress: order.delivery_address ?? "",
        deliveryReference: order.delivery_reference ?? "",
        paymentMethod: order.payment_method_requested ?? order.payment_method ?? "",
        requestedCashTendered: order.requested_cash_tendered,
        createdAt: order.created_at,
      });
    }
  }

  return conversationRows.map((row) => {
    const lastMessage = lastMessages.get(row.id);
    return {
      id: row.id,
      phone: row.external_contact_id,
      customerName: customers.get(row.customer_id)?.trim() ?? "",
      status: row.status,
      stage: row.stage,
      botEnabled: row.bot_enabled ?? row.status !== "handoff",
      assignedTo: row.assigned_to,
      assignedName: row.assigned_to ? assignees.get(row.assigned_to)?.trim() ?? "" : "",
      handoffReason: row.handoff_reason ?? "",
      updatedAt: row.updated_at,
      lastInboundAt: row.last_inbound_at,
      lastOutboundAt: row.last_outbound_at,
      lastMessage: lastMessage ? (lastMessage.body || "Contenido limpiado") : "Sin mensajes visibles",
      lastMessageDirection: lastMessage?.direction ?? null,
      lastMessageStatus: lastMessage?.status ?? "",
      latestOrder: latestOrders.get(row.id) ?? null,
      context: conversationContext(row.state),
    };
  });
}

async function loadWhatsappMessages(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string | null
): Promise<WhatsappAdminMessage[]> {
  if (!conversationId) return [];
  const { data, error } = await admin
    .from("channel_messages")
    .select("id,direction,body,status,occurred_at")
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    direction: item.direction as "inbound" | "outbound",
    body: item.body,
    status: item.status,
    occurredAt: item.occurred_at,
  }));
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

    const [conversations, menuResult, failedResult, exceptionResult, notificationFailureResult] = await Promise.all([
      loadWhatsappConversations(admin),
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
          geminiReady: Boolean(process.env.GEMINI_API_KEY?.trim()),
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
    return { success: true, data: await loadWhatsappMessages(admin, conversationId) };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function getWhatsappInboxSnapshotAction(
  conversationId: string | null
): Promise<WhatsappActionResult<WhatsappInboxSnapshot>> {
  try {
    const { admin } = await requireChannelUser();
    const requestedConversationId = conversationId?.trim() || null;
    const [conversations, messages] = await Promise.all([
      loadWhatsappConversations(admin),
      loadWhatsappMessages(admin, requestedConversationId),
    ]);
    return {
      success: true,
      data: {
        conversations,
        conversationId: requestedConversationId,
        messages,
      },
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
    if (cleanBody.length > 1500) throw new Error("El mensaje es demasiado largo");
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
    const updated = await admin
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
      .eq("id", conversationId)
      .eq("status", "handoff")
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("Solo una conversación en atención manual puede volver al bot");
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

export async function clearWhatsappConversationMessagesAction(
  conversationId: string
): Promise<WhatsappActionResult<{ redacted: number }>> {
  try {
    const { userId, admin } = await requireChannelUser(true);
    const existing = await admin
      .from("channel_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("provider", "meta")
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Error("No se encontró la conversación");

    const countResult = await admin
      .from("channel_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .is("redacted_at", null);
    if (countResult.error) throw countResult.error;

    const redactedAt = new Date().toISOString();
    const { error } = await admin
      .from("channel_messages")
      .update({ body: "", metadata: {}, redacted_at: redactedAt })
      .eq("conversation_id", conversationId)
      .is("redacted_at", null);
    if (error) throw error;

    const redacted = countResult.count ?? 0;
    await audit(userId, "redact_conversation_messages", "channel_conversation", conversationId, {
      redacted,
      ordersPreserved: true,
    });
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: { redacted } };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function getWhatsappCustomersAction(
  query = ""
): Promise<WhatsappActionResult<WhatsappCustomerDirectory>> {
  try {
    const { admin } = await requireChannelUser(true);
    return { success: true, data: await loadWhatsappCustomerDirectory(admin, query) };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function getWhatsappCustomerDetailAction(
  customerId: string
): Promise<WhatsappActionResult<WhatsappCustomerDetail>> {
  try {
    const { admin } = await requireChannelUser(true);
    return { success: true, data: await loadWhatsappCustomerDetail(admin, customerId) };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function updateWhatsappCustomerAction(input: {
  customerId: string;
  displayName: string;
}): Promise<WhatsappActionResult> {
  try {
    const displayName = input.displayName.trim().replace(/\s+/g, " ");
    if (!displayName) throw new Error("Escribe el nombre del cliente");
    if (displayName.length > 120) throw new Error("El nombre es demasiado largo");
    const { userId, admin } = await requireChannelUser(true);
    const updated = await admin
      .from("customers")
      .update({ display_name: displayName })
      .eq("id", input.customerId)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("No se encontró el cliente");
    await audit(userId, "update_customer", "customer", input.customerId, {
      changedFields: ["display_name"],
    });
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function saveWhatsappCustomerAddressAction(input: {
  customerId: string;
  addressId?: string | null;
  label: string;
  addressText: string;
  reference: string;
  isDefault: boolean;
}): Promise<WhatsappActionResult> {
  try {
    const label = input.label.trim().replace(/\s+/g, " ").slice(0, 80);
    const addressText = input.addressText.trim().replace(/\s+/g, " ");
    const reference = input.reference.trim().replace(/\s+/g, " ");
    if (addressText.length < 8) throw new Error("Escribe un domicilio más completo");
    if (addressText.length > 500) throw new Error("El domicilio es demasiado largo");
    if (reference.length > 300) throw new Error("La referencia es demasiado larga");

    const { userId, admin } = await requireChannelUser(true);
    const customer = await admin
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .maybeSingle();
    if (customer.error) throw customer.error;
    if (!customer.data) throw new Error("No se encontró el cliente");

    let addressId = input.addressId ?? null;
    let previousAddress = "";
    if (addressId) {
      const existing = await admin
        .from("customer_addresses")
        .select("id,address_text")
        .eq("id", addressId)
        .eq("customer_id", input.customerId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new Error("No se encontró el domicilio");
      previousAddress = existing.data.address_text;
    }

    const addressCount = await admin
      .from("customer_addresses")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", input.customerId);
    if (addressCount.error) throw addressCount.error;
    const isDefault = input.isDefault || (addressCount.count ?? 0) === 0;
    let previousDefaultId: string | null = null;
    if (isDefault) {
      const previousDefault = await admin
        .from("customer_addresses")
        .select("id")
        .eq("customer_id", input.customerId)
        .eq("is_default", true)
        .maybeSingle();
      if (previousDefault.error) throw previousDefault.error;
      previousDefaultId = previousDefault.data?.id ?? null;
      const unset = await admin
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", input.customerId)
        .eq("is_default", true);
      if (unset.error) throw unset.error;
    }

    const addressChanged = Boolean(addressId && previousAddress !== addressText);
    const payload = {
      label,
      address_text: addressText,
      reference,
      is_default: isDefault,
      ...(addressChanged
        ? {
            formatted_address: null,
            colony: null,
            latitude: null,
            longitude: null,
            distance_meters: null,
            delivery_fee: null,
            geocoded_at: null,
            confirmed_at: null,
            confirmation_method: null,
          }
        : {}),
    };
    try {
      if (addressId) {
        const updated = await admin
          .from("customer_addresses")
          .update(payload)
          .eq("id", addressId)
          .eq("customer_id", input.customerId)
          .select("id")
          .maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) throw new Error("No se pudo actualizar el domicilio");
      } else {
        const inserted = await admin
          .from("customer_addresses")
          .insert({ ...payload, customer_id: input.customerId })
          .select("id")
          .single();
        if (inserted.error) throw inserted.error;
        addressId = inserted.data.id;
      }
    } catch (writeError) {
      if (isDefault && previousDefaultId) {
        await admin
          .from("customer_addresses")
          .update({ is_default: true })
          .eq("id", previousDefaultId)
          .eq("customer_id", input.customerId);
      }
      throw writeError;
    }

    await audit(userId, "save_customer_address", "customer_address", addressId ?? "", {
      customerId: input.customerId,
      isDefault,
      addressChanged,
    });
    revalidatePath("/dashboard/whatsapp");
    return { success: true, data: undefined };
  } catch (error) {
    const detail = message(error);
    if (detail.toLowerCase().includes("duplicate")) {
      return { success: false, error: "Este domicilio ya está guardado" };
    }
    return { success: false, error: detail };
  }
}
