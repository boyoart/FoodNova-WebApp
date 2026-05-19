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
    final socket = io.io(
      AppConfig.normalizedApiBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token ?? ''})
          .setQuery({'client': 'foodnova-customer-android'})
          .build(),
    );
    _socket = socket;
    socket.connect();
    return socket;
  }

  Future<void> subscribeToOrder(int orderId, void Function(Map<String, dynamic>) onUpdate) async {
    final socket = await connect();
    socket.emit('order:subscribe', {'order_id': orderId});
    socket.off('order:update:$orderId');
    socket.on('order:update:$orderId', (payload) {
      if (payload is Map) onUpdate(Map<String, dynamic>.from(payload));
    });
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
