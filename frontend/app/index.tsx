import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";

// Splash + router gate. Sends the rider to auth, onboarding, or the app
// depending on session + approval status.
export default function Index() {
  const { booting, authed, approvalStatus } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (booting) return;
    if (!authed) {
      router.replace("/(auth)/login");
      return;
    }
    const s = (approvalStatus || "").toLowerCase();
    const approved = ["approved", "active", "verified", "online", "offline"].includes(s);
    if (approved) router.replace("/(tabs)");
    else router.replace("/onboarding");
  }, [booting, authed, approvalStatus, router]);

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
