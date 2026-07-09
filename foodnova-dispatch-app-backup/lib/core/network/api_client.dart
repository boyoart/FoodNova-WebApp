import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../state/session_controller.dart';

const bool _apiLogsEnabled =
    bool.fromEnvironment('FOODNOVA_API_LOGS', defaultValue: true);

final dioProvider = Provider<Dio>((ref) {
  debugPrint(
    '[FoodNova Dispatch API] BASE_URL ${AppConfig.normalizedApiBaseUrl}',
  );
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
        _log('REQUEST ${options.method} ${options.uri}');
        _log('AUTH_ATTACHED ${options.headers['Authorization'] != null}');
        _log('REQUEST_BODY ${options.data}');
        handler.next(options);
      },
      onResponse: (response, handler) {
        _log(
          'RESPONSE ${response.statusCode} ${response.requestOptions.method} ${response.requestOptions.uri}',
        );
        _log('RESPONSE_BODY ${response.data}');
        handler.next(response);
      },
      onError: (error, handler) async {
        // CRITICAL: Only clear session on 401 for authenticated endpoints
        // Public endpoints like /delivery-workers/verify-nin should NOT trigger logout
        final path = error.requestOptions.path;
        final isPublicEndpoint = [
          '/delivery-workers/verify-nin',
          '/delivery/auth/check-email',
          '/delivery/auth/send-otp',
          '/delivery/auth/verify-otp',
          '/delivery/auth/register',
          '/delivery/auth/login',
          '/auth/login',
        ].any((endpoint) => path.contains(endpoint));
        if (error.response?.statusCode == 401 && !isPublicEndpoint) {
          debugPrint(
            'TOKEN_INVALID auth_error=${error.response?.statusCode} path=$path',
          );
          await ref.read(sessionControllerProvider.notifier).clear();
        }
        _log(
          'ERROR ${error.response?.statusCode} ${error.requestOptions.method} ${error.requestOptions.uri}',
        );
        _log('ERROR_BODY ${error.response?.data}');
        handler.next(error);
      },
    ),
  );
  return dio;
});

void _log(String message) {
  if (!_apiLogsEnabled) return;
  debugPrint('[FoodNova Dispatch API] $message');
}

String apiMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (error.response?.statusCode == 500) {
      final detail =
          data is Map ? '${data['detail'] ?? data['message'] ?? ''}' : '$data';
      if (detail.trim().isEmpty ||
          detail.toLowerCase().contains('internal server error')) {
        return 'FoodNova could not complete this request. Please try again, and contact support if it continues.';
      }
    }
    if (data is Map && data['error'] != null) return data['error'].toString();
    if (data is Map && data['detail'] != null) return data['detail'].toString();
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

String apiOperationMessage(Object error, String operation) {
  final message = apiMessage(error);
  if (error is DioException) {
    debugPrint(
      'API_OPERATION_FAILED operation=$operation '
      'status=${error.response?.statusCode} '
      'body=${error.response?.data}',
    );
    if (message.startsWith('FoodNova could not complete this request')) {
      return '$operation failed because FoodNova returned an internal server error. Please try again.';
    }
  }
  return '$operation failed: $message';
}
