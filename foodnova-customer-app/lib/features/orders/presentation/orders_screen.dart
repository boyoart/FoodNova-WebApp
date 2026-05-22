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
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
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
                  message: 'Your FoodNova order history will appear here after checkout.',
                  icon: Icons.receipt_long_outlined,
                ),
              );
            }
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(ordersProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 112),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final order = items[index];
                  return _OrderCard(
                    order: order,
                    amount: currency.format(order.totalAmount),
                    onTap: () => context.go('/tracking/${order.id}'),
                  );
                },
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
            child: EmptyState(title: 'Could not load orders', message: error.toString(), icon: Icons.wifi_off_rounded),
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.amount, required this.onTap});

  final OrderSummary order;
  final String amount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = _friendlyStatus(order.status, order.paymentStatus);
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: FoodNovaColors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: FoodNovaColors.border),
          boxShadow: FoodNovaShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: FoodNovaColors.surface2,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.receipt_long_rounded, color: FoodNovaColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.orderCode, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                      const SizedBox(height: 4),
                      Text(
                        order.deliveryAddress.isEmpty ? 'FoodNova order' : order.deliveryAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: FoodNovaColors.muted),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusBadge(label: status, tone: _statusTone(order.status, order.paymentStatus)),
                StatusBadge(label: amount, tone: FoodNovaColors.accent),
                if (order.paymentStatus.isNotEmpty) StatusBadge(label: _labelize(order.paymentStatus), tone: FoodNovaColors.success),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: const [
                Expanded(child: _MiniAction(icon: Icons.refresh_rounded, label: 'Refresh')),
                SizedBox(width: 8),
                Expanded(child: _MiniAction(icon: Icons.upload_file_rounded, label: 'Receipt')),
                SizedBox(width: 8),
                Expanded(child: _MiniAction(icon: Icons.support_agent_rounded, label: 'Support')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniAction extends StatelessWidget {
  const _MiniAction({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      decoration: BoxDecoration(
        color: FoodNovaColors.surface2,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 16, color: FoodNovaColors.primary),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

String _friendlyStatus(String status, String payment) {
  if (payment == 'pending_payment') return 'Awaiting payment';
  if (payment == 'receipt_submitted') return 'Receipt under review';
  return _labelize(status.isEmpty ? payment : status);
}

String _labelize(String value) {
  final cleaned = value.replaceAll('_', ' ').trim();
  if (cleaned.isEmpty) return 'Order placed';
  return cleaned.split(' ').map((part) => part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}').join(' ');
}

Color _statusTone(String status, String payment) {
  final value = '$status $payment'.toLowerCase();
  if (value.contains('reject') || value.contains('cancel')) return FoodNovaColors.danger;
  if (value.contains('deliver') || value.contains('confirm')) return FoodNovaColors.success;
  if (value.contains('receipt') || value.contains('process')) return FoodNovaColors.warning;
  return FoodNovaColors.primary;
}
