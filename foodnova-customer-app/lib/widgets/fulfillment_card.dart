import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import 'pressable_card.dart';
import 'status_badge.dart';

class FulfillmentCard extends StatelessWidget {
  const FulfillmentCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.badges,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<String> badges;

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
                  child: Icon(icon, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: FoodNovaColors.muted, fontSize: 12)),
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
                for (final badge in badges) StatusBadge(label: badge, tone: FoodNovaColors.primary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
