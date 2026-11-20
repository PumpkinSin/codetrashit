import 'package:flutter/material.dart';

class HistogramCurveWidget extends StatefulWidget {
  final List<int> histogram;
  final double darkX;
  final double darkY;
  final double lightX;
  final double lightY;
  final Color accentColor;
  final void Function(double dx, double dy, double lx, double ly) onCurveChanged;

  const HistogramCurveWidget({
    super.key,
    required this.histogram,
    required this.darkX,
    required this.darkY,
    required this.lightX,
    required this.lightY,
    this.accentColor = const Color(0xFF0078D7),
    required this.onCurveChanged,
  });

  @override
  State<HistogramCurveWidget> createState() => _HistogramCurveWidgetState();
}

class _HistogramCurveWidgetState extends State<HistogramCurveWidget> {
  int _activePoint = 0;
  bool _mirrorSync = true; // Symmetric S-curve linking around (0.5, 0.5)

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          height: 108,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return GestureDetector(
                onPanStart: (details) {
                  final w = constraints.maxWidth;
                  final h = constraints.maxHeight;
                  final nx = (details.localPosition.dx / w).clamp(0.0, 1.0);
                  final ny = (1.0 - details.localPosition.dy / h).clamp(0.0, 1.0);
                  final d0 = (nx - widget.darkX).abs() + (ny - widget.darkY).abs();
                  final d1 = (nx - widget.lightX).abs() + (ny - widget.lightY).abs();
                  _activePoint = d0 <= d1 ? 0 : 1;
                },
                onPanUpdate: (details) {
                  final w = constraints.maxWidth;
                  final h = constraints.maxHeight;
                  final nx = (details.localPosition.dx / w).clamp(0.05, 0.95);
                  final ny = (1.0 - details.localPosition.dy / h).clamp(0.0, 1.0);
                  if (_activePoint == 0) {
                    final dx = nx.clamp(0.05, _mirrorSync ? 0.46 : (widget.lightX - 0.08).clamp(0.05, 0.48));
                    final lx = _mirrorSync ? (1.0 - dx).clamp(0.54, 0.95) : widget.lightX;
                    final ly = _mirrorSync ? (1.0 - ny).clamp(0.0, 1.0) : widget.lightY;
                    widget.onCurveChanged(dx, ny, lx, ly);
                  } else {
                    final lx = nx.clamp(_mirrorSync ? 0.54 : (widget.darkX + 0.08).clamp(0.52, 0.95), 0.95);
                    final dx = _mirrorSync ? (1.0 - lx).clamp(0.05, 0.46) : widget.darkX;
                    final dy = _mirrorSync ? (1.0 - ny).clamp(0.0, 1.0) : widget.darkY;
                    widget.onCurveChanged(dx, dy, lx, ny);
                  }
                },
                child: CustomPaint(
                  size: Size(constraints.maxWidth, constraints.maxHeight),
                  painter: _SmoothHistPainter(
                    widget.histogram,
                    widget.darkX,
                    widget.darkY,
                    widget.lightX,
                    widget.lightY,
                    widget.accentColor,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: () => setState(() => _mirrorSync = !_mirrorSync),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  decoration: BoxDecoration(
                    color: _mirrorSync ? widget.accentColor.withValues(alpha: 0.16) : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: _mirrorSync ? widget.accentColor : const Color(0xFFCBD5E1)),
                  ),
                  child: Text(
                    '对称联动',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: _mirrorSync ? FontWeight.w600 : FontWeight.normal,
                      color: _mirrorSync ? widget.accentColor : const Color(0xFF1F2937),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),
            _presetBtn('重置', () => widget.onCurveChanged(0.25, 0.25, 0.75, 0.75)),
            const SizedBox(width: 4),
            _presetBtn('去灰底', () => widget.onCurveChanged(0.25, 0.14, 0.75, 0.86)),
            const SizedBox(width: 4),
            _presetBtn('强对比', () => widget.onCurveChanged(0.28, 0.10, 0.72, 0.90)),
            const SizedBox(width: 4),
            _presetBtn('提亮', () => widget.onCurveChanged(0.22, 0.36, 0.78, 0.82)),
          ],
        ),
      ],
    );
  }

  Widget _presetBtn(String label, VoidCallback onTap) => Expanded(
        child: InkWell(
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: const Color(0xFFCBD5E1)),
            ),
            child: Text(label, style: const TextStyle(fontSize: 10.5, color: Color(0xFF1F2937))),
          ),
        ),
      );
}

