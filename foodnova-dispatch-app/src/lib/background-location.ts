import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { RiderApi, Coords } from "@/src/api/endpoints";

export const DISPATCH_LOCATION_TASK = "foodnova-dispatch-location";

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(DISPATCH_LOCATION_TASK)) {
  TaskManager.defineTask(DISPATCH_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.log("DISPATCH_BACKGROUND_LOCATION_ERROR", { message: error.message });
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
    const location = locations[locations.length - 1];
    if (!location) return;
    const coords: Coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: new Date(location.timestamp).toISOString(),
    };
    await RiderApi.locationPing(coords).catch((pingError: any) => {
      console.log("DISPATCH_BACKGROUND_PING_FAILED", { error: String(pingError?.message || pingError) });
    });
  });
}

export async function startBackgroundLocationTracking(): Promise<"started" | "denied" | "unsupported"> {
  if (Platform.OS === "web") return "unsupported";
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== "granted") return "denied";
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") return "denied";
  if (await Location.hasStartedLocationUpdatesAsync(DISPATCH_LOCATION_TASK)) return "started";
  await Location.startLocationUpdatesAsync(DISPATCH_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    deferredUpdatesDistance: 100,
    deferredUpdatesInterval: 30000,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "FoodNova delivery tracking",
      notificationBody: "Location sharing is active while you are online.",
      notificationColor: "#00C261",
    },
  });
  return "started";
}

export async function stopBackgroundLocationTracking() {
  if (Platform.OS === "web") return;
  if (await Location.hasStartedLocationUpdatesAsync(DISPATCH_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DISPATCH_LOCATION_TASK);
  }
}
