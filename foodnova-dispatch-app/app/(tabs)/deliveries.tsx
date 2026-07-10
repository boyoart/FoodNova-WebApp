import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RiderApi } from "@/src/api/endpoints";
import { Card, EmptyState, Loader, StatusPill } from "@/src/components/ui";
import { asList, pick } from "@/src/lib/normalize";
import { formatMoney, timeAgo, orderBucket, orderStatus } from "@/src/lib/format";
import { deliveryOrderId } from "@/src/lib/order";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "", label: "All" },
] as const;

export default function Deliveries() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<string>("active");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      // Backend ignores ?status=, so fetch all and bucket client-side.
      const data = await RiderApi.orders();
      const all = asList(data);
      setOrders(status ? all.filter((o) => orderBucket(orderStatus(o)) === status) : all);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [filter, load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Deliveries</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key || "all"}
                testID={`filter-${f.label.toLowerCase()}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipText, active && styles.chipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <Loader label="Loading deliveries..." />
      ) : orders.length === 0 ? (
        <EmptyState testID="deliveries-empty" icon="cube-outline" title="No deliveries yet" subtitle="Your deliveries will appear here." />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item, i) => deliveryOrderId(item) || String(i)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const id = deliveryOrderId(item);
            return (
              <TouchableOpacity
                testID={`delivery-item-${id}`}
                activeOpacity={0.85}
                onPress={() => router.push(`/delivery/${id}`)}
              >
                <Card style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text style={styles.orderNo}>
                      #{pick(item, ["order_code", "order_number", "order_no", "reference", "id"], "")}
                    </Text>
                    <StatusPill status={pick(item, ["delivery_status", "status"], "")} />
                  </View>
                  <View style={styles.addrRow}>
                    <View style={[styles.pin, { backgroundColor: colors.warning }]} />
                    <Text style={styles.addr}>
                      {pick(item, ["pickup_address", "restaurant_address", "vendor_address"], "FoodNova pickup")}
                    </Text>
                  </View>
                  <View style={styles.addrRow}>
                    <View style={[styles.pin, { backgroundColor: colors.brandSecondary }]} />
                    <Text style={styles.addr}>
                      {pick(item, ["delivery_address", "dropoff_address", "customer_address"], "Customer")}
                    </Text>
                  </View>
                  <View style={styles.itemFooter}>
                    <Text style={styles.amount}>
                      {formatMoney(pick(item, ["total_amount", "payout", "fee", "delivery_fee", "total", "amount"], 0))}
                    </Text>
                    <Text style={styles.time}>
                      {timeAgo(pick(item, ["created_at", "assigned_at", "updated_at"], null))}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingTop: spacing.md, gap: spacing.md },
  title: { fontFamily: fonts.text, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface, paddingHorizontal: spacing.lg },
  chipRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  chip: { flexShrink: 0, height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurfaceTertiary },
  chipTextOn: { color: colors.onSurfaceInverse },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] },
  item: { gap: spacing.sm },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNo: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onSurface, marginRight: spacing.sm },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  pin: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  addr: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurfaceTertiary, lineHeight: 21 },
  itemFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  amount: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.brandPrimary },
  time: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
});
