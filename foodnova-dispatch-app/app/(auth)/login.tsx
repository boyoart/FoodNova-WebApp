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
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { ApiError, setToken } from "@/src/api/client";
import { Button, Field } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";

const HERO =
  "https://images.unsplash.com/photo-1695654390723-479197a8c4a3?crop=entropy&cs=srgb&fm=jpg&q=75&w=1000";

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { refreshRider } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!identifier.trim() || !password) {
      toast.show("Enter your email or phone, and password", "warning");
      return;
    }
    setLoading(true);
    try {
      const { token, isEmail } = await AuthApi.smartLogin(identifier.trim(), password);
      if (!token) {
        toast.show("Login failed - no session token returned", "error");
        return;
      }
      const rider = await refreshRider();
      if (!rider) {
        // token isn't valid for the rider (/delivery) session
        await setToken(null);
        toast.show(
          isEmail
            ? "This email isn't linked to a rider account yet. Please sign in with your phone number."
            : "Could not load your rider profile. Please try again.",
          "error"
        );
        return;
      }
      toast.show("Welcome back!", "success");
      const s = (
        rider?.approval_status ||
        rider?.verification_status ||
        rider?.status ||
        ""
      )
        .toString()
        .toLowerCase();
      if (["approved", "active", "verified", "online", "offline"].includes(s))
        router.replace("/(tabs)");
      else router.replace("/onboarding");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Unable to sign in";
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <View style={styles.heroOverlay} />
      <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
        <Logo size={30} inverse />
        <Text style={styles.heroTitle}>Ride. Deliver. Earn.</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <ScrollView
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Log in to start your dispatch shift</Text>

          <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
            <Field
              testID="login-identifier-input"
              label="Email or phone number"
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType="email-address"
              placeholder="you@email.com  ·  080..."
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View>
              <Field
                testID="login-password-input"
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="Your password"
              />
              <TouchableOpacity
                testID="toggle-password"
                onPress={() => setShowPw((v) => !v)}
                style={styles.eye}
              >
                <Text style={styles.eyeText}>{showPw ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>

            <Link href="/(auth)/forgot" asChild>
              <TouchableOpacity testID="forgot-link" style={{ alignSelf: "flex-end" }}>
                <Text style={styles.link}>Forgot password?</Text>
              </TouchableOpacity>
            </Link>

            <Button testID="login-submit-button" label="Sign in" onPress={onLogin} loading={loading} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>New rider?</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity testID="go-register">
                  <Text style={styles.link}>Create an account</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: "48%" },
  heroOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: "48%", backgroundColor: "rgba(17,24,39,0.55)" },
  heroContent: { paddingHorizontal: spacing.xl, gap: spacing.md },
  heroTitle: { fontFamily: fonts.display, fontSize: type["3xl"], fontWeight: "700", color: colors.onSurfaceInverse },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    minHeight: "60%",
  },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  subtitle: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 4 },
  eye: { position: "absolute", right: spacing.md, top: 38 },
  eyeText: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700", color: colors.brandPrimary },
  link: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.brandPrimary },
  footer: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  footerText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
});
