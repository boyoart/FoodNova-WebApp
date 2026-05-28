import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../services/notification_service.dart';

final notificationsRepositoryProvider =
    Provider((ref) => NotificationsRepository(ref.watch(dioProvider)));
final notificationsProvider =
    FutureProvider((ref) => ref.watch(notificationsRepositoryProvider).list());
final unreadNotificationsProvider = FutureProvider<int>(
    (ref) => ref.watch(notificationsRepositoryProvider).unreadCount());
final notificationRefreshProvider =
    StreamProvider<void>((ref) => NotificationService.refreshStream);

class NotificationsRepository {
  NotificationsRepository(this._dio);

  final Dio _dio;

  Future<List<Map<String, dynamic>>> list() async {
    final response = await _dio.get('/notifications');
    final items = response.data['notifications'] ?? response.data['data'] ?? [];
    return (items as List)
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<int> unreadCount() async {
    final response = await _dio.get('/notifications/unread-count');
    final data = response.data;
    final value =
        data is Map ? (data['count'] ?? data['data']?['count'] ?? 0) : 0;
    return int.tryParse('$value') ?? 0;
  }

  Future<void> registerFcmToken(String token) async {
    if (token.trim().isEmpty) return;
    await _dio.post('/notifications/register-fcm-token', data: {
      'token': token.trim(),
    });
  }

  Future<void> markRead(int id) async {
    await _dio.patch('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _dio.patch('/notifications/read-all');
  }

  Future<void> delete(int id) async {
    await _dio.delete('/notifications/$id');
  }
}
