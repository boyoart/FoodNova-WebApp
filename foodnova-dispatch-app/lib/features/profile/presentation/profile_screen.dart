import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/app_config.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../delivery/data/dispatch_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(riderProfileProvider);
    return Scaffold(
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
            _Detail(
              label: 'Vehicle Type',
              value: rider.vehicleType.isEmpty
                  ? 'Not provided'
                  : rider.vehicleType,
            ),
            _Detail(label: 'KYC Status', value: rider.kycStatus),
            _Detail(
              label: 'NIN Status',
              value:
                  '${rider.raw['nin_status'] ?? rider.raw['nin_verified'] ?? 'Pending'}',
            ),
            _Detail(label: 'Account Status', value: rider.accountStatus),
            _Detail(
              label: 'Supported Vehicles',
              value: 'Motorcycle, Bicycle, Car, Walking Courier',
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
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
