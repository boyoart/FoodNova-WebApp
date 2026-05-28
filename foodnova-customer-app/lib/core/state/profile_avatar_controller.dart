import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'session_controller.dart';

final imagePickerProvider = Provider((_) => ImagePicker());

final profileAvatarControllerProvider =
    StateNotifierProvider<ProfileAvatarController, AsyncValue<String?>>((ref) {
  return ProfileAvatarController(
    ref.watch(secureStorageProvider),
    ref.watch(imagePickerProvider),
  )..load();
});

class ProfileAvatarController extends StateNotifier<AsyncValue<String?>> {
  ProfileAvatarController(this._storage, this._picker)
      : super(const AsyncValue.loading());

  final FlutterSecureStorage _storage;
  final ImagePicker _picker;

  static const _globalKey = 'foodnova_profile_avatar_path';

  Future<void> load({String? userKey}) async {
    final keyedPath = await _readKeyed(userKey);
    final globalPath = await _storage.read(key: _globalKey);
    final path = _existingPath(keyedPath) ?? _existingPath(globalPath);
    state = AsyncValue.data(path);
  }

  Future<String?> pick(ImageSource source, {String? userKey}) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 88,
      maxWidth: 1200,
      maxHeight: 1200,
    );
    if (picked == null) return state.valueOrNull;
    final savedPath = await _persistPickedFile(picked);
    await _storage.write(key: _globalKey, value: savedPath);
    final key = _storageKeyForUser(userKey);
    if (key != null) {
      await _storage.write(key: key, value: savedPath);
    }
    state = AsyncValue.data(savedPath);
    return savedPath;
  }

  Future<void> clear({String? userKey}) async {
    final path = state.valueOrNull;
    await _storage.delete(key: _globalKey);
    final key = _storageKeyForUser(userKey);
    if (key != null) await _storage.delete(key: key);
    if (path != null) {
      try {
        final file = File(path);
        if (await file.exists()) await file.delete();
      } catch (_) {}
    }
    state = const AsyncValue.data(null);
  }

  Future<String> _persistPickedFile(XFile picked) async {
    final directory = await getApplicationDocumentsDirectory();
    final avatarDir = Directory(p.join(directory.path, 'foodnova_avatars'));
    if (!await avatarDir.exists()) {
      await avatarDir.create(recursive: true);
    }
    final extension = p.extension(picked.path).isEmpty
        ? '.jpg'
        : p.extension(picked.path).toLowerCase();
    final destination = File(
      p.join(avatarDir.path, 'customer_avatar$extension'),
    );
    await File(picked.path).copy(destination.path);
    return destination.path;
  }

  Future<String?> _readKeyed(String? userKey) async {
    final key = _storageKeyForUser(userKey);
    if (key == null) return null;
    return _storage.read(key: key);
  }

  String? _existingPath(String? path) {
    if (path == null || path.trim().isEmpty) return null;
    return File(path).existsSync() ? path : null;
  }

  String? _storageKeyForUser(String? userKey) {
    final normalized = (userKey ?? '').trim().toLowerCase();
    if (normalized.isEmpty) return null;
    return 'foodnova_profile_avatar_path_$normalized';
  }
}
