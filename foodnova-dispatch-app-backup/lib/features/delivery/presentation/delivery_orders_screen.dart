import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../notifications/data/notifications_repository.dart';
import '../data/dispatch_repository.dart';
import '../domain/dispatch_models.dart';

class DeliveryOrdersScreen extends ConsumerWidget {
  const DeliveryOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(notificationRefreshProvider, (_, __) {
      ref.invalidate(deliveryOrdersProvider);
    });
    final orders = ref.watch(deliveryOrdersProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/dashboard');
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Assigned Orders')),
        body: RefreshIndicator(
          onRefresh: () async => ref.invalidate(deliveryOrdersProvider),
          child: orders.when(
            data: (items) => ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (items.isEmpty)
                  const FnCard(
                    child: Text(
                      'No assigned orders yet. Stay online for dispatch.',
                    ),
                  )
                else
                  for (final order in items) _DeliveryOrderCard(order: order),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ListView(
              padding: const EdgeInsets.all(16),
              children: [FnCard(child: Text(apiMessage(error)))],
            ),
          ),
        ),
        bottomNavigationBar: _DispatchTabBar(selectedIndex: 1),
      ),
    );
  }
}

class _DispatchTabBar extends StatelessWidget {
  const _DispatchTabBar({required this.selectedIndex});
  final int selectedIndex;

  @override
  Widget build(BuildContext context) {
    const routes = ['/dashboard', '/orders', '/history', '/settings'];
    return NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) => context.go(routes[index]),
      destinations: const [
        NavigationDestination(
            icon: Icon(Icons.dashboard_outlined), label: 'Home'),
        NavigationDestination(
            icon: Icon(Icons.assignment_outlined), label: 'Orders'),
        NavigationDestination(
            icon: Icon(Icons.history_outlined), label: 'History'),
        NavigationDestination(
            icon: Icon(Icons.settings_outlined), label: 'Settings'),
      ],
    );
  }
}

class _DeliveryOrderCard extends StatelessWidget {
  const _DeliveryOrderCard({required this.order});
  final DeliveryOrder order;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: FnCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.orderCode,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                ),
                _StatusChip(status: order.status),
              ],
            ),
            const SizedBox(height: 10),
            Text('Pickup: ${order.pickup}'),
            Text('Customer: ${order.customerName}'),
            if (order.customerPhone.isNotEmpty)
              Text('Phone: ${order.customerPhone}'),
            Text('Dropoff: ${order.dropoff}'),
            if (order.instructions.isNotEmpty)
              Text('Instructions: ${order.instructions}'),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () =>
                  context.push('/active-delivery', extra: order.asOffer().raw),
              icon: const Icon(Icons.local_shipping_outlined),
              label: const Text('Open Delivery Workflow'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: FoodNovaColors.surface2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: FoodNovaColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          status.replaceAll('_', ' '),
          style: const TextStyle(
            color: FoodNovaColors.primaryDark,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
