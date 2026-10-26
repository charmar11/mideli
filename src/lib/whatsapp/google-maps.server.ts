import "server-only";

import {
  addressQueryCandidates,
  extractAddressCoordinates,
  extractColonyFromAddressText,
  extractColonyFromResult,
  selectConfidentAddressResult,
  selectReverseGeocodingResult,
  type GoogleGeocodingResult,
} from "./address-confidence";
import {
  resolveDrivingDistance,
  type GoogleRouteCoordinates,
} from "./google-route-distance";

type Coordinates = GoogleRouteCoordinates;

const GOOGLE_MAPS_LINK_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

function parseGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value.trim().replace(/[),.;]+$/, ""));
    if (
      url.protocol !== "https:" ||
      !GOOGLE_MAPS_LINK_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

async function coordinatesFromGoogleMapsShortLink(value: string): Promise<Coordinates | null> {
  const initial = parseGoogleMapsUrl(value);
  if (!initial) return null;
  const host = initial.hostname.toLowerCase();
  const isShortLink = host === "maps.app.goo.gl" ||
    (host === "goo.gl" && initial.pathname.toLowerCase().startsWith("/maps/"));
  if (!isShortLink) return null;

  let current = initial;
  const timeout = AbortSignal.timeout(6000);
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const parsedCoordinates = extractAddressCoordinates(current.toString());
    if (parsedCoordinates) return parsedCoordinates;

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: timeout,
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;

    let redirectedUrl: string;
    try {
      redirectedUrl = new URL(location, current).toString();
    } catch {
      throw new Error("google_maps_link_unresolved");
    }
    const next = parseGoogleMapsUrl(redirectedUrl);
    if (!next) throw new Error("google_maps_link_unresolved");
    current = next;
  }

  const resolved = extractAddressCoordinates(current.toString());
  if (resolved) return resolved;
  throw new Error("google_maps_link_unresolved");
}

export type GeocodedDestination = Coordinates & {
  formattedAddress: string;
  colony: string;
};

type GooglePlaceSearchResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

export type GooglePlaceSuggestion = {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText: string;
};

function apiKey() {
  const value = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!value) throw new Error("google_maps_not_configured");
  return value;
}

