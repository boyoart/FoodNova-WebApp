import 'package:flutter/material.dart';

class FoodNovaLogo extends StatelessWidget {
  const FoodNovaLogo({
    this.height = 64,
    this.width,
    this.invert = false,
    this.tightCrop = false,
    super.key,
  });

  final double height;
  final double? width;
  final bool invert;
  final bool tightCrop;

  @override
  Widget build(BuildContext context) {
    // Keep legacy constructor options, but never crop or recolour the artwork.
    final targetWidth = width ?? height * (828 / 394);
    return SizedBox(
      width: targetWidth,
      height: height,
      child: Image.asset(
        'assets/brand/foodnova-logo.png',
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        semanticLabel: 'FoodNova. Quality Foodstuff. Reliable Supply.',
      ),
    );
  }
}

class BrandLogo extends FoodNovaLogo {
  const BrandLogo({
    super.height,
    super.width,
    super.invert,
    super.tightCrop,
    super.key,
  });
}
