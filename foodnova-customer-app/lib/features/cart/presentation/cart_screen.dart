import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/primary_button.dart';
import '../../products/presentation/product_image.dart';
import '../data/cart_controller.dart';

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final _promo = TextEditingController();
  final _notes = TextEditingController();

  @override
  void dispose() {
    _promo.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartControllerProvider);
    final cart = ref.read(cartControllerProvider.notifier);
    final scheme = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);

    return MobileAppScaffold(
      selectedIndex: 2,
      title: 'Cart',
      floatingCart: false,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            items.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(24),
                    child: EmptyState(
                        title: 'Your basket is empty',
                        message:
                            'Add market staples, packs, and fresh essentials from Home.',
                        icon: Icons.shopping_bag_outlined),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 10, 20, 260),
                    itemCount: items.length + 1,
                    separatorBuilder: (_, __) => const SizedBox(height: 16),
                    itemBuilder: (context, index) {
                      if (index == items.length) {
                        return _CartPreferencesCard(
                          promoController: _promo,
                          notesController: _notes,
                        );
                      }
                      final item = items[index];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: scheme.surface.withValues(alpha: .82),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: FoodNovaShadows.soft,
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 82,
                              height: 82,
                              clipBehavior: Clip.antiAlias,
                              decoration: BoxDecoration(
                                  color: scheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(20)),
                              child: ProductImage(
                                product: item.product,
                                showPlaceholderBanner: false,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.product.displayName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w900)),
                                  const SizedBox(height: 4),
                                  Text(currency.format(item.lineTotal),
                                      style: const TextStyle(
                                          color: FoodNovaColors.primary,
                                          fontWeight: FontWeight.w900)),
                                  const SizedBox(height: 4),
                                  Text(
                                    item.product.category.isEmpty
                                        ? 'FoodNova grocery'
                                        : item.product.category,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        color: scheme.onSurfaceVariant,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                            _QuantityStepper(
                              quantity: item.quantity,
                              onMinus: () => cart.updateQuantity(
                                  item.product.cartKey, item.quantity - 1),
                              onPlus: () => cart.updateQuantity(
                                  item.product.cartKey, item.quantity + 1),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
            if (items.isNotEmpty)
              Positioned(
                left: 20,
                right: 20,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: scheme.surface.withValues(alpha: .92),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: scheme.outlineVariant),
                    boxShadow: FoodNovaShadows.nav,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Text('Amount to transfer',
                              style: TextStyle(
                                  color: scheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w800)),
                          const Spacer(),
                          Text(currency.format(cart.total),
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w900)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      _SummaryLine(
                        label: 'Subtotal',
                        value: currency.format(cart.total),
                      ),
                      const _SummaryLine(
                        label: 'Delivery fee',
                        value: 'Paid to rider after delivery',
                      ),
                      const _SummaryLine(
                        label: 'Estimated arrival',
                        value: '30 - 45 mins after confirmation',
                      ),
                      const SizedBox(height: 12),
                      PrimaryButton(
                          label: 'Checkout',
                          icon: Icons.arrow_forward_rounded,
                          onPressed: () => _openCheckoutOrAuthPrompt()),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCheckoutOrAuthPrompt() async {
    final authenticated =
        ref.read(sessionControllerProvider).valueOrNull == true;
    if (authenticated) {
      if (mounted) context.push('/checkout');
      return;
    }
    String? authTarget;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        final scheme = Theme.of(sheetContext).colorScheme;
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: FoodNovaColors.primary,
                foregroundColor: scheme.onPrimary,
                child: const Icon(Icons.lock_rounded),
              ),
              const SizedBox(height: 16),
              Text(
                'Sign in to checkout',
                textAlign: TextAlign.center,
                style: Theme.of(sheetContext)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text(
                'Your cart will stay here. Create an account or sign in to save addresses, place orders, upload receipts, and track delivery.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.4,
                    ),
              ),
              const SizedBox(height: 18),
              PrimaryButton(
                label: 'Sign in',
                icon: Icons.login_rounded,
                onPressed: () {
                  authTarget = '/login';
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                },
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () {
                  authTarget = '/signup';
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                },
                icon: const Icon(Icons.person_add_alt_rounded),
                label: const Text('Create account'),
              ),
            ],
          ),
        );
      },
    );
    if (!mounted || authTarget == null) return;
    context.push(authTarget!);
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper(
      {required this.quantity, required this.onMinus, required this.onPlus});

  final int quantity;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(999)),
      child: Row(
        children: [
          IconButton(
              onPressed: onMinus,
              icon: const Icon(Icons.remove_rounded),
              visualDensity: VisualDensity.compact),
          Text('$quantity',
              style: const TextStyle(fontWeight: FontWeight.w900)),
          IconButton(
              onPressed: onPlus,
              icon: const Icon(Icons.add_rounded),
              visualDensity: VisualDensity.compact),
        ],
      ),
    );
  }
}

class _CartPreferencesCard extends StatelessWidget {
  const _CartPreferencesCard({
    required this.promoController,
    required this.notesController,
  });

  final TextEditingController promoController;
  final TextEditingController notesController;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Delivery preferences',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: promoController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.local_offer_rounded),
              labelText: 'Promo code',
              hintText: 'Enter code if available',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: notesController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.edit_note_rounded),
              labelText: 'Notes to rider',
              hintText: 'Gate code, landmark, or delivery instructions',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: FoodNovaColors.primary.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const Icon(Icons.schedule_rounded,
                    color: FoodNovaColors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Estimated arrival: 30 - 45 minutes after payment confirmation.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurface,
                          fontWeight: FontWeight.w800,
                          height: 1.3,
                        ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: scheme.onSurface,
                    fontWeight: FontWeight.w900,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
