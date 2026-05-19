import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../cart/domain/cart_item.dart';

final checkoutRepositoryProvider = Provider((ref) => CheckoutRepository(ref.watch(dioProvider)));

class CheckoutRepository {
  CheckoutRepository(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> createOrder({
    required List<CartItem> items,
    required String address,
    required String phone,
    String notes = '',
  }) async {
    final total = items.fold<double>(0, (sum, item) => sum + item.lineTotal);
    final response = await _dio.post('/orders', data: {
      'items': items.map((item) => {
            'product_id': item.product.id,
            'name': item.product.name,
            'price': item.product.price,
            'quantity': item.quantity,
          }).toList(),
      'total_amount': total,
      'delivery_address': address,
      'phone': phone,
      'delivery_notes': notes,
      'payment_method': 'bank_transfer',
      'delivery_method': 'delivery',
    });
    return Map<String, dynamic>.from(response.data['order'] ?? response.data['data'] ?? {});
  }
}
