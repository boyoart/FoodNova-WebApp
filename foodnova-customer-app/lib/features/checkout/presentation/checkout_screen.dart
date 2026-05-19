import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/primary_button.dart';
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
  String _error = '';

  @override
  void dispose() {
    _address.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final order = await ref.read(checkoutRepositoryProvider).createOrder(
            items: ref.read(cartControllerProvider),
            address: _address.text,
            phone: _phone.text,
          );
      ref.read(cartControllerProvider.notifier).clear();
      if (mounted) context.go('/tracking/${order['id']}');
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() => _error = message);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: FoodNovaColors.surface,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: FoodNovaColors.border),
                boxShadow: FoodNovaShadows.soft,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Delivery details', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  const Text('Confirm where FoodNova should deliver your order.', style: TextStyle(color: FoodNovaColors.muted)),
                  const SizedBox(height: 18),
                  InputField(controller: _address, label: 'Delivery address', icon: Icons.location_on_outlined),
                  const SizedBox(height: 12),
                  InputField(controller: _phone, label: 'Phone number', icon: Icons.phone_outlined, keyboardType: TextInputType.phone),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(_error, style: const TextStyle(color: FoodNovaColors.danger, fontWeight: FontWeight.w800)),
                  ],
                  const SizedBox(height: 22),
                  PrimaryButton(label: _loading ? 'Placing order...' : 'Place order', loading: _loading, icon: Icons.lock_rounded, onPressed: _loading ? null : _placeOrder),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
