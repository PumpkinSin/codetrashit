import 'dart:async';
import 'dart:convert';
import 'dart:ffi' as ffi;
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:ffi/ffi.dart';
import 'package:path/path.dart' as p;

import '../models/enhance_params.dart';
import '../models/page_item.dart';
import 'app_paths.dart';

typedef _CepProcessPreviewNative = ffi.Pointer<ffi.Uint8> Function(
  ffi.Pointer<Utf8> inputPath,
  ffi.Pointer<Utf8> paramsJson,
  ffi.Uint32 maxDim,
  ffi.Pointer<ffi.Size> outLen,
  ffi.Pointer<ffi.Uint32> outW,
  ffi.Pointer<ffi.Uint32> outH,
  ffi.Pointer<ffi.Uint32> outHist,
);
typedef _CepProcessPreviewDart = ffi.Pointer<ffi.Uint8> Function(
  ffi.Pointer<Utf8> inputPath,
  ffi.Pointer<Utf8> paramsJson,
  int maxDim,
  ffi.Pointer<ffi.Size> outLen,
  ffi.Pointer<ffi.Uint32> outW,
  ffi.Pointer<ffi.Uint32> outH,
  ffi.Pointer<ffi.Uint32> outHist,
);

typedef _CepFreeBytesNative = ffi.Void Function(ffi.Pointer<ffi.Uint8> ptr, ffi.Size len);
typedef _CepFreeBytesDart = void Function(ffi.Pointer<ffi.Uint8> ptr, int len);

typedef _CepPrepareLayoutNative = ffi.Int32 Function(
    ffi.Pointer<Utf8> inputPath, ffi.Pointer<Utf8> paramsJson, ffi.Pointer<Utf8> outPngPath, ffi.Int32 maxDim);
typedef _CepPrepareLayoutDart = int Function(
    ffi.Pointer<Utf8> inputPath, ffi.Pointer<Utf8> paramsJson, ffi.Pointer<Utf8> outPngPath, int maxDim);

typedef _CepBatchPdfNative = ffi.Int32 Function(ffi.Pointer<Utf8> itemsJson, ffi.Pointer<Utf8> outPdfPath);
typedef _CepBatchPdfDart = int Function(ffi.Pointer<Utf8> itemsJson, ffi.Pointer<Utf8> outPdfPath);

typedef _CepExportProgressNative = ffi.Void Function(ffi.Pointer<ffi.Uint32> outDone, ffi.Pointer<ffi.Uint32> outTotal);
typedef _CepExportProgressDart = void Function(ffi.Pointer<ffi.Uint32> outDone, ffi.Pointer<ffi.Uint32> outTotal);

typedef _CepExportPauseNative = ffi.Void Function(ffi.Int32 paused);
typedef _CepExportPauseDart = void Function(int paused);

typedef _CepExportCancelNative = ffi.Void Function();
typedef _CepExportCancelDart = void Function();

typedef _CepLastErrorNative = ffi.Pointer<Utf8> Function();
typedef _CepLastErrorDart = ffi.Pointer<Utf8> Function();

typedef _CepAutoAnalyzeNative = ffi.Pointer<ffi.Uint8> Function(
  ffi.Pointer<Utf8> inputPath,
  ffi.Pointer<ffi.Size> outLen,
);
typedef _CepAutoAnalyzeDart = ffi.Pointer<ffi.Uint8> Function(
  ffi.Pointer<Utf8> inputPath,
  ffi.Pointer<ffi.Size> outLen,
);

class PreviewResult {
  final ui.Image image;
  final List<int> histogram;
  final int width;
  final int height;

  PreviewResult({
    required this.image,
    required this.histogram,
    required this.width,
    required this.height,
  });
}

class _RawPreviewBytes {
  final Uint8List rgba;
  final List<int> histogram;
  final int width;
  final int height;

  _RawPreviewBytes(this.rgba, this.histogram, this.width, this.height);
}

class RustEngine {
  static String resolveDllPath() {
    final exeDir = File(Platform.resolvedExecutable).parent.path;
    final candidates = [
      p.join(exeDir, 'rust_core.dll'),
      p.join(Directory.current.path, 'rust_core', 'target', 'release', 'rust_core.dll'),
      p.join(AppPaths.rootDir, 'rust_core', 'target', 'release', 'rust_core.dll'),
    ];
    for (final c in candidates) {
      if (File(c).existsSync()) return c;
    }
    throw StateError('Cannot find rust_core.dll. Checked:\n${candidates.join('\n')}');
  }

