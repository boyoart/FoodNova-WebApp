import '../../config/app_config.dart';

class ProductVariant {
  const ProductVariant({
    required this.id,
    required this.productId,
    required this.sku,
    required this.weight,
    required this.price,
    required this.stock,
    required this.isActive,
    this.imageUrl = '',
  });

  final int id;
  final int productId;
  final String sku;
  final String weight;
  final double price;
  final int stock;
  final bool isActive;
  final String imageUrl;

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    return ProductVariant(
      id: int.tryParse('${json['id']}') ?? 0,
      productId:
          int.tryParse('${json['product_id'] ?? json['productId']}') ?? 0,
      sku: '${json['sku'] ?? ''}',
      weight: '${json['weight'] ?? json['label'] ?? ''}',
      price:
          double.tryParse('${json['price'] ?? json['unit_price'] ?? 0}') ?? 0,
      stock: int.tryParse('${json['stock_qty'] ?? json['stock'] ?? 0}') ?? 0,
      isActive: (json['is_active'] ?? json['active']) != false,
      imageUrl: AppConfig.resolveMediaUrl(
          '${json['image_url'] ?? json['imageUrl'] ?? ''}'),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'product_id': productId,
        'sku': sku,
        'weight': weight,
        'price': price,
        'stock_qty': stock,
        'stock': stock,
        'is_active': isActive,
        'image_url': imageUrl,
      };
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.price,
    required this.imageUrl,
    required this.category,
    required this.description,
    required this.stock,
    this.type = 'product',
    this.contents = const [],
    this.packInfo = '',
    this.servingEstimate = '',
    this.freshnessNote = '',
    this.deliveryNote = '',
    this.variants = const [],
    this.selectedVariant,
  });

  final int id;
  final String name;
  final double price;
  final String imageUrl;
  final String category;
  final String description;
  final int stock;
  final String type;
  final List<String> contents;
  final String packInfo;
  final String servingEstimate;
  final String freshnessNote;
  final String deliveryNote;
  final List<ProductVariant> variants;
  final ProductVariant? selectedVariant;

  bool get hasVariants =>
      variants.where((variant) => variant.isActive).length > 1;
  String get variantWeight => selectedVariant?.weight ?? '';
  String get sku => selectedVariant?.sku ?? '';
  String get displayName =>
      variantWeight.isEmpty ? name : '$name - $variantWeight';
  String get cartKey =>
      '$type-$id-${selectedVariant?.id ?? selectedVariant?.sku ?? ''}';
  double get startingPrice {
    final prices = variants
        .where((variant) => variant.isActive && variant.price > 0)
        .map((variant) => variant.price)
        .toList();
    if (prices.isEmpty) return price;
    prices.sort();
    return prices.first;
  }

  Product withVariant(ProductVariant? variant) {
    if (variant == null) return this;
    return Product(
      id: id,
      name: name,
      price: variant.price,
      imageUrl: variant.imageUrl.isEmpty ? imageUrl : variant.imageUrl,
      category: category,
      description: description,
      stock: variant.stock,
      type: type,
      contents: contents,
      packInfo: packInfo,
      servingEstimate: servingEstimate,
      freshnessNote: freshnessNote,
      deliveryNote: deliveryNote,
      variants: variants,
      selectedVariant: variant,
    );
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    final type = '${json['item_type'] ?? json['type'] ?? 'product'}';
    final contents = _parseContents(
      json['contents'] ??
          json['included_items'] ??
          json['items_included'] ??
          json['whats_included'] ??
          json['pack_contents'] ??
          json['items'],
    );
    final variants = (json['variants'] is List)
        ? (json['variants'] as List)
            .whereType<Map>()
            .map((item) =>
                ProductVariant.fromJson(Map<String, dynamic>.from(item)))
            .where((variant) => variant.isActive)
            .toList()
        : <ProductVariant>[];
    final sortedPrices = variants
        .where((variant) => variant.price > 0)
        .map((variant) => variant.price)
        .toList()
      ..sort();
    final startingPrice = sortedPrices.isNotEmpty ? sortedPrices.first : null;
    final productImage =
        '${json['image_url'] ?? json['imageUrl'] ?? json['image'] ?? ''}';
    final categoryImage = '${json['category_image_url'] ?? ''}';
    final effectiveImage = '${json['effective_image_url'] ?? ''}';
    final defaultImage = '${json['default_image_url'] ?? '/placeholder.svg'}';
    final stockTotal = variants.isNotEmpty
        ? variants.fold<int>(0, (sum, variant) => sum + variant.stock)
        : int.tryParse('${json['stock_qty'] ?? json['stock'] ?? 0}') ?? 0;
    return Product(
      id: int.tryParse('${json['id']}') ?? 0,
      name: '${json['name'] ?? ''}',
      price: double.tryParse('${startingPrice ?? json['price'] ?? 0}') ?? 0,
      imageUrl: AppConfig.resolveMediaUrl(productImage.isNotEmpty
          ? productImage
          : effectiveImage.isNotEmpty
              ? effectiveImage
              : categoryImage.isNotEmpty
                  ? categoryImage
                  : defaultImage),
      category: '${json['category'] ?? json['category_name'] ?? ''}',
      description: '${json['description'] ?? ''}',
      stock: stockTotal,
      type: type,
      contents: contents,
      packInfo:
          '${json['pack_info'] ?? json['packInfo'] ?? _defaultPackInfo(type)}'
              .trim(),
      servingEstimate:
          '${json['serving_estimate'] ?? json['servingEstimate'] ?? _defaultServingEstimate(type)}'
              .trim(),
      freshnessNote:
          '${json['freshness_note'] ?? json['freshnessNote'] ?? _defaultFreshnessNote(type)}'
              .trim(),
      deliveryNote:
          '${json['delivery_note'] ?? json['deliveryNote'] ?? _defaultDeliveryNote(type)}'
              .trim(),
      variants: variants,
      selectedVariant: null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'display_name': displayName,
      'price': price,
      'image_url': imageUrl,
      'category': category,
      'description': description,
      'stock_qty': stock,
      'stock': stock,
      'item_type': type,
      'type': type,
      'variant_id': selectedVariant?.id,
      'variant_weight': variantWeight,
      'sku': sku,
      'cart_key': cartKey,
      'variants': variants.map((variant) => variant.toJson()).toList(),
      'contents': contents,
      'items': contents,
      'pack_info': packInfo,
      'serving_estimate': servingEstimate,
      'freshness_note': freshnessNote,
      'delivery_note': deliveryNote,
    };
  }

  List<String> get displayContents {
    final clean = contents
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    if (clean.isNotEmpty) return clean;
    if (type == 'pack') return const ['FoodNova curated pack contents'];
    return [name];
  }
}

