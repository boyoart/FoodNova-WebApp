import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

import { Coords, RiderApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from "@/src/lib/background-location";
import { riderLooksOnline } from "@/src/lib/rider-state";

type LocationTrackingState = {
  latestCoords: Coords | null;
  enableBackgroundTracking: () => Promise<"started" | "denied" | "unsupported">;
  stopTracking: () => Promise<void>;
};

const LocationTrackingContext = createContext<LocationTrackingState>({ latestCoords: null, enableBackgroundTracking: startBackgroundLocationTracking, stopTracking: stopBackgroundLocationTracking });

export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const { authed, rider } = useAuth();
  const [latestCoords, setLatestCoords] = useState<Coords | null>(null);
  const online = authed && riderLooksOnline(rider);

  const stopTracking = useCallback(async () => {
    await stopBackgroundLocationTracking().catch(() => {});
    setLatestCoords(null);
  }, []);

  useEffect(() => {
    if (!online || Platform.OS === "web") {
      if (!online) stopTracking();
      return;
    }
    let subscription: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 10000 },
        (location) => {
          const coords: Coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: new Date(location.timestamp).toISOString(),
          };
          setLatestCoords(coords);
          RiderApi.locationPing(coords).catch(() => {});
        }
      );
      const sendStationaryHeartbeat = async () => {
        const location = await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 500 });
        if (!location || cancelled) return;
        const coords: Coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: new Date().toISOString(),
        };
        setLatestCoords(coords);
        await RiderApi.locationPing(coords);
      };
      heartbeat = setInterval(() => {
        sendStationaryHeartbeat().catch((error) => {
          console.log("DISPATCH_LOCATION_HEARTBEAT_FAILED", {
            error: String(error instanceof Error ? error.message : error),
          });
        });
      }, 45000);
    })().catch((error) => {
      console.log("DISPATCH_LOCATION_WATCH_FAILED", {
        error: String(error instanceof Error ? error.message : error),
      });
    });
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      subscription?.remove();
    };
  }, [online, stopTracking]);

  return (
    <LocationTrackingContext.Provider value={{ latestCoords, enableBackgroundTracking: startBackgroundLocationTracking, stopTracking }}>
      {children}
    </LocationTrackingContext.Provider>
  );
}

export const useLocationTracking = () => useContext(LocationTrackingContext);
