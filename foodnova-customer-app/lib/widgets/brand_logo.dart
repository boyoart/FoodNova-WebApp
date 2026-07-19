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
    final targetWidth = width ?? height * (tightCrop ? 2.34 : 4);
    final fallback = Icon(
      Icons.shopping_basket_rounded,
      size: height * .72,
      color: Theme.of(context).colorScheme.primary,
    );
    final logoImage = Image.asset(
      'assets/brand/foodnova-logo.png',
      width: tightCrop ? 1024 : targetWidth,
      height: tightCrop ? 1024 : height,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      errorBuilder: (_, __, ___) => fallback,
    );

    return SizedBox(
      width: targetWidth,
      height: height,
      child: tightCrop
          ? FittedBox(
              fit: BoxFit.contain,
              alignment: Alignment.centerLeft,
              child: SizedBox(
                width: 757,
                height: 324,
                child: Stack(
                  clipBehavior: Clip.hardEdge,
                  children: [
                    Positioned(
                      left: -128,
                      top: -310,
                      child: logoImage,
                    ),
                  ],
                ),
              ),
            )
          : Image.asset(
              'assets/brand/foodnova-logo.png',
              width: targetWidth,
              height: height,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
              errorBuilder: (_, __, ___) => fallback,
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
