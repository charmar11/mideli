import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serviceFunctionHeaders } from "@/lib/supabase/function-auth";
import type { Order } from "@/types/database";
import { answerBusinessQuestion } from "./business-answers";
import { loadWhatsappCatalog } from "./catalog.server";
import { addressConfirmationReply, deliveryQuoteReply } from "./customer-messages";
import { safeErrorDetail } from "./error-detail";
import {
  createConversation,
  conversationSummaryReply,
  handleConversationMessage,
  recoverDeliveryQuote,
  reconcileCartWithCatalog,
  unsupportedMessageHandoff,
  withDeliveryQuote,
  withPendingDeliveryQuote,
} from "./conversation-engine";
import { createGeminiSemanticInterpreter } from "./gemini-interpreter.server";
import { handleHybridConversationMessage } from "./hybrid-interpreter";
import { respectHumanHandoffSetting } from "./handoff-policy";
import type { readWhatsappServerConfig } from "./config.server";
import type { NormalizedMetaMessage, NormalizedMetaWebhook } from "./meta-webhook";
import {
  sendMetaListMessage,
  sendMetaLocationMessage,
  sendMetaReplyButtonsMessage,
  sendMetaTextMessage,
} from "./meta-provider";
import { interactionForState, type WhatsappInteraction } from "./quick-replies";
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
  confirmWhatsappDeliveryQuote,
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
  config: WhatsappConfig,
  operations: WhatsappOperationsConfig,
  deterministic = false
) {
  const businessAnswer = answerBusinessQuestion(message, {
    timezone: operations.settings.timezone,
    storeAddress: operations.settings.store_address,
    hours: operations.hours.map((rule) => ({
      dayOfWeek: rule.day_of_week,
      isOpen: rule.is_open,
      opensAt: rule.opens_at,
      closesAt: rule.closes_at,
    })),
  });
  if (businessAnswer) {
    return { state, reply: businessAnswer, action: "none" as const };
  }
  const localResult = deterministic
    ? handleConversationMessage(state, message, catalog)
    : null;
  const interpreter = config.geminiInterpreterEnabled
    ? createGeminiSemanticInterpreter({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      })
    : null;
  const result = localResult ?? await handleHybridConversationMessage({
      state,
      message,
      catalog,
      interpreter,
      onDiagnostic: (event) => {
        console.info(`[WhatsApp Gemini] ${JSON.stringify(event)}`);
      },
    });
  return respectHumanHandoffSetting(
    result,
    state,
    operations.settings.human_handoff_enabled
  );
}

