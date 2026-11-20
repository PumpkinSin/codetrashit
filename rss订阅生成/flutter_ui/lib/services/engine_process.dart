import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/app_state.dart';
import 'api_service.dart';
import 'browser_scanner.dart';

const MethodChannel _windowChannel = MethodChannel('com.rssmanager/window');

class EngineManager extends ChangeNotifier {
  final ApiService api = ApiService();
  Process? _process;
  bool _isRunning = false;
  ServiceStatus? _status;
  final List<String> _logs = [];
  Timer? _statusTimer;
  GuiPreferences _prefs = GuiPreferences();

  bool get isRunning => _isRunning;
  ServiceStatus? get status => _status;
  List<String> get logs => List.unmodifiable(_logs);
  GuiPreferences get prefs => _prefs;

  EngineManager() {
    _initMethodChannel();
    _loadPrefs();
    _browsers = LocalBrowserScanner.scan();
    _startStatusPolling();
    if (_prefs.autoStart) {
      Future.delayed(const Duration(milliseconds: 500), () {
        if (!_isRunning) {
          startEngine();
        }
      });
    }
  }

  void _initMethodChannel() {
    _windowChannel.setMethodCallHandler((call) async {
      if (call.method == 'trayExit') {
        await exitApp();
      }
    });
  }

  void _syncNativeWindowConfig() {
    try {
      _windowChannel.invokeMethod('updateConfig', {
        'no_tray': _prefs.noTray,
        'start_minimized': _prefs.startMinimized,
      });
    } catch (_) {}
  }

  File _getPrefsFile() {
    final local = File('gui_config.json');
    if (local.existsSync()) return local;
    try {
      final appDir = File(Platform.resolvedExecutable).parent.path;
      final inApp = File('$appDir/gui_config.json');
      if (inApp.existsSync()) return inApp;
    } catch (_) {}
    return local;
  }

  void _loadPrefs() {
    try {
      final file = _getPrefsFile();
      if (file.existsSync()) {
        final content = file.readAsStringSync();
        _prefs = GuiPreferences.fromJson(json.decode(content));
        _syncNativeWindowConfig();
      }
    } catch (_) {}
    notifyListeners();
  }

  void savePrefs() {
    try {
      final file = _getPrefsFile();
      file.writeAsStringSync(json.encode(_prefs.toJson()));
      _syncNativeWindowConfig();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> exitApp() async {
    if (!_prefs.keepServer) {
      await stopEngine();
    }
    try {
      await _windowChannel.invokeMethod('exitApp');
    } catch (_) {
      exit(0);
    }
  }

  List<BrowserInfo> _browsers = [];
  List<BrowserInfo> get browsers => _browsers;

  Future<void> loadBrowsers() async {
    final local = LocalBrowserScanner.scan();
    if (local.isNotEmpty) {
      _browsers = local;
      notifyListeners();
    }
    final list = await api.getBrowsers();
    if (list.isNotEmpty) {
      _browsers = list;
      notifyListeners();
    }
  }

  void log(String message) {
    final cleanMsg = message.replaceAll(RegExp(r'\x1B\[[0-?]*[ -/]*[@-~]'), '');
    final timeStr = DateFormat('HH:mm:ss').format(DateTime.now());
    _logs.add('[$timeStr] $cleanMsg');
    if (_logs.length > 1000) {
      _logs.removeAt(0);
    }
    notifyListeners();
  }

  void clearLogs() {
    _logs.clear();
    notifyListeners();
  }

  void _startStatusPolling() {
    _statusTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      final s = await api.getStatus();
      final wasRunning = _isRunning;
      _status = s;
      _isRunning = s != null && s.online;
      if (_isRunning && _browsers.isEmpty) {
        loadBrowsers();
      }
      if (wasRunning != _isRunning) {
        if (_isRunning) {
          loadBrowsers();
        }
        notifyListeners();
      } else if (_isRunning) {
        notifyListeners();
      }
    });
  }

  Future<void> startEngine() async {
    if (_isRunning) {
      log('⚠ 服务已在运行中');
      return;
    }

    log('正在启动 Rust 引擎服务...');

    // Try finding rss_engine.exe in app directory, current dir, dist, or rust_engine
    String? appDir;
    try {
      appDir = File(Platform.resolvedExecutable).parent.path;
    } catch (_) {}

    final candidates = [
      if (appDir != null) '$appDir/rss_engine.exe',
      'rss_engine.exe',
      'dist/rss_engine.exe',
      '../dist/rss_engine.exe',
      'rust_engine/target/release/rss_engine.exe',
      '../rust_engine/target/release/rss_engine.exe',
    ];

    String? exePath;
    for (final c in candidates) {
      if (File(c).existsSync()) {
        exePath = c;
        break;
      }
    }

    if (exePath == null) {
      // If no prebuilt binary, fallback to running cargo run in rust_engine or notify user
      if (Directory('rust_engine').existsSync() || Directory('../rust_engine').existsSync()) {
        final rustDir = Directory('rust_engine').existsSync() ? 'rust_engine' : '../rust_engine';
        try {
          _process = await Process.start(
            'cargo',
            ['run', '--release'],
            workingDirectory: rustDir,
            mode: ProcessStartMode.normal,
          );
        } catch (e) {
          log('❌ 启动失败: 未找到可执行文件且无法运行 cargo ($e)');
          return;
        }
      } else {
        log('❌ 未找到 rss_engine.exe，请先编译 Rust 引擎');
        return;
      }
    } else {
      try {
        final targetDir = File(exePath).parent.path;
        _process = await Process.start(
          exePath,
          [],
          workingDirectory: targetDir.isNotEmpty ? targetDir : null,
          mode: ProcessStartMode.normal,
        );
      } catch (e) {
        log('❌ 启动失败: $e');
        return;
      }
    }

    _process?.stdout.transform(utf8.decoder).listen((data) {
      for (final line in data.split('\n')) {
        final trimmed = line.trim();
        if (trimmed.isNotEmpty) {
          log(trimmed);
        }
      }
    });

    _process?.stderr.transform(utf8.decoder).listen((data) {
      for (final line in data.split('\n')) {
        final trimmed = line.trim();
        if (trimmed.isNotEmpty) {
          log('ERR: $trimmed');
        }
      }
    });

    _process?.exitCode.then((code) {
      log('— 服务进程已退出 (代码: $code) —');
      _isRunning = false;
      _status = null;
      notifyListeners();
    });

    _isRunning = true;
    log('✅ 引擎进程已发起启动');
    notifyListeners();
  }

  Future<void> stopEngine() async {
    log('正在停止服务...');
    if (_process != null) {
      try {
        _process!.kill();
      } catch (_) {}
      _process = null;
    }
    if (Platform.isWindows) {
      try {
        await Process.run('taskkill', ['/F', '/T', '/IM', 'rss_engine.exe']);
      } catch (_) {}
    }
    _isRunning = false;
    _status = null;
    log('✅ 服务已停止');
    notifyListeners();
  }

  @override
  void dispose() {
    _statusTimer?.cancel();
    if (!_prefs.keepServer) {
      if (_process != null) {
        try {
          _process?.kill();
        } catch (_) {}
      }
      if (Platform.isWindows) {
        try {
          Process.runSync('taskkill', ['/F', '/T', '/IM', 'rss_engine.exe']);
        } catch (_) {}
      }
    }
    super.dispose();
  }
}
