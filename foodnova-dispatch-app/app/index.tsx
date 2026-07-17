import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { storage } from "@/src/utils/storage";
import { INTRO_SEEN_KEY } from "@/src/lib/constants";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";
import { isApprovedRider, isPendingRider, isRejectedRider } from "@/src/lib/rider-state";

// Splash + router gate. Sends the rider to intro (first launch), auth,
// onboarding, or the app depending on session + approval status.
export default function Index() {
  const { booting, authed, approvalStatus, rider } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (booting) return;
    (async () => {
      if (!authed) {
        const seen = await storage.getItem<boolean>(INTRO_SEEN_KEY, false);
        router.replace(seen ? "/(auth)/login" : "/intro");
        return;
      }
      const state = { ...(rider || {}), approval_status: approvalStatus };
      if (isApprovedRider(state)) router.replace("/(tabs)");
      else if (isPendingRider(state) || isRejectedRider(state)) router.replace("/onboarding/pending");
      else router.replace("/onboarding");
    })();
  }, [booting, authed, approvalStatus, rider, router]);

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
});
