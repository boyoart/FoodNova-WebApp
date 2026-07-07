import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../core/state/session_controller.dart';

final appSecurityServiceProvider = Provider<AppSecurityService>((ref) {
  return AppSecurityService(
    ref.watch(secureStorageProvider),
    LocalAuthentication(),
  );
});

class AppSecurityService {
  AppSecurityService(this._storage, this._auth);

  final FlutterSecureStorage _storage;
  final LocalAuthentication _auth;

  static const _biometricEnabledKey = 'foodnova_biometric_enabled';
  static const _biometricPromptedKey = 'foodnova_biometric_prompted';
  static const _biometricTokenKey = 'foodnova_biometric_token';

  Future<bool> get biometricEnabled async =>
      await _storage.read(key: _biometricEnabledKey) == 'true';

  Future<bool> get hasBiometricCredential async {
    final token = await rememberedToken();
    return await biometricEnabled &&
        token != null &&
        token.isNotEmpty &&
        await biometricsAvailable();
  }

  Future<String?> rememberedToken() => _storage.read(key: _biometricTokenKey);

  Future<void> rememberToken(String token) async {
    final value = token.trim();
    if (value.isEmpty) return;
    await _storage.write(key: _biometricTokenKey, value: value);
  }

  Future<void> deleteLegacyPinStorage() async {
    const keys = [
      'foodnova_app_pin',
      'user_pin',
      'pin_enabled',
      'pin_attempts',
    ];
    for (final key in keys) {
      await _storage.delete(key: key);
    }
  }

  Future<bool> biometricsAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      final enrolled = await _auth.getAvailableBiometrics();
      return supported && canCheck && enrolled.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<bool?> biometricSetupChoice() async {
    if (await _storage.read(key: _biometricPromptedKey) == 'true') return null;
    if (!await biometricsAvailable()) return null;
    await _storage.write(key: _biometricPromptedKey, value: 'true');
    return true;
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    if (enabled && !await biometricsAvailable()) {
      throw StateError('Biometrics are not available on this device.');
    }
    await _storage.write(
      key: _biometricEnabledKey,
      value: enabled ? 'true' : 'false',
    );
  }

  Future<bool> authenticateBiometric(
      {String reason = 'Unlock FoodNova'}) async {
    if (!await biometricEnabled || !await biometricsAvailable()) return false;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
