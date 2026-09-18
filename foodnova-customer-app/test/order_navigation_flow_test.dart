import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:foodnova_customer_app/features/orders/data/orders_repository.dart';
import 'package:foodnova_customer_app/features/orders/presentation/orders_screen.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/live_tracking_screen.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/tracking_screen.dart';
import 'package:foodnova_customer_app/shared/models/order.dart';

void main() {
  testWidgets(
      'Orders opens Details, Track Live opens Live Delivery, Back returns',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 932));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final order = OrderSummary.fromJson({
      'id': 25,
      'order_code': 'FN-025',
      'delivery_method': 'delivery',
      'delivery_address': 'Supported local address',
      'rider_id': 7,
      'rider_name': 'Test Rider',
      'rider_phone': '+2348000000000',
      'delivery_status': 'IN_TRANSIT',
      'status': 'processing',
      'payment_status': 'payment_confirmed',
      'total_amount': 1300,
      'items': [
        {'product_name': 'Rice', 'quantity': 1, 'price': 1300},
      ],
    });
    final router = GoRouter(
      initialLocation: '/orders',
      routes: [
        GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
        GoRoute(
          path: '/orders/:id',
          builder: (_, state) => TrackingScreen(
            orderId: int.parse(state.pathParameters['id']!),
          ),
        ),
        GoRoute(
          path: '/orders/:id/live-tracking',
          builder: (_, state) => LiveTrackingScreen(
            orderId: int.parse(state.pathParameters['id']!),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersProvider.overrideWith((_) async => [order]),
          orderDetailProvider.overrideWith((_, __) async => order),
          riderLocationProvider.overrideWith((_, __) async => null),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('order-card-25')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('order-details-title')), findsOneWidget);
    expect(find.text('Live Delivery'), findsNothing);

    await tester.tap(find.byKey(const Key('track-live-button')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Live Delivery'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('order-details-title')), findsOneWidget);
    expect(find.text('Live Delivery'), findsNothing);
  });
}