List<String> _parseContents(dynamic value) {
  if (value == null) return const [];
  if (value is List) {
    return value
        .map((item) {
          if (item is Map) {
            final name =
                '${item['name'] ?? item['title'] ?? item['item'] ?? ''}'.trim();
            final quantity = '${item['quantity'] ?? item['qty'] ?? ''}'.trim();
            final unit = '${item['unit'] ?? ''}'.trim();
            return [quantity, unit, name]
                .where((part) => part.isNotEmpty)
                .join(' ');
          }
          return '$item'.trim();
        })
        .where((item) => item.isNotEmpty)
        .toList();
  }
  final raw = '$value'.trim();
  if (raw.isEmpty || raw == '[]') return const [];
  return raw
      .replaceAll(RegExp(r'[\[\]"]'), '')
      .split(RegExp(r'[\n;,•]+'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();
}

String _defaultPackInfo(String type) {
  return type == 'pack' ? 'Curated grocery pack' : 'Single grocery item';
}

String _defaultServingEstimate(String type) {
  return type == 'pack'
      ? 'Sized for household restocking'
      : 'Serving varies by item and quantity selected';
}

String _defaultFreshnessNote(String type) {
  return type == 'pack'
      ? 'Packed from current FoodNova inventory before dispatch'
      : 'Quality checked before fulfillment';
}

String _defaultDeliveryNote(String type) {
  return type == 'pack'
      ? 'Delivered after payment confirmation and packing'
      : 'Delivered with your FoodNova order';
}
