import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import '../core/theme/spacing.dart';

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({required this.label, required this.onPressed, this.icon, super.key});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.chevron_right_rounded),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: FoodNovaColors.primary,
        side: const BorderSide(color: FoodNovaColors.primary),
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusPill)),
      ),
    );
  }
}
