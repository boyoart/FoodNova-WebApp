import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/product.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/skeleton_box.dart';
import '../../cart/data/cart_controller.dart';
import '../data/product_repository.dart';
import 'product_card.dart';

class DiscoverScreen extends ConsumerWidget {
  const DiscoverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);
    final packs = ref.watch(packsProvider);
    final banners = ref.watch(heroBannersProvider);
    final categories = ref.watch(categoriesProvider);
    final cartItems = ref.watch(cartControllerProvider);
    int quantityOf(Product product) => cartItems
        .where((item) => item.product.id == product.id)
        .fold<int>(0, (sum, item) => sum + item.quantity);
    void decrement(Product product) => ref
        .read(cartControllerProvider.notifier)
        .updateQuantity(product.id, quantityOf(product) - 1);

    return MobileAppScaffold(
      selectedIndex: 1,
      title: 'Explore',
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(productsProvider);
            ref.invalidate(packsProvider);
            ref.invalidate(heroBannersProvider);
          },
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: TextField(
                    readOnly: true,
                    onTap: () => _showSearchSheet(context, ref),
                    decoration: InputDecoration(
                      hintText: 'Search FoodNova products',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: IconButton(
                        tooltip: 'Filters',
                        onPressed: () => _showFilterSheet(context),
                        icon: const Icon(Icons.tune_rounded),
                      ),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 14, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: categories.when(
                    data: (items) => _CategoryChips(categories: items),
                    loading: () => const SizedBox(
                      height: 42,
                      child: Row(
                        children: [
                          SkeletonBox(width: 92, height: 38, radius: 999),
                          SizedBox(width: 8),
                          SkeletonBox(width: 112, height: 38, radius: 999),
                        ],
                      ),
                    ),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: banners.when(
                    data: (items) => _BannerStrip(banners: items),
                    loading: () => const SkeletonBox(height: 128, radius: 24),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 22, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: packs.when(
                    data: (items) => _HorizontalShelf(
                      title: 'Featured packs',
                      products: items.take(10).toList(),
                      onTap: (product) => context.push('/packs/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: decrement,
                    ),
                    loading: () =>
                        const _ShelfSkeleton(title: 'Featured packs'),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 22, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => _HorizontalShelf(
                      title: 'Trending items',
                      products: items.take(10).toList(),
                      onTap: (product) =>
                          context.push('/products/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: decrement,
                    ),
                    loading: () =>
                        const _ShelfSkeleton(title: 'Trending items'),
                    error: (error, _) => EmptyState(
                      title: 'Explore unavailable',
                      message: error.toString(),
                      icon: Icons.wifi_off_rounded,
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 22, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => _HorizontalShelf(
                      title: 'Flash sales',
                      products: items
                          .where((item) => item.stock > 0 && item.stock <= 5)
                          .take(10)
                          .toList(),
                      onTap: (product) =>
                          context.push('/products/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: decrement,
                    ),
                    loading: () => const _ShelfSkeleton(title: 'Flash sales'),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 22, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => _HorizontalShelf(
                      title: 'Recommended',
                      products: items.skip(2).take(10).toList(),
                      onTap: (product) =>
                          context.push('/products/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: decrement,
                    ),
                    loading: () => const _ShelfSkeleton(title: 'Recommended'),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 118),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) {
                      final recent = items.reversed.take(6).toList();
                      if (recent.isEmpty) {
                        return const EmptyState(
                          title: 'No products yet',
                          message:
                              'FoodNova products will appear here once available.',
                        );
                      }
                      return Column(
                        children: [
                          const _SectionTitle(title: 'New arrivals'),
                          const SizedBox(height: 12),
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: recent.length,
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: .58,
                              crossAxisSpacing: 14,
                              mainAxisSpacing: 14,
                            ),
                            itemBuilder: (_, index) {
                              final product = recent[index];
                              return ProductCard(
                                product: product,
                                onTap: () =>
                                    context.push('/products/${product.id}'),
                                onAdd: () => ref
                                    .read(cartControllerProvider.notifier)
                                    .add(product),
                                quantity: quantityOf(product),
                                onIncrement: () => ref
                                    .read(cartControllerProvider.notifier)
                                    .add(product),
                                onDecrement: () => decrement(product),
                              );
                            },
                          ),
                          const SizedBox(height: 22),
                          _HorizontalShelf(
                            title: 'Best sellers',
                            products: items.skip(1).take(8).toList(),
                            onTap: (product) =>
                                context.push('/products/${product.id}'),
                            onAdd: (product) => ref
                                .read(cartControllerProvider.notifier)
                                .add(product),
                            quantityOf: quantityOf,
                            onIncrement: (product) => ref
                                .read(cartControllerProvider.notifier)
                                .add(product),
                            onDecrement: decrement,
                          ),
                          const SizedBox(height: 22),
                          _HorizontalShelf(
                            title: 'Combo deals',
                            products: items
                                .where((item) => item.type == 'pack')
                                .followedBy(items.take(4))
                                .take(8)
                                .toList(),
                            onTap: (product) => context.push(
                                product.type == 'pack'
                                    ? '/packs/${product.id}'
                                    : '/products/${product.id}'),
                            onAdd: (product) => ref
                                .read(cartControllerProvider.notifier)
                                .add(product),
                            quantityOf: quantityOf,
                            onIncrement: (product) => ref
                                .read(cartControllerProvider.notifier)
                                .add(product),
                            onDecrement: decrement,
                          ),
                        ],
                      );
                    },
                    loading: () => GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                      childAspectRatio: .58,
                      children: List.generate(
                        4,
                        (_) => const SkeletonBox(height: 220, radius: 24),
                      ),
                    ),
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

class _BannerStrip extends StatelessWidget {
  const _BannerStrip({required this.banners});

  final List<FoodNovaAnnouncement> banners;

  @override
  Widget build(BuildContext context) {
    if (banners.isEmpty) {
      final scheme = Theme.of(context).colorScheme;
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: _cardDecoration(context),
        child: Text(
          'No active FoodNova banners right now.',
          style: TextStyle(color: scheme.onSurfaceVariant),
        ),
      );
    }
    return SizedBox(
      height: 132,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: banners.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, index) => _MiniBanner(banner: banners[index]),
      ),
    );
  }
}

class _MiniBanner extends StatelessWidget {
  const _MiniBanner({required this.banner});

  final FoodNovaAnnouncement banner;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 260,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        image: banner.imageUrl.isEmpty
            ? null
            : DecorationImage(
                image: NetworkImage(banner.imageUrl),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  scheme.shadow.withValues(alpha: .35),
                  BlendMode.darken,
                ),
              ),
        gradient: const LinearGradient(
          colors: [FoodNovaColors.primaryDark, FoodNovaColors.primary],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            banner.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w900,
              fontSize: 17,
            ),
          ),
          const Spacer(),
          Text(
            banner.message,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _HorizontalShelf extends StatelessWidget {
  const _HorizontalShelf({
    required this.title,
    required this.products,
    required this.onTap,
    required this.onAdd,
    this.quantityOf,
    this.onIncrement,
    this.onDecrement,
  });

  final String title;
  final List<Product> products;
  final ValueChanged<Product> onTap;
  final ValueChanged<Product> onAdd;
  final int Function(Product product)? quantityOf;
  final ValueChanged<Product>? onIncrement;
  final ValueChanged<Product>? onDecrement;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 20),
          child: _SectionTitle(title: title),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 318,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (_, index) => SizedBox(
              width: 174,
              child: ProductCard(
                product: products[index],
                onTap: () => onTap(products[index]),
                onAdd: () => onAdd(products[index]),
                quantity: quantityOf?.call(products[index]) ?? 0,
                onIncrement: () => (onIncrement ?? onAdd).call(products[index]),
                onDecrement: () => onDecrement?.call(products[index]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
        ),
      ],
    );
  }
}

