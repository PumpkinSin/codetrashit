import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'ui/studio_home.dart';

void main() {
  runApp(const ScanBookStudioApp());
}

class ScanBookStudioApp extends StatelessWidget {
  const ScanBookStudioApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData.light(useMaterial3: true);
    return MaterialApp(
      title: 'ScanBook Studio',
      debugShowCheckedModeBanner: false,
      locale: const Locale('zh', 'CN'),
      supportedLocales: const [Locale('zh', 'CN')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: baseTheme.copyWith(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0078D7),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF0F0F0),
        dividerColor: const Color(0xFFD0D7DE),
        textTheme: baseTheme.textTheme.apply(
          fontFamily: 'Microsoft YaHei',
          fontFamilyFallback: const ['SimHei', 'PingFang SC'],
        ),
      ),
      home: const StudioHome(),
    );
  }
}
