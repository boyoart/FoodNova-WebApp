import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/app_config.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/product.dart';
import '../../../widgets/brand_logo.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/fulfillment_card.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../../cart/data/cart_controller.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../products/data/product_repository.dart';
import '../../products/presentation/product_card.dart';
import '../../profile/data/profile_repository.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    ref.listen(notificationRefreshProvider, (_, __) {
      if (!context.mounted) return;
      ref.invalidate(unreadNotificationsProvider);
    });
    final products = ref.watch(productsProvider);
    final packs = ref.watch(packsProvider);
    final categories = ref.watch(categoriesProvider);
    final heroBanners = ref.watch(heroBannersProvider);
    final authenticated =
        ref.watch(sessionControllerProvider).valueOrNull == true;
    final profile =
        authenticated ? ref.watch(profileProvider).valueOrNull : null;
    final unreadCount = authenticated
        ? ref.watch(unreadNotificationsProvider).valueOrNull ?? 0
        : 0;
    final cartItems = ref.watch(cartControllerProvider);
    int quantityOf(Product product) => cartItems
        .where((item) => item.product.id == product.id)
        .fold<int>(0, (sum, item) => sum + item.quantity);

    return MobileAppScaffold(
      selectedIndex: 0,
      title: null,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(productsProvider);
            ref.invalidate(packsProvider);
            ref.invalidate(categoriesProvider);
            ref.invalidate(heroBannersProvider);
            if (authenticated) {
              ref.invalidate(profileProvider);
              ref.invalidate(unreadNotificationsProvider);
            }
          },
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _FloatingHeaderDelegate(
                  child: _HomeTopBar(
                    onNotifications: () => context.push('/notifications'),
                    unreadCount: unreadCount,
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: _HomeGreetingBlock(
                      greeting: _greeting(profile?.firstName)),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 18)),
              SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverToBoxAdapter(
                  child: heroBanners.when(
                    data: (items) => _AnnouncementCarousel(banners: items),
                    loading: () => const SkeletonBox(height: 196, radius: 28),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: _QuickActionRow(
                    onExplore: () => context.push('/discover'),
                    onOrders: () => context.push('/orders'),
                    onSupport: () => _openSupport(context),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: TextField(
                    readOnly: true,
                    onTap: () => context.push('/discover'),
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
                  child: _AsyncCategoryRail(
                      categories: categories,
                      onTapAll: () => context.push('/discover')),
                ),
              ),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(child: _FulfillmentRail()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: packs.when(
                    data: (items) => _ProductCarousel(
                      title: 'FoodNova food packs',
                      products: items.take(8).toList(),
                      onTap: (product) => context.push('/packs/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: (product) {
                        final quantity = quantityOf(product);
                        ref
                            .read(cartControllerProvider.notifier)
                            .updateQuantity(product.id, quantity - 1);
                      },
                    ),
                    loading: () => const _HorizontalProductSkeleton(
                        title: 'FoodNova food packs'),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 0, 0),
                sliver: SliverToBoxAdapter(
                  child: products.when(
                    data: (items) => _ProductCarousel(
                      title: 'Featured by FoodNova',
                      products: items.take(8).toList(),
                      onTap: (product) =>
                          context.push('/products/${product.id}'),
                      onAdd: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      quantityOf: quantityOf,
                      onIncrement: (product) => ref
                          .read(cartControllerProvider.notifier)
                          .add(product),
                      onDecrement: (product) {
                        final quantity = quantityOf(product);
                        ref
                            .read(cartControllerProvider.notifier)
                            .updateQuantity(product.id, quantity - 1);
                      },
                    ),
                    loading: () => const _HorizontalProductSkeleton(
                        title: 'Featured by FoodNova'),
                    error: (error, _) => EmptyState(
                        title: 'Could not load products',
                        message: error.toString(),
                        icon: Icons.wifi_off_rounded),
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
                          title: 'Popular foodstuff',
                          products: items.skip(4).take(8).toList(),
                          onTap: (product) =>
                              context.push('/products/${product.id}'),
                          onAdd: (product) => ref
                              .read(cartControllerProvider.notifier)
                              .add(product),
                          quantityOf: quantityOf,
                          onIncrement: (product) => ref
                              .read(cartControllerProvider.notifier)
                              .add(product),
                          onDecrement: (product) {
                            final quantity = quantityOf(product);
                            ref
                                .read(cartControllerProvider.notifier)
                                .updateQuantity(product.id, quantity - 1);
                          },
                        ),
                        const SizedBox(height: 24),
                        _ProductGridPreview(
                          title: 'Trending products',
                          products: items.skip(2).take(4).toList(),
                          onTap: (product) =>
                              context.push('/products/${product.id}'),
                          onAdd: (product) => ref
                              .read(cartControllerProvider.notifier)
                              .add(product),
                          quantityOf: quantityOf,
                          onIncrement: (product) => ref
                              .read(cartControllerProvider.notifier)
                              .add(product),
                          onDecrement: (product) {
                            final quantity = quantityOf(product);
                            ref
                                .read(cartControllerProvider.notifier)
                                .updateQuantity(product.id, quantity - 1);
                          },
                        ),
                        const SizedBox(height: 24),
                        const _OrderProcessSection(),
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

class _HomeTopBar extends StatelessWidget {
  const _HomeTopBar({
    required this.onNotifications,
    required this.unreadCount,
  });

  final VoidCallback onNotifications;
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 8, 10, 8),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: .94),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: .65)),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 88),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final logoWidth = constraints.maxWidth.clamp(168.0, 220.0);
                  return Align(
                    alignment: Alignment.centerLeft,
                    child: FoodNovaLogo(
                      width: logoWidth,
                      height: 84,
                      tightCrop: true,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 50,
              child: Align(
                alignment: Alignment.centerRight,
                child: IconButton.filledTonal(
                  tooltip: 'Notifications',
                  onPressed: onNotifications,
                  icon: Badge(
                    isLabelVisible: unreadCount > 0,
                    label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
                    child: const Icon(Icons.notifications_none_rounded),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeGreetingBlock extends StatelessWidget {
  const _HomeGreetingBlock({required this.greeting});

  final String greeting;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$greeting \u{1F44B}',
            softWrap: true,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: scheme.onSurface,
                  fontWeight: FontWeight.w900,
                  height: 1.08,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ready to restock your essentials?',
            softWrap: true,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  height: 1.22,
                ),
          ),
        ],
      ),
    );
  }
}

