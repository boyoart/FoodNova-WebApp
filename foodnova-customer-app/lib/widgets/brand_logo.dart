import 'package:flutter/material.dart';

class BrandLogo extends StatelessWidget {
  const BrandLogo({this.height = 64, this.invert = false, super.key});

  final double height;
  final bool invert;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/brand/foodnova-logo.png',
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Text(
        'FoodNova',
        style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
      ),
    );
  }
}
