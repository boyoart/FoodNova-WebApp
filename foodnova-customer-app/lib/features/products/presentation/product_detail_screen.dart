import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/product.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/skeleton_box.dart';
import '../../cart/data/cart_controller.dart';
import '../data/product_repository.dart';
import 'product_card.dart';

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({
    required this.productId,
    this.isPack = false,
    super.key,
  });

  final int productId;
  final bool isPack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productState = ref.watch(isPack
        ? packDetailProvider(productId)
        : productDetailProvider(productId));
    final products = ref.watch(productsProvider);
    final cartItems = ref.watch(cartControllerProvider);
    final product = productState.valueOrNull;
    final quantity = product == null
        ? 0
        : cartItems
            .where((item) => item.product.id == product.id)
            .fold<int>(0, (sum, item) => sum + item.quantity);

    return Scaffold(
      appBar: AppBar(
        title: Text(isPack ? 'Food pack' : 'Product details'),
        actions: [
          IconButton(
            tooltip: 'Favorite',
            onPressed: () {},
            icon: const Icon(Icons.favorite_border_rounded),
          ),
        ],
      ),
      body: productState.when(
        loading: () => const _DetailSkeleton(),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: EmptyState(
            title: 'Product unavailable',
            message: error.toString(),
            icon: Icons.wifi_off_rounded,
          ),
        ),
        data: (item) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(isPack
                ? packDetailProvider(productId)
                : productDetailProvider(productId));
            ref.invalidate(productsProvider);
          },
          child: ListView(
            physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics()),
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 130),
            children: [
              _ProductHero(product: item, isPack: isPack),
              if (item.imageUrl.isNotEmpty) ...[
                const SizedBox(height: 12),
                _ImageGalleryStrip(product: item),
              ],
              const SizedBox(height: 18),
              _ProductSummary(
                  product: item, isPack: isPack, quantity: quantity),
              const SizedBox(height: 14),
              _DeliveryEstimate(product: item),
              const SizedBox(height: 14),
              _WhatsIncludedCard(product: item),
              const SizedBox(height: 14),
              _DetailsCard(product: item),
              const SizedBox(height: 22),
              products.when(
                data: (items) {
                  final related = items
                      .where((candidate) =>
                          candidate.id != item.id &&
                          (candidate.category == item.category ||
                              candidate.type == item.type))
                      .take(8)
                      .toList();
                  if (related.isEmpty) return const SizedBox.shrink();
                  return _RelatedProducts(products: related);
                },
                loading: () => const SkeletonBox(height: 250, radius: 24),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: product == null
          ? null
          : _StickyAddToCart(
              product: product,
            ),
    );
  }
}

class _ImageGalleryStrip extends StatelessWidget {
  const _ImageGalleryStrip({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 66,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: 4,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) => Container(
          width: 66,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color:
                  index == 0 ? FoodNovaColors.primary : scheme.outlineVariant,
              width: index == 0 ? 1.4 : 1,
            ),
          ),
          child:
              CachedNetworkImage(imageUrl: product.imageUrl, fit: BoxFit.cover),
        ),
      ),
    );
  }
}

class _ProductHero extends StatelessWidget {
  const _ProductHero({required this.product, required this.isPack});