class _ShelfSkeleton extends StatelessWidget {
  const _ShelfSkeleton({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 20),
          child: _SectionTitle(title: title),
        ),
        const SizedBox(height: 12),
        const SizedBox(
          height: 284,
          child: Row(
            children: [
              SkeletonBox(width: 174, height: 270, radius: 24),
              SizedBox(width: 14),
              SkeletonBox(width: 174, height: 270, radius: 24),
            ],
          ),
        ),
      ],
    );
  }
}

Future<void> _showSearchSheet(BuildContext context, WidgetRef ref) async {
  final products = ref.read(productsProvider).valueOrNull ?? const <Product>[];
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .92,
      minChildSize: .5,
      maxChildSize: .96,
      builder: (context, controller) => _SearchSheet(
        products: products,
        scrollController: controller,
      ),
    ),
  );
}

Future<void> _showFilterSheet(BuildContext context) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => const _FilterSheet(),
  );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet();

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  RangeValues _price = const RangeValues(500, 25000);
  int _rating = 4;
  final Set<String> _categories = {'Fruits', 'Rice'};

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final categories = [
      'Vegetable',
      'Fruits',
      'Milk and egg',
      'Beverages',
      'Rice',
      'Fish',
      'Bread',
      'Baby meal',
      'Laundry',
    ];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .72,
      minChildSize: .48,
      maxChildSize: .92,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        children: [
          Text(
            'Apply filter',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 18),
          Text('Price range',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          RangeSlider(
            min: 0,
            max: 50000,
            divisions: 20,
            values: _price,
            labels: RangeLabels(
              'NGN ${_price.start.round()}',
              'NGN ${_price.end.round()}',
            ),
            onChanged: (value) => setState(() => _price = value),
          ),
          Row(
            children: [
              Text('NGN ${_price.start.round()}',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('NGN ${_price.end.round()}',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 18),
          Text('Rating',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (var i = 1; i <= 5; i++)
                ChoiceChip(
                  selected: _rating == i,
                  label: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('$i'),
                      const Icon(Icons.star_rounded, size: 16)
                    ],
                  ),
                  selectedColor: FoodNovaColors.primary,
                  backgroundColor: scheme.surfaceContainerHighest,
                  labelStyle: TextStyle(
                    color: _rating == i ? scheme.onPrimary : scheme.onSurface,
                    fontWeight: FontWeight.w900,
                  ),
                  onSelected: (_) => setState(() => _rating = i),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text('Categories',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final category in categories)
                FilterChip(
                  selected: _categories.contains(category),
                  label: Text(category),
                  selectedColor: FoodNovaColors.primary.withValues(alpha: .18),
                  backgroundColor: scheme.surfaceContainerHighest,
                  side: BorderSide(color: scheme.outlineVariant),
                  onSelected: (selected) => setState(() {
                    if (selected) {
                      _categories.add(category);
                    } else {
                      _categories.remove(category);
                    }
                  }),
                ),
            ],
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('Apply filters'),
          ),
        ],
      ),
    );
  }
}

