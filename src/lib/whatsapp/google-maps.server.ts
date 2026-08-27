import "server-only";

import {
  selectConfidentAddressResult,
  selectReverseGeocodingResult,
  type GoogleAddressComponent,
  type GoogleGeocodingResult,
} from "./address-confidence";

type Coordinates = { latitude: number; longitude: number };

export type GeocodedDestination = Coordinates & {
  formattedAddress: string;
  colony: string;
};

function apiKey() {
  const value = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!value) throw new Error("google_maps_not_configured");
  return value;
}

function colonyFromComponents(components: GoogleAddressComponent[] = []) {
  const priorities = ["sublocality_level_1", "neighborhood", "sublocality", "locality"];
  for (const type of priorities) {
    const component = components.find((candidate) => candidate.types?.includes(type));
    if (component?.long_name) return component.long_name;
  }
  return "";
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

function destinationFromResult(
  result: GoogleGeocodingResult,
  coordinates?: Coordinates
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
    colony: colonyFromComponents(result.address_components),
  };
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
      coordinates
    );
  }

  const address = value.toLowerCase().includes("sonora")
    ? value
    : `${value}, ${localityHint}`;
  const results = await geocodingRequest(new URLSearchParams({ address }));
  return destinationFromResult(selectConfidentAddressResult(value, results));
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
  const distanceMeters = payload.routes?.[0]?.distanceMeters;
  if (!Number.isFinite(distanceMeters)) throw new Error("route_not_found");
  return Math.round(Number(distanceMeters));
}
