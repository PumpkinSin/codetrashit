import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme.dart';

class LogConsole extends StatefulWidget {
  final List<String> logs;
  final VoidCallback onClear;

  const LogConsole({super.key, required this.logs, required this.onClear});

  @override
  State<LogConsole> createState() => _LogConsoleState();
}

class _LogConsoleState extends State<LogConsole> {
  final ScrollController _scrollController = ScrollController();
  bool _autoScroll = true;

  @override
  void didUpdateWidget(covariant LogConsole oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_autoScroll && widget.logs.length != oldWidget.logs.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 100),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.logBg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '服务日志',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Row(
                children: [
                  IconButton(
                    icon: Icon(
                      _autoScroll ? Icons.arrow_downward : Icons.pause,
                      size: 14,
                      color: _autoScroll ? AppColors.green : AppColors.textMuted,
                    ),
                    tooltip: _autoScroll ? '自动滚动已开启' : '自动滚动已暂停',
                    onPressed: () {
                      setState(() {
                        _autoScroll = !_autoScroll;
                      });
                    },
                    visualDensity: VisualDensity.compact,
                  ),
                  IconButton(
                    icon: const Icon(Icons.copy, size: 14, color: AppColors.textMuted),
                    tooltip: '复制所有日志',
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: widget.logs.join('\n')));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('日志已复制到剪贴板'), duration: Duration(seconds: 1)),
                      );
                    },
                    visualDensity: VisualDensity.compact,
                  ),
                  IconButton(
                    icon: const Icon(Icons.clear_all, size: 14, color: AppColors.textMuted),
                    tooltip: '清空日志',
                    onPressed: widget.onClear,
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),
          Expanded(
            child: widget.logs.isEmpty
                ? const Center(
                    child: Text(
                      '暂无运行日志...',
                      style: TextStyle(color: Colors.white24, fontSize: 12, fontFamily: 'Consolas'),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    itemCount: widget.logs.length,
                    itemBuilder: (context, index) {
                      final line = widget.logs[index];
                      Color textColor = AppColors.logText;
                      if (line.contains('❌') || line.contains('ERR') || line.contains('错误') || line.contains('失败')) {
                        textColor = AppColors.red;
                      } else if (line.contains('✅') || line.contains('成功')) {
                        textColor = AppColors.green;
                      } else if (line.contains('⚠')) {
                        textColor = Colors.amber;
                      }

                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 1),
                        child: SelectableText(
                          line,
                          style: TextStyle(
                            fontFamily: 'Consolas',
                            fontSize: 11.5,
                            color: textColor,
                            height: 1.25,
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
}
