import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../services/notification_service.dart';
import '../../notifications/data/notifications_repository.dart';

final authRepositoryProvider = Provider(AuthRepository.new);

class AuthRepository {
  AuthRepository(this.ref);
  final Ref ref;
  static bool _pushRefreshListenerAttached = false;

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
      throw Exception(apiMessage(error));
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
      throw Exception(
        'FoodNova could not load your rider profile. Please contact support if this continues.',
      );
    }
    final liveApprovalStatus =
        '${profile['kyc_status'] ?? profile['status'] ?? approvalStatus}'
            .toUpperCase();
    final currentStep = int.tryParse(
          '${profile['current_step'] ?? profile['onboarding_current_step'] ?? 1}',
        ) ??
        1;
    final finalStep = int.tryParse(
          '${profile['onboarding_step_total'] ?? dispatchOnboardingTotalSteps}',
        ) ??
        dispatchOnboardingTotalSteps;
    final applicationSubmitted = liveApprovalStatus == 'PENDING_REVIEW' ||
        liveApprovalStatus == 'APPROVED' ||
        liveApprovalStatus == 'REJECTED';
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: '${profile['id'] ?? ''}',
          approvalStatus: liveApprovalStatus,
          onboardingCompleted: applicationSubmitted && currentStep >= finalStep,
          profileExists: true,
          profileSource: 'backend',
          currentStep: currentStep,
        );
    debugPrint('RIDER_LOGIN_SUCCESS ${profile['id']}');
    debugPrint('RIDER_APPROVAL_STATUS $liveApprovalStatus');
    await _registerPushToken();
  }

  Future<void> forgotPassword(String email) async {
    await _dio.post('/forgot-password', data: {'email': email.trim()});
  }

  Future<bool> emailExists(String email) async {
    final response = await _dio.post(
      '/delivery/auth/check-email',
      data: {'email': email.trim()},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    return data['exists'] == true;
  }

  Future<void> sendEmailOtp(String email) async {
    final response = await _dio.post(
      '/delivery/auth/send-otp',
      data: {'email': email.trim()},
    );
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(response.data));
  }

  Future<void> verifyEmailOtp({
    required String email,
    required String otp,
  }) async {
    final response = await _dio.post(
      '/delivery/auth/verify-otp',
      data: {'email': email.trim(), 'otp': otp.trim()},
    );
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(response.data));
  }

  Future<Map<String, dynamic>> registerWithVerifiedEmail({
    required String email,
    required String password,
    required String otp,
  }) async {
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/auth/register');
    final response = await _dio.post('/delivery/auth/register', data: {
      'email': email.trim(),
      'password': password,
      'otp': otp.trim(),
      'worker_type': 'rider',
    });
    final data = Map<String, dynamic>.from(response.data as Map);
    final token = '${data['access_token'] ?? data['token'] ?? ''}';
    if (token.isEmpty) {
      throw Exception('FoodNova did not return a dispatch session token.');
    }
    await ref.read(sessionControllerProvider.notifier).save(token);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    final worker = Map<String, dynamic>.from(data['worker'] ?? {});
    final progress = Map<String, dynamic>.from(
      data['onboarding_progress'] ?? data['data'] ?? {},
    );
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: '${worker['id'] ?? progress['rider_id'] ?? ''}',
          approvalStatus:
              '${data['approval_status'] ?? progress['approval_status'] ?? 'ONBOARDING'}',
          onboardingCompleted: false,
          profileExists: true,
          profileSource: 'backend',
          currentStep: int.tryParse('${progress['current_step'] ?? 3}') ?? 3,
        );
    await _registerPushToken();
    return data;
  }

  Future<Map<String, dynamic>> onboardingProgress() async {
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/onboarding/progress');
    final response = await _dio.get('/delivery/onboarding/progress');
    final data = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    final progress = Map<String, dynamic>.from(
      data['onboarding_progress'] ?? data['data'] ?? {},
    );
    _logOnboardingProgress('ONBOARDING_API_AFTER progress', progress);
    return progress;
  }

  Future<NinVerificationResult> verifyNin({
    required String nin,
    required bool consent,
  }) async {
    debugPrint('NIN_VERIFY_REQUEST nin_length=${nin.trim().length}');
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/verify-nin');
    final response = await _dio.post(
      '/delivery/verify-nin',
      data: {'nin': nin.trim(), 'consent': consent},
    );
    debugPrint('RAW HTTP RESPONSE ${response.data}');
    final data = Map<String, dynamic>.from(response.data as Map);
    debugPrint('DECODED JSON ${jsonEncode(data)}');
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    debugPrint('NIN_API_RESPONSE ${jsonEncode(data)}');
    debugPrint('NIN_FLUTTER_RESPONSE ${jsonEncode(data)}');
    debugPrint('NIN_PROVIDER_RAW_RESPONSE ${jsonEncode(data)}');
    debugPrint('NIN_PROVIDER_RESPONSE ${jsonEncode(data)}');
    debugPrint('NIN_RAW_RESPONSE ${jsonEncode(data)}');
    final parsed = NinVerificationResult(data);
    final parsedLog = {
      'verified': parsed.verified,
      'firstname': parsed.firstName,
      'middlename': parsed.middleName,
      'surname': parsed.surname,
      'full_name': parsed.fullName,
      'gender': parsed.gender,
      'birthdate': parsed.dateOfBirth,
      'telephoneno': parsed.phone,
      'nin': parsed.nin.isNotEmpty
          ? parsed.nin
          : parsed.ninLast4.isEmpty
              ? ''
              : '*******${parsed.ninLast4}',
    };
    debugPrint('NIN MODEL OBJECT ${jsonEncode(parsedLog)}');
    debugPrint('NIN_PROVIDER_PARSED_RESPONSE ${jsonEncode(parsedLog)}');
    debugPrint('NIN_NORMALIZED_DATA ${jsonEncode(parsedLog)}');
    debugPrint('NIN_PARSED_DATA ${jsonEncode(parsedLog)}');
    debugPrint('NIN_PARSED_RESPONSE ${jsonEncode(parsedLog)}');
    debugPrint('NIN_VERIFY_RESPONSE ${jsonEncode(data)}');
    _logOnboardingProgress(
      'ONBOARDING_API_AFTER verify_nin',
      Map<String, dynamic>.from(data['onboarding_progress'] ?? {}),
    );
    return parsed;
  }

  Future<Map<String, dynamic>> saveOnboardingProfile(
    Map<String, dynamic> payload,
  ) async {
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/profile');
    final response = await _dio.patch('/delivery/profile', data: payload);
    final data = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    final progress = Map<String, dynamic>.from(
      data['onboarding_progress'] ?? data['data'] ?? {},
    );
    _logOnboardingProgress('ONBOARDING_API_AFTER profile', progress);
    return progress;
  }

  Future<void> _persistOnboardingProgress(
    Map<String, dynamic> progress, {
    required String source,
  }) async {
    if (progress.isEmpty) return;
    final currentStep = int.tryParse('${progress['current_step'] ?? ''}') ?? 1;
    final riderId = '${progress['rider_id'] ?? ''}';
    if (riderId.trim().isEmpty) {
      await ref
          .read(sessionControllerProvider.notifier)
          .saveOnboardingStep(currentStep);
      debugPrint(
        'ONBOARDING_STEP_UPDATED source=$source current_step=$currentStep rider_id_missing=true',
      );
      return;
    }
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: riderId,
          approvalStatus: '${progress['approval_status'] ?? 'ONBOARDING'}',
          onboardingCompleted: progress['application_submitted'] == true,
          profileExists: true,
          profileSource: 'backend',
          currentStep: currentStep,
        );
    debugPrint(
      'ONBOARDING_STEP_UPDATED source=$source rider_id=$riderId current_step=$currentStep',
    );
  }

  Future<Map<String, dynamic>> uploadSelfie({required String path}) async {
    debugPrint('SELFIE_UPLOAD_START endpoint=/delivery/upload-selfie');
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/upload-selfie');
    final form = FormData.fromMap({
      'document': await MultipartFile.fromFile(path),
    });
    final response = await _dio.post('/delivery/upload-selfie', data: form);
    final data = Map<String, dynamic>.from(response.data as Map);
    debugPrint('SELFIE_UPLOAD_RESPONSE ${jsonEncode(data)}');
    if (data['success'] == false) {
      throw Exception(
          '${data['error'] ?? data['detail'] ?? 'Selfie upload failed.'}');
    }
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    final progress = Map<String, dynamic>.from(
      data['onboarding_progress'] ?? data['data'] ?? {},
    );
    _logOnboardingProgress('ONBOARDING_API_AFTER selfie', progress);
    await _persistOnboardingProgress(progress, source: 'selfie');
    return progress;
  }

  Future<Map<String, dynamic>> uploadGovernmentDocument({
    required String documentType,
    required String path,
  }) async {
    debugPrint(
      'DOCUMENT_UPLOAD_START endpoint=/delivery/upload-document document_type=$documentType',
    );
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/upload-document');
    final form = FormData.fromMap({
      'document_type': documentType,
      'document': await MultipartFile.fromFile(path),
    });
    final response = await _dio.post('/delivery/upload-document', data: form);
    final data = Map<String, dynamic>.from(response.data as Map);
    debugPrint('DOCUMENT_UPLOAD_RESPONSE ${jsonEncode(data)}');
    if (data['success'] == false) {
      throw Exception(
          '${data['error'] ?? data['detail'] ?? 'Government ID upload failed.'}');
    }
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    final progress = Map<String, dynamic>.from(
      data['onboarding_progress'] ?? data['data'] ?? {},
    );
    _logOnboardingProgress(
        'ONBOARDING_API_AFTER government_document', progress);
    await _persistOnboardingProgress(progress, source: 'government_document');
    return progress;
  }

  Future<Map<String, dynamic>> submitOnboardingApplication() async {
    debugPrint('ONBOARDING_API_BEFORE endpoint=/delivery/submit-onboarding');
    final response = await _dio.post(
      '/delivery/submit-onboarding',
      data: {'submit': true},
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(data));
    _logOnboardingProgress(
      'ONBOARDING_API_AFTER submit',
      Map<String, dynamic>.from(
          data['onboarding_progress'] ?? data['data'] ?? {}),
    );
    return data;
  }

  Future<void> logout() async {
    try {
      await _dio.post('/delivery/auth/logout');
    } catch (_) {
      // Local session clearing still needs to happen when the token is stale.
    }
    await ref.read(sessionControllerProvider.notifier).logoutAndReset();
  }

  Future<void> _registerPushToken() async {
    final token = await DispatchNotificationService.currentToken();
    if (token != null && token.trim().isNotEmpty) {
      await ref.read(notificationsRepositoryProvider).registerFcmToken(token);
    }
    if (!_pushRefreshListenerAttached) {
      _pushRefreshListenerAttached = true;
      DispatchNotificationService.tokenRefreshStream.listen((nextToken) {
        ref
            .read(notificationsRepositoryProvider)
            .registerFcmToken(nextToken)
            .catchError((error) {
          debugPrint('DISPATCH_FCM_TOKEN_REFRESH_FAILED $error');
        });
      });
    }
  }
}

