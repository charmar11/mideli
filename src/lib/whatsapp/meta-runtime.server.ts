import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuItem, Order } from "@/types/database";
import { buildConversationCatalog } from "./catalog";
import {
  createConversation,
  recoverDeliveryQuote,
  reconcileCartWithCatalog,
  unsupportedMessageHandoff,
  withDeliveryQuote,
} from "./conversation-engine";
import { createGeminiSemanticInterpreter } from "./gemini-interpreter.server";
import { handleHybridConversationMessage } from "./hybrid-interpreter";
import type { readWhatsappServerConfig } from "./config.server";
import type { NormalizedMetaMessage, NormalizedMetaWebhook } from "./meta-webhook";
import { sendMetaTextMessage } from "./meta-provider";
import { canCreateWhatsappOrder } from "./order-creation-policy";
import {
  acquireConversationProcessing,
  applyOutboundStatuses,
  claimInboundMessage,
  commitConversationMessage,
  createExternalOrder,
  loadConversationForProcessing,
  loadNextPendingInboundMessage,
  markConversationCustomerReceived,
  markInboundMessage,
  recordOutboundFailure,
  recordOutboundMessage,
  releaseConversationProcessing,
} from "./repository.server";
import {
  channelIsOpen,
  loadWhatsappOperationsConfig,
  quoteWhatsappDelivery,
  type WhatsappOperationsConfig,
} from "./operations.server";
import type {
  ConversationCatalog,
  ConversationDeliveryQuote,
  ConversationResult,
  ConversationState,
} from "./types";

type WhatsappConfig = ReturnType<typeof readWhatsappServerConfig>;

async function interpretMessage(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog,
  config: WhatsappConfig
) {
  const interpreter = config.geminiInterpreterEnabled
    ? createGeminiSemanticInterpreter({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      })
    : null;
  return handleHybridConversationMessage({
    state,
    message,
    catalog,
    interpreter,
    onDiagnostic: (event) => {
      console.info(`[WhatsApp Gemini] ${JSON.stringify(event)}`);
    },
  });
}

function deliveryQuoteReply(
  state: ConversationState,
  quote: ConversationDeliveryQuote
) {
  const distanceKm = Math.round((quote.distanceMeters / 1000) * 10) / 10;
  const surcharge = quote.surcharge > 0
    ? `\n🏘️ Recargo de zona: $${quote.surcharge}`
    : "";
  const total = state.total + quote.totalFee;
  const customerAddress = state.address?.startsWith("Ubicación compartida:")
    ? quote.formattedAddress
    : state.address || quote.formattedAddress;
  return `🛵 *¡Sí llegamos hasta tu domicilio!*\n\n📍 ${customerAddress}\n📏 Distancia: ${distanceKm} km\n💰 Tarifa base: $${quote.baseFee}${surcharge}\n🛵 Envío total: *$${quote.totalFee}*\n🧾 Total con envío: *$${total}*\n\n¿Pagarás en efectivo o por transferencia? 😊`;
}

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
      "id,category_id,name,description,price,is_active,whatsapp_enabled,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
    )
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true });
  if (!error) return buildConversationCatalog((data ?? []) as unknown as MenuItem[]);

  // Compatibilidad durante el piloto antes de aplicar la migración pendiente.
  const fallback = await admin
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
    )
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true });
  if (fallback.error) throw fallback.error;
  return buildConversationCatalog((fallback.data ?? []) as unknown as MenuItem[]);
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
  operations: WhatsappOperationsConfig,
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
  let result = dryRunResult(
    input === null
      ? unsupportedMessageHandoff(current)
      : await interpretMessage(current, input, catalog, config)
  );
  if (!channelIsOpen(operations) && current.stage !== "confirmed") {
    result = {
      state: current,
      action: "none",
      reply: operations.settings.closed_message,
    };
  } else if (result.action === "request_delivery_quote") {
    const quoted = await quoteWhatsappDelivery({
      conversationId: null,
      address: result.state.address ?? "",
      config: operations,
    });
    result = quoted.status === "quoted"
      ? {
          state: withDeliveryQuote(result.state, quoted.quote),
          action: "none",
          reply: deliveryQuoteReply(result.state, quoted.quote),
        }
      : recoverDeliveryQuote(result.state, quoted.reason);
  }
  dryRunConversations.set(message.phone, result.state);
  summary.processed += 1;

  if (!operations.settings.auto_reply_enabled) return;

  try {
    const sent = await sendReply(config, message.phone, result.reply);
    if (sent) summary.repliesSent += 1;
    else summary.replyFailures += 1;
  } catch (error) {
    summary.replyFailures += 1;
    const detail = error instanceof Error ? error.message : "Error desconocido";
    console.warn(`[WhatsApp Meta] No se pudo enviar la respuesta: ${detail}`);
  }
}

