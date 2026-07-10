import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final adminRepositoryProvider =
    Provider((ref) => AdminRepository(ref.watch(dioProvider)));

final adminDashboardProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).dashboard());
final adminOrdersProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).orders());
final adminDispatchProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).dispatchBoard());
final adminInventoryProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).products());
final adminAnnouncementsProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).announcements());
final adminCustomersProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).customers());
final adminReportsProvider =
    FutureProvider((ref) => ref.watch(adminRepositoryProvider).reports());

class AdminRepository {
  AdminRepository(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> dashboard() async {
    final responses = await Future.wait([
      _safeGet('/admin/orders'),
      _safeGet('/admin/reports/summary'),
      _safeGet('/admin/dispatch-board'),
    ]);
    final orders = _list(responses[0], 'orders');
    final report = _map(responses[1]);
    final dispatch = _map(responses[2]);
    final summary = _map(report['summary']);
    final stats = _map(dispatch['stats']);
    return {
      'orders': orders,
      'summary': summary,
      'dispatch_stats': stats,
      'revenue_by_day': _list(report, 'revenue_by_day'),
      'top_products': _list(report, 'top_products'),
    };
  }

  Future<List<Map<String, dynamic>>> orders({String status = 'all'}) async {
    final response = await _dio.get('/admin/orders', queryParameters: {
      if (status != 'all') 'status': status,
    });
    return _list(response.data, 'orders');
  }

  Future<void> updateOrderStatus(int orderId, String status) async {
    final payload = <String, dynamic>{
      'status': status,
      'order_status': status,
      'fulfillment_status': status,
    };
    if (status == 'payment_confirmed') {
      payload
        ..['status'] = 'processing'
        ..['order_status'] = 'processing'
        ..['fulfillment_status'] = 'processing'
        ..['payment_status'] = 'payment_confirmed'
        ..['dispatch_status'] = 'READY_FOR_DISPATCH';
    } else if (status == 'ready') {
      payload['dispatch_status'] = 'READY_FOR_PICKUP';
    } else if (status == 'out_for_delivery') {
      payload['dispatch_status'] = 'OUT_FOR_DELIVERY';
    } else if (status == 'delivered') {
      payload['dispatch_status'] = 'DELIVERED';
    } else if (status == 'cancelled') {
      payload['dispatch_status'] = 'CANCELLED';
    }
    await _dio.patch('/admin/orders/$orderId', data: payload);
  }

  Future<void> assignRider(int orderId, int riderId) async {
    await _dio.patch('/admin/orders/$orderId/assign-rider', data: {
      'rider_id': riderId,
      'mark_out_for_delivery': true,
    });
  }

  Future<Map<String, dynamic>> dispatchBoard() async {
    final response = await _dio.get('/admin/dispatch-board');
    return _map(response.data);
  }

  Future<List<Map<String, dynamic>>> riders() async {
    final response = await _dio.get('/admin/riders');
    return _list(response.data, 'riders');
  }

  Future<List<Map<String, dynamic>>> products() async {
    final response = await _dio.get('/admin/products');
    return _list(response.data, 'products');
  }

  Future<void> updateProduct(int id, Map<String, dynamic> payload) async {
    await _dio.patch('/admin/products/$id', data: payload);
  }

  Future<List<Map<String, dynamic>>> announcements() async {
    final response = await _dio.get('/admin/announcements');
    return _list(response.data, 'announcements');
  }

  Future<void> createAnnouncement(Map<String, dynamic> payload) async {
    await _dio.post('/admin/announcements', data: payload);
  }

  Future<void> updateAnnouncement(int id, Map<String, dynamic> payload) async {
    await _dio.patch('/admin/announcements/$id', data: payload);
  }

  Future<void> deleteAnnouncement(int id) async {
    await _dio.delete('/admin/announcements/$id');
  }

  Future<List<Map<String, dynamic>>> customers() async {
    final response = await _dio.get('/admin/customers');
    return _list(response.data, 'customers');
  }

  Future<Map<String, dynamic>> reports() async {
    final response = await _dio.get('/admin/reports/summary');
    return _map(response.data);
  }

  Future<Map<String, dynamic>> _safeGet(String path) async {
    final response = await _dio.get(path);
    return _map(response.data);
  }
}

Map<String, dynamic> _map(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _list(dynamic value, String key) {
  final body = _map(value);
  final items = body[key] ?? body['data'] ?? value;
  if (items is List) {
    return items
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
  return const [];
}
