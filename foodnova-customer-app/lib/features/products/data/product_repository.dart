import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/product.dart';

final productRepositoryProvider = Provider((ref) => ProductRepository(ref.watch(dioProvider)));

final productsProvider = FutureProvider<List<Product>>((ref) {
  return ref.watch(productRepositoryProvider).listProducts();
});

final categoriesProvider = FutureProvider<List<String>>((ref) {
  return ref.watch(productRepositoryProvider).listCategories();
});

class ProductRepository {
  ProductRepository(this._dio);

  final Dio _dio;

  Future<List<Product>> listProducts({String? search}) async {
    final response = await _dio.get('/products', queryParameters: {'search': search});
    final body = response.data;
    final items = body is Map ? (body['products'] ?? body['data']) : body;
    return (items as List? ?? []).map((item) => Product.fromJson(Map<String, dynamic>.from(item))).toList();
  }

  Future<Product> product(int id) async {
    final response = await _dio.get('/products/$id');
    final body = response.data;
    final item = body is Map ? (body['product'] ?? body['data'] ?? body) : body;
    return Product.fromJson(Map<String, dynamic>.from(item));
  }

  Future<List<String>> listCategories() async {
    final response = await _dio.get('/categories');
    final body = response.data;
    final items = body is Map ? (body['categories'] ?? body['data']) : body;
    return (items as List? ?? []).map((item) {
      if (item is Map) return '${item['name'] ?? ''}';
      return '$item';
    }).where((item) => item.isNotEmpty).toList();
  }
}
