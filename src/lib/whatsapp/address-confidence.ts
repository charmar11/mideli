import { normalizeAddressForComparison, normalizeText } from "./normalize";

export type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GoogleGeocodingResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
};

const ADDRESS_TYPES = new Set(["street_address", "premise", "subpremise"]);
const NAMED_PLACE_TYPES = new Set([
  "airport",
  "church",
  "establishment",
  "hospital",
  "museum",
  "natural_feature",
  "park",
  "point_of_interest",
  "premise",
  "school",
  "shopping_mall",
  "stadium",
  "store",
  "subpremise",
  "tourist_attraction",
  "transit_station",
  "university",
]);

const COLONY_COMPONENT_TYPES = [
  "neighborhood",
  "sublocality_level_1",
  "sublocality",
  "sublocality_level_2",
  "sublocality_level_3",
  "sublocality_level_4",
  "sublocality_level_5",
];

const BROADER_ADMINISTRATIVE_AREA_TYPES = [
  "administrative_area_level_3",
  "administrative_area_level_4",
  "administrative_area_level_5",
  "administrative_area_level_6",
  "administrative_area_level_7",
];

const NON_COLONY_NAMES = new Set([
  "cajeme",
  "ciudad obregon",
  "cd obregon",
  "cdad obregon",
  "obregon",
  "sonora",
  "mexico",
  "mexico mexico",
]);

function isUsableColonyName(value: string) {
  const normalized = normalizeText(value);
  return Boolean(normalized) && !NON_COLONY_NAMES.has(normalized);
}

const LABELED_COLONY_PATTERN =
  /\b(?:col(?:onia)?|frac{1,2}(?:ionamiento)?|residencial(?:\s+privad[oa])?|privada|coto|condominio|conjunto\s+(?:habitacional|residencial)|unidad\s+habitacional|barrio|sector|secci[oó]n|zona|ejido|comunidad|rancho|hacienda|villa|poblado|localidad|quintas?)\.?\s*[:\-]?\s+([^,;|]+)/i;

const LABELED_COLONY_PREFIX =
  /^(?:col(?:onia)?|frac{1,2}(?:ionamiento)?|residencial(?:\s+privad[oa])?|privada|coto|condominio|conjunto\s+(?:habitacional|residencial)|unidad\s+habitacional|barrio|sector|secci[oó]n|zona|ejido|comunidad|rancho|hacienda|villa|poblado|localidad|quintas?)\.?\s*[:\-]?\s+/i;

function cleanColonyName(value: string) {
  return value
    .trim()
    .replace(LABELED_COLONY_PREFIX, "")
    .trim();
}

/**
 * Returns only an explicitly labeled colony/area from the address entered by
 * staff. Google may omit a subdivision from address_components, so this is a
 * safe fallback that does not guess from an unlabeled comma-separated part.
 */
export function extractColonyFromAddressText(value: string) {
  const labeledColony = value.match(LABELED_COLONY_PATTERN)?.[1]?.trim() ?? "";
  const cleaned = cleanColonyName(labeledColony).replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 120 || !isUsableColonyName(cleaned)) return "";
  return cleaned;
}

export type AddressCoordinates = { latitude: number; longitude: number };