function stateForInboundMessage(
  state: ConversationState,
  message: NormalizedMetaMessage
) {
  if (
    message.type === "location" &&
    message.location &&
    ["awaiting_address", "awaiting_address_confirmation"].includes(state.stage)
  ) {
    return {
      ...state,
      stage: "awaiting_address" as const,
      address: null,
      addressReference: "",
      addressReferenceCollected: false,
      addressSource: "shared_location" as const,
      addressConfirmed: false,
      pendingDeliveryQuote: null,
      payment: null,
    };
  }
  return state;
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

function messageInput(message: NormalizedMetaMessage, state: ConversationState) {
  if (message.type === "text") {
    return {
      text: message.interactiveId ?? message.text,
      deterministic: Boolean(message.interactiveId),
    };
  }
  if (message.type === "location" && message.location) {
    if (state.stage !== "awaiting_address") return null;
    const { latitude, longitude } = message.location;
    return {
      text: `Ubicación compartida: https://www.google.com/maps?q=${latitude},${longitude}`,
      deterministic: true,
    };
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

async function measuredMetaSend<T>(kind: "text" | "buttons" | "list", send: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await send();
  } finally {
    console.info(JSON.stringify({
      event: "whatsapp_reply",
      kind,
      durationMs: Date.now() - startedAt,
    }));
  }
}

async function sendReply(
  config: WhatsappConfig,
  phone: string,
  body: string,
  state: ConversationState,
  catalog: ConversationCatalog,
  humanHandoffEnabled: boolean,
  includeInteractive = true
) {
  if (!config.accessToken || !config.phoneNumberId) return null;
  const providerConfig = {
    graphApiVersion: config.graphApiVersion,
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  };
  const interaction = includeInteractive
    ? interactionForState(state, catalog, { humanHandoffEnabled })
    : null;
  const interactiveBody = interaction
    ? bodyForInteractiveState(state, body, interaction)
    : body;
  if (interaction && interactiveBody.length <= 1024) {
    try {
      if (interaction.kind === "buttons") {
        const sent = await measuredMetaSend("buttons", () =>
          sendMetaReplyButtonsMessage(
            { to: phone, body: interactiveBody, buttons: interaction.buttons },
            providerConfig
          )
        );
        return { ...sent, body: interactiveBody };
      }
      const sent = await measuredMetaSend("list", () =>
        sendMetaListMessage(
          {
            to: phone,
            body: interactiveBody,
            buttonText: interaction.buttonText,
            sections: interaction.sections,
          },
          providerConfig
        )
      );
      return { ...sent, body: interactiveBody };
    } catch (error) {
      const detail = safeErrorDetail(error);
      console.warn(`[WhatsApp Meta] El control interactivo falló; se enviará texto: ${detail}`);
    }
  }
  const sent = await measuredMetaSend("text", () =>
    sendMetaTextMessage({ to: phone, body }, providerConfig)
  );
  return { ...sent, body };
}

function interactionOptionsText(interaction: WhatsappInteraction) {
  if (interaction.kind === "buttons") {
    return interaction.buttons.map((button) => `• ${button.title}`).join("\n");
  }
  return interaction.sections
    .flatMap((section) => section.rows)
    .map((row) => `• ${row.title}${row.description ? ` · ${row.description}` : ""}`)
    .join("\n");
}

function bodyForInteractiveState(
  state: ConversationState,
  body: string,
  interaction: WhatsappInteraction
) {
  const options = interactionOptionsText(interaction);

  if (state.stage === "browsing_catalog") {
    return state.selectedCategoryId
      ? `🍽️ Aquí tienes los productos disponibles 😊\n\n${options}`
      : `🍽️ ¡Qué se te antoja hoy! 😊\n\nElige una categoría:\n${options}`;
  }

  if (state.stage === "ordering") {
    if (state.cart.length === 0) {
      return `¡Hola! 👋 Bienvenido a Mideli.\n\n¿Qué se te antoja hoy? 😊\n\n${options}`;
    }
    const prompt = body.search(/\n\n¿Deseas agregar algo más\?/i);
    return prompt >= 0
      ? `${body.slice(0, prompt)}\n\n¿Qué deseas hacer con tu pedido?\n${options}`
      : `${body}\n\n¿Qué deseas hacer con tu pedido?\n${options}`;
  }

  if (state.stage === "awaiting_modifiers") {
    // The full numbered list remains the text fallback. Native controls already
    // contain the options, so repeating them in the body makes the message noisy.
    const conciseBody = body.split("\n\n").slice(0, 2).join("\n\n").trim();
    return conciseBody || body;
  }
  if (state.stage === "awaiting_beverage") {
    return `🥤 ¿Algo para tomar? 😊\n\n${options}`;
  }
  if (state.stage === "awaiting_fulfillment") {
    return `📍 ¿Cómo deseas recibir tu pedido?\n\n${options}`;
  }
  if (state.stage === "awaiting_address" && state.savedAddress) {
    return `${body.replace(
      /^📍 ¿Usamos (?:este domicilio|tu domicilio anterior)\?/i,
      "📍 ¿Usamos este domicilio?"
    )}\n\n${options}`;
  }
  if (state.stage === "awaiting_address_reference") {
    return `🏠 ¿Tienes una referencia para encontrar tu domicilio? Es opcional 😊\n\n${options}`;
  }
  if (state.stage === "awaiting_address_confirmation") {
    return `${body.replace(/\n\n¿Es este punto\?[\s\S]*$/i, "\n\n¿Es correcto?")}\n${options}`;
  }
  if (state.stage === "awaiting_payment") {
    return `💳 Elige cómo pagarás 😊\n\n${options}`;
  }
  if (state.stage === "awaiting_confirmation") {
    return `${body.replace(/\n\n¿Confirmas el pedido\?[\s\S]*$/i, "\n\nRevisa tu pedido y elige una opción:")}\n${options}`;
  }
  if (state.stage === "awaiting_note_scope") {
    return `📝 ¿Dónde quieres guardar la indicación?\n\n${options}`;
  }
  if (state.stage.startsWith("awaiting_edit_")) {
    return `🛠️ ¿Qué deseas cambiar de tu pedido?\n\n${options}`;
  }
  if (state.stage.startsWith("awaiting_note_")) {
    return `📝 Elige una opción para continuar 😊\n\n${options}`;
  }
  return body;
}

async function sendAddressLocation(
  config: WhatsappConfig,
  phone: string,
  quote: ConversationDeliveryQuote
) {
  if (
    !config.accessToken ||
    !config.phoneNumberId ||
    quote.latitude === null ||
    quote.longitude === null
  ) {
    return null;
  }
  return sendMetaLocationMessage(
    {
      to: phone,
      latitude: quote.latitude,
      longitude: quote.longitude,
      name: "Domicilio encontrado",
      address: quote.formattedAddress,
    },
    {
      graphApiVersion: config.graphApiVersion,
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
    }
  );
}

async function confirmQuoteForState(
  conversationId: string | null,
  state: ConversationState,
  quote: ConversationDeliveryQuote,
  operations: WhatsappOperationsConfig
) {
  if (conversationId && operations.persisted) {
    await confirmWhatsappDeliveryQuote({
      conversationId,
      inputAddress: state.address ?? quote.formattedAddress,
      reference: [state.addressReference.trim(), state.deliveryNotes.trim()]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join(" · ")
        .slice(0, 500),
      quote,
      confirmationMethod:
        state.addressSource === "shared_location"
          ? "shared_location"
          : "text_confirmation",
    });
  }
  return withDeliveryQuote(state, quote);
}

async function confirmedDeliveryQuoteResult(
  conversationId: string | null,
  state: ConversationState,
  quote: ConversationDeliveryQuote,
  operations: WhatsappOperationsConfig
): Promise<ConversationResult> {
  const confirmedState = await confirmQuoteForState(
    conversationId,
    state,
    quote,
    operations
  );
  const quoteReply = deliveryQuoteReply(
    state.total,
    quote,
    confirmedState.payment?.method
  );
  return {
    state: confirmedState,
    action: "none",
    reply: confirmedState.stage === "awaiting_confirmation"
      ? `${quoteReply}\n\n${conversationSummaryReply(confirmedState)}`
      : quoteReply,
  };
}

async function notifyKitchen(order: Order) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.warn(
      "[WhatsApp Meta] El pedido se creó, pero el aviso Push no se solicitó: falta la configuración segura de Supabase."
    );
    return;
  }

  const admin = createAdminClient();
  const { error, response } = await admin.functions.invoke("send-order-notification", {
    body: { orderId: order.id, event: "new_order" },
    headers: serviceFunctionHeaders(serviceRoleKey),
  });
  if (error) {
    const status = response ? ` HTTP ${response.status}` : "";
    console.warn(
      `[WhatsApp Meta] El pedido se creó, pero el aviso Push no pudo solicitarse.${status}: ${safeErrorDetail(error)}`
    );
  }
}

