import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../shared/auth/account_roles.dart';
import '../../../shared/models/address.dart';

final profileRepositoryProvider =
    Provider((ref) => ProfileRepository(ref.watch(dioProvider), ref));

final profileProvider = FutureProvider<ProfileData>((ref) {
  return ref.watch(profileRepositoryProvider).load();
});

class ProfileRepository {
  ProfileRepository(this._dio, this._ref);

  final Dio _dio;
  final Ref _ref;

  Future<ProfileData> load() async {
    try {
      final response = await _dio.get('/profile');
      final body = response.data is Map
          ? Map<String, dynamic>.from(response.data)
          : <String, dynamic>{};
      final nested = body['data'] is Map
          ? Map<String, dynamic>.from(body['data'])
          : <String, dynamic>{};
      final profile =
          Map<String, dynamic>.from(body['profile'] ?? nested['profile'] ?? {});
      final addressItems = body['addresses'] ?? nested['addresses'] ?? [];
      final addresses = (addressItems as List? ?? [])
          .map((item) =>
              CustomerAddress.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      if (profile.isNotEmpty) {
        await _ref
            .read(sessionControllerProvider.notifier)
            .saveUser(jsonEncode(profile));
      }
      return ProfileData(profile: profile, addresses: addresses);
    } catch (error) {
      final cached =
          await _ref.read(sessionControllerProvider.notifier).cachedUser();
      if (cached == null || cached.isEmpty) rethrow;
      final profile = Map<String, dynamic>.from(jsonDecode(cached) as Map);
      return ProfileData(profile: profile, addresses: const []);
    }
  }

  Future<List<CustomerAddress>> addresses() async {
    final response = await _dio.get('/profile/addresses');
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final items = body['addresses'] ?? body['data'] ?? [];
    return (items as List? ?? [])
        .map(
            (item) => CustomerAddress.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<CustomerAddress> saveAddress(CustomerAddress address) async {
    final payload = address.toPayload();
    final response = address.id > 0
        ? await _dio.patch('/profile/addresses/${address.id}', data: payload)
        : await _dio.post('/profile/addresses', data: payload);
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    return CustomerAddress.fromJson(
      Map<String, dynamic>.from(body['address'] ?? body['data'] ?? {}),
    );
  }

  Future<void> deleteAddress(int id) async {
    await _dio.delete('/profile/addresses/$id');
  }

  Future<void> setDefaultAddress(int id) async {
    await _dio.patch('/profile/addresses/$id/default');
  }

  Future<void> updateProfile(
      {required String fullName, required String phone}) async {
    await _dio.patch('/profile', data: {
      'full_name': fullName.trim(),
      'phone': phone.trim(),
    });
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    await _dio.post('/auth/change-password', data: {
      'current_password': currentPassword,
      'new_password': newPassword,
      'confirm_password': confirmPassword,
    });
  }
}

class ProfileData {
  const ProfileData({required this.profile, required this.addresses});

  final Map<String, dynamic> profile;
  final List<CustomerAddress> addresses;

  String get fullName => '${profile['full_name'] ?? ''}'.trim();
  String get email => '${profile['email'] ?? ''}'.trim();
  String get phone => '${profile['phone'] ?? ''}'.trim();
  String get role => normalizeAccountRole(
      profile['role'] ?? profile['user_role'] ?? profile['account_role']);
  bool get canShop => canUseCustomerApp(role);
  bool get isAdmin => canUseAdminTools(role);
  String get avatarUrl => AppConfig.resolveMediaUrl(
      '${profile['avatar_url'] ?? profile['avatarUrl'] ?? profile['avatar'] ?? profile['profile_image_url'] ?? profile['profileImageUrl'] ?? profile['profile_image'] ?? profile['photo_url'] ?? profile['photoUrl'] ?? profile['photo'] ?? profile['picture'] ?? profile['image_url'] ?? profile['imageUrl'] ?? ''}');
  String get firstName {
    final parts =
        fullName.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.isNotEmpty) return parts.first;
    final emailName = email.split('@').first.trim();
    return emailName.isEmpty ? 'there' : emailName;
  }

  String get initials {
    final source = fullName.isNotEmpty ? fullName : email;
    final letters = source
        .split(RegExp(r'[\s@._-]+'))
        .where((part) => part.isNotEmpty)
        .map((part) => part[0].toUpperCase())
        .take(2)
        .join();
    return letters.isEmpty ? 'FN' : letters;
  }
}
