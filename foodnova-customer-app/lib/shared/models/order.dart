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
      '${raw['profile_photo_url'] ?? raw['rider_profile_photo_url'] ?? raw['rider_photo_url'] ?? raw['rider_photo'] ?? raw['assigned_worker_photo'] ?? raw['assigned_worker_photo_url'] ?? raw['selfie_url'] ?? ''}';
  String get riderDisplayId {
    final value =
        '${raw['rider_code'] ?? raw['rider_display_id'] ?? raw['rider_id'] ?? raw['delivery_worker_id'] ?? ''}'
            .trim();
    if (value.isEmpty) return 'Pending';
    if (value.startsWith('FN-')) return value;
    return 'FN-RDR-$value';
  }

  String get riderRatingText {
    final value = num.tryParse(
        '${raw['rider_rating'] ?? raw['rating'] ?? raw['average_rating'] ?? ''}');
    return value == null || value <= 0 ? '4.8' : value.toStringAsFixed(1);
  }

  String get estimatedDeliveryTime =>
      '${raw['estimated_delivery_time'] ?? raw['estimatedDeliveryTime'] ?? raw['delivery_eta'] ?? raw['eta'] ?? ''}';
  String get updatedAt => '${raw['updated_at'] ?? ''}';
  String get dispatchStatus =>
      '${raw['dispatch_status'] ?? raw['deliveryStatus'] ?? ''}';
  String get canonicalDeliveryStatus {
    final value = dispatchStatus.trim();
    if (value.isNotEmpty) return value.toUpperCase();
    final delivery = deliveryStatus.trim().toLowerCase();
    final orderValue = status.trim().toLowerCase();
    if (orderValue == 'delivered' || delivery == 'delivered') {
      return 'DELIVERED';
    }
    if (delivery.contains('arrived')) return 'ARRIVED';
    if (delivery.contains('in_transit') ||
        delivery.contains('out_for_delivery') ||
        delivery.contains('en_route')) {
      return 'IN_TRANSIT';
    }
    if (delivery.contains('picked')) return 'PICKED_UP';
    if (delivery.contains('assigned')) return 'ASSIGNED';
    return 'NEW';
  }

  String get deliveryPin =>
      '${raw['delivery_pin'] ?? raw['delivery_code'] ?? raw['deliveryCode'] ?? ''}';
  String get confirmedAt =>
      '${raw['confirmed_at'] ?? raw['payment_confirmed_at'] ?? ''}';
  String get preparingAt =>
      '${raw['preparing_at'] ?? raw['processing_at'] ?? ''}';
  String get readyForPickupAt =>
      '${raw['ready_for_pickup_at'] ?? raw['ready_at'] ?? ''}';
  String get pickedUpAt =>
      '${raw['picked_up_at'] ?? raw['delivery_started_at'] ?? ''}';
  String get outForDeliveryAt =>
      '${raw['out_for_delivery_at'] ?? raw['picked_up_at'] ?? ''}';
  bool get paymentConfirmed {
    final value = paymentStatus.toLowerCase();
    return value == 'payment_confirmed' ||
        value == 'confirmed' ||
        value == 'paid';
  }

  bool get hasAssignedRider {
    final riderId = raw['rider_id'] ?? raw['delivery_worker_id'];
    final acceptedOrLater = {
      'ACCEPTED',
      'PICKED_UP',
      'IN_TRANSIT',
      'ARRIVED',
      'DELIVERED',
    }.contains(canonicalDeliveryStatus);
    return acceptedOrLater &&
        (riderId != null ||
            riderName.trim().isNotEmpty ||
            riderPhone.trim().isNotEmpty);
  }

  bool get isDeliveryTrackingVisible {
    final value = canonicalDeliveryStatus;
    if (isDelivered) return false;
    return {'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'}.contains(value);
  }

  bool get riderArrived {
    return !isDelivered && canonicalDeliveryStatus == 'ARRIVED';
  }

  String get cancellationStatus => '${raw['cancellation_status'] ?? 'none'}';
  String get refundStatus => '${raw['refund_status'] ?? 'none'}';
  String get cancellationReason => '${raw['cancellation_reason'] ?? ''}';
  String get refundNote => '${raw['refund_note'] ?? ''}';
  String get receipt => '${raw['receipt'] ?? ''}';
  String get deliveryConfirmedAt => '${raw['delivery_confirmed_at'] ?? ''}';
  String get deliveryCompletedAt => '${raw['delivery_completed_at'] ?? ''}';
  bool get isOutForDelivery {
    return {'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'}
        .contains(canonicalDeliveryStatus);
  }

  bool get isDelivered {
    return canonicalDeliveryStatus == 'DELIVERED' ||
        status.toLowerCase().contains('delivered') ||
        deliveryConfirmedAt.isNotEmpty;
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
