import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/state/session_controller.dart';
import '../../../shared/models/product.dart';
import '../domain/cart_item.dart';

final cartControllerProvider = StateNotifierProvider<CartController, List<CartItem>>((ref) {
  return CartController(ref.watch(secureStorageProvider))..restore();
});

class CartController extends StateNotifier<List<CartItem>> {
  CartController(this._storage) : super(const []);

  final FlutterSecureStorage _storage;
  static const _storageKey = 'foodnova_cart_items';

  double get total => state.fold(0, (sum, item) => sum + item.lineTotal);

  Future<void> restore() async {
    final raw = await _storage.read(key: _storageKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        state = decoded.map((item) => CartItem.fromJson(Map<String, dynamic>.from(item))).toList();
      }
    } catch (_) {
      await _storage.delete(key: _storageKey);
    }
  }

  Future<void> _persist() async {
    await _storage.write(key: _storageKey, value: jsonEncode(state.map((item) => item.toJson()).toList()));
  }

  void add(Product product) {
    if (product.stock <= 0) return;
    final index = state.indexWhere((item) => item.product.id == product.id);
    if (index == -1) {
      state = [...state, CartItem(product: product, quantity: 1)];
      _persist();
      return;
    }
    state = [
      for (var i = 0; i < state.length; i++)
        if (i == index) state[i].copyWith(quantity: (state[i].quantity + 1).clamp(1, product.stock).toInt()) else state[i],
    ];
    _persist();
  }

  void updateQuantity(int productId, int quantity) {
    if (quantity <= 0) {
      state = state.where((item) => item.product.id != productId).toList();
      _persist();
      return;
    }
    state = [
      for (final item in state)
        if (item.product.id == productId) item.copyWith(quantity: quantity.clamp(1, item.product.stock).toInt()) else item,
    ];
    _persist();
  }

  void clear() {
    state = const [];
    _storage.delete(key: _storageKey);
  }
}
