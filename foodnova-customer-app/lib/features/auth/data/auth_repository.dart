import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../shared/auth/account_roles.dart';
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
      throw ApiFailure(
        apiMessage(error),
        statusCode: error is DioException ? error.response?.statusCode : null,
      );
    }
  }

  Future<Map<String, dynamic>> login(
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
      final responseUser = _extractUser(response.data);
      debugPrint(
          '[FoodNova Auth] backend login response role=${responseUser['role']} admin_role=${responseUser['admin_role']}');
      await _ref.read(sessionControllerProvider.notifier).save(token);
      await _ref.read(appSecurityServiceProvider).rememberToken(token);
      final user = await _cacheCurrentUser(fallback: responseUser);
      _logAuthenticatedUser(user);
      _startPushSync();
      return user;
    } catch (error) {
      throw ApiFailure(
        apiMessage(error),
        statusCode: error is DioException ? error.response?.statusCode : null,
      );
    }
  }

  Future<Map<String, dynamic>> currentUser() async {
    try {
      final response = await _dio.get('/auth/me');
      final body = response.data;
      final user = body is Map ? (body['user'] ?? body['data'] ?? body) : body;
      return Map<String, dynamic>.from(user as Map);
    } catch (error) {
      throw ApiFailure(
        apiMessage(error),
        statusCode: error is DioException ? error.response?.statusCode : null,
      );
    }
  }

  Future<Map<String, dynamic>?> restoreSession() async {
    await _ref.read(sessionControllerProvider.notifier).restore();
    final hasToken = _ref.read(sessionControllerProvider).valueOrNull ?? false;
    if (!hasToken) return null;
    try {
      final user = await _cacheCurrentUser().timeout(
        const Duration(seconds: 8),
      );
      _logAuthenticatedUser(user);
      _startPushSync();
      return user;
    } catch (error) {
      if (error is ApiFailure && error.statusCode == 401) {
        await _ref.read(sessionControllerProvider.notifier).clear();
        return null;
      }
      final cached =
          await _ref.read(sessionControllerProvider.notifier).cachedUser();
      if (cached != null && cached.isNotEmpty) {
        try {
          return Map<String, dynamic>.from(jsonDecode(cached) as Map);
        } catch (_) {}
      }
      return null;
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
        final user = await _cacheCurrentUser();
        _logAuthenticatedUser(user);
        _startPushSync();
      }
    } catch (error) {
      throw ApiFailure(apiMessage(error));
    }
  }

  Future<void> logout() =>
      _ref.read(sessionControllerProvider.notifier).clear();

  Future<bool> hasBiometricLogin() =>
      _ref.read(appSecurityServiceProvider).hasBiometricCredential;

  Future<Map<String, dynamic>?> loginWithBiometrics() async {
    final security = _ref.read(appSecurityServiceProvider);
    final ok = await security.authenticateBiometric(
      reason: 'Sign in to FoodNova with your fingerprint',
    );
    if (!ok) return null;
    final token = await security.rememberedToken();
    if (token == null || token.isEmpty) return null;
    await _ref.read(sessionControllerProvider.notifier).save(token);
    try {
      final user = await _cacheCurrentUser();
      _logAuthenticatedUser(user);
      _startPushSync();
      return user;
    } catch (_) {
      await _ref.read(sessionControllerProvider.notifier).clear();
      return null;
    }
  }

  Future<Map<String, dynamic>> _cacheCurrentUser(
      {Map<String, dynamic>? fallback}) async {
    try {
      final user = await currentUser();
      await _ref
          .read(sessionControllerProvider.notifier)
          .saveUser(jsonEncode(user));
      return user;
    } catch (_) {
      // Token persistence should not fail just because the profile refresh did.
      if (fallback != null && fallback.isNotEmpty) {
        await _ref
            .read(sessionControllerProvider.notifier)
            .saveUser(jsonEncode(fallback));
        return fallback;
      }
      rethrow;
    }
  }

  Map<String, dynamic> _extractUser(dynamic body) {
    if (body is! Map) return <String, dynamic>{};
    final user = body['user'] ?? body['data'] ?? body;
    if (user is Map) return Map<String, dynamic>.from(user);
    return <String, dynamic>{};
  }

  void _logAuthenticatedUser(Map<String, dynamic> user) {
    final role = normalizeAccountRole(user['role'] ?? user['admin_role']);
    debugPrint('USER_ID: ${user['id'] ?? user['user_id'] ?? ''}');
    debugPrint('USER_EMAIL: ${user['email'] ?? ''}');
    debugPrint('USER_ROLE: $role');
    debugPrint('USER_PERMISSIONS: ${user['permissions'] ?? []}');
    if (canUseAdminTools(role)) {
      debugPrint('ADMIN_ROLE_DETECTED');
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
    } catch (error) {
      debugPrint('FCM_REGISTER_FAILED: $error');
      // Push registration must never block login or signup.
    }
  }

  void _startPushSync() {
    unawaited(
      _syncPushToken().timeout(const Duration(seconds: 6)).catchError((error) {
        debugPrint('[FoodNova Push] optional token sync skipped: $error');
      }),
    );
  }
}
