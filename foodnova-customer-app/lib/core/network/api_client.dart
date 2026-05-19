import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../state/session_controller.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: '${AppConfig.apiBaseUrl}/api',
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 25),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await ref.read(sessionControllerProvider.notifier).token();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        debugPrint('[FoodNova API] ${options.method} ${options.uri}');
        debugPrint('[FoodNova API] body=${options.data}');
        handler.next(options);
      },
      onResponse: (response, handler) {
        debugPrint('[FoodNova API] status=${response.statusCode} url=${response.requestOptions.uri}');
        debugPrint('[FoodNova API] response=${response.data}');
        final token = response.data is Map ? (response.data['access_token'] ?? response.data['token']) : null;
        if (token != null) debugPrint('[FoodNova API] token returned=${token.toString().isNotEmpty}');
        handler.next(response);
      },
      onError: (error, handler) {
        debugPrint('[FoodNova API] error=${error.response?.statusCode} url=${error.requestOptions.uri}');
        debugPrint('[FoodNova API] errorBody=${error.response?.data}');
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

String apiMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['detail'] != null) return data['detail'].toString();
    if (data is Map && data['message'] != null) return data['message'].toString();
    return error.message ?? 'Network request failed';
  }
  return error.toString();
}
