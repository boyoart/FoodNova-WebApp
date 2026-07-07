import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import '../core/theme/shadows.dart';

class PressableCard extends StatefulWidget {
  const PressableCard(
      {required this.child,
      this.onTap,
      this.padding = const EdgeInsets.all(16),
      super.key});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  @override
  State<PressableCard> createState() => _PressableCardState();
}

class _PressableCardState extends State<PressableCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) {
        if (mounted) setState(() => _pressed = true);
      },
      onTapCancel: () {
        if (mounted) setState(() => _pressed = false);
      },
      onTapUp: (_) {
        if (mounted) setState(() => _pressed = false);
      },
      child: AnimatedScale(
        scale: _pressed ? 0.985 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: FoodNovaColors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: FoodNovaColors.border),
            boxShadow: FoodNovaShadows.soft,
          ),
          child: Padding(padding: widget.padding, child: widget.child),
        ),
      ),
    );
  }
}
