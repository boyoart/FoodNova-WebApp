import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../shared/models/product.dart';
import '../../../core/theme/shadows.dart';

class ProductCard extends StatelessWidget {
  const ProductCard(
      {required this.product,
      required this.onTap,
      required this.onAdd,
      this.quantity = 0,
      this.onIncrement,
      this.onDecrement,
      super.key});

  final Product product;
  final VoidCallback onTap;
  final VoidCallback onAdd;
  final int quantity;
  final VoidCallback? onIncrement;
  final VoidCallback? onDecrement;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    final outOfStock = product.stock <= 0;
    final lowStock = product.stock > 0 && product.stock <= 5;
    final sale = lowStock || product.type == 'pack';
    final showStepper = quantity > 0 && !product.hasVariants;
    return InkWell(
      borderRadius: BorderRadius.circular(26),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: scheme.outlineVariant),
          boxShadow: FoodNovaShadows.soft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 6,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: product.imageUrl.isEmpty
                        ? Container(
                            color: scheme.surfaceContainerHighest,
                            child: Center(
                                child: Icon(Icons.shopping_basket_rounded,
                                    color: scheme.primary, size: 34)),
                          )
                        : CachedNetworkImage(
                            imageUrl: product.imageUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(
                                color: scheme.surfaceContainerHighest),
                            errorWidget: (_, __, ___) => Container(
                              color: scheme.surfaceContainerHighest,
                              child: Center(
                                  child: Icon(Icons.image_not_supported_rounded,
                                      color: scheme.onSurfaceVariant)),
                            ),
                          ),
                  ),
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            scheme.shadow.withValues(alpha: .06),
                            Colors.transparent,
                            scheme.shadow.withValues(alpha: .18),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 10,
                    left: 10,
                    child: _StockPill(
                      label: outOfStock
                          ? 'Out'
                          : lowStock
                              ? '${product.stock} left'
                              : 'In stock',
                      tone: outOfStock
                          ? FoodNovaColors.danger
                          : lowStock
                              ? FoodNovaColors.warning
                              : FoodNovaColors.success,
                    ),
                  ),
                  if (sale)
                    Positioned(
                      top: 10,
                      right: 10,
                      child: _SalePill(
                          label: product.type == 'pack' ? 'Combo' : 'Deal'),
                    ),
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: _FavoriteButton(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(13, 12, 13, 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _DeliveryBadge(),
                  const SizedBox(height: 8),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: scheme.onSurface,
                        fontWeight: FontWeight.w900,
                        height: 1.08),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    product.category.isEmpty
                        ? 'FoodNova grocery'
                        : product.category,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          product.hasVariants
                              ? 'From ${currency.format(product.startingPrice)}'
                              : currency.format(product.price),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: FoodNovaColors.primary,
                              fontWeight: FontWeight.w900),
                        ),
                      ),
                      showStepper
                          ? _QuantityStepper(
                              quantity: quantity,
                              onIncrement: onIncrement ?? onAdd,
                              onDecrement: onDecrement,
                            )
                          : _QuickAddButton(
                              onTap: outOfStock
                                  ? null
                                  : product.hasVariants
                                      ? onTap
                                      : onAdd),
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

class _DeliveryBadge extends StatelessWidget {
  const _DeliveryBadge();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'Fast delivery',
        style: TextStyle(
          color: scheme.primary,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _FavoriteButton extends StatefulWidget {
  @override
  State<_FavoriteButton> createState() => _FavoriteButtonState();
}

class _FavoriteButtonState extends State<_FavoriteButton> {
  bool _selected = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface.withValues(alpha: .92),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => setState(() => _selected = !_selected),
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            _selected ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            size: 19,
            color: _selected ? FoodNovaColors.danger : scheme.primary,
          ),
        ),
      ),
    );
  }
}

class _SalePill extends StatelessWidget {
  const _SalePill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: scheme.secondary,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: scheme.onSecondary,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({
    required this.quantity,
    required this.onIncrement,
    required this.onDecrement,
  });

  final int quantity;
  final VoidCallback onIncrement;
  final VoidCallback? onDecrement;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(icon: Icons.remove_rounded, onTap: onDecrement),
          Text(
            '$quantity',
            style: TextStyle(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w900,
            ),
          ),
          _StepButton(icon: Icons.add_rounded, onTap: onIncrement),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: SizedBox(
        width: 28,
        height: 34,
        child: Icon(icon, color: scheme.onPrimary, size: 18),
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

class _QuickAddButtonState extends State<_QuickAddButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 220));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(begin: 1, end: .88)
          .animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut)),
      child: Material(
        color: widget.onTap == null
            ? Theme.of(context).colorScheme.outlineVariant
            : Theme.of(context).colorScheme.primary,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: widget.onTap == null
              ? null
              : () async {
                  await _controller.forward();
                  if (!mounted) return;
                  await _controller.reverse();
                  if (!mounted) return;
                  widget.onTap?.call();
                },
          child: SizedBox(
            width: 42,
            height: 38,
            child: Icon(Icons.add_rounded,
                color: Theme.of(context).colorScheme.onPrimary),
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
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: .92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: scheme.onPrimary, fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }
}
