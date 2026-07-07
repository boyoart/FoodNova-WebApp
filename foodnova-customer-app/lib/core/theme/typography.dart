import 'package:flutter/material.dart';

class FoodNovaTypography {
  const FoodNovaTypography._();

  static const fontFamily = 'Roboto';

  static TextStyle get display => const TextStyle(
        fontSize: 32,
        height: 1.12,
        fontWeight: FontWeight.w900,
        letterSpacing: 0,
      );

  static TextStyle get headline => const TextStyle(
        fontSize: 24,
        height: 1.18,
        fontWeight: FontWeight.w800,
        letterSpacing: 0,
      );

  static TextStyle get title => const TextStyle(
        fontSize: 18,
        height: 1.25,
        fontWeight: FontWeight.w800,
        letterSpacing: 0,
      );

  static TextStyle get body => const TextStyle(
        fontSize: 15,
        height: 1.55,
        fontWeight: FontWeight.w500,
        letterSpacing: 0,
      );

  static TextStyle get caption => const TextStyle(
        fontSize: 12,
        height: 1.35,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      );
}
