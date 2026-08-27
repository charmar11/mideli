import { normalizeText } from "./normalize";

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
const REJECTED_TYPES = new Set([
  "airport",
  "establishment",
  "park",
  "point_of_interest",
  "school",
  "shopping_mall",
  "transit_station",
]);
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

function requestedStreetNumber(value: string) {
  const withoutPostalCode = value.replace(/\b(?:c\.?\s*p\.?|cp)\s*\d{5}\b/gi, "");
  return normalizeText(withoutPostalCode).match(/\b\d{1,6}[a-z]?\b/)?.[0] ?? "";
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
  if (result.geometry?.location_type === "ROOFTOP") score += 10;
  if (result.geometry?.location_type === "RANGE_INTERPOLATED") score += 7;
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
  if (!expectedNumber) throw new Error("address_number_required");

  const candidates = results.filter((result) => {
    const types = result.types ?? [];
    if (types.some((type) => REJECTED_TYPES.has(type))) return false;
    if (!types.some((type) => ADDRESS_TYPES.has(type))) return false;
    if (!component(result, "route")?.long_name) return false;
    if (!hasExpectedLocality(result)) return false;
    if (
      !Number.isFinite(result.geometry?.location?.lat) ||
      !Number.isFinite(result.geometry?.location?.lng)
    ) return false;
    const actualNumber = normalizeText(component(result, "street_number")?.long_name ?? "");
    return actualNumber === expectedNumber;
  });

  const selected = candidates.sort(
    (left, right) => candidateScore(right) - candidateScore(left)
  )[0];
  if (!selected) throw new Error("address_low_confidence");
  return selected;
}

export function selectReverseGeocodingResult(results: GoogleGeocodingResult[]) {
  return (
    results.find((result) =>
      result.types?.some((type) => ADDRESS_TYPES.has(type))
    ) ?? results[0]
  );
}
