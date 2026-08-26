import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuItem, Order } from "@/types/database";
import { buildConversationCatalog } from "./catalog";
import { createConversation, handleConversationMessage } from "./conversation-engine";
import type { readWhatsappServerConfig } from "./config.server";
import type { NormalizedMetaMessage, NormalizedMetaWebhook } from "./meta-webhook";
import { sendMetaTextMessage } from "./meta-provider";
import {
  applyOutboundStatuses,
  claimInboundMessage,
  createExternalOrder,
  markInboundMessage,
  recordOutboundMessage,
  saveConversationResult,
} from "./repository.server";
import type {
  ConversationCatalog,
  ConversationResult,
  ConversationState,
} from "./types";

type WhatsappConfig = ReturnType<typeof readWhatsappServerConfig>;

export type MetaProcessingSummary = {
  processed: number;
  duplicates: number;
  repliesSent: number;
  replyFailures: number;
  ordersCreated: number;
  processingFailures: number;
};

const dryRunConversations = new Map<string, ConversationState>();
const dryRunMessageIds = new Set<string>();
const MAX_DRY_RUN_MESSAGES = 500;

function trimDryRunMessageIds() {
  if (dryRunMessageIds.size <= MAX_DRY_RUN_MESSAGES) return;
  const oldest = dryRunMessageIds.values().next().value;
  if (oldest) dryRunMessageIds.delete(oldest);
}

async function loadCatalog(): Promise<ConversationCatalog> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(is_active)"
    )
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return buildConversationCatalog((data ?? []) as unknown as MenuItem[]);
}

function messageInput(message: NormalizedMetaMessage, state: ConversationState) {
  if (message.type === "text") return message.text;
  if (message.type === "location" && message.location) {
    if (state.stage !== "awaiting_address") return null;
    const { latitude, longitude } = message.location;
    return `Ubicación compartida: https://www.google.com/maps?q=${latitude},${longitude}`;
  }
  return null;
}

function unsupportedResult(state: ConversationState): ConversationResult {
  return {
    state,
    action: "none",
    reply:
      state.stage === "awaiting_address"
        ? "Envíame la dirección por escrito o comparte tu ubicación desde WhatsApp."
        : "Por ahora puedo procesar mensajes de texto y ubicaciones compartidas.",
  };
}

function dryRunResult(result: ConversationResult) {
  if (result.action !== "request_order_creation") return result;
  return {
    ...result,
    action: "none" as const,
    reply:
      "Pedido confirmado en modo de prueba. No se registró en cocina, caja, inventario ni impresión.",
  };
}

async function sendReply(
  config: WhatsappConfig,
  phone: string,
  body: string
) {
  if (!config.accessToken || !config.phoneNumberId) return null;
  return sendMetaTextMessage(
    { to: phone, body },
    {
      graphApiVersion: config.graphApiVersion,
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
    }
  );
}

async function notifyKitchen(order: Order) {
  const admin = createAdminClient();
  const { error } = await admin.functions.invoke("send-order-notification", {
    body: { orderId: order.id, event: "new_order" },
  });
  if (error) {
    console.warn("El pedido de WhatsApp se creó, pero el aviso Push no pudo solicitarse.");
  }
}

async function processDryRunMessage(
  message: NormalizedMetaMessage,
  catalog: ConversationCatalog,
  config: WhatsappConfig,
  summary: MetaProcessingSummary
) {
  if (dryRunMessageIds.has(message.id)) {
    summary.duplicates += 1;
    return;
  }
  dryRunMessageIds.add(message.id);
  trimDryRunMessageIds();

  const current = dryRunConversations.get(message.phone) ?? createConversation(message.phone);
  const input = messageInput(message, current);
  const result = dryRunResult(
    input === null
      ? unsupportedResult(current)
      : handleConversationMessage(current, input, catalog)
  );
  dryRunConversations.set(message.phone, result.state);
  summary.processed += 1;

  try {
    const sent = await sendReply(config, message.phone, result.reply);
    if (sent) summary.repliesSent += 1;
    else summary.replyFailures += 1;
  } catch {
    summary.replyFailures += 1;
  }
}

async function processPersistentMessage(
  message: NormalizedMetaMessage,
  catalog: ConversationCatalog,
  config: WhatsappConfig,
  summary: MetaProcessingSummary
) {
  const claimed = await claimInboundMessage(message);
  if (claimed.duplicate) {
    summary.duplicates += 1;
    return;
  }

  try {
    const input = messageInput(message, claimed.state);
    let result =
      input === null
        ? unsupportedResult(claimed.state)
        : handleConversationMessage(claimed.state, input, catalog);
    let createdOrder: Order | null = null;

    if (result.action === "request_order_creation") {
      try {
        createdOrder = await createExternalOrder({
          externalOrderId: message.id,
          conversationId: claimed.id,
          state: result.state,
        });
        result = {
          ...result,
          reply: `Pedido #${createdOrder.number} confirmado y enviado a cocina. Total $${createdOrder.total}.`,
        };
        summary.ordersCreated += 1;
      } catch {
        result = {
          state: { ...result.state, stage: "handoff" },
          action: "handoff",
          reply:
            "No pude registrar el pedido automáticamente. Una persona del equipo continuará contigo para no hacerte esperar.",
        };
      }
    }

    await saveConversationResult(claimed.id, result);
    const sent = await sendReply(config, message.phone, result.reply);
    if (sent) {
      await recordOutboundMessage({
        conversationId: claimed.id,
        externalMessageId: sent.messageId,
        phone: message.phone,
        body: result.reply,
      });
      summary.repliesSent += 1;
    } else {
      summary.replyFailures += 1;
    }
    await markInboundMessage(message.id, "received");
    summary.processed += 1;

    if (createdOrder) void notifyKitchen(createdOrder);
  } catch (error) {
    try {
      await markInboundMessage(message.id, "failed");
    } catch {
      console.warn("No se pudo actualizar el estado interno de un mensaje de WhatsApp.");
    }
    throw error;
  }
}

export async function processMetaWebhook(
  webhook: NormalizedMetaWebhook,
  config: WhatsappConfig
): Promise<MetaProcessingSummary> {
  const summary: MetaProcessingSummary = {
    processed: 0,
    duplicates: 0,
    repliesSent: 0,
    replyFailures: 0,
    ordersCreated: 0,
    processingFailures: 0,
  };

  if (!config.dryRun) await applyOutboundStatuses(webhook.statuses);
  if (webhook.messages.length === 0) return summary;

  const catalog = await loadCatalog();
  for (const message of webhook.messages) {
    try {
      if (config.dryRun) {
        await processDryRunMessage(message, catalog, config, summary);
      } else {
        await processPersistentMessage(message, catalog, config, summary);
      }
    } catch {
      summary.processingFailures += 1;
    }
  }
  return summary;
}
