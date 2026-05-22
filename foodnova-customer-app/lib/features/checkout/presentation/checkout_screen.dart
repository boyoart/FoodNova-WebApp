import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

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
            deliveryFee: 0,
            paymentMethod: 'bank_transfer',
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
    final items = ref.watch(cartControllerProvider);
    final subtotal = items.fold<double>(0, (sum, item) => sum + item.lineTotal);
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
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
                  const SizedBox(height: 18),
                  Text('Payment', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: FoodNovaColors.surface2,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: FoodNovaColors.border),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.account_balance_rounded, color: FoodNovaColors.primary),
                            SizedBox(width: 8),
                            Text('Bank transfer', style: TextStyle(fontWeight: FontWeight.w900)),
                          ],
                        ),
                        SizedBox(height: 8),
                        Text('Account: 6427173992 • OPay • FOODNOVA LIMITED', style: TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w700)),
                        SizedBox(height: 6),
                        Text('Use your order code as payment reference after placing the order.', style: TextStyle(color: FoodNovaColors.muted)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  _CheckoutRow(label: 'Subtotal', value: currency.format(subtotal)),
                  const _CheckoutRow(label: 'Delivery fee', value: 'Paid after delivery'),
                  const Divider(height: 24),
                  _CheckoutRow(label: 'Amount to transfer now', value: currency.format(subtotal), strong: true),
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

class _CheckoutRow extends StatelessWidget {
  const _CheckoutRow({required this.label, required this.value, this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: strong ? FoodNovaColors.text : FoodNovaColors.muted, fontWeight: strong ? FontWeight.w900 : FontWeight.w700)),
          const Spacer(),
          Text(value, style: TextStyle(fontWeight: FontWeight.w900, color: strong ? FoodNovaColors.primary : FoodNovaColors.text)),
        ],
      ),
    );
  }
}
