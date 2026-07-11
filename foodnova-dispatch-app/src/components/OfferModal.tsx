import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";
import { formatMoney, formatDistanceKm } from "@/src/lib/format";
import { deliveryOfferId } from "@/src/lib/order";

export type Offer = Record<string, any>;

function field(o: Offer, keys: string[], fallback: any = null) {
  for (const k of keys) {
    const parts = k.split(".");
    let v: any = o;
    for (const p of parts) v = v?.[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

export function offerId(o: Offer): string {
  return deliveryOfferId(o);
}

export function OfferModal({
  offer,
  visible,
  onAccept,
  onDecline,
  busy,
}: {
  offer: Offer | null;
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  const expiresAt = offer ? field(offer, ["expires_at", "expiry", "offer_expires_at"]) : null;
  const [remaining, setRemaining] = useState(30);
  const [initialRemaining, setInitialRemaining] = useState(30);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    expiredRef.current = false;
    let total = 30;
    if (expiresAt) {
      const diff = Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (!isNaN(diff) && diff > 0) total = Math.min(diff, 120);
    }
    setInitialRemaining(total);
    setRemaining(total);
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [visible, expiresAt]);

  useEffect(() => {
    if (visible && remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onDecline();
    }
  }, [onDecline, remaining, visible]);

  if (!offer) return null;

  const payout = field(offer, ["payout", "fee", "delivery_fee", "amount", "earning", "rider_fee"]);
  const distance = field(offer, ["distance_km", "distance", "total_distance_km"]);
  const pickup = field(offer, ["pickup_address", "pickup.address", "restaurant_address", "vendor_address"], "Pickup location");
  const dropoff = field(offer, ["dropoff_address", "customer_address", "delivery_address", "destination"], "Customer location");
  const orderNo = field(offer, ["order_number", "order_no", "reference", "code"], "");
  const eta = field(offer, ["eta_minutes", "eta", "estimated_minutes", "estimated_duration_minutes"], null);
  const progress = initialRemaining > 0 ? Math.max(0, Math.min(1, remaining / initialRemaining)) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="offer-modal">
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Ionicons name="flash" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.badgeText}>New Delivery Offer</Text>
            </View>
            <View style={styles.countdown}>
              <Text testID="offer-countdown" style={styles.countdownText}>{remaining}s</Text>
            </View>
          </View>

          <View style={styles.payoutRow}>
            <Text style={styles.payout}>{formatMoney(payout)}</Text>
            <Text style={styles.payoutLabel}>estimated earnings</Text>
          </View>
          {orderNo ? <Text style={styles.orderNo}>Order #{orderNo}</Text> : null}

          <View style={styles.countdownTrack}>
            <View style={[styles.countdownFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="navigate-outline" size={15} color={colors.brandPrimary} />
              <Text style={styles.metaText}>{formatDistanceKm(typeof distance === "number" ? distance : parseFloat(distance))}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={15} color={colors.brandPrimary} />
              <Text style={styles.metaText}>{eta ? `${eta} min` : "ETA pending"}</Text>
            </View>
          </View>

          <View style={styles.route}>
            <View style={styles.routeRow}>
              <View style={[styles.pin, { backgroundColor: colors.warning }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeValue} numberOfLines={2}>{String(pickup)}</Text>
              </View>
            </View>
            <View style={styles.routeConnector} />
            <View style={styles.routeRow}>
              <View style={[styles.pin, { backgroundColor: colors.brandSecondary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeValue} numberOfLines={2}>{String(dropoff)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <Button testID="offer-decline" label="Decline" variant="outline" onPress={onDecline} style={{ flex: 1 }} disabled={busy} />
            <Button testID="offer-accept" label="Accept" onPress={onAccept} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.72)", justifyContent: "center", padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: 28, padding: spacing.xl, gap: spacing.lg, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 22, elevation: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  badgeText: { color: colors.onBrandPrimary, fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700" },
  countdown: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  countdownText: { fontFamily: fonts.display, fontSize: type.base, fontWeight: "700", color: colors.onSurface },
  payoutRow: { alignItems: "flex-start", gap: 2 },
  payout: { fontFamily: fonts.display, fontSize: 46, fontWeight: "800", color: colors.onSurface },
  payoutLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  countdownTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  countdownFill: { height: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.pill },
  metaRow: { flexDirection: "row", gap: spacing.sm },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  metaText: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "600", color: colors.onSurfaceTertiary },
  orderNo: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: -spacing.sm },
  route: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  routeRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  routeConnector: { width: 2, height: 20, backgroundColor: colors.surfaceTertiary, marginLeft: 5, marginVertical: 4 },
  pin: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  routeLabel: { fontFamily: fonts.text, fontSize: 10, fontWeight: "700", color: colors.muted, letterSpacing: 1 },
  routeValue: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurface },
  actions: { flexDirection: "row", gap: spacing.md },
});
