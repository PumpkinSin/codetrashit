import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'app_paths.dart';

class EpubPipelineService {
  static String get _pyExe => AppPaths.pythonExe;

  static String get _cliPath => p.join(AppPaths.rootDir, 'scanbook_cli.py');

  static Future<void> runPdfToEpub({
    required String pdfPath,
    required String bookName,
    required String lang,
    required String translateMode, // 'none' | 'zh' | 'bilingual'
    required String customModelDir,
    void Function(String line)? onLog,
  }) async {
    final env = <String, String>{
      'PYTHONIOENCODING': 'utf-8',
      'PYTHONUNBUFFERED': '1',
      if (customModelDir.trim().isNotEmpty) 'SCANBOOK_MODEL_DIR': customModelDir.trim(),
    };

    String lastErr = '';
    void handleLine(String l, {bool isErr = false}) {
      final t = l.trim();
      if (t.isEmpty ||
          t.contains('RapidOCR is missing') ||
          t.contains('Document parser messages')) {
        return;
      }
      if (isErr || t.contains('Error') || t.contains('失败') || t.contains('Exception')) {
        lastErr = t;
      }
      onLog?.call(t);
    }

    Future<void> runStep(List<String> args) async {
      lastErr = '';
      final proc = await Process.start(_pyExe, [_cliPath, ...args], environment: env);
      proc.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((l) => handleLine(l));
      proc.stderr.transform(utf8.decoder).transform(const LineSplitter()).listen((l) => handleLine(l, isErr: true));
      final code = await proc.exitCode;
      if (code != 0) {
        final detail = lastErr.isNotEmpty ? ' ($lastErr)' : '';
        throw Exception('CLI 执行失败 (exit=$code)$detail');
      }
    }

    await runStep(['pdf2epub', pdfPath, '--name', bookName, '--lang', lang]);
    if (translateMode == 'zh' || translateMode == 'bilingual') {
      final workDir = p.join(p.dirname(_cliPath), 'work', bookName);
      await runStep(['translate-all', '--work', workDir, '--mode', translateMode]);
    }
  }
}
