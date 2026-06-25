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
const _currentOnboardingStepKey = 'foodnova_dispatch_current_step';
const _onboardingDraftKey = 'foodnova_dispatch_onboarding_draft';
const _verifiedIdentityKey = 'foodnova_dispatch_verified_identity';

const dispatchOnboardingTotalSteps = 11;

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());

final sessionControllerProvider =
    AsyncNotifierProvider<SessionController, bool>(SessionController.new);

class SessionController extends AsyncNotifier<bool> {
  Map<String, dynamic> _cachedDiagnostics = const {};

  Map<String, dynamic> get cachedDiagnosticsOrEmpty => _cachedDiagnostics;

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
    _cachedDiagnostics = {
      'token_present': token != null && token.isNotEmpty,
      'token_length': token?.length ?? 0,
      'token_preview': token == null || token.isEmpty
          ? ''
          : '***${token.substring(token.length > 6 ? token.length - 6 : 0)}',
      'rider_id': prefs.getString(_riderIdKey) ?? '',
      'onboarding_complete': prefs.getBool(_onboardingCompletedKey) ?? false,
      'approval_status': prefs.getString(_approvalStatusKey) ?? '',
      'current_step': prefs.getInt(_currentOnboardingStepKey) ?? 1,
      'profile_exists': prefs.getBool(_profileExistsKey) ?? false,
      'profile_source': prefs.getString(_profileSourceKey) ?? '',
      'last_api_response': prefs.getString(_lastApiResponseKey) ?? '',
    };
    return _cachedDiagnostics;
  }

  Future<void> recordLastApiResponse(String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastApiResponseKey, value);
  }

  Future<int> currentOnboardingStep() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getInt(_currentOnboardingStepKey) ?? 1)
        .clamp(1, dispatchOnboardingTotalSteps)
        .toInt();
  }

  Future<void> saveOnboardingStep(int step) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(
      _currentOnboardingStepKey,
      step.clamp(1, dispatchOnboardingTotalSteps).toInt(),
    );
  }

  Future<String> onboardingDraft() async {
    return await ref
            .read(secureStorageProvider)
            .read(key: _onboardingDraftKey) ??
        '';
  }

  Future<void> saveOnboardingDraft(String value) async {
    await ref
        .read(secureStorageProvider)
        .write(key: _onboardingDraftKey, value: value);
  }

  Future<String> verifiedIdentity() async {
    final secureValue =
        await ref.read(secureStorageProvider).read(key: _verifiedIdentityKey);
    if (secureValue != null && secureValue.trim().isNotEmpty) {
      return secureValue;
    }
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_verifiedIdentityKey) ?? '';
  }

  Future<void> saveVerifiedIdentity(String value) async {
    await ref
        .read(secureStorageProvider)
        .write(key: _verifiedIdentityKey, value: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_verifiedIdentityKey, value);
  }

  Future<void> clearOnboardingDraft() async {
    await ref.read(secureStorageProvider).delete(key: _onboardingDraftKey);
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
    int currentStep = dispatchOnboardingTotalSteps,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_riderIdKey, riderId);
    await prefs.setString(_approvalStatusKey, approvalStatus);
    await prefs.setBool(_onboardingCompletedKey, onboardingCompleted);
    await prefs.setBool(_profileExistsKey, profileExists);
    await prefs.setString(_profileSourceKey, profileSource);
    await prefs.setInt(
      _currentOnboardingStepKey,
      currentStep.clamp(1, dispatchOnboardingTotalSteps).toInt(),
    );
    _cachedDiagnostics = {
      ..._cachedDiagnostics,
      'rider_id': riderId,
      'approval_status': approvalStatus,
      'onboarding_complete': onboardingCompleted,
      'profile_exists': profileExists,
      'profile_source': profileSource,
      'current_step':
          currentStep.clamp(1, dispatchOnboardingTotalSteps).toInt(),
    };
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
      await prefs.remove(_currentOnboardingStepKey);
      await prefs.remove(_verifiedIdentityKey);
      await ref.read(secureStorageProvider).delete(key: _onboardingDraftKey);
      await ref.read(secureStorageProvider).delete(key: _verifiedIdentityKey);
    }
    _cachedDiagnostics = const {};
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
    await prefs.remove(_currentOnboardingStepKey);
    await prefs.remove(_verifiedIdentityKey);
    await ref.read(secureStorageProvider).delete(key: _onboardingDraftKey);
    await ref.read(secureStorageProvider).delete(key: _verifiedIdentityKey);
  }

  Future<void> logoutAndReset() => clear(clearOnboarding: true);
}
