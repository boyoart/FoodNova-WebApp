import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
    final shouldExit = _lastBackPress != null && now.difference(_lastBackPress!) < const Duration(seconds: 2);
    if (shouldExit) {
      await SystemNavigator.pop();
      return;
    }
    _lastBackPress = now;
    if (!mounted) return;
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
    final cartCount = ref.watch(cartControllerProvider).fold<int>(0, (sum, item) => sum + item.quantity);
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        appBar: widget.title == null
            ? null
            : AppBar(
                title: Text(widget.title!),
                actions: widget.actions,
              ),
        body: widget.body,
        floatingActionButton: widget.floatingCart && widget.selectedIndex != 2
            ? _FloatingCartButton(count: cartCount, onTap: () => context.go('/cart'))
            : null,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
        bottomNavigationBar: _NativeBottomNav(
          selectedIndex: widget.selectedIndex,
          cartCount: cartCount,
        ),
      ),
    );
  }
}

class _FloatingCartButton extends StatelessWidget {
  const _FloatingCartButton({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: FloatingActionButton.extended(
          heroTag: 'foodnova-floating-cart',
          onPressed: onTap,
          backgroundColor: FoodNovaColors.primaryDark,
          foregroundColor: Colors.white,
          elevation: 10,
          icon: const Icon(Icons.shopping_bag_rounded),
          label: const Text('Cart', style: TextStyle(fontWeight: FontWeight.w900)),
        ),
      ),
    );
  }
}

class _NativeBottomNav extends StatelessWidget {
  const _NativeBottomNav({required this.selectedIndex, required this.cartCount});

  final int selectedIndex;
  final int cartCount;

  @override
  Widget build(BuildContext context) {
    const items = [
      _NavDestination('Home', Icons.home_rounded, '/home'),
      _NavDestination('Categories', Icons.grid_view_rounded, '/categories'),
      _NavDestination('Cart', Icons.shopping_bag_rounded, '/cart'),
      _NavDestination('Orders', Icons.receipt_long_rounded, '/orders'),
      _NavDestination('Profile', Icons.person_rounded, '/profile'),
    ];

    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        decoration: BoxDecoration(
          color: FoodNovaColors.surface,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: FoodNovaColors.border),
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
    final icon = Icon(item.icon, size: 22, color: selected ? FoodNovaColors.primaryDark : FoodNovaColors.muted);
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
          height: 54,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            color: selected ? FoodNovaColors.accent.withOpacity(.95) : Colors.transparent,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: icon),
              const SizedBox(height: 3),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  item.label,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
                    color: selected ? FoodNovaColors.primaryDark : FoodNovaColors.muted,
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
