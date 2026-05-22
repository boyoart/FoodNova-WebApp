import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/order.dart';

final ordersRepositoryProvider = Provider((ref) => OrdersRepository(ref.watch(dioProvider)));
final ordersProvider = FutureProvider((ref) => ref.watch(ordersRepositoryProvider).myOrders());

class OrdersRepository {
  OrdersRepository(this._dio);

  final Dio _dio;

  Future<List<OrderSummary>> myOrders() async {
    final response = await _dio.get('/orders');
    final items = response.data['orders'] ?? response.data['data'] ?? [];
    return (items as List).map((item) => OrderSummary.fromJson(Map<String, dynamic>.from(item))).toList();
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
}
