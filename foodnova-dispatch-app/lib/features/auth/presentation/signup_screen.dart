import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../data/auth_repository.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final formKey = GlobalKey<FormState>();
  final picker = ImagePicker();
  final fields = <String, TextEditingController>{
    'full_name': TextEditingController(),
    'phone': TextEditingController(),
    'email': TextEditingController(),
    'password': TextEditingController(),
    'nin_number': TextEditingController(),
    'operating_city': TextEditingController(),
    'emergency_contact_name': TextEditingController(),
    'emergency_contact_phone': TextEditingController(),
    'emergency_contact_relationship': TextEditingController(),
    'motorcycle_brand': TextEditingController(),
    'plate_number': TextEditingController(),
  };

  String riderType = 'motorcycle';
  bool ninConsent = false;
  bool verifyingNin = false;
  bool loading = false;
  String message = '';
  String verificationMessage = '';
  NinVerificationResult? verifiedNin;
  XFile? selfie;
  XFile? vehiclePhoto;

  bool get isMotorcycleRider => riderType == 'motorcycle';
  bool get isWalkingMessenger => riderType == 'walking';

  @override
  void dispose() {
    for (final controller in fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final verified = verifiedNin?.verified == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Rider onboarding')),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const Center(child: BrandLogo(width: 210, height: 82)),
            const SizedBox(height: 18),
            FnCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Apply to deliver with FoodNova',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Register, verify your NIN, upload a live selfie, then wait for admin approval before dashboard access.',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            _sectionTitle('Account'),
            _field('full_name',
                readOnly:
                    verified && fields['full_name']!.text.trim().isNotEmpty),
            _field('phone', keyboardType: TextInputType.phone),
            _field('email', keyboardType: TextInputType.emailAddress),
            _field('password', obscure: true),
            _sectionTitle('NIN Verification'),
            _field(
              'nin_number',
              keyboardType: TextInputType.number,
              maxLength: 11,
              readOnly: verified,
              onChanged: (_) {
                if (verifiedNin != null) {
                  setState(() {
                    verifiedNin = null;
                    verificationMessage = '';
                  });
                }
              },
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: ninConsent,
              onChanged: verified
                  ? null
                  : (value) => setState(() => ninConsent = value ?? false),
              title: const Text('I consent to FoodNova verifying my NIN.'),
              subtitle:
                  const Text('Required for rider identity and safety review.'),
            ),
            FilledButton.icon(
              onPressed: verifyingNin || verified ? null : _verifyNin,
              icon: verifyingNin
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.verified_user_outlined),
              label: Text(verifyingNin ? 'Verifying...' : 'Verify NIN'),
            ),
            if (verified)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _VerifiedIdentityCard(
                  result: verifiedNin!,
                  onReset: () => setState(() {
                    verifiedNin = null;
                    verificationMessage = '';
                  }),
                ),
              )
            else if (verificationMessage.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  verificationMessage,
                  style: const TextStyle(color: FoodNovaColors.danger),
                ),
              ),
            _sectionTitle('Delivery Profile'),
            DropdownButtonFormField<String>(
              initialValue: riderType,
              decoration: const InputDecoration(labelText: 'Rider Type'),
              items: const [
                DropdownMenuItem(
                  value: 'motorcycle',
                  child: Text('Motorcycle Rider'),
                ),
                DropdownMenuItem(
                  value: 'bicycle',
                  child: Text('Bicycle Rider'),
                ),
                DropdownMenuItem(
                  value: 'walking',
                  child: Text('Walking Messenger'),
                ),
              ],
              onChanged: (value) =>
                  setState(() => riderType = value ?? riderType),
            ),
            const SizedBox(height: 12),
            _field('operating_city'),
            if (isMotorcycleRider) ...[
              _field('motorcycle_brand'),
              _field('plate_number'),
              _UploadTile(
                title: 'Vehicle Photo',
                subtitle: 'Optional. Upload a clear motorcycle photo.',
                file: vehiclePhoto,
                icon: Icons.two_wheeler_outlined,
                onTap: () => _pickFile('vehicle_photo', ImageSource.gallery),
              ),
            ],
            _sectionTitle('Selfie and Emergency Contact'),
            _UploadTile(
              title: 'Live Selfie',
              subtitle: 'Use camera for a clear front-facing rider selfie.',
              file: selfie,
              icon: Icons.camera_front_outlined,
              onTap: () => _pickFile('selfie', ImageSource.camera),
            ),
            _field('emergency_contact_name'),
            _field('emergency_contact_phone',
                keyboardType: TextInputType.phone),
            _field('emergency_contact_relationship'),
            if (message.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  message,
                  style: TextStyle(
                    color: message.toLowerCase().contains('submitted')
                        ? FoodNovaColors.success
                        : FoodNovaColors.danger,
                  ),
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: loading ? null : _submit,
              child: Text(loading ? 'Submitting...' : 'Submit application'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 10),
        child: Text(
          title,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
      );

  Widget _field(
    String key, {
    bool obscure = false,
    TextInputType? keyboardType,
    int? maxLength,
    bool readOnly = false,
    ValueChanged<String>? onChanged,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: fields[key],
          obscureText: obscure,
          keyboardType: keyboardType,
          maxLength: maxLength,
          readOnly: readOnly,
          decoration: InputDecoration(
            labelText: _label(key),
            suffixIcon:
                readOnly ? const Icon(Icons.lock_outline, size: 18) : null,
          ),
          onChanged: onChanged,
          validator: (value) {
            final text = (value ?? '').trim();
            if (text.isEmpty) return '${_label(key)} is required';
            if (key == 'email' && !text.contains('@')) {
              return 'Enter a valid email address';
            }
            if (key == 'password' && text.length < 6) {
              return 'Password must be at least 6 characters';
            }
            if (key == 'nin_number' &&
                text.replaceAll(RegExp(r'\D'), '').length != 11) {
              return 'NIN must be exactly 11 digits';
            }
            if (key == 'phone' || key == 'emergency_contact_phone') {
              if (text.replaceAll(RegExp(r'\D'), '').length < 10) {
                return 'Enter a valid phone number';
              }
            }
            return null;
          },
        ),
      );

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
      final result = await ref.read(authRepositoryProvider).verifyNin(
            nin: nin,
            consent: ninConsent,
          );
      if (!mounted) return;
      if (!result.verified) {
        debugPrint('VERIFY_NIN_FAILURE message=${result.message}');
        setState(() {
          verificationMessage = result.message.isEmpty
              ? 'NIN verification failed.'
              : result.message;
        });
        return;
      }
      debugPrint(
          'VERIFY_NIN_SUCCESS nin_last4=${result.ninLast4} full_name=${result.fullName}');
      if (result.fullName.isNotEmpty) {
        fields['full_name']!.text = result.fullName;
      }
      if (result.phone.isNotEmpty && fields['phone']!.text.trim().isEmpty) {
        fields['phone']!.text = result.phone;
      }
      setState(() {
        verifiedNin = result;
        verificationMessage = '';
      });
    } catch (e) {
      if (!mounted) return;
      debugPrint('VERIFY_NIN_FAILURE error=$e');
      setState(() => verificationMessage = _friendlyError(e));
    } finally {
      if (mounted) setState(() => verifyingNin = false);
    }
  }

  Future<void> _pickFile(String type, ImageSource source) async {
    final file = await picker.pickImage(source: source, imageQuality: 82);
    if (!mounted || file == null) return;
    setState(() {
      if (type == 'selfie') selfie = file;
      if (type == 'vehicle_photo') vehiclePhoto = file;
    });
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
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
      final payload = <String, dynamic>{
        'full_name': fields['full_name']!.text.trim(),
        'phone': fields['phone']!.text.trim(),
        'email': fields['email']!.text.trim(),
        'password': fields['password']!.text,
        'confirm_password': fields['password']!.text,
        'nin_number': nin,
        'nin_consent': ninConsent,
        'rider_type': riderType,
        'worker_type': isWalkingMessenger ? 'messenger' : 'rider',
        'operating_city': fields['operating_city']!.text.trim(),
        'home_address': fields['operating_city']!.text.trim(),
        'emergency_contact_name': fields['emergency_contact_name']!.text.trim(),
        'emergency_contact_phone':
            fields['emergency_contact_phone']!.text.trim(),
        'emergency_contact_relationship':
            fields['emergency_contact_relationship']!.text.trim(),
        'id_type': 'NIN',
        'id_number': nin,
        'vehicle_type': isMotorcycleRider
            ? fields['motorcycle_brand']!.text.trim()
            : isWalkingMessenger
                ? 'Walking Messenger'
                : 'Bicycle',
        'plate_number':
            isMotorcycleRider ? fields['plate_number']!.text.trim() : '',
        'driver_license_number': '',
      };
      await ref.read(authRepositoryProvider).signup(
            fields: payload,
            selfiePath: selfie!.path,
            vehiclePhotoPath: vehiclePhoto?.path,
          );
      if (!mounted) return;
      setState(
        () => message =
            'Application submitted. FoodNova admin will review your account before dashboard access.',
      );
      await Future.delayed(const Duration(milliseconds: 1500));
      if (!mounted) return;
      debugPrint('RIDER_ONBOARDING_COMPLETE_REDIRECT_TO_LOGIN');
      context.go('/login');
    } catch (e) {
      if (!mounted) return;
      setState(() => message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String? _submissionBlocker() {
    if (verifiedNin?.verified != true) {
      return 'Verify your NIN successfully before submitting onboarding.';
    }
    if (!ninConsent) return 'NIN verification consent is required.';
    if (selfie == null) return 'Capture a live selfie before submitting.';
    return null;
  }

  String _friendlyError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map) {
        final providerStatus = data['provider_status'];
        final providerResponse = data['provider_response'];
        final message = data['message'] ?? data['detail'];
        if (providerStatus != null || providerResponse != null) {
          return [
            if (message != null && '$message'.trim().isNotEmpty) '$message',
            if (providerStatus != null) 'Provider status: $providerStatus',
            if (providerResponse != null &&
                '$providerResponse'.trim().isNotEmpty)
              'Provider response: $providerResponse',
          ].join('\n');
        }
        if (message != null && '$message'.trim().isNotEmpty) {
          return '$message';
        }
      }
    }
    final message =
        apiMessage(error).replaceFirst(RegExp(r'^Exception:\s*'), '');
    if (message.contains('{') || message.contains('[')) {
      return 'FoodNova could not complete this step. Please check your details and try again.';
    }
    if (message.toLowerCase().contains('mobile phone')) {
      return 'Please complete rider onboarding from your Android dispatch app.';
    }
    return message;
  }

  String _label(String key) {
    const labels = {
      'full_name': 'Full Name',
      'phone': 'Phone Number',
      'email': 'Email',
      'password': 'Password',
      'nin_number': 'NIN Number',
      'operating_city': 'Operating City',
      'emergency_contact_name': 'Emergency Contact Name',
      'emergency_contact_phone': 'Emergency Contact Phone',
      'emergency_contact_relationship': 'Emergency Contact Relationship',
      'motorcycle_brand': 'Motorcycle Brand',
      'plate_number': 'Plate Number',
    };
    return labels[key] ?? key;
  }
}

