import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { RiderApi } from "@/src/api/endpoints";
import { Card } from "@/src/components/ui";
import { asObject, asList, pick } from "@/src/lib/normalize";
import { formatMoney, timeAgo, orderBucket, orderStatus } from "@/src/lib/format";
import { formatPercent, normalizeRiderStats } from "@/src/lib/stats";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

export default function Earnings() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Record<string, any>>({});
  const [completed, setCompleted] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([RiderApi.stats(), RiderApi.orders()]);
      setStats(asObject(s, "stats", "data"));
      // Backend ignores ?status=; bucket completed client-side.
      setCompleted(asList(c).filter((o) => orderBucket(orderStatus(o)) === "completed"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const normalizedStats = normalizeRiderStats(stats, completed);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {/* Hero total */}
        <Card inverse style={styles.hero}>
          <Text style={styles.heroLabel}>TOTAL EARNINGS</Text>
          <Text style={styles.heroValue}>{formatMoney(normalizedStats.totalEarnings)}</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroCol}>
              <Text style={styles.heroColValue}>{formatMoney(normalizedStats.dailyEarnings)}</Text>
              <Text style={styles.heroColLabel}>Today</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroCol}>
              <Text style={styles.heroColValue}>{formatMoney(normalizedStats.weeklyEarnings)}</Text>
              <Text style={styles.heroColLabel}>This week</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroCol}>
              <Text style={styles.heroColValue}>{formatMoney(normalizedStats.monthlyEarnings)}</Text>
              <Text style={styles.heroColLabel}>This month</Text>
            </View>
          </View>
        </Card>

        {/* Performance */}
        <Text style={styles.section}>Performance</Text>
        <View style={styles.metricRow}>
          <Metric icon="cube" label="Delivered" value={String(normalizedStats.completedDeliveries)} />
          <Metric icon="star" label="Rating" value={normalizedStats.rating ? normalizedStats.rating.toFixed(1) : "--"} />
          <Metric icon="checkmark-done" label="Acceptance" value={formatPercent(normalizedStats.acceptanceRate)} />
        </View>
        <View style={styles.metricRow}>
          <Metric icon="today" label="Today" value={String(normalizedStats.deliveriesToday)} />
          <Metric icon="trophy" label="Completion" value={formatPercent(normalizedStats.completionRate)} />
          <Metric icon="calendar" label="Month" value={formatMoney(normalizedStats.monthlyEarnings)} />
        </View>

        {/* Recent payouts */}
        <Text style={styles.section}>Recent completed</Text>
        {completed.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            <Ionicons name="receipt-outline" size={28} color={colors.muted} />
            <Text style={styles.muted}>No completed deliveries yet</Text>
          </Card>
        ) : (
          completed.slice(0, 15).map((item, i) => (
            <View key={i} style={styles.payoutRow}>
              <View style={styles.payoutIcon}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutTitle} numberOfLines={1}>
                  Order #{pick(item, ["order_number", "order_no", "reference", "id"], "")}
                </Text>
                <Text style={styles.payoutTime}>
                  {timeAgo(pick(item, ["completed_at", "updated_at", "created_at"], null))}
                </Text>
              </View>
              <Text style={styles.payoutAmount}>
                +{formatMoney(pick(item, ["payout", "fee", "delivery_fee", "amount"], 0))}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.lg },
  hero: { gap: spacing.sm },
  heroLabel: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700", letterSpacing: 1, color: "#9CA3AF" },
  heroValue: { fontFamily: fonts.display, fontSize: type["4xl"], fontWeight: "700", color: colors.onSurfaceInverse },
  heroRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  heroCol: { flex: 1, gap: 2 },
  heroColValue: { fontFamily: fonts.display, fontSize: type.xl, fontWeight: "700", color: colors.brandPrimary },
  heroColLabel: { fontFamily: fonts.text, fontSize: type.sm, color: "#9CA3AF" },
  heroDivider: { width: 1, height: 36, backgroundColor: "#374151" },
  section: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  metricRow: { flexDirection: "row", gap: spacing.md },
  metric: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4, alignItems: "flex-start" },
  metricValue: { fontFamily: fonts.display, fontSize: type.xl, fontWeight: "700", color: colors.onSurface },
  metricLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  payoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  payoutIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" },
  payoutTitle: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onSurface },
  payoutTime: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  payoutAmount: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.success },
  muted: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
});
