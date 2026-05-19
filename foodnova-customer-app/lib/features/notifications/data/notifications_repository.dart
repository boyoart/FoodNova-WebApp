import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final notificationsRepositoryProvider = Provider((ref) => NotificationsRepository(ref.watch(dioProvider)));
final notificationsProvider = FutureProvider((ref) => ref.watch(notificationsRepositoryProvider).list());

class NotificationsRepository {
  NotificationsRepository(this._dio);

  final Dio _dio;

  Future<List<Map<String, dynamic>>> list() async {
    final response = await _dio.get('/notifications');
    final items = response.data['notifications'] ?? response.data['data'] ?? [];
    return (items as List).map((item) => Map<String, dynamic>.from(item)).toList();
  }
}
