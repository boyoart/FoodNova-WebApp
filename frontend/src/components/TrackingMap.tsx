import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { colors } from "@/src/theme/tokens";
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

function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coordinates;
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

async function fetchRoute(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
  const key = mapsKey();
  if (!key) return [];
  const url =
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    `&mode=driving&key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  const json = await response.json();
  const encoded = json?.routes?.[0]?.overview_polyline?.points;
  if (!response.ok || !encoded) {
    console.log("TRACKING_ROUTE_ERROR", {
      status: response.status,
      providerStatus: json?.status,
      error: json?.error_message || json?.status || "route_unavailable",
    });
    return [];
  }
  const decoded = decodePolyline(encoded);
  console.log("TRACKING_ROUTE_CREATED", { points: decoded.length });
  return decoded;
}

// Native map. Google Maps requires a real dev build + API key in app.json.
export function TrackingMap({ rider, pickup, customer, status, style }: TrackingMapProps) {
  const ref = useRef<MapView | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);
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
  const displayPath = useMemo(() => (route.length >= 2 ? route : endpoints), [route, endpoints]);
  const fitPoints: LatLng[] = useMemo(
    () => (displayPath.length >= 2 ? displayPath : ([rider, pickup, customer].filter(Boolean) as LatLng[])),
    [displayPath, rider, pickup, customer]
  );
  const routeKey = endpoints.map((p) => `${p.latitude},${p.longitude}`).join("|");

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
      riderRegion.timing({
        latitude: rider.latitude,
        longitude: rider.longitude,
        duration: 900,
        useNativeDriver: false,
      } as any).start();
      console.log("TRACKING_MARKER_CREATED", { marker: "rider", latitude: rider.latitude, longitude: rider.longitude });
    }
  }, [rider, riderRegion]);

  useEffect(() => {
    let cancelled = false;
    async function loadRoute() {
      if (endpoints.length < 2) {
        setRoute([]);
        return;
      }
      const next = await fetchRoute(endpoints[0], endpoints[endpoints.length - 1]).catch((error) => {
        console.log("TRACKING_ROUTE_ERROR", { error: String(error?.message || error) });
        return [];
      });
      if (!cancelled) setRoute(next.length >= 2 ? next : endpoints);
    }
    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [routeKey, endpoints]);

  useEffect(() => {
    if (ref.current && fitPoints.length >= 2) {
      ref.current.fitToCoordinates(fitPoints, {
        edgePadding: { top: 90, right: 70, bottom: 90, left: 70 },
        animated: true,
      });
      console.log("TRACKING_CAMERA_MOVED", { points: fitPoints.length });
    }
  }, [fitPoints]);

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
      >
        {rider && (
          <Marker.Animated coordinate={riderRegion as any} title="You" testID="marker-rider" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.vehicleMarker}>
              <Ionicons name="bicycle" size={18} color={colors.onBrandPrimary} />
            </View>
          </Marker.Animated>
        )}
        {pickup && (
          <Marker coordinate={pickup} title="Pickup" testID="marker-pickup" pinColor="#F59E0B" />
        )}
        {customer && (
          <Marker coordinate={customer} title="Customer" testID="marker-customer" pinColor="#111827" />
        )}
        {displayPath.length >= 2 && (
          <Polyline coordinates={displayPath} strokeWidth={5} strokeColor={colors.brandPrimary} lineCap="round" lineJoin="round" />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  vehicleMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandPrimary,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
});
