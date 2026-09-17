import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";
import type { LatLng, TrackingMapProps } from "./TrackingMap.types";

const LAGOS: LatLng = { latitude: 6.5244, longitude: 3.3792 };

function mapsKey(): string | null {
  const cfg: any = Constants.expoConfig || Constants.manifest2 || {};
  return (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    cfg?.extra?.googleMapsApiKey ||
    cfg?.android?.config?.googleMaps?.apiKey ||
    cfg?.ios?.config?.googleMapsApiKey ||
    null
  );
}

function routeEndpoints(status: string | null | undefined, rider?: LatLng | null, pickup?: LatLng | null, customer?: LatLng | null) {
  const s = String(status || "").toLowerCase();
  const hasPickup = ["picked_up", "picked", "collected", "en_route", "enroute", "in_transit", "out_for_delivery", "arrived", "delivered"].includes(s);
  if (rider && customer && hasPickup) return [rider, customer];
  if (rider && pickup) return [rider, pickup];
  if (rider && customer) return [rider, customer];
  if (pickup && customer) return [pickup, customer];
  return [rider, pickup, customer].filter(Boolean) as LatLng[];
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const radius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pathDistance(points: LatLng[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + distanceMeters(points[index], point), 0);
}

function bearing(from: LatLng, to: LatLng): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "--";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(0, Math.round(meters))} m`;
}

function formatEta(minutes: number) {
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 1) return "<1 min";
  return `${Math.ceil(minutes)} min`;
}

function vehicleIcon(vehicleType?: string | null): React.ComponentProps<typeof Ionicons>["name"] {
  const value = String(vehicleType || "").trim().toLowerCase();
  if (value.includes("bicycle") || value.includes("bike")) return "bicycle";
  if (value.includes("motorcycle") || value.includes("motorbike") || value.includes("scooter")) return "speedometer";
  if (value.includes("walk") || value.includes("messenger")) return "walk";
  if (value.includes("truck") || value.includes("van")) return "bus";
  if (value.includes("car")) return "car-sport";
  return "navigate";
}

// Native map. Google Maps requires a real dev build + API key in app.json.
export function TrackingMap({
  rider,
  pickup,
  customer,
  status,
  vehicleType,
  routePoints = [],
  routeDistanceMeters = null,
  routeEtaMinutes = null,
  routeStatus,
  style,
}: TrackingMapProps) {
  const configuredMapsKey = mapsKey();
  const ref = useRef<MapView | null>(null);
  const [heading, setHeading] = useState(0);
  const [followMode, setFollowMode] = useState(true);
  const headingRef = useRef(0);
  const previousRider = useRef<LatLng | null>(null);
  const fittedOnce = useRef(false);
  const initial = rider || pickup || customer || LAGOS;
  const riderRegion = useRef(
    new AnimatedRegion({
      latitude: initial.latitude,
      longitude: initial.longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  ).current;

  const endpoints = useMemo(
    () => routeEndpoints(status, rider, pickup, customer),
    [status, rider, pickup, customer]
  );
  const displayPath = useMemo(() => (routePoints.length >= 2 ? routePoints : []), [routePoints]);
  const destination = endpoints.length >= 2 ? endpoints[endpoints.length - 1] : null;
  const remainingMeters = useMemo(() => {
    if (!rider || !destination || displayPath.length < 2 || routeDistanceMeters == null) return null;
    if (displayPath.length >= 2) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      displayPath.forEach((point, index) => {
        const distance = distanceMeters(rider, point);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      return nearestDistance + pathDistance(displayPath.slice(nearestIndex));
    }
    return null;
  }, [destination, displayPath, rider, routeDistanceMeters]);
  const totalMeters = useMemo(() => {
    if (!destination) return null;
    return routeDistanceMeters;
  }, [destination, routeDistanceMeters]);
  const progress = useMemo(() => {
    if (!remainingMeters || !totalMeters || totalMeters <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - remainingMeters / totalMeters));
  }, [remainingMeters, totalMeters]);
  const etaMinutes = useMemo(() => {
    if (!remainingMeters || routeEtaMinutes == null || !totalMeters) return null;
    return routeEtaMinutes * (remainingMeters / totalMeters);
  }, [remainingMeters, routeEtaMinutes, totalMeters]);
  const fitPoints: LatLng[] = useMemo(
    () => (displayPath.length >= 2 ? displayPath : ([rider, pickup, customer].filter(Boolean) as LatLng[])),
    [displayPath, rider, pickup, customer]
  );

  useEffect(() => {
    console.log("TRACKING_MAP_INIT", {
      hasRider: !!rider,
      hasPickup: !!pickup,
      hasCustomer: !!customer,
      status,
    });
  }, [rider, pickup, customer, status]);

  useEffect(() => {
    if (rider) {
      const moved = previousRider.current ? distanceMeters(previousRider.current, rider) : 0;
      const nextHeading =
        typeof rider.heading === "number" && rider.heading >= 0 && (Number(rider.speed || 0) > 0.8 || moved > 5)
            ? rider.heading
            : previousRider.current && moved > 5
              ? bearing(previousRider.current, rider)
              : headingRef.current;
      const delta = ((nextHeading - headingRef.current + 540) % 360) - 180;
      const smoothedHeading = (headingRef.current + delta * 0.35 + 360) % 360;
      setHeading(smoothedHeading);
      headingRef.current = smoothedHeading;
      previousRider.current = rider;
      riderRegion.timing({
        latitude: rider.latitude,
        longitude: rider.longitude,
        duration: 900,
        useNativeDriver: false,
      } as any).start();
      console.log("DISPATCH_MAP_COORDINATES_RESOLVED", { rider: true, pickup: !!pickup, customer: !!customer });
      console.log("TRACKING_MARKER_CREATED", { marker: "rider", latitude: rider.latitude, longitude: rider.longitude });
      console.log("RIDER_VEHICLE_TYPE_RESOLVED", { vehicleType: String(vehicleType || "unknown").toLowerCase() });
      if (moved > 5) console.log("RIDER_HEADING_UPDATED", { heading: Math.round(smoothedHeading) });
    }
  }, [rider, riderRegion, pickup, customer, vehicleType]);

  useEffect(() => {
    if (displayPath.length >= 2) {
      console.log("DISPATCH_ROUTE_CONTRACT_RENDERED", {
        points: displayPath.length,
        status: routeStatus || "available",
      });
    } else {
      console.log("DISPATCH_MAP_FALLBACK_SHOWN", {
        fallback: "markers_only",
        status: routeStatus || "unavailable",
      });
    }
  }, [displayPath.length, routeStatus]);

  useEffect(() => {
    if (ref.current && fitPoints.length >= 2 && !fittedOnce.current) {
      fittedOnce.current = true;
      ref.current.fitToCoordinates(fitPoints, {
        edgePadding: { top: 90, right: 70, bottom: 90, left: 70 },
        animated: true,
      });
      console.log("TRACKING_CAMERA_MOVED", { points: fitPoints.length });
    }
  }, [fitPoints]);

  if (__DEV__ && !configuredMapsKey) {
    return (
      <View style={[styles.wrap, styles.configError, style]} testID="tracking-map-config-error">
        <Ionicons name="map-outline" size={30} color={colors.error} />
        <Text style={styles.configErrorTitle}>Google Maps is not configured</Text>
        <Text style={styles.configErrorBody}>Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the native app.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: initial.latitude,
          longitude: initial.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onMapReady={() => console.log("TRACKING_MAP_READY")}
        onPanDrag={() => setFollowMode(false)}
      >
        {rider && (
          <Marker.Animated coordinate={riderRegion as any} title="You" testID="marker-rider" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.vehicleMarker, { transform: [{ rotate: `${heading}deg` }] }]}>
              <Ionicons name={vehicleIcon(vehicleType)} size={20} color={colors.onBrandPrimary} />
            </View>
          </Marker.Animated>
        )}
        {pickup && (
          <Marker coordinate={pickup} title="Pickup" testID="marker-pickup" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.placeMarker, styles.pickupMarker]}>
              <Ionicons name="storefront" size={18} color={colors.onWarning} />
            </View>
          </Marker>
        )}
        {customer && (
          <Marker coordinate={customer} title="Customer" testID="marker-customer" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.placeMarker, styles.customerMarker]}>
              <Ionicons name="home" size={18} color={colors.onBrandPrimary} />
            </View>
          </Marker>
        )}
        {displayPath.length >= 2 && (
          <Polyline coordinates={displayPath} strokeWidth={5} strokeColor={colors.brandPrimary} lineCap="round" lineJoin="round" />
        )}
      </MapView>
      {!followMode && rider && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Recenter map on rider"
          style={styles.recenter}
          onPress={() => {
            setFollowMode(true);
            ref.current?.animateCamera({ center: rider, heading, zoom: 16 }, { duration: 500 });
          }}
        >
          <Ionicons name="locate" size={22} color={colors.brandPrimary} />
        </TouchableOpacity>
      )}
      <View style={styles.metricsCard} pointerEvents="none">
        {displayPath.length < 2 && <Text style={styles.routeUnavailable}>Driving route temporarily unavailable</Text>}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>ETA</Text>
          <Text style={styles.metricValue}>{etaMinutes == null ? "--" : formatEta(etaMinutes)}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Remaining</Text>
          <Text style={styles.metricValue}>{remainingMeters == null ? "--" : formatDistance(remainingMeters)}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  configError: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  configErrorTitle: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  configErrorBody: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, textAlign: "center" },
  vehicleMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandPrimary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  pickupMarker: { backgroundColor: colors.warning },
  customerMarker: { backgroundColor: colors.brandSecondary },
  recenter: {
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
  metricsCard: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.md,
    padding: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "700" },
  metricValue: { fontFamily: fonts.display, fontSize: type.base, color: colors.onSurface, fontWeight: "700" },
  routeUnavailable: { fontFamily: fonts.text, fontSize: type.sm, color: colors.error, textAlign: "center", marginBottom: spacing.sm },
  metricDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  progressTrack: { height: 5, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden", marginTop: spacing.sm },
  progressFill: { height: 5, backgroundColor: colors.brandPrimary, borderRadius: radius.pill },
});