  static Future<PreviewResult> renderPreview(
    String inputPath,
    EnhanceParams params, {
    int maxDim = 1200,
  }) async {
    final dllPath = resolveDllPath();
    final jsonStr = params.toJsonString();

    final raw = await Isolate.run(() => _renderPreviewSync(dllPath, inputPath, jsonStr, maxDim));

    final completer = Completer<ui.Image>();
    ui.decodeImageFromPixels(
      raw.rgba,
      raw.width,
      raw.height,
      ui.PixelFormat.rgba8888,
      (img) => completer.complete(img),
    );
    final uiImg = await completer.future;
    return PreviewResult(
      image: uiImg,
      histogram: raw.histogram,
      width: raw.width,
      height: raw.height,
    );
  }

  static _RawPreviewBytes _renderPreviewSync(
    String dllPath,
    String inputPath,
    String paramsJson,
    int maxDim,
  ) {
    final lib = ffi.DynamicLibrary.open(dllPath);
    final fnPreview = lib.lookupFunction<_CepProcessPreviewNative, _CepProcessPreviewDart>('cep_process_preview');
    final fnFree = lib.lookupFunction<_CepFreeBytesNative, _CepFreeBytesDart>('cep_free_bytes');
    final fnErr = lib.lookupFunction<_CepLastErrorNative, _CepLastErrorDart>('cep_last_error');

    final pIn = inputPath.toNativeUtf8();
    final pJson = paramsJson.toNativeUtf8();
    final pLen = calloc<ffi.Size>();
    final pW = calloc<ffi.Uint32>();
    final pH = calloc<ffi.Uint32>();
    final pHist = calloc<ffi.Uint32>(256);

    try {
      final ptr = fnPreview(pIn, pJson, maxDim, pLen, pW, pH, pHist);
      if (ptr == ffi.nullptr) {
        final msg = fnErr().toDartString();
        throw Exception('Rust preview error: $msg');
      }
      final len = pLen.value;
      final w = pW.value;
      final h = pH.value;
      final rgba = Uint8List.fromList(ptr.asTypedList(len));
      final hist = List<int>.generate(256, (i) => pHist[i]);
      fnFree(ptr, len);
      return _RawPreviewBytes(rgba, hist, w, h);
    } finally {
      calloc.free(pIn);
      calloc.free(pJson);
      calloc.free(pLen);
      calloc.free(pW);
      calloc.free(pH);
      calloc.free(pHist);
    }
  }

  static Future<(List<double> cropBox, String splitMode, double splitRatio, String summary)> autoDetectCropSplit(
      String inputPath) async {
    final dllPath = resolveDllPath();
    final jsonStr = await Isolate.run(() {
      final lib = ffi.DynamicLibrary.open(dllPath);
      final fn = lib.lookupFunction<_CepAutoAnalyzeNative, _CepAutoAnalyzeDart>('cep_auto_detect_crop_split');
      final fnFree = lib.lookupFunction<_CepFreeBytesNative, _CepFreeBytesDart>('cep_free_bytes');
      final fnErr = lib.lookupFunction<_CepLastErrorNative, _CepLastErrorDart>('cep_last_error');

      final pIn = inputPath.toNativeUtf8();
      final pLen = calloc<ffi.Size>();
      try {
        final ptr = fn(pIn, pLen);
        if (ptr == ffi.nullptr) {
          throw Exception('Auto crop/split failed: ${fnErr().toDartString()}');
        }
        final len = pLen.value;
        final str = utf8.decode(ptr.asTypedList(len));
        fnFree(ptr, len);
        return str;
      } finally {
        calloc.free(pIn);
        calloc.free(pLen);
      }
    });

    final decoded = jsonDecode(jsonStr) as Map<String, dynamic>;
    final cropBox = (decoded['crop_box'] as List).map((e) => (e as num).toDouble()).toList();
    final splitMode = decoded['split_mode'] as String;
    final splitRatio = (decoded['split_ratio'] as num).toDouble();
    final summary = (decoded['summary'] as String?) ?? '已自动框选';
    return (cropBox, splitMode, splitRatio, summary);
  }

