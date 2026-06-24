class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderCode,
    required this.totalAmount,
    required this.status,
    required this.deliveryStatus,
    required this.paymentStatus,
    required this.deliveryAddress,
    required this.dispatcherName,
    required this.dispatcherType,
    required this.createdAt,
    required this.raw,
  });

  final int id;
  final String orderCode;
  final double totalAmount;
  final String status;
  final String deliveryStatus;
  final String paymentStatus;
  final String deliveryAddress;
  final String dispatcherName;
  final String dispatcherType;
  final String createdAt;
  final Map<String, dynamic> raw;

  List<Map<String, dynamic>> get items {
    final value = raw['items'];
    if (value is List) {
      return value.map((item) => Map<String, dynamic>.from(item)).toList();
    }
    return const [];
  }

  String get customerName => '${raw['customer_name'] ?? ''}';
  String get customerPhone => '${raw['customer_phone'] ?? raw['phone'] ?? ''}';
  String get customerEmail => '${raw['customer_email'] ?? ''}';
  String get deliveryMethod => '${raw['delivery_method'] ?? ''}';
  String get deliveryNotes =>
      '${raw['delivery_notes'] ?? raw['delivery_note'] ?? ''}';
  String get riderName =>
      '${raw['rider_name'] ?? raw['assigned_worker_name'] ?? dispatcherName}';
  String get riderPhone =>
      '${raw['rider_phone'] ?? raw['assigned_worker_phone'] ?? ''}';
  String get riderVehicleType =>
      '${raw['rider_vehicle_type'] ?? raw['assigned_worker_type'] ?? ''}';
  String get riderVehicleNumber => '${raw['rider_vehicle_number'] ?? ''}';
  String get riderPhotoUrl =>
      '${raw['rider_photo'] ?? raw['rider_photo_url'] ?? raw['assigned_worker_photo'] ?? raw['assigned_worker_photo_url'] ?? raw['profile_photo_url'] ?? ''}';
  String get estimatedDeliveryTime =>
      '${raw['estimated_delivery_time'] ?? raw['estimatedDeliveryTime'] ?? raw['delivery_eta'] ?? raw['eta'] ?? ''}';
  String get confirmedAt =>
      '${raw['confirmed_at'] ?? raw['payment_confirmed_at'] ?? ''}';
  String get preparingAt =>
      '${raw['preparing_at'] ?? raw['processing_at'] ?? ''}';
  String get readyForPickupAt =>
      '${raw['ready_for_pickup_at'] ?? raw['ready_at'] ?? ''}';
  String get outForDeliveryAt =>
      '${raw['out_for_delivery_at'] ?? raw['picked_up_at'] ?? ''}';
  bool get hasAssignedRider {
    final riderId = raw['rider_id'] ?? raw['delivery_worker_id'];
    return riderId != null ||
        riderName.trim().isNotEmpty ||
        riderPhone.trim().isNotEmpty;
  }

  bool get isDeliveryTrackingVisible {
    final value = '$status $deliveryStatus'.toLowerCase();
    if (isDelivered) return false;
    return value.contains('picked_up') ||
        value.contains('picked up') ||
        value.contains('out_for_delivery') ||
        value.contains('out for delivery') ||
        value.contains('in_transit') ||
        value.contains('in transit') ||
        value.contains('arrived');
  }

  bool get riderArrived {
    final value = '$status $deliveryStatus'.toLowerCase();
    return !isDelivered && value.contains('arrived');
  }

  String get cancellationStatus => '${raw['cancellation_status'] ?? 'none'}';
  String get refundStatus => '${raw['refund_status'] ?? 'none'}';
  String get cancellationReason => '${raw['cancellation_reason'] ?? ''}';
  String get refundNote => '${raw['refund_note'] ?? ''}';
  String get receipt => '${raw['receipt'] ?? ''}';
  String get deliveryConfirmedAt => '${raw['delivery_confirmed_at'] ?? ''}';
  bool get isOutForDelivery {
    final value = '$status $deliveryStatus'.toLowerCase();
    return value.contains('out_for_delivery') ||
        value.contains('out for delivery');
  }

  bool get isDelivered {
    final value = '$status $deliveryStatus'.toLowerCase();
    return value.contains('delivered') || deliveryConfirmedAt.isNotEmpty;
  }

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    return OrderSummary(
      id: int.tryParse('${json['id']}') ?? 0,
      orderCode: '${json['order_code'] ?? ''}',
      totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
      status: '${json['order_status'] ?? json['status'] ?? ''}',
      deliveryStatus:
          '${json['delivery_status'] ?? json['fulfillment_status'] ?? ''}',
      paymentStatus: '${json['payment_status'] ?? ''}',
      deliveryAddress: '${json['delivery_address'] ?? ''}',
      dispatcherName:
          '${json['assigned_worker_name'] ?? json['rider_name'] ?? ''}',
      dispatcherType:
          '${json['assigned_worker_type'] ?? json['delivery_method'] ?? ''}',
      createdAt: '${json['created_at'] ?? ''}',
      raw: json,
    );
  }
}
