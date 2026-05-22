import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/product.dart';
import '../../../widgets/app_header.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/fulfillment_card.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../../cart/data/cart_controller.dart';
import '../../products/data/product_repository.dart';
import '../../products/presentation/product_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);
    final categories = ref.watch(categoriesProvider);
    final cartCount = ref.watch(cartControllerProvider).fold<int>(0, (sum, item) => sum + item.quantity);

    return MobileAppScaffold(
      selectedIndex: 0,
      title: null,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(productsProvider);
            ref.invalidate(categoriesProvider);
          },
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: AppHeader(
                    greeting: _greeting(),
                    subtitle: 'Fresh essentials near you',
                    actions: [
                      IconButton.filledTonal(onPressed: () => context.go('/notifications'), icon: const Icon(Icons.notifications_none_rounded)),
                      Badge(
                        label: Text('$cartCount'),
                        isLabelVisible: cartCount > 0,
                        child: IconButton.filled(onPressed: () => context.go('/cart'), icon: const Icon(Icons.shopping_bag_rounded)),
                      ),
                    ],
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 20)),
              const SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverToBoxAdapter(child: _HeroBanner()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: TextField(
                    readOnly: true,
                    onTap: () => context.go('/categories'),
                    decoration: const InputDecoration(
                      hintText: 'Search rice, oil, garri, fresh packs...',
                      prefixIcon: Icon(Icons.search_rounded),
                      suffixIcon: Icon(Icons.tune_rounded),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: _AsyncCategoryRail(categories: categories, onTapAll: () => context.go('/categories')),
                ),
              ),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(child: _FulfillmentRail()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => _ProductCarousel(
                      title: 'Featured by FoodNova',
                      products: items.take(8).toList(),
                      onTap: (product) => context.go('/products/${product.id}'),
                      onAdd: (product) => ref.read(cartControllerProvider.notifier).add(product),
                    ),
                    loading: () => const _HorizontalProductSkeleton(),
                    error: (error, _) => EmptyState(title: 'Could not load products', message: error.toString(), icon: Icons.wifi_off_rounded),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 112),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => Column(
                      children: [
                        _ProductCarousel(
                          title: 'Quick delivery essentials',
                          products: items.skip(4).take(8).toList(),
                          onTap: (product) => context.go('/products/${product.id}'),
                          onAdd: (product) => ref.read(cartControllerProvider.notifier).add(product),
                        ),
                        const SizedBox(height: 24),
                        _ProductGridPreview(
                          title: 'Trending products',
                          products: items.skip(2).take(4).toList(),
                          onTap: (product) => context.go('/products/${product.id}'),
                          onAdd: (product) => ref.read(cartControllerProvider.notifier).add(product),
                        ),
                      ],
                    ),
                    loading: () => const _ProductSkeletonGrid(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _greeting() {
  final hour = DateTime.now().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 190,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [FoodNovaColors.primaryDark, FoodNovaColors.primary, FoodNovaColors.success],
        ),
        boxShadow: FoodNovaShadows.nav,
      ),
      child: Stack(
        children: [
          Positioned(right: -8, top: -20, child: Icon(Icons.spa_rounded, size: 138, color: Colors.white.withOpacity(.08))),
          Positioned(right: 8, bottom: 2, child: Icon(Icons.shopping_basket_rounded, size: 86, color: FoodNovaColors.accent.withOpacity(.92))),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const StatusBadge(label: 'Walking-distance delivery', tone: FoodNovaColors.accent),
              const Spacer(),
              Text(
                'Market-fresh essentials, delivered calmly.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w900, height: 1.02),
              ),
              const SizedBox(height: 8),
              const Text('Curated groceries, local fulfillment, trusted riders.', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _AsyncCategoryRail extends StatelessWidget {
  const _AsyncCategoryRail({required this.categories, required this.onTapAll});

  final AsyncValue<List<String>> categories;
  final VoidCallback onTapAll;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 20),
          child: _SectionTitle(title: 'Shop by category', action: 'View all', onTap: onTapAll),
        ),
        const SizedBox(height: 12),
        categories.when(
          data: (items) => SizedBox(
            height: 108,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              itemCount: items.take(10).length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (_, index) => _CategoryCard(label: items[index], icon: _categoryIcon(items[index])),
            ),
          ),
          loading: () => const SizedBox(height: 108, child: Row(children: [SkeletonBox(width: 128, height: 96), SizedBox(width: 12), SkeletonBox(width: 128, height: 96)])),
          error: (_, __) => const Padding(
            padding: EdgeInsets.only(right: 20),
            child: EmptyState(title: 'Categories unavailable', message: 'Pull down to retry.', icon: Icons.category_outlined),
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 132,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: FoodNovaColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: FoodNovaColors.border),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(radius: 20, backgroundColor: FoodNovaColors.surface2, child: Icon(icon, color: FoodNovaColors.primary)),
          const Spacer(),
          Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, height: 1.05)),
        ],
      ),
    );
  }
}