async function processQueuedMessage(
  message: NormalizedMetaMessage,
  conversationId: string,
  owner: string,
  state: ConversationState,
  catalog: ConversationCatalog,
  config: WhatsappConfig,
  operations: WhatsappOperationsConfig,
  summary: MetaProcessingSummary
) {
  try {
    if (state.stage === "handoff") {
      await commitConversationMessage(conversationId, owner, message.id, {
        state,
        action: "none",
        reply: "",
      });
      summary.processed += 1;
      return;
    }
    const input = messageInput(message, state);
    let result =
      input === null
        ? unsupportedMessageHandoff(state)
        : await interpretMessage(state, input, catalog, config);
    let createdOrder: Order | null = null;
    let customerReceived = false;

    if (!channelIsOpen(operations) && state.stage !== "confirmed") {
      result = {
        state,
        action: "none",
        reply: operations.settings.closed_message,
      };
    } else if (result.action === "request_delivery_quote") {
      const quoted = await quoteWhatsappDelivery({
        conversationId,
        address: result.state.address ?? "",
        config: operations,
      });
      result = quoted.status === "quoted"
        ? {
            state: withDeliveryQuote(result.state, quoted.quote),
            action: "none",
            reply: deliveryQuoteReply(result.state, quoted.quote),
          }
        : recoverDeliveryQuote(result.state, quoted.reason);
    } else if (result.action === "mark_customer_received") {
      customerReceived = true;
    }

    if (result.action === "request_order_creation") {
      const reconciliation = reconcileCartWithCatalog(result.state, catalog);
      if (reconciliation.removed.length > 0) {
        const removedNames = reconciliation.removed.map((line) => line.name).join(", ");
        const alternatives = reconciliation.alternatives.length > 0
          ? ` Puedes elegir: ${reconciliation.alternatives.map((item) => item.name).join(", ")}.`
          : " Dime qué otro producto deseas agregar.";
        result = {
          state: reconciliation.state,
          action: "none",
          reply: `${removedNames} dejó de estar disponible y lo quité del pedido.${alternatives} Te mostraré el total actualizado antes de confirmar de nuevo.`,
        };
      } else if (!canCreateWhatsappOrder({
        serverEnabled: config.orderCreationEnabled,
        operationsEnabled: operations.settings.create_orders_enabled,
      })) {
        result = {
          state: { ...result.state, stage: "handoff" },
          action: "handoff",
          reply: "✅ Recibimos tu pedido. Una persona del equipo lo revisará contigo antes de enviarlo a cocina.",
        };
      } else try {
        createdOrder = await createExternalOrder({
          externalOrderId: message.id,
          conversationId,
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

    await commitConversationMessage(conversationId, owner, message.id, result);
    if (customerReceived) await markConversationCustomerReceived(conversationId);
    summary.processed += 1;

    if (operations.settings.auto_reply_enabled) {
      try {
        const sent = await sendReply(config, message.phone, result.reply);
        if (sent) {
          summary.repliesSent += 1;
          try {
            await recordOutboundMessage({
              conversationId,
              externalMessageId: sent.messageId,
              phone: message.phone,
              body: result.reply,
            });
          } catch {
            console.warn(
              "[WhatsApp Meta] La respuesta se envió, pero no pudo guardarse en el historial."
            );
          }
        } else {
          summary.replyFailures += 1;
        }
      } catch (error) {
        summary.replyFailures += 1;
        const detail = error instanceof Error ? error.message : "Error desconocido";
        try {
          await recordOutboundFailure({
            conversationId,
            inboundMessageId: message.id,
            phone: message.phone,
            body: result.reply,
            error: detail,
          });
        } catch {
          console.warn(
            "[WhatsApp Meta] La respuesta fallida tampoco pudo guardarse en el historial."
          );
        }
        console.warn(`[WhatsApp Meta] No se pudo enviar la respuesta: ${detail}`);
      }
    }

    if (createdOrder) void notifyKitchen(createdOrder);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    try {
      await markInboundMessage(message.id, "failed", detail);
    } catch {
      console.warn("No se pudo actualizar el estado interno de un mensaje de WhatsApp.");
    }
    throw error;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireProcessingTurn(conversationId: string, owner: string) {
  const deadline = Date.now() + 6_000;
  do {
    if (await acquireConversationProcessing(conversationId, owner)) return true;
    await wait(120);
  } while (Date.now() < deadline);
  return false;
}

async function processPersistentMessage(
  message: NormalizedMetaMessage,
  catalog: ConversationCatalog,
  config: WhatsappConfig,
  operations: WhatsappOperationsConfig,
  summary: MetaProcessingSummary
) {
  const claimed = await claimInboundMessage(message);
  if (claimed.duplicate) {
    summary.duplicates += 1;
    return;
  }

  const owner = randomUUID();
  const acquired = await acquireProcessingTurn(claimed.id, owner);
  if (!acquired) {
    throw new Error("La conversación sigue ocupada y el mensaje quedó pendiente");
  }

  try {
    while (true) {
      const conversation = await loadConversationForProcessing(claimed.id);
      const pending = await loadNextPendingInboundMessage(
        claimed.id,
        conversation.phone
      );
      if (!pending) break;
      await processQueuedMessage(
        pending,
        claimed.id,
        owner,
        conversation.state,
        catalog,
        config,
        operations,
        summary
      );
    }
  } finally {
    await releaseConversationProcessing(claimed.id, owner);
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

  const [catalog, operations] = await Promise.all([
    loadCatalog(),
    loadWhatsappOperationsConfig(),
  ]);
  if (!operations.settings.receive_enabled) return summary;
  for (const message of webhook.messages) {
    try {
      if (config.dryRun) {
        await processDryRunMessage(message, catalog, config, operations, summary);
      } else {
        await processPersistentMessage(message, catalog, config, operations, summary);
      }
    } catch (error) {
      summary.processingFailures += 1;
      const detail = error instanceof Error ? error.message : "Error desconocido";
      console.error(`[WhatsApp Meta] Falló un mensaje permitido: ${detail}`);
    }
  }
  return summary;
}
