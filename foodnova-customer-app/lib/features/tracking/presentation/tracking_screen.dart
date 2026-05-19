import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../services/realtime_service.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/skeleton_box.dart';
import '../../orders/data/orders_repository.dart';

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({required this.orderId, super.key});

  final int orderId;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  Map<String, dynamic> _live = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(realtimeServiceProvider).subscribeToOrder(widget.orderId, (payload) {
        if (mounted) setState(() => _live = payload);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Order tracking')),
      body: FutureBuilder(
        future: ref.read(ordersRepositoryProvider).order(widget.orderId),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Padding(
              padding: EdgeInsets.all(20),
              child: Column(children: [SkeletonBox(height: 140, radius: 26), SizedBox(height: 16), SkeletonBox(height: 260, radius: 26)]),
            );
          }
          if (snapshot.hasError || snapshot.data == null) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: EmptyState(title: 'Tracking unavailable', message: snapshot.error?.toString() ?? 'Order could not be loaded.', icon: Icons.wifi_off_rounded),
            );
          }
          final order = snapshot.data!;
          final status = '${_live['status'] ?? _live['order_status'] ?? order.status}'.toLowerCase();
          return ListView(
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.orderCode, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text(order.deliveryAddress.isEmpty ? 'FoodNova delivery address' : order.deliveryAddress, style: const TextStyle(color: FoodNovaColors.muted)),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        const Icon(Icons.delivery_dining_rounded, color: FoodNovaColors.primary),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_dispatchLabel(order.dispatcherType), style: const TextStyle(fontWeight: FontWeight.w900))),
                        Text('${_live['eta'] ?? 'ETA syncing'}', style: const TextStyle(color: FoodNovaColors.primary, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              _Timeline(status: status),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: FoodNovaColors.primaryDark, borderRadius: BorderRadius.circular(24)),
                child: const Text(
                  'Live status and rider movement sync through FoodNova realtime delivery events when the backend Socket.IO channel is available.',
                  style: TextStyle(color: FoodNovaColors.cream, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final steps = [
      _Step('pending_payment', 'Order placed', Icons.receipt_long_rounded),
      _Step('payment_confirmed', 'Payment confirmed', Icons.verified_rounded),
      _Step('processing', 'FoodNova fulfillment', Icons.inventory_2_rounded),
      _Step('out_for_delivery', 'Dispatcher assigned', Icons.delivery_dining_rounded),
      _Step('delivered', 'Delivered', Icons.check_circle_rounded),
    ];
    final activeIndex = _activeIndex(status, steps);
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++) _StepTile(step: steps[i], active: i <= activeIndex),
      ],
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.step, required this.active});

  final _Step step;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: active ? FoodNovaColors.primary : FoodNovaColors.surface2,
        child: Icon(step.icon, color: active ? Colors.white : FoodNovaColors.muted),
      ),
      title: Text(step.label, style: TextStyle(fontWeight: FontWeight.w900, color: active ? FoodNovaColors.text : FoodNovaColors.muted)),
    );
  }
}

class _Step {
  const _Step(this.key, this.label, this.icon);

  final String key;
  final String label;
  final IconData icon;
}

int _activeIndex(String status, List<_Step> steps) {
  if (status.contains('delivered')) return 4;
  if (status.contains('out') || status.contains('delivery') || status.contains('assigned')) return 3;
  if (status.contains('processing') || status.contains('confirmed')) return 2;
  if (status.contains('payment_confirmed') || status.contains('paid')) return 1;
  return 0;
}

String _dispatchLabel(String value) {
  final lower = value.toLowerCase();
  if (lower.contains('walk')) return 'Walking dispatcher';
  if (lower.contains('partner')) return 'Delivery partner';
  if (lower.contains('rider')) return 'FoodNova rider';
  return 'FoodNova dispatch';
}