  static Future<(EnhanceParams, String)> autoAnalyzePage(String inputPath) async {
    final dllPath = resolveDllPath();
    final jsonStr = await Isolate.run(() {
      final lib = ffi.DynamicLibrary.open(dllPath);
      final fnAnalyze = lib.lookupFunction<_CepAutoAnalyzeNative, _CepAutoAnalyzeDart>('cep_auto_analyze_page');
      final fnFree = lib.lookupFunction<_CepFreeBytesNative, _CepFreeBytesDart>('cep_free_bytes');
      final fnErr = lib.lookupFunction<_CepLastErrorNative, _CepLastErrorDart>('cep_last_error');

      final pIn = inputPath.toNativeUtf8();
      final pLen = calloc<ffi.Size>();
      try {
        final ptr = fnAnalyze(pIn, pLen);
        if (ptr == ffi.nullptr) {
          throw Exception('Auto analyze failed: ${fnErr().toDartString()}');
        }
        final len = pLen.value;
        final str = utf8.decode(ptr.asTypedList(len));
        fnFree(ptr, len);
        return str;
      } finally {
        calloc.free(pIn);
        calloc.free(pLen);
      }
    });

    final decoded = jsonDecode(jsonStr) as Map<String, dynamic>;
    final params = EnhanceParams.fromJson(decoded['params'] as Map<String, dynamic>);
    final summary = (decoded['summary'] as String?) ?? '已自动优化参数';
    return (params, summary);
  }

  static ffi.DynamicLibrary? _cachedLib;
  static ffi.DynamicLibrary _lib() => _cachedLib ??= ffi.DynamicLibrary.open(resolveDllPath());

  static (int done, int total) getExportProgress() {
    final lib = _lib();
    final fn = lib.lookupFunction<_CepExportProgressNative, _CepExportProgressDart>('cep_export_get_progress');
    final pDone = calloc<ffi.Uint32>();
    final pTot = calloc<ffi.Uint32>();
    try {
      fn(pDone, pTot);
      return (pDone.value, pTot.value);
    } finally {
      calloc.free(pDone);
      calloc.free(pTot);
    }
  }

  static void setExportPaused(bool paused) {
    final fn = _lib().lookupFunction<_CepExportPauseNative, _CepExportPauseDart>('cep_export_set_pause');
    fn(paused ? 1 : 0);
  }

  static void cancelExport() {
    final fn = _lib().lookupFunction<_CepExportCancelNative, _CepExportCancelDart>('cep_export_cancel');
    fn();
  }

  static Future<void> prepareLayoutImage(
    String inputPath,
    EnhanceParams params,
    String outputPngPath, {
    int maxDim = 960,
  }) async {
    final dllPath = resolveDllPath();
    final paramsJson = params.toJsonString();
    return Isolate.run(() {
      final lib = ffi.DynamicLibrary.open(dllPath);
      final fn = lib.lookupFunction<_CepPrepareLayoutNative, _CepPrepareLayoutDart>('cep_prepare_layout_image');
      final fnErr = lib.lookupFunction<_CepLastErrorNative, _CepLastErrorDart>('cep_last_error');

      final pIn = inputPath.toNativeUtf8();
      final pParams = paramsJson.toNativeUtf8();
      final pOut = outputPngPath.toNativeUtf8();
      try {
        final rc = fn(pIn, pParams, pOut, maxDim);
        if (rc != 0) {
          throw Exception('Prepare layout image failed ($rc): ${fnErr().toDartString()}');
        }
      } finally {
        calloc.free(pIn);
        calloc.free(pParams);
        calloc.free(pOut);
      }
    });
  }

  /// Returns true if completed, false if cancelled by user.
  static Future<bool> batchBuildPdf(List<PageItem> pages, String outputPdfPath) async {
    final dllPath = resolveDllPath();
    final payload = jsonEncode(
      pages
          .map((e) => {
                'input_path': e.sourcePath,
                'params': e.params.toJson(),
              })
          .toList(),
    );

    return Isolate.run(() {
      final lib = ffi.DynamicLibrary.open(dllPath);
      final fnBatch = lib.lookupFunction<_CepBatchPdfNative, _CepBatchPdfDart>('cep_batch_build_pdf');
      final fnErr = lib.lookupFunction<_CepLastErrorNative, _CepLastErrorDart>('cep_last_error');

      final pPayload = payload.toNativeUtf8();
      final pOut = outputPdfPath.toNativeUtf8();
      try {
        final rc = fnBatch(pPayload, pOut);
        if (rc == -10) return false;
        if (rc != 0) {
          throw Exception('Batch PDF failed ($rc): ${fnErr().toDartString()}');
        }
        return true;
      } finally {
        calloc.free(pPayload);
        calloc.free(pOut);
      }
    });
  }
}
