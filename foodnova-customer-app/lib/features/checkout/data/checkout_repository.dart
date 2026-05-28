import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/address.dart';
import '../../cart/domain/cart_item.dart';

final checkoutRepositoryProvider =
    Provider((ref) => CheckoutRepository(ref.watch(dioProvider)));

class CheckoutRepository {
  CheckoutRepository(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> createOrder({
    required List<CartItem> items,
    required String address,
    required String phone,
    required double deliveryFee,
    required String paymentMethod,
    CustomerAddress? selectedAddress,
    String notes = '',
  }) async {
    final total = items.fold<double>(0, (sum, item) => sum + item.lineTotal);
    final response = await _dio.post('/orders', data: {
      'items': items
          .map((item) => {
                'product_id': item.product.id,
                'id': item.product.id,
                'item_type': item.product.type,
                'type': item.product.type,
                'name': item.product.name,
                'product_name': item.product.name,
                'price': item.product.price,
                'unit_price': item.product.price,
                'quantity': item.quantity,
                'qty': item.quantity,
              })
          .toList(),
      'subtotal_amount': total,
      'delivery_fee': deliveryFee,
      'total_amount': total + deliveryFee,
      'delivery_address': address,
      'delivery_address_id':
          selectedAddress?.id == 0 ? null : selectedAddress?.id,
      'delivery_address_snapshot': selectedAddress?.toPayload(),
      'phone': phone,
      'delivery_notes': notes,
      'payment_method': paymentMethod,
      'delivery_method': 'delivery',
    });
    return Map<String, dynamic>.from(
        response.data['order'] ?? response.data['data'] ?? {});
  }
}
