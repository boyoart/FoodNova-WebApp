import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/services/notification_destination.dart';
import 'package:foodnova_customer_app/shared/delivery_status.dart';
import 'package:foodnova_customer_app/shared/models/order.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/tracking_screen.dart';

void main() {
  test('delivery aliases use one canonical customer state', () {
    expect(canonicalDeliveryStatus('arrived-at-pickup'), 'ARRIVED_AT_PICKUP');
    expect(canonicalDeliveryStatus('out_for_delivery'), 'IN_TRANSIT');
    expect(canonicalDeliveryStatus('arrived_at_customer'), 'ARRIVED');
    expect(canonicalDeliveryStatus('completed'), 'DELIVERED');
  });

  test('notification routing never treats a generic id as an order id', () {
    final generic = resolveCustomerNotification({
      'id': 91,
      'type': 'announcement',
    });
    expect(generic.route, '/notifications');
    expect(generic.notificationId, 91);

    final explicitInbox = resolveCustomerNotification({
      'id': 93,
      'screen': 'notifications',
      'type': 'order_update',
      'order_id': 25,
    });
    expect(explicitInbox.route, '/notifications');

    final order = resolveCustomerNotification({
      'id': 92,
      'screen': 'order_tracking',
      'order_id': 25,
    });
    expect(order.route, '/tracking/25');
  });

  test('pickup completion is not treated as rider delivery', () {
    final order = OrderSummary.fromJson({
      'id': 2,
      'order_number': '002',
      'delivery_method': 'pickup',
      'payment_status': 'payment_confirmed',
      'order_status': 'picked_up_by_customer',
      'fulfillment_status': 'picked_up_by_customer',
      'delivery_status': '',
    });
    expect(order.isPickup, isTrue);
    expect(order.isPickedUpByCustomer, isTrue);
    expect(order.isFulfillmentComplete, isTrue);
    expect(order.isDelivered, isFalse);
    expect(order.isDeliveryTrackingVisible, isFalse);
    expect(order.hasAssignedRider, isFalse);
  });

  test('pickup PIN is represented independently of rider state', () {
    final order = OrderSummary.fromJson({
      'id': 3,
      'delivery_method': 'pickup',
      'order_status': 'ready_for_pickup',
      'delivery_pin': '1604',
      'pickup_address': 'FoodNova Store',
    });
    expect(order.deliveryPin, '1604');
    expect(order.pickupAddress, 'FoodNova Store');
    expect(order.isDeliveryTrackingVisible, isFalse);
  });

  test('nested pickup contract provides configured details and coordinates',
      () {
    final order = OrderSummary.fromJson({
      'id': 4,
      'delivery_method': 'pickup',
      'order_status': 'ready_for_pickup',
      'pickup': {
        'address': 'Configured FoodNova Store',
        'hours': 'Mon-Sat 9-5',
        'instructions': 'Ask at the collection desk',
        'latitude': 43.65,
        'longitude': -79.38,
        'pin': '8471',
      },
    });
    expect(order.pickupAddress, 'Configured FoodNova Store');
    expect(order.pickupHours, 'Mon-Sat 9-5');
    expect(order.pickupInstructions, 'Ask at the collection desk');
    expect(order.pickupLatitude, 43.65);
    expect(order.pickupLongitude, -79.38);
    expect(order.deliveryPin, '8471');
  });

  test('completed pickup does not expose a missing PIN as rider state', () {
    final order = OrderSummary.fromJson({
      'id': 5,
      'delivery_method': 'pickup',
      'order_status': 'picked_up_by_customer',
      'pickup_pin': '',
    });
    expect(order.isPickedUpByCustomer, isTrue);
    expect(order.deliveryPin, isEmpty);
    expect(order.isDeliveryTrackingVisible, isFalse);
  });

  testWidgets('ready pickup shows collection details', (tester) async {
    final order = OrderSummary.fromJson({
      'id': 6,
      'delivery_method': 'pickup',
      'payment_status': 'payment_confirmed',
      'order_status': 'ready_for_pickup',
      'delivery_pin': '8471',
      'pickup_address': 'FoodNova Store',
      'pickup_hours': 'Mon-Sat 9-5',
      'pickup_instructions': 'Bring your pickup PIN.',
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: buildPickupFulfillmentCardForTest(order),
        ),
      ),
    ));

    expect(find.text('Pickup PIN'), findsOneWidget);
    expect(find.text('Pickup instructions'), findsOneWidget);
    expect(find.text('Bring your pickup PIN.'), findsOneWidget);
    expect(find.text('FoodNova Store'), findsOneWidget);
    expect(find.text('Mon-Sat 9-5'), findsOneWidget);
  });

  testWidgets('completed pickup hides obsolete collection details',
      (tester) async {
    final order = OrderSummary.fromJson({
      'id': 7,
      'delivery_method': 'pickup',
      'payment_status': 'payment_confirmed',
      'order_status': 'picked_up_by_customer',
      'fulfillment_status': 'picked_up_by_customer',
      'delivery_pin': '',
      'pickup_address': 'FoodNova Store',
      'pickup_hours': 'Mon-Sat 9-5',
      'pickup_instructions': 'Bring your pickup PIN.',
      'delivery_completed_at': '2026-08-20T12:30:00Z',
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: buildPickupFulfillmentCardForTest(order),
        ),
      ),
    ));

    expect(find.text('Picked up by Customer'), findsOneWidget);
    expect(find.text('Pickup completed successfully.'), findsOneWidget);
    expect(find.text('Pickup PIN'), findsNothing);
    expect(find.text('Pickup instructions'), findsNothing);
    expect(find.text('Bring your pickup PIN.'), findsNothing);
    expect(find.text('FoodNova Store'), findsOneWidget);
    expect(find.text('Mon-Sat 9-5'), findsOneWidget);
    expect(find.textContaining('Picked up on:'), findsOneWidget);
    expect(find.text('Contact FoodNova'), findsOneWidget);
    expect(find.text('Directions'), findsNothing);
  });
}
