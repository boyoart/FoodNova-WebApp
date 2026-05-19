import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(dioProvider), ref);
});

class AuthRepository {
  AuthRepository(this._dio, this._ref);

  final Dio _dio;
  final Ref _ref;

  Future<void> checkHealth() async {
    try {
      final response = await _dio.get('/health');
      final ok = response.statusCode == 200 && response.data is Map && response.data['success'] == true;
      if (!ok) throw ApiFailure('FoodNova backend health check failed.');
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> login({required String email, required String password, bool preflight = true}) async {
    try {
      if (preflight) await checkHealth();
      final response = await _dio.post('/auth/login', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
      });
      final token = '${response.data['access_token'] ?? response.data['token'] ?? ''}';
      if (token.isEmpty) throw ApiFailure('Login response did not include a token');
      await _ref.read(sessionControllerProvider.notifier).save(token);
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    try {
      final response = await _dio.post('/auth/register', data: {
        'full_name': fullName.trim(),
        'email': email.trim().toLowerCase(),
        'phone': phone.trim(),
        'password': password,
      });
      final token = '${response.data['access_token'] ?? response.data['token'] ?? ''}';
      if (token.isNotEmpty) {
        await _ref.read(sessionControllerProvider.notifier).save(token);
      }
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> logout() => _ref.read(sessionControllerProvider.notifier).clear();
}
