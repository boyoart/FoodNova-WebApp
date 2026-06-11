import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../data/auth_repository.dart';
import '../data/onboarding_file_recovery_service.dart';

const _totalSteps = 7;

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen>
    with WidgetsBindingObserver {
  final formKey = GlobalKey<FormState>();
  final picker = ImagePicker();
  final fileRecovery = OnboardingFileRecoveryService();
  final fields = <String, TextEditingController>{
    'email': TextEditingController(),
    'phone': TextEditingController(),
    'password': TextEditingController(),
    'confirm_password': TextEditingController(),
    'nin_number': TextEditingController(),
    'first_name': TextEditingController(),
    'last_name': TextEditingController(),
    'residential_address': TextEditingController(),
    'state': TextEditingController(),
    'lga': TextEditingController(),
    'emergency_contact_name': TextEditingController(),
    'emergency_contact_phone': TextEditingController(),
    'emergency_contact_relationship': TextEditingController(),
    'vehicle_type': TextEditingController(text: 'Motorcycle'),
    'plate_number': TextEditingController(),
  };

  String riderType = 'motorcycle';
  bool ninConsent = false;
  bool verifyingNin = false;
  bool loading = false;
  bool restoringDraft = true;
  bool authenticatedRider = false;
  int currentStep = 1;
  String message = '';
  String verificationMessage = '';
  NinVerificationResult? verifiedNin;
  XFile? selfie;
  PlatformFile? driverLicense;
  PlatformFile? proofOfAddress;
  String selfieUrl = '';
  String driverLicenseUrl = '';
  String proofOfAddressUrl = '';
  final trainingDone = <String, bool>{
    'Accepting Orders': false,
    'Food Handling': false,
    'Customer Conduct': false,
    'Safety Rules': false,
    'Delivery Standards': false,
  };

  bool get requiresVehicleDetails => riderType == 'motorcycle';
  bool get _accountComplete =>
      authenticatedRider ||
      fields['email']!.text.contains('@') &&
          fields['phone']!.text.replaceAll(RegExp(r'\D'), '').length >= 10 &&
          fields['password']!.text.length >= 8;
  bool get _addressComplete =>
      fields['residential_address']!.text.trim().isNotEmpty &&
      fields['state']!.text.trim().isNotEmpty &&
      fields['lga']!.text.trim().isNotEmpty &&
      fields['emergency_contact_name']!.text.trim().isNotEmpty &&
      fields['emergency_contact_phone']!
              .text
              .replaceAll(RegExp(r'\D'), '')
              .length >=
          10 &&
      fields['emergency_contact_relationship']!.text.trim().isNotEmpty;
  bool get _riderProfileComplete =>
      riderType == 'bicycle' ||
      riderType == 'walker' ||
      (fields['vehicle_type']!.text.trim().isNotEmpty &&
          fields['plate_number']!.text.trim().isNotEmpty);
  bool get _documentsComplete =>
      (selfie != null || selfieUrl.isNotEmpty) &&
      (driverLicense != null || driverLicenseUrl.isNotEmpty) &&
      (proofOfAddress != null || proofOfAddressUrl.isNotEmpty);
  bool get _trainingComplete => trainingDone.values.every((done) => done);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _restoreStep().then((_) => _recoverLostPickerData());
    for (final controller in fields.values) {
      controller.addListener(_scheduleDraftSave);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final controller in fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _saveDraft();
    }
    if (state == AppLifecycleState.resumed) {
      _recoverLostPickerData();
    }
  }

  void _scheduleDraftSave() {
    if (restoringDraft) return;
    _saveDraft();
    if (mounted) setState(() {});
  }

  Future<void> _restoreStep() async {
    final session = ref.read(sessionControllerProvider.notifier);
    final savedStep = await session.currentOnboardingStep();
    final token = await session.token();
    if (token != null && token.isNotEmpty) {
      authenticatedRider = true;
      try {
        final progress =
            await ref.read(authRepositoryProvider).onboardingProgress();
        _applyBackendProgress(progress);
      } catch (error) {
        debugPrint('ONBOARDING_PROGRESS_RESTORE_FAILED error=$error');
      }
    }
    final draft = await session.onboardingDraft();
    if (!mounted) return;
    if (draft.trim().isNotEmpty) {
      try {
        final data = Map<String, dynamic>.from(jsonDecode(draft) as Map);
        final values = data['fields'];
        if (values is Map) {
          for (final entry in values.entries) {
            fields['${entry.key}']?.text = '${entry.value}';
          }
        }
        riderType = '${data['rider_type'] ?? riderType}';
        ninConsent = data['nin_consent'] == true;
        final nin = data['verified_nin'];
        if (nin is Map) {
          verifiedNin = NinVerificationResult(Map<String, dynamic>.from(nin));
        }
        final identity = data['verified_identity'];
        if (identity is Map) {
          final restoredRaw = {
            if (verifiedNin != null) ...verifiedNin!.raw,
            'verified': verifiedNin?.verified ?? true,
            'report_id': verifiedNin?.reportId ?? data['nin_report_id'] ?? '',
            'nin_last4': verifiedNin?.ninLast4 ?? data['nin_last4'] ?? '',
            'data': Map<String, dynamic>.from(identity),
          };
          verifiedNin = NinVerificationResult(restoredRaw);
        }
        selfie = _restoreXFile(data['selfie']);
        driverLicense = _restorePlatformFile(data['driver_license']);
        proofOfAddress = _restorePlatformFile(data['proof_of_address']);
        selfieUrl = '${data['selfie_url'] ?? selfieUrl}'.trim();
        driverLicenseUrl =
            '${data['driver_license_url'] ?? driverLicenseUrl}'.trim();
        proofOfAddressUrl =
            '${data['proof_of_address_url'] ?? proofOfAddressUrl}'.trim();
        final savedTraining = data['training_done'];
        if (savedTraining is Map) {
          for (final key in trainingDone.keys) {
            trainingDone[key] = savedTraining[key] == true;
          }
        }
        debugPrint(
            'ONBOARDING_STATE_REBUILD ${jsonEncode(_onboardingDebugState())}');
      } catch (_) {
        debugPrint('ONBOARDING_STATE_RESET reason=corrupt_draft');
      }
    }
    if (verifiedNin == null) {
      final storedIdentity = await session.verifiedIdentity();
      if (storedIdentity.trim().isNotEmpty) {
        try {
          final decoded = jsonDecode(storedIdentity);
          if (decoded is Map) {
            verifiedNin = NinVerificationResult({
              'verified': true,
              'data': Map<String, dynamic>.from(decoded),
            });
            debugPrint('RESTORED_IDENTITY_MODEL $storedIdentity');
          }
        } catch (_) {
          debugPrint('RESTORED_IDENTITY_MODEL invalid_json=true');
        }
      }
    }
    restoringDraft = false;
    final restoredStep = currentStep > 1 ? currentStep : savedStep;
    setState(() => currentStep = restoredStep.clamp(1, _totalSteps).toInt());
    await _saveDraft();
  }

  void _applyBackendProgress(Map<String, dynamic> progress) {
    if (progress.isEmpty) return;
    final profile = Map<String, dynamic>.from(progress['profile_data'] ?? {});
    final ninData = Map<String, dynamic>.from(progress['nin_data'] ?? {});
    final documents = Map<String, dynamic>.from(progress['documents'] ?? {});
    _setFieldIfPresent('email', progress['email']);
    _setFieldIfPresent('phone', progress['phone']);
    _setFieldIfPresent('first_name', ninData['first_name']);
    _setFieldIfPresent('last_name', ninData['surname'] ?? ninData['last_name']);
    _setFieldIfPresent(
      'residential_address',
      profile['address'] ?? ninData['address'],
    );
    _setFieldIfPresent(
        'emergency_contact_name', profile['emergency_contact_name']);
    _setFieldIfPresent(
        'emergency_contact_phone', profile['emergency_contact_phone']);
    _setFieldIfPresent('emergency_contact_relationship',
        profile['emergency_contact_relationship']);
    _setFieldIfPresent('vehicle_type', profile['vehicle_type']);
    _setFieldIfPresent('plate_number', profile['plate_number']);
    riderType = '${profile['rider_type'] ?? riderType}'.trim().isEmpty
        ? riderType
        : '${profile['rider_type']}';
    if (progress['nin_verified'] == true) {
      verifiedNin = NinVerificationResult({
        'verified': true,
        'report_id': progress['nin_report_id'] ?? ninData['report_id'] ?? '',
        'nin_last4': ninData['nin_last4'] ?? '',
        'data': ninData,
      });
    }
    selfieUrl = _documentUrl(documents, 'selfie');
    driverLicenseUrl = _documentUrl(documents, 'driver_license');
    proofOfAddressUrl = _documentUrl(documents, 'proof_of_address').isNotEmpty
        ? _documentUrl(documents, 'proof_of_address')
        : _documentUrl(documents, 'address_proof');
    if (progress['training_completed'] == true) {
      for (final key in trainingDone.keys) {
        trainingDone[key] = true;
      }
    }
    final backendStep = int.tryParse('${progress['current_step'] ?? ''}');
    if (backendStep != null) {
      final hasServerAccount = progress['rider_id'] != null;
      final minimumStep = hasServerAccount ? 2 : 1;
      currentStep = backendStep.clamp(minimumStep, _totalSteps);
    }
    debugPrint('RESTORED_IDENTITY_MODEL ${jsonEncode(ninData)}');
    debugPrint('ONBOARDING_UI_MODEL ${jsonEncode(_onboardingDebugState())}');
  }

  void _setFieldIfPresent(String key, dynamic value) {
    final text = '$value'.trim();
    if (text.isNotEmpty && text != 'null') {
      fields[key]?.text = text;
    }
  }

  String _documentUrl(Map<String, dynamic> documents, String key) {
    final value = documents[key];
    if (value is Map) return '${value['url'] ?? ''}'.trim();
    return '';
  }

  XFile? _restoreXFile(dynamic value) {
    if (value is! Map) return null;
    final path = '${value['path'] ?? ''}'.trim();
    if (path.isEmpty || !File(path).existsSync()) return null;
    return XFile(path, name: '${value['name'] ?? 'selfie'}');
  }

  PlatformFile? _restorePlatformFile(dynamic value) {
    if (value is! Map) return null;
    final path = '${value['path'] ?? ''}'.trim();
    if (path.isEmpty || !File(path).existsSync()) return null;
    return PlatformFile(
      name: '${value['name'] ?? 'document'}',
      path: path,
      size: int.tryParse('${value['size'] ?? 0}') ?? File(path).lengthSync(),
    );
  }

  Future<void> _saveDraft() async {
    final previousDraft = await _readExistingDraftMap();
    final previousSelfie = previousDraft['selfie'];
    final previousLicense = previousDraft['driver_license'];
    final previousAddress = previousDraft['proof_of_address'];
    final previousNin = previousDraft['verified_nin'];
    final previousIdentity = previousDraft['verified_identity'];
    final identity = verifiedNin?.identity;
    final draft = {
      'current_step': currentStep,
      'rider_type': riderType,
      'nin_consent': ninConsent,
      'fields': {
        for (final entry in fields.entries) entry.key: entry.value.text
      },
      'training_done': trainingDone,
      if (verifiedNin != null) 'verified_nin': verifiedNin!.raw,
      if (verifiedNin == null && previousNin is Map)
        'verified_nin': previousNin,
      if (identity != null) 'verified_identity': identity.toJson(),
      if (identity == null && previousIdentity is Map)
        'verified_identity': previousIdentity,
      if (verifiedNin != null) 'nin_report_id': verifiedNin!.reportId,
      if (verifiedNin != null) 'nin_last4': verifiedNin!.ninLast4,
      if (selfieUrl.isNotEmpty) 'selfie_url': selfieUrl,
      if (driverLicenseUrl.isNotEmpty) 'driver_license_url': driverLicenseUrl,
      if (proofOfAddressUrl.isNotEmpty)
        'proof_of_address_url': proofOfAddressUrl,
      if (selfie != null)
        'selfie': {'path': selfie!.path, 'name': selfie!.name}
      else if (previousSelfie is Map)
        'selfie': previousSelfie,
      if (driverLicense != null)
        'driver_license': {
          'path': driverLicense!.path,
          'name': driverLicense!.name,
          'size': driverLicense!.size,
        }
      else if (previousLicense is Map)
        'driver_license': previousLicense,
      if (proofOfAddress != null)
        'proof_of_address': {
          'path': proofOfAddress!.path,
          'name': proofOfAddress!.name,
          'size': proofOfAddress!.size,
        }
      else if (previousAddress is Map)
        'proof_of_address': previousAddress,
    };
    final session = ref.read(sessionControllerProvider.notifier);
    await session.saveOnboardingStep(currentStep);
    await session.saveOnboardingDraft(jsonEncode(draft));
    if (identity != null) {
      await session.saveVerifiedIdentity(jsonEncode(identity.toJson()));
    }
  }

  Future<Map<String, dynamic>> _readExistingDraftMap() async {
    final draft =
        await ref.read(sessionControllerProvider.notifier).onboardingDraft();
    if (draft.trim().isEmpty) return {};
    try {
      final decoded = jsonDecode(draft);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : {};
    } catch (_) {
      return {};
    }
  }

  Future<void> _goToStep(int step) async {
    final next = step.clamp(1, _totalSteps).toInt();
    setState(() {
      currentStep = next;
      message = '';
    });
    await _saveDraft();
  }

  bool get _canContinueCurrentStep => switch (currentStep) {
        1 => _accountComplete,
        2 => verifiedNin?.verified == true,
        3 => _addressComplete,
        4 => _riderProfileComplete,
        5 => _documentsComplete,
        6 => _trainingComplete,
        _ => !loading,
      };

  String get _stepTitle => const [
        'Account Creation',
        'NIN Verification',
        'Address & Emergency Contact',
        'Rider Profile',
        'Documents',
        'FoodNova Training',
        'Review & Submit',
      ][currentStep - 1];

  String get _completionStatus {
    if (_canContinueCurrentStep) return 'Complete';
    if (currentStep == 2 && verifyingNin) return 'Verifying';
    return 'In progress';
  }

  int get _progressPercent =>
      ((currentStep / _totalSteps) * 100).round().clamp(0, 100);

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleSystemBack();
      },
      child: Scaffold(
        backgroundColor: FoodNovaColors.bg,
        body: SafeArea(
          child: Form(
            key: formKey,
            child: Column(
              children: [
                _Header(
                  currentStep: currentStep,
                  title: _stepTitle,
                  status: _completionStatus,
                  percent: _progressPercent,
                ),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 280),
                    transitionBuilder: (child, animation) {
                      final offset = Tween<Offset>(
                        begin: const Offset(0.08, 0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                          parent: animation, curve: Curves.easeOutCubic));
                      return FadeTransition(
                        opacity: animation,
                        child: SlideTransition(position: offset, child: child),
                      );
                    },
                    child: SingleChildScrollView(
                      key: ValueKey(currentStep),
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                      child: _PremiumCard(child: _currentStepPage()),
                    ),
                  ),
                ),
                if (message.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                    child: Text(
                      message,
                      style: TextStyle(
                        color: message.toLowerCase().contains('submitted')
                            ? FoodNovaColors.success
                            : FoodNovaColors.danger,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                _Controls(
                  step: currentStep,
                  loading: loading,
                  canContinue: _canContinueCurrentStep,
                  onBack: currentStep == 1
                      ? null
                      : () => _goToStep(currentStep - 1),
                  onNext: currentStep == _totalSteps ? _submit : _nextStep,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _handleSystemBack() async {
    if (loading || verifyingNin) return;
    if (currentStep > 1) {
      await _goToStep(currentStep - 1);
      return;
    }
    final token = await ref.read(sessionControllerProvider.notifier).token();
    if (!mounted) return;
    context.go(token == null || token.isEmpty ? '/login' : '/dashboard');
  }

  Widget _currentStepPage() => switch (currentStep) {
        1 => _accountStep(),
        2 => _ninStep(),
        3 => _addressStep(),
        4 => _riderProfileStep(),
        5 => _documentsStep(),
        6 => _trainingStep(),
        _ => _reviewStep(),
      };

  Widget _accountStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.person_add_alt_1,
          title: 'Create your dispatch account',
          body:
              'Use the phone and email you want FoodNova operations to contact.',
        ),
        _field('email',
            keyboardType: TextInputType.emailAddress, icon: Icons.mail_outline),
        _field('phone',
            keyboardType: TextInputType.phone, icon: Icons.phone_outlined),
        _field('password', obscure: true, icon: Icons.lock_outline),
        _PasswordStrength(password: fields['password']!.text),
      ],
    );
  }

  Widget _ninStep() {
    final verified = verifiedNin?.verified == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.verified_user_outlined,
          title: 'Verify your identity',
          body:
              'FoodNova checks your NIN before your application reaches admin review.',
          hero: true,
        ),
        _field(
          'nin_number',
          keyboardType: TextInputType.number,
          maxLength: 11,
          readOnly: verified,
          icon: Icons.shield_outlined,
          onChanged: (_) {
            if (verifiedNin != null) {
              setState(() {
                verifiedNin = null;
                verificationMessage = '';
              });
              _saveDraft();
            }
          },
        ),
        _ConsentTile(
          value: ninConsent,
          locked: verified,
          onChanged: (value) {
            setState(() => ninConsent = value);
            _saveDraft();
          },
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: verifyingNin || verified ? null : _verifyNin,
          icon: verifyingNin
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.security),
          label: Text(verifyingNin
              ? 'Verifying identity'
              : verified
                  ? 'Identity Verified'
                  : 'Verify NIN'),
        ),
        if (verified)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: _VerifiedIdentityCard(result: verifiedNin!),
          )
        else if (verificationMessage.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _StatusPill(
                text: verificationMessage, color: FoodNovaColors.danger),
          ),
      ],
    );
  }

  Widget _addressStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.home_work_outlined,
          title: 'Where can operations reach you?',
          body:
              'Complete your address and emergency contact for rider safety review.',
        ),
        _field('residential_address', icon: Icons.location_on_outlined),
        _field('state', icon: Icons.map_outlined),
        _field('lga', icon: Icons.place_outlined),
        _field('emergency_contact_name',
            icon: Icons.contact_emergency_outlined),
        _field('emergency_contact_phone',
            keyboardType: TextInputType.phone,
            icon: Icons.phone_in_talk_outlined),
        _field('emergency_contact_relationship',
            icon: Icons.people_alt_outlined),
        if (_addressComplete)
          const _CompletionBadge(
              text: 'Address and emergency contact completed'),
      ],
    );
  }

  Widget _riderProfileStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.delivery_dining,
          title: 'Choose how you deliver',
          body:
              'FoodNova only asks for the fields relevant to your delivery mode.',
        ),
        _ChoiceCard(
          selected: riderType == 'motorcycle',
          icon: Icons.two_wheeler,
          title: 'Motorcycle Rider',
          body: 'Fast dispatch with plate and motorcycle details.',
          onTap: () => _selectRiderType('motorcycle'),
        ),
        _ChoiceCard(
          selected: riderType == 'bicycle',
          icon: Icons.pedal_bike,
          title: 'Bicycle Rider',
          body: 'Lightweight local deliveries.',
          onTap: () => _selectRiderType('bicycle'),
        ),
        _ChoiceCard(
          selected: riderType == 'walker',
          icon: Icons.directions_walk,
          title: 'Walking Courier',
          body: 'Nearby deliveries without a vehicle.',
          onTap: () => _selectRiderType('walker'),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 220),
          crossFadeState: requiresVehicleDetails
              ? CrossFadeState.showFirst
              : CrossFadeState.showSecond,
          firstChild: Column(
            children: [
              const SizedBox(height: 10),
              _field('vehicle_type', icon: Icons.motorcycle_outlined),
              _field('plate_number', icon: Icons.pin_outlined),
            ],
          ),
          secondChild: const Padding(
            padding: EdgeInsets.only(top: 10),
            child: _CompletionBadge(
                text: 'No vehicle papers required for this profile'),
          ),
        ),
      ],
    );
  }

  Widget _documentsStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.cloud_upload_outlined,
          title: 'Upload your review documents',
          body:
              'Each card updates immediately and restores from saved onboarding state.',
        ),
        _UploadCard(
          title: 'Live Selfie',
          uploadedText: 'Selfie Uploaded',
          body: 'Capture a clear front-facing photo.',
          icon: Icons.camera_front_outlined,
          file: selfie == null ? null : File(selfie!.path),
          uploaded: selfieUrl.isNotEmpty,
          onTap: _pickSelfie,
        ),
        _UploadCard(
          title: 'Driver License',
          uploadedText: 'Driver License Uploaded',
          body: 'Upload a clear license image or PDF.',
          icon: Icons.badge_outlined,
          file: driverLicense?.path == null ? null : File(driverLicense!.path!),
          uploaded: driverLicenseUrl.isNotEmpty,
          onTap: _pickDriverLicense,
        ),
        _UploadCard(
          title: 'Proof Of Address',
          uploadedText: 'Proof Of Address Uploaded',
          body: 'Upload a utility bill, tenancy proof, or address document.',
          icon: Icons.receipt_long_outlined,
          file:
              proofOfAddress?.path == null ? null : File(proofOfAddress!.path!),
          uploaded: proofOfAddressUrl.isNotEmpty,
          onTap: _pickProofOfAddress,
        ),
      ],
    );
  }

  Widget _trainingStep() {
    final done = trainingDone.values.where((value) => value).length;
    final percent = ((done / trainingDone.length) * 100).round();
    final icons = [
      Icons.shopping_bag_outlined,
      Icons.restaurant_outlined,
      Icons.support_agent_outlined,
      Icons.health_and_safety_outlined,
      Icons.fact_check_outlined,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.school_outlined,
          title: 'FoodNova Training',
          body: 'Tap each slide after reading it to complete your training.',
        ),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            minHeight: 9,
            value: percent / 100,
            backgroundColor: FoodNovaColors.surface2,
            color: FoodNovaColors.primary,
          ),
        ),
        const SizedBox(height: 8),
        Text('$percent% complete',
            style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 14),
        ...trainingDone.keys.toList().asMap().entries.map((entry) {
          final title = entry.value;
          return _TrainingSlide(
            icon: icons[entry.key],
            title: title,
            done: trainingDone[title] == true,
            onTap: () {
              setState(
                  () => trainingDone[title] = !(trainingDone[title] ?? false));
              _saveDraft();
            },
          );
        }),
      ],
    );
  }

  String _documentDisplayName(
    String fallback,
    PlatformFile? file,
    String uploadedUrl,
  ) {
    final localName = file?.name.trim() ?? '';
    if (localName.isNotEmpty) return localName;
    final uri = Uri.tryParse(uploadedUrl);
    final remoteName = uri?.pathSegments.isNotEmpty == true
        ? uri!.pathSegments.last.trim()
        : '';
    return remoteName.isEmpty ? fallback : remoteName;
  }

  Widget _reviewStep() {
    debugPrint('NIN_REVIEW_MODEL ${jsonEncode(_onboardingDebugState())}');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepIntro(
          icon: Icons.assignment_turned_in_outlined,
          title: 'Review your application',
          body: 'A clean summary goes to FoodNova admin for approval.',
        ),
        if (verifiedNin != null) _VerifiedIdentityCard(result: verifiedNin!),
        const SizedBox(height: 12),
        _SummaryBadge(
            title: 'Identity Verified',
            complete: verifiedNin?.verified == true),
        _SummaryBadge(title: 'Address Completed', complete: _addressComplete),
        _SummaryBadge(
            title: 'Emergency Contact Completed', complete: _addressComplete),
        _SummaryBadge(
            title: 'Documents Uploaded', complete: _documentsComplete),
        _SummaryBadge(title: 'Training Completed', complete: _trainingComplete),
        const SizedBox(height: 16),
        Text('Uploaded documents',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        _DocumentReviewTile(
          title: 'Selfie',
          uploadedText: 'Selfie Uploaded',
          fileName: _documentDisplayName('Selfie photo', null, selfieUrl),
          file: selfie == null ? null : File(selfie!.path),
          uploaded: selfie != null || selfieUrl.isNotEmpty,
        ),
        _DocumentReviewTile(
          title: 'Driver License',
          uploadedText: 'Driver License Uploaded',
          fileName: _documentDisplayName(
              'Driver license', driverLicense, driverLicenseUrl),
          file: driverLicense?.path == null ? null : File(driverLicense!.path!),
          uploaded: driverLicense != null || driverLicenseUrl.isNotEmpty,
        ),
        _DocumentReviewTile(
          title: 'Proof Of Address',
          uploadedText: 'Proof Of Address Uploaded',
          fileName: _documentDisplayName(
              'Proof of address', proofOfAddress, proofOfAddressUrl),
          file:
              proofOfAddress?.path == null ? null : File(proofOfAddress!.path!),
          uploaded: proofOfAddress != null || proofOfAddressUrl.isNotEmpty,
        ),
        const SizedBox(height: 16),
        FnCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CompletionBadge(text: 'APPLICATION READY FOR SUBMISSION'),
              const SizedBox(height: 14),
              _ReviewLine(label: 'Rider type', value: _riderTypeLabel),
              _ReviewLine(label: 'Phone', value: fields['phone']!.text.trim()),
              _ReviewLine(label: 'Email', value: fields['email']!.text.trim()),
              _ReviewLine(label: 'Address', value: _fullAddress),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _nextStep() async {
    if (!_validateCurrentStep()) return;
    if (currentStep == 1) {
      await _createAccountStep();
      return;
    }
    if (currentStep == 3 || currentStep == 4) {
      await _saveProfileStep(nextStep: currentStep + 1);
      return;
    }
    if (currentStep == 6) {
      await _completeTrainingStep();
      return;
    }
    await _goToStep(currentStep + 1);
  }

  Future<void> _createAccountStep() async {
    setState(() {
      loading = true;
      message = '';
    });
    try {
      final token = await ref.read(sessionControllerProvider.notifier).token();
      if (token != null && token.isNotEmpty) {
        final progress =
            await ref.read(authRepositoryProvider).onboardingProgress();
        _applyBackendProgress(progress);
        final nextStep = int.tryParse('${progress['current_step'] ?? 2}') ?? 2;
        await _goToStep(nextStep.clamp(2, _totalSteps).toInt());
        return;
      }
      final progress =
          await ref.read(authRepositoryProvider).createRiderAccount(
                email: fields['email']!.text,
                phone: fields['phone']!.text,
                password: fields['password']!.text,
              );
      authenticatedRider = true;
      _applyBackendProgress(Map<String, dynamic>.from(
          progress['onboarding_progress'] ?? progress['data'] ?? {}));
      await _goToStep(2);
    } catch (error) {
      if (mounted) setState(() => message = _friendlyError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _saveProfileStep({required int nextStep}) async {
    setState(() {
      loading = true;
      message = '';
    });
    try {
      final progress =
          await ref.read(authRepositoryProvider).saveOnboardingProfile({
        'first_name': fields['first_name']!.text.trim(),
        'last_name': fields['last_name']!.text.trim(),
        'full_name': [
          fields['first_name']!.text.trim(),
          fields['last_name']!.text.trim(),
        ].where((part) => part.isNotEmpty).join(' '),
        'phone': fields['phone']!.text.trim(),
        'address': _fullAddress,
        'rider_type': riderType,
        'vehicle_type': fields['vehicle_type']!.text.trim(),
        'plate_number': fields['plate_number']!.text.trim(),
        'emergency_contact_name': fields['emergency_contact_name']!.text.trim(),
        'emergency_contact_phone':
            fields['emergency_contact_phone']!.text.trim(),
        'emergency_contact_relationship':
            fields['emergency_contact_relationship']!.text.trim(),
      });
      _applyBackendProgress(progress);
      await _goToStep(nextStep);
    } catch (error) {
      if (mounted) setState(() => message = _friendlyError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _completeTrainingStep() async {
    setState(() {
      loading = true;
      message = '';
    });
    try {
      final progress =
          await ref.read(authRepositoryProvider).completeOnboardingTraining();
      _applyBackendProgress(progress);
      await _goToStep(7);
    } catch (error) {
      if (mounted) setState(() => message = _friendlyError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool _validateCurrentStep() {
    final blocker = switch (currentStep) {
      1 => _accountComplete ? null : 'Complete valid account details first.',
      2 => verifiedNin?.verified == true
          ? null
          : 'Verify your NIN successfully before continuing.',
      3 => _addressComplete
          ? null
          : 'Complete address and emergency contact details.',
      4 => _riderProfileComplete ? null : 'Complete your rider profile.',
      5 => _documentsComplete
          ? null
          : 'Upload your selfie, driver license, and proof of address.',
      6 => _trainingComplete ? null : 'Complete all FoodNova training slides.',
      _ => null,
    };
    if (blocker == null) return true;
    setState(() => message = blocker);
    return false;
  }

  Future<void> _verifyNin() async {
    final nin = fields['nin_number']!.text.replaceAll(RegExp(r'\D'), '');
    if (nin.length != 11) {
      setState(() => verificationMessage = 'Enter an 11-digit NIN first.');
      return;
    }
    if (!ninConsent) {
      setState(() => verificationMessage = 'NIN consent is required.');
      return;
    }
    debugPrint('VERIFY_NIN_START nin_length=${nin.length}');
    setState(() {
      verifyingNin = true;
      verificationMessage = '';
      verifiedNin = null;
    });
    try {
      final result = await ref
          .read(authRepositoryProvider)
          .verifyNin(nin: nin, consent: ninConsent);
      final progress =
          await ref.read(authRepositoryProvider).onboardingProgress();
      if (!mounted) return;
      if (!result.verified) {
        setState(() => verificationMessage = result.message.isEmpty
            ? 'NIN verification failed.'
            : result.message);
        return;
      }
      final identity = result.identity;
      if (identity.firstName.isNotEmpty) {
        fields['first_name']!.text = identity.firstName;
      }
      if (identity.lastName.isNotEmpty) {
        fields['last_name']!.text = identity.lastName;
      }
      if (identity.phone.isNotEmpty && fields['phone']!.text.trim().isEmpty) {
        fields['phone']!.text = identity.phone;
      }
      setState(() => verifiedNin = result);
      _applyBackendProgress(progress);
      debugPrint('FLUTTER_IDENTITY_MODEL ${jsonEncode(identity.toJson())}');
      debugPrint('NIN_UI_MODEL ${jsonEncode({
            'full_name': identity.fullName,
            'birthdate': identity.dateOfBirth,
            'gender': identity.gender,
            'phone': identity.phone,
            'report_id': result.reportId,
          })}');
      await _saveDraft();
      debugPrint('NIN_LOCAL_STORAGE ${jsonEncode(_onboardingDebugState())}');
    } catch (error) {
      if (mounted) setState(() => verificationMessage = _friendlyError(error));
    } finally {
      if (mounted) setState(() => verifyingNin = false);
    }
  }

  Future<void> _recoverLostPickerData() async {
    try {
      final recovered = await fileRecovery.retrieveLostPickerFile();
      if (!mounted || recovered == null) return;
      setState(() {
        switch (recovered.kind) {
          case OnboardingDocumentKind.selfie:
            selfie = recovered.toXFile();
            break;
          case OnboardingDocumentKind.driverLicense:
            driverLicense = recovered.toPlatformFile();
            break;
          case OnboardingDocumentKind.proofOfAddress:
            proofOfAddress = recovered.toPlatformFile();
            break;
        }
      });
      final documentType = switch (recovered.kind) {
        OnboardingDocumentKind.selfie => 'selfie',
        OnboardingDocumentKind.driverLicense => 'driver_license',
        OnboardingDocumentKind.proofOfAddress => 'proof_of_address',
      };
      final progress =
          await ref.read(authRepositoryProvider).uploadOnboardingDocument(
                documentType: documentType,
                path: recovered.path,
              );
      _applyBackendProgress(progress);
      await _saveDraft();
    } catch (error) {
      debugPrint('ONBOARDING_PICKER_RECOVERY_FAILED error=$error');
    }
  }

  Future<void> _pickSelfie() async {
    debugPrint('SELFIE_UPLOAD_STARTED source=camera step=$currentStep');
    await fileRecovery.markPickerPending(OnboardingDocumentKind.selfie);
    final file =
        await picker.pickImage(source: ImageSource.camera, imageQuality: 82);
    if (!mounted) return;
    if (file == null) {
      await fileRecovery.clearPickerPending();
      return;
    }
    final persisted = await fileRecovery.persistXFile(
      file,
      OnboardingDocumentKind.selfie,
    );
    await fileRecovery.clearPickerPending();
    final length = persisted.size;
    if (length > 5 * 1024 * 1024) {
      setState(() => message = 'Selfie must be 5MB or smaller.');
      return;
    }
    setState(() => selfie = persisted.toXFile());
    final progress =
        await ref.read(authRepositoryProvider).uploadOnboardingDocument(
              documentType: 'selfie',
              path: persisted.path,
            );
    _applyBackendProgress(progress);
    await _saveDraft();
    debugPrint(
        'SELFIE_UPLOAD_SUCCESS persisted=true ${jsonEncode(_onboardingDebugState())}');
  }

  Future<void> _pickDriverLicense() async {
    final file = await _pickDocument('LICENSE_UPLOAD');
    if (file == null) return;
    final persisted = await fileRecovery.persistPlatformFile(
      file,
      OnboardingDocumentKind.driverLicense,
    );
    setState(() => driverLicense = persisted.toPlatformFile());
    final progress =
        await ref.read(authRepositoryProvider).uploadOnboardingDocument(
              documentType: 'driver_license',
              path: persisted.path,
            );
    _applyBackendProgress(progress);
    await _saveDraft();
  }

  Future<void> _pickProofOfAddress() async {
    final file = await _pickDocument('PROOF_OF_ADDRESS_UPLOAD');
    if (file == null) return;
    final persisted = await fileRecovery.persistPlatformFile(
      file,
      OnboardingDocumentKind.proofOfAddress,
    );
    setState(() => proofOfAddress = persisted.toPlatformFile());
    final progress =
        await ref.read(authRepositoryProvider).uploadOnboardingDocument(
              documentType: 'proof_of_address',
              path: persisted.path,
            );
    _applyBackendProgress(progress);
    await _saveDraft();
  }

  Future<PlatformFile?> _pickDocument(String logPrefix) async {
    debugPrint('${logPrefix}_START source=file_picker');
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
      withData: false,
    );
    if (!mounted || result == null || result.files.isEmpty) return null;
    final file = result.files.single;
    if (file.path == null || file.path!.trim().isEmpty) {
      setState(() => message = 'FoodNova could not access that file.');
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      setState(() => message = 'Document must be 5MB or smaller.');
      return null;
    }
    debugPrint('${logPrefix}_SUCCESS bytes=${file.size}');
    return file;
  }

  Future<void> _submit() async {
    final validation = _submissionBlocker();
    if (validation != null) {
      setState(() => message = validation);
      return;
    }
    setState(() {
      loading = true;
      message = '';
    });
    try {
      final nin = fields['nin_number']!.text.replaceAll(RegExp(r'\D'), '');
      final identity = verifiedNin!.identity;
      final firstName = fields['first_name']!.text.trim().isNotEmpty
          ? fields['first_name']!.text.trim()
          : identity.firstName;
      final lastName = fields['last_name']!.text.trim().isNotEmpty
          ? fields['last_name']!.text.trim()
          : identity.lastName;
      final fullName = [firstName, identity.middleName, lastName]
              .where((part) => part.trim().isNotEmpty)
              .join(' ')
              .trim()
              .isNotEmpty
          ? [firstName, identity.middleName, lastName]
              .where((part) => part.trim().isNotEmpty)
              .join(' ')
          : identity.fullName;
      final phone = fields['phone']!.text.trim().isNotEmpty
          ? fields['phone']!.text.trim()
          : identity.phone;
      if (fullName.trim().isEmpty) {
        setState(() => message = 'Missing required field: full name');
        return;
      }
      final payload = <String, dynamic>{
        'first_name': firstName,
        'last_name': lastName,
        'full_name': fullName,
        'phone': phone,
        'email': fields['email']!.text.trim(),
        'password': fields['password']!.text,
        'confirm_password': fields['confirm_password']!.text,
        'nin_number': nin,
        'nin': identity.nin.isNotEmpty ? identity.nin : nin,
        'gender': identity.gender,
        'date_of_birth': identity.dateOfBirth,
        'address':
            identity.address.isNotEmpty ? identity.address : _fullAddress,
        'nin_consent': ninConsent,
        'rider_type': riderType,
        'worker_type': riderType == 'walker' ? 'messenger' : 'rider',
        'residential_address': _fullAddress,
        'home_address': _fullAddress,
        'operating_city': _fullAddress,
        'emergency_contact_name': fields['emergency_contact_name']!.text.trim(),
        'emergency_contact_phone':
            fields['emergency_contact_phone']!.text.trim(),
        'emergency_contact_relationship':
            fields['emergency_contact_relationship']!.text.trim(),
        'id_type': 'Driver License',
        'id_number': nin,
        'vehicle_type':
            requiresVehicleDetails ? fields['vehicle_type']!.text.trim() : '',
        'plate_number':
            requiresVehicleDetails ? fields['plate_number']!.text.trim() : '',
        'driver_license_number': '',
        if (verifiedNin != null) ...verifiedNin!.applicationPayload,
      };
      debugPrint('FINAL_SUBMISSION_PAYLOAD ${jsonEncode(payload)}');
      await ref.read(authRepositoryProvider).submitOnboardingApplication();
      if (!mounted) return;
      await ref
          .read(sessionControllerProvider.notifier)
          .saveOnboardingStep(_totalSteps);
      await ref.read(sessionControllerProvider.notifier).clearOnboardingDraft();
      if (!mounted) return;
      _showPendingReviewScreen();
    } catch (error) {
      if (mounted) setState(() => message = _friendlyError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String? _submissionBlocker() {
    if (!_accountComplete) return 'Complete account details before submitting.';
    if (verifiedNin?.verified != true) {
      return 'Verify your NIN successfully before submitting.';
    }
    if (verifiedNin!.reportId.isEmpty) {
      return 'NIN verification session is missing. Please verify NIN again.';
    }
    if (!_addressComplete) {
      return 'Complete address and emergency contact details.';
    }
    if (!_riderProfileComplete) return 'Complete your rider profile.';
    if (!_documentsComplete) return 'Upload your required documents.';
    if (!_trainingComplete) return 'Complete FoodNova training.';
    return null;
  }

  void _showPendingReviewScreen() {
    showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
                color: Color(0x24000000), blurRadius: 30, offset: Offset(0, 18))
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _AnimatedSuccessMark(),
            const SizedBox(height: 16),
            const _StatusPill(
                text: 'Pending Admin Approval',
                color: FoodNovaColors.accent,
                darkText: true),
            const SizedBox(height: 12),
            Text('Application submitted',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            const Text(
                'FoodNova operations will review your application in 24-72 Hours. Dashboard access remains limited until approval.',
                textAlign: TextAlign.center),
            const SizedBox(height: 18),
            FilledButton(
                onPressed: () => context.go('/dashboard'),
                child: const Text('View limited dashboard')),
          ],
        ),
      ),
    );
  }

  void _selectRiderType(String value) {
    setState(() => riderType = value);
    _saveDraft();
  }

  String get _riderTypeLabel => switch (riderType) {
        'bicycle' => 'Bicycle Rider',
        'walker' => 'Walking Courier',
        _ => 'Motorcycle Rider',
      };

  String get _fullAddress => [
        fields['residential_address']!.text.trim(),
        fields['lga']!.text.trim(),
        fields['state']!.text.trim(),
      ].where((part) => part.isNotEmpty).join(', ');

  Map<String, dynamic> _onboardingDebugState() => {
        'current_step': currentStep,
        'nin_verified': verifiedNin?.verified == true,
        'nin_full_name': verifiedNin?.fullName ?? '',
        'nin_birthdate': verifiedNin?.dateOfBirth ?? '',
        'nin_gender': verifiedNin?.gender ?? '',
        'nin_phone': verifiedNin?.phone ?? '',
        'nin_report_id': verifiedNin?.reportId ?? '',
        'nin_submission_allowed': verifiedNin?.verified == true &&
            verifiedNin?.reportId.isNotEmpty == true,
        'has_selfie': selfie != null,
        'has_driver_license': driverLicense != null,
        'has_proof_of_address': proofOfAddress != null,
        'documents_complete': _documentsComplete,
        'training_complete': _trainingComplete,
      };

  String _friendlyError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['detail'] != null) return '${data['detail']}';
      if (data is Map && data['message'] != null) return '${data['message']}';
      if (data is String && data.trim().isNotEmpty) return data;
    }
    return '$error'.replaceFirst('Exception: ', '');
  }

  Widget _field(
    String key, {
    bool obscure = false,
    TextInputType? keyboardType,
    int? maxLength,
    bool readOnly = false,
    IconData? icon,
    ValueChanged<String>? onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: fields[key],
        obscureText: obscure,
        keyboardType: keyboardType,
        maxLength: maxLength,
        readOnly: readOnly,
        decoration: InputDecoration(
          labelText: _label(key),
          prefixIcon: icon == null ? null : Icon(icon),
          suffixIcon: readOnly
              ? const Icon(Icons.lock_outline, size: 18)
              : _fieldCompleteIcon(key),
        ),
        onChanged: onChanged,
      ),
    );
  }

  Widget? _fieldCompleteIcon(String key) {
    final value = fields[key]!.text.trim();
    final complete = switch (key) {
      'email' => value.contains('@'),
      'phone' ||
      'emergency_contact_phone' =>
        value.replaceAll(RegExp(r'\D'), '').length >= 10,
      'password' => value.length >= 6,
      'confirm_password' =>
        value.isNotEmpty && value == fields['password']!.text,
      'nin_number' => value.replaceAll(RegExp(r'\D'), '').length == 11,
      _ => value.isNotEmpty,
    };
    return complete
        ? const Icon(Icons.check_circle,
            color: FoodNovaColors.success, size: 19)
        : null;
  }
}

String _label(String key) => key
    .split('_')
    .map((part) =>
        part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');

class _Header extends StatelessWidget {
  const _Header(
      {required this.currentStep,
      required this.title,
      required this.status,
      required this.percent});
  final int currentStep;
  final String title;
  final String status;
  final int percent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Center(child: BrandLogo(width: 152, height: 58)),
          const SizedBox(height: 14),
          Text('Welcome to FoodNova Dispatch',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          const Text('A guided, secure onboarding built for fast approval.'),
          const SizedBox(height: 16),
          Row(
            children: [
              Text('Step $currentStep of $_totalSteps',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              const Spacer(),
              _StatusPill(
                  text: status,
                  color: status == 'Complete'
                      ? FoodNovaColors.success
                      : FoodNovaColors.accent,
                  darkText: status != 'Complete'),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: percent / 100,
              minHeight: 10,
              backgroundColor: const Color(0xFFE5ECE5),
              color: FoodNovaColors.primary,
            ),
          ),
          const SizedBox(height: 8),
          Text('$percent% - $title',
              style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: FoodNovaColors.primaryDark)),
        ],
      ),
    );
  }
}

