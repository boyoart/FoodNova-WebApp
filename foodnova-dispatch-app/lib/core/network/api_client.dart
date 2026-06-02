import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../state/session_controller.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.normalizedApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
            'FoodNovaDispatch/1.0 (Linux; Android 14; Mobile) Flutter',
      },
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token =
            await ref.read(sessionControllerProvider.notifier).token();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // CRITICAL: Only clear session on 401 for authenticated endpoints
        // Public endpoints like /delivery-workers/verify-nin should NOT trigger logout
        final path = error.requestOptions.path ?? '';
        final isPublicEndpoint = [
          '/delivery-workers/verify-nin',
          '/delivery/auth/login',
          '/auth/login',
        ].any((endpoint) => path.contains(endpoint));
        
        if (error.response?.statusCode == 401 && !isPublicEndpoint) {
          print('TOKEN_INVALID auth_error=${error.response?.statusCode} path=$path');
          await ref.read(sessionControllerProvider.notifier).clear();
        }
        handler.next(error);
      },
    ),
  );
  return dio;
});

String apiMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['detail'] != null) {
      return data['detail'].toString();
    }
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    if (error.type == DioExceptionType.connectionError) {
      return 'Could not reach FoodNova. Check your connection and try again.';
    }
    return error.message ?? 'FoodNova returned an unexpected response.';
  }
  return error.toString();
}