  final Product product;
  final bool isPack;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 330,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(30),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (product.imageUrl.isEmpty)
            Icon(
              isPack
                  ? Icons.inventory_2_rounded
                  : Icons.shopping_basket_rounded,
              color: FoodNovaColors.primary,
              size: 74,
            )
          else
            CachedNetworkImage(
              imageUrl: product.imageUrl,
              fit: BoxFit.cover,
              placeholder: (_, __) =>
                  const SkeletonBox(height: 330, radius: 30),
              errorWidget: (_, __, ___) => Icon(
                Icons.shopping_basket_rounded,
                color: FoodNovaColors.primary,
                size: 68,
              ),
            ),
          Positioned(
            left: 14,
            bottom: 14,
            child: _HeroChip(
              icon: isPack ? Icons.inventory_2_rounded : Icons.verified_rounded,
              label: isPack ? 'Curated FoodNova pack' : 'Fresh inventory',
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductSummary extends StatelessWidget {
  const _ProductSummary({
    required this.product,
    required this.isPack,
    required this.quantity,
  });

  final Product product;
  final bool isPack;
  final int quantity;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return _DetailCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _HeroChip(
                icon: Icons.category_rounded,
                label: product.category.isEmpty
                    ? 'FoodNova grocery'
                    : product.category,
                compact: true,
              ),
              _HeroChip(
                icon: product.stock > 0
                    ? Icons.check_circle_rounded
                    : Icons.error_rounded,
                label: product.stock > 0 ? 'In stock' : 'Unavailable',
                compact: true,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            product.name,
            style: text.headlineSmall
                ?.copyWith(fontWeight: FontWeight.w900, height: 1.04),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  currency.format(product.price),
                  style: text.titleLarge?.copyWith(
                    color: FoodNovaColors.primary,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star_rounded,
                        color: FoodNovaColors.accent, size: 18),
                    const SizedBox(width: 4),
                    Text(
                      '4.8',
                      style: text.labelLarge
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (quantity > 0) ...[
            const SizedBox(height: 10),
            Text(
              '$quantity in cart',
              style: text.labelLarge?.copyWith(
                color: FoodNovaColors.primary,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DeliveryEstimate extends StatelessWidget {
  const _DeliveryEstimate({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _DetailCard(
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: FoodNovaColors.primary,
            foregroundColor: scheme.onPrimary,
            child: const Icon(Icons.local_shipping_rounded),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delivery estimate',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  product.stock > 0
                      ? 'Prepared from FoodNova inventory after payment confirmation.'
                      : 'This item is currently unavailable.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        height: 1.35,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WhatsIncludedCard extends StatelessWidget {
  const _WhatsIncludedCard({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final contents = product.displayContents;
    return _DetailCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 19,
                backgroundColor: FoodNovaColors.accent.withValues(alpha: .28),
                foregroundColor: FoodNovaColors.primary,
                child: const Icon(Icons.inventory_2_rounded, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  "What's Included",
                  style: text.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          for (final item in contents.take(8))
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    color: FoodNovaColors.primary,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      item,
                      style: text.bodyMedium?.copyWith(
                        color: scheme.onSurface,
                        fontWeight: FontWeight.w800,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (contents.length > 8)
            Theme(
              data:
                  Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                title: Text(
                  'View ${contents.length - 8} more items',
                  style: text.labelLarge?.copyWith(
                    color: FoodNovaColors.primary,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                children: [
                  for (final item in contents.skip(8))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.check_circle_rounded,
                            color: FoodNovaColors.primary,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              item,
                              style: text.bodyMedium?.copyWith(
                                color: scheme.onSurface,
                                fontWeight: FontWeight.w800,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoPill(
                icon: Icons.shopping_bag_rounded,
                label: product.packInfo,
              ),
              _InfoPill(
                icon: Icons.people_alt_rounded,
                label: product.servingEstimate,
              ),
              _InfoPill(
                icon: Icons.eco_rounded,
                label: product.freshnessNote,
              ),
              _InfoPill(
                icon: Icons.local_shipping_rounded,
                label: product.deliveryNote,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DetailsCard extends StatelessWidget {
  const _DetailsCard({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final description = product.description.trim().isEmpty
        ? 'Premium FoodNova grocery item managed through central inventory and local fulfillment.'
        : product.description.trim();
    return _DetailCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Details',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Text(
            description,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.48,
                ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: const [
              _HeroChip(
                  icon: Icons.verified_user_rounded,
                  label: 'Quality checked',
                  compact: true),
              _HeroChip(
                  icon: Icons.receipt_long_rounded,
                  label: 'Invoice supported',
                  compact: true),
              _HeroChip(
                  icon: Icons.support_agent_rounded,
                  label: 'Order support',
                  compact: true),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(maxWidth: 260),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: FoodNovaColors.primary, size: 16),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: scheme.onSurface,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RelatedProducts extends ConsumerWidget {
  const _RelatedProducts({required this.products});

  final List<Product> products;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartControllerProvider);
    int quantityOf(Product product) => cart
        .where((item) => item.product.id == product.id)
        .fold(0, (sum, item) => sum + item.quantity);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Related products',
          style: Theme.of(context)
              .textTheme
              .titleLarge
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 318,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, index) {
              final product = products[index];
              final quantity = quantityOf(product);
              return SizedBox(
                width: 174,
                child: ProductCard(
                  product: product,
                  onTap: () => context.push(product.type == 'pack'
                      ? '/packs/${product.id}'
                      : '/products/${product.id}'),
                  onAdd: () =>
                      ref.read(cartControllerProvider.notifier).add(product),
                  quantity: quantity,
                  onIncrement: () =>
                      ref.read(cartControllerProvider.notifier).add(product),
                  onDecrement: () => ref
                      .read(cartControllerProvider.notifier)
                      .updateQuantity(product.id, quantity - 1),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _StickyAddToCart extends ConsumerStatefulWidget {
  const _StickyAddToCart({
    required this.product,
  });

  final Product product;

  @override
  ConsumerState<_StickyAddToCart> createState() => _StickyAddToCartState();
}

class _StickyAddToCartState extends ConsumerState<_StickyAddToCart> {
  ProductVariant? _selectedVariant;

  @override
  void initState() {
    super.initState();
    _selectedVariant = widget.product.selectedVariant;
  }

  @override
  void didUpdateWidget(covariant _StickyAddToCart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product.id != widget.product.id) {
      _selectedVariant = widget.product.selectedVariant;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    final activeVariants =
        widget.product.variants.where((variant) => variant.isActive).toList();
    final requiresVariant = activeVariants.length > 1;
    final selectedProduct = widget.product.withVariant(_selectedVariant);
    final canAdd = selectedProduct.stock > 0 &&
        (!requiresVariant || _selectedVariant != null);
    final cartItems = ref.watch(cartControllerProvider);
    final quantity = cartItems
        .where((item) => item.product.cartKey == selectedProduct.cartKey)
        .fold<int>(0, (sum, item) => sum + item.quantity);
    final cartController = ref.read(cartControllerProvider.notifier);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 18),
        decoration: BoxDecoration(
          color: scheme.surface,
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
          boxShadow: FoodNovaShadows.soft,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (activeVariants.length > 1) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Select Weight',
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(fontWeight: FontWeight.w900)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final variant in activeVariants)
                    ChoiceChip(
                      label: Text(variant.weight),
                      selected: _selectedVariant?.id == variant.id,
                      onSelected: (_) =>
                          setState(() => _selectedVariant = variant),
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        requiresVariant && _selectedVariant == null
                            ? 'From ${currency.format(widget.product.startingPrice)}'
                            : currency.format(selectedProduct.price),
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  color: FoodNovaColors.primary,
                                  fontWeight: FontWeight.w900,
                                ),
                      ),
                      Text(
                        requiresVariant && _selectedVariant == null
                            ? 'Select a weight to view stock'
                            : selectedProduct.stock > 0
                                ? '${selectedProduct.stock} in stock'
                                : 'Out of stock',
                        style:
                            Theme.of(context).textTheme.labelMedium?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                    ],
                  ),
                ),
                if (quantity > 0)
                  Container(
                    margin: const EdgeInsets.only(right: 10),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      children: [
                        IconButton(
                          tooltip: 'Decrease',
                          onPressed: () => cartController.updateQuantity(
                              selectedProduct.cartKey, quantity - 1),
                          icon: const Icon(Icons.remove_rounded),
                        ),
                        Text('$quantity',
                            style:
                                const TextStyle(fontWeight: FontWeight.w900)),
                        IconButton(
                          tooltip: 'Increase',
                          onPressed: canAdd
                              ? () => cartController.add(selectedProduct)
                              : null,
                          icon: const Icon(Icons.add_rounded),
                        ),
                      ],
                    ),
                  ),
                SizedBox(
                  width: quantity > 0 ? 128 : 164,
                  child: PrimaryButton(
                    label: requiresVariant && _selectedVariant == null
                        ? 'Select weight'
                        : quantity > 0
                            ? 'Add more'
                            : 'Add to cart',
                    icon: Icons.add_shopping_cart_rounded,
                    onPressed: canAdd
                        ? () => cartController.add(selectedProduct)
                        : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: child,
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({
    required this.icon,
    required this.label,
    this.compact = false,
  });

  final IconData icon;
  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 12,
        vertical: compact ? 7 : 9,
      ),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: .92),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: FoodNovaColors.primary, size: compact ? 16 : 18),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurface,
                  fontWeight: FontWeight.w900,
                ),
          ),
        ],
      ),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(20),
      child: Column(
        children: [
          SkeletonBox(height: 330, radius: 30),
          SizedBox(height: 18),
          SkeletonBox(height: 150, radius: 24),
          SizedBox(height: 14),
          SkeletonBox(height: 110, radius: 24),
        ],
      ),
    );
  }
}
