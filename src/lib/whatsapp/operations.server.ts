import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WhatsappBusinessHours,
  WhatsappChannelSettings,
  WhatsappDeliveryRate,
  WhatsappDeliverySurcharge,
} from "@/types/database";
import { isWhatsappBusinessOpen, type ScheduleException } from "./business-hours";
import {
  calculateDeliveryPrice,
  resolveDeliveryColonyPricing,
} from "./delivery-pricing";
import {
  computeDrivingDistance,
  geocodeDestination,
  type GeocodedDestination,
} from "./google-maps.server";
import { normalizeAddressForComparison } from "./normalize";
import type { ConversationDeliveryQuote } from "./types";

export type WhatsappOperationsConfig = {
  settings: WhatsappChannelSettings;
  hours: WhatsappBusinessHours[];
  exceptions: ScheduleException[];
  rates: WhatsappDeliveryRate[];
  surcharges: WhatsappDeliverySurcharge[];
  persisted: boolean;
};

export type DeliveryPricingConfig = {
  settings: Pick<WhatsappChannelSettings, "delivery_quotes_enabled" | "store_latitude" | "store_longitude">;
  rates: Array<Pick<WhatsappDeliveryRate, "id" | "min_distance_km" | "max_distance_km" | "fee" | "is_active">>;
  surcharges: Array<Pick<WhatsappDeliverySurcharge, "id" | "colony_name" | "aliases" | "fee" | "is_active">>;
  persisted: boolean;
};

const DEFAULT_SETTINGS: WhatsappChannelSettings = {
  id: 1,
  receive_enabled: true,
  auto_reply_enabled: true,
  create_orders_enabled: false,
  delivery_quotes_enabled: false,
  status_notifications_enabled: true,
  human_handoff_enabled: true,
  timezone: "America/Hermosillo",
  catalog_page_size: 5,
  message_retention_days: 90,
  store_address: "",
  store_latitude: null,
  store_longitude: null,
  closed_message:
    "Por el momento estamos fuera de horario. Abrimos de nuevo en nuestro siguiente horario disponible.",
  updated_by: null,
  created_at: "",
  updated_at: "",
};

const DEFAULT_HOURS: WhatsappBusinessHours[] = Array.from(
  { length: 7 },
  (_, day) => ({
    id: `default-${day}`,
    day_of_week: day,
    is_open: true,
    opens_at: "12:00:00",
    closes_at: "23:00:00",
    updated_by: null,
    updated_at: "",
  })
);

const DEFAULT_RATES: WhatsappDeliveryRate[] = [
  [0, 4, 30],
  [4, 5, 35],
  [5, 6, 40],
  [6, 7, 45],
  [7, 8, 50],
  [8, 9, 55],
  [9, 9.9, 60],
  [9.9, 10, 65],
  [10, 11, 70],
  [11, 12, 75],
  [12, 13, 80],
  [13, 14, 85],
  [14, 15, 90],
].map(([minimum, maximum, fee], index) => ({
  id: `default-${index}`,
  min_distance_km: minimum,
  max_distance_km: maximum,
  fee,
  sort_order: index,
  is_active: true,
  updated_by: null,
  created_at: "",
  updated_at: "",
}));

const DEFAULT_SURCHARGES: WhatsappDeliverySurcharge[] = [
  ["Beltrones", ["Beltrones"], 10],
  ["Pioneros", ["Pioneros de Cajeme"], 10],
  ["Lomas", ["Las Lomas", "Lomas de Ciudad Obregón"], 10],
  ["Providencia", ["Providencia"], 10],
  ["UNISON", ["Universidad de Sonora", "Unison"], 10],
  ["Esperanza", ["Esperanza"], 15],
  ["Santa Catalina", ["Santa Catalina"], 15],
  ["Villa Bonita", ["Villa Bonita"], 15],
].map(([name, aliases, fee], index) => ({
  id: `default-${index}`,
  colony_name: String(name),
  aliases: aliases as string[],
  fee: Number(fee),
  is_active: true,
  updated_by: null,
  created_at: "",
  updated_at: "",
}));

