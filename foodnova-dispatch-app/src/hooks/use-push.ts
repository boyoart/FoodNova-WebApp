import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { NotifApi } from "@/src/api/endpoints";
import { deliveryOrderId } from "@/src/lib/order";
import {
  registerPushToken,
  addTokenRefreshListener,
  addNotificationListeners,
  getInitialNotificationData,
} from "@/src/lib/push";

function orderIdFrom(data: any): string | null {
  const id = deliveryOrderId(data);
  return id || null;
}

function notificationTarget(data: any): string {
  const type = String(data?.type || data?.notification_type || data?.category || data?.data?.type || "").toLowerCase();
  const id = orderIdFrom(data);
  if (id && (type.includes("complete") || type.includes("delivered") || type.includes("history"))) return "/(tabs)/deliveries";
  if (id) return `/delivery/${id}`;
  if (type.includes("notification")) return "/notifications";
  return "/notifications";
}

// Wires the full FCM lifecycle for an authenticated rider:
// - registers the device token with the backend
// - re-registers on token refresh
// - deep-links delivery/offer notifications to the right screen (tap handling,
//   from foreground, background, and cold start)
export function usePushNotifications() {
  const { authed } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authed || Platform.OS === "web") return;

    registerPushToken();

    const stopRefresh = addTokenRefreshListener((token) => {
      console.log("DISPATCH_NOTIFICATION_TOKEN_REFRESH_ACTION");
      NotifApi.registerFcmToken(token, Platform.OS).catch(() => {});
    });

    const stopTap = addNotificationListeners((data) => {
      const target = notificationTarget(data);
      console.log("DISPATCH_NOTIFICATION_TAPPED", { data, target });
      router.push(target as any);
    });

    // Cold-start tap (app opened from a killed state via a notification)
    getInitialNotificationData().then((data) => {
      if (data) {
        const target = notificationTarget(data);
        console.log("DISPATCH_NOTIFICATION_COLD_START", { data, target });
        router.push(target as any);
      }
    });

    return () => {
      stopRefresh();
      stopTap();
    };
  }, [authed, router]);
}
