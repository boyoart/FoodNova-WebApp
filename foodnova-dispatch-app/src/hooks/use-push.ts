import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { NotifApi } from "@/src/api/endpoints";
import { resolveNotificationDestination } from "@/src/lib/notification-routing";
import {
  registerPushToken,
  addTokenRefreshListener,
  addNotificationListeners,
  dispatchNotificationData,
  getInitialNotificationData,
} from "@/src/lib/push";

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
      const target = resolveNotificationDestination(data);
      if (target.notificationId) NotifApi.markRead(target.notificationId).catch(() => {});
      dispatchNotificationData(data);
      console.log("DISPATCH_NOTIFICATION_TAPPED", { target: target.route });
      router.push(target.route as any);
    });

    // Cold-start tap (app opened from a killed state via a notification)
    getInitialNotificationData().then((data) => {
      if (data) {
        const target = resolveNotificationDestination(data);
        if (target.notificationId) NotifApi.markRead(target.notificationId).catch(() => {});
        dispatchNotificationData(data);
        console.log("DISPATCH_NOTIFICATION_COLD_START", { target: target.route });
        router.push(target.route as any);
      }
    });

    return () => {
      stopRefresh();
      stopTap();
    };
  }, [authed, router]);
}
