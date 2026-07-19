import 'dart:developer' as developer;
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/delivery_status.dart';
import '../../../shared/models/order.dart';

final ordersRepositoryProvider = Provider(
  (ref) => OrdersRepository(ref.watch(dioProvider)),
);
final ordersProvider = FutureProvider(
  (ref) => ref.watch(ordersRepositoryProvider).myOrders(),
);

class InvoiceFile {
  const InvoiceFile({
    required this.path,
    required this.fileName,
    required this.fromCache,
  });

  final String path;
  final String fileName;
  final bool fromCache;
}

class RiderLocation {
  const RiderLocation({
    required this.deliveryStatus,
    required this.trackingVisible,
    required this.trackingAvailable,
    required this.riderName,
    required this.riderPhone,
    required this.riderPhotoUrl,
    required this.vehicleType,
    required this.riderLatitude,
    required this.riderLongitude,
    required this.customerLatitude,
    required this.customerLongitude,
    required this.pickupLatitude,
    required this.pickupLongitude,
    required this.routeDestinationLatitude,
    required this.routeDestinationLongitude,
    required this.routeDestinationType,
    required this.distanceMeters,
    required this.etaMinutes,
    required this.lastUpdatedAt,
    required this.routePolyline,
  });

  final String deliveryStatus;
  final bool trackingVisible;
  final bool trackingAvailable;
  final String riderName;
  final String riderPhone;
  final String riderPhotoUrl;
  final String vehicleType;
  final double? riderLatitude;
  final double? riderLongitude;
  final double? customerLatitude;
  final double? customerLongitude;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final double? routeDestinationLatitude;
  final double? routeDestinationLongitude;
  final String routeDestinationType;
  final double? distanceMeters;
  final int? etaMinutes;
  final String lastUpdatedAt;
  final List<Map<String, double>> routePolyline;

  bool get hasRiderCoordinates =>
      _validCoordinates(riderLatitude, riderLongitude);

  bool get hasCustomerCoordinates =>
      _validCoordinates(customerLatitude, customerLongitude);

  static bool _validCoordinates(double? latitude, double? longitude) =>
      latitude != null &&
      longitude != null &&
      latitude.isFinite &&
      longitude.isFinite &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

