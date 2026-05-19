class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'FOODNOVA_API_BASE_URL',
    defaultValue: 'https://foodnova-webapp.onrender.com',
  );

  static const appName = 'FoodNova';
}
