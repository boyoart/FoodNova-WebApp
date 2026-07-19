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
        commit: process.env.EXPO_PUBLIC_BUILD_COMMIT || "unknown",
        date: process.env.EXPO_PUBLIC_BUILD_DATE || new Date().toISOString(),
        environment: process.env.EXPO_PUBLIC_BUILD_ENV || process.env.NODE_ENV || "production",
        apiBaseUrl:
          process.env.EXPO_PUBLIC_FOODNOVA_API ||
          "https://foodnova-webapp.onrender.com",
      },
    },
  };
};