  factory RiderLocation.fromJson(Map<String, dynamic> json) {
    final rider = json['rider'] is Map
        ? Map<String, dynamic>.from(json['rider'])
        : <String, dynamic>{};
    final customer = json['customer'] is Map
        ? Map<String, dynamic>.from(json['customer'])
        : <String, dynamic>{};
    final pickup = json['pickup'] is Map
        ? Map<String, dynamic>.from(json['pickup'])
        : <String, dynamic>{};
    final routeDestination = json['route_destination'] is Map
        ? Map<String, dynamic>.from(json['route_destination'])
        : <String, dynamic>{};
    final location = json['location'] is Map
        ? Map<String, dynamic>.from(json['location'])
        : <String, dynamic>{};
    final route = _routePointsFrom(json);
    double? numberFrom(List<dynamic> values) {
      for (final value in values) {
        if (value == null) continue;
        final parsed = double.tryParse('$value');
        if (parsed != null) return parsed;
      }
      return null;
    }

    int? intFrom(List<dynamic> values) {
      for (final value in values) {
        if (value == null) continue;
        final parsed = int.tryParse('$value');
        if (parsed != null) return parsed;
        final asDouble = double.tryParse('$value');
        if (asDouble != null) return asDouble.round();
      }
      return null;
    }

    return RiderLocation(
      deliveryStatus:
          '${json['dispatch_status'] ?? json['delivery_status'] ?? json['deliveryStatus'] ?? ''}',
      trackingVisible: json['tracking_visible'] == true ||
          json['trackingVisible'] == true ||
          isCustomerTrackingStage(deliveryStageFrom(
            json['dispatch_status'] ??
                json['delivery_status'] ??
                json['deliveryStatus'],
          )),
      trackingAvailable: json['tracking_available'] == true ||
          json['trackingAvailable'] == true,
      riderName: '${rider['name'] ?? ''}',
      riderPhone: '${rider['phone'] ?? ''}',
      riderPhotoUrl:
          '${rider['profile_photo_url'] ?? rider['rider_profile_photo_url'] ?? rider['rider_photo_url'] ?? rider['photo'] ?? rider['photo_url'] ?? rider['selfie_url'] ?? ''}',
      vehicleType:
          '${rider['vehicle_type'] ?? rider['vehicleType'] ?? json['vehicle_type'] ?? ''}',
      riderLatitude: numberFrom([
        rider['latitude'],
        rider['lat'],
        location['latitude'],
        location['lat'],
        json['rider_latitude'],
        json['rider_lat'],
        json['latitude'],
      ]),
      riderLongitude: numberFrom([
        rider['longitude'],
        rider['lng'],
        rider['lon'],
        location['longitude'],
        location['lng'],
        location['lon'],
        json['rider_longitude'],
        json['rider_lng'],
        json['rider_lon'],
        json['longitude'],
      ]),
      customerLatitude: numberFrom([
        customer['latitude'],
        customer['lat'],
        json['customer_latitude'],
        json['customer_lat'],
        json['destination_latitude'],
        json['destination_lat'],
        json['dropoff_latitude'],
        json['dropoff_lat'],
      ]),
      customerLongitude: numberFrom([
        customer['longitude'],
        customer['lng'],
        customer['lon'],
        json['customer_longitude'],
        json['customer_lng'],
        json['customer_lon'],
        json['destination_longitude'],
        json['destination_lng'],
        json['destination_lon'],
        json['dropoff_longitude'],
        json['dropoff_lng'],
        json['dropoff_lon'],
      ]),
      pickupLatitude: numberFrom([
        pickup['latitude'],
        pickup['lat'],
        json['pickup_latitude'],
        json['pickup_lat'],
        json['store_latitude'],
        json['store_lat'],
      ]),
      pickupLongitude: numberFrom([
        pickup['longitude'],
        pickup['lng'],
        pickup['lon'],
        json['pickup_longitude'],
        json['pickup_lng'],
        json['pickup_lon'],
        json['store_longitude'],
        json['store_lng'],
        json['store_lon'],
      ]),
      routeDestinationLatitude: numberFrom([
        routeDestination['latitude'],
        routeDestination['lat'],
        json['route_destination_latitude'],
        json['route_destination_lat'],
      ]),
      routeDestinationLongitude: numberFrom([
        routeDestination['longitude'],
        routeDestination['lng'],
        routeDestination['lon'],
        json['route_destination_longitude'],
        json['route_destination_lng'],
        json['route_destination_lon'],
      ]),
      routeDestinationType: '${routeDestination['type'] ?? ''}',
      distanceMeters: numberFrom([
        json['distance_meters'],
        json['distanceMeters'],
        json['distance_remaining_meters'],
        json['remaining_distance_meters'],
      ]),
      etaMinutes: intFrom([
        json['eta_minutes'],
        json['etaMinutes'],
        json['estimated_minutes'],
        json['duration_minutes'],
      ]),
      lastUpdatedAt:
          '${rider['last_updated_at'] ?? location['updated_at'] ?? json['last_updated_at'] ?? json['updated_at'] ?? json['updatedAt'] ?? ''}',
      routePolyline: route,
    );
  }

