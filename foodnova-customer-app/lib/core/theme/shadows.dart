import 'package:flutter/material.dart';

import 'colors.dart';

class FoodNovaShadows {
  const FoodNovaShadows._();

  static List<BoxShadow> get soft => [
        BoxShadow(
          color: FoodNovaColors.text.withOpacity(0.09),
          blurRadius: 30,
          offset: const Offset(0, 12),
        ),
      ];

  static List<BoxShadow> get nav => [
        BoxShadow(
          color: FoodNovaColors.primaryDark.withOpacity(0.28),
          blurRadius: 28,
          offset: const Offset(0, 12),
        ),
      ];
}
