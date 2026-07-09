import { Platform } from "react-native";
import * as Location from "expo-location";

import type { Coords } from "@/src/api/endpoints";

export type PermState = "granted" | "denied" | "undetermined" | "blocked";

export async function getForegroundPermission(): Promise<PermState> {
  if (Platform.OS === "web") return "granted";
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied" && !canAskAgain) return "blocked";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function requestForegroundPermission(): Promise<PermState> {
  if (Platform.OS === "web") return "granted";
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied" && !canAskAgain) return "blocked";
  return "denied";
}

export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    if (Platform.OS === "web") {
      return { latitude: 6.5244, longitude: 3.3792, timestamp: new Date().toISOString() };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: new Date(pos.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}
