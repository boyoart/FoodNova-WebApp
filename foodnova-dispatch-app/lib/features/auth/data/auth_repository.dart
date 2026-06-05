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
          currentStep: int.tryParse(
                  '${profile['current_step'] ?? profile['onboarding_current_step'] ?? 5}') ??
              5,
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
    debugPrint('NIN_VERIFY_REQUEST nin_length=${nin.trim().length}');
    final response = await _dio.post(
      '/delivery-workers/verify-nin',
      data: {'nin': nin.trim(), 'consent': consent},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    debugPrint('NIN_RAW_RESPONSE ${jsonEncode(data)}');
    final parsed = NinVerificationResult(data);
    debugPrint('NIN_PARSED_RESPONSE ${jsonEncode({
          'verified': parsed.verified,
          'first_name': parsed.firstName,
          'surname': parsed.surname,
          'gender': parsed.gender,
          'birthdate': parsed.dateOfBirth,
          'telephoneno': parsed.phone,
          'nin': parsed.nin.isNotEmpty
              ? parsed.nin
              : parsed.ninLast4.isEmpty
                  ? ''
                  : '*******${parsed.ninLast4}',
        })}');
    debugPrint('NIN_VERIFY_RESPONSE ${jsonEncode(data)}');
    return parsed;
  }

  Future<Map<String, dynamic>> signup({
    required Map<String, dynamic> fields,
    required String selfiePath,
    required String driverLicensePath,
  }) async {
    debugPrint('SUBMIT_APPLICATION_START');
    debugPrint('ONBOARDING_SUBMIT_START');
    debugPrint(
        'LICENSE_UPLOAD_START path_present=${driverLicensePath.isNotEmpty}');
    debugPrint('SELFIE_UPLOAD_START path_present=${selfiePath.isNotEmpty}');
    final formMap = <String, dynamic>{
      ...fields,
      'nin_consent': fields['nin_consent'] == true ? 'true' : 'false',
      'selfie': await MultipartFile.fromFile(selfiePath),
      'id_document': await MultipartFile.fromFile(driverLicensePath),
    };
    debugPrint('LICENSE_UPLOAD_SUCCESS multipart_prepared=true');
    debugPrint('SELFIE_UPLOAD_SUCCESS multipart_prepared=true');
    debugPrint('RIDER_CREATE_START endpoint=/delivery-workers/signup');
    final form = FormData.fromMap(formMap);
    Response<dynamic> response;
    try {
      debugPrint(
          'ONBOARDING_API_REQUEST fields=${jsonEncode(_safeSignupLog(fields))}');
      response = await _dio.post('/delivery-workers/signup', data: form);
    } catch (error) {
      debugPrint('ONBOARDING_API_RESPONSE error=$error');
      debugPrint('RIDER_CREATE_FAILURE $error');
      rethrow;
    }
    final body = Map<String, dynamic>.from(response.data as Map);
    debugPrint('ONBOARDING_API_RESPONSE ${jsonEncode(body)}');
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(body));
    debugPrint('Registration response ${jsonEncode(body)}');
    final worker =
        Map<String, dynamic>.from(body['worker'] ?? body['data'] ?? {});
    debugPrint('Created rider ID ${worker['id'] ?? ''}');
    debugPrint(
        'Backend record created ${worker.isNotEmpty && worker['id'] != null}');
    debugPrint('RIDER_CREATE_SUCCESS worker_id=${worker['id'] ?? ''}');
    if (worker.isNotEmpty) {
      debugPrint('RIDER_STATUS_UPDATE_START');
      debugPrint('PENDING_REVIEW_SAVE_START');
      await ref.read(sessionControllerProvider.notifier).saveRiderState(
            riderId: '${worker['id'] ?? ''}',
            approvalStatus: '${worker['kyc_status'] ?? 'PENDING_REVIEW'}',
            onboardingCompleted: true,
            profileExists: true,
            profileSource: 'backend',
            currentStep: int.tryParse(
                    '${worker['current_step'] ?? worker['onboarding_current_step'] ?? 5}') ??
                5,
          );
      debugPrint(
          'RIDER_STATUS_UPDATE_SUCCESS status=${worker['kyc_status'] ?? 'PENDING_REVIEW'}');
      debugPrint(
          'PENDING_REVIEW_SAVE_SUCCESS status=${worker['kyc_status'] ?? 'PENDING_REVIEW'} rider_id=${worker['id'] ?? ''}');
      debugPrint('RIDER_ONBOARDING_COMPLETE ${worker['id']}');
      debugPrint(
          'RIDER_APPROVAL_STATUS ${worker['kyc_status'] ?? 'PENDING_REVIEW'}');
    } else {
      debugPrint('RIDER_STATUS_UPDATE_FAILURE worker_missing=true');
      debugPrint('PENDING_REVIEW_SAVE_FAILURE worker_missing=true');
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

Map<String, dynamic> _safeSignupLog(Map<String, dynamic> fields) {
  return {
    'field_keys': fields.keys.toList(),
    'email_present': '${fields['email'] ?? ''}'.trim().isNotEmpty,
    'phone_present': '${fields['phone'] ?? ''}'.trim().isNotEmpty,
    'worker_type': fields['worker_type'],
    'rider_type': fields['rider_type'],
    'nin_last4': '${fields['nin_number'] ?? ''}'
                .replaceAll(RegExp(r'\D'), '')
                .length >=
            4
        ? '${fields['nin_number']}'.replaceAll(RegExp(r'\D'), '').substring(
            '${fields['nin_number']}'.replaceAll(RegExp(r'\D'), '').length - 4)
        : '',
    'has_confirm_password': fields.containsKey('confirm_password'),
    'has_emergency_contact_name': fields.containsKey('emergency_contact_name'),
    'has_emergency_contact_phone':
        fields.containsKey('emergency_contact_phone'),
  };
}

class NinVerificationResult {
  NinVerificationResult(this.raw);
  final Map<String, dynamic> raw;

  bool get verified => raw['verified'] == true || raw['success'] == true;
  String get message => '${raw['message'] ?? ''}'.trim();
  String get reportId =>
      _readString(raw, const ['report_id', 'reportId', 'reportID']);
  String get ninLast4 => _readString(raw, const ['nin_last4', 'ninLast4']);

  Map<String, dynamic> get data {
    final nested = raw['data'];
    if (nested is Map) return Map<String, dynamic>.from(nested);
    return raw;
  }

  String get firstName => _readString(data, const [
        'first_name',
        'firstname',
        'firstName',
        'FirstName',
        'First Name',
      ]);
  String get middleName => _readString(data, const [
        'middle_name',
        'middlename',
        'middleName',
        'MiddleName',
        'Middle Name',
      ]);
  String get surname => _readString(data, const [
        'surname',
        'last_name',
        'lastname',
        'lastName',
        'LastName',
        'Last Name',
      ]);
  String get fullName {
    final direct = _readString(data, const [
      'full_name',
      'fullname',
      'fullName',
      'FullName',
      'Full Name',
      'name',
    ]);
    if (direct.isNotEmpty) return direct;
    return [firstName, middleName, surname]
        .where((part) => part.isNotEmpty)
        .join(' ');
  }

  String get phone => _readString(data, const [
        'phone',
        'phone_number',
        'phoneNumber',
        'telephoneno',
        'telephoneNo',
      ]);
  String get address => _readString(data, const [
        'address',
        'residence_address',
        'residential_address',
        'residenceAddress',
      ]);
  String get state => _readString(data, const [
        'state',
        'residence_state',
        'residenceState',
      ]);
  String get dateOfBirth => _readString(data, const [
        'date_of_birth',
        'dateOfBirth',
        'DateOfBirth',
        'Date Of Birth',
        'birthdate',
        'birthDate',
        'dob',
        'DOB',
      ]);
  String get gender => _readString(data, const ['gender', 'Gender', 'sex']);
  String get nin => _readString(data, const ['nin', 'NIN', 'number']);
}

String _readString(Map<String, dynamic> source, List<String> keys) {
  for (final key in keys) {
    final value = source[key];
    if (value != null && '$value'.trim().isNotEmpty) {
      return '$value'.trim();
    }
  }
  return '';
}