class _UploadTile extends StatelessWidget {
  const _UploadTile({
    required this.title,
    required this.subtitle,
    required this.file,
    required this.icon,
    required this.onTap,
  });
  final String title;
  final String subtitle;
  final XFile? file;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: FnCard(
        child: ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon, color: FoodNovaColors.primary),
          title: Text(title),
          subtitle: Text(file == null ? subtitle : file!.name),
          trailing: file == null
              ? const Icon(Icons.add_circle_outline)
              : const Icon(Icons.check_circle, color: FoodNovaColors.success),
          onTap: onTap,
        ),
      ),
    );
  }
}

class _VerifiedIdentityCard extends StatelessWidget {
  const _VerifiedIdentityCard({required this.result, required this.onReset});
  final NinVerificationResult result;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('Full Name', result.fullName),
      ('Date of Birth', result.dateOfBirth),
      ('Gender', result.gender),
      ('Phone Number', result.phone),
    ];
    return FnCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified, color: FoodNovaColors.success),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'NIN Verified Successfully${result.ninLast4.isEmpty ? '' : ' - ${result.ninLast4}'}',
                  style: const TextStyle(
                    color: FoodNovaColors.success,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              TextButton(onPressed: onReset, child: const Text('Change')),
            ],
          ),
          const SizedBox(height: 10),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 116,
                    child: Text(
                      row.$1,
                      style: const TextStyle(color: FoodNovaColors.muted),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      row.$2.isEmpty ? 'Provided by NIN provider' : row.$2,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          const Text(
            'Verified identity fields are locked for FoodNova admin review.',
            style: TextStyle(color: FoodNovaColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
