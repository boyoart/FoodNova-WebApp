import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../shared/models/product.dart';
import '../../../widgets/pressable_card.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({required this.product, required this.onTap, required this.onAdd, super.key});

  final Product product;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return PressableCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: product.imageUrl.isEmpty
                    ? Container(
                        color: FoodNovaColors.surface2,
                        child: const Center(child: Icon(Icons.shopping_basket_rounded, color: FoodNovaColors.primary)),
                      )
                    : CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        placeholder: (_, __) => Container(color: FoodNovaColors.surface2),
                        errorWidget: (_, __, ___) => Container(
                          color: FoodNovaColors.surface2,
                          child: const Center(child: Icon(Icons.image_not_supported_rounded, color: FoodNovaColors.muted)),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              product.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: FoodNovaColors.text, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 3),
            Text(
              currency.format(product.price),
              style: const TextStyle(color: FoodNovaColors.primary, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Add'),
                style: FilledButton.styleFrom(
                  backgroundColor: FoodNovaColors.primary,
                  foregroundColor: FoodNovaColors.cream,
                  minimumSize: const Size.fromHeight(42),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
