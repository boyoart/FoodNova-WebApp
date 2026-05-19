import 'package:flutter/material.dart';

import '../core/theme/colors.dart';
import 'brand_logo.dart';

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({this.message = 'Loading FoodNova', super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const BrandLogo(height: 70),
          const SizedBox(height: 18),
          const CircularProgressIndicator(color: FoodNovaColors.primary),
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
