import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/services/notification_destination.dart';
import 'package:foodnova_customer_app/shared/delivery_status.dart';
import 'package:foodnova_customer_app/shared/models/order.dart';

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
}
