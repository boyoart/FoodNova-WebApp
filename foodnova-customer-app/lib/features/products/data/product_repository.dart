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

final productDetailProvider = FutureProvider.family<Product, int>((ref, id) {
  return ref.watch(productRepositoryProvider).product(id);
});

class ProductRepository {
  ProductRepository(this._dio);

  final Dio _dio;
  List<Product>? _productCache;
  List<String>? _categoryCache;

  Future<List<Product>> listProducts({String? search, bool forceRefresh = false}) async {
    final normalizedSearch = (search ?? '').trim().toLowerCase();
    if (!forceRefresh && normalizedSearch.isEmpty && _productCache != null) return _productCache!;
    final response = await _dio.get('/products', queryParameters: normalizedSearch.isEmpty ? null : {'search': normalizedSearch});
    final body = response.data;
    final items = body is Map ? (body['products'] ?? body['data']) : body;
    final products = (items as List? ?? []).map((item) => Product.fromJson(Map<String, dynamic>.from(item))).toList();
    if (normalizedSearch.isEmpty) _productCache = products;
    return products;
  }

  Future<Product> product(int id) async {
    final response = await _dio.get('/products/$id');
    final body = response.data;
    final item = body is Map ? (body['product'] ?? body['data'] ?? body) : body;
    return Product.fromJson(Map<String, dynamic>.from(item));
  }

  Future<List<String>> listCategories({bool forceRefresh = false}) async {
    if (!forceRefresh && _categoryCache != null) return _categoryCache!;
    final response = await _dio.get('/categories');
    final body = response.data;
    final items = body is Map ? (body['categories'] ?? body['data']) : body;
    final categories = (items as List? ?? []).map((item) {
      if (item is Map) return '${item['name'] ?? ''}';
      return '$item';
    }).where((item) => item.isNotEmpty).toList();
    _categoryCache = categories;
    return categories;
  }
}
