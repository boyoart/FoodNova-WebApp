class RiderProfile {
  RiderProfile(this.raw);
  final Map<String, dynamic> raw;

  int? get id => raw['id'] as int?;
  String get name => '${raw['full_name'] ?? raw['name'] ?? ''}'.trim();
  String get phone => '${raw['phone'] ?? ''}';
  String get email => '${raw['email'] ?? ''}';
  String get vehicleType => '${raw['vehicle_type'] ?? ''}';
  String get kycStatus => '${raw['kyc_status'] ?? 'KYC_PENDING'}';
  String get normalizedKycStatus => kycStatus.toUpperCase();
  String get accountStatus => '${raw['operational_status'] ?? 'OFFLINE'}';
  String get rejectionReason =>
      '${raw['rejection_reason'] ?? raw['deleted_reason'] ?? ''}'.trim();
  bool get isApproved =>
      normalizedKycStatus == 'APPROVED' || normalizedKycStatus == 'ACTIVE';
  bool get dashboardAccessAllowed =>
      raw['dashboard_access_allowed'] == true ||
      (isApproved &&
          raw['nin_verified'] == true &&
          raw['documents_uploaded'] == true &&
          raw['profile_completed'] == true);
  bool get isPendingReview => normalizedKycStatus == 'PENDING_REVIEW';
  bool get isOnboarding => normalizedKycStatus == 'ONBOARDING';
  bool get isRejected => normalizedKycStatus == 'REJECTED';
  bool get isSuspended => normalizedKycStatus == 'SUSPENDED';
  bool get isDeleted => normalizedKycStatus == 'DELETED';
  String get submittedAt =>
      '${raw['submitted_at'] ?? raw['application_submitted_at'] ?? raw['updated_at'] ?? raw['created_at'] ?? ''}';
  bool get onboardingCompleted => id != null && id! > 0;
  int get currentStep =>
      int.tryParse(
        '${raw['current_step'] ?? raw['onboarding_current_step'] ?? 1}',
      )?.clamp(1, 7).toInt() ??
      1;
  int get onboardingStepTotal =>
      int.tryParse('${raw['onboarding_step_total'] ?? 7}')
          ?.clamp(1, 7)
          .toInt() ??
      7;
  int get onboardingProgressPercent =>
      int.tryParse('${raw['onboarding_progress_percent'] ?? ''}') ??
      ((currentStep / onboardingStepTotal) * 100).round();
  String get onboardingStage => '${raw['onboarding_stage'] ?? ''}';
  bool get applicationSubmitted =>
      isPendingReview ||
      isApproved ||
      normalizedKycStatus == 'REJECTED' ||
      raw['application_submitted'] == true;
  bool get shouldContinueOnboarding =>
      isOnboarding ||
      !applicationSubmitted ||
      currentStep < onboardingStepTotal;
  bool get isOnline => accountStatus.toUpperCase() == 'ONLINE';
  double get rating =>
      double.tryParse('${raw['rating'] ?? raw['current_rating'] ?? 0}') ?? 0;
}

class DeliveryOffer {
  DeliveryOffer(this.raw);
  final Map<String, dynamic> raw;

  int get id => int.tryParse('${raw['id'] ?? 0}') ?? 0;
  int get orderId => int.tryParse('${raw['order_id'] ?? 0}') ?? 0;
  String get orderCode =>
      '${raw['order_code'] ?? raw['order_number'] ?? 'Order'}';
  String get status => '${raw['status'] ?? 'PENDING'}';
  String get customerName =>
      '${raw['customer_name'] ?? raw['name'] ?? 'Customer'}';
  String get customerPhone => '${raw['customer_phone'] ?? raw['phone'] ?? ''}';
  String get pickup =>
      '${raw['pickup_location'] ?? raw['pickup_address'] ?? 'FoodNova pickup'}';
  String get dropoff =>
      '${raw['dropoff_location'] ?? raw['delivery_address'] ?? raw['address'] ?? 'Customer address'}';
  String get instructions =>
      '${raw['delivery_notes'] ?? raw['delivery_note'] ?? raw['service_note'] ?? ''}';
  String get deliveryPin =>
      '${raw['delivery_pin'] ?? raw['delivery_code'] ?? ''}';
  String get distance =>
      '${raw['distance_text'] ?? raw['distance'] ?? 'Distance unavailable'}';
  String get eta =>
      '${raw['eta'] ?? raw['estimated_eta'] ?? 'ETA unavailable'}';
  num get earnings =>
      num.tryParse(
        '${raw['estimated_earnings'] ?? raw['earnings'] ?? raw['delivery_fee'] ?? 0}',
      ) ??
      0;
  DateTime? get expiresAt => DateTime.tryParse('${raw['expires_at'] ?? ''}');
}

class DeliveryOrder {
  DeliveryOrder(this.raw);
  final Map<String, dynamic> raw;

  int get id => int.tryParse('${raw['id'] ?? 0}') ?? 0;
  String get orderCode =>
      '${raw['order_code'] ?? raw['order_number'] ?? 'Order'}';
  String get status =>
      '${raw['dispatch_status'] ?? raw['delivery_status'] ?? raw['fulfillment_status'] ?? 'ASSIGNED'}';
  String get customerName =>
      '${raw['customer_name'] ?? raw['name'] ?? 'Customer'}';
  String get customerPhone => '${raw['customer_phone'] ?? raw['phone'] ?? ''}';
  String get pickup => '${raw['pickup_location'] ?? 'FoodNova pickup'}';
  String get dropoff =>
      '${raw['delivery_address'] ?? raw['dropoff_location'] ?? raw['address'] ?? 'Customer address'}';
  String get instructions =>
      '${raw['delivery_notes'] ?? raw['delivery_note'] ?? raw['service_note'] ?? ''}';
  String get deliveryPin =>
      '${raw['delivery_pin'] ?? raw['delivery_code'] ?? ''}';
  DateTime? get assignedAt =>
      DateTime.tryParse('${raw['delivery_assigned_at'] ?? ''}');

  DeliveryOffer asOffer() => DeliveryOffer({
        ...raw,
        'order_id': id,
        'order_code': orderCode,
        'customer_name': customerName,
        'delivery_address': dropoff,
        'pickup_location': pickup,
        'status': status,
      });
}

enum DeliveryStage {
  assigned,
  accepted,
  pickedUp,
  inTransit,
  arrived,
  delivered,
  cancelled,
}

extension DeliveryStageCopy on DeliveryStage {
  String get label => switch (this) {
        DeliveryStage.assigned => 'Assigned',
        DeliveryStage.accepted => 'Accepted',
        DeliveryStage.pickedUp => 'Picked Up',
        DeliveryStage.inTransit => 'In Transit',
        DeliveryStage.arrived => 'Arrived',
        DeliveryStage.delivered => 'Delivered',
        DeliveryStage.cancelled => 'Cancelled',
      };

  String get apiValue => name.replaceAllMapped(
        RegExp(r'[A-Z]'),
        (match) => '_${match.group(0)!.toLowerCase()}',
      );
}
