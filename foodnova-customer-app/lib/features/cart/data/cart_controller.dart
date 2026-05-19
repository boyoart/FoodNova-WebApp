import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/product.dart';
import '../domain/cart_item.dart';

final cartControllerProvider = StateNotifierProvider<CartController, List<CartItem>>((_) => CartController());

class CartController extends StateNotifier<List<CartItem>> {
  CartController() : super(const []);

  double get total => state.fold(0, (sum, item) => sum + item.lineTotal);

  void add(Product product) {
    final index = state.indexWhere((item) => item.product.id == product.id);
    if (index == -1) {
      state = [...state, CartItem(product: product, quantity: 1)];
      return;
    }
    state = [
      for (var i = 0; i < state.length; i++)
        if (i == index) state[i].copyWith(quantity: state[i].quantity + 1) else state[i],
    ];
  }

  void updateQuantity(int productId, int quantity) {
    if (quantity <= 0) {
      state = state.where((item) => item.product.id != productId).toList();
      return;
    }
    state = [
      for (final item in state)
        if (item.product.id == productId) item.copyWith(quantity: quantity) else item,
    ];
  }

  void clear() => state = const [];
}
