import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/engine_process.dart';
import '../theme.dart';
import 'log_console.dart';

class ServiceControlCard extends StatelessWidget {
  const ServiceControlCard({super.key});

  @override
  Widget build(BuildContext context) {
    final mgr = context.watch<EngineManager>();
    final isRunning = mgr.isRunning;
    final uptime = mgr.status?.uptime ?? 0;

    final hours = (uptime ~/ 3600).toString().padLeft(2, '0');
    final minutes = ((uptime % 3600) ~/ 60).toString().padLeft(2, '0');
    final seconds = (uptime % 60).toString().padLeft(2, '0');
    final uptimeStr = '$hours:$minutes:$seconds';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.04)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          const Text(
            '▶  服务控制',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppColors.accentLight,
            ),
          ),
          const SizedBox(height: 10),

          // Checkboxes Row
          Wrap(
            spacing: 16,
            runSpacing: 4,
            children: [
              _buildCheckbox(
                '启动时自动运行服务',
                mgr.prefs.autoStart,
                (v) {
                  mgr.prefs.autoStart = v ?? false;
                  mgr.savePrefs();
                },
              ),
              _buildCheckbox(
                '退出时保持服务运行',
                mgr.prefs.keepServer,
                (v) {
                  mgr.prefs.keepServer = v ?? false;
                  mgr.savePrefs();
                },
              ),
              _buildCheckbox(
                '最小化不显示托盘 (完全隐藏)',
                mgr.prefs.noTray,
                (v) {
                  mgr.prefs.noTray = v ?? false;
                  mgr.savePrefs();
                },
                tooltip: '默认未勾选：最小化会从任务栏消失并缩小到右下角托盘；若勾选：最小化将彻底隐藏，不在托盘显示',
              ),
              _buildCheckbox(
                '启动时静默到托盘',
                mgr.prefs.startMinimized,
                (v) {
                  mgr.prefs.startMinimized = v ?? false;
                  mgr.savePrefs();
                },
                tooltip: '开机或启动本程序时，直接最小化到系统托盘，不弹出主窗口',
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Status & Action Buttons Row
          Row(
            children: [
              const Text('状态  ', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isRunning ? AppColors.green : AppColors.red,
                  boxShadow: [
                    if (isRunning)
                      BoxShadow(
                        color: AppColors.green.withValues(alpha: 0.5),
                        blurRadius: 6,
                        spreadRadius: 1,
                      )
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                isRunning ? '运行中 | $uptimeStr' : '已停止',
                style: TextStyle(
                  color: isRunning ? AppColors.green : AppColors.red,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              // Buttons
              ElevatedButton.icon(
                icon: const Icon(Icons.play_arrow, size: 16),
                label: const Text('启动服务'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: isRunning ? null : () => mgr.startEngine(),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                icon: const Icon(Icons.stop, size: 16),
                label: const Text('停止服务'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF374151),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: !isRunning ? null : () => mgr.stopEngine(),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('手动抓取'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.text,
                  side: const BorderSide(color: Color(0xFF4B5563)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                onPressed: !isRunning
                    ? null
                    : () async {
                        mgr.log('正在触发手动全量抓取...');
                        final ok = await mgr.api.manualFetch();
                        if (ok) {
                          mgr.log('✅ 手动抓取指令已发送');
                        } else {
                          mgr.log('❌ 手动抓取触发失败');
                        }
                      },
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.cloud_upload_outlined, size: 16),
                label: const Text('同步 R2'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.text,
                  side: const BorderSide(color: Color(0xFF4B5563)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                onPressed: !isRunning
                    ? null
                    : () async {
                        mgr.log('正在触发手动 R2 同步...');
                        final ok = await mgr.api.manualSync();
                        if (ok) {
                          mgr.log('✅ 手动同步完成');
                        } else {
                          mgr.log('❌ 同步失败');
                        }
                      },
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Log console
          SizedBox(
            height: 160,
            child: LogConsole(
              logs: mgr.logs,
              onClear: mgr.clearLogs,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckbox(String label, bool value, ValueChanged<bool?> onChanged, {String? tooltip}) {
    final row = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 24,
          width: 24,
          child: Checkbox(
            value: value,
            activeColor: AppColors.accent,
            checkColor: Colors.white,
            side: const BorderSide(color: AppColors.textMuted, width: 1.5),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
            onChanged: onChanged,
          ),
        ),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
      ],
    );
    if (tooltip != null) {
      return Tooltip(
        message: tooltip,
        textStyle: const TextStyle(fontSize: 12, color: Colors.white),
        decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(4)),
        child: row,
      );
    }
    return row;
  }
}
