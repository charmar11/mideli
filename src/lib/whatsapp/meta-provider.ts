import "server-only";

import { assertMideliWhatsappAvailable } from "@/lib/business-license-server";
import {
  sendMetaListMessage as sendMetaListMessageWithAvailability,
  sendMetaLocationMessage as sendMetaLocationMessageWithAvailability,
  sendMetaReplyButtonsMessage as sendMetaReplyButtonsMessageWithAvailability,
  sendMetaTemplateMessage as sendMetaTemplateMessageWithAvailability,
  sendMetaTextMessage as sendMetaTextMessageWithAvailability,
  type MetaListMessage,
  type MetaLocationMessage,
  type MetaProviderConfig,
  type MetaReplyButtonsMessage,
  type MetaTemplateMessage,
  type MetaTextMessage,
} from "./meta-sender";

export type {
  MetaListMessage,
  MetaLocationMessage,
  MetaProviderConfig,
  MetaReplyButtonsMessage,
  MetaTemplateMessage,
  MetaTextMessage,
} from "./meta-sender";

export function sendMetaTextMessage(
  message: MetaTextMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  return sendMetaTextMessageWithAvailability(
    message,
    config,
    assertMideliWhatsappAvailable,
    fetcher,
  );
}

export function sendMetaTemplateMessage(
  message: MetaTemplateMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  return sendMetaTemplateMessageWithAvailability(
    message,
    config,
    assertMideliWhatsappAvailable,
    fetcher,
  );
}

export function sendMetaLocationMessage(
  message: MetaLocationMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  return sendMetaLocationMessageWithAvailability(
    message,
    config,
    assertMideliWhatsappAvailable,
    fetcher,
  );
}

export function sendMetaReplyButtonsMessage(
  message: MetaReplyButtonsMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  return sendMetaReplyButtonsMessageWithAvailability(
    message,
    config,
    assertMideliWhatsappAvailable,
    fetcher,
  );
}

export function sendMetaListMessage(
  message: MetaListMessage,
  config: MetaProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  return sendMetaListMessageWithAvailability(
    message,
    config,
    assertMideliWhatsappAvailable,
    fetcher,
  );
}
