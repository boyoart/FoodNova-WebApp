import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import 'pressable_card.dart';

class VendorCard extends StatelessWidget {
  const VendorCard({required this.name, required this.caption, super.key});

  final String name;
  final String caption;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 190,
      child: PressableCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const CircleAvatar(backgroundColor: FoodNovaColors.surface2, child: Icon(Icons.storefront_rounded, color: FoodNovaColors.primary)),
            const SizedBox(height: 12),
            Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(caption, style: const TextStyle(color: FoodNovaColors.muted, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