export async function loadWhatsappOperationsConfig(): Promise<WhatsappOperationsConfig> {
  const admin = createAdminClient();
  const [settings, hours, exceptions, rates, surcharges] = await Promise.all([
    admin.from("whatsapp_channel_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("whatsapp_business_hours").select("*").order("day_of_week"),
    admin
      .from("whatsapp_schedule_exceptions")
      .select("service_date,is_open,opens_at,closes_at")
      .gte("service_date", new Date().toISOString().slice(0, 10))
      .order("service_date"),
    admin.from("whatsapp_delivery_rates").select("*").eq("is_active", true).order("sort_order"),
    admin.from("whatsapp_delivery_surcharges").select("*").eq("is_active", true).order("colony_name"),
  ]);

  const persisted = !settings.error && Boolean(settings.data);
  return {
    settings: (settings.data as WhatsappChannelSettings | null) ?? DEFAULT_SETTINGS,
    hours:
      !hours.error && hours.data?.length
        ? (hours.data as WhatsappBusinessHours[])
        : DEFAULT_HOURS,
    exceptions:
      !exceptions.error
        ? (exceptions.data ?? []).map((item) => ({
            serviceDate: item.service_date,
            isOpen: item.is_open,
            opensAt: item.opens_at,
            closesAt: item.closes_at,
          }))
        : [],
    rates:
      !rates.error && rates.data?.length
        ? (rates.data as WhatsappDeliveryRate[])
        : DEFAULT_RATES,
    surcharges:
      !surcharges.error && surcharges.data?.length
        ? (surcharges.data as WhatsappDeliverySurcharge[])
        : DEFAULT_SURCHARGES,
    persisted,
  };
}

/** Lightweight origin lookup for POS autocomplete; avoids loading all WhatsApp settings per keystroke. */
export async function loadWhatsappStoreOrigin(): Promise<GeocodedDestination | null> {
  const { data, error } = await createAdminClient()
    .from("whatsapp_channel_settings")
    .select("store_latitude,store_longitude,store_address")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (data?.store_latitude === null || data?.store_latitude === undefined ||
      data.store_longitude === null || data.store_longitude === undefined) {
    return null;
  }
  return {
    latitude: Number(data.store_latitude),
    longitude: Number(data.store_longitude),
    formattedAddress: data.store_address ?? "",
    colony: "",
  };
}

export function channelIsOpen(config: WhatsappOperationsConfig, now = new Date()) {
  return isWhatsappBusinessOpen({
    now,
    timeZone: config.settings.timezone,
    hours: config.hours.map((item) => ({
      dayOfWeek: item.day_of_week,
      isOpen: item.is_open,
      opensAt: item.opens_at,
      closesAt: item.closes_at,
    })),
    exceptions: config.exceptions,
  });
}

async function saveCustomerAddress(input: {
  conversationId: string;
  inputAddress: string;
  formattedAddress: string;
  reference: string;
  colony: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  deliveryFee: number;
  confirmationMethod: "text_confirmation" | "shared_location";
}) {
  const admin = createAdminClient();
  const conversation = await admin
    .from("channel_conversations")
    .select("customer_id")
    .eq("id", input.conversationId)
    .single();
  if (conversation.error || !conversation.data) return null;
  const addresses = await admin
    .from("customer_addresses")
    .select("id,address_text,formatted_address")
    .eq("customer_id", conversation.data.customer_id);
  if (addresses.error) throw addresses.error;
  const normalizedInput = normalizeAddressForComparison(input.inputAddress);
  const normalizedFormatted = normalizeAddressForComparison(input.formattedAddress);
  const existing = (addresses.data ?? []).find(
    (address) => {
      const savedInput = normalizeAddressForComparison(address.address_text);
      const savedFormatted = normalizeAddressForComparison(address.formatted_address ?? "");
      return (
        (normalizedInput && (savedInput === normalizedInput || savedFormatted === normalizedInput)) ||
        (normalizedFormatted && (savedInput === normalizedFormatted || savedFormatted === normalizedFormatted))
      );
    }
  );
  const payload = {
    address_text: input.inputAddress.trim(),
    formatted_address: input.formattedAddress,
    reference: input.reference,
    colony: input.colony,
    latitude: input.latitude,
    longitude: input.longitude,
    distance_meters: input.distanceMeters,
    delivery_fee: input.deliveryFee,
    geocoded_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    confirmation_method: input.confirmationMethod,
    last_used_at: new Date().toISOString(),
  };
  if (existing) {
    const updated = await admin
      .from("customer_addresses")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updated.error) throw updated.error;
    return updated.data.id;
  }
  const inserted = await admin
    .from("customer_addresses")
    .insert({ ...payload, customer_id: conversation.data.customer_id })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

export async function confirmWhatsappDeliveryQuote(input: {
  conversationId: string;
  inputAddress: string;
  reference: string;
  quote: ConversationDeliveryQuote;
  confirmationMethod: "text_confirmation" | "shared_location";
}) {
  if (
    !input.quote.id ||
    input.quote.latitude === null ||
    input.quote.longitude === null
  ) {
    throw new Error("delivery_quote_confirmation_incomplete");
  }

  const customerAddressId = await saveCustomerAddress({
    conversationId: input.conversationId,
    inputAddress: input.inputAddress,
    formattedAddress: input.quote.formattedAddress,
    reference: input.reference,
    colony: input.quote.colony,
    latitude: input.quote.latitude,
    longitude: input.quote.longitude,
    distanceMeters: input.quote.distanceMeters,
    deliveryFee: input.quote.totalFee,
    confirmationMethod: input.confirmationMethod,
  });

  const updated = await createAdminClient()
    .from("whatsapp_delivery_quotes")
    .update({ status: "quoted", customer_address_id: customerAddressId })
    .eq("id", input.quote.id)
    .eq("conversation_id", input.conversationId)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw updated.error ?? new Error("delivery_quote_not_pending");
  }

  return customerAddressId;
}

