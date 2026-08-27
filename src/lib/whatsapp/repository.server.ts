import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types/database";
import { createConversation, hydrateConversation } from "./conversation-engine";
import type {
  ConversationResult,
  ConversationState,
} from "./types";
import { isMissingWhatsappSchema } from "./schema-compat";
import type {
  NormalizedMetaMessage,
  NormalizedMetaStatus,
} from "./meta-webhook";

type ConversationRow = {
  id: string;
  external_contact_id: string;
  status: "active" | "handoff" | "confirmed" | "cancelled" | "closed";
  stage: ConversationState["stage"];
  state: unknown;
};

export type ClaimedConversation = {
  id: string;
  duplicate: boolean;
};

export type ConversationProcessingSnapshot = {
  id: string;
  phone: string;
  state: ConversationState;
};

type PendingMessageRow = {
  external_message_id: string;
  message_type: NormalizedMetaMessage["type"];
  body: string;
  metadata: unknown;
  occurred_at: string;
};

function messageDate(timestamp: string) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function conversationState(value: unknown, phone: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createConversation(phone);
  }
  const state = value as Partial<ConversationState>;
  if (
    state.phone !== phone ||
    !Array.isArray(state.cart) ||
    typeof state.stage !== "string" ||
    typeof state.total !== "number"
  ) {
    return createConversation(phone);
  }
  return hydrateConversation(state, phone);
}

