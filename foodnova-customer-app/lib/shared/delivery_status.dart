enum FoodNovaDeliveryStage {
  newOrder,
  accepted,
  arrivedAtPickup,
  pickedUp,
  inTransit,
  arrived,
  delivered,
  cancelled,
  rejected,
}

FoodNovaDeliveryStage deliveryStageFrom(Object? raw) {
  final value = '${raw ?? ''}'
      .trim()
      .toUpperCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
  switch (value) {
    case 'ASSIGNED':
    case 'RIDER_ASSIGNED':
    case 'RIDER_ACCEPTED':
    case 'ACCEPTED':
      return FoodNovaDeliveryStage.accepted;
    case 'AT_PICKUP':
    case 'ARRIVED_PICKUP':
    case 'ARRIVED_AT_PICKUP':
      return FoodNovaDeliveryStage.arrivedAtPickup;
    case 'PICKED':
    case 'COLLECTED':
    case 'PICKED_UP':
      return FoodNovaDeliveryStage.pickedUp;
    case 'EN_ROUTE':
    case 'EN_ROUTE_CUSTOMER':
    case 'OUT_FOR_DELIVERY':
    case 'IN_TRANSIT':
      return FoodNovaDeliveryStage.inTransit;
    case 'ARRIVED_CUSTOMER':
    case 'ARRIVED_AT_CUSTOMER':
    case 'ARRIVED':
      return FoodNovaDeliveryStage.arrived;
    case 'COMPLETED':
    case 'DELIVERED':
      return FoodNovaDeliveryStage.delivered;
    case 'CANCELLED':
    case 'CANCELED':
      return FoodNovaDeliveryStage.cancelled;
    case 'DECLINED':
    case 'REJECTED':
    case 'FAILED':
      return FoodNovaDeliveryStage.rejected;
    default:
      return FoodNovaDeliveryStage.newOrder;
  }
}

String canonicalDeliveryStatus(Object? raw) {
  switch (deliveryStageFrom(raw)) {
    case FoodNovaDeliveryStage.accepted:
      return 'ACCEPTED';
    case FoodNovaDeliveryStage.arrivedAtPickup:
      return 'ARRIVED_AT_PICKUP';
    case FoodNovaDeliveryStage.pickedUp:
      return 'PICKED_UP';
    case FoodNovaDeliveryStage.inTransit:
      return 'IN_TRANSIT';
    case FoodNovaDeliveryStage.arrived:
      return 'ARRIVED';
    case FoodNovaDeliveryStage.delivered:
      return 'DELIVERED';
    case FoodNovaDeliveryStage.cancelled:
      return 'CANCELLED';
    case FoodNovaDeliveryStage.rejected:
      return 'REJECTED';
    case FoodNovaDeliveryStage.newOrder:
      return 'NEW';
  }
}

bool isCustomerTrackingStage(FoodNovaDeliveryStage stage) => {
      FoodNovaDeliveryStage.accepted,
      FoodNovaDeliveryStage.arrivedAtPickup,
      FoodNovaDeliveryStage.pickedUp,
      FoodNovaDeliveryStage.inTransit,
      FoodNovaDeliveryStage.arrived,
    }.contains(stage);
