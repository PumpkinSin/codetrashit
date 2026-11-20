import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import '../models/enhance_params.dart';
import '../models/page_item.dart';
import 'app_paths.dart';
import 'rust_engine.dart';

class LayoutService {
  static String get _pyExe => AppPaths.pythonExe;

  static String get _scriptPath => p.join(AppPaths.toolsDir, 'layout_infer.py');

  static String? resolveModelPath(String customModelDir, String fileName) {
    final dirs = <String>[];
    final c = customModelDir.trim();
    if (c.isNotEmpty) {
      dirs.addAll([
        c,
        p.join(c, 'models'),
        p.join(c, 'model'),
        p.join(c, 'onnx'),
        p.join(c, 'tools'),
        p.dirname(c),
      ]);
    }
    dirs.addAll([
      p.join(p.dirname(Platform.resolvedExecutable), 'models'),
      AppPaths.modelsDir,
      p.join(Directory.current.path, 'models'),
    ]);
    for (final d in dirs) {
      final candidate = p.join(d, fileName);
      if (File(candidate).existsSync()) return candidate;
    }
    return null;
  }

  static bool isAvailable(String customModelDir) =>
      resolveModelPath(customModelDir, 'pp_doc_layoutv3.onnx') != null &&
      File(_scriptPath).existsSync();

  /// Detects illustration boxes [x1, y1, x2, y2] in normalized 0..1 coordinates
  /// on the geometrically-aligned pre-binarization image for a single page.
  static Future<List<List<double>>> detectSinglePage(
    String inputPath,
    EnhanceParams params,
    String customModelDir,
  ) async {
    final modelPath = resolveModelPath(customModelDir, 'pp_doc_layoutv3.onnx');
    if (modelPath == null) {
      throw Exception('未找到 pp_doc_layoutv3.onnx，请在「设置 -> AI 模型目录」中选择模型文件夹');
    }
    final cacheDir = Directory(p.join(AppPaths.dataDir, 'layout_cache'));
    await cacheDir.create(recursive: true);
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final tmpPng = p.join(cacheDir.path, 'layout_single_$stamp.png');
    final tmpJson = p.join(cacheDir.path, 'layout_single_$stamp.json');

    try {
      await RustEngine.prepareLayoutImage(inputPath, params, tmpPng, maxDim: 960);
      final res = await Process.run(
        _pyExe,
        [
          _scriptPath,
          '--model',
          modelPath,
          '--input',
          tmpPng,
          '--out_json',
          tmpJson,
          '--filter_small',
          params.filterSmallOrnaments ? '1' : '0',
        ],
        environment: {'PYTHONIOENCODING': 'utf-8'},
      );
      if (res.exitCode != 0) {
        throw Exception('PP-DocLayoutV3 推理失败: ${res.stderr}');
      }
      final map = jsonDecode(await File(tmpJson).readAsString()) as Map<String, dynamic>;
      return (map['boxes'] as List)
          .map((b) => (b as List).map((v) => (v as num).toDouble()).toList())
          .toList();
    } finally {
      try { if (File(tmpPng).existsSync()) await File(tmpPng).delete(); } catch (_) {}
      try { if (File(tmpJson).existsSync()) await File(tmpJson).delete(); } catch (_) {}
    }
  }

