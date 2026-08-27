import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WhatsappBusinessHours,
  WhatsappChannelSettings,
  WhatsappDeliveryRate,
  WhatsappDeliverySurcharge,
} from "@/types/database";
import { isWhatsappBusinessOpen, type ScheduleException } from "./business-hours";
import { calculateDeliveryPrice } from "./delivery-pricing";
import { computeDrivingDistance, geocodeDestination } from "./google-maps.server";
import type { ConversationDeliveryQuote } from "./types";

export type WhatsappOperationsConfig = {
  settings: WhatsappChannelSettings;
  hours: WhatsappBusinessHours[];
  exceptions: ScheduleException[];
  rates: WhatsappDeliveryRate[];
  surcharges: WhatsappDeliverySurcharge[];
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
    .select("id,address_text")
    .eq("customer_id", conversation.data.customer_id);
  if (addresses.error) throw addresses.error;
  const normalized = input.inputAddress.trim().toLocaleLowerCase("es-MX");
  const existing = (addresses.data ?? []).find(
    (address) => address.address_text.trim().toLocaleLowerCase("es-MX") === normalized
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
  config: WhatsappOperationsConfig;
}): Promise<
  | { status: "quoted"; quote: ConversationDeliveryQuote }
  | { status: "needs_handoff"; reason: string }
> {
  const { settings } = input.config;
  if (
    !settings.delivery_quotes_enabled ||
    settings.store_latitude === null ||
    settings.store_longitude === null
  ) {
    const reason = !settings.delivery_quotes_enabled
      ? "delivery_quotes_disabled"
      : "store_origin_not_configured";
    if (input.conversationId && input.config.persisted) {
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
    const destination = await geocodeDestination(input.address);
    const distanceMeters = await computeDrivingDistance(
      {
        latitude: settings.store_latitude,
        longitude: settings.store_longitude,
      },
      destination
    );
    const price = calculateDeliveryPrice({
      distanceMeters,
      colony: destination.colony,
      colonySearchText: input.address,
      rates: input.config.rates.map((rate) => ({
        id: rate.id,
        minDistanceKm: Number(rate.min_distance_km),
        maxDistanceKm: Number(rate.max_distance_km),
        fee: Number(rate.fee),
        isActive: rate.is_active,
      })),
      surcharges: input.config.surcharges.map((rule) => ({
        id: rule.id,
        colonyName: rule.colony_name,
        aliases: rule.aliases,
        fee: Number(rule.fee),
        isActive: rule.is_active,
      })),
      maximumDistanceKm: 15,
    });

    if (price.status === "needs_handoff") {
      if (input.conversationId && input.config.persisted) {
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
    if (input.conversationId && input.config.persisted) {
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
        colony: price.colony,
        latitude: destination.latitude,
        longitude: destination.longitude,
        distanceMeters,
        baseFee: price.baseFee,
        surcharge: price.surcharge,
        totalFee: price.totalFee,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "delivery_quote_failed";
    if (input.conversationId && input.config.persisted) {
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
