// ==UserScript==
// @name         导航面板
// @namespace    http://tampermonkey.net/
// @version      8.2
// @description  多功能导航面板，支持侧边栏/顶栏/底栏显示，可自定义位置、颜色、搜索引擎。支持收藏管理、镜像站点数据共享、拖拽排序等功能。默认关闭，可在油猴菜单中为任意网站启用。
// @author       ai
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @noframes
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/548905/%E5%AF%BC%E8%88%AA%E9%9D%A2%E6%9D%BF.user.js
// @updateURL https://update.greasyfork.org/scripts/548905/%E5%AF%BC%E8%88%AA%E9%9D%A2%E6%9D%BF.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // 全局启用/禁用设置
    const GLOBAL_ENABLE_KEY = 'navigation_panel_global_enable';
    // 展开/收起快捷键的全局存储键（跨站点共用一份）
    const GLOBAL_SHORTCUT_KEY = 'navigation_panel_global_shortcut';
    const currentDomain = window.location.hostname;

    // 常见二级后缀清单：这些后缀下主域名需取三段（如 people.com.cn 的主域名是 people.com.cn 而非 com.cn）
    // 纯正则无法从结构上区分 co.uk 与 bilibili.com，必须内置后缀清单判断
    const SECOND_LEVEL_SUFFIXES = new Set([
        // 中国大陆及港澳台
        'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'mil.cn',
        'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk', 'idv.hk',
        'com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw', 'idv.tw',
        'com.mo', 'edu.mo', 'gov.mo',
        // 其他常见二级后缀
        'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'sch.uk',
        'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
        'co.kr', 'or.kr', 'ne.kr', 're.kr', 'go.kr',
        'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
        'co.nz', 'co.za', 'co.in', 'com.sg', 'com.my', 'com.br', 'com.mx', 'com.ru', 'com.tr', 'com.ar'
    ]);

    // 提取主域名(去除子域名,保留核心域名)
    // 例如: www.zhihu.com -> zhihu.com, zhuanlan.zhihu.com -> zhihu.com, www.people.com.cn -> people.com.cn
    function getMainDomain(hostname) {
        // IP 地址直接返回
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;
        const parts = hostname.split('.');
        if (parts.length <= 2) {
            return hostname;
        }
        // 后两段是二级后缀（如 people.com.cn 的 com.cn）时，主域名取三段
        if (SECOND_LEVEL_SUFFIXES.has(parts.slice(-2).join('.'))) {
            return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
    }

    // 获取当前域名的启用状态(默认关闭)
    function isEnabledForCurrentSite() {
        const enabledSites = GM_getValue(GLOBAL_ENABLE_KEY, {});
        return enabledSites[currentDomain] === true;
    }

    // 设置当前域名的启用状态
    function setEnabledForCurrentSite(enabled) {
        const enabledSites = GM_getValue(GLOBAL_ENABLE_KEY, {});
        enabledSites[currentDomain] = enabled;
        GM_setValue(GLOBAL_ENABLE_KEY, enabledSites);
    }

    // 注册油猴菜单命令 - 单一动态菜单项
    // 只在顶层窗口注册，避免在iframe中重复注册
    const shouldRegisterMenu = window.self === window.top;

    if (shouldRegisterMenu) {
        try {
            const menuText = isEnabledForCurrentSite()
                ? '✅ 当前网站已启用 - 点击禁用'
                : '❌ 当前网站已禁用 - 点击启用';

            // 使用固定ID避免重复注册
            GM_registerMenuCommand(menuText, () => {
                const currentStatus = isEnabledForCurrentSite();
                setEnabledForCurrentSite(!currentStatus);
                if (currentStatus) {
                    alert('导航面板已在当前网站禁用,页面将刷新');
                } else {
                    alert('导航面板已在当前网站启用,页面将刷新');
                }
                window.top.location.reload();
            }, {
                id: 'navigation-panel-toggle',
                autoClose: true
            });
        } catch (e) {
            console.error('导航面板: 菜单注册失败', e);
        }

        // 如果当前网站已启用,检查是否有共享域名,添加镜像站切换菜单
        if (isEnabledForCurrentSite()) {
            // 获取当前平台的配置（须用主域名拼键，与数据存储的键一致；此前用完整主机名导致带 www 的站点永远读不到配置）
            const currentPlatformKey = getMainDomain(currentDomain).replace(/\./g, '_');
            const platformConfig = GM_getValue(`${currentPlatformKey}_config`, {});

            // 如果配置了共享域名且有多个域名
            if (platformConfig.sharedDomains && platformConfig.sharedDomains.length > 1) {
                // 为每个其他镜像站添加菜单项
                platformConfig.sharedDomains.forEach(domain => {
                    if (domain !== currentDomain) {
                        GM_registerMenuCommand(`🔄 切换到: ${domain}`, () => {
                            // 将当前URL的域名替换为目标域名
                            const currentUrl = window.location.href;
                            const newUrl = currentUrl.replace(currentDomain, domain);
                            window.location.href = newUrl;
                        });
                    }
                });
            }
        }
    }

    // 如果当前网站未启用,则不执行脚本
    const isEnabled = isEnabledForCurrentSite();
    if (!isEnabled) {
        return;
    }

    // 获取当前平台 - 所有网站一视同仁
    const currentHost = window.location.hostname;
    const mainDomain = getMainDomain(currentHost);
    const currentPlatform = mainDomain.replace(/\./g, '_'); // 使用主域名作为平台标识

    // 创建平台信息
    const platformInfo = {
        name: mainDomain,
        users: [],
        color: '#4a90e2' // 默认蓝色
    };

    // 构建 platformData（用于导出功能）
    const platformData = {
        [currentPlatform]: platformInfo
    };

    // 获取站点配置（需要先加载配置才能知道共享域名）
    const configKey = `${currentPlatform}_config`;
    const defaultConfig = {
        autoExpand: false,
        position: 'right', // 'left' | 'right' | 'top' | 'bottom'
        searchEngines: [],
        showTitle: true,
        gridColumns: 2,
        searchPosition: 'top',
        panelWidth: 300,
        topBarStyle: 'default', // 'default' | 'compact'
        topBarHeight: 60, // 顶栏/底栏高度（px）
        topBarWidth: 900, // 顶栏/底栏最大宽度（px）
        topBarOffset: 0, // 顶栏/底栏水平偏移量（%）：-80到80，负数左移，正数右移
        sideBarOffset: 0, // 侧边栏垂直偏移量（%）：-80到80，负数上移，正数下移
        openInCurrentTab: false, // 左键当前页打开，中键新页打开
        autoExpandContent: false, // 收藏内容默认展开
        panelTheme: 'default', // 配色模式：'default' 跟随主题色 | 'light' 浅色抗干扰 | 'dark' 深色抗干扰
        searchBoxWidth: 500, // search-top 模式搜索框宽度（px）
        searchBoxHeight: 44, // search-top 模式搜索框高度（px）
        topBarModulesOrder: [
            { id: 'search', order: 0, visible: true },
            { id: 'favorites', order: 1, visible: true },
            { id: 'buttons', order: 2, visible: true }
        ], // 顶栏模块顺序
        primaryColor: platformData[currentPlatform].color, // 主题色
        customPanelName: '', // 自定义面板名称
        sharedDomains: [currentHost] // 共享数据的域名列表，默认只包含当前域名
    };
    const siteConfig = { ...defaultConfig, ...GM_getValue(configKey, {}) };

    // 确保配置完整性（兼容旧版本配置）
    if (!siteConfig.gridColumns) siteConfig.gridColumns = 2;
    if (!siteConfig.searchPosition) siteConfig.searchPosition = 'top';
    if (!siteConfig.panelWidth) siteConfig.panelWidth = 300;
    if (!siteConfig.topBarStyle) siteConfig.topBarStyle = 'default';
    if (siteConfig.topBarHeight === undefined || siteConfig.topBarHeight === null) siteConfig.topBarHeight = 60;
    if (!siteConfig.topBarWidth) siteConfig.topBarWidth = 900;
    if (!siteConfig.panelTheme) siteConfig.panelTheme = 'default';
    if (!siteConfig.searchBoxWidth) siteConfig.searchBoxWidth = 500;
    if (!siteConfig.searchBoxHeight) siteConfig.searchBoxHeight = 44;
    if (!Array.isArray(siteConfig.searchEngines)) siteConfig.searchEngines = [];
    if (!Array.isArray(siteConfig.topBarModulesOrder) || siteConfig.topBarModulesOrder.length === 0) {
        siteConfig.topBarModulesOrder = defaultConfig.topBarModulesOrder.map(m => ({ ...m }));
    } else if (typeof siteConfig.topBarModulesOrder[0] === 'string') {
        // 兼容旧版本字符串数组
        siteConfig.topBarModulesOrder = siteConfig.topBarModulesOrder.map((id, index) => ({
            id, order: index, visible: true
        }));
    }
    if (!siteConfig.primaryColor) siteConfig.primaryColor = platformData[currentPlatform].color;
    if (!Array.isArray(siteConfig.sharedDomains) || siteConfig.sharedDomains.length === 0) {
        siteConfig.sharedDomains = [currentHost];
    }

    // 始终使用当前平台的独立存储键（不再使用共享键）
    const storageKey = `${currentPlatform}_users`;

    // 加载当前站点数据
    const platformUsers = GM_getValue(storageKey, platformData[currentPlatform].users);

    // URL转换函数：将镜像站点的URL转换为当前域名
    function convertUrlToCurrentDomain(url, sourceDomain) {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === sourceDomain) {
                urlObj.hostname = currentHost;
            }
            return urlObj.href;
        } catch (e) {
            return url;
        }
    }

    // 动态加载并合并所有镜像站点的数据（每次渲染时调用，确保增删改实时生效）
    function getDisplayUsers() {
        if (!siteConfig.sharedDomains || siteConfig.sharedDomains.length <= 1) {
            return platformUsers;
        }

        const allUsers = [...platformUsers];
        const seenUrls = new Set(platformUsers.map(u => u.url));

        siteConfig.sharedDomains.forEach(domain => {
            if (domain === currentHost) return;

            const mirrorPlatform = domain.replace(/\./g, '_');
            const mirrorUsers = GM_getValue(`${mirrorPlatform}_users`, []);

            mirrorUsers.forEach(user => {
                const convertedUrl = convertUrlToCurrentDomain(user.url, domain);
                if (!seenUrls.has(convertedUrl)) {
                    allUsers.push({
                        ...user,
                        url: convertedUrl,
                        _originalDomain: domain
                    });
                    seenUrls.add(convertedUrl);
                }
            });
        });

        return allUsers;
    }


    function saveSiteConfig() { GM_setValue(configKey, siteConfig); }

    // 展开/收起快捷键（全局，所有网站共用一份）
    // 读取：全局键优先，回退到旧版按站点存储的值（兼容迁移）；写入：只写全局键，
    // 并清除各站点配置中残留的旧版快捷键，避免清空全局后旧值经回退逻辑复活
    function getPanelShortcut() {
        return GM_getValue(GLOBAL_SHORTCUT_KEY, '') || siteConfig.panelShortcut || '';
    }

    function setPanelShortcut(shortcut) {
        GM_setValue(GLOBAL_SHORTCUT_KEY, shortcut);
        GM_listValues().forEach(key => {
            if (key.endsWith('_config')) {
                const cfg = GM_getValue(key, null);
                if (cfg && cfg.panelShortcut) {
                    cfg.panelShortcut = '';
                    GM_setValue(key, cfg);
                }
            }
        });
    }

    // 安全保存用户数据 - 直接保存，保持顺序
    function saveUsers() {
        // 直接保存platformUsers数组，保持用户排序的顺序
        GM_setValue(storageKey, platformUsers);
    }

    // 跨标签页自动同步已禁用（频繁自动同步会导致面板闪烁/消失），刷新页面可获取其他标签页的更新

    // 导出数据
    let _exportBusy = false;
    let _closeDropdownsHandler = null; // 设置面板的"点击空白关闭下拉菜单"监听器，防止重复打开设置时累积
    let _recordingShortcut = false; // 是否正在录制快捷键（此时全局快捷键监听暂停响应）
    function exportData() {
        if (_exportBusy) return;
        _exportBusy = true;
        try {
            const data = {
                version: '1.1',
                timestamp: new Date().toISOString(),
                globalEnableSettings: GM_getValue(GLOBAL_ENABLE_KEY, {}),
                globalShortcut: GM_getValue(GLOBAL_SHORTCUT_KEY, ''),
                platforms: {}
            };

            // 收集所有平台数据 - 动态从存储中获取
            const allKeys = GM_listValues();
            const platformKeys = new Set();

            // 找出所有平台的配置键和收藏键
            allKeys.forEach(key => {
                if (key.endsWith('_config')) {
                    platformKeys.add(key.slice(0, -'_config'.length));
                } else if (key.endsWith('_users')) {
                    platformKeys.add(key.slice(0, -'_users'.length));
                }
            });

            // 为每个平台收集数据（各平台独立存储：`${platform}_users` / `${platform}_config`）
            platformKeys.forEach(platform => {
                data.platforms[platform] = {
                    users: GM_getValue(`${platform}_users`, []),
                    config: GM_getValue(`${platform}_config`, {})
                };
            });

            // 创建下载
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            a.download = `navigation-panel-backup-${dateStr}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            const platformCount = Object.keys(data.platforms).length;
            alert(`数据导出成功！共包含 ${platformCount} 个站点的收藏与配置，以及所有站点的启用状态。`);
        } catch (e) {
            alert('导出失败：' + e.message);
        } finally {
            setTimeout(() => { _exportBusy = false; }, 1000);
        }
    }

    // 导入数据
    function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    // 验证数据格式
                    if (!data.platforms || typeof data.platforms !== 'object') {
                        alert('无效的数据格式：缺少 platforms 字段');
                        return;
                    }

                    // 询问是否覆盖
                    const overwrite = confirm('是否覆盖现有数据？\n确定=覆盖（导入的数据替换现有数据）\n取消=合并（保留现有数据，追加新数据）');

                    // 导入全局启用设置
                    if (data.globalEnableSettings && typeof data.globalEnableSettings === 'object') {
                        if (overwrite) {
                            GM_setValue(GLOBAL_ENABLE_KEY, data.globalEnableSettings);
                        } else {
                            // 合并全局启用设置
                            const existingSettings = GM_getValue(GLOBAL_ENABLE_KEY, {});
                            GM_setValue(GLOBAL_ENABLE_KEY, { ...existingSettings, ...data.globalEnableSettings });
                        }
                    }

                    // 导入全局快捷键
                    if (typeof data.globalShortcut === 'string') {
                        GM_setValue(GLOBAL_SHORTCUT_KEY, data.globalShortcut);
                    }

                    // 导入平台数据（存储键为 `${platform}_users` / `${platform}_config`）
                    let importedPlatforms = 0;
                    Object.keys(data.platforms).forEach(platform => {
                        // 平台键由域名转换而来（点替换为下划线），校验防止写入异常键
                        if (!/^[a-z0-9_-]+$/i.test(platform)) return;

                        const pStorageKey = `${platform}_users`;
                        const pConfigKey = `${platform}_config`;
                        const newUsers = Array.isArray(data.platforms[platform].users) ? data.platforms[platform].users : [];
                        const newConfig = data.platforms[platform].config && typeof data.platforms[platform].config === 'object'
                            ? data.platforms[platform].config : {};

                        if (overwrite) {
                            GM_setValue(pStorageKey, newUsers);
                            GM_setValue(pConfigKey, newConfig);
                        } else {
                            // 合并数据：收藏按 url 去重，本地已有优先；配置保留本地已有项
                            const existingUsers = GM_getValue(pStorageKey, []);
                            const urlSet = new Set(existingUsers.map(u => u.url));
                            const usersToAdd = newUsers.filter(u => !urlSet.has(u.url));
                            GM_setValue(pStorageKey, [...existingUsers, ...usersToAdd]);

                            const existingConfig = GM_getValue(pConfigKey, {});
                            GM_setValue(pConfigKey, { ...newConfig, ...existingConfig });
                        }
                        importedPlatforms++;
                    });

                    alert(`导入成功！已${overwrite ? '恢复' : '合并'} ${importedPlatforms} 个站点的收藏与配置。页面将刷新。`);
                    location.reload();
                } catch (error) {
                    alert('导入失败：' + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // 转义 HTML 特殊字符，防止收藏名称/搜索引擎名等含引号或尖括号时破坏面板结构
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // 将 'ctrl+alt+n' 格式的快捷键格式化为 'Ctrl+Alt+N' 用于显示
    function formatShortcut(shortcut) {
        return shortcut.split('+').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('+');
    }

    // 解析 3/6 位 hex 颜色，非法输入回退为默认蓝色
    function parseHex(color) {
        const clean = String(color || '').trim().replace('#', '');
        const full = clean.length === 3
            ? clean.split('').map(c => c + c).join('')
            : clean;
        if (!/^[0-9a-fA-F]{6}$/.test(full)) return [74, 144, 226];
        const num = parseInt(full, 16);
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function adjustColor(color, percent) {
        const [r, g, b] = parseHex(color);
        const amt = Math.round(2.55 * percent);
        const clamp = v => Math.max(0, Math.min(255, v));
        const R = clamp(r + amt), G = clamp(g + amt), B = clamp(b + amt);
        return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }

    function darkenColor(color, percent) {
        return adjustColor(color, -Math.abs(percent));
    }

    function lightenColor(color, percent) {
        return adjustColor(color, Math.abs(percent));
    }

    function hexToRgba(color, alpha) {
        const [r, g, b] = parseHex(color);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function getThemeColors() {
        const primary = siteConfig.primaryColor || '#4a90e2';
        return {
            primary,
            header: lightenColor(primary, 5),
            button: darkenColor(primary, 5),
            action: lightenColor(primary, 5)
        };
    }

    // 轻量级非侵入式 Toast 提示，替代频繁打断操作的 alert
    let _toastTimer = null;
    function showToast(message, type = 'info') {
        let toast = document.getElementById('mp-nav-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'mp-nav-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `mp-toast mp-toast-${type} show`;
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2400);
    }

    // 抗干扰配色模式（panelTheme: 'light' | 'dark'）：
    // 把面板全部颜色声明加 !important，利用"样式表 !important > 行内样式 > 网站普通样式"的
    // 优先级规则隔离网站对颜色/背景的污染；主题色仍作为点缀色（深色模式下自动调亮保证可见）
    function getThemePalette(theme, primary) {
        if (theme === 'dark') {
            return {
                panelBg: '#1c1e24', itemBg: '#252830', itemHover: '#2f333d',
                sectionBg: '#22252c', text: '#e8eaed', muted: '#9aa0a6', border: '#343844',
                inputBg: '#2b2f3a', inputText: '#f1f3f4', inputBorder: '#444957',
                toggleOff: '#4a4f5e', accent: lightenColor(primary, 18)
            };
        }
        // light：强制浅色
        return {
            panelBg: '#ffffff', itemBg: '#f5f7fa', itemHover: '#ebeff5',
            sectionBg: '#f9fafb', text: '#1f2937', muted: '#6b7280', border: '#e5e7eb',
            inputBg: '#ffffff', inputText: '#111827', inputBorder: '#d1d5db',
            toggleOff: '#cbd5e1', accent: primary
        };
    }

    function buildThemeCss(t) {
        const accentHover = darkenColor(t.accent, 10);
        const accentGlow = hexToRgba(t.accent, 0.22);
        return `
            /* ===== 抗干扰配色模式：全部颜色声明带 !important，优先级高于网站样式与行内样式 ===== */
            #panel-container, .favorites-buttons-container, .search-container, #search-top-container {
                background-color: ${t.panelBg} !important;
                color: ${t.text} !important;
                border-color: ${t.border} !important;
            }
            #expand-button { background-color: ${t.accent} !important; color: #fff !important; }
            #expand-button:hover { background-color: ${accentHover} !important; }
            .panel-header { background: linear-gradient(135deg, ${lightenColor(t.accent, 6)}, ${t.accent}) !important; }
            .panel-header, .panel-header * { color: #fff !important; }
            .user-button { background-color: ${t.accent} !important; color: #fff !important; }
            .user-button:hover { background-color: ${accentHover} !important; box-shadow: 0 4px 12px ${accentGlow} !important; }
            .action-button { background-color: ${t.accent} !important; color: #fff !important; }
            .action-button:hover { background-color: ${accentHover} !important; }
            .search-engine-item { background-color: ${t.itemBg} !important; border-color: ${t.border} !important; }
            #multi-platform-panel .search-engine-item input { background-color: transparent !important; color: ${t.inputText} !important; }
            .search-engine-item button { background-color: ${t.accent} !important; color: #fff !important; }
            #multi-platform-panel .search-input, .search-input { background-color: ${t.inputBg} !important; color: ${t.inputText} !important; border-color: ${t.inputBorder} !important; }
            #multi-platform-panel .search-input:focus, .search-input:focus { border-color: ${t.accent} !important; box-shadow: 0 0 0 2px ${accentGlow} !important; }
            .search-button { background-color: ${t.accent} !important; color: #fff !important; }
            .search-button:hover { background-color: ${accentHover} !important; }
            .close-button-top { background-color: ${t.accent} !important; color: #fff !important; }

            /* --- 设置面板 --- */
            #settings-panel { background-color: ${t.panelBg} !important; color: ${t.text} !important; border-color: ${t.border} !important; }
            #settings-panel .settings-header { background: linear-gradient(135deg, ${lightenColor(t.accent, 6)}, ${t.accent}) !important; }
            #settings-panel .settings-header, #settings-panel .settings-header * { color: #fff !important; }
            #settings-panel .setting-section { background-color: ${t.sectionBg} !important; border-color: ${t.border} !important; }
            #settings-panel .setting-section h3 { color: ${t.text} !important; }
            #settings-panel .setting-section h3::before { background-color: ${t.accent} !important; }
            #settings-panel .setting-item { border-bottom-color: ${t.border} !important; }
            #settings-panel .setting-label, #settings-panel .style-item-name, #settings-panel .module-name { color: ${t.text} !important; }
            #settings-panel .setting-description, #settings-panel .drag-handle, #settings-panel .module-drag-handle, #settings-panel .module-width-value, #settings-panel .search-engine-url { color: ${t.muted} !important; }
            #settings-panel .toggle-switch { background-color: ${t.toggleOff} !important; }
            #settings-panel .toggle-switch.active { background-color: ${t.accent} !important; }
            #settings-panel .toggle-switch::after { background-color: #fff !important; }
            #settings-panel .radio-group { background-color: ${t.itemBg} !important; border-color: ${t.border} !important; }
            #settings-panel .radio-option { color: ${t.muted} !important; background-color: transparent !important; }
            #settings-panel .radio-option:hover { color: ${t.text} !important; }
            #settings-panel .radio-option.active { background-color: ${t.accent} !important; color: #fff !important; }
            #settings-panel .style-item, #settings-panel .module-config-item { background-color: ${t.itemBg} !important; border-color: ${t.border} !important; }
            #settings-panel .style-item:hover, #settings-panel .module-config-item:hover { background-color: ${t.itemHover} !important; }
            #settings-panel .search-engine-name { color: ${t.accent} !important; }
            #settings-panel input[type="text"] { color: ${t.inputText} !important; background-color: ${t.inputBg} !important; border-color: ${t.inputBorder} !important; }
            #settings-panel .size-preview { background-color: ${t.inputBg} !important; color: ${t.inputText} !important; border-color: ${t.inputBorder} !important; }
            #settings-panel .size-dropdown { background-color: ${t.panelBg} !important; border-color: ${t.border} !important; }
            #settings-panel .size-option { background-color: transparent !important; color: ${t.text} !important; }
            #settings-panel .size-option:hover { background-color: ${t.itemHover} !important; }
            #settings-panel .size-option.active { background-color: ${t.accent} !important; color: #fff !important; }
            #settings-panel .rename-btn-mini, #settings-panel .add-search-btn { background-color: ${t.accent} !important; color: #fff !important; }
            #settings-panel .delete-btn-mini { background-color: #ef4444 !important; color: #fff !important; }
            #settings-panel .settings-content { scrollbar-color: ${t.muted} ${t.itemBg} !important; }
            #settings-panel .settings-content::-webkit-scrollbar-track { background: ${t.itemBg} !important; }
            #settings-panel .settings-content::-webkit-scrollbar-thumb { background: ${t.muted} !important; }
        `;
    }

    // 侧边栏样式（left / right）
    function buildSideStyles(isLeft, c) {
        const edge = isLeft ? 'left' : 'right';
        const btnRadius = isLeft ? '0 8px 8px 0' : '8px 0 0 8px';
        const panelRadius = isLeft ? '0 14px 14px 0' : '14px 0 0 14px';
        const shadowDir = isLeft ? '4px' : '-4px';
        return `
            #expand-button {
                position: fixed; ${edge}: 0; top: calc(50% + ${siteConfig.sideBarOffset}%); transform: translateY(-50%); z-index: 9999;
                width: 22px; height: 48px; background: linear-gradient(180deg, ${lightenColor(c.header, 5)}, ${c.header}); color: #fff;
                display: flex; align-items: center; justify-content: center; border-radius: ${btnRadius};
                cursor: pointer; box-shadow: ${shadowDir} 2px 10px rgba(0, 0, 0, 0.16);
                transition: width 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s, box-shadow 0.2s;
                font-size: 11px; user-select: none;
            }
            #expand-button:hover { width: 26px; box-shadow: ${shadowDir} 4px 14px rgba(0, 0, 0, 0.22); }
            #panel-container {
                position: fixed; ${edge}: -${siteConfig.panelWidth + 24}px; top: calc(50% + ${siteConfig.sideBarOffset}%); transform: translateY(-50%); z-index: 10000;
                width: ${siteConfig.panelWidth}px; ${isLeft ? 'height: 85vh;' : 'max-height: 85vh;'}
                background-color: rgba(255, 255, 255, 0.92); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 255, 255, 0.55); border-${edge}: none;
                box-shadow: ${shadowDir} 8px 32px rgba(0, 0, 0, 0.16); border-radius: ${panelRadius};
                transition: ${edge} 0.3s cubic-bezier(0.22, 1, 0.36, 1); display: flex; flex-direction: column; overflow: hidden;
            }
            #panel-container.expanded { ${edge}: 0; }
        `;
    }

    // 顶栏/底栏共享样式（合并原重复的 topStyles 与 bottomStyles）
    function buildBarStyles(isBottom, c) {
        const edge = isBottom ? 'bottom' : 'top';
        const oppositeEdge = isBottom ? 'top' : 'bottom';
        const hiddenY = isBottom ? '100%' : '-100%';
        const btnRadius = isBottom ? '8px 8px 0 0' : '0 0 8px 8px';
        const barRadius = isBottom ? '12px 12px 0 0' : '0 0 12px 12px';
        const shadowY = isBottom ? '-4px' : '4px';
        return `
            #expand-button {
                position: fixed; left: 50%; ${edge}: 0; transform: translateX(-50%); z-index: 9999;
                width: 64px; height: 22px; background: linear-gradient(135deg, ${lightenColor(c.header, 5)}, ${c.header}); color: #fff;
                display: flex; align-items: center; justify-content: center; border-radius: ${btnRadius};
                cursor: pointer; box-shadow: 0 ${shadowY} 10px rgba(0, 0, 0, 0.16);
                transition: height 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s; font-size: 11px; user-select: none;
            }
            #expand-button:hover { height: 26px; }
            #panel-container {
                position: fixed; left: 50%; ${edge}: 0;
                transform: translateX(-50%) translateY(${hiddenY}); z-index: 10000;
                display: flex; flex-direction: row; gap: 10px; padding: 0 10px;
                transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
                pointer-events: none; overflow: visible;
            }
            #panel-container.expanded { transform: translateX(-50%) translateY(0); }
            .close-button-top {
                position: fixed; right: 12px; ${edge}: 8px; z-index: 10002;
                width: 26px; height: 26px; background: ${c.header}; color: #fff; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); opacity: 0;
                transition: opacity 0.25s, transform 0.2s; pointer-events: auto;
            }
            .close-button-top:hover { transform: scale(1.1); }
            #panel-container.expanded ~ .close-button-top { opacity: 1; }
            .panel-header { display: none !important; }
            .favorites-buttons-container {
                flex: 0 0 auto; max-width: ${siteConfig.topBarWidth}px;
                height: ${siteConfig.topBarHeight}px; min-height: ${siteConfig.topBarHeight}px; max-height: ${siteConfig.topBarHeight}px;
                display: flex; flex-direction: row; gap: 8px;
                background-color: rgba(255, 255, 255, 0.92); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 255, 255, 0.55); border-${edge}: none;
                box-shadow: 0 ${shadowY} 24px rgba(0, 0, 0, 0.14); border-radius: ${barRadius};
                pointer-events: auto; padding: 6px 22px; transform: translateX(${siteConfig.topBarOffset}%);
                flex-wrap: nowrap; align-items: center; margin: 0 20px; position: relative; overflow: visible;
            }
            .search-engines-container {
                flex: 0 0 auto; width: 280px; display: flex; flex-direction: column;
                gap: 6px; align-items: stretch; justify-content: center;
            }
            .search-engine-item {
                display: flex; gap: 4px; align-items: center; background: #f3f4f6;
                border: 1px solid #e5e7eb; border-radius: 6px; padding: 3px 6px; white-space: nowrap;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .search-engine-item:focus-within {
                border-color: ${c.primary}; box-shadow: 0 0 0 2px ${hexToRgba(c.primary, 0.18)};
            }
            .search-engine-item input {
                border: none; background: transparent; outline: none; flex: 1; min-width: 80px; font-size: 12px;
            }
            .search-engine-item button {
                background: ${c.primary}; color: #fff; border: none; border-radius: 4px;
                padding: 3px 8px; cursor: pointer; font-size: 11px; font-weight: 500;
                transition: background-color 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
            }
            .search-engine-item button:hover { background: ${darkenColor(c.primary, 10)}; }
            .search-engine-item.hidden { display: none; }
            #buttons-grid {
                flex: 1; min-width: 200px; min-height: ${siteConfig.topBarHeight - 10}px;
                display: flex !important; flex-direction: row !important; gap: 6px;
                overflow: hidden; align-items: center; padding: 4px 2px !important;
            }
            #buttons-grid.expanded {
                flex-wrap: wrap; overflow-y: auto; max-height: 80vh;
                justify-content: flex-start; align-content: flex-start;
            }
            .favorites-buttons-container:has(#buttons-grid.expanded) { height: auto !important; max-height: none !important; }
            #buttons-grid.expanded .button-wrapper { flex: 1 1 auto; min-width: 84px; max-width: 200px; }
            #buttons-grid.expanded .button-wrapper[data-size="2x"] { min-width: 175px; max-width: 300px; }
            #buttons-grid.expanded .button-wrapper[data-size="3x"] { min-width: 266px; max-width: 400px; }
            .button-wrapper { flex: 0 0 auto; width: 84px; height: auto; }
            .button-wrapper[data-size="2x"] { width: 175px; }
            .button-wrapper[data-size="3x"] { width: 266px; }
            .user-button {
                width: 100%; height: auto; font-size: 12px; padding: 6px 8px;
                text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;
            }
            .button-container {
                flex: 0 0 auto; width: 42px; display: flex; flex-direction: column;
                gap: 6px; align-items: center; justify-content: center; overflow: hidden;
            }
            .topbar-buttons-container {
                flex: 0 0 auto; width: auto; display: flex; flex-direction: row;
                gap: 6px; align-items: center; justify-content: center;
            }
            .action-button {
                width: 30px !important; height: 30px !important; min-width: 30px !important;
                border-radius: 50% !important; padding: 0 !important;
                display: flex !important; align-items: center !important; justify-content: center !important;
                font-size: 15px !important; flex-shrink: 0 !important;
            }
            .button-container .action-button.hidden { display: none !important; }
            .temp-close-btn {
                position: absolute; right: 5px; ${oppositeEdge}: 4px; width: 18px; height: 18px;
                border-radius: 50%; background: rgba(0, 0, 0, 0.45); color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.6); cursor: pointer;
                display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1;
                opacity: 0; transition: opacity 0.2s, background-color 0.2s; z-index: 100; pointer-events: none;
            }
            #panel-container:hover .temp-close-btn { opacity: 1; pointer-events: auto; }
            .temp-close-btn:hover { background: rgba(0, 0, 0, 0.75); }
            #panel-container.content-expanded .favorites-buttons-container { max-height: 80vh; overflow-y: auto; }
        `;
    }

    function buildAllStyles() {
        const c = getThemeColors();
        const primaryGlow = hexToRgba(c.primary, 0.22);
        const positionStyles = siteConfig.position === 'top'
            ? buildBarStyles(false, c)
            : siteConfig.position === 'bottom'
                ? buildBarStyles(true, c)
                : buildSideStyles(siteConfig.position === 'left', c);

        const baseCss = `
            #multi-platform-panel *, #settings-panel * {
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            }
            #multi-platform-panel input, #multi-platform-panel textarea { color: #111827 !important; }
            ${positionStyles}
            #expand-button:hover { background-color: ${darkenColor(c.header, 8)}; }

            .panel-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; background: linear-gradient(135deg, ${lightenColor(c.header, 5)}, ${c.header});
                color: #fff; flex-shrink: 0;
            }
            .panel-title { font-weight: 600; font-size: 14px; letter-spacing: 0.2px; }
            .header-buttons { display: flex; gap: 6px; align-items: center; }
            .settings-button, .close-button {
                cursor: pointer; font-size: 16px; line-height: 1; width: 26px; height: 26px;
                display: flex; align-items: center; justify-content: center; border-radius: 6px;
                transition: background-color 0.2s, transform 0.2s;
            }
            .settings-button:hover, .close-button:hover { background-color: rgba(255, 255, 255, 0.2); }

            .search-container { padding: 10px 14px; background-color: #f8fafc; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
            .search-box { display: flex; gap: 6px; }
            .search-input {
                flex: 1; padding: 7px 11px; border: 1px solid #d1d5db; border-radius: 6px;
                font-size: 13px; background-color: #fff; outline: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .search-input:focus { border-color: ${c.primary}; box-shadow: 0 0 0 2px ${primaryGlow}; }
            .search-button {
                padding: 7px 13px; background-color: ${c.action}; color: #fff; border: none;
                border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;
                transition: background-color 0.2s, transform 0.15s;
            }
            .search-button:hover { background-color: ${darkenColor(c.action, 10)}; }
            .search-button:active { transform: scale(0.97); }

            #buttons-grid {
                display: grid; grid-template-columns: repeat(${siteConfig.gridColumns || 2}, 1fr);
                gap: 8px; padding: 14px; overflow-y: auto; flex: 1;
                scrollbar-width: thin; scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
            }
            #buttons-grid::-webkit-scrollbar { width: 5px; height: 5px; }
            #buttons-grid::-webkit-scrollbar-track { background: transparent; }
            #buttons-grid::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.5); border-radius: 3px; }
            #buttons-grid::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.7); }

            .button-wrapper { position: relative; }
            .button-wrapper[data-size="1x"] { grid-column: span 1; grid-row: span 1; }
            .button-wrapper[data-size="2x"] { grid-column: span 2; grid-row: span 1; }
            .button-wrapper[data-size="3x"] { grid-column: span 3; grid-row: span 1; }

            .user-button {
                display: block; padding: 8px 10px; background-color: ${c.button}; color: #fff !important;
                text-align: center; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 12px;
                transition: background-color 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s;
                cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                height: 100%; width: 100%; line-height: 1.5;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
            }
            .user-button:hover {
                background-color: ${darkenColor(c.button, 8)};
                transform: translateY(-1px);
                box-shadow: 0 4px 10px ${primaryGlow};
            }
            .user-button:active { transform: translateY(0) scale(0.98); }

            .action-button {
                padding: 8px 12px; color: #fff; text-align: center; border-radius: 6px; cursor: pointer;
                font-weight: 500; transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s;
                font-size: 13px; background-color: ${c.action}; user-select: none;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .action-button:hover {
                background-color: ${darkenColor(c.action, 10)};
                transform: translateY(-1px);
                box-shadow: 0 3px 8px ${primaryGlow};
            }
            .action-button:active { transform: scale(0.96); }
            .button-container { display: flex; flex-direction: row; gap: 10px; padding: 0 14px 14px; flex-shrink: 0; align-items: center; }
            .button-container-left { flex: 1; display: flex; gap: 8px; }
            .button-container-right { display: flex; gap: 8px; }
            .compact-button { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; }

            /* 设置面板与遮罩 */
            .overlay {
                position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.45);
                backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                z-index: 10000; display: none; opacity: 0; transition: opacity 0.22s ease;
            }
            .overlay.show { display: block; opacity: 1; }

            @keyframes mpPanelIn {
                from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            #settings-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10001;
                width: 92%; max-width: 780px; max-height: 86vh; background-color: #ffffff;
                border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
                border: 1px solid rgba(0, 0, 0, 0.06); display: none; flex-direction: column; overflow: hidden;
                color: #1f2937 !important;
            }
            #settings-panel.show { display: flex !important; animation: mpPanelIn 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
            #settings-panel input[type="range"] { accent-color: ${c.primary}; cursor: pointer; }
            .settings-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 15px 22px; background: linear-gradient(135deg, ${lightenColor(c.header, 5)}, ${c.header});
                color: #fff; font-weight: 600; font-size: 16px; flex-shrink: 0;
            }
            .settings-content {
                padding: 18px 22px; overflow-y: auto !important; overflow-x: hidden !important; flex: 1 1 auto; min-height: 0;
                scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
            }
            .settings-content::-webkit-scrollbar { width: 6px; }
            .settings-content::-webkit-scrollbar-track { background: transparent; }
            .settings-content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            .settings-content::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

            .setting-section {
                margin-bottom: 16px; padding: 16px 18px; background-color: #f9fafb;
                border: 1px solid #eef0f3; border-radius: 10px;
            }
            .setting-section:last-child { margin-bottom: 0; }
            .setting-section h3 {
                margin: 0 0 12px 0; font-size: 15px; color: #1f2937 !important; font-weight: 600;
                display: flex; align-items: center; gap: 8px; text-align: left;
            }
            .setting-section h3::before {
                content: ''; display: inline-block; width: 3px; height: 15px;
                background-color: ${c.primary}; border-radius: 2px;
            }
            .setting-item {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 0; border-bottom: 1px solid #eef0f3;
            }
            .setting-item:last-child { border-bottom: none; padding-bottom: 0; }
            .setting-label { font-size: 13.5px; color: #1f2937; font-weight: 500; }
            .setting-description { color: #6b7280; line-height: 1.5; }
            #panel-shortcut-display { color: #1f2937; background-color: #fff; }
            .setting-control { display: flex; gap: 10px; align-items: center; }

            .toggle-switch {
                position: relative; width: 44px; height: 24px; background-color: #cbd5e1;
                border-radius: 12px; cursor: pointer; transition: background-color 0.25s; flex-shrink: 0;
            }
            .toggle-switch.active { background-color: ${c.primary}; }
            .toggle-switch::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
                background-color: #fff; border-radius: 50%; transition: left 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
            }
            .toggle-switch.active::after { left: 22px; }

            .radio-group {
                display: inline-flex; gap: 4px; padding: 3px; background-color: #eef0f4;
                border: 1px solid #e2e6ed; border-radius: 8px;
            }
            .radio-option {
                padding: 5px 12px; border: none; border-radius: 6px; cursor: pointer;
                transition: all 0.2s; font-size: 12.5px; font-weight: 500; color: #4b5563; background-color: transparent;
            }
            .radio-option:hover { color: #111827; }
            .radio-option.active {
                background-color: ${c.primary}; color: #fff;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
            }

            .style-list { margin-top: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .style-item {
                display: flex; align-items: center; gap: 6px; padding: 8px 10px;
                background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;
                transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s;
            }
            .style-item:hover { background-color: #f3f4f6; border-color: #d1d5db; }
            .style-item.dragging { opacity: 0.45; }
            .style-item.drag-over { border-top: 3px solid ${c.primary}; }
            .drag-handle { font-size: 14px; color: #9ca3af; cursor: grab; padding: 0 3px; user-select: none; }
            .drag-handle:active { cursor: grabbing; }
            .style-item-name { flex: 1; font-size: 12.5px; font-weight: 500; color: #1f2937; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .style-controls { display: flex; gap: 4px; align-items: center; }

            .size-picker-wrapper { position: relative; }
            .size-preview {
                width: 32px; height: 24px; border-radius: 5px; cursor: pointer; border: 1px solid #d1d5db;
                transition: border-color 0.2s, transform 0.15s; display: flex; align-items: center; justify-content: center;
                font-size: 11px; font-weight: 600; background: #fff; color: #1f2937;
            }
            .size-preview:hover { border-color: ${c.primary}; transform: scale(1.06); }
            .size-dropdown {
                display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
                margin-bottom: 5px; padding: 4px; background: #fff; border: 1px solid #e5e7eb;
                border-radius: 8px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14); z-index: 1000; min-width: 58px;
            }
            .size-dropdown.show { display: block; }
            .size-option {
                padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;
                transition: background-color 0.15s; text-align: center; margin-bottom: 2px;
                color: #1f2937; background-color: transparent;
            }
            .size-option:last-child { margin-bottom: 0; }
            .size-option:hover { background-color: ${hexToRgba(c.primary, 0.12)}; }
            .size-option.active { background-color: ${c.primary}; color: #fff; font-weight: 600; }

            .delete-btn-mini {
                padding: 4px 8px; background-color: #ef4444; color: #fff; border: none;
                border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background-color 0.2s;
            }
            .delete-btn-mini:hover { background-color: #dc2626; }
            .rename-btn-mini {
                padding: 4px 8px; background-color: ${c.primary}; color: #fff; border: none;
                border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background-color 0.2s;
            }
            .rename-btn-mini:hover { background-color: ${darkenColor(c.primary, 10)}; }

            .search-engine-list { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
            .search-engine-name { font-weight: 600; color: ${c.primary}; font-size: 13px; }
            .search-engine-url { font-size: 11px; color: #6b7280; margin-top: 2px; }
            .add-search-btn {
                padding: 7px 14px; background-color: ${c.action}; color: #fff; border: none;
                border-radius: 6px; cursor: pointer; font-size: 12.5px; font-weight: 500;
                margin-top: 10px; transition: background-color 0.2s, transform 0.15s;
            }
            .add-search-btn:hover { background-color: ${darkenColor(c.action, 10)}; }
            .add-search-btn:active { transform: scale(0.97); }

            .module-config-item {
                display: flex; align-items: center; gap: 12px; padding: 12px;
                background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;
                margin-bottom: 8px; transition: background-color 0.2s;
            }
            .module-config-item:hover { background-color: #f3f4f6; }
            .module-drag-handle { font-size: 16px; color: #9ca3af; cursor: grab; padding: 0 4px; user-select: none; }
            .module-name { flex: 0 0 80px; font-size: 13.5px; font-weight: 500; }
            .shared-domains-list { width: 100%; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }

            /* 轻量级 Toast 通知 */
            #mp-nav-toast {
                position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(16px);
                z-index: 10005; padding: 9px 18px; border-radius: 8px;
                background: rgba(17, 24, 39, 0.9); color: #fff; font-size: 13px; font-weight: 500;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); backdrop-filter: blur(8px);
                opacity: 0; pointer-events: none; transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
            }
            #mp-nav-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
            #mp-nav-toast.mp-toast-success { background: rgba(16, 185, 129, 0.94); }
            #mp-nav-toast.mp-toast-warn { background: rgba(245, 158, 11, 0.94); }
        `;

        const themeCss = (siteConfig.panelTheme === 'light' || siteConfig.panelTheme === 'dark')
            ? buildThemeCss(getThemePalette(siteConfig.panelTheme, c.primary))
            : '';

        return baseCss + themeCss;
    }

    let _dynamicStyleEl = null;
    function applyStyles() {
        const css = buildAllStyles();
        if (_dynamicStyleEl && _dynamicStyleEl.isConnected) {
            _dynamicStyleEl.textContent = css;
            return;
        }
        const injected = typeof GM_addStyle === 'function' ? GM_addStyle(css) : null;
        if (injected && injected.tagName === 'STYLE') {
            _dynamicStyleEl = injected;
        } else {
            const style = document.createElement('style');
            style.id = 'mp-nav-dynamic-style';
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            _dynamicStyleEl = style;
        }
    }

    const container = document.createElement('div');
    container.id = 'multi-platform-panel';
    document.body.appendChild(container);

    applyStyles();

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    const expandButton = document.createElement('div');
    expandButton.id = 'expand-button';
    expandButton.textContent = siteConfig.position === 'top' ? '▼' : siteConfig.position === 'bottom' ? '▲' : '▶';
    container.appendChild(expandButton);

    // 通用拖拽排序辅助函数
    function enableDragSort(listEl, itemSelector, onReorder) {
        let draggedItem = null;
        listEl.addEventListener('dragstart', (e) => {
            const item = e.target.closest(itemSelector);
            if (!item || !listEl.contains(item)) return;
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        listEl.addEventListener('dragend', () => {
            if (!draggedItem) return;
            draggedItem.classList.remove('dragging');
            listEl.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over'));
            draggedItem = null;
            onReorder();
        });
        listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        listEl.addEventListener('dragenter', (e) => {
            e.preventDefault();
            const target = e.target.closest(itemSelector);
            if (!draggedItem || !target || target === draggedItem || !listEl.contains(target)) return;
            const rect = target.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            listEl.insertBefore(draggedItem, e.clientY < midpoint ? target : target.nextSibling);
        });
        listEl.addEventListener('drop', (e) => {
            e.preventDefault();
            listEl.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over'));
        });
    }

    // 通用显示/隐藏切换按钮
    function createVisibilityToggleBtn(itemObj, rowEl, onSave) {
        const btn = document.createElement('button');
        const syncState = () => {
            btn.textContent = itemObj.hidden ? '👁' : '👁‍🗨';
            btn.title = itemObj.hidden ? '显示' : '隐藏';
            btn.style.opacity = itemObj.hidden ? '0.5' : '1';
            rowEl.style.opacity = itemObj.hidden ? '0.58' : '1';
        };
        btn.className = 'rename-btn-mini';
        syncState();
        btn.onclick = () => {
            itemObj.hidden = !itemObj.hidden;
            onSave();
            renderPanel();
            syncState();
        };
        return btn;
    }

    function createSettingsPanel() {
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'settings-panel';

        settingsPanel.innerHTML = `
            <div class="settings-header">
                <span>高级设置</span>
                <span class="close-button" style="cursor: pointer;">×</span>
            </div>
            <div class="settings-content">
                <div class="setting-section">
                    <h3>基本设置</h3>
                    <div class="setting-item">
                        <span class="setting-label">面板名称</span>
                        <div class="setting-control">
                            <input type="text" id="custom-panel-name" value="${escapeHtml(siteConfig.customPanelName || '')}" placeholder="${escapeHtml(platformData[currentPlatform].name)}导航" style="width: 200px; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background-color: #fff; color: #111827;">
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">面板位置</span>
                        <div class="setting-control">
                            <div class="radio-group">
                                <div class="radio-option ${siteConfig.position === 'left' ? 'active' : ''}" data-position="left">左侧</div>
                                <div class="radio-option ${siteConfig.position === 'right' ? 'active' : ''}" data-position="right">右侧</div>
                                <div class="radio-option ${siteConfig.position === 'top' ? 'active' : ''}" data-position="top">顶栏</div>
                                <div class="radio-option ${siteConfig.position === 'bottom' ? 'active' : ''}" data-position="bottom">底栏</div>
                            </div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">默认展开面板</span>
                        <div class="setting-control">
                            <div class="toggle-switch ${siteConfig.autoExpand ? 'active' : ''}" data-setting="autoExpand"></div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">左键当前页打开</span>
                        <div class="setting-control">
                            <div class="toggle-switch ${siteConfig.openInCurrentTab ? 'active' : ''}" data-setting="openInCurrentTab"></div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">展开/收起快捷键</span>
                        <div class="setting-control" style="gap: 8px;">
                            <span id="panel-shortcut-display" style="font-size: 13px; min-width: 70px; text-align: center; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px;">${getPanelShortcut() ? formatShortcut(getPanelShortcut()) : '未设置'}</span>
                            <button class="rename-btn-mini" id="panel-shortcut-record-btn">${getPanelShortcut() ? '修改' : '设置'}</button>
                            <button class="rename-btn-mini" id="panel-shortcut-clear-btn">清除</button>
                        </div>
                    </div>
                    <div class="setting-description" style="font-size: 12px; margin-top: 4px;">
                        全局设置：所有启用面板的网站共用同一个快捷键，修改后立即在各网站生效。
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">主题色</span>
                        <div class="setting-control">
                            <input type="color" id="primary-color-picker" value="${siteConfig.primaryColor}" style="width: 52px; height: 28px; border: none; outline: none; border-radius: 6px; cursor: pointer; padding: 0;">
                            <button class="rename-btn-mini" id="reset-color-btn" style="margin-left: 4px;">恢复默认</button>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">配色模式</span>
                        <div class="setting-control">
                            <div class="radio-group">
                                <div class="radio-option ${siteConfig.panelTheme !== 'light' && siteConfig.panelTheme !== 'dark' ? 'active' : ''}" data-theme="default">默认</div>
                                <div class="radio-option ${siteConfig.panelTheme === 'light' ? 'active' : ''}" data-theme="light">浅色·抗干扰</div>
                                <div class="radio-option ${siteConfig.panelTheme === 'dark' ? 'active' : ''}" data-theme="dark">深色·抗干扰</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="setting-section" style="display: ${siteConfig.position === 'left' || siteConfig.position === 'right' ? 'block' : 'none'};">
                    <h3>侧边栏设置</h3>
                    <div class="setting-item">
                        <span class="setting-label">显示标题栏</span>
                        <div class="setting-control">
                            <div class="toggle-switch ${siteConfig.showTitle ? 'active' : ''}" data-setting="showTitle"></div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">网格列数</span>
                        <div class="setting-control">
                            <div class="radio-group">
                                <div class="radio-option ${siteConfig.gridColumns === 2 ? 'active' : ''}" data-columns="2">2列</div>
                                <div class="radio-option ${siteConfig.gridColumns === 3 ? 'active' : ''}" data-columns="3">3列</div>
                            </div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">搜索框位置</span>
                        <div class="setting-control">
                            <div class="radio-group">
                                <div class="radio-option ${siteConfig.searchPosition === 'top' ? 'active' : ''}" data-search-pos="top">顶部</div>
                                <div class="radio-option ${siteConfig.searchPosition === 'bottom' ? 'active' : ''}" data-search-pos="bottom">底部</div>
                            </div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">面板宽度</span>
                        <div class="setting-control">
                            <input type="range" min="250" max="500" value="${siteConfig.panelWidth}" id="panel-width-slider" style="width: 150px;">
                            <span id="panel-width-value">${siteConfig.panelWidth}px</span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">垂直偏移</span>
                        <div class="setting-control">
                            <input type="range" min="-80" max="80" value="${siteConfig.sideBarOffset}" id="sidebar-offset-slider" style="width: 150px;">
                            <span id="sidebar-offset-value">${siteConfig.sideBarOffset}%</span>
                        </div>
                    </div>
                </div>
                <div class="setting-section top-only" style="display: ${siteConfig.position === 'top' || siteConfig.position === 'bottom' ? 'block' : 'none'};">
                    <h3>顶栏/底栏设置</h3>
                    <div class="setting-item">
                        <span class="setting-label">${siteConfig.position === 'bottom' ? '底栏' : '顶栏'}宽度</span>
                        <div class="setting-control">
                            <input type="range" id="topbar-width-slider" min="400" max="1600" value="${siteConfig.topBarWidth}" style="width: 150px;">
                            <span id="topbar-width-value">${siteConfig.topBarWidth}px</span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">${siteConfig.position === 'bottom' ? '底栏' : '顶栏'}偏移</span>
                        <div class="setting-control">
                            <input type="range" id="topbar-offset-slider" min="-80" max="80" value="${siteConfig.topBarOffset}" style="width: 150px;">
                            <span id="topbar-offset-value">${siteConfig.topBarOffset}%</span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">${siteConfig.position === 'bottom' ? '底栏' : '顶栏'}高度</span>
                        <div class="setting-control">
                            <input type="range" id="topbar-height-slider" min="40" max="120" value="${siteConfig.topBarHeight}" style="width: 150px;">
                            <span id="topbar-height-value">${siteConfig.topBarHeight}px</span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <span class="setting-label">收藏默认展开</span>
                        <div class="setting-control">
                            <div class="toggle-switch ${siteConfig.autoExpandContent ? 'active' : ''}" data-setting="autoExpandContent"></div>
                        </div>
                    </div>
                </div>
                <div class="setting-section">
                    <h3>数据管理</h3>
                    <div class="setting-item">
                        <span class="setting-label">备份与恢复</span>
                        <div class="setting-control" style="gap: 8px;">
                            <button class="rename-btn-mini" id="export-data-btn">导出数据</button>
                            <button class="rename-btn-mini" id="import-data-btn">导入数据</button>
                        </div>
                    </div>
                    <div class="setting-description" style="font-size: 12px; margin-top: 8px;">
                        导出会生成包含所有站点的收藏、配置和启用状态的 JSON 备份文件；导入时可选"覆盖"（用备份替换现有数据）或"合并"（保留现有数据，仅追加备份中新增的收藏）。
                    </div>
                </div>
                <div class="setting-section">
                    <h3>共享网址管理</h3>
                    <div class="setting-item" style="flex-direction: column; align-items: flex-start;">
                        <span class="setting-label" style="margin-bottom: 8px;">共享数据的域名列表</span>
                        <div class="setting-description" style="font-size: 12px; margin-bottom: 10px;">
                            用于镜像网站数据共享。添加镜像域名后,收藏数据将在这些域名间共享,但点击链接时会自动跳转到当前域名对应的页面。
                        </div>
                        <div class="shared-domains-list" id="shared-domains-list"></div>
                        <div style="display: flex; gap: 10px;">
                            <button class="add-search-btn" id="add-shared-domain-btn">+ 添加共享域名</button>
                            <button class="add-search-btn" id="migrate-mirror-data-btn" style="background-color: #ef4444;">迁移镜像数据到本站</button>
                        </div>
                    </div>
                </div>
                <div class="setting-section">
                    <h3>样式管理</h3>
                    <div class="style-list" id="style-list"></div>
                </div>
                <div class="setting-section">
                    <h3>搜索引擎管理</h3>
                    <div class="search-engine-list" id="search-engine-list"></div>
                    <button class="add-search-btn" id="add-search-engine-btn">+ 添加搜索引擎</button>
                </div>
                <div class="setting-section top-only" style="display: ${siteConfig.position === 'top' || siteConfig.position === 'bottom' ? 'block' : 'none'};">
                    <h3>顶栏底栏模块排序</h3>
                    <div class="style-list" id="topbar-modules-list"></div>
                </div>
            </div>
        `;

        document.body.appendChild(settingsPanel);

        // 面板尺寸滑块（实时生效）
        const widthSlider = settingsPanel.querySelector('#panel-width-slider');
        const widthValue = settingsPanel.querySelector('#panel-width-value');
        if (widthSlider) {
            widthSlider.oninput = () => {
                siteConfig.panelWidth = parseInt(widthSlider.value, 10);
                widthValue.textContent = siteConfig.panelWidth + 'px';
                saveSiteConfig();
                applyStyles();
            };
        }

        // 侧边栏偏移滑块
        const sidebarOffsetSlider = settingsPanel.querySelector('#sidebar-offset-slider');
        const sidebarOffsetValue = settingsPanel.querySelector('#sidebar-offset-value');
        if (sidebarOffsetSlider) {
            sidebarOffsetSlider.oninput = () => {
                siteConfig.sideBarOffset = parseInt(sidebarOffsetSlider.value, 10);
                sidebarOffsetValue.textContent = siteConfig.sideBarOffset + '%';
                saveSiteConfig();
                const panelContainer = document.querySelector('#panel-container');
                const expBtn = document.querySelector('#expand-button');
                if (panelContainer) panelContainer.style.top = `calc(50% + ${siteConfig.sideBarOffset}%)`;
                if (expBtn) expBtn.style.top = `calc(50% + ${siteConfig.sideBarOffset}%)`;
            };
        }

        // 顶栏宽度滑块（仅top/bottom模式）
        const topbarWidthSlider = settingsPanel.querySelector('#topbar-width-slider');
        const topbarWidthValue = settingsPanel.querySelector('#topbar-width-value');
        if (topbarWidthSlider) {
            topbarWidthSlider.oninput = () => {
                siteConfig.topBarWidth = parseInt(topbarWidthSlider.value, 10);
                topbarWidthValue.textContent = siteConfig.topBarWidth + 'px';
                saveSiteConfig();
                const favContainer = document.querySelector('.favorites-buttons-container');
                if (favContainer) favContainer.style.maxWidth = siteConfig.topBarWidth + 'px';
            };
        }

        // 顶栏偏移滑块（仅top/bottom模式）
        const topbarOffsetSlider = settingsPanel.querySelector('#topbar-offset-slider');
        const topbarOffsetValue = settingsPanel.querySelector('#topbar-offset-value');
        if (topbarOffsetSlider) {
            topbarOffsetSlider.oninput = () => {
                siteConfig.topBarOffset = parseInt(topbarOffsetSlider.value, 10);
                topbarOffsetValue.textContent = siteConfig.topBarOffset + '%';
                saveSiteConfig();
                const favContainer = document.querySelector('.favorites-buttons-container');
                if (favContainer) favContainer.style.transform = `translateX(${siteConfig.topBarOffset}%)`;
            };
        }

        // 顶栏高度滑块（仅top/bottom模式）
        const topbarHeightSlider = settingsPanel.querySelector('#topbar-height-slider');
        const topbarHeightValue = settingsPanel.querySelector('#topbar-height-value');
        if (topbarHeightSlider) {
            topbarHeightSlider.oninput = () => {
                siteConfig.topBarHeight = parseInt(topbarHeightSlider.value, 10);
                topbarHeightValue.textContent = siteConfig.topBarHeight + 'px';
                saveSiteConfig();
                const favContainer = document.querySelector('.favorites-buttons-container');
                const buttonsGrid = document.querySelector('#buttons-grid');
                if (favContainer) {
                    favContainer.style.height = siteConfig.topBarHeight + 'px';
                    favContainer.style.minHeight = siteConfig.topBarHeight + 'px';
                    favContainer.style.maxHeight = siteConfig.topBarHeight + 'px';
                }
                if (buttonsGrid) {
                    buttonsGrid.style.minHeight = (siteConfig.topBarHeight - 10) + 'px';
                }
            };
        }

        // 辅助函数：只更新模块排序列表，避免刷新整个设置面板
        function updateModulesOrderList(panel, sortedModules) {
            const modulesListContainer = panel.querySelector('#topbar-modules-list');
            if (!modulesListContainer) return;

            const moduleNames = {
                search: '搜索框',
                favorites: '收藏内容',
                buttons: '操作按钮'
            };

            modulesListContainer.innerHTML = '';
            const reorderedModules = [...sortedModules].sort((a, b) => a.order - b.order);

            reorderedModules.forEach((module, index) => {
                const item = document.createElement('div');
                item.className = 'module-config-item';
                item.style.cssText = 'flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = moduleNames[module.id] || module.id;
                nameSpan.style.cssText = 'font-size: 13.5px; font-weight: 600;';
                item.appendChild(nameSpan);

                const arrowContainer = document.createElement('div');
                arrowContainer.style.cssText = 'display: flex; gap: 8px;';

                const makeMoveBtn = (label, targetIndex, disabled) => {
                    const btn = document.createElement('button');
                    btn.textContent = label;
                    btn.className = 'rename-btn-mini';
                    btn.style.width = '36px';
                    btn.disabled = disabled;
                    if (disabled) btn.style.opacity = '0.3';
                    btn.onclick = () => {
                        const temp = reorderedModules[targetIndex].order;
                        reorderedModules[targetIndex].order = module.order;
                        module.order = temp;
                        saveSiteConfig();
                        updateModulesOrderList(panel, reorderedModules);
                        renderPanel();
                    };
                    return btn;
                };

                arrowContainer.appendChild(makeMoveBtn('←', index - 1, index === 0));
                arrowContainer.appendChild(makeMoveBtn('→', index + 1, index === reorderedModules.length - 1));
                item.appendChild(arrowContainer);

                const visibleToggle = document.createElement('div');
                visibleToggle.className = `toggle-switch ${module.visible ? 'active' : ''}`;
                visibleToggle.style.marginTop = '6px';
                visibleToggle.onclick = () => {
                    visibleToggle.classList.toggle('active');
                    module.visible = visibleToggle.classList.contains('active');
                    saveSiteConfig();
                    renderPanel();
                };
                item.appendChild(visibleToggle);

                modulesListContainer.appendChild(item);
            });
        }

        // 顶栏模块配置
        const modulesListContainer = settingsPanel.querySelector('#topbar-modules-list');
        if (modulesListContainer && (siteConfig.position === 'top' || siteConfig.position === 'bottom')) {
            modulesListContainer.style.display = 'flex';
            modulesListContainer.style.gap = '12px';
            updateModulesOrderList(settingsPanel, siteConfig.topBarModulesOrder);
        }

        // Toggle开关事件处理（跳过无 data-setting 的顶栏模块开关）
        settingsPanel.querySelectorAll('.toggle-switch').forEach(toggle => {
            if (!toggle.dataset.setting) return;
            toggle.onclick = () => {
                const setting = toggle.dataset.setting;
                siteConfig[setting] = !siteConfig[setting];
                toggle.classList.toggle('active');
                saveSiteConfig();
                if (setting === 'autoExpand') {
                    showToast('已保存，下次打开页面时生效', 'success');
                } else {
                    renderPanel();
                    showToast('设置已生效', 'success');
                }
            };
        });

        // 样式列表
        const styleList = settingsPanel.querySelector('#style-list');
        const defaultBtnColor = getThemeColors().button;

        platformUsers.forEach((user) => {
            const item = document.createElement('div');
            item.className = 'style-item';
            item.draggable = true;
            item._userObject = user;

            const size = user.size || '1x';
            const color = user.color || defaultBtnColor;

            item.innerHTML = `
                <span class="drag-handle">☰</span>
                <span class="style-item-name" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</span>
            `;

            const controls = document.createElement('div');
            controls.className = 'style-controls';

            // 颜色选择 - 原生颜色选择器
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = color;
            colorInput.style.cssText = 'width: 24px; height: 24px; border: none; border-radius: 4px; cursor: pointer; padding: 0; background: transparent;';
            colorInput.title = '选择颜色';
            colorInput.oninput = () => {
                user.color = colorInput.value;
                saveUsers();
                renderPanel();
            };
            controls.appendChild(colorInput);

            // 尺寸选择 - 下拉菜单
            const sizeWrapper = document.createElement('div');
            sizeWrapper.className = 'size-picker-wrapper';
            const sizePreview = document.createElement('div');
            sizePreview.className = 'size-preview';
            sizePreview.textContent = size;
            sizeWrapper.appendChild(sizePreview);

            const sizeDropdown = document.createElement('div');
            sizeDropdown.className = 'size-dropdown';
            ['1x', '2x', '3x'].forEach(s => {
                const option = document.createElement('div');
                option.className = 'size-option' + (s === size ? ' active' : '');
                option.textContent = s;
                option.onclick = () => {
                    user.size = s;
                    saveUsers();
                    sizePreview.textContent = s;
                    sizeDropdown.classList.remove('show');
                    sizeDropdown.querySelectorAll('.size-option').forEach(o => o.classList.remove('active'));
                    option.classList.add('active');
                    renderPanel();
                };
                sizeDropdown.appendChild(option);
            });
            sizeWrapper.appendChild(sizeDropdown);
            controls.appendChild(sizeWrapper);

            sizePreview.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.size-dropdown').forEach(d => d !== sizeDropdown && d.classList.remove('show'));
                sizeDropdown.classList.toggle('show');
            };

            // 隐藏/显示按钮
            controls.appendChild(createVisibilityToggleBtn(user, item, saveUsers));

            // 重命名按钮
            const renameBtn = document.createElement('button');
            renameBtn.className = 'rename-btn-mini';
            renameBtn.textContent = '重命名';
            renameBtn.onclick = () => {
                const newName = prompt('请输入新名称：', user.name);
                if (newName && newName.trim() && newName !== user.name) {
                    user.name = newName.trim();
                    saveUsers();
                    renderPanel();
                    const nameSpan = item.querySelector('.style-item-name');
                    if (nameSpan) {
                        nameSpan.textContent = user.name;
                        nameSpan.title = user.name;
                    }
                }
            };
            controls.appendChild(renameBtn);

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn-mini';
            deleteBtn.textContent = '删除';
            deleteBtn.onclick = () => {
                if (confirm(`确定要删除 "${user.name}" 吗？`)) {
                    const idx = platformUsers.indexOf(user);
                    if (idx > -1) platformUsers.splice(idx, 1);
                    saveUsers();
                    renderPanel();
                    item.remove();
                }
            };
            controls.appendChild(deleteBtn);

            item.appendChild(controls);
            styleList.appendChild(item);
        });

        enableDragSort(styleList, '.style-item', () => {
            const newOrder = Array.from(styleList.querySelectorAll('.style-item'))
                .map(el => el._userObject)
                .filter(Boolean);
            platformUsers.length = 0;
            platformUsers.push(...newOrder);
            saveUsers();
            renderPanel();
        });

        // 搜索引擎列表
        const searchList = settingsPanel.querySelector('#search-engine-list');
        siteConfig.searchEngines.forEach((engine) => {
            const item = document.createElement('div');
            item.className = 'style-item';
            item.draggable = true;
            item._engineObject = engine;

            const dragHandle = document.createElement('span');
            dragHandle.className = 'drag-handle';
            dragHandle.textContent = '☰';
            item.appendChild(dragHandle);

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex: 1; min-width: 0;';
            infoDiv.innerHTML = `
                <div class="search-engine-name">${escapeHtml(engine.name)}</div>
                <div class="search-engine-url" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(engine.urlTemplate)}</div>
            `;
            item.appendChild(infoDiv);

            item.appendChild(createVisibilityToggleBtn(engine, item, saveSiteConfig));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn-mini';
            deleteBtn.textContent = '删除';
            deleteBtn.onclick = () => {
                if (confirm(`确定要删除搜索引擎 "${engine.name}" 吗？`)) {
                    const idx = siteConfig.searchEngines.indexOf(engine);
                    if (idx > -1) siteConfig.searchEngines.splice(idx, 1);
                    saveSiteConfig();
                    renderPanel();
                    item.remove();
                }
            };
            item.appendChild(deleteBtn);

            searchList.appendChild(item);
        });

        enableDragSort(searchList, '.style-item', () => {
            const newOrder = Array.from(searchList.querySelectorAll('.style-item'))
                .map(el => el._engineObject)
                .filter(Boolean);
            siteConfig.searchEngines.length = 0;
            siteConfig.searchEngines.push(...newOrder);
            saveSiteConfig();
            renderPanel();
        });

        // 共享域名列表
        const sharedDomainsList = settingsPanel.querySelector('#shared-domains-list');
        siteConfig.sharedDomains.forEach((domain) => {
            const item = document.createElement('div');
            item.className = 'style-item';

            const domainText = document.createElement('div');
            domainText.style.cssText = 'flex: 1; font-size: 13px; padding: 4px 0;';
            domainText.textContent = domain;
            if (domain === currentHost) {
                domainText.innerHTML += ' <span style="color: #9ca3af; font-size: 11px;">(当前域名)</span>';
            }
            item.appendChild(domainText);

            if (domain !== currentHost) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn-mini';
                deleteBtn.textContent = '删除';
                deleteBtn.onclick = () => {
                    if (confirm(`确定要删除镜像域名 "${domain}" 吗?\n\n删除后,该域名将使用独立的数据存储。`)) {
                        const curIdx = siteConfig.sharedDomains.indexOf(domain);
                        if (curIdx > -1) siteConfig.sharedDomains.splice(curIdx, 1);
                        saveSiteConfig();

                        // 【双向删除】从镜像站点也删除当前域名
                        const mirrorPlatform = domain.replace(/\./g, '_');
                        const mirrorConfigKey = `${mirrorPlatform}_config`;
                        const mirrorConfig = GM_getValue(mirrorConfigKey, {});
                        if (mirrorConfig.sharedDomains) {
                            const idx = mirrorConfig.sharedDomains.indexOf(currentHost);
                            if (idx > -1) {
                                mirrorConfig.sharedDomains.splice(idx, 1);
                                GM_setValue(mirrorConfigKey, mirrorConfig);
                            }
                        }

                        alert('镜像域名已删除，双向关系已解除，页面将刷新。');
                        location.reload();
                    }
                };
                item.appendChild(deleteBtn);
            }

            sharedDomainsList.appendChild(item);
        });

        // 事件监听
        settingsPanel.querySelector('.close-button').onclick = () => {
            settingsPanel.classList.remove('show');
            overlay.classList.remove('show');
        };

        settingsPanel.querySelectorAll('.radio-option[data-position]').forEach(option => {
            option.onclick = () => {
                siteConfig.position = option.dataset.position;
                saveSiteConfig();
                option.parentElement.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                alert('面板位置已更改！页面将刷新。');
                location.reload();
            };
        });

        settingsPanel.querySelectorAll('.radio-option[data-columns]').forEach(option => {
            option.onclick = () => {
                siteConfig.gridColumns = parseInt(option.dataset.columns, 10);
                saveSiteConfig();
                settingsPanel.querySelectorAll('.radio-option[data-columns]').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                applyStyles();
                showToast(`已切换为 ${siteConfig.gridColumns} 列布局`, 'success');
            };
        });

        // 配色模式切换（实时生效）
        settingsPanel.querySelectorAll('.radio-option[data-theme]').forEach(option => {
            option.onclick = () => {
                siteConfig.panelTheme = option.dataset.theme;
                saveSiteConfig();
                settingsPanel.querySelectorAll('.radio-option[data-theme]').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                applyStyles();
                showToast('配色模式已切换', 'success');
            };
        });

        settingsPanel.querySelectorAll('.radio-option[data-search-pos]').forEach(option => {
            option.onclick = () => {
                siteConfig.searchPosition = option.dataset.searchPos;
                saveSiteConfig();
                settingsPanel.querySelectorAll('.radio-option[data-search-pos]').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                renderPanel();
                showToast('搜索框位置已更新', 'success');
            };
        });

        settingsPanel.querySelector('#add-search-engine-btn').onclick = () => {
            const name = prompt('请输入搜索引擎名称（例如：Google）：');
            if (!name) return;
            const urlTemplate = prompt('请输入搜索URL模板（使用 {query} 作为搜索词占位符）：\n例如：https://www.google.com/search?q={query}');
            if (!urlTemplate || !urlTemplate.includes('{query}')) {
                alert('URL模板必须包含 {query} 占位符');
                return;
            }
            siteConfig.searchEngines.push({ name, urlTemplate });
            saveSiteConfig();
            renderPanel();
            settingsPanel.remove();
            openSettings();
        };

        // 添加共享域名
        settingsPanel.querySelector('#add-shared-domain-btn').onclick = () => {
            const domain = prompt('请输入要共享数据的域名:\n\n例如: example.com 或 github.com\n\n添加后,该域名的数据将与当前网站共享。');
            if (!domain) return;

            const domainPattern = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/;
            if (!domainPattern.test(domain)) {
                alert('域名格式不正确,请输入有效的域名(例如: example.com)');
                return;
            }
            if (siteConfig.sharedDomains.includes(domain)) {
                alert('该域名已在共享列表中');
                return;
            }

            siteConfig.sharedDomains.push(domain);
            saveSiteConfig();
            alert('共享域名已添加,页面将刷新以应用更改。');
            location.reload();
        };

        // 点击空白处关闭尺寸下拉菜单（先移除旧监听器避免累积）
        if (_closeDropdownsHandler) {
            document.removeEventListener('click', _closeDropdownsHandler);
        }
        _closeDropdownsHandler = () => {
            settingsPanel.querySelectorAll('.size-dropdown').forEach(d => d.classList.remove('show'));
        };
        document.addEventListener('click', _closeDropdownsHandler);

        // 自定义面板名称
        const customNameInput = settingsPanel.querySelector('#custom-panel-name');
        if (customNameInput) {
            customNameInput.addEventListener('blur', () => {
                siteConfig.customPanelName = customNameInput.value.trim();
                saveSiteConfig();
                renderPanel();
            });
            customNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') customNameInput.blur();
            });
        }

        // 面板展开/收起快捷键
        const shortcutDisplay = settingsPanel.querySelector('#panel-shortcut-display');
        const shortcutRecordBtn = settingsPanel.querySelector('#panel-shortcut-record-btn');
        const shortcutClearBtn = settingsPanel.querySelector('#panel-shortcut-clear-btn');
        if (shortcutRecordBtn && shortcutDisplay) {
            shortcutRecordBtn.onclick = () => {
                shortcutDisplay.textContent = '请按键（Esc 取消）';
                shortcutRecordBtn.textContent = '录制中';
                _recordingShortcut = true;
                const finishRecording = () => {
                    _recordingShortcut = false;
                    document.removeEventListener('keydown', recordHandler, true);
                    shortcutRecordBtn.textContent = getPanelShortcut() ? '修改' : '设置';
                    shortcutDisplay.textContent = getPanelShortcut() ? formatShortcut(getPanelShortcut()) : '未设置';
                };
                const recordHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const keyName = e.key.toLowerCase();
                    if (keyName === 'escape') { finishRecording(); return; }
                    if (['control', 'alt', 'shift', 'meta'].includes(keyName)) return;
                    const parts = [];
                    if (e.ctrlKey) parts.push('ctrl');
                    if (e.altKey) parts.push('alt');
                    if (e.shiftKey) parts.push('shift');
                    if (e.metaKey) parts.push('meta');
                    parts.push(e.key === ' ' ? 'space' : keyName);
                    if (parts.length === 1 && keyName.length === 1) {
                        showToast('为避免误触，字母/数字键需配合 Ctrl / Alt / Shift 使用', 'warn');
                        return;
                    }
                    setPanelShortcut(parts.join('+'));
                    finishRecording();
                    showToast(`快捷键已全局设置：${formatShortcut(getPanelShortcut())}`, 'success');
                };
                document.addEventListener('keydown', recordHandler, true);
            };
        }
        if (shortcutClearBtn && shortcutDisplay) {
            shortcutClearBtn.onclick = () => {
                setPanelShortcut('');
                shortcutDisplay.textContent = '未设置';
                if (shortcutRecordBtn) shortcutRecordBtn.textContent = '设置';
                showToast('快捷键已清除', 'info');
            };
        }

        // 主题色选择器（实时生效）
        const colorPicker = settingsPanel.querySelector('#primary-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', () => {
                siteConfig.primaryColor = colorPicker.value;
                applyStyles();
            });
            colorPicker.addEventListener('change', () => {
                siteConfig.primaryColor = colorPicker.value;
                saveSiteConfig();
                applyStyles();
                showToast('主题色已更新', 'success');
            });
        }

        // 恢复默认颜色按钮（实时生效）
        const resetColorBtn = settingsPanel.querySelector('#reset-color-btn');
        if (resetColorBtn) {
            resetColorBtn.addEventListener('click', () => {
                siteConfig.primaryColor = platformData[currentPlatform].color;
                if (colorPicker) colorPicker.value = siteConfig.primaryColor;
                saveSiteConfig();
                applyStyles();
                showToast('已恢复默认主题色', 'success');
            });
        }



        // 导出数据按钮
        const exportDataBtn = settingsPanel.querySelector('#export-data-btn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                exportData();
            });
        }

        // 导入数据按钮
        const importDataBtn = settingsPanel.querySelector('#import-data-btn');
        if (importDataBtn) {
            importDataBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                importData();
            });
        }

        // 迁移镜像数据按钮
        const migrateMirrorDataBtn = settingsPanel.querySelector('#migrate-mirror-data-btn');
        if (migrateMirrorDataBtn) {
            migrateMirrorDataBtn.addEventListener('click', () => {
                if (!siteConfig.sharedDomains || siteConfig.sharedDomains.length <= 1) {
                    alert('当前没有镜像站点');
                    return;
                }

                const mirrorSites = siteConfig.sharedDomains.filter(d => d !== currentHost);
                const message = `确定要将以下镜像站点的收藏数据迁移到本站吗？\n\n${mirrorSites.join('\n')}\n\n迁移后，这些数据将成为本站的独立收藏，即使删除镜像关系也不会丢失。`;

                if (!confirm(message)) return;

                let migratedCount = 0;
                const currentUsers = GM_getValue(storageKey, []);
                const urlSet = new Set(currentUsers.map(u => u.url));

                mirrorSites.forEach(domain => {
                    const mirrorPlatform = domain.replace(/\./g, '_');
                    const mirrorKey = `${mirrorPlatform}_users`;
                    const mirrorUsers = GM_getValue(mirrorKey, []);

                    mirrorUsers.forEach(user => {
                        const convertedUrl = convertUrlToCurrentDomain(user.url, domain);
                        if (!urlSet.has(convertedUrl)) {
                            currentUsers.push({
                                ...user,
                                url: convertedUrl
                            });
                            urlSet.add(convertedUrl);
                            migratedCount++;
                        }
                    });
                });

                if (migratedCount > 0) {
                    GM_setValue(storageKey, currentUsers);
                    alert(`成功迁移 ${migratedCount} 条收藏数据！页面将刷新。`);
                    location.reload();
                } else {
                    alert('没有新数据需要迁移。');
                }
            });
        }

        return settingsPanel;
    }

    function openSettings() {
        const oldPanel = document.getElementById('settings-panel');
        if (oldPanel) oldPanel.remove();
        const settingsPanel = createSettingsPanel();
        settingsPanel.classList.add('show');
        overlay.classList.add('show');
    }

    overlay.onclick = () => {
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) settingsPanel.classList.remove('show');
        overlay.classList.remove('show');
    };

    // 公共辅助：收藏当前页面 / 手动添加收藏
    function promptCollectCurrentPage() {
        const name = prompt('请输入收藏名称：', document.title);
        if (name && name.trim()) {
            platformUsers.push({ name: name.trim(), url: window.location.href, size: '1x' });
            saveUsers();
            renderPanel();
            showToast('已添加到收藏', 'success');
        }
    }

    function promptAddFavorite() {
        const name = prompt('请输入名称：');
        if (!name || !name.trim()) return;
        const url = prompt('请输入链接地址：');
        if (url && url.trim()) {
            platformUsers.push({ name: name.trim(), url: url.trim(), size: '1x' });
            saveUsers();
            renderPanel();
            showToast('已添加导航项', 'success');
        }
    }

    // 公共辅助：创建单个收藏按钮
    function createUserButtonElement(user) {
        const wrapper = document.createElement('div');
        wrapper.className = 'button-wrapper';
        wrapper.dataset.size = user.size || '1x';

        const button = document.createElement('a');
        button.className = 'user-button';
        button.href = user.url;
        button.textContent = user.name;
        button.title = user.name;
        if (user.color) button.style.setProperty('background-color', user.color, 'important');

        if (siteConfig.openInCurrentTab) {
            button.target = '_self';
            button.onmousedown = (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    window.open(button.href, '_blank');
                }
            };
        } else {
            button.target = '_blank';
        }

        wrapper.appendChild(button);
        return wrapper;
    }

    // 公共辅助：创建单个搜索引擎输入框项
    function createSearchEngineItem(engine, { itemClass, inputClass = '', btnClass = '', isHidden = false }) {
        const searchItem = document.createElement('div');
        searchItem.className = itemClass + (isHidden ? ' hidden' : '');

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        if (inputClass) searchInput.className = inputClass;
        searchInput.placeholder = engine.name;

        const searchBtn = document.createElement('button');
        if (btnClass) searchBtn.className = btnClass;
        searchBtn.textContent = '搜索';
        searchBtn.title = engine.name;

        const performSearch = () => {
            const query = searchInput.value.trim();
            if (!query) {
                showToast('请输入搜索内容', 'warn');
                searchInput.focus();
                return;
            }
            const url = engine.urlTemplate.replace('{query}', encodeURIComponent(query));
            window.open(url, '_blank');
            searchInput.value = '';
        };

        searchBtn.onclick = performSearch;
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        searchItem.appendChild(searchInput);
        searchItem.appendChild(searchBtn);
        return searchItem;
    }

    // 公共辅助：创建面板标题栏
    function renderPanelHeader(panelContainer) {
        if (!siteConfig.showTitle) return;
        const header = document.createElement('div');
        header.className = 'panel-header';
        const panelTitle = siteConfig.customPanelName || `${platformData[currentPlatform].name}导航`;
        header.innerHTML = `
            <div class="panel-title">${escapeHtml(panelTitle)}</div>
            <div class="header-buttons">
                <div class="settings-button" title="高级设置">⚙</div>
                <div class="close-button" title="收起">×</div>
            </div>
        `;
        panelContainer.appendChild(header);
        header.querySelector('.settings-button').onclick = openSettings;
        header.querySelector('.close-button').onclick = () => {
            panelContainer.classList.remove('expanded');
            expandButton.style.display = 'flex';
        };
    }

    function renderPanel() {
        const displayUsers = getDisplayUsers();

        // 清理旧的容器
        const oldPanel = document.getElementById('panel-container');
        const oldSearchTop = document.getElementById('search-top-container');
        const wasExpanded = oldPanel && oldPanel.classList.contains('expanded');
        if (oldPanel) oldPanel.remove();
        if (oldSearchTop) oldSearchTop.remove();

        // search-top模式：搜索框在顶部，内容在侧边
        if (siteConfig.position === 'search-top' && siteConfig.searchEngines.length > 0) {
            const c = getThemeColors();
            const searchTopContainer = document.createElement('div');
            searchTopContainer.id = 'search-top-container';
            searchTopContainer.style.cssText = `
                position: fixed; top: 0; left: 50%; transform: translateX(-50%);
                width: ${siteConfig.searchBoxWidth}px; height: ${siteConfig.searchBoxHeight}px;
                z-index: 10001; background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(12px);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14); border-radius: 0 0 10px 10px;
                display: flex; align-items: center; padding: 0 10px;
            `;

            const searchBox = document.createElement('div');
            searchBox.style.cssText = 'display: flex; width: 100%; gap: 8px;';

            const searchInput = document.createElement('input');
            searchInput.className = 'search-input';
            searchInput.placeholder = '输入搜索内容...';
            searchInput.style.cssText = `
                flex: 1; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 6px;
                font-size: 14px; height: ${siteConfig.searchBoxHeight - 10}px;
            `;

            let activeEngineIndex = 0;
            const searchButton = document.createElement('button');
            searchButton.className = 'search-button';
            searchButton.textContent = siteConfig.searchEngines[0].name;
            searchButton.style.cssText = `
                padding: 0 16px; background-color: ${c.primary}; color: #fff; border: none;
                border-radius: 6px; cursor: pointer; font-size: 13px; height: ${siteConfig.searchBoxHeight - 10}px;
            `;

            const performSearch = () => {
                const query = searchInput.value.trim();
                if (!query) { showToast('请输入搜索内容', 'warn'); return; }
                const url = siteConfig.searchEngines[activeEngineIndex].urlTemplate.replace('{query}', encodeURIComponent(query));
                window.open(url, '_blank');
            };

            searchButton.onclick = (e) => {
                if (e.shiftKey && siteConfig.searchEngines.length > 1) {
                    activeEngineIndex = (activeEngineIndex + 1) % siteConfig.searchEngines.length;
                    searchButton.textContent = siteConfig.searchEngines[activeEngineIndex].name;
                } else {
                    performSearch();
                }
            };
            searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });

            searchBox.appendChild(searchInput);
            searchBox.appendChild(searchButton);
            searchTopContainer.appendChild(searchBox);
            document.body.appendChild(searchTopContainer);

            const panelContainer = document.createElement('div');
            panelContainer.id = 'panel-container';
            if (wasExpanded || siteConfig.autoExpand) panelContainer.classList.add('expanded');
            container.appendChild(panelContainer);

            renderPanelHeader(panelContainer);

            const visibleEngines = siteConfig.searchEngines.filter(e => !e.hidden);
            const buildSearchList = (marginStyle) => {
                if (visibleEngines.length === 0) return null;
                const sc = document.createElement('div');
                sc.className = 'search-engines-container';
                sc.style.cssText = `width: 100%; ${marginStyle}`;
                visibleEngines.forEach(engine => {
                    sc.appendChild(createSearchEngineItem(engine, { itemClass: 'search-engine-item' }));
                });
                return sc;
            };

            if (siteConfig.searchPosition === 'top') {
                const topSc = buildSearchList('margin-bottom: 10px;');
                if (topSc) panelContainer.appendChild(topSc);
            }

            const buttonsGrid = document.createElement('div');
            buttonsGrid.id = 'buttons-grid';
            displayUsers.forEach((user) => {
                if (!user.hidden) buttonsGrid.appendChild(createUserButtonElement(user));
            });
            panelContainer.appendChild(buttonsGrid);

            if (siteConfig.searchPosition === 'bottom') {
                const botSc = buildSearchList('margin-top: 10px;');
                if (botSc) panelContainer.appendChild(botSc);
            }

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            const leftButtons = document.createElement('div');
            leftButtons.className = 'button-container-left';
            const rightButtons = document.createElement('div');
            rightButtons.className = 'button-container-right';

            const collectBtn = document.createElement('div');
            collectBtn.className = 'action-button';
            collectBtn.textContent = '收藏';
            collectBtn.onclick = promptCollectCurrentPage;
            leftButtons.appendChild(collectBtn);

            const addBtn = document.createElement('div');
            addBtn.className = 'action-button compact-button';
            addBtn.textContent = '+';
            addBtn.title = '添加';
            addBtn.onclick = promptAddFavorite;
            rightButtons.appendChild(addBtn);

            const settingsBtn = document.createElement('div');
            settingsBtn.className = 'action-button compact-button';
            settingsBtn.textContent = '⚙';
            settingsBtn.title = '高级设置';
            settingsBtn.onclick = openSettings;
            rightButtons.appendChild(settingsBtn);

            buttonContainer.appendChild(leftButtons);
            buttonContainer.appendChild(rightButtons);
            panelContainer.appendChild(buttonContainer);
            return;
        }

        // 顶栏/底栏动态模块模式
        if (siteConfig.position === 'top' || siteConfig.position === 'bottom') {
            const panelContainer = document.createElement('div');
            panelContainer.id = 'panel-container';
            if (wasExpanded || siteConfig.autoExpand) panelContainer.classList.add('expanded');
            container.appendChild(panelContainer);

            let buttonsGridRef = null;
            const createSearchModule = () => {
                const visibleEngines = siteConfig.searchEngines.filter(e => !e.hidden);
                if (visibleEngines.length === 0) return null;
                const searchContainer = document.createElement('div');
                searchContainer.className = 'search-engines-container';
                visibleEngines.forEach((engine, index) => {
                    searchContainer.appendChild(createSearchEngineItem(engine, {
                        itemClass: 'search-engine-item',
                        isHidden: index > 0 && !siteConfig.autoExpandContent
                    }));
                });
                return searchContainer;
            };

            const createFavoritesModule = () => {
                const buttonsGrid = document.createElement('div');
                buttonsGrid.id = 'buttons-grid';
                buttonsGridRef = buttonsGrid;
                displayUsers.forEach((user) => {
                    if (!user.hidden) buttonsGrid.appendChild(createUserButtonElement(user));
                });
                if (siteConfig.autoExpandContent) {
                    buttonsGrid.classList.add('expanded');
                    panelContainer.classList.add('content-expanded');
                }
                return buttonsGrid;
            };

            const createButtonsModule = () => {
                const isBottom = siteConfig.position === 'bottom';
                const expandBtn = document.createElement('div');
                expandBtn.className = 'action-button';
                expandBtn.innerHTML = siteConfig.autoExpandContent ? (isBottom ? '▼' : '▲') : (isBottom ? '▲' : '▼');
                expandBtn.title = siteConfig.autoExpandContent ? '收起' : '展开查看更多';
                expandBtn.onclick = () => {
                    const buttonsGrid = buttonsGridRef;
                    if (!buttonsGrid) return;
                    const isExpanded = buttonsGrid.classList.contains('expanded');
                    const searchItems = panelContainer.querySelectorAll('.search-engine-item');
                    if (isExpanded) {
                        buttonsGrid.classList.remove('expanded');
                        panelContainer.classList.remove('content-expanded');
                        expandBtn.innerHTML = isBottom ? '▲' : '▼';
                        expandBtn.title = '展开查看更多';
                        searchItems.forEach((item, idx) => { if (idx > 0) item.classList.add('hidden'); });
                    } else {
                        buttonsGrid.classList.add('expanded');
                        panelContainer.classList.add('content-expanded');
                        expandBtn.innerHTML = isBottom ? '▼' : '▲';
                        expandBtn.title = '收起';
                        searchItems.forEach(item => item.classList.remove('hidden'));
                    }
                };

                const makeBarBtn = (text, title, onClick) => {
                    const btn = document.createElement('div');
                    btn.className = 'action-button';
                    btn.textContent = text;
                    btn.title = title;
                    btn.onclick = onClick;
                    return btn;
                };

                const buttonsContainer = document.createElement('div');
                buttonsContainer.className = 'topbar-buttons-container';
                buttonsContainer.appendChild(expandBtn);
                buttonsContainer.appendChild(makeBarBtn('★', '收藏当前页', promptCollectCurrentPage));
                buttonsContainer.appendChild(makeBarBtn('+', '添加导航', promptAddFavorite));
                buttonsContainer.appendChild(makeBarBtn('⚙', '高级设置', openSettings));
                return buttonsContainer;
            };

            const mainContainer = document.createElement('div');
            mainContainer.className = 'favorites-buttons-container';
            const moduleCreators = {
                search: createSearchModule,
                favorites: createFavoritesModule,
                buttons: createButtonsModule
            };

            const sortedModules = [...siteConfig.topBarModulesOrder].sort((a, b) => a.order - b.order);
            sortedModules.forEach(module => {
                const moduleId = typeof module === 'string' ? module : module.id;
                const isVisible = typeof module === 'string' ? true : (module.visible !== false);
                if (isVisible && moduleCreators[moduleId]) {
                    const moduleElement = moduleCreators[moduleId]();
                    if (moduleElement) mainContainer.appendChild(moduleElement);
                }
            });

            const tempCloseBtn = document.createElement('button');
            tempCloseBtn.className = 'temp-close-btn';
            tempCloseBtn.innerHTML = '×';
            tempCloseBtn.title = '临时关闭';
            tempCloseBtn.onclick = () => { panelContainer.style.display = 'none'; };
            mainContainer.appendChild(tempCloseBtn);

            panelContainer.appendChild(mainContainer);
            return;
        }

        // 常规侧边栏模式（left / right）
        const panelContainer = document.createElement('div');
        panelContainer.id = 'panel-container';
        if (wasExpanded || siteConfig.autoExpand) panelContainer.classList.add('expanded');
        container.appendChild(panelContainer);

        renderPanelHeader(panelContainer);

        let searchContainer = null;
        const visibleEngines = siteConfig.searchEngines.filter(e => !e.hidden);
        if (visibleEngines.length > 0) {
            searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';
            visibleEngines.forEach((engine) => {
                const box = createSearchEngineItem(engine, {
                    itemClass: 'search-box',
                    inputClass: 'search-input',
                    btnClass: 'search-button'
                });
                box.style.marginBottom = '6px';
                searchContainer.appendChild(box);
            });
            const lastBox = searchContainer.lastElementChild;
            if (lastBox) lastBox.style.marginBottom = '0';
        }

        if (searchContainer && siteConfig.searchPosition === 'top') {
            panelContainer.appendChild(searchContainer);
        }

        const buttonsGrid = document.createElement('div');
        buttonsGrid.id = 'buttons-grid';
        displayUsers.forEach((user) => {
            if (!user.hidden) buttonsGrid.appendChild(createUserButtonElement(user));
        });
        panelContainer.appendChild(buttonsGrid);

        // 操作按钮
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        const leftButtons = document.createElement('div');
        leftButtons.className = 'button-container-left';
        const rightButtons = document.createElement('div');
        rightButtons.className = 'button-container-right';

        const makeActionBtn = (text, title, compact, onClick) => {
            const btn = document.createElement('div');
            btn.className = 'action-button' + (compact ? ' compact-button' : '');
            btn.textContent = text;
            if (title) btn.title = title;
            btn.onclick = onClick;
            return btn;
        };

        rightButtons.appendChild(makeActionBtn('★', '收藏当前页', true, promptCollectCurrentPage));
        rightButtons.appendChild(makeActionBtn('+', '添加导航', true, promptAddFavorite));
        rightButtons.appendChild(makeActionBtn('⚙', '高级设置', true, openSettings));

        buttonContainer.appendChild(leftButtons);
        buttonContainer.appendChild(rightButtons);
        panelContainer.appendChild(buttonContainer);

        if (searchContainer && siteConfig.searchPosition === 'bottom') {
            panelContainer.appendChild(searchContainer);
        }
    }

    expandButton.onclick = () => {
        const panelContainer = document.getElementById('panel-container');
        panelContainer.classList.add('expanded');
        expandButton.style.display = 'none';
    };

    // 快捷键切换面板展开/收起
    function togglePanel() {
        const panelContainer = document.getElementById('panel-container');
        if (!panelContainer) return;
        if (panelContainer.classList.contains('expanded')) {
            panelContainer.classList.remove('expanded');
            expandButton.style.display = 'flex';
        } else {
            // 顶栏模式"临时关闭"会把容器 display 置 none，快捷键展开时恢复显示
            if (panelContainer.style.display === 'none') panelContainer.style.display = '';
            panelContainer.classList.add('expanded');
            expandButton.style.display = 'none';
        }
    }

    document.addEventListener('keydown', (e) => {
        if (_recordingShortcut) return;
        if (e.repeat) return;
        // 每次按键时实时读取全局快捷键，任一网站修改后无需刷新即在其他网站生效
        const shortcut = getPanelShortcut();
        if (!shortcut) return;
        // 在输入框/可编辑区域内打字时不触发
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        const parts = shortcut.split('+');
        const key = parts[parts.length - 1];
        const pressedKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
        if (pressedKey !== key) return;
        // 修饰键状态须完全一致（按下与未按下都不能多不能少）
        if (!!e.ctrlKey !== parts.includes('ctrl')) return;
        if (!!e.altKey !== parts.includes('alt')) return;
        if (!!e.shiftKey !== parts.includes('shift')) return;
        if (!!e.metaKey !== parts.includes('meta')) return;
        e.preventDefault();
        togglePanel();
    });

    // 顶栏/底栏模式添加关闭按钮
    if (siteConfig.position === 'top' || siteConfig.position === 'bottom') {
        const closeButton = document.createElement('div');
        closeButton.className = 'close-button-top';
        closeButton.innerHTML = '×';
        closeButton.onclick = () => {
            const panelContainer = document.getElementById('panel-container');
            panelContainer.classList.remove('expanded');
            expandButton.style.display = 'flex';
        };
        container.appendChild(closeButton);
    }

    // 等待 DOM 加载完成后再渲染面板
    function initPanel() {
        renderPanel();
        if (siteConfig.autoExpand) expandButton.style.display = 'none';
    }

    // 确保 DOM 已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPanel);
    } else {
        initPanel();
    }
})();