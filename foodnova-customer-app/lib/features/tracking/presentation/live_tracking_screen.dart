import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tracking_screen.dart';

String liveTrackingRoute(int orderId) => customerLiveTrackingRoute(orderId);

class LiveTrackingScreen extends ConsumerWidget {
  const LiveTrackingScreen({required this.orderId, super.key});

  final int orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TrackingScreen(orderId: orderId, liveOnly: true);
  }
}
