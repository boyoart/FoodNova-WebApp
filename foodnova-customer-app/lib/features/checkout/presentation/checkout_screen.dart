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
  String _paymentMethod = 'bank_transfer';

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
            deliveryFee: _deliveryFee(ref.read(cartControllerProvider).fold<double>(0, (sum, item) => sum + item.lineTotal)),
            paymentMethod: _paymentMethod,
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
    final deliveryFee = _deliveryFee(subtotal);
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
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'bank_transfer', label: Text('Transfer'), icon: Icon(Icons.account_balance_rounded)),
                      ButtonSegment(value: 'paystack', label: Text('Card'), icon: Icon(Icons.credit_card_rounded)),
                    ],
                    selected: {_paymentMethod},
                    onSelectionChanged: (value) => setState(() => _paymentMethod = value.first),
                  ),
                  const SizedBox(height: 18),
                  _CheckoutRow(label: 'Subtotal', value: currency.format(subtotal)),
                  _CheckoutRow(label: 'FoodNova delivery fee', value: currency.format(deliveryFee)),
                  const Divider(height: 24),
                  _CheckoutRow(label: 'Total', value: currency.format(subtotal + deliveryFee), strong: true),
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

double _deliveryFee(double subtotal) {
  if (subtotal <= 0) return 0;
  if (subtotal >= 50000) return 0;
  if (subtotal >= 20000) return 500;
  return 900;
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
