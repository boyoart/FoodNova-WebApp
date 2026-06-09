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
  bool get isApproved => normalizedKycStatus == 'APPROVED';
  bool get isRejected => normalizedKycStatus == 'REJECTED';
  bool get isSuspended => normalizedKycStatus == 'SUSPENDED';
  bool get isDeleted => normalizedKycStatus == 'DELETED';
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
  String get pickup =>
      '${raw['pickup_location'] ?? raw['pickup_address'] ?? 'FoodNova pickup'}';
  String get dropoff =>
      '${raw['dropoff_location'] ?? raw['delivery_address'] ?? raw['address'] ?? 'Customer address'}';
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

enum DeliveryStage {
  assigned,
  accepted,
  enRouteToPickup,
  arrivedAtPickup,
  pickedUp,
  enRouteToCustomer,
  delivered,
  cancelled,
}

extension DeliveryStageCopy on DeliveryStage {
  String get label => switch (this) {
        DeliveryStage.assigned => 'Assigned',
        DeliveryStage.accepted => 'Accepted',
        DeliveryStage.enRouteToPickup => 'En Route To Pickup',
        DeliveryStage.arrivedAtPickup => 'Arrived At Pickup',
        DeliveryStage.pickedUp => 'Picked Up',
        DeliveryStage.enRouteToCustomer => 'En Route To Customer',
        DeliveryStage.delivered => 'Delivered',
        DeliveryStage.cancelled => 'Cancelled',
      };

  String get apiValue => name.replaceAllMapped(
        RegExp(r'[A-Z]'),
        (match) => '_${match.group(0)!.toLowerCase()}',
      );
}
