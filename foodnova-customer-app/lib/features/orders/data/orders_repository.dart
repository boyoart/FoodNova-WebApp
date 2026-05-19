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
}
