import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:desktop_drop/desktop_drop.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../core/models/app_theme_preset.dart';
import '../core/models/enhance_params.dart';
import '../core/models/page_item.dart';
import '../core/services/app_paths.dart';
import '../core/services/epub_pipeline_service.dart';
import '../core/services/layout_service.dart';
import '../core/services/pdf_import_service.dart';
import '../core/services/preset_store.dart';
import '../core/services/rust_engine.dart';
import '../core/services/uvdoc_service.dart';
import 'widgets/inspector_panel.dart';
import 'widgets/split_preview_canvas.dart';

class WorkspaceTab {
  String bookName;
  final List<PageItem> pages = [];
  int selectedIndex = -1;
  String filterMode = 'all'; // "all", "odd", "even"
  String? activePdfPath;
  String? activePdfCacheDir;
  ui.Image? geometryImage;
  ui.Image? geometryImage2;
  ui.Image? previewImage;
  ui.Image? previewImage2;
  List<int> histogram = List.filled(256, 0);

  WorkspaceTab({required this.bookName});
}

class StudioHome extends StatefulWidget {
  const StudioHome({super.key});

  @override
  State<StudioHome> createState() => _StudioHomeState();
}

class _StudioHomeState extends State<StudioHome> {
  final List<WorkspaceTab> _tabs = [WorkspaceTab(bookName: '未命名工作区')];
  int _activeTabIdx = 0;

  int _activeStep = 0; // Step 1 (裁剪分页)
  bool _splitView = true;
  bool _autoFollowPrevParams = true;
  double _previewZoom = 0.0; // 0 = Fit
  AppThemePreset _theme = AppThemePreset.presets.first;
  int _pdfImportDpi = 200;
  bool _expertExpandedByDefault = true;
  bool _defaultRemoveMarginFingers = true;
  bool _defaultRemoveEdgeBlack = true;
  String _customModelDir = '';
  bool _aiAssistCrop = true;
  bool _aiAssistSplit = true;
  bool _aiAssistIllustrations = true;
  String _translationApiUrl = 'https://api.openai.com/v1';
  String _translationApiKey = '';
  String _translationModel = 'gpt-4o-mini';
  int _translationConcurrency = 4;

  String _epubLang = 'zh-CN';
  String _epubTranslateMode = 'none';
  bool _epubRunning = false;
  String _epubStatusText = '';

  bool _isRendering = false;
  bool _uvdocRunning = false;
  bool _isExporting = false;
  bool _isExportPaused = false;
  int _exportDone = 0;
  int _exportTotal = 0;
  Timer? _exportPollTimer;
  bool _isDraggingOnTabBar = false;
  bool _isDraggingOnBody = false;
  String? _importProgressText;
  EnhanceParams? _clipboardParams;
  Map<String, EnhanceParams> _userPresets = {};
  Timer? _debounce;

  WorkspaceTab get _tab => _tabs[_activeTabIdx];
  List<PageItem> get _pages => _tab.pages;
  PageItem? get _currentPage =>
      (_tab.selectedIndex >= 0 && _tab.selectedIndex < _pages.length) ? _pages[_tab.selectedIndex] : null;

  @override
  void initState() {
    super.initState();
    _loadUserPresets();
    _loadAppSettings();
  }

  Future<void> _loadAppSettings() async {
    final s = await PresetStore.loadSettings();
    if (!mounted) return;
    setState(() {
      _defaultRemoveMarginFingers = s.defaultRemoveMarginFingers;
      _defaultRemoveEdgeBlack = s.defaultRemoveEdgeBlack;
      _customModelDir = s.customModelDir;
      _aiAssistCrop = s.aiAssistCrop;
      _aiAssistSplit = s.aiAssistSplit;
      _aiAssistIllustrations = s.aiAssistIllustrations;
      _translationApiUrl = s.translationApiUrl;
      _translationApiKey = s.translationApiKey;
      _translationModel = s.translationModel;
      _translationConcurrency = s.translationConcurrency;
    });
  }

  void _saveAppSettings() {
    PresetStore.saveSettings(AppSettings(
      defaultRemoveMarginFingers: _defaultRemoveMarginFingers,
      defaultRemoveEdgeBlack: _defaultRemoveEdgeBlack,
      customModelDir: _customModelDir,
      aiAssistCrop: _aiAssistCrop,
      aiAssistSplit: _aiAssistSplit,
      aiAssistIllustrations: _aiAssistIllustrations,
      translationApiUrl: _translationApiUrl,
      translationApiKey: _translationApiKey,
      translationModel: _translationModel,
      translationConcurrency: _translationConcurrency,
    ));
  }

  EnhanceParams _newDefaultParams() => EnhanceParams(
        removeMarginFingers: _defaultRemoveMarginFingers,
        removeEdgeBlack: _defaultRemoveEdgeBlack,
      );

