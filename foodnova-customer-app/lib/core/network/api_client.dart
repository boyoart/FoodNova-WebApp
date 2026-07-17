import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../state/session_controller.dart';

const bool _apiLogsEnabled =
    bool.fromEnvironment('FOODNOVA_API_LOGS', defaultValue: false);

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.normalizedApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      headers: {'Content-Type': 'application/json'},
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
        _log('request ${options.method} ${options.uri}');
        _log('headers=${_safeHeaders(options.headers)}');
        _log('body=${options.data}');
        handler.next(options);
      },
      onResponse: (response, handler) {
        _log(
            'response status=${response.statusCode} url=${response.requestOptions.uri}');
        _log('responseBody=${response.data}');
        final token = response.data is Map
            ? (response.data['access_token'] ?? response.data['token'])
            : null;
        if (token != null) {
          _log('token returned=${token.toString().isNotEmpty}');
        }
        handler.next(response);
      },
      onError: (error, handler) async {
        _log('error type=${error.type} message=${error.message}');
        _log(
            'error status=${error.response?.statusCode} url=${error.requestOptions.uri}');
        _log('errorBody=${error.response?.data}');
        final status = error.response?.statusCode;
        final detail = error.response?.data is Map
            ? '${error.response?.data['detail'] ?? error.response?.data['message'] ?? ''}'
            : '';
        if (status == 401 ||
            (status == 403 &&
                RegExp('removed|deactivated|suspended', caseSensitive: false)
                    .hasMatch(detail))) {
          await ref.read(sessionControllerProvider.notifier).clear();
        }
        handler.next(error);
      },
    ),
  );
  return dio;
});

class ApiFailure implements Exception {
  ApiFailure(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

void _log(String message) {
  if (!_apiLogsEnabled) return;
  debugPrint('[FoodNova API] $message');
}

Map<String, dynamic> _safeHeaders(Map<String, dynamic> headers) {
  return headers.map((key, value) {
    final lower = key.toLowerCase();
    if (lower == 'authorization' ||
        lower.contains('token') ||
        lower.contains('key')) {
      return MapEntry(key, '***');
    }
    return MapEntry(key, value);
  });
}

String apiMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['detail'] != null) {
      return data['detail'].toString();
    }
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'FoodNova is taking too long to respond. Check your connection and try again.';
      case DioExceptionType.connectionError:
        if (kIsWeb) {
          return 'Could not reach FoodNova over HTTPS. This can happen when the browser blocks the request, CORS is not deployed yet, or the network is offline.';
        }
        return 'Could not reach FoodNova. Check your internet connection and try again.';
      case DioExceptionType.badCertificate:
        return 'Secure connection to FoodNova failed. Please try again later.';
      case DioExceptionType.cancel:
        return 'Request was cancelled. Please try again.';
      case DioExceptionType.badResponse:
        return error.response?.statusMessage ??
            'FoodNova returned an unexpected response.';
      case DioExceptionType.unknown:
        return error.message ??
            'Network request failed before FoodNova could respond.';
    }
  }
  return error.toString();
}
