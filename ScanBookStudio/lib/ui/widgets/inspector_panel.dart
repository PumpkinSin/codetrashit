import 'package:flutter/material.dart';
import '../../core/models/app_theme_preset.dart';
import '../../core/models/enhance_params.dart';
import 'histogram_curve_widget.dart';

class InspectorPanel extends StatelessWidget {
  final AppThemePreset theme;
  final int activeStep;
  final void Function(int) onStepChanged;
  final EnhanceParams params;
  final List<int> histogram;
  final VoidCallback onParamsChanged;
  final void Function(EnhanceParams) onApplyPreset;
  final Map<String, EnhanceParams> userPresets;
  final VoidCallback onSaveUserPreset;
  final void Function(String name) onDeleteUserPreset;
  final VoidCallback onAutoAnalyze;
  final VoidCallback onAutoDetectCropSplit;
  final VoidCallback onAutoDetectAllPages;
  final VoidCallback onRunUvdoc;
  final VoidCallback? onRunUvdocAllPages;
  final bool uvdocRunning;
  final bool expertExpandedByDefault;
  final int pageCount;
  final bool layoutAiAvailable;

  const InspectorPanel({
    super.key,
    required this.theme,
    required this.activeStep,
    required this.onStepChanged,
    required this.params,
    required this.histogram,
    required this.onParamsChanged,
    required this.onApplyPreset,
    required this.userPresets,
    required this.onSaveUserPreset,
    required this.onDeleteUserPreset,
    required this.onAutoAnalyze,
    required this.onAutoDetectCropSplit,
    required this.onAutoDetectAllPages,
    required this.onRunUvdoc,
    this.onRunUvdocAllPages,
    this.uvdocRunning = false,
    this.expertExpandedByDefault = true,
    required this.pageCount,
    this.layoutAiAvailable = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 348,
      decoration: BoxDecoration(
        color: theme.panelBg,
        border: const Border(left: BorderSide(color: Color(0xFFD0D7DE))),
      ),
      child: Column(
        children: [
          Container(
            color: theme.toolbarBg,
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
            child: Row(
              children: [
                _stepTab(0, '1.裁剪分页'),
                const SizedBox(width: 4),
                _stepTab(1, '2.矫正展平'),
                const SizedBox(width: 4),
                _stepTab(2, '3.色彩缩放'),
                const SizedBox(width: 4),
                _stepTab(3, '4.排版输出'),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFD0D7DE)),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: switch (activeStep) {
                0 => _buildStep1Split(),
                1 => _buildStep2Dewarp(),
                2 => _buildStep3Color(),
                _ => _buildStep4Export(),
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepTab(int idx, String label) {
    final active = activeStep == idx;
    return Expanded(
      child: InkWell(
        onTap: () => onStepChanged(idx),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 5),
          decoration: BoxDecoration(
            color: active ? theme.activeBg : Colors.white,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: active ? theme.accent : const Color(0xFFCBD5E1)),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: active ? FontWeight.w600 : FontWeight.normal,
              color: const Color(0xFF111827),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep1Split() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _groupBox('方向与旋转', [
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    _miniBtn('左90°', () {
                      params.rotation = (params.rotation + 270) % 360;
                      onParamsChanged();
                    }),
                    _miniBtn('右90°', () {
                      params.rotation = (params.rotation + 90) % 360;
                      onParamsChanged();
                    }),
                    _miniBtn('180°', () {
                      params.rotation = (params.rotation + 180) % 360;
                      onParamsChanged();
                    }),
                    _miniToggle('水平镜像', params.flipH, (v) {
                      params.flipH = v;
                      onParamsChanged();
                    }),
                    _miniToggle('垂直翻转', params.flipV, (v) {
                      params.flipV = v;
                      onParamsChanged();
                    }),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              _miniBtn('重置本步', () {
                params.resetStep1();
                onParamsChanged();
              }),
            ],
          ),
        ]),
        _groupBox('分页与去中缝', [
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: OutlinedButton.icon(
                    onPressed: pageCount == 0 ? null : onAutoDetectCropSplit,
                    style: OutlinedButton.styleFrom(
                      backgroundColor: theme.activeBg.withValues(alpha: 0.55),
                      foregroundColor: theme.accent,
                      side: BorderSide(color: theme.accent),
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                    ),
                    icon: const Icon(Icons.crop_free, size: 13),
                    label: const Text('框选本页', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: OutlinedButton.icon(
                    onPressed: pageCount == 0 ? null : onAutoDetectAllPages,
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFF1F2937),
                      side: const BorderSide(color: Color(0xFFCBD5E1)),
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                    ),
                    icon: const Icon(Icons.auto_awesome_motion, size: 13),
                    label: const Text('每页独立框选', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          _dropdownRow('分页模式', params.splitMode, const {
            'none': '不分拆 (单页)',
            'single_gutter': '单页去中缝',
            'double_ltr': '双页切分 (左翻)',
            'double_rtl': '双页切分 (右翻)',
          }, (v) {
            params.splitMode = v;
            onParamsChanged();
          }),
          if (params.splitMode != 'none') ...[
            _sliderRow('分割线位置', params.splitRatio, 0.1, 0.9, (v) {
              params.splitRatio = v;
              onParamsChanged();
            }, format: (v) => '${(v * 100).toStringAsFixed(0)}%'),
            if (params.splitMode.startsWith('double'))
              _dropdownRow('预览/输出页', params.splitSide, const {
                'both': '双页全部 (左+右)',
                'left': '仅左半页',
                'right': '仅右半页',
              }, (v) {
                params.splitSide = v;
                onParamsChanged();
              }),
          ],
          _switchRow('自动裁切白边', params.autoCropMargin, (v) {
            params.autoCropMargin = v;
            onParamsChanged();
          }),
        ]),
        _expertDrawer('四边裁切与斑点补偿 (CEP)', [
          _twoCol(
            _sliderRow('左裁切', params.cropBox[0], 0.0, 0.4, (v) {
              params.cropBox[0] = v;
              onParamsChanged();
            }, format: (v) => '${(v * 100).toInt()}%'),
            _sliderRow('右裁切', params.cropBox[2], 0.6, 1.0, (v) {
              params.cropBox[2] = v;
              onParamsChanged();
            }, format: (v) => '${(v * 100).toInt()}%'),
          ),
          _twoCol(
            _sliderRow('上裁切', params.cropBox[1], 0.0, 0.4, (v) {
              params.cropBox[1] = v;
              onParamsChanged();
            }, format: (v) => '${(v * 100).toInt()}%'),
            _sliderRow('下裁切', params.cropBox[3], 0.6, 1.0, (v) {
              params.cropBox[3] = v;
              onParamsChanged();
            }, format: (v) => '${(v * 100).toInt()}%'),
          ),
          _sliderRow('斑点补偿留白 (px)', params.specklePaddingPx.toDouble(), 0, 30, (v) {
            params.specklePaddingPx = v.round();
            onParamsChanged();
          }),
        ]),
      ],
    );
  }

  Widget _buildStep2Dewarp() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _groupBox('手动微调旋转', [
          Row(
            children: [
              Expanded(
                child: _sliderRow('手动旋转角度', params.deskewAngle, -8.0, 8.0, (v) {
                  params.deskewAngle = v;
                  onParamsChanged();
                }, format: (v) => '${v.toStringAsFixed(1)}°'),
              ),
              const SizedBox(width: 6),
              _miniBtn('重置本步', () {
                params.resetStep2();
                onParamsChanged();
              }),
            ],
          ),
        ]),
        _groupBox('UVDoc AI 智能展平 (通用 ONNX · 支持 A/N/核显/CPU)', [
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: OutlinedButton.icon(
                    onPressed: (pageCount == 0 || uvdocRunning) ? null : onRunUvdoc,
                    style: OutlinedButton.styleFrom(
                      backgroundColor: theme.activeBg.withValues(alpha: 0.55),
                      foregroundColor: theme.accent,
                      side: BorderSide(color: theme.accent),
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                    ),
                    icon: uvdocRunning
                        ? SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(strokeWidth: 2, color: theme.accent),
                          )
                        : const Icon(Icons.auto_awesome, size: 13),
                    label: Text(
                      uvdocRunning ? '计算中...' : '展平当前页',
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: OutlinedButton.icon(
                    onPressed: (pageCount == 0 || uvdocRunning) ? null : onRunUvdocAllPages,
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFF1F2937),
                      side: const BorderSide(color: Color(0xFFCBD5E1)),
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                    ),
                    icon: const Icon(Icons.auto_awesome_motion, size: 13),
                    label: const Text(
                      '全部页独立展平',
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (params.uvdocGrid != null)
            _switchRow('启用 UVDoc 展平结果', params.uvdocEnabled, (v) {
              params.uvdocEnabled = v;
              onParamsChanged();
            }),
        ]),
        _groupBox('梯形矫正 & 手动弯曲展平', [
          _switchRow('四点透视矫正 (画布拖绿点)', params.perspectiveEnabled, (v) {
            params.perspectiveEnabled = v;
            onParamsChanged();
          }),
          _switchRow('曲面展平 (画布拖上下绿点)', params.dewarpEnabled, (v) {
            params.dewarpEnabled = v;
            onParamsChanged();
          }),
        ]),
        if (params.dewarpEnabled)
          _expertDrawer('展平算法参数 (CEP)', [
            _dropdownRow('展平方法', params.dewarpMethod, const {
              'expanded_text': '扩展文本行 (推荐)',
              'text_lines': '仅文本行',
              'page_boundary': '页边界跟踪',
              'clean_text': '干净文本行',
            }, (v) {
              params.dewarpMethod = v;
              onParamsChanged();
            }),
            _dropdownRow('横向光照', params.illuminationUniformity, const {
              'normal': '一般',
              'uneven': '不均匀 (一边暗)',
              'uniform': '均匀',
            }, (v) {
              params.illuminationUniformity = v;
              onParamsChanged();
            }),
          ]),
      ],
    );
  }

  Widget _buildStep3Color() {
    final isBleach = params.illuminationMode == 'bw_text' && params.colorDepth == 'gray16';
    final isBw200 = params.colorDepth == 'bw' && params.scalePercent >= 199.0;
    final isRedSeal = params.illuminationMode == 'bw_red_seal';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _groupBox('快速匹配 & 预设管理', [
          SizedBox(
            width: double.infinity,
            height: 28,
            child: OutlinedButton.icon(
              onPressed: pageCount == 0 ? null : onAutoAnalyze,
              style: OutlinedButton.styleFrom(
                backgroundColor: theme.activeBg.withValues(alpha: 0.55),
                foregroundColor: theme.accent,
                side: BorderSide(color: theme.accent),
                padding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
              ),
              icon: const Icon(Icons.auto_fix_high, size: 14),
              label: const Text('智能分析清晰度并匹配参数', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              _presetChip('白底黑字', isBleach, () {
                params.applyStep3From(EnhanceParams.phoneBookBleach());
                onParamsChanged();
              }),
              const SizedBox(width: 4),
              _presetChip('200%黑白', isBw200, () {
                params.applyStep3From(EnhanceParams.bwWolfSharp());
                onParamsChanged();
              }),
              const SizedBox(width: 4),
              _presetChip('保留红章', isRedSeal, () {
                params.applyStep3From(EnhanceParams.bwWithRedSeal());
                onParamsChanged();
              }),
              const SizedBox(width: 4),
              _presetChip('重置本步', false, () {
                params.resetStep3();
                onParamsChanged();
              }),
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 26,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: null,
                      hint: Text(
                        userPresets.isEmpty ? '我的配置 (暂无)' : '加载我的配置 (${userPresets.length})',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF374151)),
                      ),
                      isExpanded: true,
                      isDense: true,
                      dropdownColor: Colors.white,
                      items: userPresets.entries
                          .map((e) => DropdownMenuItem<String>(
                                value: e.key,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(e.key,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 11.5, color: Color(0xFF111827))),
                                    ),
                                    GestureDetector(
                                      onTap: () => onDeleteUserPreset(e.key),
                                      child: const Icon(Icons.delete_outline, size: 14, color: Colors.redAccent),
                                    ),
                                  ],
                                ),
                              ))
                          .toList(),
                      onChanged: (name) {
                        if (name != null && userPresets.containsKey(name)) {
                          onApplyPreset(userPresets[name]!.clone());
                        }
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              _miniBtn('保存配置', onSaveUserPreset),
            ],
          ),
        ]),

