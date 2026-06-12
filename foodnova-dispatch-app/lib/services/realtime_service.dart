import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../core/state/session_controller.dart';
import 'notification_service.dart';

final realtimeServiceProvider = Provider((ref) => DispatchRealtimeService(ref));

class DispatchRealtimeService {
  DispatchRealtimeService(this._ref);

  final Ref _ref;
  io.Socket? _socket;
  final StreamController<Map<String, dynamic>> _events =
      StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get events => _events.stream;

  Future<void> connect() async {
    final existing = _socket;
    if (existing != null && existing.connected) return;

    final token = await _ref.read(sessionControllerProvider.notifier).token();
    if ((token ?? '').trim().isEmpty) return;

    final socket = io.io(
      AppConfig.normalizedApiBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .setQuery({'client': 'foodnova-dispatch-android'})
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      debugPrint('DISPATCH_SOCKET_CONNECTED');
      socket.emit('dispatch:subscribe', {});
    });
    socket.onDisconnect((_) => debugPrint('DISPATCH_SOCKET_DISCONNECTED'));
    socket
        .onConnectError((error) => debugPrint('DISPATCH_SOCKET_ERROR $error'));
    socket.onError((error) => debugPrint('DISPATCH_SOCKET_ERROR $error'));

    for (final eventName in [
      'delivery:assigned',
      'dispatch:assignment',
      'delivery:status',
      'delivery:completed',
      'notification:new',
      'rider:availability',
    ]) {
      socket.off(eventName);
      socket.on(eventName, (payload) => _handleEvent(eventName, payload));
    }

    socket.connect();
  }

  void _handleEvent(String eventName, Object? payload) {
    final data = payload is Map
        ? Map<String, dynamic>.from(payload)
        : <String, dynamic>{'payload': payload};
    data['socket_event'] = eventName;
    debugPrint('DISPATCH_SOCKET_EVENT $eventName $data');
    _events.add(data);

    if (eventName == 'delivery:assigned' ||
        eventName == 'dispatch:assignment') {
      final order = data['order'] is Map
          ? Map<String, dynamic>.from(data['order'] as Map)
          : <String, dynamic>{};
      final code = '${order['order_code'] ?? order['orderCode'] ?? ''}'.trim();
      DispatchNotificationService.showLocalDeliveryUpdate(
        title: 'New Delivery Assigned',
        body: code.isEmpty
            ? 'A FoodNova delivery has been assigned to you.'
            : 'FoodNova order $code has been assigned to you.',
        payload: '/orders',
      );
    }
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
