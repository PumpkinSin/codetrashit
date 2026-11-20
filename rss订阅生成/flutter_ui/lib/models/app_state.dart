class ServiceStatus {
  final bool online;
  final int uptime;
  final bool r2Configured;
  final bool autoSync;
  final Map<String, bool> fetchConfig;
  final Map<String, int> dataCounts;

  ServiceStatus({
    this.online = false,
    this.uptime = 0,
    this.r2Configured = false,
    this.autoSync = true,
    this.fetchConfig = const {},
    this.dataCounts = const {},
  });

  factory ServiceStatus.fromJson(Map<String, dynamic> json) {
    return ServiceStatus(
      online: json['online'] ?? false,
      uptime: (json['uptime'] as num?)?.toInt() ?? 0,
      r2Configured: json['r2Configured'] ?? false,
      autoSync: json['autoSync'] ?? true,
      fetchConfig: (json['fetch'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, v == true),
          ) ??
          {},
      dataCounts: (json['data'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as num?)?.toInt() ?? 0),
          ) ??
          {},
    );
  }
}

class BrowserProfileInfo {
  final String label;
  final String path;

  BrowserProfileInfo({required this.label, required this.path});

  factory BrowserProfileInfo.fromJson(Map<String, dynamic> json) {
    return BrowserProfileInfo(
      label: json['label'] ?? '',
      path: json['path'] ?? '',
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BrowserProfileInfo && runtimeType == other.runtimeType && path == other.path;

  @override
  int get hashCode => path.hashCode;
}

class BrowserInfo {
  final String name;
  final String browserType;
  final List<BrowserProfileInfo> profiles;

  BrowserInfo({
    required this.name,
    required this.browserType,
    required this.profiles,
  });

  factory BrowserInfo.fromJson(Map<String, dynamic> json) {
    var rawProfiles = (json['profiles'] as List<dynamic>?) ?? [];
    return BrowserInfo(
      name: json['name'] ?? '',
      browserType: json['browser_type'] ?? 'chromium',
      profiles: rawProfiles
          .map((p) => BrowserProfileInfo.fromJson(p as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BrowserInfo && runtimeType == other.runtimeType && name == other.name && browserType == other.browserType;

  @override
  int get hashCode => name.hashCode ^ browserType.hashCode;
}

class GuiPreferences {
  bool autoStart;
  bool keepServer;
  bool noTray;
  bool startMinimized;
  bool autoRefreshCookie;
  String? selectedBrowser;
  String? selectedProfile;
  Map<String, bool> platformEnabled;

  /// 每个平台单独指定浏览器（domain -> 浏览器名），为空则跟随全局 [selectedBrowser]
  Map<String, String> platformBrowsers;

  /// 每个平台单独指定 Profile（domain -> profile 路径），与 [platformBrowsers] 配对
  Map<String, String> platformProfiles;

  GuiPreferences({
    this.autoStart = false,
    this.keepServer = false,
    this.noTray = false,
    this.startMinimized = false,
    this.autoRefreshCookie = true,
    this.selectedBrowser,
    this.selectedProfile,
    Map<String, bool>? platformEnabled,
    Map<String, String>? platformBrowsers,
    Map<String, String>? platformProfiles,
  })  : platformEnabled = platformEnabled ?? {
          'bilibili.com': true,
          'zhihu.com': true,
          'douban.com': true,
        },
        platformBrowsers = platformBrowsers ?? {},
        platformProfiles = platformProfiles ?? {};

  Map<String, dynamic> toJson() => {
        'auto_start': autoStart,
        'keep_server': keepServer,
        'no_tray': noTray,
        'start_minimized': startMinimized,
        'auto_refresh_cookie': autoRefreshCookie,
        if (selectedBrowser != null) 'selected_browser': selectedBrowser,
        if (selectedProfile != null) 'selected_profile': selectedProfile,
        'platform_enabled': platformEnabled,
        'platform_browsers': platformBrowsers,
        'platform_profiles': platformProfiles,
      };

  factory GuiPreferences.fromJson(Map<String, dynamic> json) {
    return GuiPreferences(
      autoStart: json['auto_start'] ?? false,
      keepServer: json['keep_server'] ?? false,
      noTray: json['no_tray'] ?? false,
      startMinimized: json['start_minimized'] ?? false,
      autoRefreshCookie: json['auto_refresh_cookie'] ?? true,
      selectedBrowser: json['selected_browser'] as String?,
      selectedProfile: json['selected_profile'] as String?,
      platformEnabled: (json['platform_enabled'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, v == true),
          ) ??
          {
            'bilibili.com': true,
            'zhihu.com': true,
            'douban.com': true,
          },
      platformBrowsers: _strMap(json['platform_browsers']),
      platformProfiles: _strMap(json['platform_profiles']),
    );
  }

  static Map<String, String> _strMap(dynamic raw) {
    final map = (raw as Map<String, dynamic>?)?.map((k, v) => MapEntry(k, v.toString())) ?? <String, String>{};
    map.removeWhere((k, v) => v.isEmpty);
    return map;
  }
}
