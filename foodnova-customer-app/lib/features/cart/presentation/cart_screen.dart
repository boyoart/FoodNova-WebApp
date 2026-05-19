import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/floating_nav_bar.dart';
import '../../../widgets/primary_button.dart';
import '../data/cart_controller.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartControllerProvider);
    final cart = ref.read(cartControllerProvider.notifier);
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: SafeArea(
        bottom: false,
        child: items.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(title: 'Your basket is empty', message: 'Add market staples, packs, and fresh essentials from Home.', icon: Icons.shopping_bag_outlined),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 180),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: FoodNovaColors.surface,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: FoodNovaColors.border),
                      boxShadow: FoodNovaShadows.soft,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 58,
                          height: 58,
                          decoration: BoxDecoration(color: FoodNovaColors.surface2, borderRadius: BorderRadius.circular(18)),
                          child: const Icon(Icons.shopping_basket_rounded, color: FoodNovaColors.primary),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.product.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 4),
                              Text(currency.format(item.lineTotal), style: const TextStyle(color: FoodNovaColors.primary, fontWeight: FontWeight.w900)),
                            ],
                          ),
                        ),
                        _QuantityStepper(
                          quantity: item.quantity,
                          onMinus: () => cart.updateQuantity(item.product.id, item.quantity - 1),
                          onPlus: () => cart.updateQuantity(item.product.id, item.quantity + 1),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (items.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
              decoration: const BoxDecoration(color: FoodNovaColors.bg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Text('Total', style: TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w800)),
                      const Spacer(),
                      Text(currency.format(cart.total), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  PrimaryButton(label: 'Checkout', icon: Icons.arrow_forward_rounded, onPressed: () => context.go('/checkout')),
                ],
              ),
            ),
          const FloatingNavBar(selectedIndex: 2),
        ],
      ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.quantity, required this.onMinus, required this.onPlus});

  final int quantity;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: FoodNovaColors.surface2, borderRadius: BorderRadius.circular(999)),
      child: Row(
        children: [
          IconButton(onPressed: onMinus, icon: const Icon(Icons.remove_rounded), visualDensity: VisualDensity.compact),
          Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w900)),
          IconButton(onPressed: onPlus, icon: const Icon(Icons.add_rounded), visualDensity: VisualDensity.compact),
        ],
      ),
    );
  }
}
