import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts } from "@/src/theme/tokens";

// Wordmark logo for FoodNova Dispatch. Green "Food", charcoal "Nova",
// with a dispatch/route glyph. Rendered from type so it stays crisp.
export function Logo({
  size = 28,
  inverse = false,
  showTag = true,
  style,
}: {
  size?: number;
  inverse?: boolean;
  showTag?: boolean;
  style?: ViewStyle;
}) {
  const nova = inverse ? colors.onSurfaceInverse : colors.brandSecondary;
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.badge, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 4 }]}>
        <Ionicons name="navigate" size={size - 4} color={colors.onBrandPrimary} />
      </View>
      <View>
        <View style={styles.wordRow}>
          <Text style={[styles.word, { fontSize: size, color: colors.brandPrimary }]}>Food</Text>
          <Text style={[styles.word, { fontSize: size, color: nova }]}>Nova</Text>
        </View>
        {showTag && <Text style={[styles.tag, { color: inverse ? "#9CA3AF" : colors.muted }]}>DISPATCH</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  wordRow: { flexDirection: "row" },
  word: { fontFamily: fonts.display, fontWeight: "700", letterSpacing: -0.5 },
  tag: {
    fontFamily: fonts.text,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 4,
    marginTop: -2,
  },
});
