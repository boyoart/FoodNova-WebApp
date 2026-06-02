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
    'confirm_password': TextEditingController(),
    'home_address': TextEditingController(),
    'emergency_contact_name': TextEditingController(),
    'emergency_contact_phone': TextEditingController(),
    'nin_number': TextEditingController(),
    'id_number': TextEditingController(),
    'vehicle_type': TextEditingController(text: 'Motorcycle'),
    'plate_number': TextEditingController(),
    'driver_license_number': TextEditingController(),
  };
  String idType = 'National ID';
  bool ninConsent = false;
  bool verifyingNin = false;
  bool loading = false;
  String message = '';
  String verificationMessage = '';
  NinVerificationResult? verifiedNin;
  XFile? selfie;
  XFile? idDocument;
  XFile? vehiclePhoto;

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
            const Center(child: BrandLogo(width: 190, height: 74)),
            const SizedBox(height: 16),
            const FnCard(
              child: Text(
                'Complete rider KYC with a verified NIN. Your account remains pending until FoodNova admin approval.',
              ),
            ),
            const SizedBox(height: 18),
            _sectionTitle('Account'),
            _field('full_name', readOnly: verified),
            _field('phone',
                keyboardType: TextInputType.phone, readOnly: verified),
            _field('email', keyboardType: TextInputType.emailAddress),
            _field('password', obscure: true),
            _field('confirm_password', obscure: true),
            _sectionTitle('Identity Verification'),
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
              onChanged: (value) => setState(() => ninConsent = value ?? false),
              title: const Text('I consent to FoodNova verifying my NIN.'),
              subtitle: const Text(
                'This is required for rider identity and operational review.',
              ),
            ),
            FilledButton.icon(
              onPressed: verifyingNin || verified ? null : _verifyNin,
              icon: const Icon(Icons.verified_user_outlined),
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
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: idType,
              decoration:
                  const InputDecoration(labelText: 'Government ID Type'),
              items: const [
                DropdownMenuItem(
                    value: 'National ID', child: Text('National ID')),
                DropdownMenuItem(
                  value: 'Driver License',
                  child: Text('Driver License'),
                ),
                DropdownMenuItem(value: 'Passport', child: Text('Passport')),
                DropdownMenuItem(
                    value: 'Voter Card', child: Text('Voter Card')),
              ],
              onChanged: (value) => setState(() => idType = value ?? idType),
            ),
            const SizedBox(height: 12),
            _field('id_number'),
            _sectionTitle('Address and Emergency'),
            _field('home_address', minLines: 2),
            _field('emergency_contact_name'),
            _field('emergency_contact_phone',
                keyboardType: TextInputType.phone),
            _sectionTitle('Vehicle'),
            _field('vehicle_type'),
            _field('plate_number'),
            _field('driver_license_number'),
            _sectionTitle('Documents'),
            _UploadTile(
              title: 'Live Selfie',
              subtitle: 'Use camera for a clear front-facing rider selfie.',
              file: selfie,
              icon: Icons.camera_front_outlined,
              onTap: () => _pickFile('selfie', ImageSource.camera),
            ),
            _UploadTile(
              title: 'Government ID Upload',
              subtitle: 'Upload a clear image of your selected ID document.',
              file: idDocument,
              icon: Icons.badge_outlined,
              onTap: () => _pickFile('id_document', ImageSource.gallery),
            ),
            _UploadTile(
              title: 'Vehicle Photo',
              subtitle: 'Upload a clear photo of the delivery vehicle.',
              file: vehiclePhoto,
              icon: Icons.two_wheeler_outlined,
              onTap: () => _pickFile('vehicle_photo', ImageSource.gallery),
            ),
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
              child: Text(loading ? 'Submitting...' : 'Submit for approval'),
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
    int minLines = 1,
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
          minLines: minLines,
          maxLines: obscure ? 1 : minLines,
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
            if (key == 'confirm_password' &&
                text != fields['password']!.text.trim()) {
              return 'Passwords do not match';
            }
            if (key == 'nin_number' &&
                text.replaceAll(RegExp(r'\D'), '').length != 11) {
              return 'NIN must be exactly 11 digits';
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
    print('VERIFY_NIN_START nin_length=${nin.length}');
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
        print('VERIFY_NIN_FAILURE message=${result.message}');
        setState(() {
          verificationMessage = result.message.isEmpty
              ? 'NIN verification failed.'
              : result.message;
        });
        return;
      }
      print('VERIFY_NIN_SUCCESS nin_last4=${result.ninLast4} full_name=${result.fullName}');
      final name = result.fullName;
      if (name.isNotEmpty) fields['full_name']!.text = name;
      if (result.phone.isNotEmpty && fields['phone']!.text.trim().isEmpty) {
        fields['phone']!.text = result.phone;
      }
      if (result.address.isNotEmpty &&
          fields['home_address']!.text.trim().isEmpty) {
        fields['home_address']!.text = result.address;
      }
      setState(() {
        verifiedNin = result;
        verificationMessage = '';
      });
    } catch (e) {
      if (!mounted) return;
      print('VERIFY_NIN_FAILURE error=$e');
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
      if (type == 'id_document') idDocument = file;
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
      final payload = <String, dynamic>{
        for (final entry in fields.entries) entry.key: entry.value.text.trim(),
      };
      payload['nin_number'] =
          fields['nin_number']!.text.replaceAll(RegExp(r'\D'), '');
      payload['nin_consent'] = ninConsent;
      payload['id_type'] = idType;
      await ref.read(authRepositoryProvider).signup(
            fields: payload,
            selfiePath: selfie!.path,
            idDocumentPath: idDocument!.path,
            vehiclePhotoPath: vehiclePhoto!.path,
          );
      if (!mounted) return;
      setState(
        () => message =
            'Identity verified and submitted. FoodNova admin will review your rider account.',
      );
      // CRITICAL: Do NOT redirect immediately. Stay on signup screen to show success message.
      // Only redirect after a brief delay, allowing user to see the success message.
      await Future.delayed(const Duration(milliseconds: 1500));
      if (!mounted) return;
      print('RIDER_ONBOARDING_COMPLETE_REDIRECT_TO_LOGIN');
      context.go('/login');
    } catch (e) {
      if (!mounted) return;
      setState(() => message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
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
    if (idDocument == null) return 'Upload your government ID document.';
    if (vehiclePhoto == null) return 'Upload your vehicle photo.';
    return null;
  }

  String _friendlyError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map) {
        final providerStatus = data['provider_status'];
        final providerResponse = data['provider_response'];
        final message = data['message'];
        if (providerStatus != null || providerResponse != null) {
          return [
            if (message != null && '$message'.trim().isNotEmpty) '$message',
            if (providerStatus != null) 'Provider status: $providerStatus',
            if (providerResponse != null &&
                '$providerResponse'.trim().isNotEmpty)
              'Provider response: $providerResponse',
          ].join('\n');
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

  String _label(String key) => key
      .split('_')
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
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
      ('State', result.state),
      ('Address', result.address),
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
                  'NIN Verified Successfully${result.ninLast4.isEmpty ? '' : ' • ${result.ninLast4}'}',
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
            'Verified identity fields are locked for rider safety review.',
            style: TextStyle(color: FoodNovaColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
