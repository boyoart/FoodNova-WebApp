import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _tokenKey = 'foodnova_dispatch_token';
const _rememberKey = 'foodnova_dispatch_remember_me';
const _onboardingCompletedKey = 'foodnova_dispatch_onboarding_completed';
const _riderIdKey = 'foodnova_dispatch_rider_id';
const _approvalStatusKey = 'foodnova_dispatch_approval_status';

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());

final sessionControllerProvider =
    AsyncNotifierProvider<SessionController, bool>(SessionController.new);

class SessionController extends AsyncNotifier<bool> {
  @override
  Future<bool> build() async {
    final token = await this.token();
    return token != null && token.isNotEmpty;
  }

  Future<String?> token() =>
      ref.read(secureStorageProvider).read(key: _tokenKey);

  Future<bool> rememberMe() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_rememberKey) ?? true;
  }

  Future<void> save(String token, {bool remember = true}) async {
    await ref.read(secureStorageProvider).write(key: _tokenKey, value: token);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_rememberKey, remember);
    state = const AsyncData(true);
  }

  Future<void> saveRiderState({
    required String riderId,
    required String approvalStatus,
    required bool onboardingCompleted,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_riderIdKey, riderId);
    await prefs.setString(_approvalStatusKey, approvalStatus);
    await prefs.setBool(_onboardingCompletedKey, onboardingCompleted);
  }

  Future<void> clear() async {
    await ref.read(secureStorageProvider).delete(key: _tokenKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_riderIdKey);
    await prefs.remove(_approvalStatusKey);
    await prefs.remove(_onboardingCompletedKey);
    state = const AsyncData(false);
  }
}
