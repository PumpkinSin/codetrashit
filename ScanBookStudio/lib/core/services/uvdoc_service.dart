import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import '../models/enhance_params.dart';
import '../models/page_item.dart';
import 'app_paths.dart';
import 'layout_service.dart';

class UvdocService {
  static String get _pyExe => AppPaths.pythonExe;

  static String get _scriptPath => p.join(AppPaths.toolsDir, 'uvdoc_infer.py');

  static String? resolveModel(String customModelDir) =>
      LayoutService.resolveModelPath(customModelDir, 'UVDoc_grid.onnx');

  static bool isAvailable([String customModelDir = '']) =>
      resolveModel(customModelDir) != null && File(_scriptPath).existsSync();

  /// Runs UVDoc ONNX (DirectML GPU or CPU fallback) and returns (grid_floats, provider_used).
  static Future<(List<double> grid, String provider)> inferGrid(
    String inputPath,
    EnhanceParams params, {
    String customModelDir = '',
  }) async {
    final modelPath = resolveModel(customModelDir);
    if (modelPath == null) {
      throw Exception('未找到 UVDoc_grid.onnx 模型文件，请检查「设置 -> AI 模型目录」');
    }
    final outGridFile = p.join(
      AppPaths.dataDir,
      'uvdoc_cache',
      '${p.basenameWithoutExtension(inputPath)}_${params.splitSide}.json',
    );
    final cropStr = params.cropBox.map((e) => e.toStringAsFixed(4)).join(',');

    final res = await Process.run(
      _pyExe,
      [
        _scriptPath,
        '--input',
        inputPath,
        '--model',
        modelPath,
        '--out_grid',
        outGridFile,
        '--crop',
        cropStr,
        '--split_mode',
        params.splitMode,
        '--split_ratio',
        params.splitRatio.toStringAsFixed(4),
        '--split_side',
        params.splitSide,
        '--rotation',
        params.rotation.toString(),
      ],
      environment: {'PYTHONIOENCODING': 'utf-8'},
    );

    if (res.exitCode != 0) {
      throw Exception('UVDoc 推理失败: ${res.stderr}');
    }

    final map = jsonDecode(await File(outGridFile).readAsString()) as Map<String, dynamic>;
    final grid = (map['grid'] as List).map((e) => (e as num).toDouble()).toList();
    final provider = (map['provider'] as String?) ?? 'CPUExecutionProvider';
    return (grid, provider);
  }

  /// Batch-computes UVDoc grids for all unlocked pages (loads ONNX model once).
  static Future<(Map<int, List<double>> grids, String provider)> inferGridBatch(
    List<PageItem> pages, {
    String customModelDir = '',
  }) async {
    final modelPath = resolveModel(customModelDir);
    if (modelPath == null) {
      throw Exception('未找到 UVDoc_grid.onnx 模型文件，请检查「设置 -> AI 模型目录」');
    }
    final cacheDir = Directory(p.join(AppPaths.dataDir, 'uvdoc_cache'));
    await cacheDir.create(recursive: true);
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final batchIn = p.join(cacheDir.path, 'uv_in_$stamp.json');
    final batchOut = p.join(cacheDir.path, 'uv_out_$stamp.json');

    try {
      final tasks = <Map<String, dynamic>>[];
      for (int i = 0; i < pages.length; i++) {
        final item = pages[i];
        if (item.isLocked) continue;
        tasks.add({
          'key': i.toString(),
          'input': item.sourcePath,
          'crop': item.params.cropBox.map((e) => e.toStringAsFixed(4)).join(','),
          'split_mode': item.params.splitMode,
          'split_ratio': item.params.splitRatio,
          'split_side': item.params.splitSide,
          'rotation': item.params.rotation,
        });
      }
      if (tasks.isEmpty) return (<int, List<double>>{}, 'CPUExecutionProvider');
      await File(batchIn).writeAsString(jsonEncode(tasks));

      final res = await Process.run(
        _pyExe,
        [
          _scriptPath,
          '--model',
          modelPath,
          '--batch_json',
          batchIn,
          '--out_json',
          batchOut,
        ],
        environment: {'PYTHONIOENCODING': 'utf-8'},
      );
      if (res.exitCode != 0) {
        throw Exception('UVDoc 批量推理失败: ${res.stderr}');
      }
      final map = jsonDecode(await File(batchOut).readAsString()) as Map<String, dynamic>;
      final provider = (map['provider'] as String?) ?? 'CPUExecutionProvider';
      final raw = map['results'] as Map<String, dynamic>;
      final out = <int, List<double>>{};
      for (final e in raw.entries) {
        final idx = int.tryParse(e.key);
        if (idx == null) continue;
        out[idx] = (e.value as List).map((v) => (v as num).toDouble()).toList();
      }
      return (out, provider);
    } finally {
      try { if (File(batchIn).existsSync()) await File(batchIn).delete(); } catch (_) {}
      try { if (File(batchOut).existsSync()) await File(batchOut).delete(); } catch (_) {}
    }
  }
}
