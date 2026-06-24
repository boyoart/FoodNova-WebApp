import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../shared/models/product.dart';

const productPlaceholderAsset = 'assets/images/product_placeholder.png';

class ProductImage extends StatefulWidget {
  const ProductImage({
    required this.product,
    this.fit = BoxFit.cover,
    this.showPlaceholderBanner = true,
    this.placeholderIcon = Icons.shopping_basket_rounded,
    super.key,
  });

  final Product product;
  final BoxFit fit;
  final bool showPlaceholderBanner;
  final IconData placeholderIcon;

  @override
  State<ProductImage> createState() => _ProductImageState();
}

class _ProductImageState extends State<ProductImage> {
  bool _networkFailed = false;

  @override
  void initState() {
    super.initState();
    _logProductImage();
  }

  @override
  void didUpdateWidget(covariant ProductImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product.cartKey != widget.product.cartKey ||
        oldWidget.product.image != widget.product.image) {
      _networkFailed = false;
      _logProductImage();
    }
  }

  bool get _hasValidNetworkImage {
    final value = widget.product.image.trim();
    if (value.isEmpty) return false;
    final uri = Uri.tryParse(value);
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
  }

  bool get _usingPlaceholder => !_hasValidNetworkImage || _networkFailed;

  void _logProductImage() {
    debugPrint('PRODUCT_NAME: ${widget.product.name}');
    debugPrint('PRODUCT_IMAGE: ${widget.product.image}');
    if (!_hasValidNetworkImage) {
      debugPrint('PLACEHOLDER_USED');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_usingPlaceholder) {
      return _ProductPlaceholder(
        icon: widget.placeholderIcon,
        showBanner: widget.showPlaceholderBanner,
      );
    }

    return Image.network(
      widget.product.image,
      fit: widget.fit,
      width: double.infinity,
      height: double.infinity,
      errorBuilder: (context, error, stackTrace) {
        debugPrint('PRODUCT_NAME: ${widget.product.name}');
        debugPrint('PRODUCT_IMAGE: ${widget.product.image}');
        debugPrint('PLACEHOLDER_USED');
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _networkFailed = true);
        });
        return _ProductPlaceholder(
          icon: widget.placeholderIcon,
          showBanner: widget.showPlaceholderBanner,
        );
      },
    );
  }
}

class _ProductPlaceholder extends StatelessWidget {
  const _ProductPlaceholder({
    required this.icon,
    required this.showBanner,
  });

  final IconData icon;
  final bool showBanner;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          productPlaceholderAsset,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => ColoredBox(
            color: scheme.surfaceContainerHighest,
            child: Center(
              child: Icon(icon, color: scheme.primary, size: 34),
            ),
          ),
        ),
        if (showBanner)
          Positioned(
            left: 8,
            right: 8,
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'Placeholder Active',
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: scheme.onPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
