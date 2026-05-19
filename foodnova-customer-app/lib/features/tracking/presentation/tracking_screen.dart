import 'package:flutter/material.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/fn_shell.dart';

class TrackingScreen extends StatelessWidget {
  const TrackingScreen({required this.orderId, super.key});

  final int orderId;

  @override
  Widget build(BuildContext context) {
    return FnShell(
      title: 'Order tracking',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Order #$orderId', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 18),
          const _StepTile(title: 'Order placed', active: true),
          const _StepTile(title: 'Payment confirmation', active: true),
          const _StepTile(title: 'Neighborhood fulfillment', active: false),
          const _StepTile(title: 'Rider or walking dispatch', active: false),
          const _StepTile(title: 'Delivered', active: false),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: FoodNovaColors.deepGreen, borderRadius: BorderRadius.circular(24)),
            child: const Text('Live rider tracking is prepared for Socket.IO or Firebase Realtime Database in Phase 2.', style: TextStyle(color: FoodNovaColors.cream)),
          ),
        ],
      ),
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.title, required this.active});

  final String title;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(active ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: active ? FoodNovaColors.deepGreen : null),
      title: Text(title),
    );
  }
}

