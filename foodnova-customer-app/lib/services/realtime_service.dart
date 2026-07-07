import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../core/state/session_controller.dart';

final realtimeServiceProvider = Provider((ref) => RealtimeService(ref));

class RealtimeService {
  RealtimeService(this._ref);

  final Ref _ref;
  io.Socket? _socket;

  Future<io.Socket> connect() async {
    final existing = _socket;
    if (existing != null && existing.connected) return existing;

    final token = await _ref.read(sessionControllerProvider.notifier).token();
    debugPrint(
        'SOCKET CONNECTING ${AppConfig.normalizedApiBaseUrl}/socket.io/');
    final socket = io.io(
      AppConfig.normalizedApiBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setAuth({'token': token ?? ''})
          .setQuery({'client': 'foodnova-customer-android'})
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) => debugPrint('SOCKET_CONNECTED'));
    socket.onDisconnect((_) => debugPrint('SOCKET_DISCONNECTED'));
    socket.onReconnectAttempt((_) => debugPrint('SOCKET_RECONNECTING'));
    socket.onConnectError((error) => debugPrint('SOCKET_ERROR $error'));
    socket.onError((error) => debugPrint('SOCKET_ERROR $error'));
    socket.connect();
    return socket;
  }

  Future<void> subscribeToOrder(
      int orderId, void Function(Map<String, dynamic>) onUpdate) async {
    final socket = await connect();
    socket.emit('order:subscribe', {'order_id': orderId});
    debugPrint('SOCKET_SUBSCRIBED order:$orderId');
    socket.off('order:update:$orderId');
    socket.on('order:update:$orderId', (payload) {
      if (payload is Map) onUpdate(Map<String, dynamic>.from(payload));
    });
    socket.off('rider:location:$orderId');
    socket.on('rider:location:$orderId', (payload) {
      if (payload is Map) onUpdate(Map<String, dynamic>.from(payload));
    });
  }

  void disconnect() {
    debugPrint('SOCKET_DISCONNECTED requested_by_app');
    _socket?.dispose();
    _socket = null;
  }
}
