import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import 'pressable_card.dart';
import 'status_badge.dart';

class VendorCard extends StatelessWidget {
  const VendorCard({
    required this.name,
    required this.caption,
    this.rating = '4.8',
    this.eta = '15-25 min',
    this.fee = 'NGN 600',
    super.key,
  });

  final String name;
  final String caption;
  final String rating;
  final String eta;
  final String fee;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 248,
      child: PressableCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: const LinearGradient(colors: [FoodNovaColors.primary, FoodNovaColors.success]),
                  ),
                  child: const Icon(Icons.storefront_rounded, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(caption, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: FoodNovaColors.muted, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
            const Spacer(),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusBadge(label: rating, tone: FoodNovaColors.accent),
                StatusBadge(label: eta, tone: FoodNovaColors.success),
                StatusBadge(label: fee, tone: FoodNovaColors.primary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
