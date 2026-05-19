import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import '../core/theme/shadows.dart';
import 'brand_logo.dart';

class BrandAuthScaffold extends StatelessWidget {
  const BrandAuthScaffold({required this.child, this.footer, super.key});

  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [FoodNovaColors.surface2, FoodNovaColors.bg, Color(0xFFFFF8DA)],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight - 48),
                  child: Column(
                    children: [
                      const SizedBox(height: 10),
                      const BrandLogo(height: 82),
                      const SizedBox(height: 22),
                      Container(
                        constraints: const BoxConstraints(maxWidth: 520),
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          color: FoodNovaColors.surface,
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(color: FoodNovaColors.border),
                          boxShadow: FoodNovaShadows.soft,
                        ),
                        child: child,
                      ),
                      if (footer != null) ...[
                        const SizedBox(height: 18),
                        footer!,
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
