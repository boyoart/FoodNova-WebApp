import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/models/product.dart';
import '../../../config/app_config.dart';

final productRepositoryProvider =
    Provider((ref) => ProductRepository(ref.watch(dioProvider)));

final productsProvider = FutureProvider<List<Product>>((ref) {
  return ref.watch(productRepositoryProvider).listProducts();
});

final categoriesProvider = FutureProvider<List<String>>((ref) {
  return ref.watch(productRepositoryProvider).listCategories();
});

final productDetailProvider = FutureProvider.family<Product, int>((ref, id) {
  return ref.watch(productRepositoryProvider).product(id);
});

final packDetailProvider = FutureProvider.family<Product, int>((ref, id) {
  return ref.watch(productRepositoryProvider).pack(id);
});

final packsProvider = FutureProvider<List<Product>>((ref) {
  return ref.watch(productRepositoryProvider).listPacks();
});

final activeAnnouncementsProvider =
    FutureProvider<List<FoodNovaAnnouncement>>((ref) {
  return ref.watch(productRepositoryProvider).activeAnnouncements();
});

final heroBannersProvider = FutureProvider<List<FoodNovaAnnouncement>>((ref) {
  return ref.watch(productRepositoryProvider).heroBanners();
});

class ProductRepository {
  ProductRepository(this._dio);

  final Dio _dio;
  List<Product>? _productCache;
  List<String>? _categoryCache;
  List<Product>? _packCache;
  List<FoodNovaAnnouncement>? _announcementCache;

  Future<List<Product>> listProducts(
      {String? search, bool forceRefresh = false}) async {
    final normalizedSearch = (search ?? '').trim().toLowerCase();
    if (!forceRefresh && normalizedSearch.isEmpty && _productCache != null) {
      return _productCache!;
    }
    final response = await _dio.get('/products',
        queryParameters:
            normalizedSearch.isEmpty ? null : {'search': normalizedSearch});
    final body = response.data;
    final items = body is Map ? (body['products'] ?? body['data']) : body;
    final products = (items as List? ?? [])
        .map((item) => Product.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    if (normalizedSearch.isEmpty) _productCache = products;
    return products;
  }

  Future<Product> product(int id) async {
    final response = await _dio.get('/products/$id');
    final body = response.data;
    final item = body is Map ? (body['product'] ?? body['data'] ?? body) : body;
    return Product.fromJson(Map<String, dynamic>.from(item));
  }

  Future<List<Product>> listPacks({bool forceRefresh = false}) async {
    if (!forceRefresh && _packCache != null) return _packCache!;
    final response = await _dio.get('/packs');
    final body = response.data;
    final items = body is Map ? (body['packs'] ?? body['data']) : body;
    final packs = (items as List? ?? []).map((item) {
      final data = Map<String, dynamic>.from(item);
      return Product.fromJson({
        ...data,
        'category': 'Food Packs',
        'category_name': 'Food Packs',
        'stock_qty': data['stock_qty'] ?? data['stock'] ?? 999,
        'item_type': 'pack',
        'type': 'pack',
      });
    }).toList();
    _packCache = packs;
    return packs;
  }

  Future<Product> pack(int id) async {
    final response = await _dio.get('/packs/$id');
    final body = response.data;
    final data = Map<String, dynamic>.from(
        body is Map ? (body['pack'] ?? body['data'] ?? body) : body);
    return Product.fromJson({
      ...data,
      'category': 'Food Packs',
      'category_name': 'Food Packs',
      'stock_qty': data['stock_qty'] ?? data['stock'] ?? 999,
      'item_type': 'pack',
      'type': 'pack',
    });
  }

  Future<List<String>> listCategories({bool forceRefresh = false}) async {
    if (!forceRefresh && _categoryCache != null) return _categoryCache!;
    final response = await _dio.get('/categories');
    final body = response.data;
    final items = body is Map ? (body['categories'] ?? body['data']) : body;
    final categories = (items as List? ?? [])
        .map((item) {
          if (item is Map) return '${item['name'] ?? ''}';
          return '$item';
        })
        .where((item) => item.isNotEmpty)
        .toList();
    _categoryCache = categories;
    return categories;
  }

  Future<List<FoodNovaAnnouncement>> activeAnnouncements(
      {bool forceRefresh = false}) async {
    if (!forceRefresh && _announcementCache != null) return _announcementCache!;
    final response = await _dio.get('/announcements/active');
    final body = response.data;
    final items = body is Map ? (body['announcements'] ?? body['data']) : body;
    final announcements = (items as List? ?? [])
        .map((item) =>
            FoodNovaAnnouncement.fromJson(Map<String, dynamic>.from(item)))
        .where((item) => item.isActive)
        .toList()
      ..sort((a, b) => b.priority.compareTo(a.priority));
    _announcementCache = announcements;
    return announcements;
  }

  Future<List<FoodNovaAnnouncement>> heroBanners(
      {bool forceRefresh = false}) async {
    final announcements = await activeAnnouncements(forceRefresh: forceRefresh);
    return announcements
        .where((item) => item.displayType == 'hero_banner')
        .toList();
  }
}

class FoodNovaAnnouncement {
  const FoodNovaAnnouncement({
    required this.id,
    required this.title,
    required this.message,
    required this.displayType,
    required this.imageUrl,
    required this.buttonText,
    required this.buttonLink,
    required this.theme,
    required this.priority,
    required this.isActive,
  });

  final int id;
  final String title;
  final String message;
  final String displayType;
  final String imageUrl;
  final String buttonText;
  final String buttonLink;
  final String theme;
  final int priority;
  final bool isActive;

  factory FoodNovaAnnouncement.fromJson(Map<String, dynamic> json) {
    return FoodNovaAnnouncement(
      id: int.tryParse('${json['id']}') ?? 0,
      title: '${json['title'] ?? ''}'.trim(),
      message: '${json['message'] ?? json['subtitle'] ?? ''}'.trim(),
      displayType: '${json['display_type'] ?? ''}'.trim(),
      imageUrl: AppConfig.resolveMediaUrl('${json['image_url'] ?? ''}'),
      buttonText: '${json['button_text'] ?? ''}'.trim(),
      buttonLink: '${json['button_link'] ?? ''}'.trim(),
      theme: '${json['theme'] ?? 'green'}'.trim(),
      priority: int.tryParse('${json['priority'] ?? 0}') ?? 0,
      isActive: json['is_active'] != false,
    );
  }
}
