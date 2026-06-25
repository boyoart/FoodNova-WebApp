import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/app_config.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../auth/data/auth_repository.dart';
import '../../delivery/data/dispatch_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(riderProfileProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/dashboard');
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Rider profile')),
        body: profile.when(
          data: (rider) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              FnCard(
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 34,
                      backgroundImage: rider.raw['profile_picture'] == null
                          ? null
                          : NetworkImage(
                              AppConfig.resolveMediaUrl(
                                '${rider.raw['profile_picture']}',
                              ),
                            ),
                      child: rider.raw['profile_picture'] == null
                          ? const Icon(Icons.person)
                          : null,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rider.name,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          Text(rider.email),
                          Text(rider.phone),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _SectionTitle('Verified details'),
              _Detail(label: 'Account Status', value: rider.accountStatus),
              _Detail(label: 'KYC Status', value: rider.kycStatus),
              _Detail(
                label: 'NIN Status',
                value:
                    '${rider.raw['nin_status'] ?? rider.raw['nin_verified'] ?? 'Pending'}',
              ),
              _Detail(
                label: 'Verified Name',
                value: '${rider.raw['verified_first_name'] ?? ''} ${rider.raw['verified_surname'] ?? ''}'
                        .trim()
                        .isEmpty
                    ? rider.name
                    : '${rider.raw['verified_first_name'] ?? ''} ${rider.raw['verified_surname'] ?? ''}'
                        .trim(),
              ),
              _Detail(
                label: 'Verified Phone',
                value: '${rider.raw['verified_phone'] ?? rider.phone}',
              ),
              const SizedBox(height: 12),
              _SectionTitle('Vehicle information'),
              _Detail(
                label: 'Vehicle Type',
                value: rider.vehicleType.isEmpty
                    ? 'Not provided'
                    : rider.vehicleType,
              ),
              _Detail(
                label: 'Make / Model',
                value: [rider.vehicleMake, rider.vehicleModel]
                        .where((part) => part.trim().isNotEmpty)
                        .join(' ')
                        .trim()
                        .isEmpty
                    ? 'Not provided'
                    : [rider.vehicleMake, rider.vehicleModel]
                        .where((part) => part.trim().isNotEmpty)
                        .join(' '),
              ),
              _Detail(
                label: 'Color',
                value: rider.vehicleColor.isEmpty
                    ? 'Not provided'
                    : rider.vehicleColor,
              ),
              _Detail(
                label: 'Plate Number',
                value: rider.plateNumber.isEmpty
                    ? 'Not provided'
                    : rider.plateNumber,
              ),
              _Detail(
                label: 'Vehicle Photo',
                value: '${rider.raw['vehicle_photo_url'] ?? ''}'.trim().isEmpty
                    ? 'Optional'
                    : 'Uploaded',
              ),
              const SizedBox(height: 12),
              _SectionTitle('Emergency contact'),
              _Detail(
                label: 'Name',
                value: '${rider.raw['emergency_contact_name'] ?? ''}'.isEmpty
                    ? 'Not provided'
                    : '${rider.raw['emergency_contact_name']}',
              ),
              _Detail(
                label: 'Phone',
                value: '${rider.raw['emergency_contact_phone'] ?? ''}'.isEmpty
                    ? 'Not provided'
                    : '${rider.raw['emergency_contact_phone']}',
              ),
              _Detail(
                label: 'Relationship',
                value: '${rider.raw['emergency_contact_relationship'] ?? ''}'
                        .isEmpty
                    ? 'Not provided'
                    : '${rider.raw['emergency_contact_relationship']}',
              ),
              const SizedBox(height: 12),
              _SectionTitle('Uploaded documents'),
              _Detail(
                label: 'Selfie',
                value: '${rider.raw['selfie_url'] ?? ''}'.trim().isEmpty
                    ? 'Missing'
                    : 'Uploaded',
              ),
              _Detail(
                label: 'Government ID',
                value: '${rider.raw['id_document_url'] ?? ''}'.trim().isEmpty
                    ? 'Missing'
                    : 'Uploaded',
              ),
              const SizedBox(height: 12),
              _SectionTitle('Support'),
              _Detail(label: 'Support Email', value: AppConfig.supportEmail),
              _Detail(label: 'App Version', value: '1.0.0'),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: () async {
                  await ref.read(authRepositoryProvider).logout();
                  if (context.mounted) context.go('/login');
                },
                icon: const Icon(Icons.logout),
                label: const Text('Logout'),
              ),
            ],
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 2),
      child: Text(
        text,
        style: Theme.of(context)
            .textTheme
            .titleMedium
            ?.copyWith(fontWeight: FontWeight.w900),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FnCard(
        child: Row(
          children: [
            Expanded(child: Text(label)),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
