import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/features/orders/data/orders_repository.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/tracking_camera_policy.dart';
import 'package:foodnova_customer_app/features/tracking/presentation/tracking_map_policy.dart';

void main() {
  test('production worker and vehicle values map to semantic markers', () {
    expect(riderMarkerKind('Motorcycle', 'rider'), RiderMarkerKind.motorcycle);
    expect(riderMarkerKind('Bike', 'rider'), RiderMarkerKind.motorcycle);
    expect(riderMarkerKind('Car', 'rider'), RiderMarkerKind.car);
    expect(riderMarkerKind('Walker', 'messenger'), RiderMarkerKind.messenger);
    expect(
        riderMarkerKind('Messenger', 'messenger'), RiderMarkerKind.messenger);
  });

  test('heading derives from meaningful coordinate movement', () {
    final policy = RiderHeadingPolicy();
    final heading = policy.resolve(
      previous: const TrackingPoint(6.5000, 3.3000),
      current: const TrackingPoint(6.5000, 3.3010),
    );
    expect(heading, closeTo(58.5, 3));
  });

  test('insignificant movement preserves heading without jitter', () {
    final policy = RiderHeadingPolicy();
    final first = policy.resolve(
      previous: null,
      current: const TrackingPoint(6.5, 3.3),
      serverHeading: 120,
      speedMetersPerSecond: 4,
    );
    final stationary = policy.resolve(
      previous: const TrackingPoint(6.5, 3.3),
      current: const TrackingPoint(6.500001, 3.300001),
      serverHeading: 310,
      speedMetersPerSecond: .1,
    );
    expect(stationary, first);
  });

  test('camera fits initially but rider movement does not continuously refit',
      () {
    final policy = TrackingCameraPolicy();
    expect(
      policy.shouldFitRoute(initialLoad: true, destinationChanged: false),
      isTrue,
    );
    expect(
      policy.shouldFitRoute(initialLoad: false, destinationChanged: false),
      isFalse,
    );
    expect(
      policy.shouldFitRoute(initialLoad: false, destinationChanged: true),
      isTrue,
    );
  });

  test('off-route movement crosses reroute threshold', () {
    const route = [TrackingPoint(6.5, 3.3), TrackingPoint(6.51, 3.31)];
    expect(
        riderIsOffRoute(const TrackingPoint(6.5001, 3.3001), route), isFalse);
    expect(riderIsOffRoute(const TrackingPoint(6.53, 3.34), route), isTrue);
  });

  test('phase selects pickup before collection and customer afterwards', () {
    expect(expectedRouteDestination('ASSIGNED'), 'pickup');
    expect(expectedRouteDestination('ACCEPTED'), 'pickup');
    expect(expectedRouteDestination('ARRIVED_AT_PICKUP'), 'customer');
    expect(expectedRouteDestination('PICKED_UP'), 'customer');
    expect(expectedRouteDestination('IN_TRANSIT'), 'customer');
  });

  test('routing failure leaves route empty instead of drawing a straight line',
      () {
    final location = RiderLocation.fromJson({
      'tracking_visible': true,
      'rider': {'latitude': 6.5, 'longitude': 3.3},
      'customer': {'latitude': 6.6, 'longitude': 3.4},
      'route_status': 'UNAVAILABLE',
    });
    expect(location.routePolyline, isEmpty);
    expect(location.distanceMeters, isNull);
    expect(location.etaMinutes, isNull);
  });

  test('tracking payload parses canonical worker type and server motion', () {
    final location = RiderLocation.fromJson({
      'rider': {
        'vehicle_type': 'Walker',
        'worker_type': 'messenger',
        'heading': 215,
        'speed': 2.4,
      },
    });
    expect(location.workerType, 'messenger');
    expect(location.heading, 215);
    expect(location.speedMetersPerSecond, 2.4);
    expect(
      riderMarkerKind(location.vehicleType, location.workerType),
      RiderMarkerKind.messenger,
    );
  });
}
