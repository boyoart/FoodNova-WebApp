import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final notificationsRepositoryProvider = Provider(NotificationsRepository.new);
final notificationsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(notificationsRepositoryProvider).all();
});
final unreadCountProvider = FutureProvider.autoDispose((ref) {
  return ref.read(notificationsRepositoryProvider).unreadCount();
});

class NotificationsRepository {
  NotificationsRepository(this.ref);
  final Ref ref;
  Dio get _dio => ref.read(dioProvider);

  Future<List<Map<String, dynamic>>> all() async {
    final response = await _dio.get('/notifications');
    final body = response.data as Map;
    return ((body['notifications'] ?? body['data'] ?? []) as List)
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<int> unreadCount() async {
    final response = await _dio.get('/notifications/unread-count');
    final body = response.data as Map;
    return int.tryParse('${body['count'] ?? body['unread_count'] ?? 0}') ?? 0;
  }

  Future<void> markRead(int id) =>
      _dio.patch('/notifications/$id/read').then((_) {});
}