        _groupBox('尺寸缩放 (二值化前放大 ≥200%)', [
          Row(
            children: [
              Expanded(
                child: _sliderRow('缩放比例', params.scalePercent, 25, 400, (v) {
                  params.scalePercent = v;
                  onParamsChanged();
                }, format: (v) => '${v.round()}%'),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 88,
                child: _compactDropdown(params.scaleFilter, const {
                  'lanczos3': 'Lanczos3',
                  'catmull_rom': '双三次',
                  'triangle': '双线性',
                }, (v) {
                  params.scaleFilter = v;
                  onParamsChanged();
                }),
              ),
            ],
          ),
          Row(
            children: [
              for (final p in [100, 150, 200, 300]) ...[
                Expanded(
                  child: _miniBtn('$p%', () {
                    params.scalePercent = p.toDouble();
                    onParamsChanged();
                  }, active: params.scalePercent.round() == p),
                ),
                if (p != 300) const SizedBox(width: 4),
              ],
            ],
          ),
        ]),

        _groupBox('照度去阴影 & 平滑曲线 / 色阶', [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: _compactDropdown(params.illuminationMode, const {
                  'none': '照度修正: 关闭',
                  'bw_text': '黑白文字(手机拍书)',
                  'bw_red_seal': '黑白文字+红章',
                  'illumination_fix': '曲面照度修正',
                  'fast_fix': '快速照度修正',
                  'retinex': 'Retinex 归一',
                }, (v) {
                  params.illuminationMode = v;
                  if (v != 'none' && params.shadowRemoveStrength == 0) {
                    params.shadowRemoveStrength = 80;
                  }
                  onParamsChanged();
                }),
              ),
              if (params.illuminationMode != 'none') ...[
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: _sliderRow('强度', params.shadowRemoveStrength, 0, 100, (v) {
                    params.shadowRemoveStrength = v;
                    onParamsChanged();
                  }),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          HistogramCurveWidget(
            histogram: histogram,
            darkX: params.curveDarkX,
            darkY: params.curveDarkY,
            lightX: params.curveLightX,
            lightY: params.curveLightY,
            accentColor: theme.accent,
            onCurveChanged: (dx, dy, lx, ly) {
              params.curveDarkX = dx;
              params.curveDarkY = dy;
              params.curveLightX = lx;
              params.curveLightY = ly;
              onParamsChanged();
            },
          ),
          const SizedBox(height: 4),
          _twoCol(
            _sliderRow('色阶黑场', params.levelsBlack.toDouble(), 0, 180, (v) {
              params.levelsBlack = v.round();
              onParamsChanged();
            }),
            _sliderRow('色阶白场', params.levelsWhite.toDouble(), 80, 255, (v) {
              params.levelsWhite = v.round();
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('色阶灰调', params.levelsMid, 0.3, 2.5, (v) {
              params.levelsMid = v;
              onParamsChanged();
            }, format: (v) => v.toStringAsFixed(2)),
            _sliderRow('强力去背景', params.strongBgScreen, 0, 100, (v) {
              params.strongBgScreen = v;
              onParamsChanged();
            }),
          ),
        ]),

        _expertDrawer('色彩减色 & 纯黑白二值化净化 (CEP)', [
          _dropdownRow('输出色彩/减色', params.colorDepth, const {
            'keep': '保持原样',
            'color24': '24位真彩',
            'gray256': '256级灰度',
            'gray16': '16级灰度 (省体积)',
            'gray8': '8级灰度',
            'gray4': '4级灰度',
            'bw': '纯黑白 (二值化)',
          }, (v) {
            params.colorDepth = v;
            onParamsChanged();
          }),
          if (params.colorDepth == 'bw') ...[
            _dropdownRow('二值化算法', params.binarizeMethod, const {
              'wolf': 'Wolf 局部自适应',
              'otsu': 'Otsu 全局阈值',
              'fixed': '固定阈值(128)',
            }, (v) {
              params.binarizeMethod = v;
              onParamsChanged();
            }),
            _twoCol(
              _sliderRow('Wolf 窗口', params.wolfWindow.toDouble(), 9, 65, (v) {
                params.wolfWindow = v.round();
                onParamsChanged();
              }),
              _sliderRow('去斑直径', params.despeckleSize.toDouble(), 0, 12, (v) {
                params.despeckleSize = v.round();
                onParamsChanged();
              }),
            ),
            _twoCol(
              _switchRow('去边缘黑区', params.removeEdgeBlack, (v) {
                params.removeEdgeBlack = v;
                onParamsChanged();
              }),
              _switchRow('边缘去毛刺', params.deburr, (v) {
                params.deburr = v;
                onParamsChanged();
              }),
            ),
            _switchRow('去除竖线/波浪线', params.removeLinesEnabled, (v) {
              params.removeLinesEnabled = v;
              onParamsChanged();
            }),
            if (params.removeLinesEnabled)
              _twoCol(
                _sliderRow('最大线宽', params.removeLineMaxW.toDouble(), 3, 40, (v) {
                  params.removeLineMaxW = v.round();
                  onParamsChanged();
                }),
                _sliderRow('最大线高', params.removeLineMaxH.toDouble(), 30, 500, (v) {
                  params.removeLineMaxH = v.round();
                  onParamsChanged();
                }),
              ),
          ],
          if (params.colorDepth.startsWith('gray'))
            _switchRow('Floyd-Steinberg 抖动', params.dither, (v) {
              params.dither = v;
              onParamsChanged();
            }),
        ]),

        _groupBox('基础与光线微调', [
          _twoCol(
            _sliderRow('亮度', params.brightness, 20, 180, (v) {
              params.brightness = v;
              onParamsChanged();
            }),
            _sliderRow('对比度', params.contrast, 20, 180, (v) {
              params.contrast = v;
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('Gamma', params.gamma, 30, 250, (v) {
              params.gamma = v;
              onParamsChanged();
            }),
            _sliderRow('自然饱和度', params.vibrance, -100, 100, (v) {
              params.vibrance = v;
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('高亮度', params.highlightBoost, 50, 180, (v) {
              params.highlightBoost = v;
              onParamsChanged();
            }),
            _sliderRow('高亮阈值', params.highlightThreshold.toDouble(), 140, 250, (v) {
              params.highlightThreshold = v.round();
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('光线·阴影', params.lightShadows, -100, 100, (v) {
              params.lightShadows = v;
              onParamsChanged();
            }),
            _sliderRow('光线·高光', params.lightHighlights, -100, 100, (v) {
              params.lightHighlights = v;
              onParamsChanged();
            }),
          ),
        ]),

        _expertDrawer('自动校正 / 通道 / 去水印 (CEP)', [
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              _miniToggle('自动白平衡', params.autoWhiteBalance, (v) {
                params.autoWhiteBalance = v;
                onParamsChanged();
              }),
              _miniToggle('自动色阶', params.autoLevels, (v) {
                params.autoLevels = v;
                onParamsChanged();
              }),
              _miniToggle('自动对比度', params.autoContrast, (v) {
                params.autoContrast = v;
                onParamsChanged();
              }),
              _miniToggle('自动漂白', params.autoBleach, (v) {
                params.autoBleach = v;
                onParamsChanged();
              }),
              _miniToggle('后处理直方图', params.postProcessHist, (v) {
                params.postProcessHist = v;
                onParamsChanged();
              }),
              _miniToggle('反白', params.invertColors, (v) {
                params.invertColors = v;
                onParamsChanged();
              }),
            ],
          ),
          const SizedBox(height: 6),
          _dropdownRow('通道混合转灰度', params.channelMix, const {
            'none': '关闭',
            'bt601': 'BT.601 标准灰度',
            'bt709': 'BT.709 高清灰度',
            'sepia_bleach': '乌贼漂白 (去黄纸)',
            'red': '红通道',
            'green': '绿通道',
            'blue': '蓝通道',
          }, (v) {
            params.channelMix = v;
            onParamsChanged();
          }),
          _switchRow('去除页边手指/肤色阴影', params.removeMarginFingers, (v) {
            params.removeMarginFingers = v;
            onParamsChanged();
          }),
          _switchRow('颜色替换 (去红/蓝印章水印)', params.colorReplaceEnabled, (v) {
            params.colorReplaceEnabled = v;
            onParamsChanged();
          }),
          if (params.colorReplaceEnabled)
            _sliderRow('替换容差', params.colorReplaceTolerance.toDouble(), 5, 100, (v) {
              params.colorReplaceTolerance = v.round();
              onParamsChanged();
            }),
        ]),

        _expertDrawer('锐化 / 模糊 / 笔画形态学 (CEP)', [
          _twoCol(
            _sliderRow('USM 数量', params.usmAmount, 0, 180, (v) {
              params.usmAmount = v;
              onParamsChanged();
            }),
            _sliderRow('USM 半径', params.usmRadius, 0.5, 4.0, (v) {
              params.usmRadius = v;
              onParamsChanged();
            }, format: (v) => v.toStringAsFixed(1)),
          ),
          _twoCol(
            _sliderRow('USM 阈值', params.usmThreshold.toDouble(), 0, 30, (v) {
              params.usmThreshold = v.round();
              onParamsChanged();
            }),
            _sliderRow('USM 遍数', params.usmPasses.toDouble(), 1, 3, (v) {
              params.usmPasses = v.round();
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('多尺度细节', params.multiScaleDetail, 0, 100, (v) {
              params.multiScaleDetail = v;
              onParamsChanged();
            }),
            _sliderRow('高斯模糊', params.gaussianBlurRadius, 0, 4.0, (v) {
              params.gaussianBlurRadius = v;
              onParamsChanged();
            }, format: (v) => v.toStringAsFixed(1)),
          ),
          _twoCol(
            _sliderRow('表面模糊半径', params.surfaceBlurRadius.toDouble(), 0, 6, (v) {
              params.surfaceBlurRadius = v.round();
              onParamsChanged();
            }),
            _sliderRow('表面模糊阈值', params.surfaceBlurThreshold.toDouble(), 5, 60, (v) {
              params.surfaceBlurThreshold = v.round();
              onParamsChanged();
            }),
          ),
          _dropdownRow('笔画形态学', params.morphOp, const {
            'none': '无',
            'bold': '加粗 (细字增强)',
            'thin': '变细',
            'open': '开运算 (去噪点)',
            'close': '闭运算 (补断笔)',
          }, (v) {
            params.morphOp = v;
            onParamsChanged();
          }),
        ]),
      ],
    );
  }

  Widget _buildStep4Export() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _groupBox('黑白/漂白后多网格逐行拉直 (专治弯曲文字行)', [
          _switchRow('启用多网格逐行曲线展平', params.lineGridDewarp, (v) {
            params.lineGridDewarp = v;
            onParamsChanged();
          }),
          const Text(
            '说明：在 Step 3 转黑白/漂白之后，通过行粘连与 IRLS 三次曲线拟合生成 32×48 逐列插值网格，自动兼顾整页纠斜与弧形文字行拉直。',
            style: TextStyle(fontSize: 10.5, color: Color(0xFF6B7280)),
          ),
        ]),
        _groupBox('插图自动提取 & 底图输出格式', [
          _switchRow('自动提取插图 (原彩/灰度覆盖于底图之上)', params.extractIllustrations, (v) {
            params.extractIllustrations = v;
            onParamsChanged();
          }),
          if (params.extractIllustrations)
            _switchRow('过滤页眉页脚及小装饰花边', params.filterSmallOrnaments, (v) {
              params.filterSmallOrnaments = v;
              onParamsChanged();
            }),
          _dropdownRow('PDF 底图输出格式', params.exportFormat, const {
            'jpg': 'JPG 高压缩 (默认)',
            'png_lossless': 'PNG 无损编码',
            'tiff_lossless': 'TIFF 无损黑白 (1-bit)',
            'vector': '矢量文字路径 (仅纯黑白)',
          }, (v) {
            params.exportFormat = v;
            onParamsChanged();
          }),
          const Text(
            '说明：提取出的插图会随前 4 步同步形变，永远保留原彩/灰度光栅贴片覆盖于上方（不会二值化或矢量化）。',
            style: TextStyle(fontSize: 10.5, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: layoutAiAvailable ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(
                color: layoutAiAvailable ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
              ),
            ),
            child: Text(
              layoutAiAvailable
                  ? '当前识别引擎：PP-DocLayoutV3 (AI 版面分析模型 · 已就绪)'
                  : '当前识别引擎：传统视觉启发式算法（效果较一般，易误判偏灰正文；如需更好效果，请到顶部「设置 → AI 模型目录」指定 pp_doc_layoutv3.onnx 所在文件夹）',
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                color: layoutAiAvailable ? const Color(0xFF065F46) : const Color(0xFF92400E),
              ),
            ),
          ),
        ]),
        _groupBox('版心与页面排版', [
          _dropdownRow('目标开本 / 尺寸', params.pagePreset, const {
            'original': '保持原图尺寸',
            'content_only': '仅内容框 (无边距)',
            'a4': 'A4 (210×297 mm)',
            'b5': 'B5 (176×250 mm)',
            '16k': '16开 (185×260 mm)',
            '32k': '32开 (130×184 mm)',
            'ebook43': '电子书 4:3 阅读器',
          }, (v) {
            params.pagePreset = v;
            onParamsChanged();
          }),
          _twoCol(
            _sliderRow('左右边距(mm)', params.marginLrMm, 0, 30, (v) {
              params.marginLrMm = v;
              onParamsChanged();
            }),
            _sliderRow('上下边距(mm)', params.marginTbMm, 0, 30, (v) {
              params.marginTbMm = v;
              onParamsChanged();
            }),
          ),
          _twoCol(
            _sliderRow('输出 DPI', params.targetDpi.toDouble(), 150, 600, (v) {
              params.targetDpi = v.round();
              onParamsChanged();
            }),
            _sliderRow('PDF JPEG 质量', params.jpegQuality.toDouble(), 40, 100, (v) {
              params.jpegQuality = v.round();
              onParamsChanged();
            }),
          ),
          _dropdownRow('内容框对齐', params.alignMode, const {
            'center': '居中对齐',
            'top_center': '顶部居中',
          }, (v) {
            params.alignMode = v;
            onParamsChanged();
          }),
          _switchRow('混编书自动黑白分流', params.mixedBookAutoBw, (v) {
            params.mixedBookAutoBw = v;
            onParamsChanged();
          }),
        ]),
      ],
    );
  }

  Widget _groupBox(String title, List<Widget> children) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: const Color(0xFFD0D7DE)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF0F172A))),
            const SizedBox(height: 6),
            ...children,
          ],
        ),
      );

  Widget _twoCol(Widget left, Widget right) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: left),
          const SizedBox(width: 8),
          Expanded(child: right),
        ],
      );

  Widget _presetChip(String title, bool primary, VoidCallback onTap) => Expanded(
        child: InkWell(
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 5),
            decoration: BoxDecoration(
              color: primary ? theme.activeBg : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: primary ? theme.accent : const Color(0xFFCBD5E1)),
            ),
            child: Text(title, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
          ),
        ),
      );

  Widget _miniBtn(String label, VoidCallback onTap, {bool active = false}) => InkWell(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: active ? theme.activeBg : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: active ? theme.accent : const Color(0xFFCBD5E1)),
          ),
          child: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
        ),
      );

  Widget _miniToggle(String label, bool val, void Function(bool) onChanged) => FilterChip(
        label: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF111827))),
        selected: val,
        visualDensity: VisualDensity.compact,
        padding: EdgeInsets.zero,
        selectedColor: theme.activeBg,
        backgroundColor: const Color(0xFFF8FAFC),
        side: BorderSide(color: val ? theme.accent : const Color(0xFFCBD5E1)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        onSelected: onChanged,
      );

  Widget _switchRow(String label, bool val, void Function(bool) onChanged) => SizedBox(
        height: 28,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontSize: 11.5, color: Color(0xFF1F2937)))),
            Transform.scale(
              scale: 0.78,
              child: Switch(value: val, onChanged: onChanged, activeThumbColor: theme.accent),
            ),
          ],
        ),
      );

  Widget _sliderRow(
    String label,
    double val,
    double min,
    double max,
    void Function(double) onChanged, {
    String Function(double)? format,
  }) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF374151))),
              Text(
                format != null ? format(val) : val.toStringAsFixed(0),
                style: const TextStyle(fontSize: 10.5, color: Color(0xFF6B7280)),
              ),
            ],
          ),
          SizedBox(
            height: 20,
            child: SliderTheme(
              data: SliderThemeData(
                trackHeight: 2.5,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
                activeTrackColor: theme.accent,
                inactiveTrackColor: const Color(0xFFD1D5DB),
                thumbColor: theme.accent,
              ),
              child: Slider(value: val.clamp(min, max), min: min, max: max, onChanged: onChanged),
            ),
          ),
        ],
      );

  Widget _compactDropdown(String value, Map<String, String> items, void Function(String) onChanged) => Container(
        height: 26,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: const Color(0xFFCBD5E1)),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: items.containsKey(value) ? value : items.keys.first,
            isExpanded: true,
            isDense: true,
            dropdownColor: Colors.white,
            style: const TextStyle(fontSize: 11, color: Color(0xFF111827)),
            items: items.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ),
      );

  Widget _dropdownRow(
    String label,
    String value,
    Map<String, String> items,
    void Function(String) onChanged,
  ) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Expanded(flex: 4, child: Text(label, style: const TextStyle(fontSize: 11.5, color: Color(0xFF1F2937)))),
            Expanded(flex: 5, child: _compactDropdown(value, items, onChanged)),
          ],
        ),
      );

  Widget _expertDrawer(String title, List<Widget> children) => Container(
        margin: const EdgeInsets.only(bottom: 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: const Color(0xFFD0D7DE)),
        ),
        child: Material(
          color: Colors.transparent,
          child: Theme(
            data: ThemeData.light().copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              initiallyExpanded: expertExpandedByDefault,
              tilePadding: const EdgeInsets.symmetric(horizontal: 8),
              childrenPadding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              dense: true,
              visualDensity: VisualDensity.compact,
              title: Text(title, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: Color(0xFF374151))),
              children: children,
            ),
          ),
        ),
      );
}
