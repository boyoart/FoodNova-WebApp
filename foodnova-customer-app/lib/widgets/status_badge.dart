import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import '../core/theme/spacing.dart';

class StatusBadge extends StatelessWidget {
  const StatusBadge(
      {required this.label, this.tone = FoodNovaColors.primary, super.key});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final readableTone =
        tone == FoodNovaColors.accent ? const Color(0xFF6F5900) : tone;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusPill),
        border: Border.all(color: tone.withValues(alpha: .18)),
      ),
      child: Text(label,
          style: TextStyle(
              color: readableTone, fontSize: 12, fontWeight: FontWeight.w900)),
    );
  }
}
