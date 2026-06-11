import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/order.dart';

final ordersRepositoryProvider =
    Provider((ref) => OrdersRepository(ref.watch(dioProvider)));
final ordersProvider =
    FutureProvider((ref) => ref.watch(ordersRepositoryProvider).myOrders());

class RiderLocation {
  const RiderLocation({
    required this.deliveryStatus,
    required this.trackingVisible,
    required this.riderName,
    required this.riderPhone,
    required this.riderLatitude,
    required this.riderLongitude,
    required this.customerLatitude,
    required this.customerLongitude,
    required this.distanceMeters,
    required this.etaMinutes,
    required this.lastUpdatedAt,
    required this.routePolyline,
  });

  final String deliveryStatus;
  final bool trackingVisible;
  final String riderName;
  final String riderPhone;
  final double? riderLatitude;
  final double? riderLongitude;
  final double? customerLatitude;
  final double? customerLongitude;
  final double? distanceMeters;
  final int? etaMinutes;
  final String lastUpdatedAt;
  final List<Map<String, double>> routePolyline;

  bool get hasRiderCoordinates =>
      riderLatitude != null && riderLongitude != null;

  bool get hasCustomerCoordinates =>
      customerLatitude != null && customerLongitude != null;

  factory RiderLocation.fromJson(Map<String, dynamic> json) {
    final rider = json['rider'] is Map
        ? Map<String, dynamic>.from(json['rider'])
        : <String, dynamic>{};
    final customer = json['customer'] is Map
        ? Map<String, dynamic>.from(json['customer'])
        : <String, dynamic>{};
    final route = json['route_polyline'] is List
        ? (json['route_polyline'] as List)
            .whereType<Map>()
            .map((point) {
              final lat = double.tryParse('${point['latitude']}');
              final lng = double.tryParse('${point['longitude']}');
              if (lat == null || lng == null) return null;
              return {'latitude': lat, 'longitude': lng};
            })
            .whereType<Map<String, double>>()
            .toList()
        : <Map<String, double>>[];
    return RiderLocation(
      deliveryStatus: '${json['delivery_status'] ?? ''}',
      trackingVisible: json['tracking_visible'] == true,
      riderName: '${rider['name'] ?? ''}',
      riderPhone: '${rider['phone'] ?? ''}',
      riderLatitude: double.tryParse('${rider['latitude']}'),
      riderLongitude: double.tryParse('${rider['longitude']}'),
      customerLatitude: double.tryParse('${customer['latitude']}'),
      customerLongitude: double.tryParse('${customer['longitude']}'),
      distanceMeters: double.tryParse('${json['distance_meters']}'),
      etaMinutes: int.tryParse('${json['eta_minutes']}'),
      lastUpdatedAt: '${rider['last_updated_at'] ?? ''}',
      routePolyline: route,
    );
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
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(path),
    });
    final response = await _dio.post('/orders/$orderId/receipt', data: form);
    return Map<String, dynamic>.from(response.data is Map ? response.data : {});
  }

  Future<OrderSummary> confirmDelivery({
    required int orderId,
    required String code,
  }) async {
    final response = await _dio.post('/orders/$orderId/confirm-delivery',
        data: {'delivery_code': code});
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'])
        : <String, dynamic>{};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(body['order'] ?? data['order'] ?? body));
  }

  Future<RiderLocation?> riderLocation(int orderId) async {
    final response = await _dio.get('/orders/$orderId/rider-location');
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final data = body['tracking'] is Map
        ? Map<String, dynamic>.from(body['tracking'])
        : body['data'] is Map
            ? Map<String, dynamic>.from(body['data'])
            : body;
    if (data.isEmpty) return null;
    return RiderLocation.fromJson(data);
  }

  Future<OrderSummary> requestCancellation({
    required int orderId,
    required String requestType,
    required String reason,
  }) async {
    final response = await _dio.post('/orders/$orderId/cancel-request', data: {
      'request_type': requestType,
      'reason': reason,
    });
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'])
        : <String, dynamic>{};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(body['order'] ?? data['order'] ?? {}));
  }

  Future<Map<String, dynamic>?> cancellationRequest(int orderId) async {
    final response = await _dio.get('/orders/$orderId/cancel-request');
    final body = response.data is Map
        ? Map<String, dynamic>.from(response.data)
        : <String, dynamic>{};
    final request = body['request'] ?? body['data'];
    return request is Map ? Map<String, dynamic>.from(request) : null;
  }
}