String _greeting(String? firstName) {
  final name = (firstName == null || firstName.trim().isEmpty)
      ? 'there'
      : firstName.trim().split(RegExp(r'\s+')).first;
  final now = DateTime.now();
  final hour = now.hour;
  final occasionalWelcomeBack = now.minute % 11 == 0;
  if (occasionalWelcomeBack) return 'Welcome Back, $name';
  if (hour >= 5 && hour < 12) return 'Good Morning, $name';
  if (hour >= 12 && hour < 17) return 'Good Afternoon, $name';
  return 'Good Evening, $name';
}

class _FloatingHeaderDelegate extends SliverPersistentHeaderDelegate {
  const _FloatingHeaderDelegate({required this.child});

  final Widget child;

  @override
  double get minExtent => 112;

  @override
  double get maxExtent => 120;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor.withValues(alpha: .94),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: child,
    );
  }

  @override
  bool shouldRebuild(covariant _FloatingHeaderDelegate oldDelegate) =>
      oldDelegate.child != child;
}

class _AnnouncementCarousel extends ConsumerStatefulWidget {
  const _AnnouncementCarousel({required this.banners});

  final List<FoodNovaAnnouncement> banners;

  @override
  ConsumerState<_AnnouncementCarousel> createState() =>
      _AnnouncementCarouselState();
}

class _AnnouncementCarouselState extends ConsumerState<_AnnouncementCarousel> {
  late final PageController _controller;
  Timer? _autoScrollTimer;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _scheduleAdvance(const Duration(seconds: 4));
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _scheduleAdvance(Duration delay) {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = Timer(delay, _advance);
  }

