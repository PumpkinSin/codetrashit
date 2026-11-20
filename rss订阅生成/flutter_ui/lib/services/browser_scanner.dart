import 'dart:convert';
import 'dart:io';
import '../models/app_state.dart';

class LocalBrowserScanner {
  static List<BrowserInfo> scan() {
    final List<BrowserInfo> result = [];
    final localAppData = Platform.environment['LOCALAPPDATA'] ?? '';
    final appData = Platform.environment['APPDATA'] ?? '';

    // Gecko browsers first (Zen & Firefox)
    final geckoConfigs = [
      {'name': 'Zen', 'type': 'firefox', 'base': '$appData\\zen\\Profiles'},
      {'name': 'Firefox', 'type': 'firefox', 'base': '$appData\\Mozilla\\Firefox\\Profiles'},
    ];

    for (final cfg in geckoConfigs) {
      final baseDir = Directory(cfg['base']!);
      if (baseDir.existsSync()) {
        final profiles = <BrowserProfileInfo>[];
        try {
          for (final entity in baseDir.listSync()) {
            if (entity is Directory) {
              final cookieFile = File('${entity.path}\\cookies.sqlite');
              if (cookieFile.existsSync()) {
                final name = entity.uri.pathSegments.reversed.skip(1).first;
                profiles.add(BrowserProfileInfo(label: name, path: entity.path));
              }
            }
          }
        } catch (_) {}
        if (profiles.isNotEmpty) {
          result.add(BrowserInfo(name: cfg['name']!, browserType: cfg['type']!, profiles: profiles));
        }
      }
    }

    // Chromium browsers (Chrome, Edge, Vivaldi)
    final chromiumConfigs = [
      {'name': 'Chrome', 'type': 'chromium', 'base': '$localAppData\\Google\\Chrome\\User Data'},
      {'name': 'Edge', 'type': 'chromium', 'base': '$localAppData\\Microsoft\\Edge\\User Data'},
      {'name': 'Vivaldi', 'type': 'chromium', 'base': '$localAppData\\Vivaldi\\User Data'},
    ];

    for (final cfg in chromiumConfigs) {
      final baseDir = Directory(cfg['base']!);
      if (baseDir.existsSync()) {
        final profiles = <BrowserProfileInfo>[];
        try {
          for (final entity in baseDir.listSync()) {
            if (entity is Directory) {
              final name = entity.uri.pathSegments.reversed.skip(1).first;
              if (name == 'Default' || name.startsWith('Profile ')) {
                final hasCookies = File('${entity.path}\\Network\\Cookies').existsSync() ||
                    File('${entity.path}\\Cookies').existsSync();
                if (hasCookies) {
                  String label = name;
                  final prefFile = File('${entity.path}\\Preferences');
                  if (prefFile.existsSync()) {
                    try {
                      final json = jsonDecode(prefFile.readAsStringSync());
                      final customName = json['profile']?['name'];
                      if (customName != null && customName.toString().isNotEmpty) {
                        label = '$name ($customName)';
                      }
                    } catch (_) {}
                  }
                  profiles.add(BrowserProfileInfo(label: label, path: entity.path));
                }
              }
            }
          }
        } catch (_) {}
        if (profiles.isNotEmpty) {
          result.add(BrowserInfo(name: cfg['name']!, browserType: cfg['type']!, profiles: profiles));
        }
      }
    }

    return result;
  }
}