async function geocodingRequest(parameters: URLSearchParams) {
  parameters.set("key", apiKey());
  parameters.set("language", "es");
  parameters.set("region", "mx");
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${parameters.toString()}`,
    { signal: AbortSignal.timeout(8000), cache: "no-store" }
  );
  if (!response.ok) throw new Error("google_geocoding_failed");
  const payload = (await response.json()) as {
    status?: string;
    results?: GoogleGeocodingResult[];
  };
  if (payload.status !== "OK" || !payload.results?.length) {
    throw new Error("address_not_found");
  }
  return payload.results;
}

async function placesSearchRequest(query: string, localityHint: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      // Solo pedimos los campos necesarios para ubicar, mostrar y cotizar.
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery: `${query}, ${localityHint}`,
      maxResultCount: 5,
      languageCode: "es",
      regionCode: "MX",
    }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });

  // Places es un refuerzo opcional. Si la cuenta solo tiene habilitadas
  // Geocoding y Routes, conservamos el resultado de Geocoding sin romper el
  // flujo de domicilios.
  if (!response.ok) return [];
  const payload = (await response.json()) as { places?: GooglePlaceSearchResult[] };
  return (payload.places ?? []).flatMap(placeToGeocodingResult);
}

function placeToGeocodingResult(place: GooglePlaceSearchResult) {
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      formatted_address: place.formattedAddress ?? place.displayName?.text ?? "",
      address_components: (place.addressComponents ?? []).map((component) => ({
        long_name: component.longText,
        short_name: component.shortText,
        types: component.types,
      })),
      types: place.types,
      geometry: {
        location: { lat: latitude, lng: longitude },
        location_type: "GEOMETRIC_CENTER",
      },
    } satisfies GoogleGeocodingResult];
}

async function placesAutocompleteRequest(
  query: string,
  sessionToken: string,
  localityHint: string,
  origin: Coordinates | null
) {
  const locationBias = origin
    ? {
        circle: {
          center: {
            latitude: origin.latitude,
            longitude: origin.longitude,
          },
          radius: 15_000,
        },
      }
    : undefined;
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
    },
    body: JSON.stringify({
      input: `${query.trim()}, ${localityHint}`,
      sessionToken,
      languageCode: "es",
      includedRegionCodes: ["mx"],
      ...(locationBias ? { locationBias } : {}),
    }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });

  if (!response.ok) return [];
  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };
  return (payload.suggestions ?? []).flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction?.placeId || !prediction.text?.text) return [];
    return [{
      placeId: prediction.placeId,
      description: prediction.text.text,
      primaryText: prediction.structuredFormat?.mainText?.text ?? prediction.text.text,
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
    } satisfies GooglePlaceSuggestion];
  });
}

export async function searchGooglePlaces(
  query: string,
  sessionToken: string,
  options?: { localityHint?: string; origin?: Coordinates | null }
) {
  const value = query.trim().slice(0, 240);
  if (value.length < 3 || !sessionToken.trim() || sessionToken.length > 160) return [];
  return placesAutocompleteRequest(
    value,
    sessionToken.trim(),
    options?.localityHint ?? "Ciudad Obregón, Sonora, México",
    options?.origin ?? null
  );
}

export async function resolveGooglePlaceDestination(
  placeId: string,
  sessionToken = "",
  typedAddress = "",
  fallbackColony = ""
) {
  if (!placeId.trim() || placeId.length > 256) throw new Error("google_place_id_invalid");
  const parameters = new URLSearchParams({ languageCode: "es", regionCode: "MX" });
  if (sessionToken.trim()) parameters.set("sessionToken", sessionToken.trim());
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${parameters.toString()}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,types,addressComponents",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error("google_place_details_failed");
  const place = (await response.json()) as GooglePlaceSearchResult;
  const results = placeToGeocodingResult(place);
  if (!results[0]) throw new Error("address_coordinates_missing");
  const selected = typedAddress.trim()
    ? selectConfidentAddressResult(typedAddress, results)
    : results[0];
  const explicitColony = extractColonyFromAddressText(typedAddress) || fallbackColony.trim();
  return destinationWithColony(selected, undefined, explicitColony, typedAddress);
}

function colonyFromResults(results: GoogleGeocodingResult[]) {
  for (const result of results) {
    const colony = extractColonyFromResult(result);
    if (colony) return colony;
  }
  return "";
}

function destinationFromResult(
  result: GoogleGeocodingResult,
  coordinates?: Coordinates,
  fallbackColony = ""
): GeocodedDestination {
  const latitude = coordinates?.latitude ?? result.geometry?.location?.lat;
  const longitude = coordinates?.longitude ?? result.geometry?.location?.lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("address_coordinates_missing");
  }
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    formattedAddress: result.formatted_address ?? "",
    colony: extractColonyFromResult(result) || fallbackColony,
  };
}

async function destinationWithColony(
  result: GoogleGeocodingResult,
  coordinates?: Coordinates,
  fallbackColony = "",
  searchAddress = "",
  localityHint = "Ciudad Obregón, Sonora, México"
) {
  const destination = destinationFromResult(result, coordinates, fallbackColony);
  if (destination.colony) return destination;

  try {
    const reverseResults = await geocodingRequest(
      new URLSearchParams({
        latlng: `${destination.latitude},${destination.longitude}`,
      })
    );
    const reverseDestination = destinationFromResult(
      result,
      coordinates,
      colonyFromResults(reverseResults)
    );
    if (reverseDestination.colony) return reverseDestination;
  } catch {
    // Continue to the text search fallback below. Reverse geocoding can fail
    // or omit political components for private/new subdivisions.
  }

  if (searchAddress.trim().length >= 3) {
    try {
      const placeResults = await placesSearchRequest(
        searchAddress,
        localityHint
      );
      if (placeResults.length > 0) {
        const confidentPlace = selectConfidentAddressResult(searchAddress, placeResults);
        const withoutPostalCode = searchAddress.replace(/\b(?:c\.?\s*p\.?|cp)\s*\d{5}\b/gi, "");
        const expectsStreetNumber = /\b\d{1,6}[a-z]?\b/i.test(withoutPostalCode);
        const hasStreetAddressType = confidentPlace.types?.some((type) =>
          ["street_address", "premise", "subpremise"].includes(type)
        );
        if (expectsStreetNumber && !hasStreetAddressType) return destination;
        const placeColony = extractColonyFromResult(confidentPlace);
        if (placeColony) {
          return destinationFromResult(result, coordinates, placeColony);
        }
      }
    } catch {
      // A missing colony remains explicit to the operator; never guess one.
    }
  }
  return destination;
}

export async function geocodeDestination(
  value: string,
  localityHint = "Ciudad Obregón, Sonora, México",
  fallbackColony = ""
): Promise<GeocodedDestination> {
  const coordinates = extractAddressCoordinates(value) ??
    await coordinatesFromGoogleMapsShortLink(value);
  const explicitColony = extractColonyFromAddressText(value) || fallbackColony.trim();
  if (coordinates) {
    const parameters = new URLSearchParams({
      latlng: `${coordinates.latitude},${coordinates.longitude}`,
    });
    const results = await geocodingRequest(parameters);
    return destinationFromResult(
      selectReverseGeocodingResult(results),
      coordinates,
      colonyFromResults(results) || explicitColony
    );
  }

  const candidates = addressQueryCandidates(value);
  let lastError: unknown = new Error("address_not_found");
  for (const candidate of candidates) {
    const address = candidate.toLowerCase().includes("sonora")
      ? candidate
      : `${candidate}, ${localityHint}`;
    try {
      const results = await geocodingRequest(new URLSearchParams({ address }));
      return destinationWithColony(
        selectConfidentAddressResult(value, results),
        undefined,
        explicitColony,
        value,
        localityHint
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (
        reason !== "address_not_found" &&
        reason !== "address_low_confidence" &&
        reason !== "address_number_required"
      ) throw error;
      lastError = error;
    }
  }

  // La Geocoding API resuelve muchas direcciones, pero los nombres de plazas,
  // parques y otros puntos de interés funcionan mejor con Text Search. Solo
  // se consulta después de que fallan las búsquedas normales para conservar
  // latencia y costos bajos en domicilios numerados.
  try {
    const places = await placesSearchRequest(value, localityHint);
    if (places.length > 0) {
      return destinationWithColony(
        selectConfidentAddressResult(value, places),
        undefined,
        explicitColony,
        value,
        localityHint
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason !== "address_number_required" && reason !== "address_low_confidence") {
      lastError = error;
    }
  }

  throw lastError;
}

export async function computeDrivingDistance(
  origin: Coordinates,
  destination: Coordinates
) {
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin.latitude,
              longitude: origin.longitude,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.latitude,
              longitude: destination.longitude,
            },
          },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "es-MX",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error("google_routes_failed");
  const payload = (await response.json()) as {
    routes?: Array<{ distanceMeters?: number }>;
  };
  return resolveDrivingDistance(origin, destination, payload);
}
