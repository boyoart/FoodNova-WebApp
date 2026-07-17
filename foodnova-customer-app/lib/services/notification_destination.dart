class NotificationDestination {
  const NotificationDestination(this.route, {this.notificationId});

  final String route;
  final int? notificationId;
}

NotificationDestination resolveCustomerNotification(
    Map<String, dynamic> source) {
  final nested = source['data'];
  final data = <String, dynamic>{
    if (nested is Map) ...Map<String, dynamic>.from(nested),
    ...source,
  };
  final notificationId = _positiveInt(data['notification_id'] ?? data['id']);
  final orderId = _positiveInt(data['order_id'] ?? data['orderId']);
  final explicit =
      '${data['screen'] ?? data['destination'] ?? ''}'.trim().toLowerCase();
  final type =
      '${data['notification_type'] ?? data['type'] ?? ''}'.trim().toLowerCase();

  if (explicit.contains('notification') ||
      explicit.contains('announcement') ||
      explicit.contains('inbox')) {
    return NotificationDestination('/notifications',
        notificationId: notificationId);
  }

  final concernsOrder = orderId != null &&
      (explicit.contains('order') ||
          explicit.contains('track') ||
          explicit.contains('payment') ||
          explicit.contains('delivery') ||
          type.contains('order') ||
          type.contains('payment') ||
          type.contains('receipt') ||
          type.contains('rider') ||
          type.contains('delivery') ||
          type.contains('tracking'));
  if (concernsOrder) {
    return NotificationDestination('/tracking/$orderId',
        notificationId: notificationId);
  }
  return NotificationDestination('/notifications',
      notificationId: notificationId);
}

int? _positiveInt(Object? value) {
  final parsed = int.tryParse('${value ?? ''}');
  return parsed != null && parsed > 0 ? parsed : null;
}
