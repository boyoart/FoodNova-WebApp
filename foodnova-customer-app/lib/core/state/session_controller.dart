import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());

final sessionControllerProvider =
    StateNotifierProvider<SessionController, AsyncValue<bool>>((ref) {
  return SessionController(ref.watch(secureStorageProvider));
});

class SessionController extends StateNotifier<AsyncValue<bool>> {
  SessionController(this._storage) : super(const AsyncValue.loading());

  final FlutterSecureStorage _storage;

  static const corruptedAuthKeys = <String>[
    'access_token',
    'foodnova_user',
    'foodnova_guest_mode',
    'foodnova_biometric_token',
    'foodnova_biometric_enabled',
    'foodnova_biometric_prompted',
  ];

  Future<void> restore() async {
    final value = await _storage.read(key: 'access_token');
    state = AsyncValue.data(value != null && value.isNotEmpty);
  }

  Future<String?> token() => _storage.read(key: 'access_token');
  Future<String?> cachedUser() => _storage.read(key: 'foodnova_user');
  Future<bool> isGuest() async =>
      (await _storage.read(key: 'foodnova_guest_mode')) == 'true';

  Future<void> continueAsGuest() async {
    await _storage.write(key: 'foodnova_guest_mode', value: 'true');
    state = const AsyncValue.data(false);
  }

  Future<void> save(String token) async {
    await _storage.write(key: 'access_token', value: token);
    await _storage.delete(key: 'foodnova_guest_mode');
    state = const AsyncValue.data(true);
  }

  Future<void> saveUser(String json) async {
    await _storage.write(key: 'foodnova_user', value: json);
  }

  Future<void> clear() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'foodnova_user');
    await _storage.delete(key: 'foodnova_guest_mode');
    state = const AsyncValue.data(false);
  }

  Future<void> clearCorruptedAuthState() async {
    for (final key in corruptedAuthKeys) {
      try {
        await _storage.delete(key: key);
      } on PlatformException catch (error) {
        if (!isSecureStorageCorruption(error)) rethrow;
      }
    }
    state = const AsyncValue.data(false);
  }
}

bool isSecureStorageCorruption(PlatformException error) {
  final text = '${error.code} ${error.message ?? ''} ${error.details ?? ''}'
      .toLowerCase();
  return <String>[
    'badpaddingexception',
    'bad_decrypt',
    'keystore',
    'key permanently invalidated',
    'keypermanentlyinvalidatedexception',
    'decrypt',
    'decryption',
    'cipher',
    'encryptedsharedpreferences',
  ].any(text.contains);
}
