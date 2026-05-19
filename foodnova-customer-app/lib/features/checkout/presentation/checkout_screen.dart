import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/fn_button.dart';
import '../../../widgets/fn_shell.dart';
import '../../cart/data/cart_controller.dart';
import '../data/checkout_repository.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _address = TextEditingController();
  final _phone = TextEditingController();
  bool _loading = false;

  Future<void> _placeOrder() async {
    setState(() => _loading = true);
    try {
      final order = await ref.read(checkoutRepositoryProvider).createOrder(
            items: ref.read(cartControllerProvider),
            address: _address.text,
            phone: _phone.text,
          );
      ref.read(cartControllerProvider.notifier).clear();
      if (mounted) context.go('/tracking/${order['id']}');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FnShell(
      title: 'Checkout',
      child: ListView(
        children: [
          const Text('Delivery details'),
          const SizedBox(height: 16),
          TextField(controller: _address, decoration: const InputDecoration(labelText: 'Delivery address')),
          const SizedBox(height: 12),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone number')),
          const SizedBox(height: 24),
          FnButton(label: _loading ? 'Placing order...' : 'Place order', onPressed: _loading ? null : _placeOrder),
        ],
      ),
    );
  }
}
