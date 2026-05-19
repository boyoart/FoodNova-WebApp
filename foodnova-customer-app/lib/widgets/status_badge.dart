import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import '../core/theme/spacing.dart';

class StatusBadge extends StatelessWidget {
  const StatusBadge({required this.label, this.tone = FoodNovaColors.primary, super.key});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: tone.withOpacity(.12),
        borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusPill),
        border: Border.all(color: tone.withOpacity(.18)),
      ),
      child: Text(label, style: TextStyle(color: tone, fontSize: 12, fontWeight: FontWeight.w900)),
    );
  }
}
