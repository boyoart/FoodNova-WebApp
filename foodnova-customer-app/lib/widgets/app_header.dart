import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import 'brand_logo.dart';

class AppHeader extends StatelessWidget {
  const AppHeader({this.greeting = 'Good day', this.subtitle, this.actions = const [], super.key});

  final String greeting;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const BrandLogo(height: 52),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(greeting, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900, color: FoodNovaColors.heading)),
              if (subtitle != null) Text(subtitle!, style: const TextStyle(color: FoodNovaColors.muted)),
            ],
          ),
        ),
        ...actions,
      ],
    );
  }
}
