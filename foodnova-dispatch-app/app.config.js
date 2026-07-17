module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    buildIdentity: {
      commit: process.env.EXPO_PUBLIC_BUILD_COMMIT || "unknown",
      date: process.env.EXPO_PUBLIC_BUILD_DATE || new Date().toISOString(),
      environment: process.env.EXPO_PUBLIC_BUILD_ENV || process.env.NODE_ENV || "development",
      apiBaseUrl:
        process.env.EXPO_PUBLIC_FOODNOVA_API ||
        "https://foodnova-webapp.onrender.com",
    },
  },
});
