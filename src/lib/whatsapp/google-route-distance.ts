export type GoogleRouteCoordinates = {
  latitude: number;
  longitude: number;
};

type GoogleRoutesPayload = {
  routes?: Array<{ distanceMeters?: number }>;
};

function straightLineDistanceMeters(
  origin: GoogleRouteCoordinates,
  destination: GoogleRouteCoordinates
) {
  const radius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedValue = Math.min(1, Math.max(0, value));
  return radius * 2 * Math.atan2(Math.sqrt(boundedValue), Math.sqrt(1 - boundedValue));
}

export function resolveDrivingDistance(
  origin: GoogleRouteCoordinates,
  destination: GoogleRouteCoordinates,
  payload: GoogleRoutesPayload
) {
  const distanceMeters = payload.routes?.[0]?.distanceMeters;
  if (Number.isFinite(distanceMeters)) return Math.round(Number(distanceMeters));
  if (
    payload.routes?.length &&
    straightLineDistanceMeters(origin, destination) <= 100
  ) {
    return 0;
  }
  throw new Error("route_not_found");
}
