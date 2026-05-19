class Product {
  const Product({
    required this.id,
    required this.name,
    required this.price,
    required this.imageUrl,
    required this.category,
    required this.description,
    required this.stock,
  });

  final int id;
  final String name;
  final double price;
  final String imageUrl;
  final String category;
  final String description;
  final int stock;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: int.tryParse('${json['id']}') ?? 0,
      name: '${json['name'] ?? ''}',
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      imageUrl: '${json['image_url'] ?? json['imageUrl'] ?? ''}',
      category: '${json['category'] ?? json['category_name'] ?? ''}',
      description: '${json['description'] ?? ''}',
      stock: int.tryParse('${json['stock_qty'] ?? json['stock'] ?? 0}') ?? 0,
    );
  }
}