async function notifyWhatsappAttention(conversationId: string, eventKey: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.warn(
      "[WhatsApp Meta] No se solicitó el aviso Push: falta la configuración segura de Supabase."
    );
    return;
  }

  const { error, response } = await createAdminClient().functions.invoke(
    "send-whatsapp-attention-notification",
    {
      body: { conversationId, eventKey },
      headers: serviceFunctionHeaders(serviceRoleKey),
    }
  );
  if (error) {
    const status = response ? ` HTTP ${response.status}` : "";
    console.warn(
      `[WhatsApp Meta] El chat requiere atención, pero el aviso Push no pudo solicitarse.${status}: ${safeErrorDetail(error)}`
    );
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
  const preparedState = stateForInboundMessage(current, message);
  const input = messageInput(message, preparedState);
  const channelClosed = !channelIsOpen(operations) && current.stage !== "confirmed";
  let result = dryRunResult(
    input === null
      ? unsupportedMessageHandoff(preparedState)
      : await interpretMessage(
          preparedState,
          input.text,
          catalog,
          config,
          operations,
          input.deterministic
        )
  );
  if (channelClosed) {
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
    if (quoted.status === "quoted") {
      const skipsConfirmation =
        result.state.addressSource === "shared_location" ||
        result.state.addressSource === "saved_confirmed";
      result = skipsConfirmation
        ? await confirmedDeliveryQuoteResult(null, result.state, quoted.quote, operations)
        : {
            state: withPendingDeliveryQuote(result.state, quoted.quote),
            action: "send_address_confirmation",
            reply: addressConfirmationReply(quoted.quote),
          };
    } else {
      result = recoverDeliveryQuote(result.state, quoted.reason);
    }
  } else if (result.action === "confirm_delivery_quote") {
    const quote = result.state.pendingDeliveryQuote;
    result = quote
      ? await confirmedDeliveryQuoteResult(null, result.state, quote, operations)
      : recoverDeliveryQuote(result.state, "delivery_quote_confirmation_incomplete");
  }
  dryRunConversations.set(message.phone, result.state);
  summary.processed += 1;

  if (!operations.settings.auto_reply_enabled) return;

  try {
    let replyBody = result.reply;
    if (result.action === "send_address_confirmation" && result.state.pendingDeliveryQuote) {
      const quote = result.state.pendingDeliveryQuote;
      try {
        const location = await sendAddressLocation(config, message.phone, quote);
        if (location) summary.repliesSent += 1;
        else if (quote.latitude !== null && quote.longitude !== null) {
          replyBody = `${replyBody}\n\nMapa: https://www.google.com/maps?q=${quote.latitude},${quote.longitude}`;
        }
      } catch {
        if (quote.latitude !== null && quote.longitude !== null) {
          replyBody = `${replyBody}\n\nMapa: https://www.google.com/maps?q=${quote.latitude},${quote.longitude}`;
        }
      }
    }
    const sent = await sendReply(
      config,
      message.phone,
      replyBody,
      result.state,
      catalog,
      operations.settings.human_handoff_enabled,
      !channelClosed
    );
    if (sent) summary.repliesSent += 1;
    else summary.replyFailures += 1;
  } catch (error) {
    summary.replyFailures += 1;
    const detail = safeErrorDetail(error);
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
    if (state.stage === "handoff" && operations.settings.human_handoff_enabled) {
      await commitConversationMessage(conversationId, owner, message.id, {
        state,
        action: "none",
        reply: "",
      });
      summary.processed += 1;
      return;
    }
    if (state.stage === "handoff") {
      state = { ...state, stage: "ordering" };
    }
    const preparedState = stateForInboundMessage(state, message);
    const input = messageInput(message, preparedState);
    let result =
      input === null
        ? unsupportedMessageHandoff(preparedState)
        : await interpretMessage(
            preparedState,
            input.text,
            catalog,
            config,
            operations,
            input.deterministic
    );
    let createdOrder: Order | null = null;
    let customerReceived = false;
    const channelClosed = !channelIsOpen(operations) && state.stage !== "confirmed";

    if (channelClosed) {
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
      if (quoted.status === "quoted") {
        const skipsConfirmation =
          result.state.addressSource === "shared_location" ||
          result.state.addressSource === "saved_confirmed";
        result = skipsConfirmation
          ? await confirmedDeliveryQuoteResult(
              conversationId,
              result.state,
              quoted.quote,
              operations
            )
          : {
              state: withPendingDeliveryQuote(result.state, quoted.quote),
              action: "send_address_confirmation",
              reply: addressConfirmationReply(quoted.quote),
            };
      } else {
        result = recoverDeliveryQuote(result.state, quoted.reason);
      }
    } else if (result.action === "confirm_delivery_quote") {
      const quote = result.state.pendingDeliveryQuote;
      result = quote
        ? await confirmedDeliveryQuoteResult(
            conversationId,
            result.state,
            quote,
            operations
          )
        : recoverDeliveryQuote(result.state, "delivery_quote_confirmation_incomplete");
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
        const customerTotal = createdOrder.total + (createdOrder.delivery_fee ?? 0);
        result = {
          ...result,
          reply: `✅ Pedido #${createdOrder.number} confirmado y enviado a cocina. Total $${customerTotal}.`,
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
      let replyBody = result.reply;
      if (result.action === "send_address_confirmation" && result.state.pendingDeliveryQuote) {
        const quote = result.state.pendingDeliveryQuote;
        try {
          const location = await sendAddressLocation(config, message.phone, quote);
          if (location) {
            summary.repliesSent += 1;
            try {
              await recordOutboundMessage({
                conversationId,
                externalMessageId: location.messageId,
                phone: message.phone,
                body: quote.formattedAddress,
                messageType: "location",
                metadata: {
                  latitude: quote.latitude,
                  longitude: quote.longitude,
                },
              });
            } catch {
              console.warn(
                "[WhatsApp Meta] La ubicación se envió, pero no pudo guardarse en el historial."
              );
            }
          } else if (quote.latitude !== null && quote.longitude !== null) {
            replyBody = `${replyBody}\n\nMapa: https://www.google.com/maps?q=${quote.latitude},${quote.longitude}`;
          }
        } catch {
          if (quote.latitude !== null && quote.longitude !== null) {
            replyBody = `${replyBody}\n\nMapa: https://www.google.com/maps?q=${quote.latitude},${quote.longitude}`;
          }
        }
      }
      try {
        const sent = await sendReply(
          config,
          message.phone,
          replyBody,
          result.state,
          catalog,
          operations.settings.human_handoff_enabled,
          !channelClosed
        );
        if (sent) {
          summary.repliesSent += 1;
          try {
            await recordOutboundMessage({
              conversationId,
              externalMessageId: sent.messageId,
              phone: message.phone,
              body: sent.body,
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
        const detail = safeErrorDetail(error);
        try {
          await recordOutboundFailure({
            conversationId,
            inboundMessageId: message.id,
            phone: message.phone,
            body: replyBody,
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

    if (result.state.stage === "handoff") {
      await notifyWhatsappAttention(conversationId, `handoff:${conversationId}:${message.id}`);
    }
    if (createdOrder) await notifyKitchen(createdOrder);
  } catch (error) {
    const detail = safeErrorDetail(error);
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
    loadWhatsappCatalog(),
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
      const detail = safeErrorDetail(error);
      console.error(`[WhatsApp Meta] Falló un mensaje permitido: ${detail}`);
    }
  }
  return summary;
}
