import type { LatLng } from "@/src/components/TrackingMap.types";

export type OrderTrackingRoute = {
  points: LatLng[];
  distanceMeters: number | null;
  etaMinutes: number | null;
  provider: string | null;
  status: string | null;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validPoint(value: unknown): LatLng | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  const latitude = finiteNumber(point.latitude ?? point.lat);
  const longitude = finiteNumber(point.longitude ?? point.lng ?? point.lon);
  if (
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function parseOrderTrackingRoute(payload: unknown): OrderTrackingRoute {
  const envelope = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const raw = envelope.tracking && typeof envelope.tracking === "object"
    ? (envelope.tracking as Record<string, unknown>)
    : envelope;
  const rawPoints = Array.isArray(raw.route_polyline) ? raw.route_polyline : [];
  const points = rawPoints.map(validPoint).filter((point): point is LatLng => point != null);

  return {
    points,
    distanceMeters: finiteNumber(raw.distance_meters),
    etaMinutes: finiteNumber(raw.eta_minutes),
    provider: raw.route_provider == null ? null : String(raw.route_provider),
    status: raw.route_status == null ? null : String(raw.route_status),
  };
}
