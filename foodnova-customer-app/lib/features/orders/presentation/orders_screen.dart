import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/order.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../data/orders_repository.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    final currency = NumberFormat.currency(
        locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return MobileAppScaffold(
      selectedIndex: 3,
      title: 'Orders',
      body: SafeArea(
        bottom: false,
        child: orders.when(
          data: (items) {
            if (items.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  title: 'No orders yet',
                  message:
                      'Your FoodNova order history will appear here after checkout.',
                  icon: Icons.receipt_long_outlined,
                ),
              );
            }
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(ordersProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 112),
                children: [
                  Text(
                    'Your Orders',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        color: FoodNovaColors.primary,
                        fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Track current deliveries and review past grocery hauls.',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        height: 1.35),
                  ),
                  const SizedBox(height: 24),
                  for (var index = 0; index < items.length; index++) ...[
                    if (index == 0)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Text(
                          'Current order',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      )
                    else if (index == 1)
                      Padding(
                        padding: const EdgeInsets.only(top: 12, bottom: 10),
                        child: Text(
                          'Order history',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      ),
                    _OrderCard(
                      order: items[index],
                      amount: currency.format(items[index].totalAmount),
                      featured: index == 0,
                      onTap: () => context.push('/tracking/${items[index].id}'),
                    ),
                    const SizedBox(height: 14),
                  ],
                ],
              ),
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.all(20),
            child: Column(
              children: [
                SkeletonBox(height: 118, radius: 24),
                SizedBox(height: 12),
                SkeletonBox(height: 118, radius: 24),
              ],
            ),
          ),
          error: (error, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: EmptyState(
                title: 'Could not load orders',
                message: error.toString(),
                icon: Icons.wifi_off_rounded),
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard(
      {required this.order,
      required this.amount,
      required this.onTap,
      this.featured = false});

  final OrderSummary order;
  final String amount;
  final VoidCallback onTap;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    final status = _friendlyStatus(order.status, order.paymentStatus);
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.all(featured ? 0 : 16),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: scheme.outlineVariant),
          boxShadow: FoodNovaShadows.soft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (featured)
              Container(
                height: 130,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                ),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _RouteMapPainter(
                          color: FoodNovaColors.primary.withValues(alpha: .28),
                        ),
                      ),
                    ),
                    const Center(
                      child: Icon(Icons.delivery_dining_rounded,
                          color: FoodNovaColors.primary, size: 42),
                    ),
                  ],
                ),
              ),
            if (featured) const SizedBox(height: 16),
            if (featured)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    StatusBadge(
                        label: status,
                        tone: _statusTone(order.status, order.paymentStatus)),
                    const Spacer(),
                    Text(amount,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            if (featured) const SizedBox(height: 12),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: featured ? 16 : 0),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.receipt_long_rounded,
                        color: FoodNovaColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(order.orderCode,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 16)),
                        const SizedBox(height: 4),
                        Text(
                          order.deliveryAddress.isEmpty
                              ? featured
                                  ? 'Arriving soon'
                                  : 'FoodNova order'
                              : order.deliveryAddress,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ),
            if (!featured) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge(
                      label: status,
                      tone: _statusTone(order.status, order.paymentStatus)),
                  StatusBadge(label: amount, tone: FoodNovaColors.accent),
                  if (order.paymentStatus.isNotEmpty)
                    StatusBadge(
                        label: _labelize(order.paymentStatus),
                        tone: FoodNovaColors.success),
                ],
              ),
            ] else
              const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _RouteMapPainter extends CustomPainter {
  const _RouteMapPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = color.withValues(alpha: .22)
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 22) {
      canvas.drawLine(Offset(x, 0), Offset(x + 42, size.height), gridPaint);
    }
    for (var y = 0.0; y < size.height; y += 24) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 16), gridPaint);
    }
    final route = Path()
      ..moveTo(size.width * .14, size.height * .72)
      ..cubicTo(size.width * .35, size.height * .18, size.width * .62,
          size.height * .92, size.width * .86, size.height * .32);
    final routePaint = Paint()
      ..color = FoodNovaColors.primary
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(route, routePaint);
  }

  @override
  bool shouldRepaint(covariant _RouteMapPainter oldDelegate) =>
      oldDelegate.color != color;
}

String _friendlyStatus(String status, String payment) {
  if (payment == 'pending_payment') {
    return 'Awaiting payment';
  }
  if (payment == 'receipt_submitted') {
    return 'Receipt under review';
  }
  return _labelize(status.isEmpty ? payment : status);
}

String _labelize(String value) {
  final cleaned = value.replaceAll('_', ' ').trim();
  if (cleaned.isEmpty) {
    return 'Order placed';
  }
  return cleaned
      .split(' ')
      .map((part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

Color _statusTone(String status, String payment) {
  final value = '$status $payment'.toLowerCase();
  if (value.contains('reject') || value.contains('cancel')) {
    return FoodNovaColors.danger;
  }
  if (value.contains('deliver') || value.contains('confirm')) {
    return FoodNovaColors.success;
  }
  if (value.contains('receipt') || value.contains('process')) {
    return FoodNovaColors.warning;
  }
  return FoodNovaColors.primary;
}
