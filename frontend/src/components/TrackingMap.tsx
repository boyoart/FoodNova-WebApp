import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { colors } from "@/src/theme/tokens";
import type { LatLng, TrackingMapProps } from "./TrackingMap.types";

// Native map. Google Maps requires a real dev build + API key in app.json.
// In Expo Go the map area renders blank (documented) but the app still works.
export function TrackingMap({ rider, pickup, customer, style }: TrackingMapProps) {
  const ref = useRef<MapView | null>(null);
  const points: LatLng[] = [rider, pickup, customer].filter(Boolean) as LatLng[];

  useEffect(() => {
    if (ref.current && points.length >= 2) {
      ref.current.fitToCoordinates(points, {
        edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
        animated: true,
      });
    }
  }, [points.length, rider?.latitude, pickup?.latitude, customer?.latitude]);

  const initial = points[0] || { latitude: 6.5244, longitude: 3.3792 }; // Lagos fallback

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
          <Marker coordinate={rider} title="You" testID="marker-rider" pinColor={colors.brandPrimary} />
        )}
        {pickup && (
          <Marker coordinate={pickup} title="Pickup" testID="marker-pickup" pinColor="#F59E0B" />
        )}
        {customer && (
          <Marker coordinate={customer} title="Customer" testID="marker-customer" pinColor="#111827" />
        )}
        {points.length >= 2 && (
          <Polyline coordinates={points} strokeWidth={4} strokeColor={colors.brandPrimary} />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
});
