import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/skeleton_box.dart';
import '../data/product_repository.dart';

class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    return MobileAppScaffold(
      selectedIndex: 1,
      title: 'Categories',
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: _SearchHeader(
                child: TextField(
                  controller: _search,
                  onChanged: (value) => setState(() => _query = value.trim().toLowerCase()),
                  decoration: const InputDecoration(
                    hintText: 'Search groceries, packs, categories',
                    prefixIcon: Icon(Icons.search_rounded),
                    suffixIcon: Icon(Icons.tune_rounded),
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 120),
              sliver: categories.when(
                data: (items) {
                  final filtered = items.where((item) => _query.isEmpty || item.toLowerCase().contains(_query)).toList();
                  if (filtered.isEmpty) {
                    return const SliverToBoxAdapter(child: EmptyState(title: 'Nothing found', message: 'Try rice, oil, garri, packs, or another FoodNova category.'));
                  }
                  return SliverGrid.builder(
                    itemCount: filtered.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: 1.08,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                    ),
                    itemBuilder: (_, index) => _CategoryTile(
                      label: filtered[index],
                      onTap: () => context.go('/home'),
                    ),
                  );
                },
                loading: () => SliverGrid.count(
                  crossAxisCount: 2,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 14,
                  children: List.generate(6, (_) => const SkeletonBox(height: 120, radius: 24)),
                ),
                error: (error, _) => SliverToBoxAdapter(child: EmptyState(title: 'Could not load categories', message: error.toString(), icon: Icons.wifi_off_rounded)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchHeader extends SliverPersistentHeaderDelegate {
  const _SearchHeader({required this.child});

  final Widget child;

  @override
  double get minExtent => 82;

  @override
  double get maxExtent => 82;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: FoodNovaColors.bg.withOpacity(.96),
        boxShadow: overlapsContent ? FoodNovaShadows.soft : null,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
        child: child,
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _SearchHeader oldDelegate) => oldDelegate.child != child;
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: FoodNovaColors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: FoodNovaColors.border),
          boxShadow: FoodNovaShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const CircleAvatar(backgroundColor: FoodNovaColors.surface2, child: Icon(Icons.local_grocery_store_rounded, color: FoodNovaColors.primary)),
            const Spacer(),
            Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, height: 1.05)),
          ],
        ),
      ),
    );
  }
}