  Future<void> _openSettingsDialog() async {
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          backgroundColor: Colors.white,
          title: const Text('软件设置', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
          content: SizedBox(
            width: 390,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                const Text('界面配色方案', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                const SizedBox(height: 6),
                Row(
                  children: AppThemePreset.presets.map((t) {
                    final sel = t.id == _theme.id;
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: InkWell(
                          onTap: () {
                            setState(() => _theme = t);
                            setDlg(() {});
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            decoration: BoxDecoration(
                              color: sel ? t.activeBg : const Color(0xFFF8FAFC),
                              borderRadius: BorderRadius.circular(3),
                              border: Border.all(color: sel ? t.accent : const Color(0xFFCBD5E1)),
                            ),
                            child: Column(
                              children: [
                                Container(width: 14, height: 14, decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle)),
                                const SizedBox(height: 3),
                                Text(t.name, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('PDF 导入/渲染 DPI', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                    DropdownButton<int>(
                      value: _pdfImportDpi,
                      isDense: true,
                      dropdownColor: Colors.white,
                      items: const [150, 180, 200, 300]
                          .map((d) => DropdownMenuItem(value: d, child: Text('$d DPI', style: TextStyle(fontSize: 12))))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) {
                          setState(() => _pdfImportDpi = v);
                          setDlg(() {});
                        }
                      },
                    ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('默认展开 CEP 专家参数面板', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                  value: _expertExpandedByDefault,
                  activeThumbColor: _theme.accent,
                  onChanged: (v) {
                    setState(() => _expertExpandedByDefault = v);
                    setDlg(() {});
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('新页面默认开启「去除页边手指/肤色阴影」', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                  value: _defaultRemoveMarginFingers,
                  activeThumbColor: _theme.accent,
                  onChanged: (v) {
                    setState(() => _defaultRemoveMarginFingers = v);
                    _saveAppSettings();
                    setDlg(() {});
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('新页面默认开启「去边缘黑区」(黑白模式)', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                  value: _defaultRemoveEdgeBlack,
                  activeThumbColor: _theme.accent,
                  onChanged: (v) {
                    setState(() => _defaultRemoveEdgeBlack = v);
                    _saveAppSettings();
                    setDlg(() {});
                  },
                ),
                const SizedBox(height: 8),
                const Text('AI 模型目录 (PP-DocLayoutV3 插图识别 / UVDoc)',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                const SizedBox(height: 4),
                Builder(builder: (_) {
                  final resolved = LayoutService.resolveModelPath(_customModelDir, 'pp_doc_layoutv3.onnx');
                  final hasModel = resolved != null;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _customModelDir.isEmpty
                            ? '当前: 自动探测${resolved != null ? " (${p.dirname(resolved)})" : ""}'
                            : '当前: $_customModelDir',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF4B5563)),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        hasModel ? '✔ 已检测到 pp_doc_layoutv3.onnx' : '✘ 未找到 pp_doc_layoutv3.onnx',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: hasModel ? const Color(0xFF15803D) : const Color(0xFFB91C1C),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          OutlinedButton(
                            onPressed: () async {
                              final picked = await FilePicker.platform.getDirectoryPath(
                                dialogTitle: '选择包含 pp_doc_layoutv3.onnx 的模型文件夹',
                              );
                              if (picked != null) {
                                setState(() => _customModelDir = picked);
                                _saveAppSettings();
                                setDlg(() {});
                              }
                            },
                            child: const Text('选择模型文件夹', style: TextStyle(fontSize: 11.5)),
                          ),
                          const SizedBox(width: 8),
                          if (_customModelDir.isNotEmpty)
                            TextButton(
                              onPressed: () {
                                setState(() => _customModelDir = '');
                                _saveAppSettings();
                                setDlg(() {});
                              },
                              child: const Text('恢复自动探测', style: TextStyle(fontSize: 11.5)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: const Text('大模型辅助「智能裁剪」(第 1 步框选)', style: TextStyle(fontSize: 11.5, color: Color(0xFF1F2937))),
                        value: _aiAssistCrop,
                        activeThumbColor: _theme.accent,
                        onChanged: (v) {
                          setState(() => _aiAssistCrop = v);
                          _saveAppSettings();
                          setDlg(() {});
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: const Text('大模型辅助「双页识别与中缝切分」', style: TextStyle(fontSize: 11.5, color: Color(0xFF1F2937))),
                        value: _aiAssistSplit,
                        activeThumbColor: _theme.accent,
                        onChanged: (v) {
                          setState(() => _aiAssistSplit = v);
                          _saveAppSettings();
                          setDlg(() {});
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: const Text('大模型辅助「插图自动提取」(第 4 步)', style: TextStyle(fontSize: 11.5, color: Color(0xFF1F2937))),
                        value: _aiAssistIllustrations,
                        activeThumbColor: _theme.accent,
                        onChanged: (v) {
                          setState(() => _aiAssistIllustrations = v);
                          _saveAppSettings();
                          setDlg(() {});
                        },
                      ),
                    ],
                  );
                }),
                const SizedBox(height: 12),
                const Text('翻译 API 配置 (OpenAI 兼容 · 用于 EPUB 翻译)',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                const SizedBox(height: 6),
                TextFormField(
                  initialValue: _translationApiUrl,
                  style: const TextStyle(fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'API Base URL',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (v) {
                    _translationApiUrl = v.trim();
                    _saveAppSettings();
                  },
                ),
                const SizedBox(height: 8),
                TextFormField(
                  initialValue: _translationApiKey,
                  obscureText: true,
                  style: const TextStyle(fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'API Key',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (v) {
                    _translationApiKey = v.trim();
                    _saveAppSettings();
                  },
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextFormField(
                        initialValue: _translationModel,
                        style: const TextStyle(fontSize: 12),
                        decoration: const InputDecoration(
                          labelText: '模型名 (如 gpt-4o-mini / deepseek-chat)',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (v) {
                          _translationModel = v.trim();
                          _saveAppSettings();
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 1,
                      child: TextFormField(
                        initialValue: _translationConcurrency.toString(),
                        style: const TextStyle(fontSize: 12),
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: '并发',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (v) {
                          final n = int.tryParse(v.trim());
                          if (n != null && n > 0 && n <= 16) {
                            _translationConcurrency = n;
                            _saveAppSettings();
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
            ),
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx),
              style: ElevatedButton.styleFrom(backgroundColor: _theme.accent, foregroundColor: Colors.white),
              child: const Text('确定'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadUserPresets() async {
    final loaded = await PresetStore.loadAll();
    if (mounted) setState(() => _userPresets = loaded);
  }

  Future<void> _saveUserPresetDialog() async {
    final cur = _currentPage;
    if (cur == null) return;
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('保存当前配置为预设', style: TextStyle(fontSize: 15, color: Color(0xFF111827))),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: '例如：手机拍古籍200%黑白'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    await PresetStore.savePreset(name, cur.params);
    await _loadUserPresets();
    _showSnack('已保存配置「$name」');
  }

  Future<void> _deleteUserPreset(String name) async {
    await PresetStore.deletePreset(name);
    await _loadUserPresets();
    _showSnack('已删除配置「$name」');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _exportPollTimer?.cancel();
    super.dispose();
  }

  List<int> get _filteredIndices {
    final res = <int>[];
    for (int i = 0; i < _pages.length; i++) {
      if (_tab.filterMode == 'odd' && (i % 2 != 0)) continue;
      if (_tab.filterMode == 'even' && (i % 2 == 0)) continue;
      res.add(i);
    }
    return res;
  }

  void _schedulePreview() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 80), _renderCurrentPreview);
  }

  Future<void> _renderCurrentPreview() async {
    final tab = _tab;
    final page = _currentPage;
    if (page == null) return;
    setState(() => _isRendering = true);
    try {
      if (page.pdfPageIndex != null &&
          tab.activePdfPath != null &&
          tab.activePdfCacheDir != null &&
          !File(page.sourcePath).existsSync()) {
        await PdfImportService.ensurePageHighRes(
          tab.activePdfPath!,
          outDir: tab.activePdfCacheDir!,
          pageIndex: page.pdfPageIndex!,
          dpi: _pdfImportDpi,
        );
      }

      final isDoubleBoth = page.params.splitMode.startsWith('double') && page.params.splitSide == 'both';
      if (isDoubleBoth) {
        final p1 = page.params.clone()..splitSide = (page.params.splitMode == 'double_ltr' ? 'left' : 'right');
        final p2 = page.params.clone()..splitSide = (page.params.splitMode == 'double_ltr' ? 'right' : 'left');
        if (page.params.extractIllustrations) {
          if (_aiAssistIllustrations && LayoutService.isAvailable(_customModelDir)) {
            p1.illustrationBoxes = await LayoutService.detectSinglePage(page.sourcePath, p1, _customModelDir);
            p2.illustrationBoxes = await LayoutService.detectSinglePage(page.sourcePath, p2, _customModelDir);
          } else {
            p1.illustrationBoxes = null;
            p2.illustrationBoxes = null;
          }
        }
        final res1 = await RustEngine.renderPreview(page.sourcePath, p1, maxDim: 2000);
        final res2 = await RustEngine.renderPreview(page.sourcePath, p2, maxDim: 2000);
        final geo1 = await RustEngine.renderPreview(page.sourcePath, p1.geometryOnlyCopy(), maxDim: 2000);
        final geo2 = await RustEngine.renderPreview(page.sourcePath, p2.geometryOnlyCopy(), maxDim: 2000);
        if (!mounted) return;
        setState(() {
          tab.geometryImage = geo1.image;
          tab.geometryImage2 = geo2.image;
          tab.previewImage = res1.image;
          tab.previewImage2 = res2.image;
          tab.histogram = res1.histogram;
          page.isProcessed = true;
          _isRendering = false;
        });
      } else {
        if (page.params.extractIllustrations) {
          if (_aiAssistIllustrations && LayoutService.isAvailable(_customModelDir)) {
            page.params.illustrationBoxes =
                await LayoutService.detectSinglePage(page.sourcePath, page.params, _customModelDir);
          } else {
            page.params.illustrationBoxes = null;
          }
        }
        final res = await RustEngine.renderPreview(page.sourcePath, page.params, maxDim: 2400);
        final geo = await RustEngine.renderPreview(page.sourcePath, page.params.geometryOnlyCopy(), maxDim: 2400);
        if (!mounted) return;
        setState(() {
          tab.geometryImage = geo.image;
          tab.geometryImage2 = null;
          tab.previewImage = res.image;
          tab.previewImage2 = null;
          tab.histogram = res.histogram;
          page.isProcessed = true;
          _isRendering = false;
        });
      }

      final nextIdx = tab.selectedIndex + 1;
      if (nextIdx < tab.pages.length &&
          tab.pages[nextIdx].pdfPageIndex != null &&
          tab.activePdfPath != null &&
          tab.activePdfCacheDir != null &&
          !File(tab.pages[nextIdx].sourcePath).existsSync()) {
        PdfImportService.ensurePageHighRes(
          tab.activePdfPath!,
          outDir: tab.activePdfCacheDir!,
          pageIndex: tab.pages[nextIdx].pdfPageIndex!,
          dpi: _pdfImportDpi,
        ).catchError((_) => '');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _isRendering = false);
      _showSnack('预览渲染失败: $e');
    }
  }

  Future<void> _autoDetectCropSplit() async {
    final page = _currentPage;
    if (page == null) return;
    if (page.isLocked) {
      _showSnack('当前页已锁定，请先解锁');
      return;
    }
    try {
      var (cropBox, splitMode, splitRatio, summary) = await RustEngine.autoDetectCropSplit(page.sourcePath);
      if ((_aiAssistCrop || _aiAssistSplit) && LayoutService.isAvailable(_customModelDir)) {
        final (aiCrop, aiSplit, aiRatio) =
            await LayoutService.detectCropSplitSingle(page.sourcePath, page.params.rotation, _customModelDir);
        if (_aiAssistCrop && aiCrop != null) cropBox = aiCrop;
        if (_aiAssistSplit && aiSplit != null) {
          splitMode = aiSplit;
          if (aiRatio != null) splitRatio = aiRatio;
        }
        summary = 'PP-DocLayoutV3 大模型辅助框选完成';
      }
      if (!mounted) return;
      setState(() {
        page.params.cropBox = cropBox;
        page.params.splitMode = splitMode;
        page.params.splitRatio = splitRatio;
        page.isProcessed = true;
      });
      await _renderCurrentPreview();
      _showSnack('✨ $summary');
    } catch (e) {
      _showSnack('自动框选失败: $e');
    }
  }

  Future<void> _autoDetectAllPages() async {
    if (_pages.isEmpty) return;
    int updated = 0;
    for (int i = 0; i < _pages.length; i++) {
      final item = _pages[i];
      if (item.isLocked) continue;
      if (item.pdfPageIndex != null &&
          _tab.activePdfPath != null &&
          _tab.activePdfCacheDir != null &&
          !File(item.sourcePath).existsSync()) {
        await PdfImportService.ensurePageHighRes(
          _tab.activePdfPath!,
          outDir: _tab.activePdfCacheDir!,
          pageIndex: item.pdfPageIndex!,
          dpi: _pdfImportDpi,
        );
      }
      final (cropBox, splitMode, splitRatio, _) = await RustEngine.autoDetectCropSplit(item.sourcePath);
      item.params.cropBox = cropBox;
      item.params.splitMode = splitMode;
      item.params.splitRatio = splitRatio;
      item.isProcessed = true;
      updated++;
      if (mounted) {
        setState(() => _importProgressText = '独立框选: $updated/${_pages.length}');
      }
    }

    if ((_aiAssistCrop || _aiAssistSplit) && LayoutService.isAvailable(_customModelDir)) {
      if (mounted) setState(() => _importProgressText = '大模型批量框选与双页识别...');
      final aiResults = await LayoutService.detectCropSplitBatch(_pages, _customModelDir);
      for (final entry in aiResults.entries) {
        final item = _pages[entry.key];
        final (aiCrop, aiSplit, aiRatio) = entry.value;
        if (_aiAssistCrop && aiCrop != null) item.params.cropBox = aiCrop;
        if (_aiAssistSplit && aiSplit != null) {
          item.params.splitMode = aiSplit;
          if (aiRatio != null) item.params.splitRatio = aiRatio;
        }
      }
    }

    if (!mounted) return;
    setState(() => _importProgressText = null);
    await _renderCurrentPreview();
    _showSnack('✨ 已为 $updated 页独立自动框选书页与中缝');
  }

  Future<void> _runUvdocOnCurrentPage() async {
    final page = _currentPage;
    if (page == null || _uvdocRunning) return;
    if (page.isLocked) {
      _showSnack('当前页已锁定，请先解锁');
      return;
    }
    setState(() => _uvdocRunning = true);
    try {
      final (grid, provider) =
          await UvdocService.inferGrid(page.sourcePath, page.params, customModelDir: _customModelDir);
      if (!mounted) return;
      setState(() {
        page.params.uvdocGrid = grid;
        page.params.uvdocEnabled = true;
        page.isProcessed = true;
        _uvdocRunning = false;
      });
      await _renderCurrentPreview();
      _showSnack('✅ UVDoc 智能展平完成 ($provider)');
    } catch (e) {
      if (mounted) setState(() => _uvdocRunning = false);
      _showSnack('UVDoc 展平失败: $e');
    }
  }

  Future<void> _runUvdocAllPages() async {
    if (_pages.isEmpty || _uvdocRunning) return;
    setState(() {
      _uvdocRunning = true;
      _importProgressText = 'UVDoc 批量智能展平中...';
    });
    try {
      for (final item in _pages) {
        if (item.isLocked) continue;
        if (item.pdfPageIndex != null &&
            _tab.activePdfPath != null &&
            _tab.activePdfCacheDir != null &&
            !File(item.sourcePath).existsSync()) {
          await PdfImportService.ensurePageHighRes(
            _tab.activePdfPath!,
            outDir: _tab.activePdfCacheDir!,
            pageIndex: item.pdfPageIndex!,
            dpi: _pdfImportDpi,
          );
        }
      }
      final (grids, provider) =
          await UvdocService.inferGridBatch(_pages, customModelDir: _customModelDir);
      if (!mounted) return;
      setState(() {
        for (final e in grids.entries) {
          _pages[e.key].params.uvdocGrid = e.value;
          _pages[e.key].params.uvdocEnabled = true;
          _pages[e.key].isProcessed = true;
        }
        _uvdocRunning = false;
        _importProgressText = null;
      });
      await _renderCurrentPreview();
      _showSnack('✅ 已为 ${grids.length} 页独立完成 UVDoc 智能展平 ($provider)');
    } catch (e) {
      if (mounted) {
        setState(() {
          _uvdocRunning = false;
          _importProgressText = null;
        });
      }
      _showSnack('UVDoc 批量展平失败: $e');
    }
  }

  Future<void> _autoAnalyzeCurrentPage() async {
    final tab = _tab;
    final page = _currentPage;
    if (page == null) return;
    if (page.isLocked) {
      _showSnack('当前页参数已锁定，请先解锁再智能调参');
      return;
    }
    setState(() => _isRendering = true);
    try {
      if (page.pdfPageIndex != null &&
          tab.activePdfPath != null &&
          tab.activePdfCacheDir != null &&
          !File(page.sourcePath).existsSync()) {
        await PdfImportService.ensurePageHighRes(
          tab.activePdfPath!,
          outDir: tab.activePdfCacheDir!,
          pageIndex: page.pdfPageIndex!,
          dpi: _pdfImportDpi,
        );
      }
      final (recommended, summary) = await RustEngine.autoAnalyzePage(page.sourcePath);
      if (!mounted) return;
      setState(() {
        // Preserve Step 1 (crop/split) & Step 2 (UVDoc/perspective); only apply Step 3 tuning
        page.params.applyStep3From(recommended);
        if (_defaultRemoveMarginFingers) page.params.removeMarginFingers = true;
        if (_defaultRemoveEdgeBlack) page.params.removeEdgeBlack = true;
        page.isProcessed = true;
      });
      await _renderCurrentPreview();
      _showSnack('✨ 智能识别完成: $summary');
    } catch (e) {
      if (mounted) setState(() => _isRendering = false);
      _showSnack('智能识别失败: $e');
    }
  }

  WorkspaceTab _createOrReuseEmptyTab(String name) {
    if (_tabs.length == 1 && _tabs.first.pages.isEmpty) {
      _tabs.first.bookName = name;
      return _tabs.first;
    }
    final newTab = WorkspaceTab(bookName: name);
    _tabs.add(newTab);
    _activeTabIdx = _tabs.length - 1;
    return newTab;
  }

  Future<void> _importPdf() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );
    if (res == null || res.files.single.path == null) return;
    await _openPdfPath(res.files.single.path!);
  }

  Future<void> _openPdfPath(String pdfPath) async {
    final name = p.basenameWithoutExtension(pdfPath);
    final outDir = p.join(AppPaths.dataDir, 'pdf_cache', name);
    try {
      final total = await PdfImportService.getPdfPageCount(pdfPath);
      final tab = _createOrReuseEmptyTab(name);
      setState(() {
        tab.activePdfPath = pdfPath;
        tab.activePdfCacheDir = outDir;
        tab.pages
          ..clear()
          ..addAll(List.generate(
            total,
            (i) => PageItem(
              id: 'p_${i + 1}',
              sourcePath: PdfImportService.highResPagePath(outDir, i),
              thumbPath: PdfImportService.thumbPagePath(outDir, i),
              pdfPageIndex: i,
              displayName: 'Page ${i + 1}',
              params: _newDefaultParams(),
            ),
          ));
        tab.selectedIndex = tab.pages.isNotEmpty ? 0 : -1;
        _importProgressText = '缩略图: 0/$total';
      });
      await _loadProjectIfExists(outDir, tab);
      _renderCurrentPreview();

      PdfImportService.renderThumbnails(
        pdfPath,
        outDir: outDir,
        onProgress: (done, tot) {
          if (!mounted) return;
          setState(() {
            _importProgressText = done >= tot ? null : '缩略图: $done/$tot';
          });
        },
      );
    } catch (e) {
      if (mounted) setState(() => _importProgressText = null);
      _showSnack('导入 PDF 失败: $e');
    }
  }

  Future<void> _importFolder() async {
    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null) return;
    await _openFolderPath(dirPath);
  }

  Future<void> _openFolderPath(String dirPath) async {
    final imgs = PdfImportService.listImagesInFolder(dirPath);
    if (imgs.isEmpty) {
      _showSnack('所选文件夹中没有找到图片');
      return;
    }
    final tab = _createOrReuseEmptyTab(p.basename(dirPath));
    setState(() {
      tab.activePdfPath = null;
      tab.activePdfCacheDir = null;
      tab.pages
        ..clear()
        ..addAll(imgs.asMap().entries.map((e) => PageItem(
              id: 'p_${e.key + 1}',
              sourcePath: e.value,
              displayName: p.basename(e.value),
              params: _newDefaultParams(),
            )));
      tab.selectedIndex = 0;
    });
    await _loadProjectIfExists(dirPath, tab);
    _renderCurrentPreview();
  }

  Future<void> _handleDroppedPaths(List<String> paths, {required bool forceNewTab}) async {
    if (paths.isEmpty) return;
    final first = paths.first;
    if (Directory(first).existsSync()) {
      await _openFolderPath(first);
      return;
    }
    if (first.toLowerCase().endsWith('.pdf') && File(first).existsSync()) {
      await _openPdfPath(first);
      return;
    }
    const exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'};
    final imgs = paths.where((f) => File(f).existsSync() && exts.contains(p.extension(f).toLowerCase())).toList()..sort();
    if (imgs.isEmpty) {
      _showSnack('未识别的拖拽文件，请拖入 PDF、图片或文件夹');
      return;
    }

    if (forceNewTab || (_tabs.length == 1 && _tabs.first.pages.isEmpty)) {
      final tab = _createOrReuseEmptyTab(p.basename(p.dirname(imgs.first)));
      setState(() {
        tab.activePdfPath = null;
        tab.activePdfCacheDir = null;
        tab.pages
          ..clear()
          ..addAll(imgs.asMap().entries.map((e) => PageItem(
                id: 'p_${e.key + 1}',
                sourcePath: e.value,
                displayName: p.basename(e.value),
                params: _newDefaultParams(),
              )));
        tab.selectedIndex = 0;
      });
      _renderCurrentPreview();
    } else {
      // Append dropped images into current tab
      final tab = _tab;
      final startIdx = tab.pages.length;
      setState(() {
        for (int i = 0; i < imgs.length; i++) {
          tab.pages.add(PageItem(
            id: 'p_${startIdx + i + 1}_${DateTime.now().millisecondsSinceEpoch}',
            sourcePath: imgs[i],
            displayName: p.basename(imgs[i]),
            params: _newDefaultParams(),
          ));
        }
        tab.selectedIndex = startIdx;
      });
      _renderCurrentPreview();
      _showSnack('已将 ${imgs.length} 张图片添加到当前标签页「${tab.bookName}」');
    }
  }

  Future<void> _saveProject() async {
    if (_pages.isEmpty) return;
    final dir = p.dirname(_pages.first.sourcePath);
    final projFile = File(p.join(dir, 'scanbook_project.json'));
    final data = {
      'book_name': _tab.bookName,
      'pages': _pages.map((e) => e.toJson()).toList(),
    };
    await projFile.writeAsString(const JsonEncoder.withIndent('  ').convert(data));
    _showSnack('项目已保存至 ${projFile.path}');
  }

  Future<void> _loadProjectIfExists(String dir, WorkspaceTab tab) async {
    final projFile = File(p.join(dir, 'scanbook_project.json'));
    if (!projFile.existsSync()) return;
    try {
      final map = jsonDecode(await projFile.readAsString()) as Map<String, dynamic>;
      final saved = (map['pages'] as List).map((e) => PageItem.fromJson(e)).toList();
      final byPath = {for (final s in saved) s.sourcePath: s};
      for (final item in tab.pages) {
        final match = byPath[item.sourcePath];
        if (match != null) {
          item.params = match.params;
          item.isProcessed = match.isProcessed;
          item.isLocked = match.isLocked;
        }
      }
      _showSnack('已自动恢复上次项目参数');
    } catch (_) {}
  }

  Future<String?> _exportBatchPdf({String? forcedPath}) async {
    if (_pages.isEmpty) return null;

    // Warn if some pages still have default Step 3 settings while current page has Step 3 edits
    if (forcedPath == null && _currentPage != null) {
      final cur = _currentPage!;
      final curHasStep3 = cur.params.colorDepth != 'keep' ||
          cur.params.illuminationMode != 'none' ||
          cur.params.lineGridDewarp ||
          (cur.params.brightness - 100.0).abs() > 1.0 ||
          (cur.params.contrast - 100.0).abs() > 1.0;
      final untouchedStep3 = curHasStep3
          ? _pages
              .where((p) =>
                  !p.isLocked &&
                  p != cur &&
                  p.params.colorDepth == 'keep' &&
                  p.params.illuminationMode == 'none' &&
                  !p.params.lineGridDewarp &&
                  (p.params.brightness - 100.0).abs() < 1.0 &&
                  (p.params.contrast - 100.0).abs() < 1.0)
              .length
          : 0;
      if (untouchedStep3 > 0) {
        final action = await showDialog<String>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: Colors.white,
            title: const Text('导出前提示', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
            content: Text(
              '检测到还有 $untouchedStep3 页尚未设置色彩/排版增强参数，直接导出将保留原始状态。\n是否将当前第 ${_tab.selectedIndex + 1} 页的色彩增强、逐行纠斜与排版参数应用到这些页面（保留每页各自裁剪/分页）后再导出？',
              style: const TextStyle(fontSize: 13, color: Color(0xFF374151)),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, 'cancel'), child: const Text('取消')),
              OutlinedButton(onPressed: () => Navigator.pop(ctx, 'as_is'), child: const Text('直接导出')),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, 'apply'),
                style: ElevatedButton.styleFrom(backgroundColor: _theme.accent, foregroundColor: Colors.white),
                child: const Text('同步参数并导出'),
              ),
            ],
          ),
        );
        if (action == null || action == 'cancel') return null;
        if (action == 'apply') {
          for (final item in _pages) {
            if (!item.isLocked &&
                item != cur &&
                item.params.colorDepth == 'keep' &&
                item.params.illuminationMode == 'none' &&
                !item.params.lineGridDewarp) {
              item.params.applyStep3From(cur.params);
              item.params.applyStep4From(cur.params);
              item.params.autoDeskew = cur.params.autoDeskew;
              item.params.deskewAngle = cur.params.deskewAngle;
              item.isProcessed = true;
            }
          }
          setState(() {});
        }
      }
    }

    final outPath = forcedPath ??
        await FilePicker.platform.saveFile(
          dialogTitle: '导出增强后 PDF',
          fileName: '${_tab.bookName}_enhanced.pdf',
          allowedExtensions: ['pdf'],
          type: FileType.custom,
        );
    if (outPath == null) return null;

    setState(() {
      _isExporting = true;
      _isExportPaused = false;
      _exportDone = 0;
      _exportTotal = _pages.length;
    });

    try {
      if (_tab.activePdfPath != null && _tab.activePdfCacheDir != null) {
        await PdfImportService.ensureAllPagesHighRes(
          _tab.activePdfPath!,
          outDir: _tab.activePdfCacheDir!,
          dpi: _pdfImportDpi,
          onProgress: (cur, tot) {
            if (mounted) {
              setState(() {
                _importProgressText = '准备高清: $cur/$tot';
                _exportDone = cur;
                _exportTotal = tot;
              });
            }
          },
        );
        if (mounted) {
          setState(() {
            _importProgressText = null;
            _exportDone = 0;
          });
        }
      }
      await _saveProject();

      // Expand double-page spreads and run PP-DocLayoutV3 batch detection if any page enables illustration extraction
      final exportPages = <PageItem>[];
      for (final p in _pages) {
        final isDouble = p.params.splitMode == 'double_ltr' || p.params.splitMode == 'double_rtl';
        if (isDouble && p.params.splitSide == 'both') {
          final order = p.params.splitMode == 'double_ltr' ? ['left', 'right'] : ['right', 'left'];
          for (final side in order) {
            exportPages.add(PageItem(
              id: '${p.id}_$side',
              sourcePath: p.sourcePath,
              thumbPath: p.thumbPath,
              pdfPageIndex: p.pdfPageIndex,
              displayName: p.displayName,
              isProcessed: p.isProcessed,
              isLocked: p.isLocked,
              params: p.params.clone()..splitSide = side,
            ));
          }
        } else {
          exportPages.add(PageItem(
            id: p.id,
            sourcePath: p.sourcePath,
            thumbPath: p.thumbPath,
            pdfPageIndex: p.pdfPageIndex,
            displayName: p.displayName,
            isProcessed: p.isProcessed,
            isLocked: p.isLocked,
            params: p.params.clone(),
          ));
        }
      }

      if (exportPages.any((e) => e.params.extractIllustrations) &&
          _aiAssistIllustrations &&
          LayoutService.isAvailable(_customModelDir)) {
        if (mounted) {
          setState(() {
            _importProgressText = 'AI 识别插图...';
          });
        }
        await LayoutService.detectBatchForExport(
          exportPages,
          _customModelDir,
          onProgress: (done, tot) {
            if (mounted) {
              setState(() {
                _importProgressText = 'AI 识别插图: $done/$tot';
                _exportDone = done;
                _exportTotal = tot;
              });
            }
          },
        );
        if (mounted) {
          setState(() {
            _importProgressText = null;
            _exportDone = 0;
            _exportTotal = exportPages.length;
          });
        }
      }

      // Start polling Rust atomic export counter only when Rust batchBuildPdf starts
      _exportPollTimer?.cancel();
      _exportPollTimer = Timer.periodic(const Duration(milliseconds: 120), (_) {
        if (!mounted || !_isExporting) return;
        final (done, tot) = RustEngine.getExportProgress();
        setState(() {
          _exportDone = done;
          if (tot > 0) _exportTotal = tot;
        });
      });

      final completed = await RustEngine.batchBuildPdf(exportPages, outPath);
      if (!completed) {
        _showSnack('已停止导出 PDF');
        return null;
      }
      _showSnack('✅ 批量 PDF 导出成功: $outPath');
      return outPath;
    } catch (e) {
      _showSnack('❌ 导出 PDF 失败: $e');
      return null;
    } finally {
      _exportPollTimer?.cancel();
      if (mounted) {
        setState(() {
          _isExporting = false;
          _isExportPaused = false;
        });
      }
    }
  }

  Future<void> _openEpubDialog() async {
    final openTabs = <int>[];
    for (int i = 0; i < _tabs.length; i++) {
      if (_tabs[i].pages.isNotEmpty) openTabs.add(i);
    }
    // 'tab:<idx>' or 'file:<path>'
    String sourceChoice = openTabs.contains(_activeTabIdx)
        ? 'tab:$_activeTabIdx'
        : (openTabs.isNotEmpty ? 'tab:${openTabs.first}' : 'file:');
    String externalPdf = '';

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) {
          final isTab = sourceChoice.startsWith('tab:');
          final canStart = !_epubRunning && (isTab || externalPdf.isNotEmpty);
          return AlertDialog(
            backgroundColor: Colors.white,
            title: const Text('PDF 识别转 EPUB3 / 翻译出书',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
            content: SizedBox(
              width: 440,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('直接基于原始页面跑 PaddleOCR-VL 5 阶段识别与排版（无需前面 4 步二值化处理）。',
                      style: TextStyle(fontSize: 11.5, color: Color(0xFF4B5563))),
                  const SizedBox(height: 10),
                  const Text('输入来源（可直接选当前已打开项目）',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: sourceChoice,
                    isDense: true,
                    decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
                    items: [
                      for (final ti in openTabs)
                        DropdownMenuItem(
                          value: 'tab:$ti',
                          child: Text(
                            '当前项目: ${_tabs[ti].bookName} (${_tabs[ti].pages.length} 页${_tabs[ti].activePdfPath != null ? " · PDF" : " · 图片集"})',
                            style: const TextStyle(fontSize: 12),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      const DropdownMenuItem(
                        value: 'file:',
                        child: Text('另选本地 PDF 文件...', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                    onChanged: _epubRunning
                        ? null
                        : (v) {
                            if (v != null) {
                              sourceChoice = v;
                              setDlg(() {});
                            }
                          },
                  ),
                  if (!isTab) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            externalPdf.isEmpty ? '尚未选择本地 PDF 文件' : 'PDF: ${p.basename(externalPdf)}',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF111827)),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _epubRunning
                              ? null
                              : () async {
                                  final res = await FilePicker.platform.pickFiles(
                                    type: FileType.custom,
                                    allowedExtensions: ['pdf'],
                                  );
                                  if (res != null && res.files.single.path != null) {
                                    externalPdf = res.files.single.path!;
                                    setDlg(() {});
                                  }
                                },
                          child: const Text('选择 PDF', style: TextStyle(fontSize: 11.5)),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Text('原书语种', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                      const Spacer(),
                      DropdownButton<String>(
                        value: _epubLang,
                        isDense: true,
                        dropdownColor: Colors.white,
                        items: const [
                          DropdownMenuItem(value: 'zh-CN', child: Text('中文 (zh-CN)', style: TextStyle(fontSize: 12))),
                          DropdownMenuItem(value: 'en', child: Text('英文 (en)', style: TextStyle(fontSize: 12))),
                        ],
                        onChanged: _epubRunning
                            ? null
                            : (v) {
                                if (v != null) {
                                  setState(() => _epubLang = v);
                                  setDlg(() {});
                                }
                              },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Text('翻译出书模式', style: TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                      const Spacer(),
                      DropdownButton<String>(
                        value: _epubTranslateMode,
                        isDense: true,
                        dropdownColor: Colors.white,
                        items: const [
                          DropdownMenuItem(value: 'none', child: Text('仅原版 EPUB3 (不翻译)', style: TextStyle(fontSize: 12))),
                          DropdownMenuItem(value: 'zh', child: Text('API 翻译 -> 纯中文 EPUB3', style: TextStyle(fontSize: 12))),
                          DropdownMenuItem(value: 'bilingual', child: Text('API 翻译 -> 双语对照 EPUB3', style: TextStyle(fontSize: 12))),
                        ],
                        onChanged: _epubRunning
                            ? null
                            : (v) {
                                if (v != null) {
                                  setState(() => _epubTranslateMode = v);
                                  setDlg(() {});
                                }
                              },
                      ),
                    ],
                  ),
                  if (_epubStatusText.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Text(_epubStatusText, style: const TextStyle(fontSize: 11, color: Color(0xFF1F2937)), maxLines: 3),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('关闭')),
              ElevatedButton(
                onPressed: !canStart
                    ? null
                    : () async {
                        if (isTab) {
                          final ti = int.parse(sourceChoice.substring(4));
                          await _runTabEpub3(_tabs[ti], onUpdate: () => setDlg(() {}));
                        } else {
                          await _runDirectEpub3(externalPdf, onUpdate: () => setDlg(() {}));
                        }
                      },
                style: ElevatedButton.styleFrom(backgroundColor: _theme.accent, foregroundColor: Colors.white),
                child: Text(_epubRunning ? '处理中...' : '开始生成 EPUB3'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _runTabEpub3(WorkspaceTab tab, {VoidCallback? onUpdate}) async {
    if (tab.activePdfPath != null && File(tab.activePdfPath!).existsSync()) {
      await _runDirectEpub3(tab.activePdfPath!, customBookName: tab.bookName, onUpdate: onUpdate);
      return;
    }
    if (_epubRunning) return;
    setState(() {
      _epubRunning = true;
      _epubStatusText = '正在将当前项目原始图片打包为 PDF...';
    });
    onUpdate?.call();
    try {
      final outDir = Directory(AppPaths.outputDir);
      await outDir.create(recursive: true);
      final safeName = tab.bookName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final rawPdf = p.join(outDir.path, '${safeName}_raw_source.pdf');
      final rawPages = tab.pages
          .map((e) => PageItem(id: e.id, sourcePath: e.sourcePath, displayName: e.displayName, params: EnhanceParams()))
          .toList();
      final ok = await RustEngine.batchBuildPdf(rawPages, rawPdf);
      if (!ok) {
        if (mounted) setState(() { _epubRunning = false; _epubStatusText = ''; });
        onUpdate?.call();
        return;
      }
      if (mounted) setState(() => _epubRunning = false);
      await _runDirectEpub3(rawPdf, customBookName: safeName, onUpdate: onUpdate);
    } catch (e) {
      if (mounted) {
        setState(() {
          _epubRunning = false;
          _epubStatusText = '❌ 打包原图 PDF 失败: $e';
        });
        onUpdate?.call();
      }
    }
  }

  Future<void> _runDirectEpub3(String pdfPath, {String? customBookName, VoidCallback? onUpdate}) async {
    if (_epubRunning) return;
    if (_epubTranslateMode != 'none' &&
        _translationApiKey.trim().isEmpty &&
        !_translationApiUrl.contains('localhost') &&
        !_translationApiUrl.contains('127.0.0.1')) {
      _showSnack('请先在「设置 -> 翻译 API 配置」中填写 API Key');
      return;
    }
    setState(() {
      _epubRunning = true;
      _epubStatusText = '正在启动 PaddleOCR-VL -> EPUB3...';
    });
    onUpdate?.call();
    try {
      final rawName = (customBookName != null && customBookName.isNotEmpty)
          ? customBookName
          : p.basenameWithoutExtension(pdfPath);
      final safeName = rawName.replaceAll(RegExp(r'[\\/:*?"<>|\s]+'), '_');
      await EpubPipelineService.runPdfToEpub(
        pdfPath: pdfPath,
        bookName: safeName,
        lang: _epubLang,
        translateMode: _epubTranslateMode,
        customModelDir: _customModelDir,
        onLog: (line) {
          if (mounted && line.trim().isNotEmpty) {
            setState(() => _epubStatusText = line.trim());
            onUpdate?.call();
          }
        },
      );
      final suffix = _epubTranslateMode == 'none' ? '' : '_$_epubTranslateMode';
      final epubPath = p.join(AppPaths.outputDir, '$safeName$suffix.epub');
      if (mounted) {
        setState(() => _epubStatusText = '✅ 完成: $epubPath');
        onUpdate?.call();
      }
      _showSnack('✅ EPUB3 生成成功: $epubPath');
    } catch (e) {
      if (mounted) {
        setState(() => _epubStatusText = '❌ 失败: $e');
        onUpdate?.call();
      }
      _showSnack('❌ EPUB3 生成失败: $e');
    } finally {
      if (mounted) {
        setState(() => _epubRunning = false);
        onUpdate?.call();
      }
    }
  }

  void _applyParams({required bool oddEvenOnly}) {
    final cur = _currentPage;
    if (cur == null) return;
    final curParity = _tab.selectedIndex % 2;
    int skipped = 0;
    final preserveStep1 = _activeStep >= 2; // In Step 3/4, preserve each page's unique crop/split!
    for (int i = 0; i < _pages.length; i++) {
      if (i == _tab.selectedIndex) continue;
      if (oddEvenOnly && (i % 2 != curParity)) continue;
      if (_pages[i].isLocked) {
        skipped++;
        continue;
      }
      if (preserveStep1) {
        _pages[i].params.applyStep3From(cur.params);
        _pages[i].params.applyStep4From(cur.params);
        _pages[i].params.autoDeskew = cur.params.autoDeskew;
        _pages[i].params.deskewAngle = cur.params.deskewAngle;
      } else {
        _pages[i].params = cur.params.clone();
      }
      _pages[i].isProcessed = true;
    }
    setState(() {});
    final skipMsg = skipped > 0 ? '（已跳过 $skipped 个锁定页）' : '';
    final scopeMsg = preserveStep1 ? '色彩与排版参数（保留每页独立裁剪分页）' : '全部参数';
    _showSnack(oddEvenOnly
        ? '已将$scopeMsg应用到所有${curParity == 0 ? "奇数" : "偶数"}页$skipMsg'
        : '已将$scopeMsg应用到全部 ${_pages.length} 页$skipMsg');
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 3)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredIndices;
    final curPage = _currentPage;
    return Scaffold(
      backgroundColor: const Color(0xFFF0F0F0),
      body: Column(
        children: [
          _buildTabBar(),
          _buildCompactToolbar(),
          Expanded(
            child: DropTarget(
              onDragEntered: (_) => setState(() => _isDraggingOnBody = true),
              onDragExited: (_) => setState(() => _isDraggingOnBody = false),
              onDragDone: (details) {
                setState(() => _isDraggingOnBody = false);
                _handleDroppedPaths(details.files.map((f) => f.path).toList(), forceNewTab: false);
              },
              child: Stack(
                children: [
                  Row(
                    children: [
                      _buildLeftSidebar(filtered),
                      Expanded(
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: Container(
                                color: const Color(0xFFE5E7EB),
                                child: SplitPreviewCanvas(
                                  sourcePath: curPage?.sourcePath,
                                  geometryImage: _tab.geometryImage,
                                  geometryImage2: _tab.geometryImage2,
                                  processedImage: _tab.previewImage,
                                  processedImage2: _tab.previewImage2,
                                  splitViewEnabled: _splitView,
                                  activeStep: _activeStep,
                                  params: curPage?.params ?? EnhanceParams(),
                                  onParamsChanged: () {
                                    if (curPage?.isLocked == true) {
                                      _showSnack('当前页已锁定，请先解锁再修改参数');
                                      return;
                                    }
                                    setState(() {});
                                    _schedulePreview();
                                  },
                                  isLoading: _isRendering,
                                  previewZoom: _previewZoom,
                                  accentColor: _theme.accent,
                                ),
                              ),
                            ),
                            if (_pages.isNotEmpty)
                              Positioned(
                                bottom: 12,
                                left: 0,
                                right: 0,
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _buildPageAlertsBar(),
                                    _buildFloatingBottomBar(),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                      InspectorPanel(
                        theme: _theme,
                        activeStep: _activeStep,
                        onStepChanged: (s) => setState(() => _activeStep = s),
                        params: curPage?.params ?? EnhanceParams(),
                        histogram: _tab.histogram,
                        onParamsChanged: () {
                          if (curPage?.isLocked == true) {
                            _showSnack('当前页已锁定，请先解锁再修改参数');
                            return;
                          }
                          setState(() {});
                          _schedulePreview();
                        },
                        onApplyPreset: (preset) {
                          if (curPage == null) return;
                          if (curPage.isLocked) {
                            _showSnack('当前页已锁定，请先解锁');
                            return;
                          }
                          setState(() => curPage.params = preset);
                          _schedulePreview();
                        },
                        userPresets: _userPresets,
                        onSaveUserPreset: _saveUserPresetDialog,
                        onDeleteUserPreset: _deleteUserPreset,
                        onAutoAnalyze: _autoAnalyzeCurrentPage,
                        onAutoDetectCropSplit: _autoDetectCropSplit,
                        onAutoDetectAllPages: _autoDetectAllPages,
                        onRunUvdoc: _runUvdocOnCurrentPage,
                        onRunUvdocAllPages: _runUvdocAllPages,
                        uvdocRunning: _uvdocRunning,
                        expertExpandedByDefault: _expertExpandedByDefault,
                        pageCount: _pages.length,
                        layoutAiAvailable: _aiAssistIllustrations && LayoutService.isAvailable(_customModelDir),
                      ),
                    ],
                  ),
                  if (_isDraggingOnBody)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: Container(
                          color: const Color(0xFF0078D7).withValues(alpha: 0.14),
                          alignment: Alignment.center,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: const Color(0xFF0078D7), width: 2),
                            ),
                            child: Text(
                              _pages.isEmpty ? '松手导入 PDF / 图片 / 文件夹' : '松手将图片加入当前标签页（PDF/文件夹将新开标签）',
                              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return DropTarget(
      onDragEntered: (_) => setState(() => _isDraggingOnTabBar = true),
      onDragExited: (_) => setState(() => _isDraggingOnTabBar = false),
      onDragDone: (details) {
        setState(() => _isDraggingOnTabBar = false);
        _handleDroppedPaths(details.files.map((f) => f.path).toList(), forceNewTab: true);
      },
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: _isDraggingOnTabBar ? _theme.activeBg : _theme.toolbarBg,
          border: const Border(bottom: BorderSide(color: Color(0xFFD0D7DE))),
        ),
        child: Row(
          children: [
            Expanded(
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _tabs.length,
                itemBuilder: (_, idx) {
                  final t = _tabs[idx];
                  final active = idx == _activeTabIdx;
                  return GestureDetector(
                    onTap: () {
                      setState(() => _activeTabIdx = idx);
                      if (t.pages.isNotEmpty && t.previewImage == null) {
                        _renderCurrentPreview();
                      }
                    },
                    child: Container(
                      margin: const EdgeInsets.only(top: 3, right: 2),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      constraints: const BoxConstraints(maxWidth: 220),
                      decoration: BoxDecoration(
                        color: active ? Colors.white : const Color(0xFFF3F4F6),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                        border: Border.all(
                          color: active ? _theme.accent : const Color(0xFFCBD5E1),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            t.activePdfPath != null ? Icons.picture_as_pdf : Icons.photo_library_outlined,
                            size: 12,
                            color: active ? _theme.accent : const Color(0xFF6B7280),
                          ),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              '${t.bookName} (${t.pages.length})',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                                color: const Color(0xFF111827),
                              ),
                            ),
                          ),
                          if (_tabs.length > 1) ...[
                            const SizedBox(width: 6),
                            InkWell(
                              onTap: () {
                                setState(() {
                                  _tabs.removeAt(idx);
                                  if (_activeTabIdx >= _tabs.length) {
                                    _activeTabIdx = _tabs.length - 1;
                                  }
                                });
                              },
                              child: const Icon(Icons.close, size: 12, color: Color(0xFF6B7280)),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            IconButton(
              icon: const Icon(Icons.add, size: 16, color: Color(0xFF374151)),
              tooltip: '新建空白标签页 (也可直接拖文件到此处新开)',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
              onPressed: () {
                setState(() {
                  _tabs.add(WorkspaceTab(bookName: '新工作区 ${_tabs.length + 1}'));
                  _activeTabIdx = _tabs.length - 1;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCompactToolbar() {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: const BoxDecoration(
        color: Color(0xFFF5F6F7),
        border: Border(bottom: BorderSide(color: Color(0xFFD0D7DE))),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _toolbarBtn(Icons.picture_as_pdf, '导入 PDF', _importPdf),
                    const SizedBox(width: 4),
                    _toolbarBtn(Icons.folder_open, '导入文件夹', _importFolder),
                    const SizedBox(width: 4),
                    _toolbarBtn(
                      Icons.menu_book_outlined,
                      _epubRunning ? 'EPUB 处理中...' : '转 EPUB3 / 翻译',
                      _openEpubDialog,
                    ),
                  ],
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_importProgressText != null)
                      Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCCE8FF),
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: const Color(0xFF0078D7)),
                        ),
                        child: Text(_importProgressText!, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
                      ),
                    InkWell(
                      onTap: () => setState(() => _autoFollowPrevParams = !_autoFollowPrevParams),
                      child: Tooltip(
                        message: '切换页面时，若目标页未锁定且未处理，自动沿用上一页的参数配置',
                        child: Container(
                          height: 26,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: _autoFollowPrevParams ? _theme.activeBg : Colors.white,
                            borderRadius: BorderRadius.circular(3),
                            border: Border.all(color: _autoFollowPrevParams ? _theme.accent : const Color(0xFFCBD5E1)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.link, size: 13, color: _autoFollowPrevParams ? _theme.accent : const Color(0xFF6B7280)),
                              const SizedBox(width: 4),
                              const Text('参数跟随', style: TextStyle(fontSize: 11.5, color: Color(0xFF111827))),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    InkWell(
                      onTap: () => setState(() => _splitView = !_splitView),
                      child: Container(
                        height: 26,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _splitView ? _theme.activeBg : Colors.white,
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: _splitView ? _theme.accent : const Color(0xFFCBD5E1)),
                        ),
                        child: const Text('分屏对比', style: TextStyle(fontSize: 11.5, color: Color(0xFF111827))),
                      ),
                    ),
                    const SizedBox(width: 6),
                    _toolbarBtn(Icons.settings_outlined, '设置', _openSettingsDialog),
                    const SizedBox(width: 6),
                    Container(
                      height: 26,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(color: const Color(0xFFCBD5E1)),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<double>(
                          value: _previewZoom,
                          isDense: true,
                          dropdownColor: Colors.white,
                          style: const TextStyle(fontSize: 11.5, color: Color(0xFF111827)),
                          items: const [
                            DropdownMenuItem(value: 0.0, child: Text('适应')),
                            DropdownMenuItem(value: 1.0, child: Text('100%')),
                            DropdownMenuItem(value: 1.5, child: Text('150%')),
                            DropdownMenuItem(value: 2.0, child: Text('200%')),
                            DropdownMenuItem(value: 3.0, child: Text('300%')),
                          ],
                          onChanged: (v) {
                            if (v != null) setState(() => _previewZoom = v);
                          },
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    _toolbarBtn(Icons.save_outlined, '保存项目', _pages.isEmpty ? null : _saveProject),
                    const SizedBox(width: 6),
                    if (_isExporting) ...[
                      Container(
                        height: 26,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: _theme.accent),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 72,
                              child: LinearProgressIndicator(
                                value: _exportTotal > 0 ? (_exportDone / _exportTotal).clamp(0.0, 1.0) : null,
                                color: _theme.accent,
                                backgroundColor: const Color(0xFFE5E7EB),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '$_exportDone/$_exportTotal',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      _toolbarBtn(
                        _isExportPaused ? Icons.play_arrow : Icons.pause,
                        _isExportPaused ? '继续' : '暂停',
                        () {
                          final next = !_isExportPaused;
                          RustEngine.setExportPaused(next);
                          setState(() => _isExportPaused = next);
                        },
                      ),
                      const SizedBox(width: 4),
                      _toolbarBtn(Icons.stop, '停止', () {
                        RustEngine.cancelExport();
                      }),
                    ] else
                      SizedBox(
                        height: 26,
                        child: ElevatedButton.icon(
                          onPressed: _pages.isEmpty ? null : () => _exportBatchPdf(),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _theme.accent,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                          ),
                          icon: const Icon(Icons.ios_share, size: 13),
                          label: const Text('导出 PDF', style: TextStyle(fontSize: 11.5)),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _toolbarBtn(IconData icon, String label, VoidCallback? onTap) => SizedBox(
        height: 26,
        child: TextButton.icon(
          onPressed: onTap,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            backgroundColor: Colors.white,
            foregroundColor: onTap == null ? const Color(0xFF9CA3AF) : const Color(0xFF1F2937),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(3),
              side: const BorderSide(color: Color(0xFFCBD5E1)),
            ),
          ),
          icon: Icon(icon, size: 13),
          label: Text(label, style: const TextStyle(fontSize: 11.5)),
        ),
      );

  Widget _buildLeftSidebar(List<int> filtered) {
    return Container(
      width: 210,
      decoration: const BoxDecoration(
        color: Color(0xFFF5F6F7),
        border: Border(right: BorderSide(color: Color(0xFFD0D7DE))),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(6),
            child: Row(
              children: [
                _filterPill('all', '全部 (${_pages.length})'),
                const SizedBox(width: 4),
                _filterPill('odd', '奇'),
                const SizedBox(width: 4),
                _filterPill('even', '偶'),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFD0D7DE)),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(6),
              itemCount: filtered.length,
              itemBuilder: (_, idx) {
                final realIdx = filtered[idx];
                final item = _pages[realIdx];
                final selected = realIdx == _tab.selectedIndex;
                return GestureDetector(
                  onTap: () => _switchToPage(realIdx),
                  onSecondaryTapDown: (details) => _showPageContextMenu(details.globalPosition, realIdx),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: selected ? _theme.activeBg : Colors.white,
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(
                        color: selected ? _theme.accent : const Color(0xFFD0D7DE),
                      ),
                    ),
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: _buildThumbImage(item),
                        ),
                        // Top-left compact page number pill
                        Positioned(
                          left: 4,
                          top: 4,
                          child: Tooltip(
                            message: item.displayName,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.92),
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: const Color(0xFFCBD5E1)),
                              ),
                              child: Text(
                                '${realIdx + 1}',
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                              ),
                            ),
                          ),
                        ),
                        // Right-edge vertical 4-button strip: crisp custom-painted vector icons
                        Positioned(
                          right: 4,
                          top: 4,
                          child: Container(
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(3),
                              border: Border.all(color: const Color(0xFFCBD5E1)),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _thumbMiniBtn(_ThumbIconKind.copy, '复制参数', () {
                                  setState(() => _clipboardParams = item.params.clone());
                                  _showSnack('已复制第 ${realIdx + 1} 页参数');
                                }),
                                const SizedBox(height: 2),
                                _thumbMiniBtn(
                                  _ThumbIconKind.paste,
                                  '粘贴参数',
                                  _clipboardParams == null || item.isLocked
                                      ? null
                                      : () {
                                          setState(() {
                                            item.params = _clipboardParams!.clone();
                                            item.isProcessed = true;
                                          });
                                          if (realIdx == _tab.selectedIndex) _renderCurrentPreview();
                                          _showSnack('已粘贴参数到第 ${realIdx + 1} 页');
                                        },
                                ),
                                const SizedBox(height: 2),
                                _thumbMiniBtn(
                                  item.isLocked ? _ThumbIconKind.locked : _ThumbIconKind.unlocked,
                                  item.isLocked ? '解锁参数' : '锁定参数',
                                  () {
                                    setState(() => item.isLocked = !item.isLocked);
                                    _showSnack(item.isLocked
                                        ? '已锁定第 ${realIdx + 1} 页参数'
                                        : '已解锁第 ${realIdx + 1} 页参数');
                                  },
                                  color: item.isLocked ? const Color(0xFFD97706) : null,
                                ),
                                const SizedBox(height: 2),
                                _thumbMiniBtn(
                                  _ThumbIconKind.clear,
                                  '清空参数',
                                  item.isLocked
                                      ? null
                                      : () {
                                          setState(() {
                                            item.params = EnhanceParams();
                                            item.isProcessed = false;
                                          });
                                          if (realIdx == _tab.selectedIndex) _renderCurrentPreview();
                                          _showSnack('已清空第 ${realIdx + 1} 页参数');
                                        },
                                  color: const Color(0xFFDC2626),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (item.isProcessed)
                          const Positioned(
                            right: 5,
                            bottom: 4,
                            child: CircleAvatar(
                              radius: 8,
                              backgroundColor: Color(0xFF16A34A),
                              child: Icon(Icons.check, size: 11, color: Colors.white),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _thumbMiniBtn(_ThumbIconKind kind, String tip, VoidCallback? onTap, {Color? color}) => Tooltip(
        message: tip,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: onTap == null ? const Color(0xFFF3F4F6) : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: CustomPaint(
              size: const Size(12, 12),
              painter: _ThumbIconPainter(
                kind,
                onTap == null ? const Color(0xFF9CA3AF) : (color ?? const Color(0xFF1F2937)),
              ),
            ),
          ),
        ),
      );

  Future<void> _showPageContextMenu(Offset globalPos, int pageIdx) async {
    final item = _pages[pageIdx];
    final choice = await showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(globalPos.dx, globalPos.dy, globalPos.dx + 1, globalPos.dy + 1),
      color: Colors.white,
      items: [
        const PopupMenuItem(value: 'copy', child: Text('复制本页配置', style: TextStyle(fontSize: 12.5, color: Color(0xFF111827)))),
        PopupMenuItem(
          value: 'paste',
          enabled: _clipboardParams != null && !item.isLocked,
          child: Text('粘贴配置到此页',
              style: TextStyle(
                  fontSize: 12.5,
                  color: (_clipboardParams != null && !item.isLocked) ? const Color(0xFF111827) : const Color(0xFF9CA3AF))),
        ),
        PopupMenuItem(
          value: 'lock',
          child: Text(item.isLocked ? '解锁本页参数' : '锁定本页参数',
              style: const TextStyle(fontSize: 12.5, color: Color(0xFF111827))),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(value: 'apply_all', child: Text('应用此页配置到全部页', style: TextStyle(fontSize: 12.5, color: Color(0xFF111827)))),
        const PopupMenuItem(value: 'apply_parity', child: Text('应用此页配置到同奇偶页', style: TextStyle(fontSize: 12.5, color: Color(0xFF111827)))),
        const PopupMenuDivider(),
        PopupMenuItem(
          value: 'reset',
          enabled: !item.isLocked,
          child: Text('重置本页参数', style: TextStyle(fontSize: 12.5, color: item.isLocked ? const Color(0xFF9CA3AF) : const Color(0xFFDC2626))),
        ),
      ],
    );
    if (choice == null) return;
    switch (choice) {
      case 'copy':
        setState(() => _clipboardParams = item.params.clone());
        _showSnack('已复制第 ${pageIdx + 1} 页配置');
        break;
      case 'paste':
        if (_clipboardParams != null && !item.isLocked) {
          setState(() {
            item.params = _clipboardParams!.clone();
            item.isProcessed = true;
          });
          if (pageIdx == _tab.selectedIndex) _renderCurrentPreview();
          _showSnack('已粘贴配置到第 ${pageIdx + 1} 页');
        }
        break;
      case 'lock':
        setState(() => item.isLocked = !item.isLocked);
        break;
      case 'apply_all':
        setState(() => _tab.selectedIndex = pageIdx);
        _applyParams(oddEvenOnly: false);
        break;
      case 'apply_parity':
        setState(() => _tab.selectedIndex = pageIdx);
        _applyParams(oddEvenOnly: true);
        break;
      case 'reset':
        if (!item.isLocked) {
          setState(() {
            item.params = EnhanceParams();
            item.isProcessed = false;
          });
          if (pageIdx == _tab.selectedIndex) _renderCurrentPreview();
        }
        break;
    }
  }

  Widget _buildThumbImage(PageItem item) {
    final thumb = item.thumbPath;
    if (thumb != null && File(thumb).existsSync()) {
      return Container(
        height: 130,
        width: double.infinity,
        color: const Color(0xFFE5E7EB),
        child: Image.file(File(thumb), fit: BoxFit.contain, cacheWidth: 220),
      );
    }
    if (File(item.sourcePath).existsSync()) {
      return Container(
        height: 130,
        width: double.infinity,
        color: const Color(0xFFE5E7EB),
        child: Image.file(File(item.sourcePath), fit: BoxFit.contain, cacheWidth: 220),
      );
    }
    return Container(
      height: 130,
      width: double.infinity,
      color: const Color(0xFFE5E7EB),
      alignment: Alignment.center,
      child: const Icon(Icons.description_outlined, color: Color(0xFF9CA3AF), size: 28),
    );
  }

  Widget _filterPill(String key, String label) {
    final active = _tab.filterMode == key;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _tab.filterMode = key),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            color: active ? _theme.activeBg : Colors.white,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: active ? _theme.accent : const Color(0xFFCBD5E1)),
          ),
          child: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
        ),
      ),
    );
  }

  void _switchToPage(int newIdx) {
    if (newIdx < 0 || newIdx >= _pages.length) return;
    final prevPage = _currentPage;
    final nextPage = _pages[newIdx];
    if (_autoFollowPrevParams &&
        prevPage != null &&
        prevPage != nextPage &&
        !nextPage.isLocked &&
        !nextPage.isProcessed) {
      nextPage.params = prevPage.params.clone();
      nextPage.isProcessed = true;
    }
    setState(() => _tab.selectedIndex = newIdx);
    _renderCurrentPreview();
  }

  void _jumpToNextIndex(List<int> indices) {
    if (indices.isEmpty) return;
    final next = indices.firstWhere((i) => i > _tab.selectedIndex, orElse: () => indices.first);
    _switchToPage(next);
  }

  Widget _buildPageAlertsBar() {
    if (_pages.isEmpty) return const SizedBox.shrink();
    final doubleCount = _pages.where((p) => p.params.splitMode != 'none').length;
    final unsplitIndices = <int>[];
    final unprocessedIndices = <int>[];
    for (int i = 0; i < _pages.length; i++) {
      final p = _pages[i];
      if (p.params.splitMode == 'none') unsplitIndices.add(i);
      if (!p.isLocked && !p.isProcessed) unprocessedIndices.add(i);
    }

    final showSplitAlert = doubleCount >= 3 && unsplitIndices.isNotEmpty;
    final showUnprocessedAlert = unprocessedIndices.isNotEmpty;
    if (!showSplitAlert && !showUnprocessedAlert) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        alignment: WrapAlignment.center,
        children: [
          if (showSplitAlert)
            _alertPill(
              icon: Icons.chrome_reader_mode_outlined,
              text: '${unsplitIndices.length} 页未识别出双页 (点击跳转)',
              bgColor: const Color(0xFFFEF3C7),
              borderColor: const Color(0xFFF59E0B),
              fgColor: const Color(0xFF92400E),
              onTap: () => _jumpToNextIndex(unsplitIndices),
            ),
          if (showUnprocessedAlert)
            _alertPill(
              icon: Icons.warning_amber_rounded,
              text: '${unprocessedIndices.length} 页未锁定且未应用参数 (点击跳转)',
              bgColor: const Color(0xFFFEE2E2),
              borderColor: const Color(0xFFEF4444),
              fgColor: const Color(0xFF991B1B),
              onTap: () => _jumpToNextIndex(unprocessedIndices),
            ),
        ],
      ),
    );
  }

  Widget _alertPill({
    required IconData icon,
    required String text,
    required Color bgColor,
    required Color borderColor,
    required Color fgColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: bgColor.withValues(alpha: 0.96),
      borderRadius: BorderRadius.circular(14),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 13, color: fgColor),
              const SizedBox(width: 5),
              Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fgColor)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFloatingBottomBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: const Color(0xFFCBD5E1)),
        boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 6)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, size: 18, color: Color(0xFF1F2937)),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
            onPressed: _tab.selectedIndex > 0
                ? () => _switchToPage(_tab.selectedIndex - 1)
                : null,
          ),
          Text('${_tab.selectedIndex + 1} / ${_pages.length}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF111827))),
          IconButton(
            icon: const Icon(Icons.chevron_right, size: 18, color: Color(0xFF1F2937)),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
            onPressed: _tab.selectedIndex < _pages.length - 1
                ? () => _switchToPage(_tab.selectedIndex + 1)
                : null,
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: () => _applyParams(oddEvenOnly: false),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF111827),
              side: const BorderSide(color: Color(0xFFCBD5E1)),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 26),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
            ),
            child: const Text('应用到全部页', style: TextStyle(fontSize: 11.5)),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            onPressed: () => _applyParams(oddEvenOnly: true),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF111827),
              side: const BorderSide(color: Color(0xFFCBD5E1)),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 26),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
            ),
            child: const Text('应用到奇/偶页', style: TextStyle(fontSize: 11.5)),
          ),
        ],
      ),
    );
  }
}

enum _ThumbIconKind { copy, paste, locked, unlocked, clear }

class _ThumbIconPainter extends CustomPainter {
  final _ThumbIconKind kind;
  final Color color;

  _ThumbIconPainter(this.kind, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 1.35
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final w = size.width;
    final h = size.height;

    switch (kind) {
      case _ThumbIconKind.copy:
        canvas.drawRect(Rect.fromLTWH(w * 0.35, h * 0.12, w * 0.52, h * 0.62), p);
        canvas.drawPath(
          Path()
            ..moveTo(w * 0.35, h * 0.28)
            ..lineTo(w * 0.14, h * 0.28)
            ..lineTo(w * 0.14, h * 0.88)
            ..lineTo(w * 0.66, h * 0.88)
            ..lineTo(w * 0.66, h * 0.74),
          p,
        );
        break;
      case _ThumbIconKind.paste:
        canvas.drawRect(Rect.fromLTWH(w * 0.18, h * 0.22, w * 0.64, h * 0.68), p);
        canvas.drawRect(Rect.fromLTWH(w * 0.35, h * 0.08, w * 0.30, h * 0.16), p);
        canvas.drawLine(Offset(w * 0.32, h * 0.50), Offset(w * 0.68, h * 0.50), p);
        canvas.drawLine(Offset(w * 0.32, h * 0.68), Offset(w * 0.58, h * 0.68), p);
        break;
      case _ThumbIconKind.locked:
        canvas.drawRect(Rect.fromLTWH(w * 0.20, h * 0.45, w * 0.60, h * 0.44), p);
        canvas.drawArc(Rect.fromLTWH(w * 0.30, h * 0.12, w * 0.40, h * 0.42), 3.14159, 3.14159, false, p);
        break;
      case _ThumbIconKind.unlocked:
        canvas.drawRect(Rect.fromLTWH(w * 0.20, h * 0.45, w * 0.60, h * 0.44), p);
        canvas.drawArc(Rect.fromLTWH(w * 0.34, h * 0.10, w * 0.40, h * 0.40), 3.14159, 2.35, false, p);
        break;
      case _ThumbIconKind.clear:
        canvas.drawArc(Rect.fromLTWH(w * 0.14, h * 0.14, w * 0.72, h * 0.72), 0.7, 4.9, false, p);
        canvas.drawPath(
          Path()
            ..moveTo(w * 0.22, h * 0.18)
            ..lineTo(w * 0.20, h * 0.42)
            ..lineTo(w * 0.42, h * 0.38),
          p,
        );
        break;
    }
  }

  @override
  bool shouldRepaint(covariant _ThumbIconPainter old) => old.kind != kind || old.color != color;
}