void _logOnboardingProgress(String label, Map<String, dynamic> progress) {
  if (progress.isEmpty) {
    debugPrint('$label empty=true');
    return;
  }
  final identity = progress['nin_data'] is Map
      ? Map<String, dynamic>.from(progress['nin_data'] as Map)
      : <String, dynamic>{};
  debugPrint('$label ${jsonEncode({
        'rider_id': progress['rider_id'],
        'status': progress['approval_status'],
        'current_step': progress['current_step'],
        'progress_percent': progress['progress_percent'],
        'application_submitted': progress['application_submitted'],
        'nin_verified': progress['nin_verified'],
        'full_name': identity['full_name'],
        'dob': identity['date_of_birth'] ?? identity['birthdate'],
        'phone': identity['phone'] ?? progress['phone'],
        'gender': identity['gender'],
      })}');
}

class VerifiedIdentity {
  const VerifiedIdentity({
    required this.fullName,
    required this.firstName,
    required this.middleName,
    required this.lastName,
    required this.phone,
    required this.gender,
    required this.dateOfBirth,
    required this.nin,
    required this.photo,
    required this.address,
  });

  factory VerifiedIdentity.fromRaw(Map<String, dynamic> raw) {
    final source = _bestIdentityMap(raw);
    final firstName = _readIdentityString(source, const [
      'first_name',
      'firstname',
      'firstName',
      'given_name',
      'givenName',
    ]);
    final middleName = _readIdentityString(source, const [
      'middle_name',
      'middlename',
      'middleName',
      'other_name',
      'otherName',
    ]);
    final lastName = _readIdentityString(source, const [
      'surname',
      'last_name',
      'lastname',
      'lastName',
      'family_name',
      'familyName',
    ]);
    final directFullName = _readIdentityString(source, const [
      'full_name',
      'fullname',
      'fullName',
      'name',
      'display_name',
      'displayName',
    ]);
    final gender = _readIdentityString(source, const ['gender', 'sex']);
    return VerifiedIdentity(
      fullName: directFullName.isNotEmpty
          ? directFullName
          : [firstName, middleName, lastName]
              .where((part) => part.isNotEmpty)
              .join(' '),
      firstName: firstName,
      middleName: middleName,
      lastName: lastName,
      phone: _readIdentityString(source, const [
        'phone',
        'phone_number',
        'phoneNumber',
        'telephoneno',
        'telephone_no',
        'telephoneNo',
        'mobile',
        'mobile_number',
      ]),
      gender: gender.toUpperCase() == 'M'
          ? 'Male'
          : gender.toUpperCase() == 'F'
              ? 'Female'
              : gender,
      dateOfBirth: _readIdentityString(source, const [
        'date_of_birth',
        'dateOfBirth',
        'birthdate',
        'birth_date',
        'birthDate',
        'dob',
      ]),
      nin: _readIdentityString(
          source, const ['nin', 'nin_number', 'ninNumber', 'number']),
      photo: _readIdentityString(
          source, const ['photo', 'photograph', 'image', 'portrait']),
      address: _readIdentityString(source, const [
        'address',
        'residence_address',
        'residential_address',
        'residenceAddress',
        'home_address',
      ]),
    );
  }

