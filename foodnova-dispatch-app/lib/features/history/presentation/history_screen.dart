import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../delivery/data/dispatch_repository.dart';
import '../../delivery/domain/dispatch_models.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(deliveryHistoryProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/dashboard');
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Delivery history')),
        body: RefreshIndicator(
          onRefresh: () async => ref.invalidate(deliveryHistoryProvider),
          child: history.when(
            data: (items) {
              final needle = query.trim().toLowerCase();
              final filtered = needle.isEmpty
                  ? items
                  : items.where((order) {
                      return order.orderCode.toLowerCase().contains(needle) ||
                          order.customerName.toLowerCase().contains(needle) ||
                          order.status.toLowerCase().contains(needle);
                    }).toList();
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      labelText: 'Search by customer, order, or status',
                    ),
                    onChanged: (value) => setState(() => query = value),
                  ),
                  const SizedBox(height: 16),
                  if (filtered.isEmpty)
                    const FnCard(
                      child: Text('No completed delivery history yet.'),
                    )
                  else
                    for (final order in filtered) _HistoryCard(order: order),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ListView(
              padding: const EdgeInsets.all(16),
              children: [FnCard(child: Text(apiMessage(error)))],
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.order});

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
                _HistoryStatusChip(status: order.status),
              ],
            ),
            const SizedBox(height: 10),
            Text('Customer: ${order.customerName}'),
            Text('Dropoff: ${order.dropoff}'),
            if (order.assignedAt != null)
              Text('Assigned: ${order.assignedAt!.toLocal()}'),
          ],
        ),
      ),
    );
  }
}

class _HistoryStatusChip extends StatelessWidget {
  const _HistoryStatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final delivered = status.toUpperCase() == 'DELIVERED';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: delivered
            ? FoodNovaColors.success.withValues(alpha: .12)
            : FoodNovaColors.surface2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: delivered ? FoodNovaColors.success : FoodNovaColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          status.replaceAll('_', ' '),
          style: TextStyle(
            color:
                delivered ? FoodNovaColors.success : FoodNovaColors.primaryDark,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
