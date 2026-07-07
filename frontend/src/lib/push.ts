import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

import { NotifApi } from "@/src/api/endpoints";

// Foreground behaviour
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Register the native FCM device token with the existing backend.
// Works only on a real Android/iOS build (needs google-services.json + FCM creds).
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("dispatch", {
        name: "Delivery Offers",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00C261",
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = (tokenResp as any)?.data ?? "";
    if (token) {
      await NotifApi.registerFcmToken(token, Platform.OS).catch(() => {});
    }
    return token || null;
  } catch {
    return null;
  }
}

export function addNotificationListeners(onTap: (data: any) => void) {
  const received = Notifications.addNotificationReceivedListener(() => {});
  const response = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data;
    onTap(data);
  });
  return () => {
    received.remove();
    response.remove();
  };
}
