import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/order.dart';

final ordersRepositoryProvider =
    Provider((ref) => OrdersRepository(ref.watch(dioProvider)));
final ordersProvider =
    FutureProvider((ref) => ref.watch(ordersRepositoryProvider).myOrders());

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
