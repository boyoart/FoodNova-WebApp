import { useCallback, useEffect, useRef, useState } from "react";
import {
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

import { RiderApi, NotifApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Card, StatusPill } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { OfferModal, Offer, offerId } from "@/src/components/OfferModal";
import { asList, asObject, pick } from "@/src/lib/normalize";
import { formatMoney, orderBucket, orderStatus } from "@/src/lib/format";
import { deliveryOrderId } from "@/src/lib/order";
import { formatPercent, normalizeRiderStats } from "@/src/lib/stats";
import { addForegroundNotificationListener } from "@/src/lib/push";
import {
  getForegroundPermission,
  requestForegroundPermission,
  getCurrentCoords,
} from "@/src/lib/location";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

const POLL_MS = 12000;

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { rider, refreshRider } = useAuth();

  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenOffers = useRef<Set<string>>(new Set());
  const currentOfferRef = useRef<Offer | null>(null);

  useEffect(() => {
    currentOfferRef.current = currentOffer;
  }, [currentOffer]);

  const initOnline = useCallback(() => {
    const s = (rider?.status || rider?.availability || "").toString().toLowerCase();
    if (s === "online") setOnline(true);
  }, [rider]);

  useEffect(() => {
    initOnline();
  }, [initOnline]);

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

  const loadUnread = useCallback(async () => {
    try {
      const data = await NotifApi.unreadCount();
      const n = pick(data, ["count", "unread", "unread_count"], 0);
      setUnread(typeof n === "number" ? n : parseInt(n) || 0);
    } catch {}
  }, []);

  const pollOffers = useCallback(async () => {
    try {
      const data = await RiderApi.offers();
      const list = asList(data) as Offer[];
      setOffers(list);
      // Surface the first genuinely new offer
      const fresh = list.find((o) => !seenOffers.current.has(offerId(o)));
      if (fresh && !currentOfferRef.current) {
        seenOffers.current.add(offerId(fresh));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setCurrentOffer(fresh);
      }
    } catch {}
  }, []);

  const sendPing = useCallback(async () => {
    const coords = await getCurrentCoords();
    if (coords) RiderApi.locationPing(coords).catch(() => {});
  }, []);

  // Polling lifecycle tied to online state
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (online) {
      pollOffers();
      sendPing();
      pollRef.current = setInterval(() => {
        pollOffers();
        sendPing();
        loadActive();
      }, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [online, pollOffers, sendPing, loadActive]);

  useEffect(() => {
    return addForegroundNotificationListener((data) => {
      const type = String(data?.type || data?.notification_type || data?.category || "").toLowerCase();
      if (type.includes("offer") || type.includes("delivery")) {
        console.log("OFFER_AUTO_REFRESH_TRIGGERED", data);
        pollOffers();
        loadActive();
        loadUnread();
      }
    });
  }, [pollOffers, loadActive, loadUnread]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadActive();
      loadUnread();
    }, [loadStats, loadActive, loadUnread])
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast.show("You're online - offers will appear here", "success");
      } else {
        await RiderApi.goOffline();
        setOnline(false);
        setOffers([]);
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
    setOfferBusy(true);
    try {
      await RiderApi.acceptOffer(offerId(currentOffer));
      toast.show("Delivery accepted!", "success");
      const acceptedId = offerId(currentOffer);
      setOffers((prev) => prev.filter((o) => offerId(o) !== acceptedId));
      setCurrentOffer(null);
      await loadActive();
      const id = deliveryOrderId(currentOffer);
      if (id) router.push(`/delivery/${id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not accept offer", "error");
    } finally {
      setOfferBusy(false);
    }
  }

  async function declineOffer() {
    if (!currentOffer) {
      setCurrentOffer(null);
      return;
    }
    const id = offerId(currentOffer);
    setCurrentOffer(null);
    try {
      await RiderApi.declineOffer(id, "Rider declined");
      setOffers((prev) => prev.filter((o) => offerId(o) !== id));
    } catch {}
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadStats(), loadActive(), loadUnread(), refreshRider()]);
    if (online) await pollOffers();
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
        <Text style={styles.greeting}>Hi, {String(riderName).split(" ")[0]} 👋</Text>

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
        <View style={styles.statRow}>
          <StatCard testID="stat-earnings" icon="wallet-outline" label="Today" value={formatMoney(normalizedStats.dailyEarnings)} />
          <StatCard testID="stat-weekly-earnings" icon="calendar-outline" label="Week" value={formatMoney(normalizedStats.weeklyEarnings)} />
          <StatCard testID="stat-deliveries" icon="cube-outline" label="Delivered" value={String(normalizedStats.completedDeliveries)} />
        </View>
        <View style={styles.statRow}>
          <StatCard testID="stat-rating" icon="star-outline" label="Rating" value={normalizedStats.rating ? normalizedStats.rating.toFixed(1) : "--"} />
          <StatCard testID="stat-acceptance" icon="checkmark-circle-outline" label="Acceptance" value={formatPercent(normalizedStats.acceptanceRate)} />
          <StatCard testID="stat-completion" icon="trophy-outline" label="Completion" value={formatPercent(normalizedStats.completionRate)} />
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
                <StatusPill status={pick(activeOrder, ["delivery_status", "status"], "assigned")} />
              </View>
              <View style={styles.activeAddr}>
                <Ionicons name="location" size={18} color={colors.brandPrimary} />
                <Text style={styles.activeAddrText}>
                  {pick(activeOrder, ["dropoff_address", "customer_address", "delivery_address"], "Delivery in progress")}
                </Text>
              </View>
              <View style={styles.activeCta}>
                <Text style={styles.activeCtaText}>Continue delivery</Text>
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
                onPress={() => setCurrentOffer(o)}
              >
                <Card style={styles.offerRow}>
                  <View style={styles.offerFlash}>
                    <Ionicons name="flash" size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerPay}>
                      {formatMoney(pick(o, ["payout", "fee", "delivery_fee", "amount"], 0))}
                    </Text>
                    <Text style={styles.offerAddr}>
                      {pick(o, ["dropoff_address", "customer_address", "delivery_address"], "Tap to view")}
                    </Text>
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
  greeting: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
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
  statRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4, alignItems: "flex-start" },
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
  offerPay: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  offerAddr: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, lineHeight: 18 },
});
