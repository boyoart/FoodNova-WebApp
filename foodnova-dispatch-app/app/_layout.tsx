import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { Component, useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import { usePushNotifications } from "@/src/hooks/use-push";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { NotificationProvider } from "@/src/context/NotificationContext";
import { OfferProvider } from "@/src/context/OfferContext";
import { LocationTrackingProvider } from "@/src/context/LocationTrackingContext";
import "@/src/lib/background-location";
import { colors } from "@/src/theme/tokens";
import { logBuildIdentity } from "@/src/lib/build-identity";
import { startupLog } from "@/src/lib/startup";

startupLog("js_bundle_started");
SplashScreen.preventAutoHideAsync()
  .then(() => startupLog("native_splash_hold_requested"))
  .catch(() => startupLog("native_splash_hold_failed"));

type RootErrorBoundaryState = { failed: boolean };

class RootErrorBoundary extends Component<React.PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    startupLog("root_render_failed");
    SplashScreen.hideAsync().catch(() => undefined);
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.surface }}>
          <Text style={{ fontSize: 22, fontWeight: "700", textAlign: "center", color: colors.onSurface }}>FoodNova could not start</Text>
          <Text style={{ marginTop: 12, textAlign: "center", color: colors.muted }}>Reference: FN-STARTUP-RENDER</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => this.setState({ failed: false })}
            style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.brandPrimary }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Runs inside AuthProvider so it can register the FCM token for the signed-in rider.
function PushBridge() {
  usePushNotifications();
  return null;
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const { booting, authed } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const first = String(segments[0] || "");
  const protectedRoute = first === "(tabs)" || first === "delivery" || first === "notifications" || first === "onboarding";

  useEffect(() => {
    if (!booting && protectedRoute && !authed) router.replace("/(auth)/login");
  }, [authed, booting, protectedRoute, router]);

  if (booting || (protectedRoute && !authed)) {
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [iconsLoaded, iconError] = useIconFonts();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    startupLog("root_layout_mounted");
    logBuildIdentity();
    startupLog("native_splash_hide_requested");
    SplashScreen.hideAsync()
      .then(() => startupLog("native_splash_hidden"))
      .catch(() => startupLog("native_splash_hide_failed"));
    startupLog("first_route_rendered");
  }, []);

  useEffect(() => {
    if (iconsLoaded || iconError) startupLog(iconError ? "icon_fonts_failed" : "icon_fonts_completed");
  }, [iconError, iconsLoaded]);

  useEffect(() => {
    if (fontsLoaded || fontError) startupLog(fontError ? "app_fonts_failed" : "app_fonts_completed");
  }, [fontError, fontsLoaded]);

  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <ToastProvider>
              <NotificationProvider>
                <OfferProvider>
                  <LocationTrackingProvider>
                    <PushBridge />
                    <SessionGate>
                      <View style={{ flex: 1, backgroundColor: colors.surface }}>
                        <StatusBar style="dark" />
                        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                          <Stack.Screen name="index" />
                          <Stack.Screen name="intro" />
                          <Stack.Screen name="(auth)" />
                          <Stack.Screen name="onboarding" />
                          <Stack.Screen name="(tabs)" />
                          <Stack.Screen name="delivery/[id]" options={{ presentation: "card" }} />
                          <Stack.Screen name="notifications" options={{ presentation: "card" }} />
                        </Stack>
                      </View>
                    </SessionGate>
                  </LocationTrackingProvider>
                </OfferProvider>
              </NotificationProvider>
            </ToastProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
