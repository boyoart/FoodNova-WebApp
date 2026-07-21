import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { RiderApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Card, StatusPill } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { OfferModal, offerId } from "@/src/components/OfferModal";
import { useOffers } from "@/src/context/OfferContext";
import { useNotificationsState } from "@/src/context/NotificationContext";
import { useLocationTracking } from "@/src/context/LocationTrackingContext";
import { asList, asObject, pick } from "@/src/lib/normalize";
import { formatDistanceKm, formatMoney, orderBucket, orderStatus } from "@/src/lib/format";
import { deliveryOrderId } from "@/src/lib/order";
import { formatPercent, normalizeRiderStats } from "@/src/lib/stats";
import {
  getForegroundPermission,
  requestForegroundPermission,
  getCurrentCoords,
} from "@/src/lib/location";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

import { riderLooksOnline } from "@/src/lib/rider-state";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { rider, refreshRider } = useAuth();
  const { offers, currentOffer, busy: offerBusy, refreshOffers, presentOffer, acceptCurrentOffer, declineCurrentOffer } = useOffers();
  const { unread, refreshUnread } = useNotificationsState();
  const { enableBackgroundTracking, stopTracking } = useLocationTracking();

  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const initOnline = useCallback(() => {
    const nextOnline = riderLooksOnline(rider);
    console.log("DASHBOARD_RIDER_ONLINE_STATE", {
      status: rider?.status,
      availability: rider?.availability,
      operational_status: rider?.operational_status,
      online_status: rider?.online_status,
      is_online: rider?.is_online,
      nextOnline,
    });
    setOnline(nextOnline);
  }, [rider]);

  useEffect(() => {
    initOnline();
  }, [initOnline]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        Alert.alert("Exit FoodNova Dispatch?", "You can remain online while the app runs in the background.", [
          { text: "Stay", style: "cancel" },
          { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      });
      return () => subscription.remove();
    }, [])
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await RiderApi.stats();
      setStats(asObject(data, "stats", "data"));
    } catch {}
  }, []);

  const loadActive = useCallback(async () => {
    try {
      const data = await RiderApi.orders();
      const list = asList(data);
      // Backend ignores ?status=, so bucket client-side to find the in-progress order.
      const active = list.find((o) => orderBucket(orderStatus(o)) === "active");
      setActiveOrder(active || null);
    } catch {}
  }, []);

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(loadActive, 15000);
    return () => clearInterval(timer);
  }, [loadActive, online]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadActive();
      refreshUnread();
      refreshOffers();
    }, [loadStats, loadActive, refreshOffers, refreshUnread])
  );

  async function toggleOnline() {
    setToggling(true);
    try {
      if (!online) {
        // Going online requires foreground location permission.
        let perm = await getForegroundPermission();
        if (perm === "undetermined") perm = await requestForegroundPermission();
        if (perm === "blocked") {
          toast.show("Enable location in Settings to go online", "warning");
          setToggling(false);
          return;
        }
        const coords = await getCurrentCoords();
        await RiderApi.goOnline(coords);
        setOnline(true);
        const background = await enableBackgroundTracking();
        if (background === "denied") toast.show("Online with foreground tracking. Allow background location for tracking while the app is minimized.", "warning");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast.show("You're online - offers will appear here", "success");
      } else {
        await RiderApi.goOffline();
        await stopTracking();
        setOnline(false);
        toast.show("You're offline", "info");
      }
      refreshRider();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not update status", "error");
    } finally {
      setToggling(false);
    }
  }

  async function acceptOffer() {
    if (!currentOffer) return;
    try {
      const accepted = await acceptCurrentOffer();
      if (!accepted) return;
      toast.show("Delivery accepted!", "success");
      await loadActive();
      const id = deliveryOrderId(accepted);
      if (id) router.push(`/delivery/${id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not accept offer", "error");
    }
  }

  async function declineOffer() {
    if (!currentOffer) {
      presentOffer(null);
      return;
    }
    try {
      await declineCurrentOffer("Rider declined");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not decline offer", "error");
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadStats(), loadActive(), refreshUnread(), refreshRider()]);
    await refreshOffers();
    setRefreshing(false);
  }

  const normalizedStats = normalizeRiderStats(stats);
  const riderName = pick(rider, ["full_name", "name", "first_name"], "Rider");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <Logo size={22} showTag={false} />
        <TouchableOpacity testID="notifications-button" style={styles.bell} onPress={() => router.push("/notifications")}>
          <Ionicons name="notifications-outline" size={24} color={colors.onSurface} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeCount}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.heroIntro}>
          <Text style={styles.eyebrow}>Dispatch Dashboard</Text>
          <Text style={styles.greeting}>Hi, {String(riderName).split(" ")[0]}</Text>
          <Text style={styles.heroSub}>Stay ready for verified FoodNova deliveries.</Text>
        </View>

        {/* Online toggle */}
        <Pressable
          testID="online-toggle"
          onPress={toggleOnline}
          disabled={toggling}
          style={[styles.toggle, online ? styles.toggleOn : styles.toggleOff]}
        >
          <View style={styles.toggleLeft}>
            <View style={[styles.statusDot, { backgroundColor: online ? colors.brandPrimary : colors.muted }]} />
            <View>
              <Text style={[styles.toggleTitle, online && { color: colors.onSurfaceInverse }]}>
                {online ? "You're Online" : "You're Offline"}
              </Text>
              <Text style={[styles.toggleSub, online && { color: "#9CA3AF" }]}>
                {toggling ? "Updating..." : online ? "Receiving delivery offers" : "Tap to start earning"}
              </Text>
            </View>
          </View>
          <View style={[styles.toggleKnob, online ? styles.knobOn : styles.knobOff]}>
            <Ionicons name={online ? "power" : "power-outline"} size={22} color={online ? colors.onBrandPrimary : colors.muted} />
          </View>
        </Pressable>

        {/* Stats */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.earningsLabel}>Today earnings</Text>
              <Text testID="stat-earnings" style={styles.earningsValue} numberOfLines={2}>
                {normalizedStats.earningsEnabled ? formatMoney(normalizedStats.dailyEarnings) : "Unavailable"}
              </Text>
            </View>
            <TouchableOpacity style={styles.detailsPill} onPress={() => router.push("/(tabs)/earnings")}>
              <Text style={styles.detailsPillText}>View Details</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.onBrandPrimary} />
            </TouchableOpacity>
          </View>
          {normalizedStats.earningsEnabled ? <View style={styles.earningsGrid}>
            <MiniMetric testID="stat-weekly-earnings" label="Week" value={formatMoney(normalizedStats.weeklyEarnings)} />
            <MiniMetric testID="stat-monthly-earnings" label="Month" value={formatMoney(normalizedStats.monthlyEarnings)} />
            <MiniMetric testID="stat-lifetime-earnings" label="Lifetime" value={formatMoney(normalizedStats.totalEarnings)} />
          </View> : <Text style={styles.earningsUnavailable}>{normalizedStats.earningsUnavailableReason}</Text>}
        </View>

        <View style={styles.statRow}>
          <StatCard testID="stat-deliveries" icon="cube-outline" label="Delivered" value={String(normalizedStats.completedDeliveries)} />
          <StatCard testID="stat-rating" icon="star-outline" label="Rating" value={normalizedStats.rating ? normalizedStats.rating.toFixed(1) : "--"} />
          <StatCard testID="stat-acceptance" icon="checkmark-circle-outline" label="Acceptance" value={formatPercent(normalizedStats.acceptanceRate)} />
        </View>

        {/* Active delivery */}
        <Text style={styles.sectionTitle}>Active delivery</Text>
        {activeOrder ? (
          <TouchableOpacity
            testID="active-delivery-card"
            activeOpacity={0.85}
            onPress={() => router.push(`/delivery/${deliveryOrderId(activeOrder)}`)}
          >
            <Card inverse style={{ gap: spacing.md }}>
              <View style={styles.activeTop}>
                <Text style={styles.activeOrderNo}>
                  Order #{pick(activeOrder, ["order_code", "order_number", "order_no", "reference", "id"], "")}
                </Text>
                <StatusPill status={pick(activeOrder, ["dispatch_status", "delivery_status", "deliveryStatus", "status", "order_status"], "assigned")} />
              </View>
              <View style={styles.activeAddr}>
                <Ionicons name="location" size={18} color={colors.brandPrimary} />
                <Text style={styles.activeAddrText} numberOfLines={2}>
                  {pick(activeOrder, ["dropoff_address", "customer_address", "delivery_address"], "Delivery in progress")}
                </Text>
              </View>
              <View style={styles.activeCta}>
                <Text style={styles.activeCtaText}>View Details</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
              </View>
            </Card>
          </TouchableOpacity>
        ) : (
          <Card style={styles.emptyActive}>
            <Ionicons name="cube-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyActiveText}>
              {online ? "Waiting for your next offer..." : "Go online to receive delivery offers"}
            </Text>
          </Card>
        )}

        {/* Available offers list (if any waiting) */}
        {offers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Available offers ({offers.length})</Text>
            {offers.slice(0, 5).map((o) => (
              <TouchableOpacity
                key={offerId(o)}
                testID={`offer-row-${offerId(o)}`}
                activeOpacity={0.85}
                onPress={() => presentOffer(o)}
              >
                <Card style={styles.offerRow}>
                  <View style={styles.offerFlash}>
                    <Ionicons name="flash" size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.offerMetaLine}>
                      <Text style={styles.offerPay}>
                        {formatMoney(pick(o, ["payout", "fee", "delivery_fee", "amount"], 0))}
                      </Text>
                      <Text style={styles.offerDistance}>
                        {formatDistanceKm(parseFloat(String(pick(o, ["distance_km", "distance", "total_distance_km"], 0))))}
                      </Text>
                    </View>
                    <Text style={styles.offerAddr} numberOfLines={1}>
                      {pick(o, ["dropoff_address", "customer_address", "delivery_address"], "Tap to view")}
                    </Text>
                    <Text style={styles.offerAction}>View Details</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <OfferModal
        offer={currentOffer}
        visible={!!currentOffer}
        onAccept={acceptOffer}
        onDecline={declineOffer}
        busy={offerBusy}
      />
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.statCard}>
      <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniMetric({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.miniMetric}>
      <Text style={styles.miniMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeCount: { color: "#fff", fontFamily: fonts.text, fontSize: 10, fontWeight: "700" },
  body: { padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.lg },
  heroIntro: { gap: 4 },
  eyebrow: { fontFamily: fonts.text, fontSize: type.xs, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: colors.brandPrimary },
  greeting: { fontFamily: fonts.display, fontSize: type["3xl"], fontWeight: "800", color: colors.onSurface },
  heroSub: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  toggleOff: { backgroundColor: colors.surface, borderColor: colors.border },
  toggleOn: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  toggleTitle: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  toggleSub: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  toggleKnob: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  knobOn: { backgroundColor: colors.brandPrimary },
  knobOff: { backgroundColor: colors.surfaceSecondary },
  earningsCard: { backgroundColor: colors.surfaceInverse, borderRadius: 22, padding: spacing.lg, gap: spacing.lg, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, elevation: 5 },
  earningsHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  earningsLabel: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1 },
  earningsValue: { fontFamily: fonts.display, fontSize: type["4xl"], fontWeight: "800", color: colors.onSurfaceInverse, marginTop: 4 },
  detailsPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  detailsPillText: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "800", color: colors.onBrandPrimary },
  earningsGrid: { flexDirection: "row", gap: spacing.sm },
  earningsUnavailable: { fontFamily: fonts.text, fontSize: type.sm, color: "#D1D5DB", lineHeight: 20 },
  miniMetric: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.lg, padding: spacing.md },
  miniMetricValue: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "800", color: colors.onSurfaceInverse },
  miniMetricLabel: { fontFamily: fonts.text, fontSize: type.xs, fontWeight: "700", color: "#9CA3AF", marginTop: 2 },
  statRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4, alignItems: "flex-start", minHeight: 92 },
  statValue: { fontFamily: fonts.text, fontSize: type.xl, fontWeight: "700", color: colors.onSurface },
  statLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  sectionTitle: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  activeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activeOrderNo: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onSurfaceInverse, marginRight: spacing.sm },
  activeAddr: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  activeAddrText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: "#E5E7EB", lineHeight: 21 },
  activeCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md },
  activeCtaText: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onBrandPrimary },
  emptyActive: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyActiveText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, textAlign: "center" },
  offerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  offerFlash: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  offerMetaLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  offerPay: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  offerDistance: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700", color: colors.muted },
  offerAddr: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, lineHeight: 18 },
  offerAction: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "800", color: colors.brandPrimary, marginTop: 4 },
});
