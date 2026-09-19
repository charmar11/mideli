import "server-only";

import {
  addressQueryCandidates,
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

function sharedCoordinates(value: string): Coordinates | null {
  const match = value.match(/(?:q=|geo:|ubicacion compartida:\s*)(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
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
  const value = query.trim();
  if (value.length < 3 || !sessionToken.trim()) return [];
  return placesAutocompleteRequest(
    value,
    sessionToken.trim(),
    options?.localityHint ?? "Ciudad Obregón, Sonora, México",
    options?.origin ?? null
  );
}

export async function resolveGooglePlaceDestination(
  placeId: string,
  sessionToken = ""
) {
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
  return destinationWithColony(results[0]);
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
  coordinates?: Coordinates
) {
  const destination = destinationFromResult(result, coordinates);
  if (destination.colony) return destination;

  try {
    const reverseResults = await geocodingRequest(
      new URLSearchParams({
        latlng: `${destination.latitude},${destination.longitude}`,
      })
    );
    return destinationFromResult(
      result,
      coordinates,
      colonyFromResults(reverseResults)
    );
  } catch {
    return destination;
  }
}

export async function geocodeDestination(
  value: string,
  localityHint = "Ciudad Obregón, Sonora, México"
): Promise<GeocodedDestination> {
  const coordinates = sharedCoordinates(value);
  if (coordinates) {
    const parameters = new URLSearchParams({
      latlng: `${coordinates.latitude},${coordinates.longitude}`,
    });
    const results = await geocodingRequest(parameters);
    return destinationFromResult(
      selectReverseGeocodingResult(results),
      coordinates,
      colonyFromResults(results)
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
      return destinationWithColony(selectConfidentAddressResult(value, results));
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
      return destinationWithColony(selectConfidentAddressResult(value, places));
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