class _SearchSheet extends StatefulWidget {
  const _SearchSheet({required this.products, required this.scrollController});

  final List<Product> products;
  final ScrollController scrollController;

  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.products.where((product) {
      final query = _query.trim().toLowerCase();
      return query.isEmpty ||
          product.name.toLowerCase().contains(query) ||
          product.category.toLowerCase().contains(query);
    }).toList();
    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
      children: [
        TextField(
          autofocus: true,
          onChanged: (value) {
            if (!mounted) return;
            setState(() => _query = value);
          },
          decoration: const InputDecoration(
            hintText: 'Search rice, oil, beans, packs...',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        const SizedBox(height: 16),
        if (_query.isEmpty) ...[
          Text(
            'Recent searches',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: const [
              _SearchSuggestion(label: 'Rice'),
              _SearchSuggestion(label: 'Oil'),
              _SearchSuggestion(label: 'Fresh pack'),
              _SearchSuggestion(label: 'Beans'),
            ],
          ),
          const SizedBox(height: 18),
        ],
        Text(
          _query.isEmpty ? 'Trending products' : 'Search results',
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        for (final product in filtered.take(24))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(
              backgroundColor:
                  Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Icon(
                product.type == 'pack'
                    ? Icons.inventory_2_rounded
                    : Icons.shopping_basket_rounded,
                color: FoodNovaColors.primary,
              ),
            ),
            title: Text(product.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900)),
            subtitle: Text(product.category),
            onTap: () {
              final router = GoRouter.of(context);
              if (context.mounted) Navigator.pop(context);
              router.push(product.type == 'pack'
                  ? '/packs/${product.id}'
                  : '/products/${product.id}');
            },
          ),
      ],
    );
  }
}

class _CategoryChips extends StatefulWidget {
  const _CategoryChips({required this.categories});

  final List<String> categories;

  @override
  State<_CategoryChips> createState() => _CategoryChipsState();
}

class _CategoryChipsState extends State<_CategoryChips> {
  String _selected = 'All';

  @override
  Widget build(BuildContext context) {
    final categories = ['All', ...widget.categories.take(12)];
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final label = categories[index];
          final selected = label == _selected;
          return ChoiceChip(
            selected: selected,
            label: Text(label),
            onSelected: (_) => setState(() => _selected = label),
            selectedColor: FoodNovaColors.primary,
            backgroundColor: scheme.surface,
            labelStyle: TextStyle(
              color: selected ? scheme.onPrimary : scheme.onSurface,
              fontWeight: FontWeight.w900,
            ),
            side: BorderSide(
                color:
                    selected ? FoodNovaColors.primary : scheme.outlineVariant),
          );
        },
      ),
    );
  }
}

class _SearchSuggestion extends StatelessWidget {
  const _SearchSuggestion({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Chip(
      avatar: const Icon(Icons.history_rounded, size: 16),
      label: Text(label),
      backgroundColor: scheme.surfaceContainerHighest,
      side: BorderSide(color: scheme.outlineVariant),
    );
  }
}

BoxDecoration _cardDecoration(BuildContext context) {
  final scheme = Theme.of(context).colorScheme;
  return BoxDecoration(
    color: scheme.surface,
    borderRadius: BorderRadius.circular(24),
    border: Border.all(color: scheme.outlineVariant),
    boxShadow: FoodNovaShadows.soft,
  );
}
