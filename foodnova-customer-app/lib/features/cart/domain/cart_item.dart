import '../../../shared/models/product.dart';

class CartItem {
  const CartItem({required this.product, required this.quantity});

  final Product product;
  final int quantity;

  double get lineTotal => product.price * quantity;

  CartItem copyWith({Product? product, int? quantity}) {
    return CartItem(product: product ?? this.product, quantity: quantity ?? this.quantity);
  }

  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      product: Product.fromJson(Map<String, dynamic>.from(json['product'] ?? json)),
      quantity: int.tryParse('${json['quantity'] ?? json['qty'] ?? 1}') ?? 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'product': product.toJson(),
      'quantity': quantity,
    };
  }
}
