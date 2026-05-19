class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'FOODNOVA_API_BASE_URL',
    defaultValue: 'https://foodnova-webapp.onrender.com',
  );

  static const appName = 'FoodNova';

  static Uri get apiUri {
    final uri = Uri.parse(apiBaseUrl);
    if (uri.scheme != 'https') {
      throw StateError('FoodNova API must use HTTPS in production: $apiBaseUrl');
    }
    return uri;
  }

  static String get normalizedApiBaseUrl {
    final value = apiUri.toString();
    return value.endsWith('/') ? value.substring(0, value.length - 1) : value;
  }
}