class _PremiumCard extends StatelessWidget {
  const _PremiumCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
              color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 12))
        ],
      ),
      child: child,
    );
  }
}

class _StepIntro extends StatelessWidget {
  const _StepIntro(
      {required this.icon,
      required this.title,
      required this.body,
      this.hero = false});
  final IconData icon;
  final String title;
  final String body;
  final bool hero;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: EdgeInsets.all(hero ? 20 : 16),
      decoration: BoxDecoration(
        color: hero ? const Color(0xFFEAF6EE) : const Color(0xFFF4F7F4),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: hero ? FoodNovaColors.primary : FoodNovaColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: hero ? 30 : 24,
            backgroundColor: hero ? FoodNovaColors.primary : Colors.white,
            child: Icon(icon,
                color: hero ? Colors.white : FoodNovaColors.primary,
                size: hero ? 32 : 25),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(body, style: const TextStyle(color: FoodNovaColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordStrength extends StatelessWidget {
  const _PasswordStrength({required this.password});
  final String password;

  @override
  Widget build(BuildContext context) {
    final score = [
      password.length >= 6,
      RegExp(r'[A-Z]').hasMatch(password),
      RegExp(r'[0-9]').hasMatch(password),
      RegExp(r'[^A-Za-z0-9]').hasMatch(password),
    ].where((value) => value).length;
    final label = score <= 1
        ? 'Weak'
        : score <= 2
            ? 'Good'
            : 'Strong';
    final color = score <= 1
        ? FoodNovaColors.danger
        : score <= 2
            ? FoodNovaColors.accent
            : FoodNovaColors.success;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LinearProgressIndicator(
              value: score / 4,
              minHeight: 7,
              color: color,
              backgroundColor: FoodNovaColors.surface2),
          const SizedBox(height: 6),
          Text('Password strength: $label',
              style: TextStyle(color: color, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _ConsentTile extends StatelessWidget {
  const _ConsentTile(
      {required this.value, required this.locked, required this.onChanged});
  final bool value;
  final bool locked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: locked ? null : () => onChanged(!value),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
              color: value ? FoodNovaColors.primary : FoodNovaColors.border),
        ),
        child: Row(
          children: [
            Checkbox(
                value: value,
                onChanged: locked ? null : (next) => onChanged(next ?? false)),
            const Expanded(
                child: Text(
                    'I consent to FoodNova verifying my NIN for rider identity and safety review.')),
          ],
        ),
      ),
    );
  }
}

class _VerifiedIdentityCard extends StatelessWidget {
  const _VerifiedIdentityCard({required this.result});
  final NinVerificationResult result;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('Full Name', result.fullName),
      ('Date of Birth', result.dateOfBirth),
      ('Gender', result.gender),
      ('Phone Number', result.phone),
    ].where((row) => row.$2.trim().isNotEmpty).toList();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF6EE),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: FoodNovaColors.primary),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              _AnimatedSuccessMark(small: true),
              SizedBox(width: 10),
              Expanded(
                  child: _StatusPill(
                      text: 'Identity Verified',
                      color: FoodNovaColors.success)),
            ],
          ),
          const SizedBox(height: 12),
          ...rows.map((row) => _ReviewLine(label: row.$1, value: row.$2)),
        ],
      ),
    );
  }
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard(
      {required this.selected,
      required this.icon,
      required this.title,
      required this.body,
      required this.onTap});
  final bool selected;
  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFFFF8DD) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: selected ? FoodNovaColors.primary : FoodNovaColors.border,
            width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, color: FoodNovaColors.primary, size: 30),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 3),
                    Text(body,
                        style: const TextStyle(color: FoodNovaColors.muted)),
                  ],
                ),
              ),
              if (selected)
                const Icon(Icons.check_circle, color: FoodNovaColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _UploadCard extends StatelessWidget {
  const _UploadCard(
      {required this.title,
      required this.uploadedText,
      required this.body,
      required this.icon,
      required this.file,
      this.uploaded = false,
      required this.onTap});
  final String title;
  final String uploadedText;
  final String body;
  final IconData icon;
  final File? file;
  final bool uploaded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isUploaded = uploaded || file != null;
    final isImage = file != null && !file!.path.toLowerCase().endsWith('.pdf');
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
              color:
                  isUploaded ? FoodNovaColors.primary : FoodNovaColors.border),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                width: 68,
                height: 68,
                color: const Color(0xFFF1F5F1),
                child: isImage
                    ? Image.file(file!, fit: BoxFit.cover)
                    : Icon(isUploaded ? Icons.check_circle_outline : icon,
                        color: FoodNovaColors.primary, size: 30),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text(isUploaded ? 'Uploaded Successfully' : body,
                      style: const TextStyle(color: FoodNovaColors.muted)),
                  const SizedBox(height: 8),
                  _StatusPill(
                    text: isUploaded ? uploadedText : 'Tap to upload',
                    color: isUploaded
                        ? FoodNovaColors.success
                        : FoodNovaColors.accent,
                    darkText: !isUploaded,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DocumentReviewTile extends StatelessWidget {
  const _DocumentReviewTile({
    required this.title,
    required this.uploadedText,
    required this.fileName,
    required this.file,
    required this.uploaded,
  });

  final String title;
  final String uploadedText;
  final String fileName;
  final File? file;
  final bool uploaded;

  @override
  Widget build(BuildContext context) {
    final isImage = file != null && !file!.path.toLowerCase().endsWith('.pdf');
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: FoodNovaColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: uploaded ? FoodNovaColors.success : FoodNovaColors.border,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 64,
              height: 64,
              color: FoodNovaColors.surface2,
              child: isImage
                  ? Image.file(file!, fit: BoxFit.cover)
                  : Icon(
                      uploaded
                          ? Icons.check_circle_outline
                          : Icons.description_outlined,
                      color: uploaded
                          ? FoodNovaColors.success
                          : FoodNovaColors.primary,
                    ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                      color: FoodNovaColors.text,
                      fontWeight: FontWeight.w900,
                    )),
                const SizedBox(height: 4),
                Text(
                  fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: FoodNovaColors.secondaryText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                _StatusPill(
                  text: uploaded ? uploadedText : 'Missing document',
                  color:
                      uploaded ? FoodNovaColors.success : FoodNovaColors.danger,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TrainingSlide extends StatelessWidget {
  const _TrainingSlide(
      {required this.icon,
      required this.title,
      required this.done,
      required this.onTap});
  final IconData icon;
  final String title;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _ChoiceCard(
      selected: done,
      icon: icon,
      title: title,
      body: done ? 'Completed' : 'Tap to mark this training slide complete.',
      onTap: onTap,
    );
  }
}

class _SummaryBadge extends StatelessWidget {
  const _SummaryBadge({required this.title, required this.complete});
  final String title;
  final bool complete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: complete ? const Color(0xFFEAF6EE) : const Color(0xFFFFF8DD),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(complete ? Icons.verified : Icons.error_outline,
              color:
                  complete ? FoodNovaColors.success : FoodNovaColors.warning),
          const SizedBox(width: 10),
          Expanded(
              child: Text(title,
                  style: const TextStyle(fontWeight: FontWeight.w900))),
        ],
      ),
    );
  }
}