async function findOpenConversation(
  admin: SupabaseClient,
  phone: string
) {
  return admin
    .from("channel_conversations")
    .select("id,external_contact_id,status,stage,state")
    .eq("provider", "meta")
    .eq("external_contact_id", phone)
    .in("status", ["active", "handoff", "confirmed"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function ensureConversation(
  admin: SupabaseClient,
  phone: string
) {
  const existing = await findOpenConversation(admin, phone);
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ConversationRow;

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .upsert({ phone }, { onConflict: "phone" })
    .select("id")
    .single();
  if (customerError || !customer) {
    throw customerError ?? new Error("No se pudo registrar al cliente");
  }

  const initialState = createConversation(phone);
  const saved = await admin
    .from("customer_addresses")
    .select("id,address_text,formatted_address,reference")
    .eq("customer_id", customer.id)
    .order("last_used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) {
    initialState.savedAddress = {
      id: saved.data.id,
      address: saved.data.formatted_address || saved.data.address_text,
      reference: saved.data.reference ?? "",
    };
  }
  const inserted = await admin
    .from("channel_conversations")
    .insert({
      provider: "meta",
      external_contact_id: phone,
      customer_id: customer.id,
      status: "active",
      stage: initialState.stage,
      state: initialState,
    })
    .select("id,external_contact_id,status,stage,state")
    .single();

  if (!inserted.error && inserted.data) {
    return inserted.data as ConversationRow;
  }

  // Dos entregas simultáneas pueden intentar abrir la misma conversación.
  // El índice parcial decide cuál gana y la segunda reutiliza esa fila.
  const raced = await findOpenConversation(admin, phone);
  if (raced.error || !raced.data) {
    throw inserted.error ?? raced.error ?? new Error("No se pudo abrir la conversación");
  }
  return raced.data as ConversationRow;
}

export async function claimInboundMessage(
  message: NormalizedMetaMessage
): Promise<ClaimedConversation> {
  const admin = createAdminClient();
  const conversation = await ensureConversation(admin, message.phone);
  const metadata = {
    ...(message.location ? { location: message.location } : {}),
    phoneNumberId: message.phoneNumberId,
  };
  const { data, error } = await admin
    .from("channel_messages")
    .upsert(
      {
        conversation_id: conversation.id,
        provider: "meta",
        external_message_id: message.id,
        direction: "inbound",
        message_type: message.type,
        body: message.text,
        status: "processing",
        metadata,
        occurred_at: messageDate(message.timestamp),
      },
      {
        onConflict: "provider,external_message_id",
        ignoreDuplicates: true,
      }
    )
    .select("id");
  if (error) throw error;

  let duplicate = !data || data.length === 0;
  if (duplicate) {
    const existing = await admin
      .from("channel_messages")
      .select("status")
      .eq("provider", "meta")
      .eq("external_message_id", message.id)
      .eq("direction", "inbound")
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "failed") {
      const retried = await admin
        .from("channel_messages")
        .update({
          status: "processing",
          processing_started_at: null,
          processing_finished_at: null,
          processing_error: null,
        })
        .eq("provider", "meta")
        .eq("external_message_id", message.id)
        .eq("direction", "inbound")
        .eq("status", "failed");
      if (retried.error) throw retried.error;
      duplicate = false;
    }
  }
  if (!duplicate) {
    const { error: updateError } = await admin
      .from("channel_conversations")
      .update({ last_inbound_at: messageDate(message.timestamp) })
      .eq("id", conversation.id);
    if (updateError) throw updateError;
  }

  return {
    id: conversation.id,
    duplicate,
  };
}

export async function acquireConversationProcessing(
  conversationId: string,
  owner: string
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_whatsapp_conversation_processing", {
    p_conversation_id: conversationId,
    p_owner: owner,
    p_lease_seconds: 45,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseConversationProcessing(
  conversationId: string,
  owner: string
) {
  const { error } = await createAdminClient().rpc(
    "release_whatsapp_conversation_processing",
    { p_conversation_id: conversationId, p_owner: owner }
  );
  if (error) throw error;
}

export async function loadConversationForProcessing(
  conversationId: string
): Promise<ConversationProcessingSnapshot> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_conversations")
    .select("id,external_contact_id,state")
    .eq("id", conversationId)
    .single();
  if (error || !data) throw error ?? new Error("La conversación no existe");
  return {
    id: data.id,
    phone: data.external_contact_id,
    state: conversationState(data.state, data.external_contact_id),
  };
}

function locationFromMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const location = (value as Record<string, unknown>).location;
  if (!location || typeof location !== "object" || Array.isArray(location)) return null;
  const record = location as Record<string, unknown>;
  if (typeof record.latitude !== "number" || typeof record.longitude !== "number") {
    return null;
  }
  return { latitude: record.latitude, longitude: record.longitude };
}

export async function loadNextPendingInboundMessage(
  conversationId: string,
  phone: string
): Promise<NormalizedMetaMessage | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_messages")
    .select("external_message_id,message_type,body,metadata,occurred_at")
    .eq("conversation_id", conversationId)
    .eq("provider", "meta")
    .eq("direction", "inbound")
    .eq("status", "processing")
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as PendingMessageRow;
  const started = await admin
    .from("channel_messages")
    .update({ processing_started_at: new Date().toISOString() })
    .eq("provider", "meta")
    .eq("external_message_id", row.external_message_id)
    .eq("direction", "inbound")
    .eq("status", "processing");
  if (started.error) throw started.error;

  const timestamp = Math.floor(new Date(row.occurred_at).getTime() / 1000).toString();
  return {
    id: row.external_message_id,
    phone,
    phoneNumberId: "",
    timestamp,
    type: row.message_type,
    text: row.body,
    location: locationFromMetadata(row.metadata),
  };
}

function statusForResult(result: ConversationResult) {
  if (result.state.stage === "handoff") return "handoff";
  if (result.state.stage === "confirmed") return "confirmed";
  if (result.state.stage === "cancelled") return "cancelled";
  return "active";
}

export async function commitConversationMessage(
  conversationId: string,
  owner: string,
  externalMessageId: string,
  result: ConversationResult
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("commit_whatsapp_conversation_message", {
    p_conversation_id: conversationId,
    p_owner: owner,
    p_external_message_id: externalMessageId,
    p_state: result.state,
    p_stage: result.state.stage,
    p_status: statusForResult(result),
    p_disable_bot: result.state.stage === "handoff",
  });
  if (error) throw error;
}

export async function markInboundMessage(
  externalMessageId: string,
  status: "received" | "failed" | "ignored",
  processingError?: string
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("channel_messages")
    .update({
      status,
      processing_finished_at: new Date().toISOString(),
      processing_error: processingError?.slice(0, 300) ?? null,
    })
    .eq("provider", "meta")
    .eq("external_message_id", externalMessageId)
    .eq("direction", "inbound");
  if (error) throw error;
}

