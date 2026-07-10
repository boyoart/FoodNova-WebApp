import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { RiderApi } from "@/src/api/endpoints";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Button, Loader, StatusPill } from "@/src/components/ui";
import { TrackingMap } from "@/src/components/TrackingMap";
import { asList, pick } from "@/src/lib/normalize";
import { deliveryOrderId } from "@/src/lib/order";
import { getCurrentCoords } from "@/src/lib/location";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

// Linear delivery workflow
const FLOW = [
  { key: "picked_up", action: "Confirm Pickup", icon: "bag-check" },
  { key: "en_route", action: "Start Delivery", icon: "navigate" },
  { key: "arrived", action: "I've Arrived", icon: "location" },
  { key: "delivered", action: "Complete Delivery", icon: "checkmark-done" },
] as const;

function statusIndex(status: string): number {
  const s = status.toLowerCase();
  const idx = FLOW.findIndex((f) => f.key === s);
  if (idx >= 0) return idx;
  if (["assigned", "accepted", "confirmed", "pending"].includes(s)) return -1;
  if (["out_for_delivery", "enroute", "in_transit"].includes(s)) return 1;
  if (["at_pickup", "picked", "collected"].includes(s)) return 0;
  return -1;
}

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [riderCoords, setRiderCoords] = useState<{ latitude: number; longitude: number; heading?: number | null; speed?: number | null } | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await RiderApi.orders();
      const list = asList(data);
      const found = list.find((o) => deliveryOrderId(o) === String(id));
      setOrder(found || list[0] || null);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
    const c = await getCurrentCoords();
    if (c) setRiderCoords({ latitude: c.latitude, longitude: c.longitude, heading: c.heading, speed: c.speed });
  }, [id]);

  const syncLocation = useCallback(async () => {
    const c = await getCurrentCoords();
    if (!c) return;
    const coords = { latitude: c.latitude, longitude: c.longitude, heading: c.heading, speed: c.speed };
    setRiderCoords(coords);
    RiderApi.locationPing(coords).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      syncLocation();
    }, [load, syncLocation])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      syncLocation();
    }, 5000);
    return () => clearInterval(timer);
  }, [syncLocation]);

  const currentStatus = pick(order, ["dispatch_status", "delivery_status", "deliveryStatus", "status", "order_status"], "assigned");
  const idx = useMemo(() => statusIndex(String(currentStatus)), [currentStatus]);
  const nextStep = idx + 1 < FLOW.length ? FLOW[idx + 1] : null;

  const pickup = coordFrom(
    order,
    ["pickup_lat", "pickup_latitude", "pickup.latitude", "pickup.lat", "restaurant_lat", "vendor_lat", "store_lat", "store.latitude"],
    ["pickup_lng", "pickup_longitude", "pickup.longitude", "pickup.lng", "restaurant_lng", "vendor_lng", "store_lng", "store.longitude"]
  );
  const customer = coordFrom(
    order,
    [
      "dropoff_lat",
      "dropoff_latitude",
      "customer_lat",
      "customer.latitude",
      "destination_lat",
      "destination.latitude",
      "delivery_lat",
      "delivery_address_snapshot.latitude",
      "delivery_address_snapshot.lat",
      "latitude",
    ],
    [
      "dropoff_lng",
      "dropoff_longitude",
      "customer_lng",
      "customer.longitude",
      "destination_lng",
      "destination.longitude",
      "delivery_lng",
      "delivery_address_snapshot.longitude",
      "delivery_address_snapshot.lng",
      "longitude",
    ]
  );

  async function advance() {
    if (!nextStep || !order) return;
    if (nextStep.key === "delivered") {
      setPinMode(true);
      return;
    }
    setBusy(true);
    try {
      await RiderApi.updateOrderStatus(String(id), nextStep.key);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show(`Status updated: ${nextStep.action}`, "success");
      await load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not update status", "error");
    } finally {
      setBusy(false);
    }
  }

  async function completeWithPin() {
    if (pin.trim().length < 4) {
      toast.show("Enter the customer's delivery PIN", "warning");
      return;
    }
    setBusy(true);
    try {
      const enteredPin = pin.trim();
      await RiderApi.submitProof(String(id), {
        delivery_code: enteredPin,
        entered_pin: enteredPin,
        pin: enteredPin,
        note: "Delivered by rider",
      });
      await RiderApi.updateOrderStatus(String(id), "delivered").catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show("Delivery completed!", "success");
      setPinMode(false);
      router.replace("/(tabs)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Invalid PIN or verification failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function panic() {
    const c = await getCurrentCoords();
    if (c) {
      await RiderApi.panicAlert(c).catch(() => {});
      toast.show("Emergency alert sent to FoodNova", "error");
    }
  }

  if (loading) return <View style={styles.root}><Loader label="Loading delivery..." /></View>;

  if (!order) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.muted} />
        <Text style={styles.muted}>Delivery not found</Text>
        <Button testID="delivery-back" label="Go back" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const customerName = pick(order, ["customer_name", "delivery_address_snapshot.recipient_name", "recipient_name"], "Customer");
  const customerPhone = pick(order, ["customer_phone", "delivery_address_snapshot.phone", "recipient_phone", "phone"], null);
  const dropoff = pick(order, ["dropoff_address", "customer_address", "delivery_address"], "Delivery address");
  const pickupAddr = pick(order, ["pickup_address", "restaurant_address", "vendor_address"], "Pickup location");
  const isDelivered = String(currentStatus).toLowerCase() === "delivered";

  return (
    <View style={styles.root}>
      {/* Map top */}
      <View style={styles.mapWrap}>
        <TrackingMap rider={riderCoords} pickup={pickup} customer={customer} status={String(currentStatus)} style={{ flex: 1 }} />
        <TouchableOpacity testID="delivery-close" style={[styles.floatBtn, { top: insets.top + spacing.sm, left: spacing.lg }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity testID="panic-button" style={[styles.floatBtn, styles.panic, { top: insets.top + spacing.sm, right: spacing.lg }]} onPress={panic}>
          <Ionicons name="warning" size={20} color={colors.onError} />
        </TouchableOpacity>
      </View>

      {/* Bottom sheet */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.orderNo}>Order #{pick(order, ["order_code", "order_number", "order_no", "reference", "id"], "")}</Text>
              <StatusPill status={currentStatus} testID="delivery-status-pill" />
            </View>

            {/* Step tracker */}
            <View style={styles.tracker}>
              {FLOW.map((f, i) => {
                const done = i <= idx;
                const active = i === idx + 1;
                return (
                  <View key={f.key} style={styles.trackStep}>
                    <View style={[styles.trackDot, done && styles.trackDotDone, active && styles.trackDotActive]}>
                      <Ionicons name={f.icon as any} size={14} color={done || active ? colors.onBrandPrimary : colors.muted} />
                    </View>
                    {i < FLOW.length - 1 && <View style={[styles.trackLine, done && styles.trackLineDone]} />}
                  </View>
                );
              })}
            </View>

            {/* Route info */}
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={[styles.pin, { backgroundColor: colors.warning }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>PICKUP</Text>
                  <Text style={styles.routeValue}>{String(pickupAddr)}</Text>
                </View>
              </View>
              <View style={styles.routeConnector} />
              <View style={styles.routeRow}>
                <View style={[styles.pin, { backgroundColor: colors.brandSecondary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>DROP-OFF - {String(customerName)}</Text>
                  <Text style={styles.routeValue}>{String(dropoff)}</Text>
                </View>
              </View>
            </View>

            {/* Customer contact */}
            {customerPhone && (
              <TouchableOpacity testID="call-customer" style={styles.callRow} onPress={() => Linking.openURL(`tel:${customerPhone}`)}>
                <Ionicons name="call" size={18} color={colors.brandPrimary} />
                <Text style={styles.callText}>Call {String(customerName)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}

            {/* PIN entry or action */}
            {pinMode ? (
              <View style={{ gap: spacing.md }}>
                <Text style={styles.pinLabel}>Enter the customer delivery PIN to complete</Text>
                <TextInput
                  testID="pin-input"
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="----"
                  placeholderTextColor={colors.muted}
                  style={styles.pinInput}
                />
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Button testID="pin-cancel" label="Cancel" variant="outline" onPress={() => setPinMode(false)} style={{ flex: 1 }} />
                  <Button testID="pin-confirm" label="Confirm delivery" onPress={completeWithPin} loading={busy} style={{ flex: 1.4 }} />
                </View>
              </View>
            ) : isDelivered ? (
              <View style={styles.doneBanner}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <Text style={styles.doneText}>Delivery completed</Text>
              </View>
            ) : nextStep ? (
              <Button testID="advance-status-button" label={nextStep.action} icon={nextStep.icon as any} onPress={advance} loading={busy} />
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function coordFrom(order: any, latKeys: string[], lngKeys: string[]) {
  const lat = pick(order, latKeys, null);
  const lng = pick(order, lngKeys, null);
  const latN = typeof lat === "string" ? parseFloat(lat) : lat;
  const lngN = typeof lng === "string" ? parseFloat(lng) : lng;
  if (typeof latN === "number" && typeof lngN === "number" && !isNaN(latN) && !isNaN(lngN)) {
    return { latitude: latN, longitude: lngN };
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  mapWrap: { flex: 1, minHeight: 280 },
  floatBtn: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  panic: { backgroundColor: colors.error },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "58%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNo: { flex: 1, fontFamily: fonts.text, fontSize: type.xl, fontWeight: "700", color: colors.onSurface, marginRight: spacing.sm },
  tracker: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  trackStep: { flexDirection: "row", alignItems: "center", flex: 1 },
  trackDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  trackDotDone: { backgroundColor: colors.success },
  trackDotActive: { backgroundColor: colors.brandPrimary },
  trackLine: { flex: 1, height: 3, backgroundColor: colors.surfaceTertiary, marginHorizontal: 2 },
  trackLineDone: { backgroundColor: colors.success },
  routeCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  routeRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  routeConnector: { width: 2, height: 20, backgroundColor: colors.surfaceTertiary, marginLeft: 5, marginVertical: 4 },
  pin: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  routeLabel: { fontFamily: fonts.text, fontSize: 10, fontWeight: "700", color: colors.muted, letterSpacing: 1 },
  routeValue: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurface, lineHeight: 21, flexShrink: 1 },
  callRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md },
  callText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onBrandTertiary },
  pinLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  pinInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.borderStrong, textAlign: "center", fontSize: type["2xl"], fontFamily: fonts.text, fontWeight: "700", letterSpacing: 8, paddingVertical: spacing.md, color: colors.onSurface },
  doneBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#D1FAE5", borderRadius: radius.md, paddingVertical: spacing.lg },
  doneText: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "700", color: colors.onBrandTertiary },
});
