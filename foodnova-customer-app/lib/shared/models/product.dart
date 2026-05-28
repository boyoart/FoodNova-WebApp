import '../../config/app_config.dart';

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
    return Product(
      id: int.tryParse('${json['id']}') ?? 0,
      name: '${json['name'] ?? ''}',
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      imageUrl: AppConfig.resolveMediaUrl(
          '${json['image_url'] ?? json['imageUrl'] ?? json['image'] ?? ''}'),
      category: '${json['category'] ?? json['category_name'] ?? ''}',
      description: '${json['description'] ?? ''}',
      stock: int.tryParse('${json['stock_qty'] ?? json['stock'] ?? 0}') ?? 0,
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
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'image_url': imageUrl,
      'category': category,
      'description': description,
      'stock_qty': stock,
      'stock': stock,
      'item_type': type,
      'type': type,
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