/** Extracts coordinates from common Google Maps links or a plain decimal pair. */
export function extractAddressCoordinates(value: string): AddressCoordinates | null {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    // Keep the original text if it contains malformed URL encoding.
  }

  const decimal = "(-?\\d{1,3}\\.\\d+)";
  const patterns = [
    new RegExp(`(?:[?&](?:q|query|ll)=|geo:|ubicaci[oó]n compartida\\s*:\\s*)${decimal}[,\\s]+${decimal}`, "i"),
    new RegExp(`@${decimal},\\s*${decimal}`, "i"),
    new RegExp(`!3d${decimal}!4d${decimal}`, "i"),
    new RegExp(`^\\s*${decimal},\\s*${decimal}\\s*$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

export function extractColonyFromResult(result: GoogleGeocodingResult) {
  const labeledAddressColony = extractColonyFromAddressText(result.formatted_address ?? "");
  if (labeledAddressColony) return labeledAddressColony;

  const neighborhood = result.address_components?.find((item) =>
    item.types?.includes("neighborhood")
  )?.long_name;
  if (neighborhood && isUsableColonyName(neighborhood)) return neighborhood.trim();

  const formattedAddressColony = extractColonyFromFormattedAddress(result);
  if (formattedAddressColony) return formattedAddressColony;

  for (const type of COLONY_COMPONENT_TYPES) {
    const value = result.address_components?.find((item) => item.types?.includes(type))?.long_name;
    const cleanedValue = value ? cleanColonyName(value) : "";
    if (cleanedValue && isUsableColonyName(cleanedValue)) return cleanedValue;
  }

  return "";
}

export function normalizeAddressQuery(value: string) {
  const compact = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");
  const parts = compact.match(
    /^(.*?)(?:,\s*|\s+)(\d{1,6}[a-z]?)(?=\s*(?:,|\bcol(?:onia)?\.?\b|\bfracc(?:ionamiento)?\.?\b|$))\s*,?\s*(.*)$/i
  );
  if (!parts) return compact;
  const street = parts[1].replace(/,\s*$/, "").trim();
  const number = parts[2].trim();
  const area = parts[3]
    .replace(/^(?:col(?:onia)?|fracc(?:ionamiento)?)\.?\s*,?\s*/i, "")
    .trim();
  return [street, number, area].filter(Boolean).join(", ");
}

export function addressQueryCandidates(value: string) {
  return [...new Set([normalizeAddressQuery(value), value.trim()].filter(Boolean))];
}

function component(
  result: GoogleGeocodingResult,
  type: string
) {
  return result.address_components?.find((item) => item.types?.includes(type));
}

function componentNames(result: GoogleGeocodingResult, types: string[]) {
  return new Set(
    (result.address_components ?? [])
      .filter((item) => item.types?.some((type) => types.includes(type)))
      .flatMap((item) => [item.long_name, item.short_name])
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => normalizeText(value))
  );
}

function isAdministrativeAddressPart(value: string, result: GoogleGeocodingResult) {
  const withoutPostalCode = value.replace(/\b\d{5}\b/g, " ").trim();
  const normalized = normalizeText(withoutPostalCode);
  if (!normalized || NON_COLONY_NAMES.has(normalized)) return true;

  const knownAdministrativeNames = componentNames(result, [
    "locality",
    "postal_town",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "country",
  ]);
  if (knownAdministrativeNames.has(normalized)) return true;

  return [...knownAdministrativeNames].some((name) =>
    name.length >= 4 && normalized.includes(name)
  );
}

function extractColonyFromFormattedAddress(result: GoogleGeocodingResult) {
  const parts = (result.formatted_address ?? "")
    .split(",")
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => part && !isAdministrativeAddressPart(part, result));
  if (!parts.length) return "";

  const broaderAdministrativeNames = componentNames(
    result,
    BROADER_ADMINISTRATIVE_AREA_TYPES
  );
  const specificParts = parts.filter(
    (part) => !broaderAdministrativeNames.has(normalizeText(part))
  );

  // Google may include an administrative subdivision (for example, Fundo
  // Legal) after the actual neighborhood in the formatted address. Prefer
  // the first non-administrative segment; retain a sole segment as a fallback
  // for areas Google only exposes at administrative_area_level_3.
  const selected = specificParts[0] ?? (parts.length === 1 ? parts[0] : "");
  const cleaned = selected.replace(/\b\d{5}\b/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length <= 120 && isUsableColonyName(cleaned) ? cleaned : "";
}

function requestedStreetNumber(value: string) {
  const withoutPostalCode = value.replace(/\b(?:c\.?\s*p\.?|cp)\s*\d{5}\b/gi, "");
  const parts = normalizeAddressQuery(withoutPostalCode).split(",").map((part) => part.trim());
  const parsedNumber = parts[1]?.match(/^\d{1,6}[a-z]?$/i)?.[0];
  if (parsedNumber) return normalizeText(parsedNumber);
  const labeledNumber = withoutPostalCode.match(/(?:#|\bn[oº.]?\s*)(\d{1,6}[a-z]?)\b/i)?.[1];
  return labeledNumber ? normalizeText(labeledNumber) : "";
}

function normalizeStreetName(value: string) {
  return normalizeAddressForComparison(value)
    .replace(/\b(?:boulevard|blvd|bulevar|carretera|carr|privada|priv|paseo|pso|circuito|cto|cerrada|cda)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestedStreetName(value: string) {
  const street = normalizeAddressQuery(value).split(",")[0] ?? "";
  return normalizeStreetName(street);
}

function hasExpectedLocality(result: GoogleGeocodingResult) {
  const localityText = [
    result.formatted_address,
    component(result, "locality")?.long_name,
    component(result, "administrative_area_level_2")?.long_name,
  ]
    .filter(Boolean)
    .map((value) => normalizeText(String(value)))
    .join(" ");
  return /\b(ciudad obregon|cd obregon|obregon|cajeme)\b/.test(localityText);
}

function candidateScore(result: GoogleGeocodingResult) {
  let score = 0;
  if (result.types?.some((type) => ADDRESS_TYPES.has(type))) score += 20;
  if (result.types?.some((type) => NAMED_PLACE_TYPES.has(type))) score += 16;
  if (result.geometry?.location_type === "ROOFTOP") score += 10;
  if (result.geometry?.location_type === "RANGE_INTERPOLATED") score += 7;
  if (result.geometry?.location_type === "GEOMETRIC_CENTER") score += 4;
  if (component(result, "street_number")) score += 8;
  if (component(result, "route")) score += 6;
  if (component(result, "sublocality_level_1") || component(result, "neighborhood")) {
    score += 3;
  }
  if (result.partial_match) score -= 4;
  return score;
}

export function selectConfidentAddressResult(
  inputAddress: string,
  results: GoogleGeocodingResult[]
) {
  const expectedNumber = requestedStreetNumber(inputAddress);
  const expectedStreet = requestedStreetName(inputAddress);

  const candidates = results.filter((result) => {
    const types = result.types ?? [];
    if (!hasExpectedLocality(result)) return false;
    if (
      !Number.isFinite(result.geometry?.location?.lat) ||
      !Number.isFinite(result.geometry?.location?.lng)
    ) return false;

    if (types.some((type) => ADDRESS_TYPES.has(type))) {
      const actualStreet = normalizeStreetName(component(result, "route")?.long_name ?? "");
      if (!expectedNumber || !expectedStreet || !actualStreet) return false;
      const actualNumber = normalizeText(component(result, "street_number")?.long_name ?? "");
      return actualNumber === expectedNumber && actualStreet === expectedStreet;
    }

    // Google también devuelve lugares concretos como parques, plazas,
    // escuelas y comercios. Son destinos válidos aunque no tengan número
    // exterior, siempre que el resultado sea un lugar nombrado y pertenezca
    // a la ciudad esperada.
    return types.some((type) => NAMED_PLACE_TYPES.has(type));
  });

  const selected = candidates.sort(
    (left, right) => candidateScore(right) - candidateScore(left)
  )[0];
  if (!selected) {
    throw new Error(expectedNumber ? "address_low_confidence" : "address_number_required");
  }
  return selected;
}

export function selectReverseGeocodingResult(results: GoogleGeocodingResult[]) {
  return (
    results.find((result) =>
      result.types?.some((type) => ADDRESS_TYPES.has(type))
    ) ?? results[0]
  );
}
