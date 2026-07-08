import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { NotifApi } from "@/src/api/endpoints";
import {
  registerPushToken,
  addTokenRefreshListener,
  addNotificationListeners,
  getInitialNotificationData,
} from "@/src/lib/push";

function orderIdFrom(data: any): string | null {
  if (!data) return null;
  return (
    data.order_id ||
    data.orderId ||
    (data.data && (data.data.order_id || data.data.orderId)) ||
    null
  );
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
      NotifApi.registerFcmToken(token, Platform.OS).catch(() => {});
    });

    const stopTap = addNotificationListeners((data) => {
      const id = orderIdFrom(data);
      if (id) router.push(`/delivery/${id}`);
      else router.push("/notifications");
    });

    // Cold-start tap (app opened from a killed state via a notification)
    getInitialNotificationData().then((data) => {
      const id = orderIdFrom(data);
      if (id) router.push(`/delivery/${id}`);
    });

    return () => {
      stopRefresh();
      stopTap();
    };
  }, [authed, router]);
}
