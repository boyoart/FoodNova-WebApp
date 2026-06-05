import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import 'onboarding_progress_stepper.dart';

class PendingReviewScreen extends ConsumerWidget {
  const PendingReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final diagnostics = ref.watch(_pendingReviewDiagnosticsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Application Submitted')),
      body: diagnostics.when(
        data: (data) {
          final worker = data.worker;
          final riderName = '${worker['full_name'] ?? worker['name'] ?? ''}';
          final status = '${worker['kyc_status'] ?? data.approvalStatus}';
          final createdAt = '${worker['created_at'] ?? ''}';
          final currentStep = int.tryParse(
                '${worker['current_step'] ?? worker['onboarding_current_step'] ?? data.currentStep}',
              ) ??
              data.currentStep;
          final ninVerified = worker['nin_verified'] == true ||
              '${worker['nin_status']}'.toLowerCase() == 'verified';
          return ListView(
            padding: const EdgeInsets.all(22),
            children: [
              const Center(child: BrandLogo(width: 210, height: 82)),
              const SizedBox(height: 18),
              OnboardingProgressStepper(
                currentStep: currentStep,
                status: 'Awaiting FoodNova admin review',
              ),
              const SizedBox(height: 16),
              FnCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color:
                                FoodNovaColors.primary.withValues(alpha: .12),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.hourglass_top_outlined,
                            color: FoodNovaColors.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Application Submitted',
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Your application has been received and is awaiting review by the FoodNova team.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FnCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _StatusRow(
                      label: 'Rider Name',
                      value: riderName.trim().isEmpty
                          ? 'FoodNova Rider'
                          : riderName,
                    ),
                    _StatusRow(
                      label: 'Registration Date',
                      value: _formatDate(createdAt),
                    ),
                    _StatusRow(
                      label: 'Verification Status',
                      value: ninVerified
                          ? 'NIN Verified Successfully'
                          : 'NIN submitted',
                      valueColor: ninVerified
                          ? FoodNovaColors.success
                          : FoodNovaColors.warning,
                    ),
                    _StatusRow(
                      label: 'Approval Status',
                      value: status.trim().isEmpty ? 'PENDING_REVIEW' : status,
                      valueColor: FoodNovaColors.warning,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FnCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Dashboard access is locked until admin approval.',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Once approved, FoodNova will unlock dashboard, orders, deliveries, and earnings.',
                    ),
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      onPressed: () => context.go('/login'),
                      icon: const Icon(Icons.login_outlined),
                      label: const Text('Go to Login'),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
      ),
    );
  }
}

final _pendingReviewDiagnosticsProvider =
    FutureProvider<_PendingReviewData>((ref) async {
  final diagnostics =
      await ref.read(sessionControllerProvider.notifier).diagnostics();
  debugPrint('APP_RESTART_DETECTED pending_review_loaded=true');
  final rawResponse = '${diagnostics['last_api_response'] ?? ''}';
  Map<String, dynamic> body = {};
  if (rawResponse.trim().isNotEmpty) {
    try {
      body = Map<String, dynamic>.from(jsonDecode(rawResponse) as Map);
    } catch (_) {
      body = {};
    }
  }
  final worker = body['worker'] is Map
      ? Map<String, dynamic>.from(body['worker'] as Map)
      : body['data'] is Map
          ? Map<String, dynamic>.from(body['data'] as Map)
          : <String, dynamic>{};
  return _PendingReviewData(
    worker: worker,
    approvalStatus: '${diagnostics['approval_status'] ?? 'PENDING_REVIEW'}',
    currentStep: int.tryParse('${diagnostics['current_step'] ?? 5}') ?? 5,
  );
});

class _PendingReviewData {
  const _PendingReviewData({
    required this.worker,
    required this.approvalStatus,
    required this.currentStep,
  });

  final Map<String, dynamic> worker;
  final String approvalStatus;
  final int currentStep;
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: const TextStyle(
                color: FoodNovaColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: valueColor,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _formatDate(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return value.trim().isEmpty ? 'Just now' : value;
  return '${parsed.year.toString().padLeft(4, '0')}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')}';
}
