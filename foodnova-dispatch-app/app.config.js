const { execFileSync } = require("node:child_process");

function buildCommit() {
  if (process.env.EXPO_PUBLIC_BUILD_COMMIT) return process.env.EXPO_PUBLIC_BUILD_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(googleMapsApiKey
        ? { config: { ...config.ios?.config, googleMapsApiKey } }
        : {}),
    },
    android: {
      ...config.android,
      ...(googleMapsApiKey
        ? { config: { ...config.android?.config, googleMaps: { apiKey: googleMapsApiKey } } }
        : {}),
    },
    extra: {
      ...config.extra,
      buildIdentity: {
        commit: buildCommit(),
        date: process.env.EXPO_PUBLIC_BUILD_DATE || new Date().toISOString(),
        environment: process.env.EXPO_PUBLIC_BUILD_ENV || process.env.NODE_ENV || "production",
        apiBaseUrl:
          process.env.EXPO_PUBLIC_FOODNOVA_API ||
          "https://foodnova-webapp.onrender.com",
      },
    },
  };
};
