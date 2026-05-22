import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../shared/models/product.dart';
import '../../../core/theme/shadows.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({required this.product, required this.onTap, required this.onAdd, super.key});

  final Product product;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    final outOfStock = product.stock <= 0;
    final lowStock = product.stock > 0 && product.stock <= 5;
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          color: FoodNovaColors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: FoodNovaColors.border),
          boxShadow: FoodNovaShadows.soft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: product.imageUrl.isEmpty
                        ? Container(
                            color: FoodNovaColors.surface2,
                            child: const Center(child: Icon(Icons.shopping_basket_rounded, color: FoodNovaColors.primary, size: 34)),
                          )
                        : CachedNetworkImage(
                            imageUrl: product.imageUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(color: FoodNovaColors.surface2),
                            errorWidget: (_, __, ___) => Container(
                              color: FoodNovaColors.surface2,
                              child: const Center(child: Icon(Icons.image_not_supported_rounded, color: FoodNovaColors.muted)),
                            ),
                          ),
                  ),
                  Positioned(
                    top: 10,
                    left: 10,
                    child: _StockPill(
                      label: outOfStock ? 'Out' : lowStock ? '${product.stock} left' : 'In stock',
                      tone: outOfStock ? FoodNovaColors.danger : lowStock ? FoodNovaColors.warning : FoodNovaColors.success,
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Material(
                      color: Colors.white.withOpacity(.92),
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Wishlist sync is coming after backend support is enabled.')),
                        ),
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.favorite_border_rounded, size: 19, color: FoodNovaColors.primary),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: FoodNovaColors.text, fontWeight: FontWeight.w900, height: 1.08),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    product.category.isEmpty ? 'FoodNova grocery' : product.category,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: FoodNovaColors.muted, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          currency.format(product.price),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: FoodNovaColors.primary, fontWeight: FontWeight.w900),
                        ),
                      ),
                      _QuickAddButton(onTap: outOfStock ? null : onAdd),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAddButton extends StatefulWidget {
  const _QuickAddButton({required this.onTap});

  final VoidCallback? onTap;

  @override
  State<_QuickAddButton> createState() => _QuickAddButtonState();
}

class _QuickAddButtonState extends State<_QuickAddButton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 220));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(begin: 1, end: .88).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut)),
      child: Material(
        color: widget.onTap == null ? FoodNovaColors.border : FoodNovaColors.primary,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: widget.onTap == null
              ? null
              : () async {
                  await _controller.forward();
                  await _controller.reverse();
                  widget.onTap?.call();
                },
          child: const SizedBox(
            width: 42,
            height: 38,
            child: Icon(Icons.add_rounded, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

class _StockPill extends StatelessWidget {
  const _StockPill({required this.label, required this.tone});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: tone.withOpacity(.92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }
}