export async function quoteWhatsappDelivery(input: {
  conversationId: string | null;
  address: string;
  config?: WhatsappOperationsConfig;
  deliveryConfig?: DeliveryPricingConfig;
  destination?: GeocodedDestination;
  /** Staff-entered colony fallback; the WhatsApp flow leaves it unset. */
  fallbackColony?: string;
  /** POS delivery remains available independently from the WhatsApp bot toggle. */
  allowWhenWhatsappQuotesDisabled?: boolean;
  /** Manual POS-only exception, invoked after staff confirms Maps found no colony. */
  allowMissingColony?: boolean;
}): Promise<
  | { status: "quoted"; quote: ConversationDeliveryQuote }
  | { status: "needs_handoff"; reason: string }
> {
  const deliveryConfig = input.deliveryConfig ?? input.config;
  if (!deliveryConfig) throw new Error("delivery_quote_config_missing");
  const { settings } = deliveryConfig;
  if (
    (!settings.delivery_quotes_enabled && !input.allowWhenWhatsappQuotesDisabled) ||
    settings.store_latitude === null ||
    settings.store_longitude === null
  ) {
    const reason = !settings.delivery_quotes_enabled && !input.allowWhenWhatsappQuotesDisabled
      ? "delivery_quotes_disabled"
      : "store_origin_not_configured";
    if (input.conversationId && deliveryConfig.persisted) {
      await createAdminClient().from("whatsapp_delivery_quotes").insert({
        conversation_id: input.conversationId,
        input_address: input.address,
        status: "failed",
        failure_reason: reason,
      });
    }
    return { status: "needs_handoff", reason };
  }

  try {
    const destination = input.destination ?? (await geocodeDestination(
      input.address,
      undefined,
      input.fallbackColony
    ));
    const colonyPricing = resolveDeliveryColonyPricing({
      colony: destination.colony,
      address: input.address,
      allowUnregisteredColony: input.allowMissingColony === true,
    });
    if (colonyPricing.status === "confirmation_required") {
      if (input.conversationId && deliveryConfig.persisted) {
        await createAdminClient().from("whatsapp_delivery_quotes").insert({
          conversation_id: input.conversationId,
          input_address: input.address,
          formatted_address: destination.formattedAddress,
          latitude: destination.latitude,
          longitude: destination.longitude,
          status: "failed",
          failure_reason: "colony_missing",
        });
      }
      return { status: "needs_handoff", reason: "colony_missing" };
    }
    const distanceMeters = await computeDrivingDistance(
      {
        latitude: settings.store_latitude,
        longitude: settings.store_longitude,
      },
      destination
    );
    const maximumDistanceKm = Math.max(
      0,
      ...deliveryConfig.rates
        .filter((rate) => rate.is_active)
        .map((rate) => Number(rate.max_distance_km)),
    );
    const price = calculateDeliveryPrice({
      distanceMeters,
      colony: colonyPricing.colony,
      colonySearchText: colonyPricing.colonySearchText,
      rates: deliveryConfig.rates.map((rate) => ({
        id: rate.id,
        minDistanceKm: Number(rate.min_distance_km),
        maxDistanceKm: Number(rate.max_distance_km),
        fee: Number(rate.fee),
        isActive: rate.is_active,
      })),
      surcharges: deliveryConfig.surcharges.map((rule) => ({
        id: rule.id,
        colonyName: rule.colony_name,
        aliases: rule.aliases,
        fee: Number(rule.fee),
        isActive: rule.is_active,
      })),
      maximumDistanceKm,
    });

    if (price.status === "needs_handoff") {
    if (input.conversationId && deliveryConfig.persisted) {
        await createAdminClient().from("whatsapp_delivery_quotes").insert({
          conversation_id: input.conversationId,
          input_address: input.address,
          formatted_address: destination.formattedAddress,
          colony: destination.colony,
          latitude: destination.latitude,
          longitude: destination.longitude,
          distance_meters: distanceMeters,
          status: "needs_handoff",
          failure_reason: price.reason,
        });
      }
      return { status: "needs_handoff", reason: price.reason };
    }

    let quoteId: string | null = null;
      if (input.conversationId && deliveryConfig.persisted) {
      const inserted = await createAdminClient()
        .from("whatsapp_delivery_quotes")
        .insert({
          conversation_id: input.conversationId,
          input_address: input.address,
          formatted_address: destination.formattedAddress,
          colony: price.colony,
          latitude: destination.latitude,
          longitude: destination.longitude,
          distance_meters: distanceMeters,
          base_fee: price.baseFee,
          surcharge: price.surcharge,
          total_fee: price.totalFee,
          status: "pending_confirmation",
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      quoteId = inserted.data.id;
    }

    return {
      status: "quoted",
      quote: {
        id: quoteId,
        formattedAddress: destination.formattedAddress,
        colony: price.colony || (
          colonyPricing.status === "unregistered"
            ? colonyPricing.displayColony
            : ""
        ),
        latitude: destination.latitude,
        longitude: destination.longitude,
        distanceMeters,
        baseFee: price.baseFee,
        surcharge: price.surcharge,
        totalFee: price.totalFee,
        ...(colonyPricing.status === "unregistered" ? { colonyUnassigned: true } : {}),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "delivery_quote_failed";
    if (input.conversationId && deliveryConfig.persisted) {
      await createAdminClient().from("whatsapp_delivery_quotes").insert({
        conversation_id: input.conversationId,
        input_address: input.address,
        status: "failed",
        failure_reason: reason.slice(0, 200),
      });
    }
    return { status: "needs_handoff", reason };
  }
}
