import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _tokenKey = 'foodnova_dispatch_token';
const _rememberKey = 'foodnova_dispatch_remember_me';
const _onboardingCompletedKey = 'foodnova_dispatch_onboarding_completed';
const _riderIdKey = 'foodnova_dispatch_rider_id';
const _approvalStatusKey = 'foodnova_dispatch_approval_status';
const _profileExistsKey = 'foodnova_dispatch_profile_exists';
const _profileSourceKey = 'foodnova_dispatch_profile_source';
const _lastApiResponseKey = 'foodnova_dispatch_last_api_response';

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

  Future<Map<String, dynamic>> diagnostics() async {
    final token = await this.token();
    final prefs = await SharedPreferences.getInstance();
    return {
      'token_present': token != null && token.isNotEmpty,
      'token_length': token?.length ?? 0,
      'token_preview': token == null || token.isEmpty
          ? ''
          : '***${token.substring(token.length > 6 ? token.length - 6 : 0)}',
      'rider_id': prefs.getString(_riderIdKey) ?? '',
      'onboarding_complete': prefs.getBool(_onboardingCompletedKey) ?? false,
      'approval_status': prefs.getString(_approvalStatusKey) ?? '',
      'profile_exists': prefs.getBool(_profileExistsKey) ?? false,
      'profile_source': prefs.getString(_profileSourceKey) ?? '',
      'last_api_response': prefs.getString(_lastApiResponseKey) ?? '',
    };
  }

  Future<void> recordLastApiResponse(String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastApiResponseKey, value);
  }

  Future<void> save(String token, {bool remember = true}) async {
    await ref.read(secureStorageProvider).write(key: _tokenKey, value: token);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_rememberKey, remember);
    state = const AsyncData(true);
  }

  Future<bool> onboardingCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_onboardingCompletedKey) ?? false;
  }

  Future<void> saveRiderState({
    required String riderId,
    required String approvalStatus,
    required bool onboardingCompleted,
    bool profileExists = true,
    String profileSource = 'backend',
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_riderIdKey, riderId);
    await prefs.setString(_approvalStatusKey, approvalStatus);
    await prefs.setBool(_onboardingCompletedKey, onboardingCompleted);
    await prefs.setBool(_profileExistsKey, profileExists);
    await prefs.setString(_profileSourceKey, profileSource);
  }

  Future<void> markProfileMissing({String profileSource = 'backend'}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_profileExistsKey, false);
    await prefs.setString(_profileSourceKey, profileSource);
  }

  Future<void> clear({bool clearOnboarding = false}) async {
    await ref.read(secureStorageProvider).delete(key: _tokenKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_riderIdKey);
    await prefs.remove(_approvalStatusKey);
    await prefs.remove(_profileExistsKey);
    await prefs.remove(_profileSourceKey);
    if (clearOnboarding) {
      await prefs.remove(_onboardingCompletedKey);
    }
    state = const AsyncData(false);
  }

  Future<void> clearSession() => clear();

  Future<void> clearOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_onboardingCompletedKey);
    await prefs.remove(_riderIdKey);
    await prefs.remove(_approvalStatusKey);
    await prefs.remove(_profileExistsKey);
    await prefs.remove(_profileSourceKey);
  }

  Future<void> logoutAndReset() => clear(clearOnboarding: true);
}
