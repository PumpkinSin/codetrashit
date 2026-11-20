import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/engine_process.dart';
import 'theme.dart';
import 'components/service_control_card.dart';
import 'components/cookie_management_card.dart';
import 'components/keywords_card.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  void _showFeedsDialog(BuildContext context, EngineManager mgr) {
    final status = mgr.status;
    final counts = status?.dataCounts ?? {};

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('📡 RSS 订阅源与数据预览', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: SizedBox(
          width: 480,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildFeedRow(ctx, '📺 B站关注动态', 'http://localhost:3457/api/feed/bilibili', counts['bilibili'] ?? 0),
              const Divider(color: Colors.white12),
              _buildFeedRow(ctx, '📺 B站小号视频', 'http://localhost:3457/api/feed/bilibili-alt', counts['bilibili-alt'] ?? 0),
              const Divider(color: Colors.white12),
              _buildFeedRow(ctx, '💬 知乎关注动态', 'http://localhost:3457/api/feed/zhihu', counts['zhihu'] ?? 0),
              const Divider(color: Colors.white12),
              _buildFeedRow(ctx, '📖 豆瓣关注广播', 'http://localhost:3457/api/feed/douban', counts['douban'] ?? 0),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('关闭', style: TextStyle(color: AppColors.accentLight)),
          ),
        ],
      ),
    );
  }

  Widget _buildFeedRow(BuildContext context, String title, String url, int count) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.text)),
                const SizedBox(height: 2),
                Text('本地数据: $count 条', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
              ],
            ),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accentLight,
              side: const BorderSide(color: AppColors.accent),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              visualDensity: VisualDensity.compact,
            ),
            onPressed: () {
              launchUrl(Uri.parse(url));
            },
            child: const Text('在浏览器中预览', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mgr = context.watch<EngineManager>();
    final counts = mgr.status?.dataCounts ?? {};

    return Scaffold(
      body: Column(
        children: [
          // Header Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            color: AppColors.bgHeader,
            child: Row(
              children: [
                const Text(
                  '📡  RSS 动态服务管理',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.text,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                  ),
                  child: const Text(
                    'Flutter + Rust',
                    style: TextStyle(fontSize: 10, color: AppColors.accentLight, fontWeight: FontWeight.bold),
                  ),
                ),
                const Spacer(),
                // Platform count chips
                if (counts.isNotEmpty) ...[
                  _buildStatBadge('B站', counts['bilibili'] ?? 0),
                  const SizedBox(width: 8),
                  _buildStatBadge('知乎', counts['zhihu'] ?? 0),
                  const SizedBox(width: 8),
                  _buildStatBadge('豆瓣', counts['douban'] ?? 0),
                  const SizedBox(width: 14),
                ],
                ElevatedButton.icon(
                  icon: const Icon(Icons.rss_feed, size: 14),
                  label: const Text('订阅源预览'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () => _showFeedsDialog(context, mgr),
                ),
              ],
            ),
          ),

          // Main Tabbed Body
          Expanded(
            child: DefaultTabController(
              length: 3,
              child: Column(
                children: [
                  // Tab Bar
                  Container(
                    margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.04)),
                    ),
                    child: TabBar(
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicator: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.accent.withValues(alpha: 0.5)),
                      ),
                      dividerColor: Colors.transparent,
                      labelColor: AppColors.text,
                      unselectedLabelColor: AppColors.textMuted,
                      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      unselectedLabelStyle: const TextStyle(fontSize: 13),
                      padding: const EdgeInsets.all(4),
                      tabs: const [
                        Tab(
                          height: 38,
                          icon: Icon(Icons.settings_power, size: 16),
                          text: '服务控制',
                        ),
                        Tab(
                          height: 38,
                          icon: Icon(Icons.key, size: 16),
                          text: 'Cookie 管理',
                        ),
                        Tab(
                          height: 38,
                          icon: Icon(Icons.block, size: 16),
                          text: '屏蔽词',
                        ),
                      ],
                    ),
                  ),

                  // Tab Content
                  const Expanded(
                    child: TabBarView(
                      children: [
                        SingleChildScrollView(
                          padding: EdgeInsets.all(12),
                          child: ServiceControlCard(),
                        ),
                        SingleChildScrollView(
                          padding: EdgeInsets.all(12),
                          child: CookieManagementCard(),
                        ),
                        SingleChildScrollView(
                          padding: EdgeInsets.all(12),
                          child: KeywordsCard(),
                        ),
                      ],
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

  Widget _buildStatBadge(String name, int count) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '$name: $count',
        style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
      ),
    );
  }
}
