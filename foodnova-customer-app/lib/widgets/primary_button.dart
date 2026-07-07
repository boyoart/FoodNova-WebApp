import 'package:flutter/material.dart';

import '../core/theme/colors.dart';

class PrimaryButton extends StatelessWidget {
  const PrimaryButton(
      {required this.label,
      required this.onPressed,
      this.icon,
      this.loading = false,
      super.key});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AnimatedOpacity(
      opacity: onPressed == null ? .64 : 1,
      duration: const Duration(milliseconds: 160),
      child: FilledButton.icon(
        onPressed: loading ? null : onPressed,
        icon: loading
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: scheme.onPrimary,
                ),
              )
            : Icon(icon ?? Icons.arrow_forward_rounded),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: FoodNovaColors.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
    );
  }
}
