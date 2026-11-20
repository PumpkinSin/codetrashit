import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/app_state.dart';
import '../../services/engine_process.dart';
import '../theme.dart';

/// 一个可选的「浏览器 + Profile」组合
class _BrowserChoice {
  final BrowserInfo browser;
  final BrowserProfileInfo profile;

  const _BrowserChoice(this.browser, this.profile);

  /// 存入 prefs 用的 key
  String get key => '${browser.name}|${profile.path}';

  String get label => '${browser.name} · ${profile.label}';
}

class CookieManagementCard extends StatefulWidget {
  const CookieManagementCard({super.key});

  @override
  State<CookieManagementCard> createState() => _CookieManagementCardState();
}

class _CookieManagementCardState extends State<CookieManagementCard> {
  BrowserInfo? _selectedBrowser;
  BrowserProfileInfo? _selectedProfile;
  bool _isLoading = false;

  final Map<String, String> _domainNames = {
    'bilibili.com': 'B站 (bilibili.com)',
    'zhihu.com': '知乎 (zhihu.com)',
    'douban.com': '豆瓣 (douban.com)',
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<EngineManager>().loadBrowsers();
    });
  }

  void _syncSelected(EngineManager mgr, List<BrowserInfo> browsers) {
    if (browsers.isEmpty) {
      _selectedBrowser = null;
      _selectedProfile = null;
      return;
    }

    final savedBrowserName = mgr.prefs.selectedBrowser;
    final savedProfilePath = mgr.prefs.selectedProfile;

    BrowserInfo? matched;
    // 1. Try matching currently selected
    if (_selectedBrowser != null) {
      for (final b in browsers) {
        if (b.name == _selectedBrowser!.name) {
          matched = b;
          break;
        }
      }
    }
    // 2. Try matching saved preference
    if (matched == null && savedBrowserName != null) {
      for (final b in browsers) {
        if (b.name.toLowerCase() == savedBrowserName.toLowerCase()) {
          matched = b;
          break;
        }
      }
    }
    // 3. Prefer Zen if available
    if (matched == null) {
      for (final b in browsers) {
        if (b.name.toLowerCase() == 'zen') {
          matched = b;
          break;
        }
      }
    }
    // 4. Default to first browser
    matched ??= browsers.first;
    _selectedBrowser = matched;

    // Match profile
    if (matched.profiles.isNotEmpty) {
      BrowserProfileInfo? pMatched;
      if (_selectedProfile != null) {
        for (final p in matched.profiles) {
          if (p.path == _selectedProfile!.path) {
            pMatched = p;
            break;
          }
        }
      }
      if (pMatched == null && savedProfilePath != null) {
        for (final p in matched.profiles) {
          if (p.path == savedProfilePath || p.label == savedProfilePath) {
            pMatched = p;
            break;
          }
        }
      }
      pMatched ??= matched.profiles.first;
      _selectedProfile = pMatched;
    } else {
      _selectedProfile = null;
    }
  }

  /// 展开所有浏览器 × Profile 组合
  List<_BrowserChoice> _allChoices(List<BrowserInfo> browsers) {
    final list = <_BrowserChoice>[];
    for (final b in browsers) {
      for (final p in b.profiles) {
        list.add(_BrowserChoice(b, p));
      }
    }
    return list;
  }

  /// 解析某平台实际使用的浏览器组合：平台单独设置 > 全局设置
  _BrowserChoice? _resolveChoice(String domain, EngineManager mgr) {
    final browsers = mgr.browsers;
    final prefName = mgr.prefs.platformBrowsers[domain];
    final prefProfile = mgr.prefs.platformProfiles[domain];
    if (prefName != null && prefName.isNotEmpty) {
      for (final b in browsers) {
        if (b.name.toLowerCase() == prefName.toLowerCase()) {
          BrowserProfileInfo? profile;
          if (prefProfile != null) {
            for (final p in b.profiles) {
              if (p.path == prefProfile) {
                profile = p;
                break;
              }
            }
          }
          profile ??= b.profiles.isNotEmpty ? b.profiles.first : null;
          if (profile != null) return _BrowserChoice(b, profile);
        }
      }
    }
    if (_selectedBrowser != null && _selectedProfile != null) {
      return _BrowserChoice(_selectedBrowser!, _selectedProfile!);
    }
    return null;
  }

  Future<void> _readCookies(List<String> domains) async {
    final mgr = context.read<EngineManager>();
    if (!mgr.isRunning) {
      mgr.log('服务未运行，正在自动启动 Rust 引擎...');
      await mgr.startEngine();
      await Future.delayed(const Duration(milliseconds: 1500));
    }

    // 按实际使用的浏览器组合分组，每组一次请求
    final groups = <String, _BrowserChoice>{};
    final domainChoice = <String, _BrowserChoice?>{};
    for (final domain in domains) {
      final choice = _resolveChoice(domain, mgr);
      domainChoice[domain] = choice;
      if (choice != null) {
        groups.putIfAbsent(choice.key, () => choice);
      }
    }

    if (groups.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先选择浏览器和 Profile（如未显示请点击刷新图标）')),
        );
      }
      return;
    }

    setState(() => _isLoading = true);

    for (final entry in groups.entries) {
      final choice = entry.value;
      final groupDomains = domains.where((d) => domainChoice[d]?.key == entry.key).toList();
      mgr.log('正在从 ${choice.browser.name} (${choice.profile.label}) 读取 ${groupDomains.join('、')} 的 Cookie...');

      final res = await mgr.api.extractCookies(
        browserType: choice.browser.browserType,
        profilePath: choice.profile.path,
        domains: groupDomains,
      );

      if (res['success'] == true) {
        final cookies = res['cookies'] as Map<String, dynamic>? ?? {};
        for (final domain in groupDomains) {
          if (cookies.containsKey(domain) && cookies[domain].toString().isNotEmpty) {
            mgr.log('✅ $domain Cookie 提取成功 (${cookies[domain].toString().length} 字符)');
          } else {
            mgr.log('⚠ $domain 未找到 Cookie（可能未在该浏览器登录）');
          }
        }
      } else {
        mgr.log('❌ ${choice.browser.name} 读取失败: ${res['error']}');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${res['error']}'),
              backgroundColor: AppColors.red,
              duration: const Duration(seconds: 4),
            ),
          );
        }
      }
    }

    mgr.log('✅ 读取完成，已写入配置');
    if (mounted) {
      setState(() => _isLoading = false);
    } else {
      _isLoading = false;
    }
  }

  Future<void> _refreshDoubanFollowing(EngineManager mgr) async {
    if (!mgr.isRunning) {
      mgr.log('服务未运行，正在自动启动 Rust 引擎...');
      await mgr.startEngine();
      await Future.delayed(const Duration(milliseconds: 1500));
    }

    setState(() => _isLoading = true);
    mgr.log('正在重新拉取豆瓣关注列表（关注较多时约需十几秒）...');
    final res = await mgr.api.refreshDoubanFollowing();
    if (mounted) {
      setState(() => _isLoading = false);
    } else {
      _isLoading = false;
    }

    if (res['success'] == true) {
      mgr.log('✅ 豆瓣关注列表已刷新，共 ${res['count']} 人（下一轮抓取生效）');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('豆瓣关注列表已刷新，共 ${res['count']} 人'),
            backgroundColor: AppColors.green,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } else {
      mgr.log('❌ 刷新豆瓣关注列表失败: ${res['error']}');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('刷新失败: ${res['error']}'),
            backgroundColor: AppColors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  void _showManualCookieDialog(BuildContext context, String domain, String label) {
    final controller = TextEditingController();
    final mgr = context.read<EngineManager>();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('手动配置 $label Cookie', style: const TextStyle(color: AppColors.text, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '可直接粘贴浏览器开发者工具或抓取的 Cookie 字符串 (B站亦可仅填 SESSDATA=xxx):',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              maxLines: 4,
              style: const TextStyle(color: AppColors.text, fontSize: 12),
              decoration: InputDecoration(
                hintText: '粘贴 Cookie 到这里...',
                hintStyle: const TextStyle(color: AppColors.textMuted),
                filled: true,
                fillColor: AppColors.surface2,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.accent),
            onPressed: () async {
              final text = controller.text.trim();
              if (text.isNotEmpty) {
                final platform = domain.replaceAll('.com', '');
                final ok = await mgr.api.saveCookie(platform: platform, cookie: text);
                if (ok) {
                  mgr.log('✅ 已手动更新 $label Cookie');
                } else {
                  mgr.log('❌ 保存 $label Cookie 失败');
                }
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('保存', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mgr = context.watch<EngineManager>();
    final status = mgr.status;
    final browsers = mgr.browsers;

    _syncSelected(mgr, browsers);

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
          Row(
            children: [
              const Text(
                '🍪  Cookie 管理',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.accentLight,
                ),
              ),
              const Spacer(),
              if (browsers.isEmpty)
                TextButton.icon(
                  icon: const Icon(Icons.refresh, size: 14),
                  label: const Text('扫描浏览器', style: TextStyle(fontSize: 12)),
                  onPressed: () => mgr.loadBrowsers(),
                ),
            ],
          ),
          const SizedBox(height: 10),

          // Default browser and Profile Selector Row
          Row(
            children: [
              const Text('默认浏览器 ', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
              Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface2,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<BrowserInfo>(
                    value: _selectedBrowser,
                    hint: const Text('未检测到浏览器', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    dropdownColor: AppColors.surface2,
                    style: const TextStyle(color: AppColors.text, fontSize: 13),
                    items: browsers.map((b) {
                      return DropdownMenuItem<BrowserInfo>(
                        value: b,
                        child: Text(b.name),
                      );
                    }).toList(),
                    onChanged: (val) {
                      setState(() {
                        _selectedBrowser = val;
                        _selectedProfile = (val != null && val.profiles.isNotEmpty) ? val.profiles.first : null;
                        mgr.prefs.selectedBrowser = val?.name;
                        mgr.prefs.selectedProfile = _selectedProfile?.path;
                        mgr.savePrefs();
                      });
                    },
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 16, color: AppColors.textMuted),
                tooltip: '刷新浏览器列表',
                onPressed: () => mgr.loadBrowsers(),
                splashRadius: 16,
              ),
              const SizedBox(width: 8),
              const Text('Profile ', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
              Container(
                height: 32,
                constraints: const BoxConstraints(maxWidth: 240),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface2,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<BrowserProfileInfo>(
                    value: _selectedProfile,
                    isExpanded: true,
                    hint: const Text('默认', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    dropdownColor: AppColors.surface2,
                    style: const TextStyle(color: AppColors.text, fontSize: 13),
                    items: (_selectedBrowser?.profiles ?? []).map((p) {
                      return DropdownMenuItem<BrowserProfileInfo>(
                        value: p,
                        child: Text(p.label, overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (val) {
                      setState(() {
                        _selectedProfile = val;
                        mgr.prefs.selectedProfile = val?.path;
                        mgr.savePrefs();
                      });
                    },
                  ),
                ),
              ),
              const SizedBox(width: 14),
              ElevatedButton.icon(
                icon: _isLoading
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0F172A)),
                      )
                    : const Icon(Icons.search, size: 16),
                label: const Text('读取并保存'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.green,
                  foregroundColor: const Color(0xFF0F172A),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: _isLoading
                    ? null
                    : () {
                        final active = _domainNames.keys.where((d) => mgr.prefs.platformEnabled[d] == true).toList();
                        _readCookies(active);
                      },
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Auto refresh cookie on failure toggle
          InkWell(
            onTap: () {
              setState(() {
                mgr.prefs.autoRefreshCookie = !mgr.prefs.autoRefreshCookie;
                mgr.savePrefs();
              });
            },
            borderRadius: BorderRadius.circular(4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: mgr.prefs.autoRefreshCookie,
                    activeColor: AppColors.accent,
                    checkColor: const Color(0xFF0F172A),
                    side: const BorderSide(color: AppColors.textMuted),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                    onChanged: (val) {
                      setState(() {
                        mgr.prefs.autoRefreshCookie = val ?? true;
                        mgr.savePrefs();
                      });
                    },
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  '爬取失败或 Cookie 鉴权失效时，自动从浏览器重新提取并重试',
                  style: TextStyle(color: AppColors.text, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Platforms List
          ..._domainNames.entries.map((entry) {
            final domain = entry.key;
            final label = entry.value;
            final isEnabled = mgr.prefs.platformEnabled[domain] ?? true;

            // Check config status from engine
            bool isConfigured = false;
            if (status != null && status.online) {
              if (domain == 'bilibili.com') {
                isConfigured = status.fetchConfig['bilibili'] == true;
              } else if (domain == 'zhihu.com') {
                isConfigured = status.fetchConfig['zhihu'] == true;
              } else if (domain == 'douban.com') {
                isConfigured = status.fetchConfig['douban'] == true;
              }
            }

            final choices = _allChoices(browsers);
            final savedChoiceKey = _resolveChoiceKey(mgr, domain, choices);
            _BrowserChoice? currentChoice;
            for (final c in choices) {
              if (c.key == savedChoiceKey) {
                currentChoice = c;
                break;
              }
            }

            return Container(
              margin: const EdgeInsets.symmetric(vertical: 3),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  Checkbox(
                    value: isEnabled,
                    activeColor: AppColors.accent,
                    checkColor: Colors.white,
                    side: const BorderSide(color: AppColors.textMuted),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                    onChanged: (val) {
                      mgr.prefs.platformEnabled[domain] = val ?? false;
                      mgr.savePrefs();
                    },
                  ),
                  SizedBox(
                    width: 150,
                    child: Text(
                      label,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                        color: isEnabled ? AppColors.text : AppColors.textMuted,
                      ),
                    ),
                  ),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: !isEnabled
                          ? const Color(0xFF555577)
                          : (isConfigured ? AppColors.green : AppColors.red),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    !isEnabled ? '已禁用' : (isConfigured ? '已配置 ✓' : '未配置'),
                    style: TextStyle(
                      fontSize: 12.5,
                      color: !isEnabled
                          ? const Color(0xFF555577)
                          : (isConfigured ? AppColors.green : AppColors.red),
                    ),
                  ),
                  const Spacer(),

                  // Per-platform browser override dropdown
                  Tooltip(
                    message: '此平台单独指定读取 Cookie 的浏览器，默认跟随上方全局设置',
                    textStyle: const TextStyle(fontSize: 12, color: Colors.white),
                    decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(4)),
                    child: Container(
                      height: 30,
                      constraints: const BoxConstraints(maxWidth: 180),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      decoration: BoxDecoration(
                        color: currentChoice != null
                            ? AppColors.accent.withValues(alpha: 0.12)
                            : AppColors.bgHeader,
                        borderRadius: BorderRadius.circular(4),
                        border: currentChoice != null
                            ? Border.all(color: AppColors.accent.withValues(alpha: 0.45))
                            : null,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String?>(
                          value: savedChoiceKey,
                          isExpanded: true,
                          dropdownColor: AppColors.surface2,
                          style: TextStyle(
                            fontSize: 12,
                            color: currentChoice != null ? AppColors.accentLight : AppColors.textMuted,
                          ),
                          icon: const Icon(Icons.arrow_drop_down, size: 16, color: AppColors.textMuted),
                          hint: const Text('跟随默认', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                          items: [
                            const DropdownMenuItem<String?>(
                              value: null,
                              child: Text('跟随默认浏览器', style: TextStyle(fontSize: 12)),
                            ),
                            ...choices.map((c) {
                              return DropdownMenuItem<String?>(
                                value: c.key,
                                child: Text(c.label, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                              );
                            }),
                          ],
                          onChanged: (val) {
                            setState(() {
                              if (val == null) {
                                mgr.prefs.platformBrowsers.remove(domain);
                                mgr.prefs.platformProfiles.remove(domain);
                              } else {
                                final parts = val.split('|');
                                if (parts.length == 2) {
                                  mgr.prefs.platformBrowsers[domain] = parts[0];
                                  mgr.prefs.platformProfiles[domain] = parts[1];
                                }
                              }
                              mgr.savePrefs();
                            });
                          },
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // 豆瓣专属：重新拉取关注列表
                  if (domain == 'douban.com') ...[
                    Tooltip(
                      message: '重新拉取豆瓣关注列表并更新缓存（关注了新人是不会自动生效的，点这里刷新）',
                      textStyle: const TextStyle(fontSize: 12, color: Colors.white),
                      decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(4)),
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.group, size: 14),
                        label: const Text('刷新关注', style: TextStyle(fontSize: 11.5)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textMuted,
                          side: const BorderSide(color: Color(0xFF33334A)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          visualDensity: VisualDensity.compact,
                        ),
                        onPressed: isEnabled && !_isLoading ? () => _refreshDoubanFollowing(mgr) : null,
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textMuted,
                      side: const BorderSide(color: Color(0xFF33334A)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      visualDensity: VisualDensity.compact,
                    ),
                    onPressed: () => _showManualCookieDialog(context, domain, label),
                    child: const Text('手动设置', style: TextStyle(fontSize: 11.5)),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isEnabled ? AppColors.bgHeader : const Color(0xFF2A2A3A),
                      foregroundColor: isEnabled ? Colors.white : AppColors.textMuted,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      visualDensity: VisualDensity.compact,
                    ),
                    onPressed: isEnabled && !_isLoading
                        ? () => _readCookies([domain])
                        : null,
                    child: const Text('单独读取', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 6),
          const Text(
            '※ 每个平台可单独指定浏览器（默认跟随上方全局设置）；读取 Chrome/Edge/Vivaldi 时请确保浏览器已完全关闭（或改用 Zen/Firefox 读取，或点击"手动设置"直接粘贴）',
            style: TextStyle(fontSize: 11.5, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  /// 平台单独设置的原始 key（未做浏览器存在性校验，用于回显下拉框）
  String? _resolveChoiceKey(EngineManager mgr, String domain, List<_BrowserChoice> choices) {
    final name = mgr.prefs.platformBrowsers[domain];
    final profile = mgr.prefs.platformProfiles[domain];
    if (name == null || name.isEmpty) return null;
    if (profile == null || profile.isEmpty) return null;
    for (final c in choices) {
      if (c.key == '$name|$profile') return c.key;
    }
    // 已保存的浏览器/Profile 当前不存在（如已卸载），视为跟随默认
    return null;
  }
}
