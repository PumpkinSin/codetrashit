import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/engine_process.dart';
import '../theme.dart';

class KeywordsCard extends StatefulWidget {
  const KeywordsCard({super.key});

  @override
  State<KeywordsCard> createState() => _KeywordsCardState();
}

class _KeywordsCardState extends State<KeywordsCard> {
  final TextEditingController _controller = TextEditingController();
  List<String> _keywords = [];
  bool _bilibiliVideoOnly = false;

  @override
  void initState() {
    super.initState();
    _fetchConfig();
  }

  Future<void> _fetchConfig() async {
    final mgr = context.read<EngineManager>();
    final cfg = await mgr.api.getConfig();
    if (mounted && cfg != null) {
      final list = (cfg['bilibili_keywords'] as List<dynamic>?) ?? [];
      setState(() {
        _keywords = list.map((k) => k.toString()).toList();
        _bilibiliVideoOnly = cfg['bilibili_video_only'] == true;
      });
    }
  }

  Future<void> _toggleVideoOnly(bool value) async {
    final prev = _bilibiliVideoOnly;
    setState(() {
      _bilibiliVideoOnly = value;
    });
    final mgr = context.read<EngineManager>();
    final ok = await mgr.api.updateSettings(bilibiliVideoOnly: value);
    if (ok) {
      mgr.log(value ? '✅ 已开启: B站不推送视频外动态' : '✅ 已关闭: B站不推送视频外动态');
    } else {
      if (mounted) {
        setState(() {
          _bilibiliVideoOnly = prev;
        });
      }
      mgr.log('❌ 保存设置失败: 无法连接引擎');
    }
  }

  Future<void> _addKeyword() async {
    final word = _controller.text.trim();
    if (word.isEmpty) return;
    final mgr = context.read<EngineManager>();
    final newKws = await mgr.api.modifyKeyword('add', word);
    _controller.clear();
    setState(() {
      _keywords = newKws;
    });
    mgr.log('✅ 已添加屏蔽词: $word');
  }

  Future<void> _removeKeyword(String word) async {
    final mgr = context.read<EngineManager>();
    final newKws = await mgr.api.modifyKeyword('remove', word);
    setState(() {
      _keywords = newKws;
    });
    mgr.log('✅ 已移除屏蔽词: $word');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
          // Bilibili Push Settings
          const Text(
            '⚙️  B站动态设置',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppColors.accentLight,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'B站不推送视频外动态',
                        style: TextStyle(fontSize: 13, color: AppColors.text, fontWeight: FontWeight.w500),
                      ),
                      SizedBox(height: 2),
                      Text(
                        '开启后仅抓取并推送 B 站视频投稿，过滤图文、转发、专栏等非视频动态',
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: _bilibiliVideoOnly,
                  activeThumbColor: AppColors.accentLight,
                  activeTrackColor: AppColors.accent.withValues(alpha: 0.5),
                  onChanged: _toggleVideoOnly,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Title
          const Text(
            '🚫  B站屏蔽词（仅屏蔽图文/动态，不影响视频，不区分大小写）',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppColors.accentLight,
            ),
          ),
          const SizedBox(height: 10),

          // Input Row
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 34,
                  child: TextField(
                    controller: _controller,
                    style: const TextStyle(fontSize: 13, color: AppColors.text),
                    decoration: InputDecoration(
                      hintText: '输入屏蔽词，按回车或点击添加...',
                      hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                      filled: true,
                      fillColor: AppColors.surface2,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(4),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onSubmitted: (_) => _addKeyword(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                icon: const Icon(Icons.add, size: 16),
                label: const Text('添加'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: _addKeyword,
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Keywords Chips Container
          Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 50, maxHeight: 120),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(6),
            ),
            child: SingleChildScrollView(
              child: _keywords.isEmpty
                  ? const Text(
                      '暂无屏蔽词',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                    )
                  : Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: _keywords.map((kw) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.bgHeader,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                kw,
                                style: const TextStyle(fontSize: 12, color: AppColors.text),
                              ),
                              const SizedBox(width: 4),
                              InkWell(
                                onTap: () => _removeKeyword(kw),
                                child: const Icon(
                                  Icons.close,
                                  size: 14,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
