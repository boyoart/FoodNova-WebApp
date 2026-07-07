import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/colors.dart';
import '../core/theme/shadows.dart';

class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({required this.selectedIndex, super.key});

  final int selectedIndex;

  @override
  Widget build(BuildContext context) {
    final items = [
      _NavItem('Home', Icons.home_rounded, '/home'),
      _NavItem('Orders', Icons.receipt_long_rounded, '/orders'),
      _NavItem('Cart', Icons.shopping_bag_rounded, '/cart'),
      _NavItem('Profile', Icons.person_rounded, '/profile'),
    ];

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: FoodNovaColors.primaryDark,
            borderRadius: BorderRadius.circular(28),
            boxShadow: FoodNovaShadows.nav,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              children: [
                for (var index = 0; index < items.length; index++)
                  Expanded(
                    child: _NavButton(
                      item: items[index],
                      selected: selectedIndex == index,
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

class _NavButton extends StatelessWidget {
  const _NavButton({required this.item, required this.selected, required this.onTap});

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: selected ? FoodNovaColors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(item.icon, color: selected ? FoodNovaColors.primaryDark : Colors.white70, size: 22),
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                child: selected
                    ? Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Text(
                          item.label,
                          overflow: TextOverflow.fade,
                          softWrap: false,
                          style: const TextStyle(color: FoodNovaColors.primaryDark, fontWeight: FontWeight.w900, fontSize: 12),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.label, this.icon, this.route);

  final String label;
  final IconData icon;
  final String route;
}