export async function recordOutboundMessage(input: {
  conversationId: string;
  externalMessageId: string;
  phone: string;
  body: string;
}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("channel_messages").upsert(
    {
      conversation_id: input.conversationId,
      provider: "meta",
      external_message_id: input.externalMessageId,
      direction: "outbound",
      message_type: "text",
      body: input.body,
      status: "sent",
      metadata: { recipient: input.phone },
      occurred_at: now,
    },
    { onConflict: "provider,external_message_id", ignoreDuplicates: true }
  );
  if (error) throw error;

  const { error: updateError } = await admin
    .from("channel_conversations")
    .update({ last_outbound_at: now })
    .eq("id", input.conversationId);
  if (updateError) throw updateError;
}

export async function recordOutboundFailure(input: {
  conversationId: string;
  inboundMessageId: string;
  phone: string;
  body: string;
  error: string;
}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("channel_messages").upsert(
    {
      conversation_id: input.conversationId,
      provider: "meta",
      external_message_id: `failed-reply:${input.inboundMessageId}`,
      direction: "outbound",
      message_type: "text",
      body: input.body,
      status: "failed",
      metadata: {
        recipient: input.phone,
        inboundMessageId: input.inboundMessageId,
        error: input.error.slice(0, 300),
      },
      occurred_at: now,
      processing_finished_at: now,
      processing_error: input.error.slice(0, 300),
    },
    { onConflict: "provider,external_message_id" }
  );
  if (error) throw error;
}

export async function applyOutboundStatuses(statuses: NormalizedMetaStatus[]) {
  if (statuses.length === 0) return;
  const admin = createAdminClient();
  for (const status of statuses) {
    if (!["sent", "delivered", "read", "failed"].includes(status.status)) continue;
    const { error } = await admin
      .from("channel_messages")
      .update({ status: status.status })
      .eq("provider", "meta")
      .eq("external_message_id", status.messageId)
      .eq("direction", "outbound");
    if (error) throw error;

    const { error: notificationError } = await admin
      .from("whatsapp_notification_events")
      .update({ status: status.status })
      .eq("external_message_id", status.messageId);
    if (notificationError && !isMissingWhatsappSchema(notificationError)) {
      throw notificationError;
    }
  }
}

export async function createExternalOrder(input: {
  externalOrderId: string;
  conversationId: string;
  state: ConversationState;
}) {
  const admin = createAdminClient();
  const { state } = input;
  const { data, error } = await admin.rpc("create_external_order_from_channel", {
    p_external_order_id: input.externalOrderId,
    p_conversation_id: input.conversationId,
    p_items: state.cart.map((line) => ({
      menu_item_id: line.menuItemId,
      quantity: line.quantity,
      notes: line.notes,
      selected_modifiers: line.selectedModifiers.map((modifier) => ({
        group_id: modifier.groupId,
        option_id: modifier.optionId,
        group: modifier.groupName,
        option: modifier.optionName,
      })),
    })),
    p_order_type: state.serviceType,
    p_customer_phone: state.phone,
    p_customer_name: "",
    p_delivery_address: state.address ?? "",
    p_delivery_reference: state.addressReference,
    p_notes: "Pedido recibido por WhatsApp",
    p_delivery_fee: state.deliveryQuote?.totalFee ?? 0,
    p_payment_method: state.payment?.method ?? null,
    p_cash_tendered: state.payment?.cashTendered ?? null,
  });
  if (error || !data) {
    throw error ?? new Error("No se pudo crear el pedido externo");
  }
  const order = data as Order;
  if (state.deliveryQuote?.id) {
    const now = new Date().toISOString();
    await admin
      .from("whatsapp_delivery_quotes")
      .update({ used_at: now })
      .eq("id", state.deliveryQuote.id)
      .eq("conversation_id", input.conversationId);
  }
  return order;
}

export async function markConversationCustomerReceived(conversationId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [orders, conversation] = await Promise.all([
    admin
      .from("orders")
      .update({ delivery_status: "customer_received", updated_at: now })
      .eq("channel_conversation_id", conversationId)
      .eq("source_channel", "whatsapp")
      .eq("type", "domicilio"),
    admin
      .from("channel_conversations")
      .update({ status: "closed", closed_at: now, bot_enabled: false })
      .eq("id", conversationId),
  ]);
  if (orders.error) throw orders.error;
  if (conversation.error) throw conversation.error;
}
