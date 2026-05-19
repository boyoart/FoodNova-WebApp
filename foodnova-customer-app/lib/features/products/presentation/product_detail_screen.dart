import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/fn_button.dart';
import '../../cart/data/cart_controller.dart';
import '../data/product_repository.dart';

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({required this.productId, super.key});

  final int productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productFuture = ref.watch(productRepositoryProvider).product(productId);
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return FutureBuilder(
      future: productFuture,
      builder: (context, snapshot) {
        final product = snapshot.data;
        return Scaffold(
          appBar: AppBar(),
          body: product == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(30),
                      child: product.imageUrl.isEmpty
                          ? Container(height: 320, color: FoodNovaColors.softGrey)
                          : CachedNetworkImage(imageUrl: product.imageUrl, height: 320, fit: BoxFit.cover),
                    ),
                    const SizedBox(height: 22),
                    Text(product.name, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text(currency.format(product.price), style: Theme.of(context).textTheme.titleLarge?.copyWith(color: FoodNovaColors.deepGreen, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 16),
                    Text(product.description.isEmpty ? 'Premium FoodNova market item prepared for neighborhood fulfillment.' : product.description),
                    const SizedBox(height: 30),
                    FnButton(label: 'Add to cart', icon: Icons.add_shopping_cart_rounded, onPressed: () => ref.read(cartControllerProvider.notifier).add(product)),
                  ],
                ),
        );
      },
    );
  }
}

