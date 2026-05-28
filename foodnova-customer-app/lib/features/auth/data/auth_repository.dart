import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../services/app_security_service.dart';
import '../../../services/notification_service.dart';
import '../../notifications/data/notifications_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(dioProvider), ref);
});

class AuthRepository {
  AuthRepository(this._dio, this._ref);

  final Dio _dio;
  final Ref _ref;
  static bool _pushRefreshListenerAttached = false;

  Future<void> checkHealth() async {
    try {
      final response = await _dio.get('/health');
      final ok = response.statusCode == 200 &&
          response.data is Map &&
          response.data['success'] == true;
      if (!ok) throw ApiFailure('FoodNova backend health check failed.');
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> login(
      {required String email,
      required String password,
      bool preflight = true}) async {
    try {
      if (preflight) {
        await checkHealth();
      }
      final response = await _dio.post('/auth/login', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
      });
      final token =
          '${response.data['access_token'] ?? response.data['token'] ?? ''}';
      if (token.isEmpty) {
        throw ApiFailure('Login response did not include a token');
      }
      await _ref.read(sessionControllerProvider.notifier).save(token);
      await _ref.read(appSecurityServiceProvider).rememberToken(token);
      await _cacheCurrentUser();
      await _syncPushToken();
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<Map<String, dynamic>> currentUser() async {
    try {
      final response = await _dio.get('/auth/me');
      final body = response.data;
      final user = body is Map ? (body['user'] ?? body['data'] ?? body) : body;
      return Map<String, dynamic>.from(user as Map);
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<bool> restoreSession() async {
    await _ref.read(sessionControllerProvider.notifier).restore();
    final hasToken = _ref.read(sessionControllerProvider).valueOrNull ?? false;
    if (!hasToken) return false;
    try {
      await currentUser();
      return true;
    } catch (_) {
      await _ref.read(sessionControllerProvider.notifier).clear();
      return false;
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
      final token =
          '${response.data['access_token'] ?? response.data['token'] ?? ''}';
      if (token.isNotEmpty) {
        await _ref.read(sessionControllerProvider.notifier).save(token);
        await _ref.read(appSecurityServiceProvider).rememberToken(token);
        await _cacheCurrentUser();
        await _syncPushToken();
      }
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> logout() =>
      _ref.read(sessionControllerProvider.notifier).clear();

  Future<bool> hasBiometricLogin() =>
      _ref.read(appSecurityServiceProvider).hasBiometricCredential;

  Future<bool> loginWithBiometrics() async {
    final security = _ref.read(appSecurityServiceProvider);
    final ok = await security.authenticateBiometric(
      reason: 'Sign in to FoodNova with your fingerprint',
    );
    if (!ok) return false;
    final token = await security.rememberedToken();
    if (token == null || token.isEmpty) return false;
    await _ref.read(sessionControllerProvider.notifier).save(token);
    try {
      await currentUser();
      await _syncPushToken();
      return true;
    } catch (_) {
      await _ref.read(sessionControllerProvider.notifier).clear();
      return false;
    }
  }

  Future<void> _cacheCurrentUser() async {
    try {
      final user = await currentUser();
      await _ref
          .read(sessionControllerProvider.notifier)
          .saveUser(jsonEncode(user));
    } catch (_) {
      // Token persistence should not fail just because the profile refresh did.
    }
  }

  Future<void> _syncPushToken() async {
    try {
      final token = await NotificationService.currentToken();
      if (token == null || token.isEmpty) return;
      await _ref.read(notificationsRepositoryProvider).registerFcmToken(token);
      if (!_pushRefreshListenerAttached) {
        _pushRefreshListenerAttached = true;
        NotificationService.tokenRefreshStream.listen((nextToken) {
          _ref
              .read(notificationsRepositoryProvider)
              .registerFcmToken(nextToken)
              .catchError((_) {});
        });
      }
    } catch (_) {
      // Push registration must never block login or signup.
    }
  }
}
