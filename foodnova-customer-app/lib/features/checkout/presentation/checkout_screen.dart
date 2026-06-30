import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/address.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/primary_button.dart';
import '../../cart/data/cart_controller.dart';
import '../../profile/data/profile_repository.dart';
import '../data/checkout_repository.dart';
import 'address_form_sheet.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  CustomerAddress? _selectedAddress;
  String _deliveryMethod = 'standard';
  String _paymentMethod = 'bank_transfer';
  final _deliveryNotes = TextEditingController();
  bool _loading = false;
  String _error = '';

  @override
  void dispose() {
    _deliveryNotes.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    FocusScope.of(context).unfocus();
    final address = _selectedAddress;
    if (address == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Select or add a delivery address first.')));
      return;
    }
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final checkoutRepository = ref.read(checkoutRepositoryProvider);
      final cartController = ref.read(cartControllerProvider.notifier);
      final order = await checkoutRepository.createOrder(
        items: ref.read(cartControllerProvider),
        address: address.formatted,
        phone: address.phone,
        deliveryFee: 0,
        paymentMethod: _paymentMethod,
        selectedAddress: address,
        notes: _deliveryNotes.text.trim(),
      );
      if (!mounted) return;
      cartController.clear();
      await _showSuccess(order);
      if (!mounted) return;
      context.pushReplacement('/tracking/${order['id']}');
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      if (!mounted) return;
      setState(() => _error = message);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addOrEditAddress({CustomerAddress? address}) async {
    final profile = ref.read(profileProvider).valueOrNull;
    final saved = await showAddressFormSheet(
      context,
      ref,
      initial: address,
      fallbackName: profile?.fullName,
      fallbackPhone: profile?.phone,
    );
    if (saved != null && mounted) {
      ref.invalidate(profileProvider);
      setState(() => _selectedAddress = saved);
    }
  }

  Future<void> _deleteAddress(CustomerAddress address) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete address?'),
        content: Text(address.formatted),
        actions: [
          TextButton(
              onPressed: () {
                if (context.mounted) Navigator.pop(context, false);
              },
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () {
                if (context.mounted) Navigator.pop(context, true);
              },
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) {
      return;
    }
    if (!mounted) return;
    final repository = ref.read(profileRepositoryProvider);
    await repository.deleteAddress(address.id);
    if (!mounted) return;
    ref.invalidate(profileProvider);
    if (!mounted) return;
    if (_selectedAddress?.id == address.id) {
      setState(() => _selectedAddress = null);
    }
  }

  Future<void> _setDefault(CustomerAddress address) async {
    if (!mounted) return;
    final repository = ref.read(profileRepositoryProvider);
    await repository.setDefaultAddress(address.id);
    if (!mounted) return;
    ref.invalidate(profileProvider);
    if (!mounted) return;
    setState(() => _selectedAddress = address.copyWith(isDefault: true));
  }

  Future<void> _showSuccess(Map<String, dynamic> order) async {
    if (!mounted) return;
    final scheme = Theme.of(context).colorScheme;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 34,
              backgroundColor: FoodNovaColors.primary,
              foregroundColor: scheme.onPrimary,
              child: const Icon(Icons.check_rounded, size: 34),
            ),
            const SizedBox(height: 16),
            Text(
              'Order placed',
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              'FoodNova will confirm payment, pack your items, and update tracking automatically.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.4,
                  ),
            ),
            const SizedBox(height: 18),
            PrimaryButton(
              label: 'View tracking',
              icon: Icons.route_rounded,
              onPressed: () {
                if (context.mounted) Navigator.pop(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartControllerProvider);
    final profileState = ref.watch(profileProvider);
    final subtotal = items.fold<double>(0, (sum, item) => sum + item.lineTotal);
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SafeArea(
        child: items.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                    title: 'Your cart is empty',
                    message: 'Add FoodNova items before checkout.',
                    icon: Icons.shopping_bag_outlined),
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(profileProvider),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
                  children: [
                    _SectionCard(
                      title: 'Delivery address',
                      action: TextButton.icon(
                        onPressed: () => _addOrEditAddress(),
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Add'),
                      ),
                      child: profileState.when(
                        loading: () => const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                        error: (error, _) => EmptyState(
                            title: 'Addresses unavailable',
                            message: '$error',
                            icon: Icons.wifi_off_rounded),
                        data: (profile) {
                          final addresses = profile.addresses;
                          _selectedAddress ??= _defaultAddress(addresses);
                          if (addresses.isEmpty) {
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                    'Add a delivery address to continue checkout.',
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant)),
                                const SizedBox(height: 12),
                                PrimaryButton(
                                    label: 'Add delivery address',
                                    icon: Icons.add_location_alt_outlined,
                                    onPressed: () => _addOrEditAddress()),
                              ],
                            );
                          }
                          return Column(
                            children: [
                              for (final address in addresses)
                                _AddressChoiceCard(
                                  address: address,
                                  selected: _selectedAddress?.id == address.id,
                                  onSelect: () => setState(
                                      () => _selectedAddress = address),
                                  onEdit: () =>
                                      _addOrEditAddress(address: address),
                                  onDelete: () => _deleteAddress(address),
                                  onDefault: address.isDefault
                                      ? null
                                      : () => _setDefault(address),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),
                    _SectionCard(
                      title: 'Delivery method',
                      child: Column(
                        children: [
                          _DeliveryOption(
                            icon: Icons.bolt_rounded,
                            title: 'Priority',
                            subtitle: '10 - 20 mins after confirmation',
                            selected: _deliveryMethod == 'priority',
                            onTap: () =>
                                setState(() => _deliveryMethod = 'priority'),
                          ),
                          _DeliveryOption(
                            icon: Icons.local_shipping_rounded,
                            title: 'Standard',
                            subtitle: '30 - 45 mins after confirmation',
                            selected: _deliveryMethod == 'standard',
                            onTap: () =>
                                setState(() => _deliveryMethod = 'standard'),
                          ),
                          _DeliveryOption(
                            icon: Icons.schedule_rounded,
                            title: 'Schedule',
                            subtitle: 'Coordinate timing with FoodNova support',
                            selected: _deliveryMethod == 'scheduled',
                            onTap: () =>
                                setState(() => _deliveryMethod = 'scheduled'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _SectionCard(
                      title: 'Delivery instructions',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextField(
                            controller: _deliveryNotes,
                            minLines: 3,
                            maxLines: 5,
                            decoration: const InputDecoration(
                              prefixIcon: Icon(Icons.edit_note_rounded),
                              labelText: 'Notes for FoodNova or rider',
                              hintText:
                                  'Landmark, gate code, substitutions, or delivery timing',
                              alignLabelWithHint: true,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _deliveryMethod == 'scheduled'
                                ? 'Scheduled delivery requests are coordinated by FoodNova support after checkout.'
                                : 'Your ETA starts after payment confirmation and packing.',
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _SectionCard(
                      title: 'Payment',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _DeliveryOption(
                            icon: Icons.account_balance_rounded,
                            title: 'Bank transfer',
                            subtitle:
                                'Transfer to FoodNova and upload receipt after checkout',
                            selected: _paymentMethod == 'bank_transfer',
                            onTap: () => setState(
                                () => _paymentMethod = 'bank_transfer'),
                          ),
                          _DeliveryOption(
                            icon: Icons.credit_card_rounded,
                            title: 'Card payment',
                            subtitle:
                                'Available when card checkout is enabled by FoodNova',
                            selected: _paymentMethod == 'card',
                            onTap: () =>
                                setState(() => _paymentMethod = 'card'),
                          ),
                          const SizedBox(height: 6),
                          const _PaymentInfoRow(
                              label: 'Account number',
                              value: '6427173992',
                              copyable: true),
                          const _PaymentInfoRow(label: 'Bank', value: 'OPay'),
                          const _PaymentInfoRow(
                              label: 'Account name', value: 'FOODNOVA LIMITED'),
                          _PaymentInfoRow(
                              label: 'Narration',
                              value: 'Use your order code after placing order'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _SectionCard(
                      title: 'Order summary',
                      child: Column(
                        children: [
                          for (final item in items)
                            _CheckoutRow(
                                label:
                                    '${item.product.displayName} x ${item.quantity}',
                                value: currency.format(item.lineTotal)),
                          const Divider(height: 24),
                          _CheckoutRow(
                              label: 'Subtotal',
                              value: currency.format(subtotal)),
                          const _CheckoutRow(
                              label: 'Delivery fee',
                              value: 'Paid after delivery'),
                          const Divider(height: 24),
                          _CheckoutRow(
                              label: 'Amount to transfer now',
                              value: currency.format(subtotal),
                              strong: true),
                          if (_error.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text(_error,
                                style: const TextStyle(
                                    color: FoodNovaColors.danger,
                                    fontWeight: FontWeight.w800)),
                          ],
                          const SizedBox(height: 18),
                          PrimaryButton(
                              label:
                                  _loading ? 'Placing order...' : 'Place order',
                              loading: _loading,
                              icon: Icons.lock_rounded,
                              onPressed: _loading ? null : _placeOrder),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _DeliveryOption extends StatelessWidget {
  const _DeliveryOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? FoodNovaColors.primary.withValues(alpha: .12)
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? FoodNovaColors.primary : scheme.outlineVariant,
            width: selected ? 1.4 : 1,
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor:
                  selected ? FoodNovaColors.primary : scheme.surface,
              foregroundColor:
                  selected ? scheme.onPrimary : FoodNovaColors.primary,
              child: Icon(icon, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              color:
                  selected ? FoodNovaColors.primary : scheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

CustomerAddress? _defaultAddress(List<CustomerAddress> addresses) {
  for (final address in addresses) {
    if (address.isDefault) return address;
  }
  return addresses.isNotEmpty ? addresses.first : null;
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child, this.action});

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(title,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w900))),
              if (action != null) action!,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _AddressChoiceCard extends StatelessWidget {
  const _AddressChoiceCard({
    required this.address,
    required this.selected,
    required this.onSelect,
    required this.onEdit,
    required this.onDelete,
    this.onDefault,
  });

  final CustomerAddress address;
  final bool selected;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onDefault;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onSelect,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? FoodNovaColors.accent.withValues(alpha: .34)
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? FoodNovaColors.primary : scheme.outlineVariant,
              width: selected ? 1.3 : 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: FoodNovaColors.primary),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(
                        address.label.isEmpty ? 'Address' : address.label,
                        style: const TextStyle(fontWeight: FontWeight.w900))),
                if (address.isDefault)
                  const Text('Default',
                      style: TextStyle(
                          color: FoodNovaColors.primary,
                          fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 6),
            Text('${address.recipientName} • ${address.phone}',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(address.formatted,
                style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                TextButton(onPressed: onEdit, child: const Text('Edit')),
                if (onDefault != null)
                  TextButton(
                      onPressed: onDefault, child: const Text('Set default')),
                TextButton(
                    onPressed: onDelete,
                    child: const Text('Delete',
                        style: TextStyle(color: FoodNovaColors.danger))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentInfoRow extends StatelessWidget {
  const _PaymentInfoRow(
      {required this.label, required this.value, this.copyable = false});

  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return _CheckoutRow(
      label: label,
      value: value,
      trailing: copyable
          ? IconButton(
              tooltip: 'Copy',
              onPressed: () {
                Clipboard.setData(ClipboardData(text: value));
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text('$label copied')));
              },
              icon: const Icon(Icons.copy_rounded, size: 18),
            )
          : null,
    );
  }
}

class _CheckoutRow extends StatelessWidget {
  const _CheckoutRow(
      {required this.label,
      required this.value,
      this.strong = false,
      this.trailing});

  final String label;
  final String value;
  final bool strong;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(
                      color:
                          strong ? scheme.onSurface : scheme.onSurfaceVariant,
                      fontWeight: strong ? FontWeight.w900 : FontWeight.w700))),
          const SizedBox(width: 12),
          Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color:
                          strong ? FoodNovaColors.primary : scheme.onSurface))),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
