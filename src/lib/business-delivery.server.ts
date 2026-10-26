import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseBusinessDeliveryRates,
  parseBusinessDeliverySurcharges,
  type BusinessDeliveryOrigin,
  type BusinessDeliverySettings,
} from "@/lib/business-delivery";

type DeliverySettingsRow = {
  business_id: string;
  origin_address: string;
  origin_latitude: number | string | null;
  origin_longitude: number | string | null;
  delivery_rates: unknown;
  delivery_surcharges: unknown;
};

function optionalCoordinate(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function originFromRow(row: DeliverySettingsRow): BusinessDeliveryOrigin {
  return {
    businessId: row.business_id,
    originAddress: row.origin_address ?? "",
    originLatitude: optionalCoordinate(row.origin_latitude),
    originLongitude: optionalCoordinate(row.origin_longitude),
  };
}

function settingsFromRow(row: DeliverySettingsRow): BusinessDeliverySettings {
  return {
    ...originFromRow(row),
    rates: parseBusinessDeliveryRates(row.delivery_rates),
    surcharges: parseBusinessDeliverySurcharges(row.delivery_surcharges),
  };
}

const DELIVERY_SETTINGS_COLUMNS =
  "business_id,origin_address,origin_latitude,origin_longitude,delivery_rates,delivery_surcharges";

export async function loadBusinessDeliverySettings(businessId: string) {
  const { data, error } = await createAdminClient()
    .from("business_delivery_settings")
    .select(DELIVERY_SETTINGS_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return settingsFromRow(data as DeliverySettingsRow);
}

export async function loadBusinessDeliveryOrigins(businessIds: string[]) {
  if (businessIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("business_delivery_settings")
    .select(DELIVERY_SETTINGS_COLUMNS)
    .in("business_id", businessIds);
  if (error) throw error;
  return (data ?? []).map((row) => originFromRow(row as DeliverySettingsRow));
}
