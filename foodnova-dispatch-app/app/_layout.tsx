import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View } from "react-native";
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
import { STARTUP_WATCHDOG_MS, startupLog } from "@/src/lib/startup";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
  const [fontWatchdogExpired, setFontWatchdogExpired] = useState(false);

  const ready = (iconsLoaded || iconError) && (fontsLoaded || fontError);
  const canRender = ready || fontWatchdogExpired;

  useEffect(() => {
    logBuildIdentity();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFontWatchdogExpired(true);
      startupLog("font_watchdog_expired", { code: "FN-STARTUP-FONTS" });
    }, STARTUP_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (canRender) {
      SplashScreen.hideAsync()
        .then(() => startupLog("native_splash_hidden", { fonts: ready ? "ready" : "fallback" }))
        .catch(() => startupLog("native_splash_hide_failed"));
    }
  }, [canRender, ready]);

  if (!canRender) return null;

  return (
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
  );
}