class _CompletionBadge extends StatelessWidget {
  const _CompletionBadge({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return _StatusPill(text: text, color: FoodNovaColors.success);
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(
      {required this.text, required this.color, this.darkText = false});
  final String text;
  final Color color;
  final bool darkText;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration:
          BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(
        text,
        style: TextStyle(
          color: darkText ? FoodNovaColors.primaryDark : Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _ReviewLine extends StatelessWidget {
  const _ReviewLine({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 120,
              child: Text(label,
                  style: const TextStyle(
                      color: FoodNovaColors.secondaryText,
                      fontWeight: FontWeight.w700))),
          Expanded(
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w900))),
        ],
      ),
    );
  }
}

class _AnimatedSuccessMark extends StatelessWidget {
  const _AnimatedSuccessMark({this.small = false});
  final bool small;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.6, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.elasticOut,
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: CircleAvatar(
        radius: small ? 17 : 34,
        backgroundColor: FoodNovaColors.success,
        child: Icon(Icons.check, color: Colors.white, size: small ? 20 : 38),
      ),
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls(
      {required this.step,
      required this.loading,
      required this.canContinue,
      required this.onBack,
      required this.onNext});
  final int step;
  final bool loading;
  final bool canContinue;
  final VoidCallback? onBack;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 18),
      decoration: const BoxDecoration(color: Colors.white, boxShadow: [
        BoxShadow(
            color: Color(0x10000000), blurRadius: 16, offset: Offset(0, -8))
      ]),
      child: Row(
        children: [
          if (onBack != null)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: loading ? null : onBack,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Back'),
              ),
            ),
          if (onBack != null) const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              onPressed: loading || !canContinue ? null : onNext,
              icon: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(
                      step == _totalSteps ? Icons.send : Icons.arrow_forward),
              label: Text(loading
                  ? 'Submitting'
                  : step == _totalSteps
                      ? 'Submit for Review'
                      : 'Continue'),
            ),
          ),
        ],
      ),
    );
  }
}
