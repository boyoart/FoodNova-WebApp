import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../widgets/fn_button.dart';
import '../../../widgets/fn_shell.dart';
import '../data/cart_controller.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartControllerProvider);
    final cart = ref.read(cartControllerProvider.notifier);
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return FnShell(
      title: 'Cart',
      child: Column(
        children: [
          Expanded(
            child: items.isEmpty
                ? const Center(child: Text('Your cart is empty.'))
                : ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return Card(
                        child: ListTile(
                          title: Text(item.product.name),
                          subtitle: Text(currency.format(item.lineTotal)),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(onPressed: () => cart.updateQuantity(item.product.id, item.quantity - 1), icon: const Icon(Icons.remove_circle_outline)),
                              Text('${item.quantity}'),
                              IconButton(onPressed: () => cart.updateQuantity(item.product.id, item.quantity + 1), icon: const Icon(Icons.add_circle_outline)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          Text('Total ${currency.format(cart.total)}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          FnButton(label: 'Checkout', onPressed: items.isEmpty ? null : () => context.go('/checkout')),
        ],
      ),
    );
  }
}
