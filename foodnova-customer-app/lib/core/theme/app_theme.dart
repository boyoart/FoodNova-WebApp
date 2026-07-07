import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';
import 'spacing.dart';

class AppTheme {
  static ThemeData get light {
    final textTheme = GoogleFonts.manropeTextTheme();
    return _base(
      brightness: Brightness.light,
      textTheme: textTheme,
      scaffoldBackgroundColor: FoodNovaColors.bg,
      surface: FoodNovaColors.surface,
      surfaceContainer: FoodNovaColors.surface2,
      text: FoodNovaColors.text,
      muted: FoodNovaColors.muted,
      border: FoodNovaColors.border,
    );
  }

  static ThemeData get dark {
    final textTheme = GoogleFonts.manropeTextTheme();
    return _base(
      brightness: Brightness.dark,
      textTheme: textTheme,
      scaffoldBackgroundColor: FoodNovaColors.darkBg,
      surface: FoodNovaColors.darkSurface,
      surfaceContainer: FoodNovaColors.darkSurface2,
      text: FoodNovaColors.darkText,
      muted: const Color(0xFFCACACA),
      border: const Color(0xFF485248),
    );
  }

  static ThemeData _base({
    required Brightness brightness,
    required TextTheme textTheme,
    required Color scaffoldBackgroundColor,
    required Color surface,
    required Color surfaceContainer,
    required Color text,
    required Color muted,
    required Color border,
  }) {
    final isDark = brightness == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: scaffoldBackgroundColor,
      colorScheme: ColorScheme.fromSeed(
        seedColor: FoodNovaColors.primary,
        brightness: brightness,
        primary: FoodNovaColors.primary,
        secondary: FoodNovaColors.accent,
        surface: surface,
        surfaceContainerLow:
            isDark ? FoodNovaColors.darkSurface : const Color(0xFFF1F3FF),
        surfaceContainer:
            isDark ? FoodNovaColors.darkSurface : const Color(0xFFE9EDFF),
        surfaceContainerHigh:
            isDark ? FoodNovaColors.darkSurface2 : const Color(0xFFE1E8FD),
        surfaceContainerHighest: surfaceContainer,
        onSurface: text,
        onSurfaceVariant: muted,
        outline: border,
        outlineVariant: border.withValues(alpha: isDark ? .7 : .55),
        onPrimary: const Color(0xFFFFFFFF),
        primaryContainer: const Color(0xFF14532D),
        onPrimaryContainer: const Color(0xFF87C695),
      ),
      textTheme: textTheme.apply(
        bodyColor: text,
        displayColor: text,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffoldBackgroundColor,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        titleTextStyle:
            TextStyle(color: text, fontSize: 22, fontWeight: FontWeight.w900),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusLg)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor:
            isDark ? surface : const Color(0xFFFFFFFF).withValues(alpha: .74),
        labelStyle: TextStyle(color: muted, fontWeight: FontWeight.w700),
        hintStyle: TextStyle(color: muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FoodNovaSpacing.radiusMd),
          borderSide:
              const BorderSide(color: FoodNovaColors.primary, width: 1.4),
        ),
      ),
      dividerTheme: DividerThemeData(color: border),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor:
            isDark ? FoodNovaColors.darkSurface2 : FoodNovaColors.text,
        contentTextStyle:
            TextStyle(color: isDark ? text : const Color(0xFFFFFFFF)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: FoodNovaColors.primary,
          foregroundColor: const Color(0xFFFFFFFF),
          textStyle: GoogleFonts.hankenGrotesk(fontWeight: FontWeight.w700),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          minimumSize: const Size.fromHeight(52),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: FoodNovaColors.primary,
          textStyle: GoogleFonts.hankenGrotesk(fontWeight: FontWeight.w800),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: FoodNovaColors.accent,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            color: states.contains(WidgetState.selected)
                ? FoodNovaColors.primaryDark
                : muted,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
