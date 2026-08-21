import 'dart:math' as math;

enum RiderMarkerKind { motorcycle, car, messenger }

const riderMarkerAnchorX = .5;
const riderMarkerAnchorY = .5;
const destinationMarkerAnchorX = .5;
const destinationMarkerAnchorY = .96;

class TrackingPoint {
  const TrackingPoint(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

RiderMarkerKind riderMarkerKind(String vehicleType, String workerType) {
  final vehicle = vehicleType.trim().toLowerCase();
  final worker = workerType.trim().toLowerCase();
  if (worker == 'messenger' ||
      {'messenger', 'walker', 'walking', 'foot'}.contains(vehicle)) {
    return RiderMarkerKind.messenger;
  }
  if ({'car', 'driver', 'vehicle', 'automobile'}.contains(vehicle)) {
    return RiderMarkerKind.car;
  }
  return RiderMarkerKind.motorcycle;
}

class RiderHeadingPolicy {
  RiderHeadingPolicy({this.minimumMovementMeters = 5});

  final double minimumMovementMeters;
  double _heading = 0;

  double get heading => _heading;

  double resolve({
    required TrackingPoint? previous,
    required TrackingPoint current,
    double? serverHeading,
    double? speedMetersPerSecond,
  }) {
    final serverReliable = serverHeading != null &&
        serverHeading.isFinite &&
        serverHeading >= 0 &&
        serverHeading < 360 &&
        (speedMetersPerSecond == null || speedMetersPerSecond >= .7);
    double? target;
    if (serverReliable) {
      target = serverHeading;
    } else if (previous != null &&
        trackingDistanceMeters(previous, current) >= minimumMovementMeters) {
      target = trackingBearing(previous, current);
    }
    if (target == null) return _heading;
    final delta = ((target - _heading + 540) % 360) - 180;
    _heading = (_heading + delta * .65 + 360) % 360;
    return _heading;
  }
}

double trackingBearing(TrackingPoint from, TrackingPoint to) {
  final lat1 = from.latitude * math.pi / 180;
  final lat2 = to.latitude * math.pi / 180;
  final deltaLongitude = (to.longitude - from.longitude) * math.pi / 180;
  final y = math.sin(deltaLongitude) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(deltaLongitude);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

double trackingDistanceMeters(TrackingPoint a, TrackingPoint b) {
  const radius = 6371000.0;
  final dLat = (b.latitude - a.latitude) * math.pi / 180;
  final dLng = (b.longitude - a.longitude) * math.pi / 180;
  final lat1 = a.latitude * math.pi / 180;
  final lat2 = b.latitude * math.pi / 180;
  final value = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1) * math.cos(lat2) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value));
}

bool riderIsOffRoute(
  TrackingPoint rider,
  List<TrackingPoint> route, {
  double thresholdMeters = 75,
}) {
  if (route.length < 2) return false;
  return route
          .map((point) => trackingDistanceMeters(rider, point))
          .reduce(math.min) >
      thresholdMeters;
}

String expectedRouteDestination(String deliveryStatus) {
  final status = deliveryStatus.trim().toUpperCase();
  return {'ASSIGNED', 'ACCEPTED'}.contains(status) ? 'pickup' : 'customer';
}
