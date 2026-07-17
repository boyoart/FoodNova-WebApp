import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/ui";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

export default function Forgot() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  function contactSupport() {
    Linking.openURL("mailto:support@foodnova.com.ng?subject=FoodNova%20Dispatch%20account%20recovery").catch(() => {
      toast.show("Email support@foodnova.com.ng for account recovery", "info");
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.icon}><Ionicons name="lock-closed" size={32} color={colors.brandPrimary} /></View>
        <Text style={styles.title}>Account recovery</Text>
        <Text style={styles.subtitle}>Secure self-service password reset is not available in the current Dispatch API. FoodNova Support must verify your rider account before restoring access.</Text>
        <View style={styles.notice}><Ionicons name="shield-checkmark" size={22} color={colors.brandPrimary} /><Text style={styles.noticeText}>Support will never ask for your password, delivery PIN, or complete NIN.</Text></View>
        <Button label="Contact FoodNova Support" icon="mail" onPress={contactSupport} />
        <Button label="Return to sign in" variant="outline" onPress={() => router.replace("/(auth)/login")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  back: { width: 44, height: 44, justifyContent: "center" },
  content: { paddingVertical: spacing["2xl"], gap: spacing.lg },
  icon: { width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  subtitle: { fontFamily: fonts.text, fontSize: type.base, lineHeight: 22, color: colors.muted },
  notice: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  noticeText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, lineHeight: 20, color: colors.onSurfaceTertiary },
});
