import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../core/models/enhance_params.dart';

class SplitPreviewCanvas extends StatefulWidget {
  final String? sourcePath;
  final ui.Image? geometryImage;
  final ui.Image? geometryImage2;
  final ui.Image? processedImage;
  final ui.Image? processedImage2; // Second half when double-page split_side == 'both'
  final bool splitViewEnabled;
  final int activeStep; // 0=Split, 1=Dewarp, 2=Color, 3=Export
  final EnhanceParams params;
  final VoidCallback onParamsChanged;
  final bool isLoading;
  final double previewZoom; // 0.0 = Fit, 1.0 = 100%, 2.0 = 200%
  final Color accentColor;

  const SplitPreviewCanvas({
    super.key,
    required this.sourcePath,
    this.geometryImage,
    this.geometryImage2,
    required this.processedImage,
    this.processedImage2,
    required this.splitViewEnabled,
    required this.activeStep,
    required this.params,
    required this.onParamsChanged,
    this.isLoading = false,
    this.previewZoom = 0.0,
    this.accentColor = const Color(0xFF0078D7),
  });

  @override
  State<SplitPreviewCanvas> createState() => _SplitPreviewCanvasState();
}

class _SplitPreviewCanvasState extends State<SplitPreviewCanvas> {
  double _splitPos = 0.5;
  bool _draggingSplit = false;
  int? _draggingHandle;
  final TransformationController _zoomCtrl = TransformationController();

