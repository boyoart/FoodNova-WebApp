import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum OnboardingDocumentKind {
  selfie('selfie', 'selfie'),
  driverLicense('driver_license', 'license'),
  proofOfAddress('proof_of_address', 'address');

  const OnboardingDocumentKind(this.storageValue, this.folderName);

  final String storageValue;
  final String folderName;

  static OnboardingDocumentKind? fromStorageValue(String value) {
    for (final kind in values) {
      if (kind.storageValue == value) return kind;
    }
    return null;
  }
}

class OnboardingRecoveredFile {
  const OnboardingRecoveredFile({
    required this.kind,
    required this.path,
    required this.name,
    required this.size,
  });

  final OnboardingDocumentKind kind;
  final String path;
  final String name;
  final int size;

  XFile toXFile() => XFile(path, name: name);

  PlatformFile toPlatformFile() => PlatformFile(
        name: name,
        path: path,
        size: size,
      );
}

class OnboardingFileRecoveryService {
  OnboardingFileRecoveryService({ImagePicker? picker})
      : _picker = picker ?? ImagePicker();

  static const _pendingKindKey = 'foodnova_dispatch_pending_picker_kind';

  final ImagePicker _picker;

  Future<void> markPickerPending(OnboardingDocumentKind kind) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_pendingKindKey, kind.storageValue);
  }

  Future<void> clearPickerPending() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_pendingKindKey);
  }

  Future<OnboardingDocumentKind?> pendingPickerKind() async {
    final prefs = await SharedPreferences.getInstance();
    return OnboardingDocumentKind.fromStorageValue(
      prefs.getString(_pendingKindKey) ?? '',
    );
  }

  Future<OnboardingRecoveredFile?> retrieveLostPickerFile() async {
    final kind = await pendingPickerKind();
    if (kind == null) return null;

    final response = await _picker.retrieveLostData();
    if (response.isEmpty) return null;

    final file = response.file ??
        (response.files?.isNotEmpty == true ? response.files!.first : null);
    if (file == null) return null;

    final recovered = await persistXFile(file, kind);
    await clearPickerPending();
    return recovered;
  }

  Future<OnboardingRecoveredFile> persistXFile(
    XFile file,
    OnboardingDocumentKind kind,
  ) async {
    final source = File(file.path);
    final name =
        file.name.trim().isEmpty ? source.uri.pathSegments.last : file.name;
    return _copyIntoDocuments(source, kind, name);
  }

  Future<OnboardingRecoveredFile> persistPlatformFile(
    PlatformFile file,
    OnboardingDocumentKind kind,
  ) async {
    final sourcePath = file.path;
    if (sourcePath == null || sourcePath.trim().isEmpty) {
      throw StateError('Selected file has no readable path.');
    }
    return _copyIntoDocuments(File(sourcePath), kind, file.name);
  }

  Future<OnboardingRecoveredFile> _copyIntoDocuments(
    File source,
    OnboardingDocumentKind kind,
    String originalName,
  ) async {
    if (!source.existsSync()) {
      throw StateError('Selected file is no longer available.');
    }

    final documents = await getApplicationDocumentsDirectory();
    final folder = Directory(
      '${documents.path}${Platform.pathSeparator}onboarding${Platform.pathSeparator}${kind.folderName}',
    );
    if (!folder.existsSync()) {
      await folder.create(recursive: true);
    }

    final ext = _extensionFromName(originalName);
    final targetName =
        '${kind.storageValue}_${DateTime.now().millisecondsSinceEpoch}$ext';
    final target = File('${folder.path}${Platform.pathSeparator}$targetName');
    await source.copy(target.path);
    final size = await target.length();
    return OnboardingRecoveredFile(
      kind: kind,
      path: target.path,
      name: targetName,
      size: size,
    );
  }

  String _extensionFromName(String name) {
    final clean = name.trim();
    final dot = clean.lastIndexOf('.');
    if (dot < 0 || dot == clean.length - 1) return '.jpg';
    final ext = clean.substring(dot).toLowerCase();
    return ext.length > 10 ? '.jpg' : ext;
  }
}