class _FulfillmentRail extends StatelessWidget {
  const _FulfillmentRail();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: const [
        Padding(
          padding: EdgeInsets.only(right: 20),
          child: _SectionTitle(title: 'FoodNova fulfillment'),
        ),
        SizedBox(height: 12),
        SizedBox(
          height: 184,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: BouncingScrollPhysics(),
            child: Row(
              children: [
                FulfillmentCard(title: 'Fast grocery fulfillment', subtitle: 'Prepared carefully from FoodNova inventory', icon: Icons.inventory_2_rounded, badges: ['Fresh stock', 'Quality checked']),
                SizedBox(width: 12),
                FulfillmentCard(title: 'Order updates', subtitle: 'Follow payment, packing, and delivery progress', icon: Icons.receipt_long_rounded, badges: ['Status sync', 'Alerts']),
                SizedBox(width: 20),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ProductCarousel extends StatelessWidget {
  const _ProductCarousel({required this.title, required this.products, required this.onTap, required this.onAdd});

  final String title;
  final List<Product> products;
  final ValueChanged<Product> onTap;
  final ValueChanged<Product> onAdd;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(right: 20),
        child: EmptyState(title: 'No products yet', message: 'Products will appear once the backend catalog is populated.'),
      );
    }

    return Column(
      children: [
        Padding(
          padding: EdgeInsets.only(right: 20),
          child: _SectionTitle(title: title),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 284,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (_, index) => SizedBox(
              width: 174,
              child: ProductCard(product: products[index], onTap: () => onTap(products[index]), onAdd: () => onAdd(products[index])),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProductGridPreview extends StatelessWidget {
  const _ProductGridPreview({required this.title, required this.products, required this.onTap, required this.onAdd});

  final String title;
  final List<Product> products;
  final ValueChanged<Product> onTap;
  final ValueChanged<Product> onAdd;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        _SectionTitle(title: title),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: products.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: .64,
            crossAxisSpacing: 14,
            mainAxisSpacing: 14,
          ),
          itemBuilder: (context, index) => ProductCard(product: products[index], onTap: () => onTap(products[index]), onAdd: () => onAdd(products[index])),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action, this.onTap});

  final String title;
  final String? action;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900))),
        if (action != null) TextButton(onPressed: onTap, child: Text(action!)),
      ],
    );
  }
}

class _HorizontalProductSkeleton extends StatelessWidget {
  const _HorizontalProductSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Padding(padding: EdgeInsets.only(right: 20), child: _SectionTitle(title: 'Featured by FoodNova')),
        SizedBox(height: 12),
        SizedBox(height: 284, child: Row(children: [SkeletonBox(width: 174, height: 270, radius: 24), SizedBox(width: 14), SkeletonBox(width: 174, height: 270, radius: 24)])),
      ],
    );
  }
}

class _ProductSkeletonGrid extends StatelessWidget {
  const _ProductSkeletonGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      childAspectRatio: .64,
      crossAxisSpacing: 14,
      mainAxisSpacing: 14,
      children: List.generate(4, (_) => const SkeletonBox(height: 230, radius: 24)),
    );
  }
}

IconData _categoryIcon(String label) {
  final value = label.toLowerCase();
  if (value.contains('rice') || value.contains('grain')) return Icons.rice_bowl_rounded;
  if (value.contains('fruit') || value.contains('fresh')) return Icons.eco_rounded;
  if (value.contains('drink') || value.contains('water')) return Icons.local_drink_rounded;
  if (value.contains('pack') || value.contains('bundle')) return Icons.inventory_2_rounded;
  return Icons.local_grocery_store_rounded;
}
