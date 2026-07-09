import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";
import type { TrackingMapProps } from "./TrackingMap.types";

const MAP_BG =
  "https://images.unsplash.com/photo-1605764949087-2870b557821c?crop=entropy&cs=srgb&fm=jpg&q=70&w=800";

// Web fallback: react-native-maps does not render on web. Show a branded
// placeholder + coordinate legend so the tracking screen stays usable in preview.
export function TrackingMap({ rider, pickup, customer, style }: TrackingMapProps) {
  const Point = ({
    color,
    label,
    coord,
  }: {
    color: string;
    label: string;
    coord?: { latitude: number; longitude: number } | null;
  }) => (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendCoord}>
        {coord ? `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}` : "--"}
      </Text>
    </View>
  );

  return (
    <View testID="tracking-map-web" style={[styles.wrap, style]}>
      <Image source={{ uri: MAP_BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.overlay} />
      <View style={styles.badge}>
        <Ionicons name="map" size={16} color={colors.onBrandPrimary} />
        <Text style={styles.badgeText}>Live map available on device build</Text>
      </View>
      <View style={styles.legend}>
        <Point color={colors.brandPrimary} label="You" coord={rider} />
        <Point color="#F59E0B" label="Pickup" coord={pickup} />
        <Point color="#111827" label="Customer" coord={customer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17,24,39,0.35)" },
  badge: {
    position: "absolute",
    top: spacing.lg,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.onBrandPrimary, fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700" },
  legend: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onSurface, width: 70 },
  legendCoord: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, flex: 1, textAlign: "right" },
});