  /// Batch-detects illustration boxes for all pages that have `extractIllustrations == true`,
  /// loading `pp_doc_layoutv3.onnx` only once for maximum speed.
  static Future<void> detectBatchForExport(
    List<PageItem> exportPages,
    String customModelDir, {
    void Function(int done, int total)? onProgress,
  }) async {
    final targets = <int>[];
    for (int i = 0; i < exportPages.length; i++) {
      if (exportPages[i].params.extractIllustrations) targets.add(i);
    }
    if (targets.isEmpty) return;

    final modelPath = resolveModelPath(customModelDir, 'pp_doc_layoutv3.onnx');
    if (modelPath == null) {
      throw Exception('未找到 pp_doc_layoutv3.onnx，请在「设置 -> AI 模型目录」中选择模型文件夹');
    }

    final cacheDir = Directory(p.join(AppPaths.dataDir, 'layout_cache'));
    await cacheDir.create(recursive: true);
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final tmpFiles = <String>[];
    final tasks = <Map<String, dynamic>>[];

    try {
      for (int k = 0; k < targets.length; k++) {
        final idx = targets[k];
        final item = exportPages[idx];
        final pngPath = p.join(cacheDir.path, 'batch_${stamp}_$k.png');
        tmpFiles.add(pngPath);
        await RustEngine.prepareLayoutImage(item.sourcePath, item.params, pngPath, maxDim: 960);
        tasks.add({
          'key': idx.toString(),
          'image_path': pngPath,
          'filter_small': item.params.filterSmallOrnaments ? 1 : 0,
        });
        onProgress?.call(k + 1, targets.length);
      }

      final batchIn = p.join(cacheDir.path, 'batch_in_$stamp.json');
      final batchOut = p.join(cacheDir.path, 'batch_out_$stamp.json');
      tmpFiles.add(batchIn);
      tmpFiles.add(batchOut);
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
        throw Exception('PP-DocLayoutV3 批量推理失败: ${res.stderr}');
      }
      final map = jsonDecode(await File(batchOut).readAsString()) as Map<String, dynamic>;
      final results = map['results'] as Map<String, dynamic>;
      for (final idx in targets) {
        final rawBoxes = results[idx.toString()] as List? ?? [];
        exportPages[idx].params.illustrationBoxes = rawBoxes
            .map((b) => (b as List).map((v) => (v as num).toDouble()).toList())
            .toList();
      }
    } finally {
      for (final f in tmpFiles) {
        try { if (File(f).existsSync()) await File(f).delete(); } catch (_) {}
      }
    }
  }

  /// Uses PP-DocLayoutV3 to detect content crop box and double-page split gutter for one page.
  static Future<(List<double>? cropBox, String? splitMode, double? splitRatio)> detectCropSplitSingle(
    String inputPath,
    int rotation,
    String customModelDir,
  ) async {
    final modelPath = resolveModelPath(customModelDir, 'pp_doc_layoutv3.onnx');
    if (modelPath == null) return (null, null, null);
    final cacheDir = Directory(p.join(AppPaths.dataDir, 'layout_cache'));
    await cacheDir.create(recursive: true);
    final outJson = p.join(cacheDir.path, 'cs_${DateTime.now().microsecondsSinceEpoch}.json');
    try {
      final res = await Process.run(
        _pyExe,
        [
          _scriptPath,
          '--model',
          modelPath,
          '--task',
          'crop_split',
          '--input',
          inputPath,
          '--rotation',
          rotation.toString(),
          '--out_json',
          outJson,
        ],
        environment: {'PYTHONIOENCODING': 'utf-8'},
      );
      if (res.exitCode != 0) return (null, null, null);
      final map = jsonDecode(await File(outJson).readAsString()) as Map<String, dynamic>;
      final cb = (map['crop_box'] as List?)?.map((e) => (e as num).toDouble()).toList();
      final sm = map['split_mode'] as String?;
      final sr = (map['split_ratio'] as num?)?.toDouble();
      return (cb, sm, sr);
    } finally {
      try { if (File(outJson).existsSync()) await File(outJson).delete(); } catch (_) {}
    }
  }

  /// Batch PP-DocLayoutV3 crop & split detection for multiple pages (loads model once).
  static Future<Map<int, (List<double>? cropBox, String? splitMode, double? splitRatio)>> detectCropSplitBatch(
    List<PageItem> pages,
    String customModelDir,
  ) async {
    final modelPath = resolveModelPath(customModelDir, 'pp_doc_layoutv3.onnx');
    if (modelPath == null || pages.isEmpty) return {};
    final cacheDir = Directory(p.join(AppPaths.dataDir, 'layout_cache'));
    await cacheDir.create(recursive: true);
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final batchIn = p.join(cacheDir.path, 'cs_in_$stamp.json');
    final batchOut = p.join(cacheDir.path, 'cs_out_$stamp.json');
    try {
      final tasks = <Map<String, dynamic>>[];
      for (int i = 0; i < pages.length; i++) {
        if (pages[i].isLocked) continue;
        tasks.add({
          'key': i.toString(),
          'image_path': pages[i].sourcePath,
          'rotation': pages[i].params.rotation,
        });
      }
      if (tasks.isEmpty) return {};
      await File(batchIn).writeAsString(jsonEncode(tasks));
      final res = await Process.run(
        _pyExe,
        [
          _scriptPath,
          '--model',
          modelPath,
          '--task',
          'crop_split',
          '--batch_json',
          batchIn,
          '--out_json',
          batchOut,
        ],
        environment: {'PYTHONIOENCODING': 'utf-8'},
      );
      if (res.exitCode != 0) return {};
      final map = jsonDecode(await File(batchOut).readAsString()) as Map<String, dynamic>;
      final rawResults = map['results'] as Map<String, dynamic>;
      final out = <int, (List<double>?, String?, double?)>{};
      for (final e in rawResults.entries) {
        final idx = int.tryParse(e.key);
        if (idx == null) continue;
        final v = e.value as Map<String, dynamic>;
        final cb = (v['crop_box'] as List?)?.map((x) => (x as num).toDouble()).toList();
        final sm = v['split_mode'] as String?;
        final sr = (v['split_ratio'] as num?)?.toDouble();
        out[idx] = (cb, sm, sr);
      }
      return out;
    } finally {
      try { if (File(batchIn).existsSync()) await File(batchIn).delete(); } catch (_) {}
      try { if (File(batchOut).existsSync()) await File(batchOut).delete(); } catch (_) {}
    }
  }
}
