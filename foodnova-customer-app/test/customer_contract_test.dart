import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/services/notification_destination.dart';
import 'package:foodnova_customer_app/shared/delivery_status.dart';

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
}
