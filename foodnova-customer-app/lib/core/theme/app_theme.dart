import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';
import 'spacing.dart';
import 'typography.dart';

class AppTheme {
  static ThemeData get light {
    final textTheme = GoogleFonts.interTextTheme();
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: FoodNovaColors.bg,
      colorScheme: ColorScheme.fromSeed(
        seedColor: FoodNovaColors.primary,
        primary: FoodNovaColors.primary,
        secondary: FoodNovaColors.accent,
        surface: Colors.white,
      ),
      textTheme: textTheme.apply(
        bodyColor: FoodNovaColors.text,
        displayColor: FoodNovaColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: FoodNovaColors.bg,
        foregroundColor: FoodNovaColors.text,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusLg)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        labelStyle: const TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w700),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide: const BorderSide(color: FoodNovaColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide: const BorderSide(color: FoodNovaColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide: const BorderSide(color: FoodNovaColors.primary, width: 1.4),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: FoodNovaColors.primary,
          foregroundColor: Colors.white,
          textStyle: FoodNovaTypography.body.copyWith(fontWeight: FontWeight.w800),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusPill)),
          minimumSize: const Size.fromHeight(52),
        ),
      ),
    );
  }
}
