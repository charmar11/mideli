import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types/database";
import { createConversation } from "./conversation-engine";
import type {
  ConversationResult,
  ConversationState,
} from "./types";
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
  state: ConversationState;
  duplicate: boolean;
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
  return state as ConversationState;
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
    .in("status", ["active", "handoff"])
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
  const metadata = message.location ? { location: message.location } : {};
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

  const duplicate = !data || data.length === 0;
  if (!duplicate) {
    const { error: updateError } = await admin
      .from("channel_conversations")
      .update({ last_inbound_at: messageDate(message.timestamp) })
      .eq("id", conversation.id);
    if (updateError) throw updateError;
  }

  return {
    id: conversation.id,
    state: conversationState(conversation.state, message.phone),
    duplicate,
  };
}

function statusForResult(result: ConversationResult) {
  if (result.state.stage === "handoff") return "handoff";
  if (result.state.stage === "confirmed") return "confirmed";
  if (result.state.stage === "cancelled") return "cancelled";
  return "active";
}

export async function saveConversationResult(
  conversationId: string,
  result: ConversationResult
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("channel_conversations")
    .update({
      state: result.state,
      stage: result.state.stage,
      status: statusForResult(result),
    })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function markInboundMessage(
  externalMessageId: string,
  status: "received" | "failed" | "ignored"
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("channel_messages")
    .update({ status })
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
    p_delivery_reference: "",
    p_notes: "Pedido recibido por WhatsApp",
    p_delivery_fee: 0,
    p_payment_method: state.payment?.method ?? null,
    p_cash_tendered: state.payment?.cashTendered ?? null,
  });
  if (error || !data) {
    throw error ?? new Error("No se pudo crear el pedido externo");
  }
  return data as Order;
}
