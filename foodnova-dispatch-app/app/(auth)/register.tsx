import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AuthApi } from "@/src/api/endpoints";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Button, Field } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";

type Step = "details" | "otp";

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    if (!fullName.trim() || !email.trim() || !phone.trim() || password.length < 6) {
      toast.show("Fill all fields (password min 6 chars)", "warning");
      return;
    }
    setLoading(true);
    try {
      const emailCheck: any = await AuthApi.checkEmail(email.trim());
      if (emailCheck?.exists) {
        toast.show("This email already has an account. Please sign in.", "warning");
        setLoading(false);
        return;
      }
      await AuthApi.sendOtp(email.trim());
      toast.show("Verification code sent to your email", "success");
      setStep("otp");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not send code", "error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndRegister() {
    if (otp.trim().length < 4) {
      toast.show("Enter the code from your email", "warning");
      return;
    }
    setLoading(true);
    try {
      await AuthApi.verifyOtp(email.trim(), otp.trim());
      await AuthApi.register({
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: phone.trim(),
        password,
        otp: otp.trim(),
        worker_type: "rider",
      });
      toast.show("Account created! Please sign in.", "success");
      router.replace("/(auth)/login");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity testID="register-back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>

          <Logo size={28} />
          <Text style={styles.title}>
            {step === "details" ? "Create your rider account" : "Verify your email"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "details"
              ? "We'll send a verification code to your email"
              : `Enter the 6-digit code sent to ${email}`}
          </Text>

          {step === "details" ? (
            <View style={styles.form}>
              <Field
                testID="register-name-input"
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Emeka Okafor"
              />
              <Field
                testID="register-email-input"
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@email.com"
              />
              <Field
                testID="register-phone-input"
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="080..."
              />
              <Field
                testID="register-password-input"
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Min 6 characters"
              />
              <Button testID="register-send-otp" label="Send verification code" onPress={sendOtp} loading={loading} />
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                testID="register-otp-input"
                label="Verification code"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                placeholder="123456"
                maxLength={6}
              />
              <Button testID="register-verify" label="Create account" onPress={verifyAndRegister} loading={loading} />
              <TouchableOpacity testID="register-resend" onPress={sendOtp} style={{ alignSelf: "center" }}>
                <Text style={styles.link}>Resend code</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already registered?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="go-login">
                <Text style={styles.link}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing["3xl"], gap: spacing.sm },
  back: { width: 44, height: 44, justifyContent: "center", marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  link: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.brandPrimary },
  footer: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  footerText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
});