  void _advance() {
    if (!mounted || widget.banners.length < 2 || !_controller.hasClients) {
      return;
    }
    final next = (_index + 1) % widget.banners.length;
    _controller.animateToPage(
      next,
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
    );
    _scheduleAdvance(const Duration(seconds: 5));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final banners = widget.banners;
    if (banners.isEmpty) {
      return const SizedBox.shrink();
    }
    return Container(
      height: 198,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(28)),
      child: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: banners.length,
            onPageChanged: (value) {
              if (!mounted) return;
              setState(() => _index = value);
            },
            itemBuilder: (context, index) => _AnnouncementSlide(
              banner: banners[index],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 12,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < banners.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    width: i == _index ? 22 : 7,
                    height: 7,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: i == _index
                          ? FoodNovaColors.accent
                          : scheme.onPrimary.withValues(alpha: .58),
                      borderRadius: BorderRadius.circular(999),
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

class _AnnouncementSlide extends StatelessWidget {
  const _AnnouncementSlide({required this.banner});

  final FoodNovaAnnouncement banner;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            FoodNovaColors.primaryDark,
            FoodNovaColors.primary,
            FoodNovaColors.success,
          ],
        ),
        image: banner.imageUrl.isEmpty
            ? null
            : DecorationImage(
                image: NetworkImage(banner.imageUrl),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  scheme.shadow.withValues(alpha: .28),
                  BlendMode.darken,
                ),
              ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const StatusBadge(
              label: 'FoodNova update', tone: FoodNovaColors.accent),
          const Spacer(),
          Text(
            banner.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: scheme.onPrimary,
                  fontWeight: FontWeight.w900,
                  height: 1.02,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            banner.message,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style:
                TextStyle(color: scheme.onPrimary, fontWeight: FontWeight.w700),
          ),
          if (banner.buttonText.isNotEmpty) ...[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: () => _openBannerLink(context, banner.buttonLink),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  color: FoodNovaColors.accent,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  banner.buttonText,
                  style: TextStyle(
                    color: const Color(0xFF231B00),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

Future<void> _openBannerLink(BuildContext context, String link) async {
  if (link.trim().isEmpty) return;
  if (link.startsWith('/')) {
    context.push(link == '/products' ? '/discover' : link);
    return;
  }
  await launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
}

class _QuickActionRow extends StatelessWidget {
  const _QuickActionRow({
    required this.onExplore,
    required this.onOrders,
    required this.onSupport,
  });

  final VoidCallback onExplore;
  final VoidCallback onOrders;
  final VoidCallback onSupport;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final actions = [
      (Icons.local_fire_department_rounded, 'Deals', onExplore),
      (Icons.inventory_2_rounded, 'Packs', onExplore),
      (Icons.receipt_long_rounded, 'Orders', onOrders),
      (Icons.support_agent_rounded, 'Support', onSupport),
    ];
    return Row(
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: actions[i].$3,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 13),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: scheme.outlineVariant),
                  boxShadow: FoodNovaShadows.soft,
                ),
                child: Column(
                  children: [
                    Icon(actions[i].$1, color: FoodNovaColors.primary),
                    const SizedBox(height: 6),
                    Text(
                      actions[i].$2,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (i != actions.length - 1) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

Future<void> _openSupport(BuildContext context) async {
  final phone = AppConfig.supportPhone.replaceAll(RegExp(r'[^0-9]'), '');
  final uri = Uri.parse(
    'https://wa.me/$phone?text=${Uri.encodeComponent('Hello FoodNova, I need support with my order.')}',
  );
  await launchUrl(uri, mode: LaunchMode.externalApplication);
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
          child: _SectionTitle(
              title: 'Shop by category', action: 'View all', onTap: onTapAll),
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
              itemBuilder: (_, index) => _CategoryCard(
                  label: items[index],
                  icon: _categoryIcon(items[index]),
                  onTap: () => context.push('/discover')),
            ),
          ),
          loading: () => const SizedBox(
              height: 108,
              child: Row(children: [
                SkeletonBox(width: 128, height: 96),
                SizedBox(width: 12),
                SkeletonBox(width: 128, height: 96)
              ])),
          error: (_, __) => const Padding(
            padding: EdgeInsets.only(right: 20),
            child: EmptyState(
                title: 'Categories unavailable',
                message: 'Pull down to retry.',
                icon: Icons.category_outlined),
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard(
      {required this.label, required this.icon, required this.onTap});

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        width: 132,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: scheme.outlineVariant),
          boxShadow: FoodNovaShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
                radius: 20,
                backgroundColor: scheme.surfaceContainerHighest,
                child: Icon(icon, color: FoodNovaColors.primary)),
            const Spacer(),
            Text(label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontWeight: FontWeight.w900, height: 1.05)),
          ],
        ),
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
          child: _SectionTitle(title: 'Shop the FoodNova way'),
        ),
        SizedBox(height: 12),
        SizedBox(
          height: 184,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: BouncingScrollPhysics(),
            child: Row(
              children: [
                FulfillmentCard(
                    title: 'Fast grocery fulfillment',
                    subtitle: 'Prepared carefully from FoodNova inventory',
                    icon: Icons.inventory_2_rounded,
                    badges: ['Fresh stock', 'Quality checked']),
                SizedBox(width: 12),
                FulfillmentCard(
                    title: 'Order updates',
                    subtitle: 'Follow payment, packing, and delivery progress',
                    icon: Icons.receipt_long_rounded,
                    badges: ['Status sync', 'Alerts']),
                SizedBox(width: 20),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _OrderProcessSection extends StatelessWidget {
  const _OrderProcessSection();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const steps = [
      (
        'Place your order',
        'Add foodstuff and checkout',
        Icons.shopping_bag_rounded
      ),
      (
        'Pay & upload receipt',
        'Use your order code as reference',
        Icons.upload_file_rounded
      ),
      (
        'Track updates',
        'Follow confirmation and delivery status',
        Icons.timeline_rounded
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle(title: 'How ordering works'),
        const SizedBox(height: 12),
        for (final step in steps)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: scheme.outlineVariant),
              boxShadow: FoodNovaShadows.soft,
            ),
            child: Row(
              children: [
                CircleAvatar(
                    backgroundColor: scheme.surfaceContainerHighest,
                    child: Icon(step.$3, color: FoodNovaColors.primary)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(step.$1,
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 2),
                      Text(step.$2,
                          style: TextStyle(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ProductCarousel extends StatelessWidget {
  const _ProductCarousel(
      {required this.title,
      required this.products,
      required this.onTap,
      required this.onAdd,
      this.quantityOf,
      this.onIncrement,
      this.onDecrement});

  final String title;
  final List<Product> products;
  final ValueChanged<Product> onTap;
  final ValueChanged<Product> onAdd;
  final int Function(Product product)? quantityOf;
  final ValueChanged<Product>? onIncrement;
  final ValueChanged<Product>? onDecrement;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(right: 20),
        child: EmptyState(
            title: 'No products yet',
            message:
                'Products will appear once the backend catalog is populated.'),
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
                  onIncrement: () =>
                      (onIncrement ?? onAdd).call(products[index]),
                  onDecrement: () => onDecrement?.call(products[index])),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProductGridPreview extends StatelessWidget {
  const _ProductGridPreview(
      {required this.title,
      required this.products,
      required this.onTap,
      required this.onAdd,
      this.quantityOf,
      this.onIncrement,
      this.onDecrement});

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
        _SectionTitle(title: title),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: products.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: .56,
            crossAxisSpacing: 14,
            mainAxisSpacing: 14,
          ),
          itemBuilder: (context, index) => ProductCard(
              product: products[index],
              onTap: () => onTap(products[index]),
              onAdd: () => onAdd(products[index]),
              quantity: quantityOf?.call(products[index]) ?? 0,
              onIncrement: () => (onIncrement ?? onAdd).call(products[index]),
              onDecrement: () => onDecrement?.call(products[index])),
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
        Expanded(
            child: Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900))),
        if (action != null) TextButton(onPressed: onTap, child: Text(action!)),
      ],
    );
  }
}

class _HorizontalProductSkeleton extends StatelessWidget {
  const _HorizontalProductSkeleton({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
            padding: EdgeInsets.only(right: 20),
            child: _SectionTitle(title: title)),
        const SizedBox(height: 12),
        const SizedBox(
            height: 284,
            child: Row(children: [
              SkeletonBox(width: 174, height: 270, radius: 24),
              SizedBox(width: 14),
              SkeletonBox(width: 174, height: 270, radius: 24)
            ])),
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
      children:
          List.generate(4, (_) => const SkeletonBox(height: 230, radius: 24)),
    );
  }
}

IconData _categoryIcon(String label) {
  final value = label.toLowerCase();
  if (value.contains('rice') || value.contains('grain')) {
    return Icons.rice_bowl_rounded;
  }
  if (value.contains('fruit') || value.contains('fresh')) {
    return Icons.eco_rounded;
  }
  if (value.contains('drink') || value.contains('water')) {
    return Icons.local_drink_rounded;
  }
  if (value.contains('pack') || value.contains('bundle')) {
    return Icons.inventory_2_rounded;
  }
  return Icons.local_grocery_store_rounded;
}
