import 'package:flutter/material.dart';

class AppColors {
  static const Color bg = Color(0xFF1A1B2E);
  static const Color bgHeader = Color(0xFF0F3460);
  static const Color surface = Color(0xFF1E2040);
  static const Color surface2 = Color(0xFF252747);
  static const Color accent = Color(0xFF7C6AF7);
  static const Color accentLight = Color(0xFFA89CF7);
  static const Color green = Color(0xFF4ADE80);
  static const Color red = Color(0xFFF87171);
  static const Color text = Color(0xFFE2E8F0);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color logBg = Color(0xFF0D0F1A);
  static const Color logText = Color(0xFFA5F3FC);
}

ThemeData buildAppTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bg,
    fontFamily: 'Segoe UI',
    colorScheme: const ColorScheme.dark(
      primary: AppColors.accent,
      surface: AppColors.surface,
      error: AppColors.red,
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );
}
