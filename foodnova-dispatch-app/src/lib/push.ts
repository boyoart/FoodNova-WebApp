import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

import { NotifApi } from "@/src/api/endpoints";

// Foreground behaviour — show banner + list + sound while app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const isNative = Platform.OS !== "web";
const foregroundListeners = new Set<(data: any) => void>();

export function addForegroundNotificationListener(cb: (data: any) => void) {
  foregroundListeners.add(cb);
  return () => {
    foregroundListeners.delete(cb);
  };
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("dispatch", {
    name: "Delivery Offers",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#00C261",
    sound: "default",
  });
}

// Register the native FCM device token with the existing backend.
// Works only on a real Android/iOS build (needs google-services.json + FCM creds).
export async function registerPushToken(): Promise<string | null> {
  if (!isNative || !Device.isDevice) return null;
  try {
    await ensureAndroidChannel();

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
      await NotifApi.registerFcmToken(String(token), Platform.OS).catch(() => {});
    }
    return token ? String(token) : null;
  } catch {
    return null;
  }
}

// Fires when FCM rotates the device token — re-register with the backend.
export function addTokenRefreshListener(cb: (token: string) => void) {
  if (!isNative) return () => {};
  const sub = Notifications.addPushTokenListener((t) => {
    const token = (t as any)?.data ?? "";
    if (token) cb(String(token));
  });
  return () => sub.remove();
}

// Foreground receipt + tap (from background/quit) listeners.
export function addNotificationListeners(onTap: (data: any) => void) {
  if (!isNative) return () => {};
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    foregroundListeners.forEach((listener) => listener(data));
  });
  const response = Notifications.addNotificationResponseReceivedListener((resp) => {
    onTap(resp.notification.request.content.data);
  });
  return () => {
    received.remove();
    response.remove();
  };
}

// Data payload of the notification that cold-started the app (tap from killed state).
export async function getInitialNotificationData(): Promise<any | null> {
  if (!isNative) return null;
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    return last?.notification?.request?.content?.data ?? null;
  } catch {
    return null;
  }
}
