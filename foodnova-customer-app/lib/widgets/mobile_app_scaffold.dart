import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/theme/colors.dart';
import '../core/theme/shadows.dart';
import '../features/cart/data/cart_controller.dart';

class MobileAppScaffold extends ConsumerStatefulWidget {
  const MobileAppScaffold({
    required this.body,
    required this.selectedIndex,
    this.title,
    this.actions = const [],
    this.floatingCart = true,
    super.key,
  });

  final Widget body;
  final int selectedIndex;
  final String? title;
  final List<Widget> actions;
  final bool floatingCart;

  @override
  ConsumerState<MobileAppScaffold> createState() => _MobileAppScaffoldState();
}

class _MobileAppScaffoldState extends ConsumerState<MobileAppScaffold> {
  DateTime? _lastBackPress;
  late final ScrollController _scrollController;
  bool _miniCartVisible = true;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (!mounted) return;
    if (!_scrollController.hasClients) return;
    final direction = _scrollController.position.userScrollDirection;
    final shouldShow = direction != ScrollDirection.reverse;
    if (_miniCartVisible != shouldShow) {
      if (!mounted) return;
      setState(() => _miniCartVisible = shouldShow);
    }
  }

  Future<void> _handleBack() async {
    final router = GoRouter.of(context);
    final path = GoRouterState.of(context).uri.path;
    if (router.canPop()) {
      router.pop();
      return;
    }
    if (path != '/home') {
      context.go('/home');
      return;
    }

    final now = DateTime.now();
    final shouldExit = _lastBackPress != null &&
        now.difference(_lastBackPress!) < const Duration(seconds: 2);
    if (shouldExit) {
      await SystemNavigator.pop();
      return;
    }
    _lastBackPress = now;
    if (!mounted) return;
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        const SnackBar(
          content: Text('Press back again to exit'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 2),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final cartItems = ref.watch(cartControllerProvider);
    final cartCount =
        cartItems.fold<int>(0, (sum, item) => sum + item.quantity);
    final total =
        cartItems.fold<double>(0, (sum, item) => sum + item.lineTotal);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        appBar: widget.title == null
            ? null
            : AppBar(
                title: Text(widget.title!),
                actions: widget.actions,
              ),
        body: PrimaryScrollController(
          controller: _scrollController,
          child: Stack(
            children: [
              widget.body,
              if (widget.floatingCart && widget.selectedIndex != 2)
                _MiniCartBar(
                  visible: _miniCartVisible && cartCount > 0,
                  count: cartCount,
                  total: total,
                  onTap: () => context.go('/cart'),
                ),
            ],
          ),
        ),
        bottomNavigationBar: _NativeBottomNav(
          selectedIndex: widget.selectedIndex,
          cartCount: cartCount,
        ),
      ),
    );
  }
}

class _MiniCartBar extends StatelessWidget {
  const _MiniCartBar({
    required this.visible,
    required this.count,
    required this.total,
    required this.onTap,
  });

  final bool visible;
  final int count;
  final double total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return Positioned(
      left: 18,
      right: 18,
      bottom: 82,
      child: IgnorePointer(
        ignoring: !visible,
        child: AnimatedSlide(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          offset: visible ? Offset.zero : const Offset(0, 1.4),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 220),
            opacity: visible ? 1 : 0,
            child: Material(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(24),
              elevation: 14,
              shadowColor: FoodNovaColors.primaryDark.withValues(alpha: .35),
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: onTap,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: scheme.secondary,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(Icons.shopping_bag_rounded,
                            color: scheme.onSecondary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('$count item${count == 1 ? '' : 's'} in cart',
                                style: TextStyle(
                                    color: scheme.onPrimary,
                                    fontWeight: FontWeight.w900)),
                            Text(currency.format(total),
                                style: TextStyle(
                                    color:
                                        scheme.onPrimary.withValues(alpha: .82),
                                    fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                      Icon(Icons.arrow_forward_rounded,
                          color: scheme.onPrimary),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NativeBottomNav extends StatelessWidget {
  const _NativeBottomNav(
      {required this.selectedIndex, required this.cartCount});

  final int selectedIndex;
  final int cartCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const items = [
      _NavDestination('Home', Icons.home_rounded, '/home'),
      _NavDestination('Explore', Icons.explore_rounded, '/discover'),
      _NavDestination('Cart', Icons.shopping_bag_rounded, '/cart'),
      _NavDestination('Orders', Icons.receipt_long_rounded, '/orders'),
      _NavDestination('Profile', Icons.person_rounded, '/profile'),
    ];

    return SafeArea(
      top: false,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: .82),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: .65)),
              boxShadow: FoodNovaShadows.nav,
            ),
            child: Row(
              children: [
                for (var index = 0; index < items.length; index++)
                  Expanded(
                    child: _BottomNavItem(
                      item: items[index],
                      selected: selectedIndex == index,
                      badge: index == 2 ? cartCount : 0,
                      onTap: () => context.go(items[index].route),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.item,
    required this.selected,
    required this.onTap,
    this.badge = 0,
  });

  final _NavDestination item;
  final bool selected;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final icon = Icon(item.icon,
        size: 20, color: selected ? scheme.primary : scheme.onSurfaceVariant);
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(
            color: selected
                ? scheme.secondary.withValues(alpha: .95)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(19),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Badge(
                  isLabelVisible: badge > 0,
                  label: Text('$badge'),
                  child: icon),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  item.label,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
                    color:
                        selected ? scheme.onSecondary : scheme.onSurfaceVariant,
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

class _NavDestination {
  const _NavDestination(this.label, this.icon, this.route);

  final String label;
  final IconData icon;
  final String route;
}
