import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/floating_nav_bar.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../data/orders_repository.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: SafeArea(
        bottom: false,
        child: orders.when(
          data: (items) {
            if (items.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(title: 'No orders yet', message: 'Your FoodNova order history will appear here.', icon: Icons.receipt_long_outlined),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 112),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final order = items[index];
                return InkWell(
                  borderRadius: BorderRadius.circular(22),
                  onTap: () => context.go('/tracking/${order.id}'),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: FoodNovaColors.surface,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: FoodNovaColors.border),
                      boxShadow: FoodNovaShadows.soft,
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(backgroundColor: FoodNovaColors.surface2, child: Icon(Icons.receipt_long_rounded, color: FoodNovaColors.primary)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(order.orderCode, style: const TextStyle(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 6),
                              Wrap(spacing: 8, runSpacing: 6, children: [StatusBadge(label: order.status), StatusBadge(label: currency.format(order.totalAmount), tone: FoodNovaColors.accent)]),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.all(20),
            child: Column(children: [SkeletonBox(height: 86, radius: 22), SizedBox(height: 12), SkeletonBox(height: 86, radius: 22)]),
          ),
          error: (error, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: EmptyState(title: 'Could not load orders', message: error.toString(), icon: Icons.wifi_off_rounded),
          ),
        ),
      ),
      bottomNavigationBar: const FloatingNavBar(selectedIndex: 1),
    );
  }
}
