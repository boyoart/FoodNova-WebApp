import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';

final authRepositoryProvider = Provider(AuthRepository.new);

class AuthRepository {
  AuthRepository(this.ref);
  final Ref ref;

  Dio get _dio => ref.read(dioProvider);

  Future<void> login({
    required String emailOrPhone,
    required String password,
    required bool remember,
  }) async {
    final credential = emailOrPhone.trim();
    final response = credential.contains('@')
        ? await _dio.post(
            '/auth/login',
            data: {'email': credential, 'password': password},
          )
        : await _dio.post(
            '/delivery/auth/login',
            data: {'phone_number': credential, 'password': password},
          );
    final data = response.data as Map;
    final token = '${data['access_token'] ?? data['token'] ?? ''}';
    final user = data['user'] is Map ? data['user'] as Map : {};
    final worker = data['worker'] is Map
        ? data['worker'] as Map
        : user['delivery_worker'] is Map
            ? user['delivery_worker'] as Map
            : {};
    final role =
        '${user['role'] ?? user['delivery_worker_type'] ?? worker['worker_type'] ?? ''}';
    if (role != 'rider' && role != 'messenger') {
      throw Exception('FoodNova Dispatch is only for approved riders.');
    }
    final approvalStatus =
        '${data['approval_status'] ?? worker['kyc_status'] ?? worker['approval_status'] ?? ''}'
            .toUpperCase();
    if (token.isEmpty) {
      throw Exception('FoodNova did not return a dispatch session token.');
    }
    debugPrint(
        'Login token present=${token.isNotEmpty} length=${token.length}');
    await ref
        .read(sessionControllerProvider.notifier)
        .save(token, remember: remember);
    Response<dynamic> profileResponse;
    try {
      profileResponse = await _dio.get('/delivery/me');
    } on DioException catch (error) {
      final exact = jsonEncode({
        'status': error.response?.statusCode,
        'data': error.response?.data,
        'message': error.message,
      });
      await ref
          .read(sessionControllerProvider.notifier)
          .recordLastApiResponse(exact);
      debugPrint('Profile fetch response $exact');
      debugPrint('RIDER_PROFILE_NOT_FOUND $exact');
      throw Exception(exact);
    }
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(profileResponse.data));
    debugPrint('Profile fetch response ${jsonEncode(profileResponse.data)}');
    final profileBody = profileResponse.data as Map;
    final profile = Map<String, dynamic>.from(
      profileBody['worker'] ?? profileBody['data'] ?? {},
    );
    if (profile.isEmpty || profile['id'] == null) {
      final exact = jsonEncode(profileResponse.data);
      await ref
          .read(sessionControllerProvider.notifier)
          .markProfileMissing(profileSource: 'backend');
      debugPrint('RIDER_PROFILE_NOT_FOUND $exact');
      throw Exception(exact);
    }
    final liveApprovalStatus =
        '${profile['kyc_status'] ?? profile['status'] ?? approvalStatus}'
            .toUpperCase();
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: '${profile['id'] ?? ''}',
          approvalStatus: liveApprovalStatus,
          onboardingCompleted: true,
          profileExists: true,
          profileSource: 'backend',
        );
    debugPrint('RIDER_LOGIN_SUCCESS ${profile['id']}');
    debugPrint('RIDER_APPROVAL_STATUS $liveApprovalStatus');
  }

  Future<void> forgotPassword(String email) async {
    await _dio.post('/forgot-password', data: {'email': email.trim()});
  }

  Future<NinVerificationResult> verifyNin({
    required String nin,
    required bool consent,
  }) async {
    final response = await _dio.post(
      '/delivery-workers/verify-nin',
      data: {'nin': nin.trim(), 'consent': consent},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    return NinVerificationResult(data);
  }

  Future<Map<String, dynamic>> signup({
    required Map<String, dynamic> fields,
    required String selfiePath,
    required String driverLicensePath,
  }) async {
    final formMap = <String, dynamic>{
      ...fields,
      'nin_consent': fields['nin_consent'] == true ? 'true' : 'false',
      'selfie': await MultipartFile.fromFile(selfiePath),
      'id_document': await MultipartFile.fromFile(driverLicensePath),
    };
    final form = FormData.fromMap(formMap);
    final response = await _dio.post('/delivery-workers/signup', data: form);
    final body = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(body));
    debugPrint('Registration response ${jsonEncode(body)}');
    final worker =
        Map<String, dynamic>.from(body['worker'] ?? body['data'] ?? {});
    debugPrint('Created rider ID ${worker['id'] ?? ''}');
    debugPrint(
        'Backend record created ${worker.isNotEmpty && worker['id'] != null}');
    if (worker.isNotEmpty) {
      await ref.read(sessionControllerProvider.notifier).saveRiderState(
            riderId: '${worker['id'] ?? ''}',
            approvalStatus: '${worker['kyc_status'] ?? 'KYC_PENDING'}',
            onboardingCompleted: true,
            profileExists: true,
            profileSource: 'backend',
          );
      debugPrint('RIDER_ONBOARDING_COMPLETE ${worker['id']}');
      debugPrint(
          'RIDER_APPROVAL_STATUS ${worker['kyc_status'] ?? 'KYC_PENDING'}');
    }
    return body;
  }

  Future<void> logout() async {
    try {
      await _dio.post('/delivery/auth/logout');
    } catch (_) {
      // Local session clearing still needs to happen when the token is stale.
    }
    await ref.read(sessionControllerProvider.notifier).clear();
  }
}

class NinVerificationResult {
  NinVerificationResult(this.raw);
  final Map<String, dynamic> raw;

  bool get verified => raw['verified'] == true || raw['success'] == true;
  String get message => '${raw['message'] ?? ''}'.trim();
  String get reportId => '${raw['report_id'] ?? ''}'.trim();
  String get ninLast4 => '${raw['nin_last4'] ?? ''}'.trim();

  Map<String, dynamic> get data =>
      Map<String, dynamic>.from((raw['data'] as Map?) ?? {});

  String get fullName {
    final first = '${data['first_name'] ?? ''}'.trim();
    final middle = '${data['middle_name'] ?? ''}'.trim();
    final last = '${data['last_name'] ?? data['surname'] ?? ''}'.trim();
    return [first, middle, last].where((part) => part.isNotEmpty).join(' ');
  }

  String get phone => '${data['phone'] ?? ''}'.trim();
  String get address => '${data['address'] ?? ''}'.trim();
  String get state =>
      '${data['state'] ?? data['residence_state'] ?? ''}'.trim();
  String get dateOfBirth =>
      '${data['date_of_birth'] ?? data['birthdate'] ?? data['dob'] ?? ''}'
          .trim();
  String get gender => '${data['gender'] ?? ''}'.trim();
}
