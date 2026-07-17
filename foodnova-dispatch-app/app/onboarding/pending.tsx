import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { Button, StatusPill } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";
import { isApprovedRider, isRejectedRider } from "@/src/lib/rider-state";

const CHECKS = [
  { icon: "finger-print", label: "Identity (NIN) verification" },
  { icon: "happy-outline", label: "Selfie match" },
  { icon: "document-text-outline", label: "Proof of address" },
  { icon: "shield-checkmark-outline", label: "Background review" },
] as const;

export default function Pending() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshRider, approvalStatus, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const rejected = isRejectedRider({ status: approvalStatus });

  const check = useCallback(async () => {
    setChecking(true);
    const rider = await refreshRider();
    setChecking(false);
    if (isApprovedRider(rider)) {
      router.replace("/(tabs)");
    }
  }, [refreshRider, router]);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Logo size={28} />
        <View style={styles.hero}>
          <View style={styles.clock}>
            <Ionicons name="hourglass-outline" size={44} color={colors.warning} />
          </View>
          <Text style={styles.title}>{rejected ? "Application needs attention" : "Application under review"}</Text>
          <StatusPill status={approvalStatus || "pending"} testID="approval-status-pill" />
          <Text style={styles.subtitle}>
            {rejected
              ? "FoodNova could not approve the current application. Review your onboarding details or contact support for the exact remediation required."
              : "Thanks for applying to ride with FoodNova. Our team is reviewing your documents. You will be notified once you are approved."}
          </Text>
        </View>

        <View style={styles.card}>
          {CHECKS.map((c, i) => (
            <View key={c.label} style={[styles.row, i < CHECKS.length - 1 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Ionicons name={c.icon as any} size={20} color={colors.brandPrimary} />
              </View>
              <Text style={styles.rowLabel}>{c.label}</Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
          ))}
        </View>

        {rejected && <Button label="Review onboarding" variant="outline" onPress={() => router.replace("/onboarding?remediate=1")} />}
        <Button testID="refresh-approval" label="Check approval status" icon="refresh" onPress={check} loading={checking} />
        <Button testID="signout-pending" label="Sign out" variant="ghost" onPress={async () => { await signOut(); router.replace("/(auth)/login"); }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  content: { paddingBottom: spacing["3xl"], gap: spacing.xl },
  hero: { alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  clock: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, textAlign: "center", lineHeight: 21 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceTertiary },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurface },
});
