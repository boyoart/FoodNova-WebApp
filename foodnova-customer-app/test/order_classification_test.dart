import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/shared/models/order.dart';

OrderSummary order(int id, String status) => OrderSummary.fromJson({
      'id': id,
      'order_code': 'FN-$id',
      'order_status': status,
      'fulfillment_status': status,
      'delivery_status': status,
    });

void main() {
  test('unfinished statuses are active', () {
    for (final status in [
      'order_placed',
      'payment_confirmed',
      'processing',
      'preparing',
      'ready_for_pickup',
      'assigned',
      'accepted',
      'arrived_at_pickup',
      'picked_up',
      'in_transit',
      'arrived_at_dropoff',
    ]) {
      expect(order(1, status).isActiveOrderStatus, isTrue, reason: status);
    }
  });

  test('terminal statuses are history only', () {
    for (final status in [
      'delivered',
      'picked_up_by_customer',
      'cancelled',
      'refunded',
      'rejected',
      'failed',
    ]) {
      final value = order(2, status);
      expect(value.isTerminalOrderStatus, isTrue, reason: status);
      expect(value.isActiveOrderStatus, isFalse, reason: status);
    }
  });

  test('terminal order is never duplicated between sections', () {
    final sections = CustomerOrderSections.from([
      order(1, 'processing'),
      order(2, 'delivered'),
      order(3, 'picked_up_by_customer'),
      order(4, 'cancelled'),
    ]);

    expect(sections.active.map((item) => item.id), [1]);
    expect(sections.history.map((item) => item.id), [2, 3, 4]);
    expect(
      sections.active.map((item) => item.id).toSet().intersection(
            sections.history.map((item) => item.id).toSet(),
          ),
      isEmpty,
    );
  });

  test('active to terminal moves to history', () {
    final before = CustomerOrderSections.from([order(5, 'in_transit')]);
    final after = CustomerOrderSections.from([order(5, 'delivered')]);

    expect(before.active.single.id, 5);
    expect(before.history, isEmpty);
    expect(after.active, isEmpty);
    expect(after.history.single.id, 5);
  });

  test('no active order produces an empty current section', () {
    final sections = CustomerOrderSections.from([order(6, 'cancelled')]);
    expect(sections.active, isEmpty);
    expect(sections.history.single.id, 6);
  });
}
