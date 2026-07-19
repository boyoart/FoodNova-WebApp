import Constants from "expo-constants";

import { BASE_URL } from "@/src/api/client";

type EmbeddedIdentity = {
  commit?: string;
  date?: string;
  environment?: string;
  apiBaseUrl?: string;
};

const expoConfig = Constants.expoConfig;
const embedded = (expoConfig?.extra?.buildIdentity || {}) as EmbeddedIdentity;

export const BUILD_IDENTITY = Object.freeze({
  appVersion: expoConfig?.version || "unknown",
  buildNumber: String(expoConfig?.android?.versionCode ?? expoConfig?.ios?.buildNumber ?? "unknown"),
  commit: embedded.commit || process.env.EXPO_PUBLIC_BUILD_COMMIT || "unknown",
  buildDate: embedded.date || process.env.EXPO_PUBLIC_BUILD_DATE || "unknown",
  apiBaseUrl: embedded.apiBaseUrl || BASE_URL,
  environment: embedded.environment || process.env.EXPO_PUBLIC_BUILD_ENV || (__DEV__ ? "development" : "production"),
  applicationId: expoConfig?.android?.package || expoConfig?.ios?.bundleIdentifier || "unknown",
});

export function logBuildIdentity() {
  if (!__DEV__) return;
  console.log("FOODNOVA_DISPATCH_BUILD_IDENTITY", {
    appVersion: BUILD_IDENTITY.appVersion,
    buildNumber: BUILD_IDENTITY.buildNumber,
    commit: BUILD_IDENTITY.commit,
  });
}
