import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../../cart/data/cart_controller.dart';
import '../data/product_repository.dart';

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({required this.productId, super.key});

  final int productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    final productState = ref.watch(productDetailProvider(productId));
    return Scaffold(
      appBar: AppBar(),
      body: productState.when(
        loading: () => const Padding(
              padding: EdgeInsets.all(20),
              child: Column(children: [SkeletonBox(height: 320, radius: 30), SizedBox(height: 20), SkeletonBox(height: 120, radius: 24)]),
            ),
        error: (error, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: EmptyState(title: 'Product unavailable', message: error.toString(), icon: Icons.wifi_off_rounded),
            ),
        data: (product) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(30),
                child: product.imageUrl.isEmpty
                    ? Container(height: 320, color: FoodNovaColors.surface2, child: const Icon(Icons.shopping_basket_rounded, color: FoodNovaColors.primary, size: 58))
                    : CachedNetworkImage(imageUrl: product.imageUrl, height: 320, fit: BoxFit.cover),
              ),
              const SizedBox(height: 22),
              Wrap(spacing: 8, runSpacing: 8, children: [
                StatusBadge(label: product.category.isEmpty ? 'FoodNova product' : product.category),
                const StatusBadge(label: 'Central inventory', tone: FoodNovaColors.accent),
              ]),
              const SizedBox(height: 14),
              Text(product.name, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, height: 1.02)),
              const SizedBox(height: 8),
              Text(currency.format(product.price), style: Theme.of(context).textTheme.titleLarge?.copyWith(color: FoodNovaColors.primary, fontWeight: FontWeight.w900)),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: FoodNovaColors.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: FoodNovaColors.border),
                  boxShadow: FoodNovaShadows.soft,
                ),
                child: Text(
                  product.description.isEmpty ? 'Premium FoodNova grocery item managed through central inventory and local fulfillment.' : product.description,
                  style: const TextStyle(height: 1.45),
                ),
              ),
            ],
          ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
          child: PrimaryButton(
                label: 'Add to cart',
                icon: Icons.add_shopping_cart_rounded,
            onPressed: productState.valueOrNull == null ? null : () => ref.read(cartControllerProvider.notifier).add(productState.valueOrNull!),
          ),
        ),
      ),
    );
  }
}
