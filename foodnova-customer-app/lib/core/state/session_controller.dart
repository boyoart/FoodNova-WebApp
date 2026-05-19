import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());

final sessionControllerProvider =
    StateNotifierProvider<SessionController, AsyncValue<bool>>((ref) {
  return SessionController(ref.watch(secureStorageProvider))..restore();
});

class SessionController extends StateNotifier<AsyncValue<bool>> {
  SessionController(this._storage) : super(const AsyncValue.loading());

  final FlutterSecureStorage _storage;

  Future<void> restore() async {
    final value = await _storage.read(key: 'access_token');
    state = AsyncValue.data(value != null && value.isNotEmpty);
  }

  Future<String?> token() => _storage.read(key: 'access_token');

  Future<void> save(String token) async {
    await _storage.write(key: 'access_token', value: token);
    state = const AsyncValue.data(true);
  }

  Future<void> clear() async {
    await _storage.delete(key: 'access_token');
    state = const AsyncValue.data(false);
  }
}
