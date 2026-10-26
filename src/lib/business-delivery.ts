export type BusinessDeliveryRate = {
  id: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  isActive: boolean;
};

export type BusinessDeliverySurcharge = {
  id: string;
  colonyName: string;
  aliases: string[];
  fee: number;
  isActive: boolean;
};

export type BusinessDeliverySettings = {
  businessId: string;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  rates: BusinessDeliveryRate[];
  surcharges: BusinessDeliverySurcharge[];
};

export type BusinessDeliveryOrigin = Pick<
  BusinessDeliverySettings,
  "businessId" | "originAddress" | "originLatitude" | "originLongitude"
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBusinessDeliveryRates(value: unknown): BusinessDeliveryRate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    const minDistanceKm = finiteNumber(row?.minDistanceKm);
    const maxDistanceKm = finiteNumber(row?.maxDistanceKm);
    const fee = finiteNumber(row?.fee);
    if (
      typeof row?.id !== "string" ||
      minDistanceKm === null ||
      maxDistanceKm === null ||
      fee === null
    ) return [];
    return [{
      id: row.id,
      minDistanceKm,
      maxDistanceKm,
      fee,
      isActive: row.isActive !== false,
    }];
  }).sort((left, right) => left.minDistanceKm - right.minDistanceKm);
}

export function parseBusinessDeliverySurcharges(value: unknown): BusinessDeliverySurcharge[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    const fee = finiteNumber(row?.fee);
    if (typeof row?.id !== "string" || typeof row.colonyName !== "string" || fee === null) {
      return [];
    }
    return [{
      id: row.id,
      colonyName: row.colonyName,
      aliases: Array.isArray(row.aliases)
        ? row.aliases.filter((alias): alias is string => typeof alias === "string")
        : [],
      fee,
      isActive: row.isActive !== false,
    }];
  }).sort((left, right) => left.colonyName.localeCompare(right.colonyName, "es-MX"));
}

export function googleMapsSearchUrl(input: {
  latitude: number | null;
  longitude: number | null;
  address: string;
}): string | null {
  const address = input.address.trim();
  if (input.latitude !== null && input.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${input.latitude},${input.longitude}`;
  }
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
}

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanColony(value: string) {
  return oneLine(value).replace(/^(?:col(?:onia)?|frac(?:c(?:ionamiento)?)?)\.?\s+/i, "");
}

export function formatDeliveryAddressForDriver(address: string, colony: string) {
  const streetAndNumber = oneLine(address).split(/[,;]+/)[0]?.trim() ?? "";
  const cleanNeighborhood = cleanColony(colony);
  return [streetAndNumber, cleanNeighborhood]
    .filter(Boolean)
    .join(", ") || "Domicilio no disponible";
}
