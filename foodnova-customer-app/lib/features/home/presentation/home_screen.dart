import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/app_header.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../../../widgets/vendor_card.dart';
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
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(productsProvider);
            ref.invalidate(categoriesProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
            children: [
              AppHeader(
                greeting: 'Good day',
                subtitle: 'Fresh essentials near you',
                actions: [
                  IconButton(onPressed: () => context.go('/notifications'), icon: const Icon(Icons.notifications_none_rounded)),
                  Badge(
                    label: Text('$cartCount'),
                    isLabelVisible: cartCount > 0,
                    child: IconButton(onPressed: () => context.go('/cart'), icon: const Icon(Icons.shopping_bag_outlined)),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [FoodNovaColors.primaryDark, FoodNovaColors.primary]),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: FoodNovaShadows.nav,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const StatusBadge(label: 'Neighborhood commerce', tone: FoodNovaColors.accent),
                    const SizedBox(height: 14),
                    Text(
                      'Market staples, local fulfillment, calm delivery.',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'FoodNova combines premium grocery shopping with walking-distance dispatch and trusted riders.',
                      style: TextStyle(color: Colors.white),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              TextField(
                readOnly: true,
                onTap: () => context.go('/categories'),
                decoration: const InputDecoration(
                  hintText: 'Search rice, oil, garri, packs...',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: 22),
              _SectionTitle(title: 'Categories', action: 'View all', onTap: () => context.go('/categories')),
              const SizedBox(height: 12),
              categories.when(
                data: (items) => SizedBox(
                  height: 96,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: items.take(8).length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (_, index) => _CategoryChip(label: items[index]),
                  ),
                ),
                loading: () => const Row(children: [SkeletonBox(width: 110, height: 72), SizedBox(width: 10), SkeletonBox(width: 110, height: 72)]),
                error: (_, __) => const EmptyState(title: 'Categories unavailable', message: 'Pull down to retry.'),
              ),
              const SizedBox(height: 22),
              const _SectionTitle(title: 'Nearby vendors'),
              const SizedBox(height: 12),
              const SizedBox(
                height: 146,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      VendorCard(name: 'FoodNova Market Hub', caption: 'Core pantry fulfillment'),
                      SizedBox(width: 12),
                      VendorCard(name: 'Local Fresh Desk', caption: 'Fast neighborhood dispatch'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              const _SectionTitle(title: 'Featured products'),
              const SizedBox(height: 12),
              products.when(
                data: (items) {
                  if (items.isEmpty) return const EmptyState(title: 'No products yet', message: 'Products will appear once the backend catalog is populated.');
                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: items.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: .68,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                    ),
                    itemBuilder: (context, index) => ProductCard(
                      product: items[index],
                      onTap: () => context.go('/products/${items[index].id}'),
                      onAdd: () => ref.read(cartControllerProvider.notifier).add(items[index]),
                    ),
                  );
                },
                loading: () => const _ProductSkeletonGrid(),
                error: (error, _) => EmptyState(title: 'Could not load products', message: error.toString()),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const _FloatingNav(),
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

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 124,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: FoodNovaColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: FoodNovaColors.border),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.eco_rounded, color: FoodNovaColors.primary),
          const Spacer(),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
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
      childAspectRatio: .68,
      crossAxisSpacing: 14,
      mainAxisSpacing: 14,
      children: List.generate(4, (_) => const SkeletonBox(height: 220, radius: 24)),
    );
  }
}

class _FloatingNav extends StatelessWidget {
  const _FloatingNav();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: DecoratedBox(
        decoration: BoxDecoration(boxShadow: FoodNovaShadows.soft, borderRadius: BorderRadius.circular(24)),
        child: NavigationBar(
          selectedIndex: 0,
          onDestinationSelected: (index) {
            if (index == 1) context.go('/orders');
            if (index == 2) context.go('/profile');
          },
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.receipt_long_rounded), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.person_rounded), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
