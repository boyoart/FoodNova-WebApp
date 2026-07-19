import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { Logo } from "@/src/components/Logo";
import { Button } from "@/src/components/ui";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";
import { isApprovedRider, isPendingRider, isRejectedRider } from "@/src/lib/rider-state";
import { STARTUP_WATCHDOG_MS, startupLog } from "@/src/lib/startup";

// JS startup gate. Native splash is hidden independently in _layout so this
// screen can always render a recovery action if session routing cannot settle.
export default function Index() {
  const { booting, authed, approvalStatus, rider, bootError, retryBootstrap, resetSession } = useAuth();
  const router = useRouter();
  const [watchdogExpired, setWatchdogExpired] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWatchdogExpired(true);
      startupLog("watchdog_expired", { code: "FN-STARTUP-001" });
    }, STARTUP_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (booting) return;
    if (bootError) return;
    let route: "/(auth)/login" | "/(tabs)" | "/onboarding/pending" | "/onboarding";
    if (!authed) route = "/(auth)/login";
    else {
      const state = { ...(rider || {}), approval_status: approvalStatus };
      if (isApprovedRider(state)) route = "/(tabs)";
      else if (isPendingRider(state) || isRejectedRider(state)) route = "/onboarding/pending";
      else route = "/onboarding";
    }
    startupLog("terminal_route_ready", { route });
    router.replace(route);
  }, [booting, authed, approvalStatus, rider, router, bootError]);

  if (bootError || watchdogExpired) {
    return (
      <View style={styles.container} testID="startup-recovery-screen">
        <Logo size={38} />
        <View style={styles.recovery}>
          <Text style={styles.recoveryTitle}>FoodNova could not finish starting</Text>
          <Text style={styles.tag}>{bootError || "Startup took longer than expected."}</Text>
          <Text style={styles.code}>Reference: FN-STARTUP-001</Text>
          <Button testID="startup-retry" label="Retry" onPress={() => { setWatchdogExpired(false); retryBootstrap(); }} />
          <Button testID="startup-reset-session" label="Reset session" variant="outline" onPress={async () => { await resetSession(); router.replace("/(auth)/login"); }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="splash-screen">
      <Logo size={38} />
      <View style={styles.spinner}>
        <ActivityIndicator color={colors.brandPrimary} />
        <Text style={styles.tag}>Delivering excellence, everywhere.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: spacing["2xl"] },
  spinner: { alignItems: "center", gap: spacing.md },
  tag: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  recovery: { width: "100%", maxWidth: 420, paddingHorizontal: spacing.xl, gap: spacing.md },
  recoveryTitle: { fontFamily: fonts.display, fontSize: type.xl, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  code: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, textAlign: "center" },
});
