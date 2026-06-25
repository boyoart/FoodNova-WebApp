import 'package:flutter/material.dart';

import '../../../core/theme/colors.dart';

const foodNovaOnboardingSteps = [
  'Create Account',
  'Verify Email',
  'NIN',
  'Personal Info',
  'Selfie',
  'Government ID',
  'Terms',
  'Review',
  'Submitted',
];

class OnboardingProgressStepper extends StatelessWidget {
  const OnboardingProgressStepper({
    super.key,
    required this.currentStep,
    this.status,
  });

  final int currentStep;
  final String? status;

  static const totalSteps = 9;

  @override
  Widget build(BuildContext context) {
    final step = currentStep.clamp(1, totalSteps).toInt();
    final percent = ((step / totalSteps) * 100).round();
    final rejected = RegExp('reject|declin|fail', caseSensitive: false)
        .hasMatch(status ?? '');
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 430;
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: FoodNovaColors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .05),
                blurRadius: 18,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Step $step of $totalSteps',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                          ),
                    ),
                  ),
                  Text(
                    '$percent% complete',
                    style: const TextStyle(
                      color: FoodNovaColors.primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              if (status != null && status!.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  status!,
                  style: const TextStyle(
                    color: FoodNovaColors.muted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: step / totalSteps,
                  minHeight: 8,
                  backgroundColor: FoodNovaColors.surface2,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    FoodNovaColors.primary,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              compact
                  ? Column(
                      children: [
                        for (var index = 0;
                            index < foodNovaOnboardingSteps.length;
                            index++)
                          _StepItem(
                            label: foodNovaOnboardingSteps[index],
                            index: index + 1,
                            complete: index + 1 <= step,
                            current: index + 1 == step,
                            rejected: rejected,
                            compact: true,
                          ),
                      ],
                    )
                  : Row(
                      children: [
                        for (var index = 0;
                            index < foodNovaOnboardingSteps.length;
                            index++)
                          Expanded(
                            child: _StepItem(
                              label: foodNovaOnboardingSteps[index],
                              index: index + 1,
                              complete: index + 1 <= step,
                              current: index + 1 == step,
                              rejected: rejected,
                              compact: false,
                            ),
                          ),
                      ],
                    ),
            ],
          ),
        );
      },
    );
  }
}

class _StepItem extends StatelessWidget {
  const _StepItem({
    required this.label,
    required this.index,
    required this.complete,
    required this.current,
    required this.rejected,
    required this.compact,
  });

  final String label;
  final int index;
  final bool complete;
  final bool current;
  final bool rejected;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = rejected
        ? FoodNovaColors.danger
        : complete
            ? FoodNovaColors.success
            : current
                ? FoodNovaColors.warning
                : FoodNovaColors.secondaryText;
    final markerFill = rejected
        ? FoodNovaColors.danger
        : complete
            ? FoodNovaColors.success
            : current
                ? FoodNovaColors.warning
                : FoodNovaColors.surface2;
    final markerTextColor = current && !complete && !rejected
        ? FoodNovaColors.primaryDark
        : Colors.white;
    final text = Text(
      label,
      maxLines: compact ? 2 : 3,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: color,
        fontSize: compact ? 13 : 11,
        fontWeight: complete ? FontWeight.w900 : FontWeight.w700,
      ),
    );
    final marker = Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: markerFill,
        shape: BoxShape.circle,
        border: Border.all(
          color: color,
        ),
      ),
      child: complete || rejected
          ? const Icon(Icons.check, size: 15, color: Colors.white)
          : Text(
              '$index',
              style: TextStyle(
                color: markerTextColor,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
    );
    if (compact) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          children: [
            marker,
            const SizedBox(width: 10),
            Expanded(child: text),
          ],
        ),
      );
    }
    return Column(
      children: [
        marker,
        const SizedBox(height: 8),
        text,
      ],
    );
  }
}