class _SmoothHistPainter extends CustomPainter {
  final List<int> hist;
  final double x1;
  final double y1;
  final double x2;
  final double y2;
  final Color accentColor;

  _SmoothHistPainter(this.hist, this.x1, this.y1, this.x2, this.y2, this.accentColor);

  double _evalSmooth(double x) {
    final cx1 = x1.clamp(0.05, 0.48);
    final cx2 = x2.clamp(cx1 + 0.05, 0.95);
    final xs = [0.0, cx1, cx2, 1.0];
    final ys = [0.0, y1.clamp(0.0, 1.0), y2.clamp(0.0, 1.0), 1.0];

    final d = List<double>.filled(3, 0.0);
    for (int i = 0; i < 3; i++) {
      d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]).clamp(1e-5, 1.0);
    }

    final m = List<double>.filled(4, 0.0);
    m[0] = d[0];
    m[3] = d[2];
    for (int i = 1; i < 3; i++) {
      m[i] = (d[i - 1] * d[i] <= 0.0) ? 0.0 : 0.5 * (d[i - 1] + d[i]);
    }

    final seg = x < cx1 ? 0 : (x < cx2 ? 1 : 2);
    final h = (xs[seg + 1] - xs[seg]).clamp(1e-5, 1.0);
    final t = ((x - xs[seg]) / h).clamp(0.0, 1.0);
    final t2 = t * t;
    final t3 = t2 * t;

    final h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    final h10 = t3 - 2.0 * t2 + t;
    final h01 = -2.0 * t3 + 3.0 * t2;
    final h11 = t3 - t2;

    return (h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1]).clamp(0.0, 1.0);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = const Color(0xFFE2E8F0)
      ..strokeWidth = 1;
    for (int i = 1; i < 4; i++) {
      final x = size.width * i / 4;
      final y = size.height * i / 4;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    if (hist.isNotEmpty) {
      int maxVal = 1;
      for (final v in hist) {
        if (v > maxVal) maxVal = v;
      }
      final barPaint = Paint()
        ..color = const Color(0xFF94A3B8).withValues(alpha: 0.45)
        ..style = PaintingStyle.fill;
      final path = Path()..moveTo(0, size.height);
      final step = size.width / hist.length;
      for (int i = 0; i < hist.length; i++) {
        final h = (hist[i] / maxVal).clamp(0.0, 1.0) * (size.height - 6);
        path.lineTo(i * step, size.height - h);
      }
      path.lineTo(size.width, size.height);
      path.close();
      canvas.drawPath(path, barPaint);
    }

    // 45-degree baseline
    canvas.drawLine(
      Offset(0, size.height),
      Offset(size.width, 0),
      Paint()
        ..color = const Color(0xFFCBD5E1)
        ..strokeWidth = 1,
    );

    final curvePaint = Paint()
      ..color = accentColor
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final curvePath = Path();
    const samples = 64;
    for (int i = 0; i <= samples; i++) {
      final t = i / samples;
      final y = _evalSmooth(t);
      final px = t * size.width;
      final py = (1.0 - y) * size.height;
      if (i == 0) {
        curvePath.moveTo(px, py);
      } else {
        curvePath.lineTo(px, py);
      }
    }
    canvas.drawPath(curvePath, curvePaint);

    final p1 = Offset(x1 * size.width, (1.0 - y1) * size.height);
    final p2 = Offset(x2 * size.width, (1.0 - y2) * size.height);
    final handleFill = Paint()..color = accentColor;
    final handleStroke = Paint()
      ..color = Colors.white
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    for (final pt in [p1, p2]) {
      canvas.drawCircle(pt, 4.5, handleFill);
      canvas.drawCircle(pt, 4.5, handleStroke);
    }
  }

  @override
  bool shouldRepaint(covariant _SmoothHistPainter old) =>
      old.x1 != x1 || old.y1 != y1 || old.x2 != x2 || old.y2 != y2 || old.hist != hist || old.accentColor != accentColor;
}
