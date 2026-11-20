import 'dart:io';
import 'package:path/path.dart' as p;

/// Portable path resolver for ScanBook Studio (no hardcoded machine-specific paths).
class AppPaths {
  static String? _cachedRoot;

  static String get rootDir {
    if (_cachedRoot != null) return _cachedRoot!;
    final candidates = <String>[
      Directory.current.path,
      p.dirname(Platform.resolvedExecutable),
      // When running from build\windows\x64\runner\Release\scanbook_studio.exe
      p.normalize(p.join(p.dirname(Platform.resolvedExecutable), '..', '..', '..', '..', '..')),
    ];
    for (final c in candidates) {
      if (Directory(p.join(c, 'tools')).existsSync() ||
          File(p.join(c, 'pubspec.yaml')).existsSync() ||
          File(p.join(c, 'scanbook_cli.py')).existsSync()) {
        _cachedRoot = c;
        return c;
      }
    }
    _cachedRoot = Directory.current.path;
    return _cachedRoot!;
  }

  static String get dataDir => p.join(rootDir, 'data');
  static String get outputDir => p.join(rootDir, 'output');
  static String get modelsDir => p.join(rootDir, 'models');
  static String get toolsDir => p.join(rootDir, 'tools');

  static String get pythonExe {
    final envPy = Platform.environment['SCANBOOK_PYTHON']?.trim() ?? '';
    if (envPy.isNotEmpty && File(envPy).existsSync()) return envPy;
    final candidates = [
      p.join(rootDir, '.venv', 'Scripts', 'python.exe'),
      p.join(rootDir, 'venv', 'Scripts', 'python.exe'),
      p.join(rootDir, '.venv', 'bin', 'python'),
    ];
    for (final c in candidates) {
      if (File(c).existsSync()) return c;
    }
    return 'python';
  }
}