  @override
  void didUpdateWidget(covariant SplitPreviewCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.previewZoom != widget.previewZoom) {
      if (widget.previewZoom <= 0.0) {
        _zoomCtrl.value = Matrix4.identity();
      } else {
        _zoomCtrl.value = Matrix4.diagonal3Values(widget.previewZoom, widget.previewZoom, 1.0);
      }
    }
  }

  @override
  void dispose() {
    _zoomCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.sourcePath == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_stories_outlined, size: 56, color: Colors.black.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
            const Text(
              '拖入 PDF / 图片 / 文件夹，或点击上方「导入 PDF」开始处理',
              style: TextStyle(color: Color(0xFF374151), fontSize: 13.5),
            ),
            const SizedBox(height: 6),
            const Text(
              '支持批量去阴影漂白、弯曲展平、直接导出 PDF 或后台 PaddleOCR → EPUB3',
              style: TextStyle(color: Color(0xFF6B7280), fontSize: 12),
            ),
          ],
        ),
      );
    }

    // Step 1 (裁剪分页) and Step 2 (矫正展平) change image geometry, so display Side-by-Side (左原图 | 右结果)
    final useSideBySide = widget.activeStep <= 1;

    return Stack(
      alignment: Alignment.center,
      children: [
        if (useSideBySide)
          _buildSideBySideView()
        else
          _buildOverlaySliderView(),
        if (widget.isLoading)
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                  SizedBox(width: 8),
                  Text('Rust 渲染中...', style: TextStyle(fontSize: 11, color: Colors.white)),
                ],
              ),
            ),
          ),
      ],
    );
  }

  /// Side-by-Side layout for Step 1 (Crop/Split) & Step 2 (Dewarp/Perspective)
  Widget _buildSideBySideView() {
    final fileExists = File(widget.sourcePath!).existsSync();
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 52),
      child: Row(
        children: [
          // Left: Original Image + interactive vector overlays
          Expanded(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  child: const Text('原图 (可拖拽控制点)', style: TextStyle(fontSize: 11, color: Color(0xFF374151))),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: Center(
                    child: LayoutBuilder(
                      builder: (context, box) {
                        return Stack(
                          alignment: Alignment.center,
                          children: [
                            if (fileExists)
                              Image.file(
                                File(widget.sourcePath!),
                                fit: BoxFit.contain,
                                gaplessPlayback: true,
                              ),
                            Positioned.fill(
                              child: LayoutBuilder(
                                builder: (ctx, imgBox) => _buildVectorOverlays(imgBox.maxWidth, imgBox.maxHeight),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 1,
            margin: const EdgeInsets.symmetric(horizontal: 8),
            color: const Color(0xFFCBD5E1),
          ),
          // Right: Processed Result (Cropped / Split / Dewarped)
          Expanded(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: widget.accentColor),
                  ),
                  child: Text('处理结果', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: widget.accentColor)),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: InteractiveViewer(
                    transformationController: _zoomCtrl,
                    minScale: 0.3,
                    maxScale: 5.0,
                    child: Center(
                      child: widget.processedImage != null
                          ? (widget.processedImage2 != null
                              ? Row(
                                  children: [
                                    Expanded(child: RawImage(image: widget.processedImage, fit: BoxFit.contain)),
                                    const SizedBox(width: 6),
                                    Expanded(child: RawImage(image: widget.processedImage2, fit: BoxFit.contain)),
                                  ],
                                )
                              : RawImage(image: widget.processedImage, fit: BoxFit.contain))
                          : const SizedBox.shrink(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Overlay Before/After Split-Slider for Step 3 (Color/B&W) & Step 4 (Export)
  /// Compares Step 1+2 Geometry-Only result (Left) vs Step 3 Enhanced result (Right), pixel-aligned!
  Widget _buildOverlaySliderView() {
    if (widget.processedImage2 != null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 52),
        child: Row(
          children: [
            Expanded(child: _buildSingleSliderPane(widget.geometryImage, widget.processedImage)),
            const SizedBox(width: 8),
            Expanded(child: _buildSingleSliderPane(widget.geometryImage2, widget.processedImage2)),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 52),
      child: _buildSingleSliderPane(widget.geometryImage, widget.processedImage),
    );
  }

  Widget _buildSingleSliderPane(ui.Image? beforeImg, ui.Image? afterImg) {
    return InteractiveViewer(
      transformationController: _zoomCtrl,
      panEnabled: !_draggingSplit && _draggingHandle == null,
      scaleEnabled: !_draggingSplit && _draggingHandle == null,
      minScale: 0.3,
      maxScale: 5.0,
      child: Center(
        child: AspectRatio(
          aspectRatio: afterImg != null ? afterImg.width / afterImg.height : 0.72,
          child: LayoutBuilder(
            builder: (context, imgBox) {
              final w = imgBox.maxWidth;
              return Stack(
                fit: StackFit.expand,
                children: [
                  if (widget.splitViewEnabled)
                    if (beforeImg != null)
                      RawImage(image: beforeImg, fit: BoxFit.contain)
                    else if (File(widget.sourcePath!).existsSync())
                      Image.file(File(widget.sourcePath!), fit: BoxFit.contain, gaplessPlayback: true),
                  if (afterImg != null)
                    ClipRect(
                      clipper: widget.splitViewEnabled ? _RightClipper(_splitPos) : null,
                      child: RawImage(image: afterImg, fit: BoxFit.contain),
                    ),
                  if (widget.splitViewEnabled)
                    Positioned(
                      left: (w * _splitPos) - 16,
                      top: 0,
                      bottom: 0,
                      width: 32,
                      child: Listener(
                        behavior: HitTestBehavior.opaque,
                        onPointerDown: (_) => setState(() => _draggingSplit = true),
                        onPointerUp: (_) => setState(() => _draggingSplit = false),
                        onPointerCancel: (_) => setState(() => _draggingSplit = false),
                        onPointerMove: (ev) {
                          final scale = _zoomCtrl.value.getMaxScaleOnAxis().clamp(0.3, 5.0);
                          setState(() {
                            _splitPos = ((_splitPos * w + ev.delta.dx / scale) / w).clamp(0.05, 0.95);
                          });
                        },
                        child: MouseRegion(
                          cursor: SystemMouseCursors.resizeLeftRight,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Container(width: 2, color: widget.accentColor),
                              Container(
                                width: 26,
                                height: 26,
                                decoration: BoxDecoration(
                                  color: widget.accentColor,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 1.5),
                                  boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
                                ),
                                child: const Icon(Icons.compare_arrows, size: 15, color: Colors.white),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildVectorOverlays(double w, double h) {
    final crop = widget.params.cropBox;
    return Stack(
      children: [
        // Crop box outline in Step 1
        if (widget.activeStep == 0 && (crop[0] > 0.01 || crop[1] > 0.01 || crop[2] < 0.99 || crop[3] < 0.99))
          Positioned(
            left: crop[0] * w,
            top: crop[1] * h,
            width: ((crop[2] - crop[0]) * w).clamp(1.0, w),
            height: ((crop[3] - crop[1]) * h).clamp(1.0, h),
            child: IgnorePointer(
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
                ),
              ),
            ),
          ),

        // Step 1 Split Line Handle
        if (widget.activeStep == 0 && widget.params.splitMode != 'none')
          Positioned(
            left: (w * widget.params.splitRatio) - 10,
            top: 0,
            bottom: 0,
            width: 20,
            child: GestureDetector(
              onHorizontalDragUpdate: (d) {
                widget.params.splitRatio =
                    ((widget.params.splitRatio * w + d.delta.dx) / w).clamp(0.1, 0.9);
                widget.onParamsChanged();
              },
              child: MouseRegion(
                cursor: SystemMouseCursors.resizeLeftRight,
                child: Center(
                  child: Container(width: 2.5, color: const Color(0xFF16A34A)),
                ),
              ),
            ),
          ),

        // Step 2 Perspective 4-corner green handles
        if (widget.activeStep == 1 && widget.params.perspectiveEnabled)
          ...List.generate(4, (i) {
            final pt = widget.params.perspectivePoints[i];
            return Positioned(
              left: pt[0] * w - 9,
              top: pt[1] * h - 9,
              child: GestureDetector(
                onPanUpdate: (d) {
                  widget.params.perspectivePoints[i][0] = ((pt[0] * w + d.delta.dx) / w).clamp(0.0, 1.0);
                  widget.params.perspectivePoints[i][1] = ((pt[1] * h + d.delta.dy) / h).clamp(0.0, 1.0);
                  widget.onParamsChanged();
                },
                child: _greenHandle(_draggingHandle == i),
              ),
            );
          }),

        // Step 2 Curve Dewarp 3+3 green handles
        if (widget.activeStep == 1 && widget.params.dewarpEnabled) ...[
          for (int i = 0; i < 3; i++)
            Positioned(
              left: (i * 0.5) * (w - 18),
              top: widget.params.dewarpTopY[i] * h - 9,
              child: GestureDetector(
                onVerticalDragUpdate: (d) {
                  widget.params.dewarpTopY[i] =
                      ((widget.params.dewarpTopY[i] * h + d.delta.dy) / h).clamp(0.0, 0.45);
                  widget.onParamsChanged();
                },
                child: _greenHandle(false),
              ),
            ),
          for (int i = 0; i < 3; i++)
            Positioned(
              left: (i * 0.5) * (w - 18),
              top: widget.params.dewarpBottomY[i] * h - 9,
              child: GestureDetector(
                onVerticalDragUpdate: (d) {
                  widget.params.dewarpBottomY[i] =
                      ((widget.params.dewarpBottomY[i] * h + d.delta.dy) / h).clamp(0.55, 1.0);
                  widget.onParamsChanged();
                },
                child: _greenHandle(false),
              ),
            ),
        ],
      ],
    );
  }

  Widget _greenHandle(bool active) => MouseRegion(
        cursor: SystemMouseCursors.grab,
        child: Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            color: active ? const Color(0xFF4ADE80) : const Color(0xFF22C55E).withValues(alpha: 0.9),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
          ),
        ),
      );
}

class _RightClipper extends CustomClipper<Rect> {
  final double splitPos;
  _RightClipper(this.splitPos);

  @override
  Rect getClip(Size size) => Rect.fromLTRB(size.width * splitPos, 0, size.width, size.height);

  @override
  bool shouldReclip(covariant _RightClipper old) => old.splitPos != splitPos;
}
