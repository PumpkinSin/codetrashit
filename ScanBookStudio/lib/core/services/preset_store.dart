import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import '../models/enhance_params.dart';
import 'app_paths.dart';

class AppSettings {
  bool defaultRemoveMarginFingers;
  bool defaultRemoveEdgeBlack;
  String customModelDir;
  bool aiAssistCrop;
  bool aiAssistSplit;
  bool aiAssistIllustrations;
  String translationApiUrl;
  String translationApiKey;
  String translationModel;
  int translationConcurrency;

  AppSettings({
    this.defaultRemoveMarginFingers = true,
    this.defaultRemoveEdgeBlack = true,
    this.customModelDir = '',
    this.aiAssistCrop = true,
    this.aiAssistSplit = true,
    this.aiAssistIllustrations = true,
    this.translationApiUrl = 'https://api.openai.com/v1',
    this.translationApiKey = '',
    this.translationModel = 'gpt-4o-mini',
    this.translationConcurrency = 4,
  });

  Map<String, dynamic> toJson() => {
        'default_remove_margin_fingers': defaultRemoveMarginFingers,
        'default_remove_edge_black': defaultRemoveEdgeBlack,
        'custom_model_dir': customModelDir,
        'ai_assist_crop': aiAssistCrop,
        'ai_assist_split': aiAssistSplit,
        'ai_assist_illustrations': aiAssistIllustrations,
        'translation_api_url': translationApiUrl,
        'translation_api_key': translationApiKey,
        'translation_model': translationModel,
        'translation_concurrency': translationConcurrency,
      };

  factory AppSettings.fromJson(Map<String, dynamic> j) => AppSettings(
        defaultRemoveMarginFingers: j['default_remove_margin_fingers'] ?? true,
        defaultRemoveEdgeBlack: j['default_remove_edge_black'] ?? true,
        customModelDir: (j['custom_model_dir'] ?? '') as String,
        aiAssistCrop: j['ai_assist_crop'] ?? true,
        aiAssistSplit: j['ai_assist_split'] ?? true,
        aiAssistIllustrations: j['ai_assist_illustrations'] ?? true,
        translationApiUrl: (j['translation_api_url'] ?? 'https://api.openai.com/v1') as String,
        translationApiKey: (j['translation_api_key'] ?? '') as String,
        translationModel: (j['translation_model'] ?? 'gpt-4o-mini') as String,
        translationConcurrency: (j['translation_concurrency'] ?? 4) as int,
      );
}

class PresetStore {
  static String get _storePath => p.join(AppPaths.dataDir, 'user_presets.json');
  static String get _settingsPath => p.join(AppPaths.dataDir, 'app_settings.json');

  static Future<AppSettings> loadSettings() async {
    final file = File(_settingsPath);
    if (!file.existsSync()) return AppSettings();
    try {
      final raw = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      return AppSettings.fromJson(raw);
    } catch (_) {
      return AppSettings();
    }
  }

  static Future<void> saveSettings(AppSettings settings) async {
    final file = File(_settingsPath);
    await file.parent.create(recursive: true);
    final encoded = const JsonEncoder.withIndent('  ').convert(settings.toJson());
    await file.writeAsString(encoded);
  }

  static Future<Map<String, EnhanceParams>> loadAll() async {
    final file = File(_storePath);
    if (!file.existsSync()) return {};
    try {
      final raw = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      return raw.map((k, v) => MapEntry(k, EnhanceParams.fromJson(v as Map<String, dynamic>)));
    } catch (_) {
      return {};
    }
  }

  static Future<void> savePreset(String name, EnhanceParams params) async {
    final all = await loadAll();
    all[name] = params.clone();
    final file = File(_storePath);
    await file.parent.create(recursive: true);
    final encoded = const JsonEncoder.withIndent('  ')
        .convert(all.map((k, v) => MapEntry(k, v.toJson())));
    await file.writeAsString(encoded);
  }

  static Future<void> deletePreset(String name) async {
    final all = await loadAll();
    all.remove(name);
    final file = File(_storePath);
    if (!file.parent.existsSync()) return;
    final encoded = const JsonEncoder.withIndent('  ')
        .convert(all.map((k, v) => MapEntry(k, v.toJson())));
    await file.writeAsString(encoded);
  }
}
