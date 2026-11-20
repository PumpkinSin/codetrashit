import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/engine_process.dart';
import 'ui/home_page.dart';
import 'ui/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => EngineManager(),
      child: const RssManagerApp(),
    ),
  );
}

class RssManagerApp extends StatelessWidget {
  const RssManagerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RSS 动态服务管理',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const HomePage(),
    );
  }
}
