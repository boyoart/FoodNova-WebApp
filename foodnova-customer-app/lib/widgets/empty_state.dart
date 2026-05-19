import 'package:flutter/material.dart';

import '../core/theme/colors.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({required this.title, required this.message, this.icon = Icons.inbox_rounded, super.key});

  final String title;
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(radius: 34, backgroundColor: FoodNovaColors.surface2, child: Icon(icon, color: FoodNovaColors.primary)),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: FoodNovaColors.muted)),
        ],
      ),
    );
  }
}