  static List<Map<String, double>> _routePointsFrom(
    Map<String, dynamic> json,
  ) {
    final raw = json['route_polyline'] ??
        json['routePolyline'] ??
        json['polyline'] ??
        json['encoded_polyline'];
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map((point) {
            final lat = double.tryParse('${point['latitude'] ?? point['lat']}');
            final lng = double.tryParse(
              '${point['longitude'] ?? point['lng'] ?? point['lon']}',
            );
            if (!_validCoordinates(lat, lng)) return null;
            return {'latitude': lat, 'longitude': lng};
          })
          .whereType<Map<String, double>>()
          .toList();
    }
    if (raw is String && raw.trim().isNotEmpty) {
      return _decodePolyline(raw.trim());
    }
    return <Map<String, double>>[];
  }

  static List<Map<String, double>> _decodePolyline(String encoded) {
    final points = <Map<String, double>>[];
    var index = 0;
    var lat = 0;
    var lng = 0;

    try {
      while (index < encoded.length) {
        var shift = 0;
        var result = 0;
        int byte;
        do {
          if (index >= encoded.length) return points;
          byte = encoded.codeUnitAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        lat += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

        shift = 0;
        result = 0;
        do {
          if (index >= encoded.length) return points;
          byte = encoded.codeUnitAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        lng += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

        points.add({'latitude': lat / 1e5, 'longitude': lng / 1e5});
      }
    } catch (error) {
      developer.log('TRACKING_POLYLINE_DECODE_FAILED error=$error');
    }
    return points;
  }
}

class OrdersRepository {
  OrdersRepository(this._dio);

  final Dio _dio;

  Future<List<OrderSummary>> myOrders() async {
    final response = await _dio.get('/orders/my');
    final items = response.data['orders'] ?? response.data['data'] ?? [];
    return (items as List)
        .map((item) => OrderSummary.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<OrderSummary> order(int id) async {
    final response = await _dio.get('/orders/$id');
    final body = response.data;
    final item = body is Map ? (body['order'] ?? body['data'] ?? body) : body;
    return OrderSummary.fromJson(Map<String, dynamic>.from(item));
  }

  Future<Map<String, dynamic>> uploadReceipt(int orderId, String path) async {
    final form = FormData.fromMap({'file': await MultipartFile.fromFile(path)});
    final response = await _dio.post('/orders/$orderId/receipt', data: form);
    return Map<String, dynamic>.from(response.data is Map ? response.data : {});
  }

  Future<InvoiceFile> invoicePdf(
    OrderSummary order, {
    bool forceRefresh = false,
  }) async {
    final file = await _invoiceFile(order);
    if (!forceRefresh && await file.exists() && await file.length() > 0) {
      return InvoiceFile(
        path: file.path,
        fileName: p.basename(file.path),
        fromCache: true,
      );
    }

    Response<dynamic> response;
    try {
      response = await _dio.get<List<int>>(
        '/orders/${order.id}/invoice',
        options: Options(
          responseType: ResponseType.bytes,
          headers: {'Accept': 'application/pdf'},
        ),
      );
    } on DioException {
      if (await file.exists() && await file.length() > 0) {
        return InvoiceFile(
          path: file.path,
          fileName: p.basename(file.path),
          fromCache: true,
        );
      }
      rethrow;
    }

    final bytes = _invoiceBytes(response.data);
    if (!_looksLikePdf(bytes, response.headers.value('content-type'))) {
      throw Exception('Invoice PDF is not available from the backend yet.');
    }
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes, flush: true);
    return InvoiceFile(
      path: file.path,
      fileName: p.basename(file.path),
      fromCache: false,
    );
  }

  Future<RiderLocation?> riderLocation(int orderId) async {
    final response = await _dio.get('/orders/$orderId/rider-location');
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    developer.log('TRACK_RIDER_API_RESPONSE order=$orderId body=$body');
    final data = body['tracking'] is Map
        ? Map<String, dynamic>.from(body['tracking'])
        : body['data'] is Map
            ? Map<String, dynamic>.from(body['data'])
            : body;
    if (data.isEmpty) return null;
    developer.log('TRACKING_PAYLOAD_PATH order=$orderId data=$data');
    return RiderLocation.fromJson(data);
  }

  Future<OrderSummary> requestCancellation({
    required int orderId,
    required String requestType,
    required String reason,
  }) async {
    final response = await _dio.post(
      '/orders/$orderId/cancel-request',
      data: {'request_type': requestType, 'reason': reason},
    );
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'])
        : <String, dynamic>{};
    return OrderSummary.fromJson(
      Map<String, dynamic>.from(body['order'] ?? data['order'] ?? {}),
    );
  }

  Future<Map<String, dynamic>?> cancellationRequest(int orderId) async {
    final response = await _dio.get('/orders/$orderId/cancel-request');
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final request = body['request'] ?? body['data'];
    return request is Map ? Map<String, dynamic>.from(request) : null;
  }

  Future<File> _invoiceFile(OrderSummary order) async {
    final root = await getApplicationDocumentsDirectory();
    final directory = Directory(p.join(root.path, 'invoices'));
    final code =
        order.orderCode.trim().isEmpty ? '${order.id}' : order.orderCode;
    final safeCode = code.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    return File(p.join(directory.path, 'foodnova_invoice_$safeCode.pdf'));
  }

  Uint8List _invoiceBytes(dynamic data) {
    if (data is Uint8List) return data;
    if (data is List<int>) return Uint8List.fromList(data);
    return Uint8List(0);
  }

  bool _looksLikePdf(Uint8List bytes, String? contentType) {
    if (bytes.length < 5) return false;
    final header = String.fromCharCodes(bytes.take(5));
    return header == '%PDF-' ||
        (contentType ?? '').toLowerCase().contains('application/pdf');
  }
}
