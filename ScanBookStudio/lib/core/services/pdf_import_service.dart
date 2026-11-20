import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'app_paths.dart';

class PdfImportService {
  static String get _pyExe => AppPaths.pythonExe;

  /// Instant (<0.1s): returns total page count of a PDF without rendering any pixels.
  static Future<int> getPdfPageCount(String pdfPath) async {
    final res = await Process.run(
      _pyExe,
      ['-c', 'import sys, fitz; doc = fitz.open(sys.argv[1]); print(len(doc))', pdfPath],
      environment: {'PYTHONIOENCODING': 'utf-8'},
    );
    if (res.exitCode != 0) {
      throw Exception('读取 PDF 页数失败: ${res.stderr}');
    }
    return int.parse(res.stdout.toString().trim());
  }

  static String highResPagePath(String outDir, int pageIndex) =>
      p.join(outDir, 'page_${(pageIndex + 1).toString().padLeft(4, '0')}.jpg');

  static String thumbPagePath(String outDir, int pageIndex) =>
      p.join(outDir, 'thumb_${(pageIndex + 1).toString().padLeft(4, '0')}.jpg');

  /// Renders lightweight ~48 DPI thumbnails in parallel for instant sidebar display.
  static Future<void> renderThumbnails(
    String pdfPath, {
    required String outDir,
    void Function(int done, int total)? onProgress,
  }) async {
    await Directory(outDir).create(recursive: true);
    final script = r'''
import sys, os, fitz
from concurrent.futures import ProcessPoolExecutor, as_completed

def render_thumb_chunk(args):
    pdf_path, out_dir, start, end = args
    doc = fitz.open(pdf_path)
    mat = fitz.Matrix(48.0 / 72.0, 48.0 / 72.0)
    for i in range(start, end):
        out_file = os.path.join(out_dir, f"thumb_{i+1:04d}.jpg")
        if not os.path.exists(out_file):
            pix = doc[i].get_pixmap(matrix=mat, alpha=False)
            pix.save(out_file, jpg_quality=75)
    return end - start

if __name__ == "__main__":
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()
    workers = min(os.cpu_count() or 4, 8)
    chunk = max(1, (total + workers - 1) // workers)
    tasks = [(pdf_path, out_dir, s, min(total, s + chunk)) for s in range(0, total, chunk)]
    done = 0
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for fut in as_completed([ex.submit(render_thumb_chunk, t) for t in tasks]):
            done += fut.result()
            print(f"PROGRESS:{done}:{total}", flush=True)
''';
    final scriptFile = File(p.join(outDir, '_render_thumbs.py'));
    await scriptFile.writeAsString(script);
    final proc = await Process.start(
      _pyExe,
      [scriptFile.path, pdfPath, outDir],
      environment: {'PYTHONIOENCODING': 'utf-8'},
    );
    proc.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
      if (line.startsWith('PROGRESS:')) {
        final parts = line.split(':');
        if (parts.length == 3) {
          onProgress?.call(int.tryParse(parts[1]) ?? 0, int.tryParse(parts[2]) ?? 0);
        }
      }
    });
    proc.stderr.drain<void>();
    await proc.exitCode;
    try {
      await scriptFile.delete();
    } catch (_) {}
  }

  /// On-demand single-page high-res rasterization (~0.08s per page).
  static Future<String> ensurePageHighRes(
    String pdfPath, {
    required String outDir,
    required int pageIndex,
    int dpi = 200,
  }) async {
    final outFile = highResPagePath(outDir, pageIndex);
    if (File(outFile).existsSync()) return outFile;
    await Directory(outDir).create(recursive: true);

    final script = '''
import sys, fitz
doc = fitz.open(sys.argv[1])
idx = int(sys.argv[2])
dpi = int(sys.argv[3])
out_path = sys.argv[4]
mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
pix = doc[idx].get_pixmap(matrix=mat, alpha=False)
pix.save(out_path, jpg_quality=95)
''';
    final res = await Process.run(
      _pyExe,
      ['-c', script, pdfPath, pageIndex.toString(), dpi.toString(), outFile],
      environment: {'PYTHONIOENCODING': 'utf-8'},
    );
    if (res.exitCode != 0) {
      throw Exception('渲染第 ${pageIndex + 1} 页失败: ${res.stderr}');
    }
    return outFile;
  }

  /// Batch-renders any missing high-res pages in parallel before full-book PDF export.
  static Future<void> ensureAllPagesHighRes(
    String pdfPath, {
    required String outDir,
    int dpi = 200,
    void Function(int current, int total)? onProgress,
  }) async {
    await Directory(outDir).create(recursive: true);
    final script = r'''
import sys, os, fitz
from concurrent.futures import ProcessPoolExecutor, as_completed

def render_chunk(args):
    pdf_path, out_dir, dpi, start, end = args
    doc = fitz.open(pdf_path)
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    for i in range(start, end):
        out_file = os.path.join(out_dir, f"page_{i+1:04d}.jpg")
        if not os.path.exists(out_file):
            pix = doc[i].get_pixmap(matrix=mat, alpha=False)
            pix.save(out_file, jpg_quality=95)
    return end - start

if __name__ == "__main__":
    pdf_path, out_dir, dpi = sys.argv[1], sys.argv[2], int(sys.argv[3])
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()
    workers = min(os.cpu_count() or 4, 8)
    chunk = max(1, (total + workers - 1) // workers)
    tasks = [(pdf_path, out_dir, dpi, s, min(total, s + chunk)) for s in range(0, total, chunk)]
    finished = 0
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for fut in as_completed([ex.submit(render_chunk, t) for t in tasks]):
            finished += fut.result()
            print(f"PROGRESS:{finished}:{total}", flush=True)
''';
    final scriptFile = File(p.join(outDir, '_render_pdf.py'));
    await scriptFile.writeAsString(script);
    final proc = await Process.start(
      _pyExe,
      [scriptFile.path, pdfPath, outDir, dpi.toString()],
      environment: {'PYTHONIOENCODING': 'utf-8'},
    );
    proc.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
      if (line.startsWith('PROGRESS:')) {
        final parts = line.split(':');
        if (parts.length == 3) {
          onProgress?.call(int.tryParse(parts[1]) ?? 0, int.tryParse(parts[2]) ?? 0);
        }
      }
    });
    final errBuf = StringBuffer();
    proc.stderr.transform(utf8.decoder).listen(errBuf.write);
    final code = await proc.exitCode;
    try {
      await scriptFile.delete();
    } catch (_) {}
    if (code != 0) throw Exception('PDF 批量高清渲染失败 (exit $code): $errBuf');
  }

  static List<String> listImagesInFolder(String folderPath) {
    const exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'};
    final files = Directory(folderPath)
        .listSync()
        .whereType<File>()
        .where((f) => exts.contains(p.extension(f.path).toLowerCase()))
        .map((f) => f.path)
        .toList()
      ..sort();
    return files;
  }
}