  final String fullName;
  final String firstName;
  final String middleName;
  final String lastName;
  final String phone;
  final String gender;
  final String dateOfBirth;
  final String nin;
  final String photo;
  final String address;

  bool get hasData => [
        fullName,
        firstName,
        middleName,
        lastName,
        phone,
        gender,
        dateOfBirth,
        nin,
        photo,
        address,
      ].any((value) => value.trim().isNotEmpty);

  Map<String, dynamic> toJson() => {
        'full_name': fullName,
        'first_name': firstName,
        'middle_name': middleName,
        'last_name': lastName,
        'surname': lastName,
        'phone': phone,
        'phone_number': phone,
        'telephoneno': phone,
        'gender': gender,
        'date_of_birth': dateOfBirth,
        'birthdate': dateOfBirth,
        'nin': nin,
        'photo': photo,
        'address': address,
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
  VerifiedIdentity get identity => VerifiedIdentity.fromRaw(raw);

  Map<String, dynamic> get data => _bestIdentityMap(raw);
  String get firstName => identity.firstName;
  String get middleName => identity.middleName;
  String get surname => identity.lastName;
  String get fullName => identity.fullName;
  String get phone => identity.phone;
  String get address => identity.address;
  String get state => _readIdentityString(
      data, const ['state', 'residence_state', 'residenceState']);
  String get dateOfBirth => identity.dateOfBirth;
  String get gender => identity.gender;
  String get nin => identity.nin;
  String get verificationToken => _readString(raw, const [
        'nin_verification_token',
        'verification_token',
        'verificationToken',
      ]);
  Map<String, dynamic> get identityPayload => {
        ...identity.toJson(),
        'state': state,
      };
  Map<String, dynamic> get applicationPayload => {
        'nin_verified_firstname': firstName,
        'nin_verified_middlename': middleName,
        'nin_verified_surname': surname,
        'nin_verified_full_name': fullName,
        'nin_verified_birthdate': dateOfBirth,
        'nin_verified_gender': gender,
        'nin_verified_phone': phone,
        'nin_verification_token': verificationToken,
        'nin_report_id': reportId,
        'nin_last4': ninLast4,
        'nin_verified': verified,
        'nin_identity_payload': jsonEncode(identityPayload),
      };
}

Map<String, dynamic> _bestIdentityMap(Map<String, dynamic> raw) {
  final candidates = <Map<String, dynamic>>[];
  void collect(dynamic value) {
    if (value is Map) {
      final map = Map<String, dynamic>.from(value);
      candidates.add(map);
      for (final nested in map.values) {
        collect(nested);
      }
    } else if (value is List) {
      for (final item in value) {
        collect(item);
      }
    } else if (value is String && value.trim().startsWith(RegExp(r'[\{\[]'))) {
      try {
        collect(jsonDecode(value));
      } catch (_) {
        // Provider response was not JSON.
      }
    }
  }

  collect(raw);
  final identityKeys = {
    'firstname',
    'givenname',
    'surname',
    'lastname',
    'middlename',
    'fullname',
    'birthdate',
    'dateofbirth',
    'dob',
    'telephoneno',
    'telephone',
    'phonenumber',
    'mobile',
    'gender',
    'sex',
    'address',
  };
  for (final candidate in candidates) {
    final keys = candidate.keys.map(_identityKey).toSet();
    if (keys.intersection(identityKeys).isNotEmpty) return candidate;
  }
  return candidates.isEmpty ? raw : candidates.first;
}

String _identityKey(Object? value) {
  return '$value'.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
}

String _readIdentityString(Map<String, dynamic> source, List<String> keys) {
  final compact = <String, dynamic>{
    for (final entry in source.entries) _identityKey(entry.key): entry.value,
  };
  for (final key in keys) {
    final value = compact[_identityKey(key)];
    if (value != null && '$value'.trim().isNotEmpty) {
      return '$value'.trim();
    }
  }
  return '';
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
