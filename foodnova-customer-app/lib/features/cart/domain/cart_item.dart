import '../../../shared/models/product.dart';

class CartItem {
  const CartItem({required this.product, required this.quantity});

  final Product product;
  final int quantity;

  double get lineTotal => product.price * quantity;

  CartItem copyWith({Product? product, int? quantity}) {
    return CartItem(product: product ?? this.product, quantity: quantity ?? this.quantity);
  }
}
