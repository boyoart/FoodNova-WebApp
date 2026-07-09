import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AuthApi } from "@/src/api/endpoints";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Button, Field } from "@/src/components/ui";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";

// Uses the email OTP channel to let a rider reset access.
export default function Forgot() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email.trim()) {
      toast.show("Enter your account email", "warning");
      return;
    }
    setLoading(true);
    try {
      await AuthApi.sendOtp(email.trim());
      setSent(true);
      toast.show("If the email exists, a reset code was sent", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not send code", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <TouchableOpacity testID="forgot-back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we will send you a verification code to reset your access.
        </Text>
        <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
          <Field
            testID="forgot-email-input"
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@email.com"
          />
          <Button
            testID="forgot-submit"
            label={sent ? "Resend code" : "Send reset code"}
            onPress={send}
            loading={loading}
          />
          {sent && (
            <Text style={styles.note}>
              Check your inbox. Contact FoodNova support if you do not receive a code.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  back: { width: 44, height: 44, justifyContent: "center" },
  content: { paddingBottom: spacing["3xl"] },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 4 },
  note: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, textAlign: "center" },
});
