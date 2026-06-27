import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../data/auth_repository.dart';

enum _StepId {
  account,
  otp,
  nin,
  personal,
  selfie,
  document,
  terms,
  review,
  submitted,
}

const _steps = [
  _StepId.account,
  _StepId.otp,
  _StepId.nin,
  _StepId.personal,
  _StepId.selfie,
  _StepId.document,
  _StepId.terms,
  _StepId.review,
  _StepId.submitted,
];

const _titles = {
  _StepId.account: 'Create Account',
  _StepId.otp: 'Verify Email',
  _StepId.nin: 'NIN Verification',
  _StepId.personal: 'Personal Information',
  _StepId.selfie: 'Selfie Verification',
  _StepId.document: 'Government ID',
  _StepId.terms: 'Terms & Conditions',
  _StepId.review: 'Review & Submit',
  _StepId.submitted: 'Application Submitted',
};

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _picker = ImagePicker();
  final _formKey = GlobalKey<FormState>();
  final _controllers = <String, TextEditingController>{
    'email': TextEditingController(),
    'password': TextEditingController(),
    'confirm_password': TextEditingController(),
    'otp': TextEditingController(),
    'nin': TextEditingController(),
    'phone': TextEditingController(),
    'address': TextEditingController(),
    'city': TextEditingController(),
    'state': TextEditingController(),
    'emergency_name': TextEditingController(),
    'emergency_phone': TextEditingController(),
  };

  int _index = 0;
  bool _loading = false;
  bool _termsAccepted = false;
  bool _submittedRedirectQueued = false;
  String _message = '';
  String _existingAccount = '';
  String _documentType = 'driver_license';
  Timer? _otpTimer;
  int _otpSeconds = 0;
  NinVerificationResult? _identity;
  XFile? _selfie;
  PlatformFile? _governmentId;

  _StepId get _step => _steps[_index];
  int get _stepNumber => _index + 1;
  int get _percent => ((_stepNumber / _steps.length) * 100).round();
  static const _documentTypes = <String>{
    'driver_license',
    'voters_card',
    'international_passport',
  };

  @override
  void initState() {
    super.initState();
    _restoreDraft();
  }

  @override
  void dispose() {
    _otpTimer?.cancel();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _restoreDraft() async {
    final session = ref.read(sessionControllerProvider.notifier);
    final savedStep = await session.currentOnboardingStep();
    final draft = await session.onboardingDraft();
    if (!mounted) return;
    if (draft.trim().isNotEmpty) {
      try {
        final data = jsonDecode(draft) as Map<String, dynamic>;
        for (final entry in _controllers.entries) {
          entry.value.text = '${data[entry.key] ?? ''}';
        }
        _termsAccepted = data['terms_accepted'] == true;
        final savedDocumentType = '${data['document_type'] ?? _documentType}';
        _documentType = _documentTypes.contains(savedDocumentType)
            ? savedDocumentType
            : 'driver_license';
      } catch (_) {
        await session.clearOnboardingDraft();
      }
    }
    setState(() {
      _index = (savedStep - 1).clamp(0, _steps.length - 1).toInt();
    });
    debugPrint(
      'ONBOARDING_RESTORED saved_step=$savedStep index=$_index title=${_titles[_step]} draft_present=${draft.trim().isNotEmpty}',
    );
  }

  Future<void> _saveDraft() async {
    final data = {
      for (final entry in _controllers.entries) entry.key: entry.value.text,
      'terms_accepted': _termsAccepted,
      'document_type': _documentType,
    };
    await ref
        .read(sessionControllerProvider.notifier)
        .saveOnboardingDraft(jsonEncode(data));
    await ref
        .read(sessionControllerProvider.notifier)
        .saveOnboardingStep(_stepNumber);
  }

  Future<void> _setStep(int nextIndex) async {
    setState(() {
      _message = '';
      _existingAccount = '';
      _index = nextIndex.clamp(0, _steps.length - 1).toInt();
    });
    await _saveDraft();
  }

  Future<void> _continue() async {
    if (_loading) return;
    FocusScope.of(context).unfocus();
    final valid = _formKey.currentState?.validate() ?? true;
    if (!valid) {
      setState(() => _message = 'Please fix the highlighted fields.');
      return;
    }
    setState(() {
      _loading = true;
      _message = '';
      _existingAccount = '';
    });
    try {
      switch (_step) {
        case _StepId.account:
          await _sendOtp();
          break;
        case _StepId.otp:
          await _verifyOtpAndCreateAccount();
          break;
        case _StepId.nin:
          await _verifyNin();
          break;
        case _StepId.personal:
          await _savePersonalInfo();
          break;
        case _StepId.selfie:
          await _uploadSelfie();
          break;
        case _StepId.document:
          await _uploadDocument();
          break;
        case _StepId.terms:
          if (!_termsAccepted) {
            throw Exception('Accept the Terms & Conditions to continue.');
          }
          await _setStep(_index + 1);
          break;
        case _StepId.review:
          await _submit();
          break;
        case _StepId.submitted:
          context.go('/dashboard');
          break;
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendOtp() async {
    final email = _text('email');
    final repo = ref.read(authRepositoryProvider);
    final exists = await repo.emailExists(email);
    if (exists) {
      setState(() {
        _existingAccount = 'This email is already registered.';
      });
      return;
    }
    await repo.sendEmailOtp(email);
    _startOtpTimer();
    await _setStep(_index + 1);
  }

  Future<void> _verifyOtpAndCreateAccount() async {
    final repo = ref.read(authRepositoryProvider);
    final email = _text('email');
    final otp = _text('otp');
    await repo.verifyEmailOtp(email: email, otp: otp);
    await repo.registerWithVerifiedEmail(
      email: email,
      password: _text('password'),
      otp: otp,
    );
    await _setStep(_index + 1);
  }

  Future<void> _verifyNin() async {
    final result = await ref.read(authRepositoryProvider).verifyNin(
          nin: _text('nin'),
          consent: true,
        );
    if (!result.verified) {
      throw Exception(result.message.isEmpty
          ? 'NIN verification failed. Check the number and try again.'
          : result.message);
    }
    setState(() => _identity = result);
    await _setStep(_index + 1);
  }

  Future<void> _savePersonalInfo() async {
    final identity = _identity;
    await ref.read(authRepositoryProvider).saveOnboardingProfile({
      'first_name': identity?.firstName ?? '',
      'middle_name': identity?.middleName ?? '',
      'last_name': identity?.surname ?? '',
      'full_name': identity?.fullName ?? '',
      'gender': identity?.gender ?? '',
      'date_of_birth': identity?.dateOfBirth ?? '',
      'phone': _text('phone'),
      'address': '${_text('address')}, ${_text('city')}, ${_text('state')}',
      'emergency_contact_name': _text('emergency_name'),
      'emergency_contact_phone': _text('emergency_phone'),
      'emergency_contact_relationship': 'Emergency Contact',
      'rider_type': 'motorcycle',
      'vehicle_type': 'Motorcycle',
    });
    await _setStep(_index + 1);
  }

  Future<void> _uploadSelfie() async {
    final selfie = _selfie;
    if (selfie == null) {
      throw Exception('Capture a clear selfie to continue.');
    }
    final size = await File(selfie.path).length();
    if (size < 20000) {
      throw Exception('The selfie is too small. Capture a clearer image.');
    }
    await ref.read(authRepositoryProvider).uploadSelfie(path: selfie.path);
    await _setStep(_index + 1);
  }

  Future<void> _uploadDocument() async {
    debugPrint(
      'DOCUMENT_VALIDATION_START document_type=$_documentType has_document=${_governmentId != null}',
    );
    if (!_documentTypes.contains(_documentType)) {
      debugPrint('DOCUMENT_VALIDATION_FAILED reason=invalid_document_type');
      throw Exception('Select a valid government ID document type.');
    }
    final document = _governmentId;
    final path = document?.path;
    if (document == null || path == null || path.isEmpty) {
      debugPrint('DOCUMENT_VALIDATION_FAILED reason=document_missing');
      throw Exception('Upload one government ID document to continue.');
    }
    final size = await File(path).length();
    if (size <= 0) {
      debugPrint('DOCUMENT_VALIDATION_FAILED reason=document_empty');
      throw Exception('The selected government ID file is empty.');
    }
    await ref.read(authRepositoryProvider).uploadGovernmentDocument(
          documentType: _documentType,
          path: path,
        );
    await _setStep(_index + 1);
  }

  Future<void> _submit() async {
    final data =
        await ref.read(authRepositoryProvider).submitOnboardingApplication();
    final worker = Map<String, dynamic>.from(data['worker'] ?? {});
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: '${worker['id'] ?? data['worker_id'] ?? ''}',
          approvalStatus: '${worker['kyc_status'] ?? 'PENDING_REVIEW'}',
          onboardingCompleted: true,
          profileExists: true,
          profileSource: 'backend',
          currentStep: dispatchOnboardingTotalSteps,
        );
    await ref.read(sessionControllerProvider.notifier).clearOnboardingDraft();
    await _setStep(_steps.indexOf(_StepId.submitted));
    _queueDashboardRedirect();
  }

  void _queueDashboardRedirect() {
    if (_submittedRedirectQueued) return;
    _submittedRedirectQueued = true;
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (mounted) context.go('/dashboard');
    });
  }

  void _startOtpTimer() {
    _otpTimer?.cancel();
    setState(() => _otpSeconds = 600);
    _otpTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_otpSeconds <= 1) {
        timer.cancel();
        setState(() => _otpSeconds = 0);
      } else {
        setState(() => _otpSeconds -= 1);
      }
    });
  }

  Future<void> _captureSelfie() async {
    final image = await _picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 88,
      maxWidth: 1400,
    );
    if (image != null) {
      setState(() => _selfie = image);
      debugPrint(
        'SELFIE_CAPTURED path_present=${image.path.trim().isNotEmpty} name=${image.name}',
      );
      await _saveDraft();
    }
  }

  Future<void> _pickDocument() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
      withData: false,
    );
    final file = result?.files.first;
    if (file != null) {
      setState(() => _governmentId = file);
      await _saveDraft();
    }
  }

  Future<bool> _onBack() async {
    if (_loading) return false;
    if (_index == 0) {
      context.go('/login');
    } else {
      await _setStep(_index - 1);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    if (_step == _StepId.submitted) _queueDashboardRedirect();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, __) => _onBack(),
      child: Scaffold(
        backgroundColor: FoodNovaColors.surface,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Form(
                key: _formKey,
                child: CustomScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
                      sliver: SliverList.list(
                        children: [
                          _header(context),
                          const SizedBox(height: 18),
                          _progress(context),
                          const SizedBox(height: 18),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 260),
                            switchInCurve: Curves.easeOutCubic,
                            switchOutCurve: Curves.easeInCubic,
                            child: _card(
                              key: ValueKey(_step),
                              child: _content(context),
                            ),
                          ),
                          if (_message.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            _notice(_message, error: true),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          child: Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: FoodNovaColors.border)),
            ),
            child: Row(
              children: [
                IconButton.filledTonal(
                  onPressed: _loading ? null : _onBack,
                  icon: const Icon(Icons.arrow_back_rounded),
                  tooltip: 'Back',
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _loading ? null : _continue,
                    style: FilledButton.styleFrom(
                      backgroundColor: FoodNovaColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(_buttonLabel),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String get _buttonLabel {
    switch (_step) {
      case _StepId.account:
        return 'Send OTP';
      case _StepId.otp:
        return 'Verify & Create Account';
      case _StepId.nin:
        return 'Verify NIN';
      case _StepId.review:
        return 'Submit Application';
      case _StepId.submitted:
        return 'Open Dashboard';
      default:
        return 'Continue';
    }
  }

  Widget _header(BuildContext context) {
    return Row(
      children: [
        Image.asset('assets/brand/foodnova-logo.png', width: 76, height: 76),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'FoodNova Dispatch',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: FoodNovaColors.primaryDark,
                      fontWeight: FontWeight.w900,
                    ),
              ),
              Text(
                _titles[_step] ?? '',
                style: const TextStyle(
                  color: FoodNovaColors.secondaryText,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _progress(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Step $_stepNumber of ${_steps.length}',
                  style: const TextStyle(
                    color: FoodNovaColors.primaryDark,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                '$_percent%',
                style: const TextStyle(
                  color: FoodNovaColors.primary,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: _stepNumber / _steps.length,
              backgroundColor: FoodNovaColors.surface2,
              color: FoodNovaColors.primary,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _titles[_step] ?? '',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
        ],
      ),
    );
  }

  Widget _content(BuildContext context) {
    switch (_step) {
      case _StepId.account:
        return _accountStep();
      case _StepId.otp:
        return _otpStep();
      case _StepId.nin:
        return _ninStep();
      case _StepId.personal:
        return _personalStep();
      case _StepId.selfie:
        return _selfieStep();
      case _StepId.document:
        return _documentStep();
      case _StepId.terms:
        return _termsStep();
      case _StepId.review:
        return _reviewStep();
      case _StepId.submitted:
        return _submittedStep();
    }
  }

  Widget _accountStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _field('email',
            label: 'Email', keyboardType: TextInputType.emailAddress),
        const SizedBox(height: 14),
        _field('password', label: 'Password', obscure: true),
        const SizedBox(height: 14),
        _field('confirm_password', label: 'Confirm Password', obscure: true),
        if (_existingAccount.isNotEmpty) ...[
          const SizedBox(height: 16),
          _notice(_existingAccount, error: true),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              OutlinedButton.icon(
                onPressed: () => context.go('/login'),
                icon: const Icon(Icons.login_rounded),
                label: const Text('Go to Login'),
              ),
              OutlinedButton.icon(
                onPressed: () => context.go('/forgot-password'),
                icon: const Icon(Icons.lock_reset_rounded),
                label: const Text('Forgot Password'),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _otpStep() {
    final minutes = (_otpSeconds ~/ 60).toString().padLeft(2, '0');
    final seconds = (_otpSeconds % 60).toString().padLeft(2, '0');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _notice('Enter the 6-digit code sent to ${_text('email')}.'),
        const SizedBox(height: 14),
        _field(
          'otp',
          label: '6-digit OTP',
          keyboardType: TextInputType.number,
          maxLength: 6,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                _otpSeconds > 0
                    ? 'Resend available in $minutes:$seconds'
                    : 'You can request a new code.',
                style: const TextStyle(color: FoodNovaColors.secondaryText),
              ),
            ),
            TextButton(
              onPressed: _loading || _otpSeconds > 0
                  ? null
                  : () async {
                      await ref
                          .read(authRepositoryProvider)
                          .sendEmailOtp(_text('email'));
                      _startOtpTimer();
                    },
              child: const Text('Resend OTP'),
            ),
          ],
        ),
        TextButton.icon(
          onPressed: _loading ? null : () => _setStep(0),
          icon: const Icon(Icons.edit_rounded),
          label: const Text('Change Email'),
        ),
      ],
    );
  }

  Widget _ninStep() {
    final identity = _identity;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _notice('FoodNova verifies rider identity before any delivery access.'),
        const SizedBox(height: 14),
        _field(
          'nin',
          label: 'NIN',
          keyboardType: TextInputType.number,
          maxLength: 11,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        const SizedBox(height: 10),
        const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.verified_user_rounded, color: FoodNovaColors.primary),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'I consent to FoodNova verifying my NIN for rider onboarding.',
                style: TextStyle(
                  color: FoodNovaColors.primaryDark,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        if (identity != null) ...[
          const SizedBox(height: 16),
          _identityPanel(identity),
        ],
      ],
    );
  }

  Widget _personalStep() {
    final identity = _identity;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (identity != null) _identityPanel(identity),
        const SizedBox(height: 16),
        _field('phone',
            label: 'Phone Number', keyboardType: TextInputType.phone),
        const SizedBox(height: 14),
        _field('address', label: 'Residential Address'),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: _field('city', label: 'City')),
            const SizedBox(width: 12),
            Expanded(child: _field('state', label: 'State')),
          ],
        ),
        const SizedBox(height: 14),
        _field('emergency_name', label: 'Emergency Contact Name'),
        const SizedBox(height: 14),
        _field(
          'emergency_phone',
          label: 'Emergency Contact Phone',
          keyboardType: TextInputType.phone,
        ),
      ],
    );
  }

  Widget _selfieStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _notice(
            'Capture a current selfie with your face centered and well lit.'),
        const SizedBox(height: 16),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: FoodNovaColors.surface2,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: FoodNovaColors.border),
            ),
            child: _selfie == null
                ? const Center(
                    child: Icon(Icons.camera_alt_rounded, size: 54),
                  )
                : ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.file(File(_selfie!.path), fit: BoxFit.cover),
                  ),
          ),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: _loading ? null : _captureSelfie,
          icon: const Icon(Icons.photo_camera_rounded),
          label: Text(_selfie == null ? 'Capture Selfie' : 'Retake Selfie'),
        ),
      ],
    );
  }

  Widget _documentStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey('document_type_$_documentType'),
          initialValue: _documentType,
          decoration: _decoration('Document Type'),
          items: const [
            DropdownMenuItem(
              value: 'driver_license',
              child: Text("Driver's License"),
            ),
            DropdownMenuItem(value: 'voters_card', child: Text("Voter's Card")),
            DropdownMenuItem(
              value: 'international_passport',
              child: Text('International Passport'),
            ),
          ],
          onChanged: _loading
              ? null
              : (value) {
                  if (value == null) return;
                  setState(() => _documentType = value);
                  debugPrint('DOCUMENT_TYPE_SELECTED value=$value');
                  _saveDraft();
                },
          validator: (value) {
            if (value == null || !_documentTypes.contains(value)) {
              return 'Select a valid document type.';
            }
            return null;
          },
        ),
        const SizedBox(height: 14),
        _notice(_governmentId == null
            ? 'Upload one government ID document.'
            : 'Selected: ${_governmentId!.name}'),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: _loading ? null : _pickDocument,
          icon: const Icon(Icons.upload_file_rounded),
          label: const Text('Choose Document'),
        ),
      ],
    );
  }

  Widget _termsStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _legalBlock('Rider Agreement',
            'Deliveries must be completed honestly, safely, and only through approved FoodNova workflows.'),
        const SizedBox(height: 12),
        _legalBlock('Privacy Policy',
            'FoodNova uses submitted identity, location, and delivery data to verify and operate dispatch services.'),
        const SizedBox(height: 14),
        CheckboxListTile(
          value: _termsAccepted,
          onChanged: _loading
              ? null
              : (value) {
                  setState(() => _termsAccepted = value == true);
                  _saveDraft();
                },
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'I agree to the Terms & Conditions.',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }

  Widget _reviewStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _reviewRow('Email', _text('email')),
        _reviewRow('Verified Name', _identity?.fullName ?? ''),
        _reviewRow('Date of Birth', _identity?.dateOfBirth ?? ''),
        _reviewRow('Gender', _identity?.gender ?? ''),
        _reviewRow('Phone', _text('phone')),
        _reviewRow('Address',
            '${_text('address')}, ${_text('city')}, ${_text('state')}'),
        _reviewRow('Emergency Contact',
            '${_text('emergency_name')} - ${_text('emergency_phone')}'),
        _reviewRow('Selfie', _selfie == null ? 'Not captured' : 'Captured'),
        _reviewRow('Government ID',
            _governmentId == null ? 'Not uploaded' : _governmentId!.name),
      ],
    );
  }

  Widget _submittedStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Icon(Icons.check_circle_rounded,
            color: FoodNovaColors.success, size: 76),
        const SizedBox(height: 16),
        Text(
          'Application Submitted',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: FoodNovaColors.primaryDark,
                fontWeight: FontWeight.w900,
              ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Your account has been created successfully. Your documents are under review.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: FoodNovaColors.secondaryText,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 16),
        _notice('Status: Pending Approval'),
      ],
    );
  }

  Widget _identityPanel(NinVerificationResult identity) {
    return _notice(
      [
        'Name: ${identity.fullName}',
        'DOB: ${identity.dateOfBirth}',
        'Gender: ${identity.gender}',
      ].where((value) => !value.endsWith(': ')).join('\n'),
    );
  }

  Widget _field(
    String key, {
    required String label,
    bool obscure = false,
    TextInputType? keyboardType,
    int? maxLength,
    List<TextInputFormatter>? inputFormatters,
  }) {
    return TextFormField(
      controller: _controllers[key],
      obscureText: obscure,
      keyboardType: keyboardType,
      maxLength: maxLength,
      inputFormatters: inputFormatters,
      textInputAction: TextInputAction.next,
      cursorColor: FoodNovaColors.primaryDark,
      style: const TextStyle(
        color: FoodNovaColors.primaryDark,
        fontWeight: FontWeight.w800,
      ),
      decoration: _decoration(label),
      validator: (value) => _validate(key, value ?? ''),
      onChanged: (_) => _saveDraft(),
    );
  }

  InputDecoration _decoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(
        color: FoodNovaColors.secondaryText,
        fontWeight: FontWeight.w700,
      ),
      floatingLabelStyle: const TextStyle(
        color: FoodNovaColors.primaryDark,
        fontWeight: FontWeight.w900,
      ),
      hintStyle: const TextStyle(
        color: FoodNovaColors.secondaryText,
        fontWeight: FontWeight.w700,
      ),
      filled: true,
      fillColor: Colors.white,
      counterText: '',
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FoodNovaColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FoodNovaColors.primary, width: 1.5),
      ),
    );
  }

  String? _validate(String key, String value) {
    final text = value.trim();
    if (_step == _StepId.account) {
      if (key == 'email' &&
          !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) {
        return 'Enter a valid email address.';
      }
      if (key == 'password' && !_strongPassword(text)) {
        return 'Use at least 8 characters with letters and numbers.';
      }
      if (key == 'confirm_password' && text != _text('password')) {
        return 'Passwords do not match.';
      }
    }
    if (_step == _StepId.otp && key == 'otp' && text.length != 6) {
      return 'Enter the 6-digit OTP.';
    }
    if (_step == _StepId.nin && key == 'nin' && text.length != 11) {
      return 'Enter your 11-digit NIN.';
    }
    if (_step == _StepId.personal &&
        [
          'phone',
          'address',
          'city',
          'state',
          'emergency_name',
          'emergency_phone'
        ].contains(key) &&
        text.isEmpty) {
      return 'Required.';
    }
    return null;
  }

  bool _strongPassword(String value) {
    return value.length >= 8 &&
        RegExp(r'[A-Za-z]').hasMatch(value) &&
        RegExp(r'\d').hasMatch(value);
  }

  Widget _card({Key? key, required Widget child}) {
    return Container(
      key: key,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: FoodNovaColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .06),
            blurRadius: 22,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _notice(String text, {bool error = false}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: error ? const Color(0xFFFFF1F1) : FoodNovaColors.surface2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: error ? FoodNovaColors.danger : FoodNovaColors.border,
        ),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: error ? FoodNovaColors.danger : FoodNovaColors.primaryDark,
          fontWeight: FontWeight.w800,
          height: 1.35,
        ),
      ),
    );
  }

  Widget _legalBlock(String title, String body) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: FoodNovaColors.surface2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: FoodNovaColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(
              body,
              style: const TextStyle(color: FoodNovaColors.secondaryText),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 150,
            child: Text(
              label,
              style: const TextStyle(
                color: FoodNovaColors.secondaryText,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value.trim().isEmpty ? 'Not provided' : value,
              style: const TextStyle(
                color: FoodNovaColors.primaryDark,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _text(String key) => _controllers[key]?.text.trim() ?? '';

  String _friendlyError(Object error) {
    if (error is DioException) return apiMessage(error);
    final text = error.toString();
    final match = RegExp(r'detail: ([^,}]+)').firstMatch(text);
    if (match != null) return match.group(1)!.trim();
    return text.replaceFirst('Exception: ', '').trim();
  }
}
