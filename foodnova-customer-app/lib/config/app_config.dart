class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'FOODNOVA_API_BASE_URL',
    defaultValue: 'https://foodnova-webapp.onrender.com',
  );

  static const appName = 'FoodNova';
  static const googlePlacesApiKey = String.fromEnvironment(
    'GOOGLE_PLACES_API_KEY',
    defaultValue: '',
  );

  static const supportPhone = '+2348025801125';
  static const supportEmail = 'support@foodnova.com.ng';

  static Uri get apiUri {
    final uri = Uri.parse(apiBaseUrl);
    if (uri.scheme != 'https') {
      throw StateError(
          'FoodNova API must use HTTPS in production: $apiBaseUrl');
    }
    return uri;
  }

  static String get normalizedApiBaseUrl {
    final value = apiUri.toString();
    return value.endsWith('/') ? value.substring(0, value.length - 1) : value;
  }

  static String resolveMediaUrl(String? url) {
    final value = (url ?? '').trim();
    if (value.isEmpty) return '';
    final lower = value.toLowerCase();
    if (lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('data:') ||
        lower.startsWith('blob:')) {
      return value;
    }
    if (value.startsWith('/uploads')) return '$normalizedApiBaseUrl$value';
    if (value.startsWith('uploads/')) return '$normalizedApiBaseUrl/$value';
    return value;
  }
}
