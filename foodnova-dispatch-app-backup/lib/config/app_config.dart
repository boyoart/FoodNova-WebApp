class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'FOODNOVA_API_BASE_URL',
    defaultValue: 'https://foodnova-webapp.onrender.com',
  );

  static const appName = 'FoodNova Dispatch';
  static const supportPhone = '+2348025801125';
  static const supportEmail = 'support@foodnova.com.ng';
  static const googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: '',
  );

  static String get normalizedApiBaseUrl {
    final value = Uri.parse(apiBaseUrl).toString();
    return value.endsWith('/') ? value.substring(0, value.length - 1) : value;
  }

  static String resolveMediaUrl(String? url) {
    final value = (url ?? '').trim();
    if (value.isEmpty) return '';
    if (value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('data:')) {
      return value;
    }
    if (value.startsWith('/')) return '$normalizedApiBaseUrl$value';
    return '$normalizedApiBaseUrl/$value';
  }
}
