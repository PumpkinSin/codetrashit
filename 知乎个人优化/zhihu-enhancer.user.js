// ==UserScript==
// @name         知乎样式与功能增强
// @namespace    https://www.zhihu.com/
// @version      2.0.30
// @description  全面优化知乎阅读与创作体验：1) 阅读排版：适度放大正文/标题/评论/顶栏字号且不裁切正文行，支持5行摘要预览，点击左右空白区域快速折叠回答或问题详情；2) 侧栏与界面净化：左侧栏放大且窄屏不折叠，支持在偏好设置页拖拽排序、显隐及自定义分隔线，隐藏右栏冗余卡片与刘看山角标；3) 互动与信息增强：作者及评论区ID旁支持一键「屏蔽用户」与可选「+ 关注」，去除赞同数前「航海家」等前缀并在其旁直接显示发布与修改时间；4) 问题页与个人主页优化：问题顶部集中展示「浏览 · 关注」标签与操作按钮（写回答/关注问题/问题日志/评论）并隐藏邀请回答；个人主页展开完整简介、放大头像、Tab栏改用紧凑胶囊分段框并将「搜索动态」框与精简「个人成就」移至列表顶栏（保留按时间排序），他人主页隐藏右侧冗余卡片并将「屏蔽用户」移至关注/发私信旁；5) 创作体验升级：写回答工具栏双排紧凑对齐、展开「更多」菜单中的帮助/设置/MD开关、创作助手与发布设置合并为右侧紧凑悬浮窗（支持定时「选择时间」按钮与默认不展开设置）；专栏写文章标题栏支持直接粘贴图片设为封面；6) 所有功能均可在知乎「偏好设置」页内开关与自定义。
// @author       AI
// @match        *://*.zhihu.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const SETTINGS_KEY = 'zhihu_enhancer_settings_v3';
    const DEFAULT_SIDEBAR_ITEMS = [
        { id: 'home', label: '首页', visible: true, kind: 'native' },
        { id: 'column', label: '专栏', visible: true, kind: 'native' },
        { id: 'circle', label: '圈子', visible: true, kind: 'native' },
        { id: 'divider-1', label: '── 分割线 ──', visible: true, kind: 'divider' },
        { id: 'zhida', label: '直答', visible: false, kind: 'native' },
        { id: 'aiworks', label: 'AI Works', visible: false, kind: 'native' },
        { id: 'yanyan', label: '盐言故事', visible: false, kind: 'native' },
        { id: 'consult', label: '付费咨询', visible: false, kind: 'native' },
        { id: 'zhixuetang', label: '知学堂', visible: false, kind: 'native' },
        { id: 'ask', label: '提问题', visible: true, kind: 'custom' },
        { id: 'answer', label: '写回答', visible: true, kind: 'custom' },
        { id: 'pin', label: '发想法', visible: true, kind: 'custom' },
        { id: 'article', label: '写文章', visible: true, kind: 'custom' },
        { id: 'create', label: '创作', visible: false, kind: 'native' },
        { id: 'divider-2', label: '── 分割线 ──', visible: true, kind: 'divider' },
        { id: 'my-home', label: '我的主页', visible: true, kind: 'profile' },
        { id: 'my-history', label: '最近浏览', visible: true, kind: 'profile' },
        { id: 'my-messages', label: '私信', visible: true, kind: 'profile' },
        { id: 'creator-center', label: '创作中心', visible: true, kind: 'profile' },
        { id: 'my-theme', label: '显示模式', visible: true, kind: 'profile' },
        { id: 'my-settings', label: '设置', visible: true, kind: 'profile' },
        { id: 'divider-3', label: '── 分割线 ──', visible: true, kind: 'divider' },
        { id: 'about', label: '关于我们', visible: true, kind: 'native' },
        { id: 'settings', label: '脚本设置', visible: true, kind: 'custom' }
    ];

    const DEFAULT_SETTINGS = {
        showBlockBtn: true,
        showFollowBtn: false,
        showAnswerTime: true,
        enableBlankCollapse: true,
        showViewTag: true,
        blueViewTag: false,
        defaultCloseAiAssistant: true,
        disableEntityAiLink: true,
        scaleProfileAvatar: false,
        profileAvatarBg: 'mosaic',
        profileAvatarMosaicSize: 16,
        profileAvatarMosaicColor: '#e5e7eb',
        profileAvatarMosaicBg: '#ffffff',
        fullProfileCover: false,
        hideSearchHotHint: false,
        sidebarCollapsed: false,
        chatCategories: [],
        chatGroupOrder: ['__recent__', '__friends__'],
        defaultChatGroup: '__recent__',
        chatModalRect: null,
        chatQuickReplies: ['人工客服'],
        hamburgerPos: null,
        sidebarItems: DEFAULT_SIDEBAR_ITEMS
    };

    function loadSettings() {
        try {
            let saved = {};
            if (typeof GM_getValue === 'function') {
                saved = GM_getValue(SETTINGS_KEY, {}) || {};
            } else {
                saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            }
            const merged = Object.assign({}, DEFAULT_SETTINGS, saved);
            if (!Array.isArray(merged.chatCategories)) merged.chatCategories = [];
            if (!Array.isArray(merged.chatQuickReplies) || merged.chatQuickReplies.length === 0) {
                merged.chatQuickReplies = ['人工客服'];
            }
            if (!Array.isArray(merged.chatGroupOrder)) merged.chatGroupOrder = ['__recent__', '__friends__'];
            for (const baseId of ['__recent__', '__friends__']) {
                if (!merged.chatGroupOrder.includes(baseId)) merged.chatGroupOrder.push(baseId);
            }
            for (const cat of merged.chatCategories) {
                if (cat && cat.id && !merged.chatGroupOrder.includes(cat.id)) {
                    merged.chatGroupOrder.push(cat.id);
                }
            }
            if (!Array.isArray(merged.sidebarItems) || merged.sidebarItems.length === 0) {
                merged.sidebarItems = DEFAULT_SIDEBAR_ITEMS.map((x) => Object.assign({}, x));
            } else {
                // 补齐新增的默认侧栏项，并同步最新名称（如“设置”）
                for (const item of merged.sidebarItems) {
                    if (item.id === 'my-settings') item.label = '设置';
                }
                const existIds = new Set(merged.sidebarItems.map((x) => x.id));
                for (const defItem of DEFAULT_SIDEBAR_ITEMS) {
                    if (!existIds.has(defItem.id)) {
                        merged.sidebarItems.push(Object.assign({}, defItem));
                    }
                }
            }
            return merged;
        } catch {
            return Object.assign({}, DEFAULT_SETTINGS, {
                sidebarItems: DEFAULT_SIDEBAR_ITEMS.map((x) => Object.assign({}, x))
            });
        }
    }

    function saveSettings(next) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(SETTINGS_KEY, next);
            } else {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
            }
        } catch { /* ignore */ }
    }

    if (location.pathname.startsWith('/messages') && (window.self !== window.top || location.search.includes('zh_embed=1'))) {
        document.documentElement.classList.add('zh-messages-embed');
    }

    const settings = loadSettings();
    const answerTimeCache = new Map(); // `${type}:${id}` or `${id}` -> { created, updated, type }
    const contentPreviewCache = new Map(); // `${type}:${id}` or `${id}` -> plainText
    const pendingAnswerFetchSet = new Set();
    const blockedTokenSet = new Set();
    const followedTokenSet = new Set();

    // =========================================================================
    // 1. 样式注入（符合知乎现有设计语言，和谐统一，支持深色模式）
    // =========================================================================
    const CSS_TEXT = `
        /* ---------- 1.1 稍微加大字体 & 消除裁切 ---------- */
        .RichContent-inner,
        .RichText,
        .ztext {
            font-size: 17px !important;
            line-height: 1.75 !important;
        }
        /* 仅在展开态解除高度限制；折叠态保留合理最大高度，避免几十张图的回答在折叠时也撑爆屏幕 */
        .RichContent:not(.is-collapsed) .RichContent-inner,
        .RichContent:not(.is-collapsed) .RichContent-inner > span,
        .RichContent:not(.is-collapsed) .RichContent-inner > div {
            max-height: none !important;
            height: auto !important;
            -webkit-line-clamp: unset !important;
            overflow: visible !important;
        }
        .RichContent.is-collapsed .RichContent-inner {
            max-height: 360px !important;
            overflow: hidden !important;
        }
        /* 列表页标题 */
        .ContentItem-title {
            font-size: 19px !important;
            line-height: 1.45 !important;
        }
        /* 问题页大标题 */
        .QuestionHeader-title {
            font-size: 24px !important;
            line-height: 1.4 !important;
        }
        /* 评论正文 */
        .CommentContent,
        [class*="CommentItem"] .RichText,
        [data-id] .RichText {
            font-size: 15.5px !important;
            line-height: 1.65 !important;
        }
        /* 作者名称与简介 */
        .AuthorInfo-name {
            font-size: 16px !important;
        }
        .AuthorInfo-detail {
            font-size: 14px !important;
        }

        /* ---------- 1.2 左侧功能栏放大两倍 + 窄屏不折叠（含外框与创作按钮） ---------- */
        [data-zh-sidebar-col="true"] {
            width: 268px !important;
            min-width: 268px !important;
            max-width: 268px !important;
            flex: 0 0 268px !important;
        }

        [data-zh-sidebar-card="true"],
        [data-zh-sidebar="true"] {
            width: 260px !important;
            min-width: 260px !important;
            max-width: 260px !important;
            box-sizing: border-box !important;
            overflow: visible !important;
        }

        [data-zh-sidebar-card="true"] {
            padding: 16px 12px !important;
        }

        [data-zh-sidebar-card="true"] > div,
        [data-zh-sidebar-card="true"] > nav,
        [data-zh-sidebar="true"] > div,
        [data-zh-sidebar="true"] > nav {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
        }

        /* 强制所有导航项保持横向完整显示，不被窄屏媒体查询折叠 */
        [data-zh-sidebar-card="true"] a:not([data-zh-hide-sidebar-item="true"]),
        [data-zh-sidebar-card="true"] button:not([data-zh-hide-sidebar-item="true"]),
        [data-zh-sidebar="true"] a:not([data-zh-hide-sidebar-item="true"]),
        [data-zh-sidebar="true"] button:not([data-zh-hide-sidebar-item="true"]),
        [data-zh-sidebar="true"] [role="menuitem"]:not([data-zh-hide-sidebar-item="true"]),
        [data-zh-sidebar="true"] [role="link"]:not([data-zh-hide-sidebar-item="true"]) {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 54px !important;
            padding: 10px 14px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 14px !important;
            font-size: 20px !important;
            line-height: 1.3 !important;
            border-radius: 12px !important;
            box-sizing: border-box !important;
            white-space: nowrap !important;
            overflow: visible !important;
        }

        /* 放大图标两倍 */
        [data-zh-sidebar-card="true"] svg,
        [data-zh-sidebar="true"] svg {
            width: 28px !important;
            height: 28px !important;
            min-width: 28px !important;
            min-height: 28px !important;
            flex-shrink: 0 !important;
        }

        /* 强制显示导航文字标签（防止窄屏隐藏文字） */
        [data-zh-sidebar-card="true"] a span,
        [data-zh-sidebar-card="true"] a div,
        [data-zh-sidebar-card="true"] button span,
        [data-zh-sidebar-card="true"] button div,
        [data-zh-sidebar="true"] a span,
        [data-zh-sidebar="true"] a div,
        [data-zh-sidebar="true"] button span,
        [data-zh-sidebar="true"] button div,
        [data-zh-sidebar="true"] [role="menuitem"] span {
            display: inline-flex !important;
            align-items: center !important;
            opacity: 1 !important;
            visibility: visible !important;
            width: auto !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            font-size: 20px !important;
            clip: auto !important;
            clip-path: none !important;
            position: static !important;
            transform: none !important;
        }

        /* “+ 创作”主按钮在任何窗口宽度下都保持完整宽度与居中 */
        [data-zh-sidebar-card="true"] [data-zh-create-btn="true"],
        [data-zh-sidebar="true"] [data-zh-create-btn="true"] {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            justify-content: center !important;
            min-height: 56px !important;
            padding: 12px 16px !important;
            margin-top: 12px !important;
            margin-bottom: 12px !important;
            font-size: 20px !important;
            font-weight: 600 !important;
            border-radius: 14px !important;
        }

        /* 隐藏左侧栏指定项及原“+ 创作”按钮 */
        [data-zh-sidebar-card="true"] [data-zh-hide-sidebar-item="true"],
        [data-zh-sidebar="true"] [data-zh-hide-sidebar-item="true"],
        [data-zh-hide-sidebar-item="true"] {
            display: none !important;
        }
        .zh-sidebar-create-item {
            width: 100% !important;
            min-height: 54px !important;
            padding: 10px 14px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 14px !important;
            font-size: 20px !important;
            line-height: 1.3 !important;
            color: #191b1f !important;
            background: transparent !important;
            border: none !important;
            border-radius: 12px !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
            white-space: nowrap !important;
            transition: background-color 0.15s ease, color 0.15s ease !important;
        }
        body:not(.zh-sidebar-collapsed) [data-zh-sidebar="true"] button.zh-sidebar-create-item {
            padding-left: var(--zh-pad-left, 14px) !important;
            gap: var(--zh-gap, 14px) !important;
        }
        .zh-sidebar-create-item:hover {
            background-color: rgba(132, 145, 165, 0.1) !important;
            color: #056de8 !important;
        }
        html[data-theme="dark"] .zh-sidebar-create-item {
            color: #d3d6dc !important;
        }
        html[data-theme="dark"] .zh-sidebar-create-item:hover {
            background-color: rgba(255, 255, 255, 0.08) !important;
            color: #4d9cff !important;
        }
        /* 侧栏自定义分割线 & 隐藏原生分割线/空线避免重复 */
        [data-zh-sidebar="true"] hr,
        [data-zh-sidebar="true"] [role="separator"],
        [data-zh-sidebar="true"] div:empty:not(.zh-sidebar-divider),
        [data-zh-sidebar-card="true"] div:empty:not(.zh-sidebar-divider) {
            display: none !important;
        }
        [data-zh-sidebar="true"] > div,
        [data-zh-sidebar-card="true"] > div {
            border-top: none !important;
            border-bottom: none !important;
        }
        .zh-sidebar-divider {
            display: block !important;
            width: calc(100% - 28px) !important;
            height: 1px !important;
            min-height: 1px !important;
            margin: 8px 14px !important;
            background-color: #e5e7eb !important;
            border: none !important;
            opacity: 1 !important;
            visibility: visible !important;
            flex-shrink: 0 !important;
        }
        html[data-theme="dark"] .zh-sidebar-divider {
            background-color: #2e3035 !important;
        }
        /* 无原生侧栏页面（如 /settings/preference、问题页等）的悬浮左侧栏 */
        #zh-floating-left-sidebar {
            position: fixed !important;
            left: 16px !important;
            top: 74px !important;
            z-index: 900 !important;
            background: #ffffff !important;
            border: 1px solid #ebeced !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05) !important;
            max-height: calc(100vh - 94px) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            padding: 12px 10px !important;
            display: flex !important;
            flex-direction: column !important;
        }
        html[data-theme="dark"] #zh-floating-left-sidebar {
            background: #1e1f24 !important;
            border-color: #2f313a !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        }
        body.zh-sidebar-collapsed #zh-floating-left-sidebar {
            left: 10px !important;
            padding: 10px 6px !important;
        }
        /* 极窄窗口（< 900px）：侧栏收成右下角汉堡按钮 + 点击向上展开悬浮抽屉 + 顶栏紧凑 + 正文自适应宽度 */
        #zh-sidebar-hamburger-btn {
            display: none !important;
            position: fixed !important;
            right: 16px !important;
            bottom: 18px !important;
            z-index: 9999 !important;
            width: 40px !important;
            height: 40px !important;
            margin: 0 !important;
            padding: 0 !important;
            align-items: center !important;
            justify-content: center !important;
            background: #ffffff !important;
            color: #373a40 !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 10px !important;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
            cursor: pointer !important;
            flex-shrink: 0 !important;
            transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease !important;
        }
        #zh-sidebar-hamburger-btn:hover {
            background: #f4f6f9 !important;
            color: #1772f6 !important;
            border-color: #1772f6 !important;
        }
        html[data-theme="dark"] #zh-sidebar-hamburger-btn {
            background: #1e1f24 !important;
            color: #d1d5db !important;
            border-color: #3a3d46 !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;
        }
        body.zh-sidebar-hamburger #zh-sidebar-hamburger-btn {
            display: inline-flex !important;
        }
        body.zh-sidebar-hamburger {
            overflow-x: hidden !important;
        }
        /* 极窄窗口顶栏重排：三个分类更紧凑，搜索框完整自适应显示 */
        body.zh-sidebar-hamburger header.AppHeader,
        body.zh-sidebar-hamburger header.LeanAppHeaderBar,
        body.zh-sidebar-hamburger header[role="banner"],
        body.zh-sidebar-hamburger .css-7corvk {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
        }
        body.zh-sidebar-hamburger .AppHeader-inner,
        body.zh-sidebar-hamburger .css-rtxb0v {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            margin: 0 !important;
            gap: 4px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
        }
        body.zh-sidebar-hamburger .css-1htn8ca,
        body.zh-sidebar-hamburger .css-1cm220f,
        body.zh-sidebar-hamburger .SearchBar-askContainer,
        body.zh-sidebar-hamburger .SearchBar-askButton,
        body.zh-sidebar-hamburger .css-x518ek {
            display: none !important;
        }
        body.zh-sidebar-hamburger header a[aria-label="知乎"] {
            flex: 0 0 auto !important;
            margin: 0 2px 0 0 !important;
            padding: 0 !important;
            width: auto !important;
        }
        body.zh-sidebar-hamburger header a[aria-label="知乎"] svg {
            width: 46px !important;
            height: 22px !important;
        }
        body.zh-sidebar-hamburger .css-1pbgcc2,
        body.zh-sidebar-hamburger header div:has(> nav [data-zh-top-tab="true"]) {
            display: flex !important;
            align-items: center !important;
            flex: 1 1 0% !important;
            min-width: 0 !important;
            width: auto !important;
            max-width: 100% !important;
            gap: 4px !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        body.zh-sidebar-hamburger .AppHeader-Tabs,
        body.zh-sidebar-hamburger .TopstoryTabs,
        body.zh-sidebar-hamburger .css-1ut0ei4,
        body.zh-sidebar-hamburger header nav:has([data-zh-top-tab="true"]) {
            margin: 0 2px 0 0 !important;
            padding: 0 !important;
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: 0 !important;
            gap: 2px !important;
            display: flex !important;
            align-items: center !important;
        }
        body.zh-sidebar-hamburger .AppHeader-Tab,
        body.zh-sidebar-hamburger .TopstoryTabs-link,
        body.zh-sidebar-hamburger [data-zh-top-tab="true"],
        body.zh-sidebar-hamburger [data-zh-top-tab="true"] > div {
            font-size: 14px !important;
            padding-left: 4px !important;
            padding-right: 4px !important;
            margin: 0 !important;
            width: auto !important;
            min-width: 0 !important;
            white-space: nowrap !important;
        }
        body.zh-sidebar-hamburger .css-c0w5vr,
        body.zh-sidebar-hamburger header div:has(> .SearchBar),
        body.zh-sidebar-hamburger .SearchBar,
        body.zh-sidebar-hamburger .SearchBar-toolWrapper,
        body.zh-sidebar-hamburger .SearchBar-tool,
        body.zh-sidebar-hamburger .SearchBar-tool > div,
        body.zh-sidebar-hamburger .SearchBar-tool .Popover {
            flex: 1 1 0% !important;
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
        }
        body.zh-sidebar-hamburger .SearchBar-input,
        body.zh-sidebar-hamburger [data-zh-search-box="true"] {
            display: flex !important;
            align-items: center !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 32px !important;
            min-height: 32px !important;
            padding: 0 6px 0 10px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        body.zh-sidebar-hamburger .SearchBar-input input,
        body.zh-sidebar-hamburger [data-zh-search-box="true"] input {
            min-width: 0 !important;
            width: 100% !important;
            flex: 1 1 0% !important;
            font-size: 13px !important;
            height: 28px !important;
            line-height: 28px !important;
        }
        body.zh-sidebar-hamburger .SearchBar-searchButton {
            flex: 0 0 auto !important;
            padding: 0 4px !important;
            margin: 0 !important;
        }
        body.zh-sidebar-hamburger .AppHeader-userInfo,
        body.zh-sidebar-hamburger .css-1ww4ngr {
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: 0 !important;
            margin-left: 2px !important;
            padding: 0 !important;
            gap: 4px !important;
        }
        body.zh-sidebar-hamburger .css-ruapjk {
            flex: 0 0 auto !important;
            margin: 0 !important;
        }
        /* 隐藏搜索框预设热点提示与热搜推荐 */
        body.zh-hide-search-hot-hint .SearchBar-input input::placeholder,
        body.zh-hide-search-hot-hint [data-zh-search-box="true"] input::placeholder,
        body.zh-hide-search-hot-hint header input[type="search"]::placeholder,
        body.zh-hide-search-hot-hint header input[role="combobox"]::placeholder {
            color: transparent !important;
            opacity: 0 !important;
        }
        body.zh-hide-search-hot-hint [data-zh-hide-hot-search="true"] {
            display: none !important;
        }
        body.zh-sidebar-hamburger:not(.zh-sidebar-drawer-open) [data-zh-sidebar-col="true"],
        body.zh-sidebar-hamburger:not(.zh-sidebar-drawer-open) [data-zh-sidebar="true"],
        body.zh-sidebar-hamburger:not(.zh-sidebar-drawer-open) #zh-floating-left-sidebar {
            display: none !important;
        }
        body.zh-sidebar-hamburger.zh-sidebar-drawer-open [data-zh-sidebar-col="true"] {
            display: block !important;
            width: 0 !important;
            min-width: 0 !important;
            flex: 0 0 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        body.zh-sidebar-hamburger.zh-sidebar-drawer-open [data-zh-sidebar="true"],
        body.zh-sidebar-hamburger.zh-sidebar-drawer-open #zh-floating-left-sidebar {
            display: flex !important;
            flex-direction: column !important;
            position: fixed !important;
            right: 16px !important;
            bottom: 68px !important;
            left: auto !important;
            top: auto !important;
            width: 220px !important;
            min-width: 220px !important;
            max-width: 220px !important;
            max-height: calc(100vh - 96px) !important;
            overflow-y: auto !important;
            z-index: 9998 !important;
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 12px !important;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18) !important;
            padding: 10px 8px !important;
        }
        html[data-theme="dark"] body.zh-sidebar-hamburger.zh-sidebar-drawer-open [data-zh-sidebar="true"],
        html[data-theme="dark"] body.zh-sidebar-hamburger.zh-sidebar-drawer-open #zh-floating-left-sidebar {
            background: #1e1f24 !important;
            border-color: #2f313a !important;
        }
        body.zh-sidebar-hamburger .GlobalSideBar,
        body.zh-sidebar-hamburger [class*="GlobalSideBar"],
        body.zh-sidebar-hamburger [data-zh-hide-keep-space="true"],
        body.zh-sidebar-hamburger .css-syn8px > .css-uf7ueu,
        body.zh-sidebar-hamburger .css-syn8px > .css-12c3wuv,
        body.zh-sidebar-hamburger aside.css-14mwtba,
        body.zh-sidebar-hamburger .Topstory-rightColumn,
        body.zh-sidebar-hamburger .Question-sideColumn,
        body.zh-sidebar-hamburger .Profile-sideColumn {
            display: none !important;
        }
        body.zh-sidebar-hamburger .css-syn8px,
        body.zh-sidebar-hamburger .css-t9zu9r,
        body.zh-sidebar-hamburger .css-t9zu9r > div,
        body.zh-sidebar-hamburger .App-main,
        body.zh-sidebar-hamburger .App-main > div,
        body.zh-sidebar-hamburger .App-main > div > div,
        body.zh-sidebar-hamburger .Topstory,
        body.zh-sidebar-hamburger .TopstoryPage,
        body.zh-sidebar-hamburger .Topstory-content,
        body.zh-sidebar-hamburger .Topstory-container,
        body.zh-sidebar-hamburger .Topstory-mainColumn,
        body.zh-sidebar-hamburger .Topstory-mainColumn > div,
        body.zh-sidebar-hamburger .TopstoryMain,
        body.zh-sidebar-hamburger .TopstoryItem,
        body.zh-sidebar-hamburger .Question-main,
        body.zh-sidebar-hamburger .Question-mainColumn,
        body.zh-sidebar-hamburger .Profile-main,
        body.zh-sidebar-hamburger .Profile-mainColumn,
        body.zh-sidebar-hamburger .ProfileMain,
        body.zh-sidebar-hamburger .Search-container,
        body.zh-sidebar-hamburger .SearchMain,
        body.zh-sidebar-hamburger .Card,
        body.zh-sidebar-hamburger .List,
        body.zh-sidebar-hamburger .List-item,
        body.zh-sidebar-hamburger .ContentItem,
        body.zh-sidebar-hamburger .RichContent,
        body.zh-sidebar-hamburger .RichContent-inner {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
        }
        body.zh-sidebar-hamburger .Topstory-container {
            display: block !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
        }
        body.zh-sidebar-hamburger .App-main {
            padding-left: 8px !important;
            padding-right: 8px !important;
        }
        body.zh-sidebar-hamburger .ProfileMain-tabs,
        body.zh-sidebar-hamburger .Tabs {
            max-width: 100% !important;
            overflow-x: auto !important;
        }
        body.zh-sidebar-hamburger .ContentItem-title,
        body.zh-sidebar-hamburger .RichText,
        body.zh-sidebar-hamburger .ztext {
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
        }
        /* 窄屏下防止信息流封面图上移遮挡标题 */
        body.zh-sidebar-hamburger .ContentItem-title {
            position: relative !important;
            z-index: 1 !important;
            margin-bottom: 8px !important;
        }
        body.zh-sidebar-hamburger .RichContent {
            display: block !important;
            position: relative !important;
            margin-top: 6px !important;
        }
        body.zh-sidebar-hamburger .RichContent-cover {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            float: none !important;
            margin: 0 0 8px 0 !important;
            max-width: 100% !important;
            height: 105px !important;
            overflow: hidden !important;
            border-radius: 6px !important;
        }
        body.zh-sidebar-hamburger .RichContent-cover-inner {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 100% !important;
            height: 100% !important;
            transform: none !important;
            overflow: hidden !important;
        }
        body.zh-sidebar-hamburger .RichContent-cover img {
            position: static !important;
            top: auto !important;
            left: auto !important;
            transform: none !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
        }
        /* 左侧栏窄屏自动收起为仅图标模式（主内容区空间不足时自动触发） */
        body.zh-sidebar-collapsed [data-zh-sidebar-col="true"] {
            width: 76px !important;
            min-width: 76px !important;
            max-width: 76px !important;
            flex: 0 0 76px !important;
        }
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"],
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] {
            width: 68px !important;
            min-width: 68px !important;
            max-width: 68px !important;
            padding: 12px 6px !important;
        }
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] a:not([data-zh-hide-sidebar-item="true"]),
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] button:not([data-zh-hide-sidebar-item="true"]),
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [role="menuitem"]:not([data-zh-hide-sidebar-item="true"]),
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [role="link"]:not([data-zh-hide-sidebar-item="true"]),
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] a:not([data-zh-hide-sidebar-item="true"]),
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] button:not([data-zh-hide-sidebar-item="true"]) {
            padding: 10px 0 !important;
            justify-content: center !important;
            gap: 0 !important;
        }
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [data-zh-sidebar-id] span,
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [data-zh-sidebar-id] div:not(:has(svg)),
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [data-zh-create-btn="true"] span,
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] [data-zh-sidebar-id] span,
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] [data-zh-sidebar-id] div:not(:has(svg)),
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] [data-zh-create-btn="true"] span {
            display: none !important;
        }
        body.zh-sidebar-collapsed [data-zh-sidebar="true"] [data-zh-sidebar-id] div:has(svg),
        body.zh-sidebar-collapsed [data-zh-sidebar-card="true"] [data-zh-sidebar-id] div:has(svg) {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        body.zh-sidebar-collapsed .zh-sidebar-divider {
            width: calc(100% - 14px) !important;
            margin: 6px 7px !important;
        }

        /* ---------- 1.3 屏蔽用户按钮（仅屏蔽，不隐藏当前页面回答） ---------- */
        .zh-block-user-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 8px;
            padding: 1px 7px;
            font-size: 12px;
            line-height: 18px;
            font-weight: 400;
            color: #8491a5;
            background-color: rgba(132, 145, 165, 0.1);
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            vertical-align: middle;
            transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
            user-select: none;
            text-decoration: none !important;
        }
        .zh-block-user-btn:hover {
            color: #e64545;
            background-color: rgba(230, 69, 69, 0.1);
            border-color: rgba(230, 69, 69, 0.2);
        }
        .zh-block-user-btn.is-blocked {
            color: #056de8;
            background-color: rgba(5, 109, 232, 0.08);
        }
        html[data-theme="dark"] .zh-block-user-btn {
            color: #8590a6;
            background-color: rgba(133, 144, 166, 0.15);
        }
        html[data-theme="dark"] .zh-block-user-btn:hover {
            color: #ff6b6b;
            background-color: rgba(255, 107, 107, 0.15);
        }
        .zh-follow-user-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 6px;
            padding: 1px 7px;
            font-size: 12px;
            line-height: 18px;
            font-weight: 400;
            color: #056de8;
            background-color: rgba(5, 109, 232, 0.08);
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            vertical-align: middle;
            transition: all 0.15s ease;
            user-select: none;
        }
        .zh-follow-user-btn:hover {
            background-color: rgba(5, 109, 232, 0.15);
        }
        .zh-follow-user-btn.is-followed {
            color: #8491a5;
            background-color: rgba(132, 145, 165, 0.1);
        }
        html[data-theme="dark"] .zh-follow-user-btn {
            color: #4d9cff;
            background-color: rgba(77, 156, 255, 0.14);
        }

        /* ---------- 1.4 赞同数旁边的发布时间与修改时间 ---------- */
        .zh-answer-time-meta {
            display: inline-flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            margin-left: 12px;
            font-size: 13.5px;
            color: #8491a5;
            line-height: 1.4;
            vertical-align: middle;
        }
        html[data-theme="dark"] .zh-answer-time-meta {
            color: #8590a6;
        }
        .zh-voters-wrap {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
        }
        /* ---------- 1.4.1 信息流折叠态 5 行预览（安全保留阅读全文按钮与封面） ---------- */
        .RichContent.is-collapsed .zh-5line-preview {
            display: -webkit-box !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 5 !important;
            overflow: hidden !important;
            font-size: 17px !important;
            line-height: 1.75 !important;
            color: #191b1f !important;
            margin-bottom: 6px !important;
            word-break: break-word !important;
        }
        html[data-theme="dark"] .RichContent.is-collapsed .zh-5line-preview {
            color: #d3d6dc !important;
        }
        .RichContent:not(.is-collapsed) .zh-5line-preview {
            display: none !important;
        }
        .RichContent.is-collapsed[data-zh-has-preview="true"] .RichContent-inner {
            display: block !important;
        }
        .RichContent.is-collapsed[data-zh-has-preview="true"] .RichContent-inner .RichText {
            display: none !important;
        }

        /* ---------- 1.4.2 顶部“关注 / 推荐 / 热榜”放大 & 搜索框垂直居中加高 ---------- */
        .AppHeader,
        .AppHeader-inner {
            height: 58px !important;
            min-height: 58px !important;
            overflow: visible !important;
            display: flex !important;
            align-items: center !important;
        }
        .SearchBar,
        .SearchBar-toolWrapper {
            height: 42px !important;
            min-height: 42px !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            display: flex !important;
            align-items: center !important;
            overflow: visible !important;
        }
        .TopstoryTabs-link,
        [data-zh-top-tab="true"] {
            font-size: 20px !important;
            font-weight: 600 !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
        }
        .SearchBar-input,
        [data-zh-search-box="true"] {
            height: 42px !important;
            min-height: 42px !important;
            border-radius: 21px !important;
            display: flex !important;
            align-items: center !important;
        }
        .SearchBar-input input,
        [data-zh-search-box="true"] input {
            font-size: 16px !important;
            height: 38px !important;
            line-height: 38px !important;
        }

        /* ---------- 1.5 个人主页：头像放大、资料默认展开且紧凑、隐藏收起按钮、关注私信移至ID右侧 ---------- */
        .ProfileHeader-headline,
        .ProfileHeader-infoItem,
        .ProfileHeader-detailValue,
        .ProfileHeader-contentHead .RichText,
        [class*="ProfileHeader"] [class*="headline"] {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            max-width: none !important;
            width: auto !important;
            height: auto !important;
            max-height: none !important;
            -webkit-line-clamp: unset !important;
            word-break: break-word !important;
        }
        /* 个人主页头像缩放开关：仅开启时放大至 200px，小图居中完整显示并应用自定义/马赛克背景 */
        body.zh-scale-profile-avatar .ProfileHeader-avatar,
        body.zh-scale-profile-avatar [data-zh-profile-avatar="true"] {
            width: 200px !important;
            height: 200px !important;
            background-color: var(--zh-avatar-bg, #ffffff) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
        }
        body.zh-scale-profile-avatar.zh-avatar-bg-mosaic .ProfileHeader-avatar,
        body.zh-scale-profile-avatar.zh-avatar-bg-mosaic [data-zh-profile-avatar="true"] {
            background-color: var(--zh-mosaic-base, #ffffff) !important;
            background-image:
                linear-gradient(45deg, var(--zh-mosaic-color, #e5e7eb) 25%, transparent 25%),
                linear-gradient(-45deg, var(--zh-mosaic-color, #e5e7eb) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, var(--zh-mosaic-color, #e5e7eb) 75%),
                linear-gradient(-45deg, transparent 75%, var(--zh-mosaic-color, #e5e7eb) 75%) !important;
            background-size: var(--zh-mosaic-size, 16px) var(--zh-mosaic-size, 16px) !important;
            background-position: 0 0, 0 var(--zh-mosaic-half, 8px), var(--zh-mosaic-half, 8px) var(--zh-mosaic-neg-half, -8px), var(--zh-mosaic-neg-half, -8px) 0 !important;
        }
        body.zh-scale-profile-avatar .ProfileHeader-avatar img,
        body.zh-scale-profile-avatar [data-zh-profile-avatar="true"] img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
        }
        body.zh-scale-profile-avatar [data-zh-profile-avatar="true"] img[data-zh-small-avatar="true"] {
            width: auto !important;
            height: auto !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
        }
        .ProfileHeader-main {
            position: relative !important;
        }
        body.zh-scale-profile-avatar .ProfileHeader-content[data-zh-profile-content="true"] {
            margin-left: 224px !important;
            padding-left: 0 !important;
            border-left: none !important;
        }
        .zh-profile-followship-box {
            position: absolute !important;
            left: 0 !important;
            top: 112px;
            width: 160px;
            display: flex !important;
            align-items: center !important;
            justify-content: space-around !important;
            padding: 4px 0 !important;
            box-sizing: border-box !important;
            z-index: 2 !important;
        }
        .zh-profile-followship-item {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 1 1 0 !important;
            text-decoration: none !important;
            color: inherit !important;
            cursor: pointer !important;
            padding: 2px 4px !important;
            border-radius: 6px !important;
            transition: background-color 0.15s ease !important;
        }
        .zh-profile-followship-item:hover {
            background-color: rgba(23, 114, 246, 0.06) !important;
        }
        .zh-profile-followship-item + .zh-profile-followship-item {
            border-left: 1px solid #EBEBEB !important;
        }
        .zh-profile-followship-label {
            font-size: 13.5px !important;
            color: #8491A5 !important;
            line-height: 1.35 !important;
        }
        .zh-profile-followship-num {
            font-size: 17px !important;
            font-weight: 600 !important;
            color: #191B1F !important;
            line-height: 1.4 !important;
        }
        html[data-theme="dark"] .zh-profile-followship-item + .zh-profile-followship-item {
            border-left-color: #2E3038 !important;
        }
        html[data-theme="dark"] .zh-profile-followship-num {
            color: #E5E7EB !important;
        }
        /* 个人主页顶部海报（封面图）完整显示 */
        body.zh-full-profile-cover .ProfileHeader-userCover:has(img),
        body.zh-full-profile-cover .UserCover:has(img) {
            height: auto !important;
            max-height: none !important;
        }
        body.zh-full-profile-cover .UserCover img,
        body.zh-full-profile-cover .UserCover-image {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            object-fit: contain !important;
            transform: none !important;
        }
        /* ---------- 1.7.2 个人主页 Tab 栏紧凑胶囊分段框 + List-header 内联搜索框 ---------- */
        .ProfileMain-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 8px 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }
        .ProfileMain-header > div,
        .ProfileMain-header > div:first-child {
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            mask-image: none !important;
            -webkit-mask-image: none !important;
        }
        .ProfileMain-header .SearchTabs-actions,
        .ProfileMain-header > div:last-child:not(:first-child),
        .ProfileMain-header > button,
        [data-zh-hide-profile-search="true"] {
            display: none !important;
        }
        .PageHeader .ProfileMain-tabs {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            margin-left: 14px !important;
            margin-right: 0 !important;
        }
        .ProfileMain-tabs {
            display: flex !important;
            flex: 1 1 auto !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 32px !important;
            min-height: 0 !important;
            align-items: stretch !important;
            justify-content: space-between !important;
            flex-wrap: nowrap !important;
            border: 1px solid #D0D7DE !important;
            border-radius: 999px !important;
            background: #FFFFFF !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            mask-image: none !important;
            -webkit-mask-image: none !important;
        }
        #ProfileMain .ProfileMain-tabs.withSearchIcon li.Tabs-item,
        #ProfileMain .ProfileMain-tabs.withSearchIcon li.Tabs-item:last-child,
        .ProfileMain-tabs.withSearchIcon .Tabs-item,
        .ProfileMain-tabs.withSearchIcon .Tabs-item:last-child,
        .ProfileMain-tabs .Tabs-item,
        .ProfileMain-tabs .Tabs-item:last-child {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            position: relative !important;
            display: flex !important;
            align-items: stretch !important;
        }
        .ProfileMain-tabs .Tabs-item + .Tabs-item::before {
            content: "" !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            height: 100% !important;
            width: 1px !important;
            background: #D0D7DE !important;
            pointer-events: none !important;
            z-index: 1 !important;
        }
        .ProfileMain-tabs .Tabs-link,
        .ProfileMain-tabs .Tabs-item .Tabs-link {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            padding: 0 5px !important;
            font-size: 12.5px !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
            transition: background 0.15s, color 0.15s !important;
        }
        .ProfileMain-tabs.withSearchIcon .Tabs-item:first-child .Tabs-link,
        .ProfileMain-tabs .Tabs-item:first-child .Tabs-link {
            padding-left: 14px !important;
            padding-right: 6px !important;
            margin: 0 !important;
        }
        #ProfileMain .ProfileMain-tabs.withSearchIcon li.Tabs-item:last-child > a.Tabs-link,
        #ProfileMain .ProfileMain-tabs li.Tabs-item:last-child > a.Tabs-link,
        .ProfileMain-tabs.withSearchIcon .Tabs-item:last-child .Tabs-link,
        .ProfileMain-tabs.withSearchIcon .Tabs-item:last-child > a,
        .ProfileMain-tabs .Tabs-item:last-child .Tabs-link,
        .ProfileMain-tabs .Tabs-item:last-child > a {
            padding-left: 6px !important;
            padding-right: 14px !important;
            margin: 0 !important;
        }
        .ProfileMain-tabs .Tabs-link::after {
            display: none !important;
        }
        .ProfileMain-tabs .Tabs-link.is-active {
            background: #1772F6 !important;
            color: #FFFFFF !important;
            font-weight: 600 !important;
            box-shadow: none !important;
        }
        .ProfileMain-tabs .Tabs-meta {
            font-size: 10.5px !important;
            margin-left: 1px !important;
            color: #8491A5 !important;
        }
        .ProfileMain-tabs .Tabs-link.is-active .Tabs-meta {
            color: rgba(255, 255, 255, 0.9) !important;
        }
        html[data-theme="dark"] .ProfileMain-tabs {
            background: #1E1F24 !important;
            border-color: #363840 !important;
        }
        html[data-theme="dark"] .ProfileMain-tabs .Tabs-item + .Tabs-item::before {
            background: #363840 !important;
        }
        html[data-theme="dark"] .ProfileMain-tabs .Tabs-link.is-active {
            background: #1772F6 !important;
            color: #FFFFFF !important;
        }
        .Profile-mainColumn .List-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            min-height: 0 !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
        }
        .Profile-mainColumn .List-header .List-headerText,
        .ProfileMain .List-header .List-headerText,
        #ProfileMain .List-header .List-headerText,
        [data-zh-hide-header-title="true"] {
            display: none !important;
        }
        .Profile-mainColumn .List-header .List-headerOptions {
            margin-left: 0 !important;
            flex-shrink: 0 !important;
        }
        .zh-profile-search-box {
            display: inline-flex !important;
            align-items: center !important;
            flex: 0 1 250px !important;
            width: 240px !important;
            max-width: 280px !important;
            margin-left: auto !important;
            height: 30px !important;
            padding: 0 10px !important;
            background: #F4F6F9 !important;
            border: 1px solid #E5E7EB !important;
            border-radius: 999px !important;
            box-sizing: border-box !important;
            gap: 6px !important;
        }
        .zh-profile-search-box:focus-within {
            background: #FFFFFF !important;
            border-color: #1772F6 !important;
        }
        .zh-profile-search-input {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            border: none !important;
            outline: none !important;
            background: transparent !important;
            font-size: 13px !important;
            color: #191B1F !important;
            padding: 0 !important;
            height: 100% !important;
        }
        .zh-profile-search-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: none !important;
            background: transparent !important;
            color: #8491A5 !important;
            cursor: pointer !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
        }
        .zh-profile-search-btn:hover {
            color: #1772F6 !important;
        }
        html[data-theme="dark"] .zh-profile-search-box {
            background: #25272D !important;
            border-color: #363840 !important;
        }
        html[data-theme="dark"] .zh-profile-search-box:focus-within {
            background: #1E1F24 !important;
            border-color: #1772F6 !important;
        }
        html[data-theme="dark"] .zh-profile-search-input {
            color: #E5E7EB !important;
        }
        /* 个人主页：精简右侧栏并把个人成就纯文字置左、搜索框置右，屏蔽与付费咨询按钮对齐关注/发私信 */
        .Profile-sideColumn .Profile-lightList,
        .Profile-sideColumn .Profile-footerOperations,
        .Profile-sideColumn footer[role="contentinfo"],
        [data-zh-hide-achievement-card="true"],
        [data-zh-hide-followship-card="true"],
        [data-zh-hide-consult-card="true"] {
            display: none !important;
        }
        .zh-profile-achievement-text {
            display: inline-flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
            color: #647084 !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
        }
        .zh-profile-achievement-text b {
            color: #191B1F !important;
            font-weight: 600 !important;
        }
        .zh-profile-achievement-sep {
            color: #C2C8D1 !important;
            user-select: none !important;
        }
        .zh-profile-agree-link {
            color: #1772F6 !important;
            text-decoration: none !important;
            cursor: pointer !important;
            white-space: nowrap !important;
        }
        .zh-profile-agree-link:hover {
            text-decoration: underline !important;
        }
        html[data-theme="dark"] .zh-profile-achievement-text {
            color: #9CA3AF !important;
        }
        html[data-theme="dark"] .zh-profile-achievement-text b {
            color: #E5E7EB !important;
        }
        html[data-theme="dark"] .zh-profile-achievement-sep {
            color: #4A4D57 !important;
        }
        html[data-theme="dark"] .zh-profile-agree-link {
            color: #4D9CFF !important;
        }
        .zh-profile-block-btn,
        .zh-profile-consult-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
            height: 34px !important;
            padding: 0 14px !important;
            font-size: 14px !important;
            line-height: 1 !important;
            border-radius: 4px !important;
            color: #8491A5 !important;
            background: transparent !important;
            border: 1px solid #8491A5 !important;
            cursor: pointer !important;
            white-space: nowrap !important;
            box-sizing: border-box !important;
            transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease !important;
        }
        .zh-profile-block-btn:hover {
            background-color: rgba(132, 145, 165, 0.08) !important;
            color: #5C6676 !important;
            border-color: #5C6676 !important;
        }
        .zh-profile-consult-btn {
            color: #1772F6 !important;
            border-color: #1772F6 !important;
        }
        .zh-profile-consult-btn:hover {
            background-color: rgba(23, 114, 246, 0.08) !important;
        }
        .zh-profile-block-btn.is-blocked {
            color: #F1403C !important;
            border-color: rgba(241, 64, 60, 0.45) !important;
        }
        .zh-profile-block-btn.is-blocked:hover {
            background-color: rgba(241, 64, 60, 0.08) !important;
            border-color: #F1403C !important;
        }
        html[data-theme="dark"] .zh-profile-block-btn {
            color: #9CA3AF !important;
            border-color: #4B5563 !important;
        }
        html[data-theme="dark"] .zh-profile-block-btn:hover {
            color: #E5E7EB !important;
            border-color: #6B7280 !important;
            background-color: rgba(255, 255, 255, 0.06) !important;
        }
        html[data-theme="dark"] .zh-profile-consult-btn {
            color: #4D9CFF !important;
            border-color: #4D9CFF !important;
        }
        html[data-theme="dark"] .zh-profile-consult-btn:hover {
            background-color: rgba(77, 156, 255, 0.12) !important;
        }
        /* ---------- 1.4.3 问题页头部宽度与下方回答列保持一致 ---------- */
        .QuestionHeader-main,
        [data-za-detail-view-path-module="QuestionDescription"],
        [data-zop-question] {
            max-width: 100% !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            box-sizing: border-box !important;
        }
        [data-za-detail-view-path-module="QuestionDescription"] > div:last-child,
        .QuestionHeader-footer-inner,
        .QuestionHeader-footer-main {
            max-width: 100% !important;
            flex-wrap: wrap !important;
            row-gap: 8px !important;
            box-sizing: border-box !important;
        }
        .QuestionHeader-actions,
        [data-za-detail-view-path-module="QuestionDescription"] .QuestionButtonGroup,
        [data-za-detail-view-path-module="QuestionDescription"] .QuestionButtonGroup + div {
            flex-wrap: wrap !important;
            row-gap: 8px !important;
        }
        .QuestionButtonGroup {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
        }
        .QuestionButtonGroup > a:not(.QuestionButtonGroup-invite):not(.zh-q-action-btn),
        .QuestionButtonGroup > button:not(.FollowButton):not(.QuestionButtonGroup-invite):not(.zh-q-action-btn),
        .QuestionButtonGroup .WriteAnswerButton,
        .QuestionButtonGroup [data-zh-btn-order="1"] { order: 1 !important; margin: 0 !important; }
        .QuestionButtonGroup .FollowButton,
        .QuestionButtonGroup [data-zh-btn-order="2"] { order: 2 !important; margin: 0 !important; }
        .QuestionButtonGroup .zh-q-log-btn { order: 3 !important; margin: 0 !important; }
        .QuestionButtonGroup .zh-q-comment-btn { order: 4 !important; margin: 0 !important; }
        [data-za-detail-view-path-module="QuestionDescription"] button svg,
        .QuestionHeader button svg {
            visibility: visible !important;
            opacity: 1 !important;
            flex-shrink: 0 !important;
        }

        /* ---------- 1.4.4 内联写回答编辑器工具栏自动换行 + 创作助手防溢出 ---------- */
        #AnswerFormPortalContainer,
        .AnswerFormPortalContainer,
        #AnswerFormPortalContainer .QuestionAnswers-statusWrapper,
        #AnswerFormPortalContainer .QuestionAnswers-answerAdd,
        #AnswerFormPortalContainer .AnswerAdd,
        #AnswerFormPortalContainer .AnswerForm,
        #AnswerFormPortalContainer .AnswerFormEditorContainer,
        #AnswerFormPortalContainer .AnswerFormEditorContainer > div,
        #AnswerFormPortalContainer .AnswerForm-editor,
        #AnswerFormPortalContainer .RichText--editable,
        #AnswerFormPortalContainer .Sticky:not(.AIAssistantPanelV2-container),
        #AnswerFormPortalContainer .Sticky:not(.AIAssistantPanelV2-container) > div {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .QuestionAnswers-answerAdd {
            border: 1px solid #EBEBEB !important;
            border-radius: 6px !important;
            overflow: hidden !important;
        }
        html[data-theme="dark"] #AnswerFormPortalContainer .QuestionAnswers-answerAdd {
            border-color: #2E2F34 !important;
        }
        #AnswerFormPortalContainer .AnswerForm-editor {
            display: flex !important;
            flex-direction: column !important;
            overflow-x: hidden !important;
            padding: 8px 16px !important;
            margin: 0 !important;
            min-height: 200px !important;
            height: auto !important;
        }
        #AnswerFormPortalContainer .AnswerFormEditorContainer,
        #AnswerFormPortalContainer .Dropzone,
        #AnswerFormPortalContainer .Editable-content,
        #AnswerFormPortalContainer .RichText--editable,
        #AnswerFormPortalContainer .DraftEditor-root,
        #AnswerFormPortalContainer .DraftEditor-editorContainer,
        #AnswerFormPortalContainer .public-DraftEditor-content {
            min-height: 200px !important;
            height: auto !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 4px !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 4px 8px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child > ul.Tabs,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > ul.Tabs,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] [data-zh-hide-editor-hint="true"] {
            display: none !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-undo-group,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-undo-group {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            flex-shrink: 0 !important;
            padding-bottom: 2px !important;
            margin-right: 10px !important;
            border-bottom: 2px solid #1772F6 !important;
        }
        #AnswerFormPortalContainer .ToolbarButton .togglerIcon {
            display: none !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-toolbar-slot,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-toolbar-slot {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
            gap: 2px !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            scrollbar-width: none !important;
            margin: 0 10px 0 20px !important;
        }
        #AnswerFormPortalContainer button[aria-label="创作助手"] svg,
        #AnswerFormPortalContainer button[aria-label="创作助手"] img {
            filter: grayscale(100%) contrast(1.15) brightness(0.65) !important;
        }
        html[data-theme="dark"] #AnswerFormPortalContainer button[aria-label="创作助手"] svg,
        html[data-theme="dark"] #AnswerFormPortalContainer button[aria-label="创作助手"] img {
            filter: grayscale(100%) contrast(1.1) brightness(1.1) !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-toolbar-slot::-webkit-scrollbar,
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-toolbar-slot::-webkit-scrollbar {
            display: none !important;
        }
        #AnswerFormPortalContainer .AnswerAdd > div:first-child > div:last-child:not(.zh-top-toolbar-slot):not(.zh-top-undo-group),
        #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > div:last-child:not(.zh-top-toolbar-slot):not(.zh-top-undo-group) {
            flex-shrink: 0 !important;
            margin-left: 4px !important;
            white-space: nowrap !important;
            font-size: 13px !important;
        }
        #AnswerFormPortalContainer .zh-top-undo-group .ToolbarButton,
        #AnswerFormPortalContainer .zh-top-toolbar-slot .ToolbarButton,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton {
            padding: 4px 4px !important;
            margin: 0 !important;
            min-width: 0 !important;
            width: auto !important;
            height: auto !important;
            flex-shrink: 0 !important;
        }
        #AnswerFormPortalContainer .zh-top-undo-group .ToolbarButton > div,
        #AnswerFormPortalContainer .zh-top-toolbar-slot .ToolbarButton > div,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton > div {
            padding: 0 !important;
            margin: 0 !important;
            min-width: 0 !important;
        }
        #AnswerFormPortalContainer .zh-top-undo-group .ToolbarButton svg,
        #AnswerFormPortalContainer .zh-top-toolbar-slot .ToolbarButton svg,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton svg {
            width: 21px !important;
            height: 21px !important;
        }
        #AnswerFormPortalContainer .zh-top-undo-group .ToolbarButton span:last-child,
        #AnswerFormPortalContainer .zh-top-toolbar-slot .ToolbarButton span:last-child,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton span:last-child {
            font-size: 12px !important;
            line-height: 1.25 !important;
            white-space: nowrap !important;
        }
        #AnswerFormPortalContainer .zh-top-toolbar-slot .zh-unpacked-more-btn[data-zh-active="true"],
        #AnswerFormPortalContainer .zh-top-toolbar-slot .zh-unpacked-more-btn[data-zh-active="true"] * {
            color: #1772F6 !important;
        }
        #AnswerFormPortalContainer .zh-top-toolbar-slot .zh-unpacked-more-btn[data-zh-active="false"],
        #AnswerFormPortalContainer .zh-top-toolbar-slot .zh-unpacked-more-btn[data-zh-active="false"] * {
            color: #8491A5 !important;
        }
        #AnswerFormPortalContainer .AnswerFormEditorContainer,
        #AnswerFormPortalContainer .AnswerFormEditorContainer > div,
        #AnswerFormPortalContainer .DraftEditor-root,
        #AnswerFormPortalContainer .DraftEditor-editorContainer,
        #AnswerFormPortalContainer .public-DraftEditor-content,
        #AnswerFormPortalContainer .Editable-content {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 12px 0 0 0 !important;
            box-sizing: border-box !important;
            border-left: none !important;
            border-top: 1px solid #EBEBEB !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container[data-zh-ai-floating="true"] {
            position: fixed !important;
            margin: 0 !important;
            z-index: 20 !important;
            padding: 10px 12px !important;
            height: auto !important;
            min-height: 0 !important;
            border: 1px solid #EBEBEB !important;
            border-radius: 8px !important;
            background: #FFFFFF !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06) !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container[data-zh-ai-floating="true"] > div {
            height: auto !important;
            min-height: 0 !important;
        }
        html[data-theme="dark"] #AnswerFormPortalContainer .AIAssistantPanelV2-container {
            border-top-color: #2E2F34 !important;
        }
        html[data-theme="dark"] #AnswerFormPortalContainer .AIAssistantPanelV2-container[data-zh-ai-floating="true"] {
            background: #1B1C20 !important;
            border-color: #2E2F34 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container[data-zh-ai-closed="true"] {
            display: none !important;
        }
        #AnswerFormPortalContainer .Sticky.is-fixed:not(.AIAssistantPanelV2-container),
        #AnswerFormPortalContainer .Sticky.is-fixed.is-bottom:not(.AIAssistantPanelV2-container) {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            bottom: auto !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-collapsed="true"] {
            display: none !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] {
            margin: 10px 0 0 0 !important;
            padding: 10px 0 0 0 !important;
            border-top: 1px solid #EBEBEB !important;
            font-size: 12px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        html[data-theme="dark"] #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] {
            border-top-color: #2E2F34 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] * {
            font-size: 12px !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] > div:empty {
            display: none !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] > div {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            margin: 0 0 8px 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] > div > label {
            width: auto !important;
            min-width: 68px !important;
            max-width: 84px !important;
            margin: 0 !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
            line-height: 1.4 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
            white-space: nowrap !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] > div > div {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] .Popover,
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] .Select-button {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 28px !important;
            padding: 0 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] .Popover {
            padding: 0 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] [data-zh-radio-group="true"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 4px !important;
            width: 100% !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] label[for^="PublishPanel-"] {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            margin: 0 !important;
            white-space: nowrap !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-publish-in-ai="true"] input[type="text"] {
            height: 26px !important;
            padding: 2px 6px !important;
            min-width: 0 !important;
            max-width: 100% !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-schedule-switch="true"] {
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            opacity: 0 !important;
            pointer-events: none !important;
            overflow: hidden !important;
        }
        .zh-schedule-time-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 28px !important;
            padding: 0 12px !important;
            font-size: 12px !important;
            color: #1772F6 !important;
            background: #F4F8FF !important;
            border: 1px solid #C2DAFF !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            white-space: nowrap !important;
        }
        .zh-schedule-time-btn:hover {
            background: #E6F0FF !important;
        }
        html[data-theme="dark"] .zh-schedule-time-btn {
            color: #66A3FF !important;
            background: #1F2A3D !important;
            border-color: #2E476E !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-bar-wrap="true"] {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 8px 12px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            flex-wrap: nowrap !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-bar-wrap="true"] > button:first-child {
            display: none !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-bar-wrap="true"] > * {
            margin-left: 0 !important;
            margin-right: 0 !important;
            font-size: 12px !important;
            white-space: nowrap !important;
            flex-shrink: 1 !important;
            min-width: 0 !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-bar="true"] {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: auto !important;
            max-width: none !important;
            margin-left: auto !important;
            padding: 0 !important;
            flex: 0 0 auto !important;
            flex-wrap: nowrap !important;
        }
        #AnswerFormPortalContainer [data-zh-publish-bar="true"] > button {
            flex-shrink: 0 !important;
            margin: 0 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-hide="true"],
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-desc="true"] {
            display: none !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-grid="true"] {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-top: 8px !important;
            padding: 0 !important;
            width: 100% !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container[data-zh-ai-narrow="true"] [data-zh-ai-grid="true"] {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-card="true"] {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 7px 6px !important;
            min-height: 0 !important;
            min-width: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            border-radius: 6px !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-card="true"] > div {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-card="true"] * {
            white-space: nowrap !important;
            word-break: keep-all !important;
            writing-mode: horizontal-tb !important;
            font-size: 12px !important;
            line-height: 1.3 !important;
        }
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-card="true"] > svg:last-child,
        #AnswerFormPortalContainer .AIAssistantPanelV2-container [data-zh-ai-card="true"] > span:last-child > svg {
            display: none !important;
        }
        #AnswerFormPortalContainer .toolbarV3 {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            row-gap: 4px !important;
            column-gap: 2px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            padding: 6px 10px !important;
            overflow: visible !important;
            box-sizing: border-box !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .mainArea,
        #AnswerFormPortalContainer .toolbarV3 .toolbar-section,
        #AnswerFormPortalContainer .toolbarV3 .fixArea,
        #AnswerFormPortalContainer .toolbarV3 .AiAssistantArea {
            display: contents !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .moreArea[data-zh-more-unpacked="true"] {
            position: absolute !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
            opacity: 0 !important;
        }
        #AnswerFormPortalContainer .toolbarV3 div:empty,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarDivider {
            display: none !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton {
            padding: 4px 5px !important;
            min-width: 0 !important;
            height: auto !important;
            flex-shrink: 0 !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .ToolbarDivider {
            margin-left: 2px !important;
            margin-right: 2px !important;
            flex-shrink: 0 !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .ToolbarDivider:last-child {
            display: none !important;
        }
        /* 窄窗下的编辑器工具栏自适应：第1行留左“撤销/重做”+右“全屏编辑”，红框工具组独立占第2行，原第2行(.toolbarV3)自然下移到第3行 */
        body.zh-sidebar-hamburger #AnswerFormPortalContainer .AnswerAdd > div:first-child,
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-editor-topbar="true"] {
            flex-wrap: wrap !important;
            justify-content: space-between !important;
            gap: 4px !important;
            padding: 6px 8px !important;
        }
        body.zh-sidebar-hamburger #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-undo-group,
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-undo-group {
            order: 1 !important;
            margin-right: 4px !important;
            gap: 4px !important;
        }
        body.zh-sidebar-hamburger #AnswerFormPortalContainer .AnswerAdd > div:first-child > div:last-child:not(.zh-top-toolbar-slot):not(.zh-top-undo-group),
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > div:last-child:not(.zh-top-toolbar-slot):not(.zh-top-undo-group) {
            order: 2 !important;
            margin-left: auto !important;
        }
        body.zh-sidebar-hamburger #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-toolbar-slot,
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-toolbar-slot {
            order: 3 !important;
            flex: 1 0 100% !important;
            width: 100% !important;
            flex-wrap: wrap !important;
            justify-content: space-between !important;
            overflow-x: visible !important;
            margin: 4px 0 0 0 !important;
            padding-top: 6px !important;
            border-top: 1px solid #f0f2f7 !important;
            gap: 2px 4px !important;
        }
        html[data-theme="dark"] body.zh-sidebar-hamburger #AnswerFormPortalContainer .AnswerAdd > div:first-child > .zh-top-toolbar-slot,
        html[data-theme="dark"] body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-editor-topbar="true"] > .zh-top-toolbar-slot {
            border-top-color: #2e3035 !important;
        }
        body.zh-sidebar-hamburger #AnswerFormPortalContainer .toolbarV3 {
            justify-content: flex-start !important;
            gap: 4px 6px !important;
            padding: 6px 8px !important;
        }
        /* 窄窗下底部发布栏自动换行，防止右侧“提交修改”等按钮被裁切 */
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-publish-bar-wrap="true"] {
            flex-wrap: wrap !important;
            gap: 6px 8px !important;
            padding: 8px !important;
        }
        body.zh-sidebar-hamburger #AnswerFormPortalContainer [data-zh-publish-bar="true"] {
            flex-wrap: wrap !important;
            max-width: 100% !important;
            gap: 6px !important;
        }
        #AnswerFormPortalContainer .toolbarV3 .moreArea[data-zh-more-unpacked="true"] .Popover > button,
        #AnswerFormPortalContainer .toolbarV3 .ToolbarButton.zh-more-hidden-trigger,
        .toolbarV3 .zh-more-hidden-trigger {
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
            overflow: hidden !important;
        }
        .toolbarV3 .zh-unpacked-more-btn[data-zh-active="true"],
        .toolbarV3 .zh-unpacked-more-btn[data-zh-active="true"] * {
            color: #1772F6 !important;
        }
        body.zh-silent-popover .Popover-content {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }

        /* ---------- 1.9 QQ 式双栏私信弹窗 ---------- */
        #zh-qq-chat-backdrop {
            position: fixed !important;
            inset: 0 !important;
            background: rgba(0, 0, 0, 0.45) !important;
            z-index: 10000 !important;
            display: none !important;
        }
        body.zh-qq-chat-open #zh-qq-chat-backdrop {
            display: block !important;
        }
        body.zh-qq-chat-open.zh-qq-chat-pinned #zh-qq-chat-backdrop {
            display: none !important;
        }
        .zh-qq-pin-btn {
            border: 1px solid #d0d7de !important;
            background: transparent !important;
            color: #5c6676 !important;
            border-radius: 5px !important;
            font-size: 12px !important;
            padding: 2px 8px !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            line-height: 1.5 !important;
        }
        .zh-qq-pin-btn:hover {
            color: #1772f6 !important;
            border-color: #1772f6 !important;
        }
        .zh-qq-pin-btn.is-pinned {
            background: #eef4ff !important;
            color: #1772f6 !important;
            border-color: #1772f6 !important;
        }
        html[data-theme="dark"] .zh-qq-pin-btn {
            border-color: #3a3d46 !important;
            color: #9ca3af !important;
        }
        html[data-theme="dark"] .zh-qq-pin-btn.is-pinned {
            background: rgba(23, 114, 246, 0.2) !important;
            color: #4d9cff !important;
            border-color: #4d9cff !important;
        }
        #zh-qq-chat-shell {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: min(1060px, 94vw) !important;
            height: min(680px, 86vh) !important;
            max-width: calc(100vw - 16px) !important;
            max-height: calc(100vh - 16px) !important;
            min-width: 280px !important;
            min-height: 360px !important;
            background: #ffffff !important;
            border-radius: 12px !important;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28) !important;
            z-index: 10001 !important;
            display: none !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #e5e7eb !important;
        }
        #zh-qq-chat-shell.zh-has-rect {
            transform: none !important;
        }
        #zh-qq-chat-shell.zh-dragging #zh-qq-chat-iframe {
            pointer-events: none !important;
        }
        .zh-qq-resize-handle {
            position: absolute !important;
            z-index: 10 !important;
        }
        .zh-qq-resize-r { top: 10px; right: 0; width: 7px; bottom: 10px; cursor: ew-resize; }
        .zh-qq-resize-l { top: 10px; left: 0; width: 7px; bottom: 10px; cursor: ew-resize; }
        .zh-qq-resize-t { left: 12px; right: 12px; top: 0; height: 6px; cursor: ns-resize; }
        .zh-qq-resize-b { left: 12px; right: 12px; bottom: 0; height: 8px; cursor: ns-resize; }
        .zh-qq-resize-br { right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; }
        .zh-qq-resize-bl { left: 0; bottom: 0; width: 14px; height: 14px; cursor: nesw-resize; }
        .zh-qq-resize-tr { right: 0; top: 0; width: 14px; height: 14px; cursor: nesw-resize; }
        .zh-qq-resize-tl { left: 0; top: 0; width: 14px; height: 14px; cursor: nwse-resize; }
        body.zh-qq-chat-open #zh-qq-chat-shell {
            display: flex !important;
        }
        html[data-theme="dark"] #zh-qq-chat-shell {
            background: #1e1f24 !important;
            border-color: #2f313a !important;
            color: #e5e7eb !important;
        }
        .zh-qq-shell-topbar {
            height: 40px !important;
            flex-shrink: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0 14px !important;
            background: #f5f6f8 !important;
            border-bottom: 1px solid #e5e7eb !important;
            font-size: 13.5px !important;
            font-weight: 600 !important;
            color: #191b1f !important;
            cursor: move !important;
            user-select: none !important;
        }
        html[data-theme="dark"] .zh-qq-shell-topbar {
            background: #18191d !important;
            border-bottom-color: #2f313a !important;
            color: #f3f4f6 !important;
        }
        .zh-qq-shell-topbar-actions {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            flex-shrink: 0 !important;
        }
        .zh-qq-top-search {
            flex: 1 1 0% !important;
            max-width: 280px !important;
            min-width: 64px !important;
            height: 28px !important;
            margin: 0 8px !important;
            padding: 0 12px !important;
            border-radius: 14px !important;
            border: 1px solid #dcdfe6 !important;
            background: #ffffff !important;
            font-size: 12.5px !important;
            font-weight: 400 !important;
            color: #191b1f !important;
            outline: none !important;
            box-sizing: border-box !important;
        }
        .zh-qq-top-search:focus {
            border-color: #1772f6 !important;
        }
        html[data-theme="dark"] .zh-qq-top-search {
            background: #25272d !important;
            border-color: #3a3d46 !important;
            color: #e5e7eb !important;
        }
        .zh-qq-mini-btn {
            border: 1px solid #d0d7de !important;
            background: transparent !important;
            color: #5c6676 !important;
            border-radius: 5px !important;
            font-size: 12px !important;
            padding: 2px 8px !important;
            cursor: pointer !important;
            text-decoration: none !important;
            line-height: 1.5 !important;
        }
        .zh-qq-mini-btn:hover {
            color: #1772f6 !important;
            border-color: #1772f6 !important;
        }
        html[data-theme="dark"] .zh-qq-mini-btn {
            border-color: #3a3d46 !important;
            color: #9ca3af !important;
        }
        .zh-qq-shell-close {
            border: none !important;
            background: transparent !important;
            color: #8491a5 !important;
            font-size: 20px !important;
            line-height: 1 !important;
            cursor: pointer !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
        }
        .zh-qq-shell-close:hover {
            color: #191b1f !important;
            background: rgba(0, 0, 0, 0.06) !important;
        }
        html[data-theme="dark"] .zh-qq-shell-close:hover {
            color: #f3f4f6 !important;
            background: rgba(255, 255, 255, 0.08) !important;
        }
        .zh-qq-iframe-wrap {
            position: relative !important;
            flex: 1 1 auto !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            background: #ffffff !important;
        }
        html[data-theme="dark"] .zh-qq-iframe-wrap {
            background: #1e1f24 !important;
        }
        #zh-qq-chat-iframe {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: #ffffff !important;
            opacity: 1 !important;
            transition: opacity 0.18s ease !important;
        }
        .zh-qq-iframe-wrap.is-loading #zh-qq-chat-iframe {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        .zh-qq-loading {
            position: absolute !important;
            inset: 0 !important;
            display: none !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 12px !important;
            color: #8491a5 !important;
            font-size: 13.5px !important;
            z-index: 2 !important;
        }
        .zh-qq-iframe-wrap.is-loading .zh-qq-loading {
            display: flex !important;
        }
        .zh-qq-spinner {
            width: 28px !important;
            height: 28px !important;
            border: 3px solid rgba(23, 114, 246, 0.18) !important;
            border-top-color: #1772f6 !important;
            border-radius: 50% !important;
            animation: zh-qq-spin 0.75s linear infinite !important;
        }
        @keyframes zh-qq-spin {
            to { transform: rotate(360deg); }
        }
        html[data-theme="dark"] #zh-qq-chat-iframe {
            background: #1e1f24 !important;
        }
        /* 嵌入模式下的 /messages 独立私信页面：隐藏顶栏/侧栏/页脚，全屏铺满 ChatWrapper */
        html.zh-messages-embed header,
        html.zh-messages-embed header[role="banner"],
        html.zh-messages-embed .AppHeader,
        html.zh-messages-embed .LeanAppHeaderBar,
        html.zh-messages-embed aside,
        html.zh-messages-embed [data-zh-sidebar-col="true"],
        html.zh-messages-embed [data-zh-sidebar="true"],
        html.zh-messages-embed [data-zh-sidebar-card="true"],
        html.zh-messages-embed footer.Footer,
        html.zh-messages-embed .CornerButtonsGroup,
        html.zh-messages-embed .CornerButtons,
        html.zh-messages-embed .AdblockBanner,
        body.zh-messages-embed header,
        body.zh-messages-embed header[role="banner"],
        body.zh-messages-embed .AppHeader,
        body.zh-messages-embed .LeanAppHeaderBar,
        body.zh-messages-embed aside,
        body.zh-messages-embed [data-zh-sidebar-col="true"],
        body.zh-messages-embed [data-zh-sidebar="true"],
        body.zh-messages-embed [data-zh-sidebar-card="true"],
        body.zh-messages-embed footer.Footer,
        body.zh-messages-embed .CornerButtonsGroup,
        body.zh-messages-embed .CornerButtons,
        body.zh-messages-embed .AdblockBanner {
            display: none !important;
        }
        html.zh-messages-embed,
        html.zh-messages-embed body,
        html.zh-messages-embed #root,
        html.zh-messages-embed .App-main,
        body.zh-messages-embed,
        body.zh-messages-embed #root,
        body.zh-messages-embed .App-main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 100vh !important;
            overflow: hidden !important;
        }
        html.zh-messages-embed .ChatWrapper,
        body.zh-messages-embed .ChatWrapper {
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
        }
        html[data-theme="dark"].zh-messages-embed .ChatWrapper,
        html[data-theme="dark"] body.zh-messages-embed .ChatWrapper {
            background: #1e1f24 !important;
        }
        html.zh-messages-embed .ChatWrapper > div,
        body.zh-messages-embed .ChatWrapper > div {
            width: 100% !important;
            max-width: 100% !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            border: none !important;
        }
        body.zh-messages-embed .ChatSideBar {
            height: 100vh !important;
        }
        body.zh-messages-embed .Chat-ChatBox {
            height: 100vh !important;
        }
        /* /messages 自定义对话分类与屏蔽隐藏样式 */
        .zh-blocked-dm-hidden {
            display: none !important;
        }
        .zh-hide-dm-badge .Messages-count,
        .zh-hide-dm-badge [class*="count"],
        .zh-hide-dm-badge [class*="Badge"],
        .zh-hide-dm-badge [class*="badge"] {
            display: none !important;
        }
        /* 知乎风格网页内输入/确认弹窗 */
        .zh-dialog-backdrop {
            position: fixed !important;
            inset: 0 !important;
            background: rgba(18, 18, 18, 0.45) !important;
            z-index: 10050 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .zh-dialog-card {
            width: min(360px, 88vw) !important;
            background: #ffffff !important;
            border-radius: 10px !important;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2) !important;
            padding: 20px 22px 18px !important;
            box-sizing: border-box !important;
            border: 1px solid #ebeced !important;
        }
        html[data-theme="dark"] .zh-dialog-card {
            background: #232429 !important;
            border-color: #34363e !important;
            color: #e5e7eb !important;
        }
        .zh-dialog-title {
            font-size: 16px !important;
            font-weight: 600 !important;
            color: #191b1f !important;
            margin: 0 0 12px !important;
        }
        html[data-theme="dark"] .zh-dialog-title {
            color: #f3f4f6 !important;
        }
        .zh-dialog-msg {
            font-size: 14px !important;
            color: #5c6676 !important;
            margin: 0 0 16px !important;
            line-height: 1.5 !important;
        }
        html[data-theme="dark"] .zh-dialog-msg {
            color: #9ca3af !important;
        }
        .zh-dialog-input {
            width: 100% !important;
            height: 36px !important;
            padding: 0 12px !important;
            border: 1px solid #dcdfe6 !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            color: #191b1f !important;
            background: #ffffff !important;
            box-sizing: border-box !important;
            outline: none !important;
            margin-bottom: 16px !important;
        }
        .zh-dialog-input:focus {
            border-color: #1772f6 !important;
            box-shadow: 0 0 0 2px rgba(23, 114, 246, 0.14) !important;
        }
        html[data-theme="dark"] .zh-dialog-input {
            background: #1a1b20 !important;
            border-color: #3a3d46 !important;
            color: #f3f4f6 !important;
        }
        .zh-dialog-actions {
            display: flex !important;
            justify-content: flex-end !important;
            gap: 10px !important;
        }
        .zh-dialog-btn {
            height: 32px !important;
            padding: 0 16px !important;
            border-radius: 6px !important;
            font-size: 13.5px !important;
            cursor: pointer !important;
            border: 1px solid transparent !important;
        }
        .zh-dialog-btn-cancel {
            background: transparent !important;
            border-color: #dcdfe6 !important;
            color: #646464 !important;
        }
        .zh-dialog-btn-cancel:hover {
            background: rgba(0, 0, 0, 0.04) !important;
        }
        html[data-theme="dark"] .zh-dialog-btn-cancel {
            border-color: #3a3d46 !important;
            color: #9ca3af !important;
        }
        .zh-dialog-btn-primary {
            background: #1772f6 !important;
            color: #ffffff !important;
            font-weight: 500 !important;
        }
        .zh-dialog-btn-primary:hover {
            background: #056de8 !important;
        }
        /* 三栏私信分类导航 & 窄窗口三层钻取模式 */
        .ChatWrapper > div {
            display: flex !important;
            flex-direction: row !important;
            width: 100% !important;
        }
        #zh-chat-cat-nav {
            width: 168px !important;
            flex: 0 0 168px !important;
            border-right: 1px solid #f0f2f7 !important;
            background: #fafbfc !important;
            display: flex !important;
            flex-direction: column !important;
            overflow-y: auto !important;
            padding: 8px 0 !important;
            box-sizing: border-box !important;
        }
        html[data-theme="dark"] #zh-chat-cat-nav {
            background: #18191d !important;
            border-right-color: #2e3035 !important;
        }
        .zh-chat-nav-item {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 12px 14px !important;
            font-size: 14px !important;
            color: #191b1f !important;
            cursor: pointer !important;
            user-select: none !important;
            border-left: 3px solid transparent !important;
            transition: background-color 0.12s ease !important;
        }
        .zh-chat-nav-item:hover {
            background: rgba(0, 0, 0, 0.04) !important;
        }
        .zh-chat-nav-item.is-active {
            background: #eef4ff !important;
            color: #1772f6 !important;
            font-weight: 600 !important;
            border-left-color: #1772f6 !important;
        }
        html[data-theme="dark"] .zh-chat-nav-item {
            color: #d1d5db !important;
        }
        html[data-theme="dark"] .zh-chat-nav-item:hover {
            background: rgba(255, 255, 255, 0.05) !important;
        }
        html[data-theme="dark"] .zh-chat-nav-item.is-active {
            background: rgba(23, 114, 246, 0.2) !important;
            color: #4d9cff !important;
        }
        .zh-chat-nav-label {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }
        .zh-chat-nav-right {
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
            flex-shrink: 0 !important;
        }
        .zh-chat-nav-item:hover .zh-chat-cat-op-btn {
            opacity: 1 !important;
        }
        .zh-chat-nav-arrow {
            width: 18px !important;
            height: 18px !important;
            color: #8491a5 !important;
            display: none !important;
        }
        .ChatSideBar {
            width: 268px !important;
            min-width: 268px !important;
            max-width: 268px !important;
            flex: 0 0 268px !important;
        }
        html.zh-messages-embed .ChatSideBar,
        body.zh-messages-embed .ChatSideBar,
        html.zh-messages-embed .ChatSideBar .ChatListGroup,
        body.zh-messages-embed .ChatSideBar .ChatListGroup {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }
        .Chat-ChatBox,
        .ChatBox-empty {
            flex: 1 1 auto !important;
            min-width: 0 !important;
        }
        .ChatBox-empty {
            background-color: #ffffff !important;
            background-image: none !important;
        }
        html[data-theme="dark"] .ChatBox-empty {
            background-color: #1e1f24 !important;
        }
        .ChatBox-empty svg,
        .ChatBox-empty img {
            display: none !important;
        }
        .Chat-ChatBox > div {
            min-width: 0 !important;
        }
        html.zh-messages-embed img.ImageMessage,
        body.zh-messages-embed img.ImageMessage {
            visibility: visible !important;
            pointer-events: auto !important;
            cursor: zoom-in !important;
        }
        .zh-chat-toolbar {
            padding: 8px 16px 4px !important;
            display: flex !important;
            align-items: center !important;
            gap: 16px !important;
            box-sizing: border-box !important;
        }
        .zh-chat-robot-btn {
            border: none !important;
            background: transparent !important;
            color: inherit !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 24px !important;
            height: 24px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            transition: color 0.15s ease !important;
        }
        .zh-chat-robot-btn:hover {
            color: #1772f6 !important;
        }
        #zh-chat-quick-menu {
            position: fixed !important;
            z-index: 10030 !important;
            min-width: 170px !important;
            max-width: 260px !important;
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
            padding: 6px 0 !important;
            font-size: 13px !important;
        }
        html[data-theme="dark"] #zh-chat-quick-menu {
            background: #25272d !important;
            border-color: #3a3d46 !important;
            color: #e5e7eb !important;
        }
        .zh-chat-quick-item {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            padding: 7px 12px !important;
            cursor: pointer !important;
        }
        .zh-chat-quick-item:hover {
            background: rgba(23, 114, 246, 0.08) !important;
            color: #1772f6 !important;
        }
        .zh-chat-quick-del {
            border: none !important;
            background: transparent !important;
            color: #8491a5 !important;
            cursor: pointer !important;
            font-size: 13px !important;
            padding: 0 4px !important;
        }
        .zh-chat-quick-del:hover {
            color: #f1403c !important;
        }
        .zh-chat-quick-add {
            border-top: 1px solid #f0f2f7 !important;
            margin-top: 4px !important;
            padding: 7px 12px 4px !important;
            color: #1772f6 !important;
            cursor: pointer !important;
        }
        html[data-theme="dark"] .zh-chat-quick-add {
            border-top-color: #3a3d46 !important;
        }
        /* 非搜索模式下隐藏中栏原生分组标题，只显示当前选中分类 */
        .ChatSideBar .ChatListGroup-SectionTitle {
            display: none !important;
        }
        .ChatSideBar:not(.zh-searching) .ChatListGroup-Section.zh-group-hidden {
            display: none !important;
        }
        .ChatSideBar:not(.zh-searching) .ChatListGroup-Section:not(.zh-group-hidden) .ChatListGroup-SectionContent {
            height: auto !important;
        }
        .ChatSideBar.zh-searching #zh-chat-custom-users,
        .ChatSideBar.zh-searching .ChatListGroup-Section {
            display: none !important;
        }
        #zh-chat-search-results {
            display: none !important;
            flex-direction: column !important;
            width: 100% !important;
            overflow-y: auto !important;
            flex: 1 1 auto !important;
        }
        .ChatSideBar.zh-searching #zh-chat-search-results {
            display: flex !important;
        }
        .zh-chat-search-group-title {
            padding: 8px 16px 4px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            color: #8491a5 !important;
        }
        .zh-chat-search-item {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 10px 16px !important;
            cursor: pointer !important;
            transition: background-color 0.15s ease !important;
        }
        .zh-chat-search-item:hover {
            background: #f4f6f9 !important;
        }
        html[data-theme="dark"] .zh-chat-search-item:hover {
            background: rgba(255, 255, 255, 0.06) !important;
        }
        .zh-chat-search-avatar {
            width: 38px !important;
            height: 38px !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            flex-shrink: 0 !important;
            background: #eef1f6 !important;
        }
        .zh-chat-search-meta {
            flex: 1 1 0% !important;
            min-width: 0 !important;
        }
        .zh-chat-search-name {
            font-size: 14px !important;
            font-weight: 500 !important;
            color: #191b1f !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        html[data-theme="dark"] .zh-chat-search-name {
            color: #e5e7eb !important;
        }
        .zh-chat-search-sub {
            font-size: 12px !important;
            color: #8491a5 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            margin-top: 2px !important;
        }
        .zh-chat-search-empty {
            padding: 24px 16px !important;
            text-align: center !important;
            font-size: 13px !important;
            color: #8491a5 !important;
        }
        .zh-chat-narrow-backbar {
            display: none !important;
            align-items: center !important;
            gap: 8px !important;
            height: 42px !important;
            padding: 0 12px !important;
            border-bottom: 1px solid #f0f2f7 !important;
            background: #fafbfc !important;
            flex-shrink: 0 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
        }
        html[data-theme="dark"] .zh-chat-narrow-backbar {
            background: #18191d !important;
            border-bottom-color: #2e3035 !important;
            color: #e5e7eb !important;
        }
        .zh-chat-narrow-backbtn {
            border: none !important;
            background: transparent !important;
            color: #1772f6 !important;
            font-size: 13.5px !important;
            cursor: pointer !important;
            padding: 4px 6px !important;
            border-radius: 4px !important;
        }
        .zh-chat-narrow-backbtn:hover {
            background: rgba(23, 114, 246, 0.08) !important;
        }
        html.zh-messages-embed .ChatSideBar-Search,
        body.zh-messages-embed .ChatSideBar-Search {
            position: relative !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            overflow: visible !important;
            flex-shrink: 0 !important;
        }
        html.zh-messages-embed .ChatSideBar-Search-Input,
        body.zh-messages-embed .ChatSideBar-Search-Input {
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
            overflow: hidden !important;
        }
        html.zh-messages-embed .ChatSideBar,
        body.zh-messages-embed .ChatSideBar {
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            padding: 0 !important;
            padding-top: 0 !important;
            padding-block-start: 0 !important;
        }
        html.zh-messages-embed .ChatSideBar > .zh-chat-narrow-backbar,
        body.zh-messages-embed .ChatSideBar > .zh-chat-narrow-backbar {
            position: relative !important;
            z-index: 5 !important;
            flex: 0 0 42px !important;
            height: 42px !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        html.zh-messages-embed .ChatSideBar > *:not(.zh-chat-narrow-backbar):not(.ChatSideBar-Search),
        body.zh-messages-embed .ChatSideBar > *:not(.zh-chat-narrow-backbar):not(.ChatSideBar-Search),
        html.zh-messages-embed .ChatSideBar > .ChatListGroup,
        body.zh-messages-embed .ChatSideBar > .ChatListGroup {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            margin: 0 !important;
            padding-top: 0 !important;
            flex: 1 1 0% !important;
            min-height: 0 !important;
            height: auto !important;
        }
        /* 中等宽度两栏模式（560px ~ 819px）：左侧在“分类列表”与“联系人列表”间切换，右侧聊天框始终保留 */
        html.zh-chat-medium[data-zh-medium-left="users"] #zh-chat-cat-nav {
            display: none !important;
        }
        html.zh-chat-medium[data-zh-medium-left="users"] .zh-chat-narrow-backbar[data-step="users"] {
            display: flex !important;
        }
        html.zh-chat-medium[data-zh-medium-left="cats"] .ChatSideBar {
            display: none !important;
        }
        html.zh-chat-medium[data-zh-medium-left="cats"] #zh-chat-cat-nav {
            width: 268px !important;
            min-width: 268px !important;
            max-width: 268px !important;
            flex: 0 0 268px !important;
        }
        html.zh-chat-medium[data-zh-medium-left="cats"] .zh-chat-nav-arrow {
            display: inline-block !important;
        }
        /* 窄窗口三层钻取模式（width < 560px） */
        html.zh-chat-narrow .zh-chat-nav-arrow {
            display: inline-block !important;
        }
        html.zh-chat-narrow .ChatWrapper > div {
            flex-direction: column !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="cats"] #zh-chat-cat-nav {
            width: 100% !important;
            flex: 1 1 auto !important;
            border-right: none !important;
            background: #ffffff !important;
        }
        html[data-theme="dark"].zh-chat-narrow[data-zh-narrow-step="cats"] #zh-chat-cat-nav {
            background: #1e1f24 !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="cats"] .ChatSideBar,
        html.zh-chat-narrow[data-zh-narrow-step="cats"] .Chat-ChatBox,
        html.zh-chat-narrow[data-zh-narrow-step="cats"] .ChatBox-empty {
            display: none !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="users"] #zh-chat-cat-nav,
        html.zh-chat-narrow[data-zh-narrow-step="users"] .Chat-ChatBox,
        html.zh-chat-narrow[data-zh-narrow-step="users"] .ChatBox-empty {
            display: none !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="users"] .ChatSideBar {
            width: 100% !important;
            flex: 1 1 auto !important;
            border-right: none !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="users"] .zh-chat-narrow-backbar[data-step="users"],
        html.zh-chat-narrow[data-zh-narrow-step="chat"] .zh-chat-narrow-backbar[data-step="chat"] {
            display: flex !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="chat"] #zh-chat-cat-nav,
        html.zh-chat-narrow[data-zh-narrow-step="chat"] .ChatSideBar {
            display: none !important;
        }
        html.zh-chat-narrow[data-zh-narrow-step="chat"] .Chat-ChatBox,
        html.zh-chat-narrow[data-zh-narrow-step="chat"] .ChatBox-empty {
            width: 100% !important;
            flex: 1 1 auto !important;
            display: flex !important;
        }
        .ChatSideBar .ChatListGroup {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
        }
        .ChatSideBar .ChatListGroup-Section {
            flex: 0 0 auto !important;
            min-height: 0 !important;
        }
        #zh-chat-custom-cats {
            display: contents !important;
        }
        .zh-chat-cat-section {
            flex: 0 0 auto !important;
        }
        .zh-chat-cat-section-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 14px var(--zh-chat-pad-right, 20px) 14px var(--zh-chat-pad-left, 20px) !important;
            font-size: 15px !important;
            font-weight: 400 !important;
            color: #191b1f !important;
            cursor: pointer !important;
            user-select: none !important;
            box-sizing: border-box !important;
        }
        .zh-chat-cat-section-header:hover {
            background: rgba(0, 0, 0, 0.03) !important;
        }
        html[data-theme="dark"] .zh-chat-cat-section-header {
            color: #e5e7eb !important;
        }
        .zh-chat-cat-ops {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            color: #8491a5 !important;
        }
        .zh-chat-cat-op-btn {
            opacity: 0 !important;
            border: none !important;
            background: transparent !important;
            color: #8491a5 !important;
            font-size: 13px !important;
            cursor: pointer !important;
            padding: 1px 4px !important;
            border-radius: 3px !important;
            transition: opacity 0.12s ease !important;
        }
        .zh-chat-cat-section-header:hover .zh-chat-cat-op-btn {
            opacity: 1 !important;
        }
        .zh-chat-cat-op-btn:hover {
            color: #1772f6 !important;
            background: rgba(23, 114, 246, 0.08) !important;
        }
        .zh-chat-cat-chevron {
            width: 16px !important;
            height: 16px !important;
            color: #8491a5 !important;
            transition: transform 0.15s ease !important;
            flex-shrink: 0 !important;
        }
        .zh-chat-cat-chevron.is-expanded {
            transform: rotate(90deg) !important;
        }
        .zh-chat-cat-user-row {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 11px var(--zh-chat-pad-right, 20px) 11px var(--zh-chat-user-pad-left, var(--zh-chat-pad-left, 20px)) !important;
            border-bottom: 1px solid #f0f2f7 !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
            transition: background-color 0.12s ease !important;
        }
        html[data-theme="dark"] .zh-chat-cat-user-row {
            border-bottom-color: #2e3035 !important;
        }
        .zh-chat-cat-user-row:hover {
            background: #f6f6f6 !important;
        }
        html[data-theme="dark"] .zh-chat-cat-user-row:hover {
            background: rgba(255, 255, 255, 0.06) !important;
        }
        .zh-chat-cat-user-avatar {
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            flex-shrink: 0 !important;
            background: #e5e7eb !important;
        }
        .zh-chat-cat-user-name {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            font-size: 14px !important;
            color: #191b1f !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        html[data-theme="dark"] .zh-chat-cat-user-name {
            color: #e5e7eb !important;
        }
        .zh-chat-cat-user-del {
            opacity: 0 !important;
            border: none !important;
            background: transparent !important;
            color: #8491a5 !important;
            cursor: pointer !important;
            font-size: 14px !important;
            padding: 2px 5px !important;
        }
        .zh-chat-cat-user-row:hover .zh-chat-cat-user-del {
            opacity: 1 !important;
        }
        .zh-chat-cat-user-del:hover {
            color: #f1403c !important;
        }
        .ChatUserListItem {
            position: relative !important;
        }
        .zh-chat-action-copy-item {
            white-space: nowrap !important;
        }
        .ChatUserListItem .zh-chat-more-cat-btn {
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        .ChatUserListItem:hover .zh-chat-more-cat-btn {
            opacity: 1;
        }
        #zh-chat-cat-picker {
            position: fixed !important;
            z-index: 10020 !important;
            min-width: 150px !important;
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
            padding: 4px 0 !important;
            font-size: 13px !important;
        }
        html[data-theme="dark"] #zh-chat-cat-picker {
            background: #25272d !important;
            border-color: #3a3d46 !important;
            color: #e5e7eb !important;
        }
        .zh-chat-cat-picker-item {
            padding: 7px 14px !important;
            cursor: pointer !important;
            white-space: nowrap !important;
        }
        .zh-chat-cat-picker-item:hover {
            background: rgba(23, 114, 246, 0.08) !important;
            color: #1772f6 !important;
        }

        /* 右侧栏完全隐藏（含所有子元素）但保留空白不缩进，右下角颜文字矩形面板例外显示 */
        .GlobalSideBar,
        .GlobalSideBar *,
        [data-zh-hide-keep-space="true"],
        [data-zh-hide-keep-space="true"] * {
            visibility: hidden !important;
            pointer-events: none !important;
        }
        /* 屏蔽右下角 Hi 刘看山浮动按钮 */
        [data-zh-hide-kanshan="true"] {
            display: none !important;
        }

        /* ---------- 1.7 问题页按钮与浏览量标签改造 ---------- */
        .zh-view-count-tag {
            display: inline-flex !important;
            align-items: center !important;
            height: 30px !important;
            padding: 0 12px !important;
            margin-right: 6px !important;
            border-radius: 100px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            color: #373a40 !important;
            background-color: #e1e4ea !important;
            line-height: 30px !important;
            white-space: nowrap !important;
        }
        html[data-theme="dark"] .zh-view-count-tag {
            color: #e2e4e9 !important;
            background-color: #32353b !important;
        }
        .zh-q-action-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 5px !important;
            height: 34px !important;
            padding: 0 16px !important;
            font-size: 14px !important;
            font-weight: 400 !important;
            color: #373a40 !important;
            background: transparent !important;
            border: 1px solid #8491a5 !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease !important;
            white-space: nowrap !important;
        }
        .zh-q-action-btn:hover {
            color: #191b1f !important;
            background-color: rgba(132, 145, 165, 0.08) !important;
            border-color: #647084 !important;
        }
        html[data-theme="dark"] .zh-q-action-btn {
            color: #d3d6dc !important;
            border-color: #6b7280 !important;
        }
        html[data-theme="dark"] .zh-q-action-btn:hover {
            color: #ffffff !important;
            background-color: rgba(255, 255, 255, 0.08) !important;
        }
        [data-zh-hide-invite="true"],
        [data-zh-hide-q-meta="true"],
        .QuestionPage .QuestionButtonGroup ~ div > *:not(.zh-keep-collapse),
        [data-za-detail-view-path-module="QuestionDescription"] .QuestionButtonGroup ~ div > *:not(.zh-keep-collapse),
        .QuestionHeader .QuestionButtonGroup ~ div > *:not(.zh-keep-collapse),
        .QuestionHeader-actions > *:not(.zh-keep-collapse) {
            display: none !important;
        }

        /* ---------- 1.8 菜单开关实时控制类 ---------- */
        body.zh-off-block .zh-block-user-btn {
            display: none !important;
        }
        body.zh-off-follow .zh-follow-user-btn {
            display: none !important;
        }
        body.zh-off-time .zh-answer-time-meta {
            display: none !important;
        }
        body.zh-off-view-tag .zh-view-count-tag {
            display: none !important;
        }
        body.zh-disable-entity-ai a.RichContent-EntityWord,
        body.zh-disable-entity-ai a[href*="zhida.zhihu.com/search"][href*="zhida_source=entity"] {
            color: inherit !important;
            text-decoration: none !important;
            border-bottom: none !important;
            background: transparent !important;
            font-weight: inherit !important;
            cursor: text !important;
            pointer-events: none !important;
        }
        body.zh-disable-entity-ai a.RichContent-EntityWord svg,
        body.zh-disable-entity-ai a[href*="zhida.zhihu.com/search"][href*="zhida_source=entity"] svg {
            display: none !important;
        }
        body.zh-blue-view-tag .zh-view-count-tag {
            color: #ffffff !important;
            background-color: #056de8 !important;
        }

        /* ---------- 1.9 偏好设置页内嵌脚本设置样式（与知乎原生偏好设置完全一致） ---------- */
        #zh-preference-settings-section {
            margin-top: 0;
        }
        .zh-pref-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 20px;
            border-bottom: 1px solid #ebeced;
            gap: 16px;
        }
        html[data-theme="dark"] .zh-pref-row {
            border-bottom-color: #2e3035;
        }
        .zh-pref-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .zh-pref-title {
            font-size: 15px;
            font-weight: 600;
            color: #191b1f;
            line-height: 1.4;
        }
        html[data-theme="dark"] .zh-pref-title {
            color: #e2e4e9;
        }
        .zh-pref-desc {
            font-size: 13.5px;
            color: #8491a5;
            line-height: 1.45;
        }
        /* 知乎同款蓝白开关 */
        .zh-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
            cursor: pointer;
        }
        .zh-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .zh-switch-slider {
            position: absolute;
            inset: 0;
            background-color: #d3d6dc;
            border-radius: 24px;
            transition: background-color 0.2s ease;
        }
        .zh-switch-slider::before {
            content: "";
            position: absolute;
            width: 18px;
            height: 18px;
            left: 3px;
            top: 3px;
            background-color: #ffffff;
            border-radius: 50%;
            transition: transform 0.2s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .zh-switch input:checked + .zh-switch-slider {
            background-color: #056de8;
        }
        .zh-switch input:checked + .zh-switch-slider::before {
            transform: translateX(20px);
        }
        .zh-pref-sidebar-box {
            padding: 18px 20px;
            border-bottom: 1px solid #ebeced;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        html[data-theme="dark"] .zh-pref-sidebar-box {
            border-bottom-color: #2e3035;
        }
        .zh-sidebar-sort-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            border: 1px solid #ebeced;
            border-radius: 8px;
            padding: 8px 10px;
            background: #fafbfc;
        }
        html[data-theme="dark"] .zh-sidebar-sort-list {
            border-color: #2e3035;
            background: #18191c;
        }
        .zh-sidebar-sort-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid #ebeced;
            background: #ffffff;
            font-size: 14px;
            cursor: grab;
            transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
        }
        .zh-sidebar-sort-item:hover {
            border-color: #d3d6dc;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        .zh-sidebar-sort-item:active {
            cursor: grabbing;
        }
        .zh-sidebar-sort-item.is-hidden-item {
            opacity: 0.58;
            background: #f5f6f8;
        }
        .zh-sidebar-sort-item.is-dragging {
            opacity: 0.35;
            transform: scale(0.98);
        }
        .zh-sidebar-sort-item.drag-over-top {
            box-shadow: 0 -2px 0 0 #056de8;
            border-top-color: #056de8;
        }
        .zh-sidebar-sort-item.drag-over-bottom {
            box-shadow: 0 2px 0 0 #056de8;
            border-bottom-color: #056de8;
        }
        html[data-theme="dark"] .zh-sidebar-sort-item {
            background: #222428;
            border-color: #2e3035;
        }
        html[data-theme="dark"] .zh-sidebar-sort-item.is-hidden-item {
            background: #1a1b1e;
        }
        .zh-drag-handle {
            color: #9aa5b5;
            font-size: 15px;
            margin-right: 6px;
            letter-spacing: -1px;
            user-select: none;
        }
        .zh-sidebar-sort-left {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }
        .zh-sidebar-sort-btns {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .zh-sort-btn {
            padding: 2px 8px;
            font-size: 12px;
            border: 1px solid #d3d6dc;
            background: #ffffff;
            color: #373a40;
            border-radius: 4px;
            cursor: pointer;
        }
        .zh-sort-btn:hover {
            border-color: #056de8;
            color: #056de8;
        }
        html[data-theme="dark"] .zh-sort-btn {
            background: #27292e;
            border-color: #3c3f45;
            color: #d3d6dc;
        }
        /* 资料区行间距缩小、更紧凑 */
        .ProfileHeader-contentHead {
            margin-bottom: 6px !important;
        }
        .ProfileHeader-detail,
        .ProfileHeader-info,
        [data-zh-profile-detail="true"] {
            margin-top: 4px !important;
            margin-bottom: 4px !important;
            line-height: 1.45 !important;
        }
        .ProfileHeader-detailItem,
        .ProfileHeader-infoItem {
            margin-bottom: 6px !important;
            line-height: 1.45 !important;
        }
        /* 红框2 & 3：关注和发私信按钮放在用户 ID 右侧 */
        [data-zh-profile-title="true"] {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 10px 14px !important;
        }
        [data-zh-moved-buttons="true"] {
            position: static !important;
            right: auto !important;
            bottom: auto !important;
            top: auto !important;
            left: auto !important;
            margin: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 10px !important;
            vertical-align: middle !important;
        }
        /* 红框4：隐藏“查看/收起详细资料”按钮及多余底部留白 */
        [data-zh-hide-expand-btn="true"] {
            display: none !important;
        }
        .ProfileHeader-contentFooter[data-zh-profile-footer="true"] {
            display: none !important;
        }

        /* ---------- 1.6 轻量 Toast 提示 ---------- */
        #zh-enhancer-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(-12px);
            z-index: 999999;
            padding: 10px 18px;
            border-radius: 6px;
            background: #191b1f;
            color: #ffffff;
            font-size: 14px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        #zh-enhancer-toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    `;

    function injectStyles() {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(CSS_TEXT);
        } else {
            const style = document.createElement('style');
            style.textContent = CSS_TEXT;
            (document.head || document.documentElement).appendChild(style);
        }
    }
    injectStyles();

    // =========================================================================
    // 2. 工具函数
    // =========================================================================
    function showToast(msg) {
        let toast = document.getElementById('zh-enhancer-toast');
        if (!toast && document.body) {
            toast = document.createElement('div');
            toast.id = 'zh-enhancer-toast';
            document.body.appendChild(toast);
        }
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function formatTimestamp(ts) {
        if (!ts) return '';
        let date;
        if (typeof ts === 'number') {
            date = new Date(ts < 1e12 ? ts * 1000 : ts);
        } else if (typeof ts === 'string') {
            const direct = ts.match(/\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/);
            if (/^\d+$/.test(ts.trim())) {
                const n = Number(ts.trim());
                date = new Date(n < 1e12 ? n * 1000 : n);
            } else {
                const parsed = Date.parse(ts);
                if (!Number.isNaN(parsed)) {
                    date = new Date(parsed);
                } else if (direct) {
                    return direct[0];
                }
            }
        }
        if (!date || Number.isNaN(date.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    // =========================================================================
    // 3. 拦截网络请求与 initialData，收集回答的创建与修改时间
    // =========================================================================
    function stripHtmlToText(html) {
        if (!html || typeof html !== 'string') return '';
        return html
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<\/p>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function saveItemMeta(type, id, item) {
        if (!id || !item || typeof item !== 'object') return;
        const created = item.created_time || item.createdTime || item.created;
        const updated = item.updated_time || item.updatedTime || item.updated || created;
        if (created || updated) {
            const meta = { created, updated, type };
            answerTimeCache.set(String(id), meta);
            if (type) answerTimeCache.set(`${type}:${id}`, meta);
        }
        const rawContent = item.content || item.content_html || item.excerpt_new || '';
        const plain = stripHtmlToText(rawContent);
        if (plain && plain.length > 60) {
            contentPreviewCache.set(String(id), plain);
            if (type) contentPreviewCache.set(`${type}:${id}`, plain);
        }
    }

    function collectAnswersFromObject(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 7) return;
        if (Array.isArray(obj)) {
            for (const item of obj) collectAnswersFromObject(item, depth + 1);
            return;
        }
        if ((obj.type === 'answer' || obj.type === 'article' || obj.type === 'pin' || obj.question) && obj.id) {
            const type = obj.type || (obj.question ? 'answer' : '');
            saveItemMeta(type, obj.id, obj);
        }
        for (const key of Object.keys(obj)) {
            if ((key === 'answers' || key === 'articles' || key === 'pins') && obj[key] && typeof obj[key] === 'object') {
                const type = key.slice(0, -1); // answer | article | pin
                for (const itemId of Object.keys(obj[key])) {
                    const item = obj[key][itemId];
                    if (item && typeof item === 'object') {
                        saveItemMeta(type, item.id || itemId, item);
                    }
                }
            } else if (key === 'data' || key === 'target' || key === 'entities' || key === 'initialState') {
                collectAnswersFromObject(obj[key], depth + 1);
            }
        }
    }

    let cachedMyHomeUrl = '';

    function parseInitialData() {
        const el = document.getElementById('js-initialData');
        if (!el || !el.textContent) return;
        try {
            const data = JSON.parse(el.textContent);
            collectAnswersFromObject(data);
            const uid = data && data.initialState && data.initialState.currentUser;
            const userObj = uid && data.initialState.entities && data.initialState.entities.users && data.initialState.entities.users[uid];
            const token = (userObj && userObj.urlToken) || uid;
            if (token && typeof token === 'string') {
                cachedMyHomeUrl = `https://www.zhihu.com/people/${token}`;
            }
        } catch { /* ignore */ }
    }

    function hookNetwork() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (win.__zhEnhancerFetchHooked) return;
        win.__zhEnhancerFetchHooked = true;

        const origFetch = win.fetch;
        if (typeof origFetch === 'function') {
            win.fetch = async function (...args) {
                const res = await origFetch.apply(this, args);
                try {
                    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                    if (url.includes('/api/v3/') || url.includes('/api/v4/')) {
                        res.clone().json().then((json) => {
                            collectAnswersFromObject(json);
                            scheduleEnhance();
                        }).catch(() => {});
                    }
                } catch { /* ignore */ }
                return res;
            };
        }

        const origOpen = win.XMLHttpRequest && win.XMLHttpRequest.prototype.open;
        const origSend = win.XMLHttpRequest && win.XMLHttpRequest.prototype.send;
        if (origOpen && origSend) {
            win.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this.__zhUrl = typeof url === 'string' ? url : '';
                return origOpen.call(this, method, url, ...rest);
            };
            win.XMLHttpRequest.prototype.send = function (...args) {
                this.addEventListener('load', () => {
                    try {
                        if (this.__zhUrl && (this.__zhUrl.includes('/api/v3/') || this.__zhUrl.includes('/api/v4/')) && this.responseText) {
                            const json = JSON.parse(this.responseText);
                            collectAnswersFromObject(json);
                            scheduleEnhance();
                        }
                    } catch { /* ignore */ }
                });
                return origSend.apply(this, args);
            };
        }
    }
    hookNetwork();

    // =========================================================================
    // 4. 识别并标记新版左侧功能栏及其外框/列容器
    // =========================================================================
    const SIDEBAR_HIDE_KEYWORDS = ['直答', 'AI Works', '盐言故事', '付费咨询', '知学堂'];
    const SIDEBAR_CREATE_ACTIONS = [
        {
            label: '提问题',
            url: 'https://www.zhihu.com/?ask=1',
            svg: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.1-2.4 3.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>'
        },
        {
            label: '写回答',
            url: 'https://www.zhihu.com/creator/featured-question/recommend',
            svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/>'
        },
        {
            label: '发想法',
            url: 'https://www.zhihu.com/pin',
            svg: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.65c.65.54 1.05 1.33 1.15 2.17L9.5 17h5l.15-1.18c.1-.84.5-1.63 1.15-2.17A6 6 0 0 0 12 3Z"/>'
        },
        {
            label: '写文章',
            url: 'https://zhuanlan.zhihu.com/write',
            svg: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="M8.5 16h4.5"/>'
        }
    ];

    const SIDEBAR_PROFILE_ACTIONS = [
        {
            id: 'my-home',
            label: '我的主页',
            menuText: '我的主页',
            fallbackUrl: 'https://www.zhihu.com/people/',
            svg: '<circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/>'
        },
        {
            id: 'my-history',
            label: '最近浏览',
            menuText: '最近浏览',
            fallbackUrl: 'https://www.zhihu.com/history',
            svg: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
        },
        {
            id: 'my-messages',
            label: '私信',
            menuText: '私信',
            fallbackUrl: 'https://www.zhihu.com/messages',
            svg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>'
        },
        {
            id: 'creator-center',
            label: '创作中心',
            menuText: '创作中心',
            fallbackUrl: 'https://www.zhihu.com/creator',
            svg: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8 10h8"/><path d="M8 14h5"/>'
        },
        {
            id: 'my-theme',
            label: '显示模式',
            menuText: '显示模式',
            fallbackUrl: '',
            svg: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'
        },
        {
            id: 'my-settings',
            label: '设置',
            menuText: '设置',
            fallbackUrl: 'https://www.zhihu.com/settings/account',
            svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.79 1.02 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>'
        }
    ];

    function openUrlInBackgroundTab(url) {
        if (!url) return;
        if (typeof GM_openInTab === 'function') {
            GM_openInTab(url, { active: false, insert: true });
        } else {
            window.open(url, '_blank', 'noopener');
        }
    }

    function resolveProfileActionUrl(act, callback) {
        if (act.id === 'my-history') {
            callback(act.fallbackUrl || 'https://www.zhihu.com/history');
            return;
        }
        if (act.id === 'my-home') {
            if (cachedMyHomeUrl) {
                callback(cachedMyHomeUrl);
                return;
            }
            const headerLink = document.querySelector('.AppHeader-profile a[href*="/people/"]');
            if (headerLink && headerLink.href) {
                cachedMyHomeUrl = headerLink.href;
                callback(cachedMyHomeUrl);
                return;
            }
            const avatarBtn = document.querySelector('.AppHeader-profileAvatar, .AppHeader-userInfo button, .AppHeader-profile button');
            if (avatarBtn) {
                document.body.classList.add('zh-silent-popover');
                avatarBtn.click();
                setTimeout(() => {
                    const items = document.querySelectorAll('.Popover-content a, .Menu a');
                    const target = Array.from(items).find((n) => n.textContent.trim() === act.menuText);
                    const href = target && target.href ? target.href : '';
                    avatarBtn.click();
                    setTimeout(() => document.body.classList.remove('zh-silent-popover'), 60);
                    if (href) {
                        cachedMyHomeUrl = href;
                        callback(href);
                    }
                }, 40);
                return;
            }
        }
        if (act.fallbackUrl) callback(act.fallbackUrl);
    }

    // =========================================================================
    // 3.5 独立私信弹窗（内嵌 /messages?zh_embed=1）+ 自定义对话分类与排序
    // =========================================================================
    const autoReadThreadSet = new Set();
    let cachedMsgInitialEntities = null;
    let lastDmCheckTime = 0;

    function isMutedByCategory(user) {
        if (!user) return false;
        const cats = Array.isArray(settings.chatCategories) ? settings.chatCategories : [];
        const token = user.url_token || user.urlToken || '';
        const id = user.id ? String(user.id) : '';
        const name = (user.name || '').trim();
        for (const cat of cats) {
            if (cat.acceptMessages !== false) continue;
            const users = Array.isArray(cat.users) ? cat.users : [];
            if (users.some((u) => (id && u.id === id) || (token && u.urlToken === token) || (name && u.name === name))) {
                return true;
            }
        }
        return false;
    }

    async function markThreadAsRead(threadId) {
        if (!threadId || autoReadThreadSet.has(String(threadId))) return false;
        autoReadThreadSet.add(String(threadId));
        try {
            const xsrf = getCookie('_xsrf');
            const headers = { 'content-type': 'application/json' };
            if (xsrf) headers['x-xsrftoken'] = xsrf;
            const res = await fetch(`https://www.zhihu.com/api/v4/inbox/threads/${encodeURIComponent(threadId)}/read`, {
                method: 'POST',
                credentials: 'include',
                headers
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    async function checkAndAutoReadMutedCategoryDms(force = false) {
        const cats = Array.isArray(settings.chatCategories) ? settings.chatCategories : [];
        const hasMutedCat = cats.some((c) => c.acceptMessages === false && Array.isArray(c.users) && c.users.length > 0);
        if (!hasMutedCat) return;
        const now = Date.now();
        if (!force && now - lastDmCheckTime < 15000) return;
        lastDmCheckTime = now;
        try {
            const res = await fetch('https://www.zhihu.com/api/v4/inbox/threads?limit=20&offset=0', {
                credentials: 'include'
            });
            if (!res.ok) return;
            const json = await res.json();
            const threads = Array.isArray(json?.data) ? json.data : [];
            let activeUnread = 0;
            let markedAny = false;
            for (const th of threads) {
                const unread = Number(th.unread_count || 0);
                const part = th.participant || {};
                if (isMutedByCategory(part)) {
                    if (unread > 0 && th.id) {
                        const ok = await markThreadAsRead(th.id);
                        if (ok) markedAny = true;
                    }
                } else if (unread > 0) {
                    activeUnread += unread;
                }
            }
            const msgBtns = document.querySelectorAll('button[aria-label="私信"], [data-zh-sidebar-id="messages"]');
            msgBtns.forEach((btn) => {
                btn.classList.toggle('zh-hide-dm-badge', activeUnread === 0 && markedAny);
            });
        } catch { /* ignore */ }
    }

    function getMessagesInitialEntities() {
        if (cachedMsgInitialEntities) return cachedMsgInitialEntities;
        const script = document.getElementById('js-initialData');
        if (!script || !script.textContent) return null;
        try {
            const parsed = JSON.parse(script.textContent);
            const entities = parsed?.initialState?.entities || {};
            cachedMsgInitialEntities = {
                users: entities.users || {},
                chats: entities.chats || {}
            };
            return cachedMsgInitialEntities;
        } catch {
            return null;
        }
    }

    function findChatEntityByName(name) {
        const entities = getMessagesInitialEntities();
        if (!entities || !name) return null;
        const target = name.trim();
        for (const chatId of Object.keys(entities.chats)) {
            const chat = entities.chats[chatId];
            const partId = chat?.participant;
            const user = partId ? entities.users[partId] : null;
            if (user && (user.name || '').trim() === target) {
                return { chatId, chat, user };
            }
        }
        for (const uid of Object.keys(entities.users)) {
            const user = entities.users[uid];
            if (user && (user.name || '').trim() === target) {
                return { chatId: null, chat: null, user };
            }
        }
        return null;
    }

    function closeChatCatPicker() {
        const old = document.getElementById('zh-chat-cat-picker');
        if (old) old.remove();
    }

    function addUserToCategory(catId, userInfo) {
        if (!Array.isArray(settings.chatCategories)) settings.chatCategories = [];
        if (!Array.isArray(settings.chatGroupOrder)) settings.chatGroupOrder = ['__recent__', '__friends__'];
        const cat = settings.chatCategories.find((c) => c.id === catId);
        if (!cat) return;
        if (typeof cat.acceptMessages === 'undefined') cat.acceptMessages = true;
        if (!settings.chatGroupOrder.includes(cat.id)) {
            settings.chatGroupOrder.unshift(cat.id);
        }
        if (!Array.isArray(cat.users)) cat.users = [];
        const exists = cat.users.some((u) =>
            (userInfo.id && u.id === userInfo.id) ||
            (userInfo.urlToken && u.urlToken === userInfo.urlToken) ||
            (u.name === userInfo.name)
        );
        if (!exists) {
            const entry = {
                id: userInfo.id || '',
                urlToken: userInfo.urlToken || '',
                name: userInfo.name,
                avatar: userInfo.avatar || ''
            };
            cat.users.push(entry);
            saveSettings(settings);
            renderCustomChatCategories(true);
            showToast(`已将 ${userInfo.name} 复制到「${cat.name}」`);
            if (!entry.id) {
                fetch('https://www.zhihu.com/api/v4/inbox/threads?limit=30&offset=0', { credentials: 'include' })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((json) => {
                        const th = (json?.data || []).find((t) => (t?.participant?.name || '').trim() === entry.name);
                        if (th?.participant) {
                            if (th.participant.id) entry.id = String(th.participant.id);
                            if (th.participant.url_token) entry.urlToken = th.participant.url_token;
                            saveSettings(settings);
                        }
                    })
                    .catch(() => { /* ignore */ });
            }
        } else {
            showToast(`${userInfo.name} 已在「${cat.name}」中`);
        }
    }

    function showZhDialog({ title, message = '', placeholder = '', defaultValue = '', confirmText = '确定', isConfirmOnly = false, onConfirm }) {
        const old = document.getElementById('zh-inpage-dialog');
        if (old) old.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'zh-inpage-dialog';
        backdrop.className = 'zh-dialog-backdrop';

        const card = document.createElement('div');
        card.className = 'zh-dialog-card';
        card.innerHTML = `
            <div class="zh-dialog-title"></div>
            ${message ? '<div class="zh-dialog-msg"></div>' : ''}
            ${isConfirmOnly ? '' : '<input type="text" class="zh-dialog-input">'}
            <div class="zh-dialog-actions">
                <button type="button" class="zh-dialog-btn zh-dialog-btn-cancel">取消</button>
                <button type="button" class="zh-dialog-btn zh-dialog-btn-primary"></button>
            </div>
        `;
        card.querySelector('.zh-dialog-title').textContent = title;
        if (message) card.querySelector('.zh-dialog-msg').textContent = message;
        const primaryBtn = card.querySelector('.zh-dialog-btn-primary');
        primaryBtn.textContent = confirmText;

        const input = card.querySelector('.zh-dialog-input');
        if (input) {
            input.placeholder = placeholder;
            input.value = defaultValue;
        }

        const close = () => backdrop.remove();
        const submit = () => {
            if (isConfirmOnly) {
                close();
                if (onConfirm) onConfirm(true);
                return;
            }
            const val = (input?.value || '').trim();
            if (!val) {
                if (input) input.focus();
                return;
            }
            close();
            if (onConfirm) onConfirm(val);
        };

        card.querySelector('.zh-dialog-btn-cancel').addEventListener('click', close);
        primaryBtn.addEventListener('click', submit);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
        }

        backdrop.appendChild(card);
        document.body.appendChild(backdrop);
        if (input) {
            input.focus();
            input.select();
        }
    }

    function openChatCatPicker(anchorBtn, userInfo, onPicked) {
        closeChatCatPicker();
        const picker = document.createElement('div');
        picker.id = 'zh-chat-cat-picker';

        const cats = Array.isArray(settings.chatCategories) ? settings.chatCategories : [];
        for (const cat of cats) {
            const item = document.createElement('div');
            item.className = 'zh-chat-cat-picker-item';
            item.textContent = cat.name;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                addUserToCategory(cat.id, userInfo);
                closeChatCatPicker();
                if (typeof onPicked === 'function') onPicked();
            });
            picker.appendChild(item);
        }

        const newItem = document.createElement('div');
        newItem.className = 'zh-chat-cat-picker-item';
        newItem.style.color = '#1772f6';
        newItem.textContent = '+ 新建分类并加入';
        newItem.addEventListener('click', (e) => {
            e.stopPropagation();
            closeChatCatPicker();
            if (typeof onPicked === 'function') onPicked();
            showZhDialog({
                title: '新建分类并加入',
                placeholder: '请输入分类名称',
                confirmText: '创建并加入',
                onConfirm: (catName) => {
                    if (!Array.isArray(settings.chatCategories)) settings.chatCategories = [];
                    if (!Array.isArray(settings.chatGroupOrder)) settings.chatGroupOrder = ['__recent__', '__friends__'];
                    const newCat = { id: 'cat_' + Date.now(), name: catName, collapsed: false, acceptMessages: true, users: [] };
                    settings.chatCategories.push(newCat);
                    settings.chatGroupOrder.unshift(newCat.id);
                    addUserToCategory(newCat.id, userInfo);
                }
            });
        });
        picker.appendChild(newItem);

        document.body.appendChild(picker);
        const rect = anchorBtn.getBoundingClientRect();
        const pw = picker.offsetWidth || 160;
        const ph = picker.offsetHeight || 120;
        let left = rect.right + 4;
        if (left + pw + 8 > window.innerWidth) {
            left = Math.max(8, rect.left - pw - 4);
        }
        const top = Math.max(8, Math.min(rect.top, window.innerHeight - ph - 8));
        picker.style.left = `${Math.round(left)}px`;
        picker.style.top = `${Math.round(top)}px`;

        setTimeout(() => {
            document.addEventListener('click', closeChatCatPicker, { once: true });
        }, 0);
        return picker;
    }

    function findSidebarChatUserItem(name) {
        const items = Array.from(document.querySelectorAll('.ChatUserListItem'));
        return items.find((item) => {
            const nameEl = item.querySelector('.userName-nameArea, [class*="nameArea"]');
            const itemName = (nameEl?.textContent || '').trim();
            return itemName && itemName === name;
        }) || null;
    }

    function openChatForCategoryUser(user) {
        if (!user) return;
        const triggerMatchedClick = (item) => {
            if (!item) return;
            const sec = item.closest('.ChatListGroup-Section');
            const content = sec?.querySelector('.ChatListGroup-SectionContent');
            if (sec && content && (content.style.height === '0px' || item.getBoundingClientRect().height === 0)) {
                const title = sec.querySelector('.ChatListGroup-SectionTitle');
                if (title) title.click();
                setTimeout(() => {
                    item.click();
                    item.scrollIntoView({ block: 'nearest' });
                }, 120);
                return;
            }
            item.click();
            item.scrollIntoView({ block: 'nearest' });
        };

        const matched = findSidebarChatUserItem(user.name);
        if (matched) {
            triggerMatchedClick(matched);
            return;
        }

        // 若不在当前已渲染列表中，利用原生搜索框搜索联系人并点击
        const searchInput = document.querySelector('.ChatSideBar-Search-Input input[type="search"], .ChatSideBar input[type="search"]');
        if (searchInput) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(searchInput, user.name);
            else searchInput.value = user.name;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            let tries = 0;
            const poll = () => {
                tries += 1;
                const found = findSidebarChatUserItem(user.name);
                if (found) {
                    found.click();
                    return;
                }
                if (tries < 12) setTimeout(poll, 100);
                else showToast(`未找到 ${user.name} 的对话`);
            };
            setTimeout(poll, 150);
            return;
        }
        showToast(`未找到 ${user.name} 的对话，可使用上方搜索联系人`);
    }

    let activeChatGroupId = settings.defaultChatGroup || '__recent__';
    let narrowChatStep = 'cats';
    let mediumLeftPane = 'users';

    function getChatGroupLabel(gid) {
        if (gid === '__recent__') return '最近联系';
        if (gid === '__friends__') return '互相关注';
        const cat = (settings.chatCategories || []).find((c) => c.id === gid);
        return cat ? cat.name : '私信';
    }

    function updateChatNarrowState() {
        const w = window.innerWidth;
        const isNarrow = w < 640;
        const isMedium = !isNarrow && w < 880;
        document.documentElement.classList.toggle('zh-chat-narrow', isNarrow);
        document.documentElement.classList.toggle('zh-chat-medium', isMedium);
        if (isNarrow) {
            document.documentElement.setAttribute('data-zh-narrow-step', narrowChatStep);
            document.documentElement.removeAttribute('data-zh-medium-left');
        } else if (isMedium) {
            document.documentElement.setAttribute('data-zh-medium-left', mediumLeftPane);
            document.documentElement.removeAttribute('data-zh-narrow-step');
        } else {
            document.documentElement.removeAttribute('data-zh-narrow-step');
            document.documentElement.removeAttribute('data-zh-medium-left');
        }
        const userBackTitle = document.querySelector('.zh-chat-narrow-backbar[data-step="users"] .zh-chat-narrow-title');
        if (userBackTitle) userBackTitle.textContent = getChatGroupLabel(activeChatGroupId);
        const chatBackTitle = document.querySelector('.zh-chat-narrow-backbar[data-step="chat"] .zh-chat-narrow-title');
        if (chatBackTitle) {
            const peer = (document.querySelector('.Chat-ChatBox header')?.textContent || '').trim();
            chatBackTitle.textContent = peer || '对话';
        }
    }

    let chatSearchTimer = null;
    let chatSearchSeq = 0;

    function runChatContactSearch(rawQuery) {
        const sidebar = document.querySelector('.ChatSideBar');
        const listGroup = document.querySelector('.ChatSideBar .ChatListGroup');
        if (!sidebar || !listGroup) return;

        const q = String(rawQuery || '').trim();
        const hasVal = q.length > 0;
        sidebar.classList.toggle('zh-searching', hasVal);
        clearTimeout(chatSearchTimer);
        const seq = ++chatSearchSeq;

        if (!hasVal) {
            const box = document.getElementById('zh-chat-search-results');
            if (box) box.innerHTML = '';
            applyActiveChatGroupView();
            return;
        }

        if (window.innerWidth < 640 && narrowChatStep === 'cats') {
            narrowChatStep = 'users';
            updateChatNarrowState();
        } else if (window.innerWidth >= 640 && window.innerWidth < 880 && mediumLeftPane === 'cats') {
            mediumLeftPane = 'users';
            updateChatNarrowState();
        }

        let box = document.getElementById('zh-chat-search-results');
        if (!box) {
            box = document.createElement('div');
            box.id = 'zh-chat-search-results';
            listGroup.insertBefore(box, listGroup.firstChild);
        }

        const qLower = q.toLowerCase();
        const localMatches = [];
        const seenNames = new Set();
        document.querySelectorAll('.ChatListGroup-Section .ChatUserListItem').forEach((item) => {
            const name = (item.querySelector('.userName-nameArea, .userName')?.textContent || '').trim();
            if (!name || seenNames.has(name)) return;
            const snippet = (item.querySelector('.ChatUserListItem-Snippet')?.textContent || '').trim();
            if (name.toLowerCase().includes(qLower) || snippet.toLowerCase().includes(qLower)) {
                seenNames.add(name);
                const img = item.querySelector('img');
                localMatches.push({
                    name,
                    sub: snippet,
                    avatar: img ? img.src : '',
                    el: item
                });
            }
        });

        const renderResults = (remoteUsers, isLoading) => {
            if (seq !== chatSearchSeq) return;
            box.innerHTML = '';

            if (localMatches.length > 0) {
                const title = document.createElement('div');
                title.className = 'zh-chat-search-group-title';
                title.textContent = '已有对话';
                box.appendChild(title);
                for (const m of localMatches) {
                    const row = document.createElement('div');
                    row.className = 'zh-chat-search-item';
                    const img = document.createElement('img');
                    img.className = 'zh-chat-search-avatar';
                    if (m.avatar) img.src = m.avatar;
                    const meta = document.createElement('div');
                    meta.className = 'zh-chat-search-meta';
                    const nEl = document.createElement('div');
                    nEl.className = 'zh-chat-search-name';
                    nEl.textContent = m.name;
                    const sEl = document.createElement('div');
                    sEl.className = 'zh-chat-search-sub';
                    sEl.textContent = m.sub;
                    meta.appendChild(nEl);
                    if (m.sub) meta.appendChild(sEl);
                    row.appendChild(img);
                    row.appendChild(meta);
                    row.addEventListener('click', () => {
                        m.el.click();
                        if (window.innerWidth < 640) {
                            narrowChatStep = 'chat';
                            setTimeout(updateChatNarrowState, 60);
                        }
                    });
                    box.appendChild(row);
                }
            }

            if (remoteUsers.length > 0) {
                const title = document.createElement('div');
                title.className = 'zh-chat-search-group-title';
                title.textContent = '知乎用户';
                box.appendChild(title);
                for (const u of remoteUsers) {
                    const row = document.createElement('div');
                    row.className = 'zh-chat-search-item';
                    const img = document.createElement('img');
                    img.className = 'zh-chat-search-avatar';
                    if (u.avatar) img.src = u.avatar;
                    const meta = document.createElement('div');
                    meta.className = 'zh-chat-search-meta';
                    const nEl = document.createElement('div');
                    nEl.className = 'zh-chat-search-name';
                    nEl.textContent = u.name;
                    const sEl = document.createElement('div');
                    sEl.className = 'zh-chat-search-sub';
                    sEl.textContent = u.headline;
                    meta.appendChild(nEl);
                    if (u.headline) meta.appendChild(sEl);
                    row.appendChild(img);
                    row.appendChild(meta);
                    row.addEventListener('click', () => {
                        const existing = Array.from(document.querySelectorAll('.ChatListGroup-Section .ChatUserListItem')).find(
                            (it) => (it.querySelector('.userName-nameArea, .userName')?.textContent || '').trim() === u.name
                        );
                        if (existing) {
                            existing.click();
                        } else if (u.urlToken || u.id) {
                            location.href = `https://www.zhihu.com/messages/${encodeURIComponent(u.urlToken || u.id)}?zh_embed=1`;
                        }
                        if (window.innerWidth < 640) {
                            narrowChatStep = 'chat';
                            setTimeout(updateChatNarrowState, 60);
                        }
                    });
                    box.appendChild(row);
                }
            }

            if (localMatches.length === 0 && remoteUsers.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'zh-chat-search-empty';
                empty.textContent = isLoading ? '正在搜索知乎用户...' : '未找到匹配联系人';
                box.appendChild(empty);
            }
        };

        renderResults([], true);

        chatSearchTimer = setTimeout(async () => {
            try {
                const resp = await fetch(
                    `https://www.zhihu.com/api/v4/search_v3?t=people&q=${encodeURIComponent(q)}&offset=0&limit=15`,
                    { credentials: 'include' }
                );
                if (!resp.ok || seq !== chatSearchSeq) {
                    if (seq === chatSearchSeq) renderResults([], false);
                    return;
                }
                const json = await resp.json();
                if (seq !== chatSearchSeq) return;
                const remoteUsers = [];
                const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();
                for (const entry of (json?.data || [])) {
                    const obj = entry?.object || entry;
                    if (!obj || !obj.name) continue;
                    const cleanName = stripHtml(obj.name);
                    if (!cleanName || seenNames.has(cleanName)) continue;
                    seenNames.add(cleanName);
                    remoteUsers.push({
                        id: obj.id || '',
                        urlToken: obj.url_token || '',
                        name: cleanName,
                        avatar: obj.avatar_url || '',
                        headline: stripHtml(obj.headline || '')
                    });
                }
                renderResults(remoteUsers, false);
            } catch {
                if (seq === chatSearchSeq) renderResults([], false);
            }
        }, 220);
    }

    function ensureChatThreeColChrome() {
        const wrapperInner = document.querySelector('.ChatWrapper > div');
        const sidebar = document.querySelector('.ChatSideBar');
        if (!wrapperInner || !sidebar) return false;

        if (!document.getElementById('zh-chat-cat-nav')) {
            const nav = document.createElement('div');
            nav.id = 'zh-chat-cat-nav';
            wrapperInner.insertBefore(nav, sidebar);
        }

        if (!sidebar.querySelector('.zh-chat-narrow-backbar[data-step="users"]')) {
            const bar = document.createElement('div');
            bar.className = 'zh-chat-narrow-backbar';
            bar.setAttribute('data-step', 'users');
            bar.innerHTML = '<button type="button" class="zh-chat-narrow-backbtn">← 返回分类</button><span class="zh-chat-narrow-title"></span>';
            bar.querySelector('.zh-chat-narrow-backbtn').addEventListener('click', () => {
                if (window.innerWidth < 640) {
                    narrowChatStep = 'cats';
                } else {
                    mediumLeftPane = 'cats';
                }
                updateChatNarrowState();
            });
            sidebar.insertBefore(bar, sidebar.firstChild);
        }

        if (!wrapperInner.querySelector('.zh-chat-narrow-backbar[data-step="chat"]')) {
            const bar = document.createElement('div');
            bar.className = 'zh-chat-narrow-backbar';
            bar.setAttribute('data-step', 'chat');
            bar.innerHTML = '<button type="button" class="zh-chat-narrow-backbtn">← 返回列表</button><span class="zh-chat-narrow-title"></span>';
            bar.querySelector('.zh-chat-narrow-backbtn').addEventListener('click', () => {
                narrowChatStep = 'users';
                updateChatNarrowState();
            });
            wrapperInner.insertBefore(bar, sidebar.nextSibling);
        }

        if (!window.__zhChatNarrowResizeHook) {
            window.__zhChatNarrowResizeHook = true;
            window.addEventListener('resize', updateChatNarrowState, { passive: true });
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'zh-chat-search') {
                    const q = String(e.data.query || '');
                    runChatContactSearch(q);
                }
            });
            document.addEventListener('click', (e) => {
                if (window.innerWidth < 640 && e.target.closest('.ChatUserListItem, .zh-chat-search-item')) {
                    narrowChatStep = 'chat';
                    setTimeout(updateChatNarrowState, 60);
                }
            }, true);
        }

        const searchInput = sidebar.querySelector('.ChatSideBar-Search-Input input[type="search"], input[type="search"]');
        if (searchInput && !searchInput.dataset.zhBoundSearch) {
            searchInput.dataset.zhBoundSearch = '1';
            searchInput.addEventListener('input', () => {
                runChatContactSearch(searchInput.value);
            });
        }
        return true;
    }

    function applyActiveChatGroupView() {
        const listGroup = document.querySelector('.ChatSideBar .ChatListGroup');
        const sidebar = document.querySelector('.ChatSideBar');
        if (!listGroup || !sidebar) return;
        if (sidebar.classList.contains('zh-searching')) return;

        const validIds = new Set(['__recent__', '__friends__', ...(settings.chatCategories || []).map((c) => c.id)]);
        if (!validIds.has(activeChatGroupId)) {
            activeChatGroupId = validIds.has(settings.defaultChatGroup) ? settings.defaultChatGroup : '__recent__';
        }

        const nativeSections = Array.from(listGroup.querySelectorAll('.ChatListGroup-Section'));
        nativeSections.forEach((sec) => {
            const titleTxt = (sec.querySelector('.ChatListGroup-SectionTitle')?.textContent || '').trim();
            const isRecent = titleTxt.includes('最近联系');
            const isFriends = titleTxt.includes('互相关注');
            const match = (isRecent && activeChatGroupId === '__recent__') || (isFriends && activeChatGroupId === '__friends__');
            sec.classList.toggle('zh-group-hidden', !match);
            if (match) {
                const content = sec.querySelector('.ChatListGroup-SectionContent');
                if (content && content.style.height === '0px') {
                    const titleBtn = sec.querySelector('.ChatListGroup-SectionTitle');
                    if (titleBtn) titleBtn.click();
                }
            }
        });

        const customUsersWrap = document.getElementById('zh-chat-custom-users');
        if (customUsersWrap) {
            const isCustom = activeChatGroupId !== '__recent__' && activeChatGroupId !== '__friends__';
            customUsersWrap.style.display = isCustom ? 'block' : 'none';
        }

        document.querySelectorAll('#zh-chat-cat-nav .zh-chat-nav-item').forEach((el) => {
            el.classList.toggle('is-active', el.getAttribute('data-zh-group-id') === activeChatGroupId);
        });
        updateChatNarrowState();
    }

    function selectChatGroup(groupId, fromUserClick = false) {
        activeChatGroupId = groupId;
        renderCustomChatCategories(true);
        if (fromUserClick) {
            if (window.innerWidth < 560) {
                narrowChatStep = 'users';
                updateChatNarrowState();
            } else if (window.innerWidth < 820) {
                mediumLeftPane = 'users';
                updateChatNarrowState();
            }
        }
    }

    function syncChatSidebarPaddingVars(listGroup) {
        if (!listGroup) return;
        const listRect = listGroup.getBoundingClientRect();
        if (listRect.width <= 0) return;
        const avatarImg = listGroup.querySelector('.ChatUserListItem img.css-8ohw3e, .ChatUserListItem img');
        if (avatarImg) {
            const aRect = avatarImg.getBoundingClientRect();
            if (aRect.width > 0) {
                const userPad = Math.max(12, Math.round(aRect.left - listRect.left));
                listGroup.style.setProperty('--zh-chat-user-pad-left', `${userPad}px`);
                listGroup.style.setProperty('--zh-chat-pad-right', `${userPad}px`);
            }
        }
    }

    function renderCustomChatCategories(force = true) {
        if (!ensureChatThreeColChrome()) return;
        const nav = document.getElementById('zh-chat-cat-nav');
        const listGroup = document.querySelector('.ChatSideBar .ChatListGroup');
        if (!nav || !listGroup) return;

        syncChatSidebarPaddingVars(listGroup);

        let usersWrap = listGroup.querySelector('#zh-chat-custom-users');
        if (!usersWrap) {
            usersWrap = document.createElement('div');
            usersWrap.id = 'zh-chat-custom-users';
            listGroup.insertBefore(usersWrap, listGroup.firstChild);
            force = true;
        }
        if (!force && nav.children.length > 0) {
            applyActiveChatGroupView();
            return;
        }

        const order = Array.isArray(settings.chatGroupOrder) ? [...settings.chatGroupOrder] : ['__recent__', '__friends__'];
        const cats = Array.isArray(settings.chatCategories) ? settings.chatCategories : [];
        const catMap = new Map(cats.map((c) => [c.id, c]));
        for (const baseId of ['__recent__', '__friends__', ...cats.map((c) => c.id)]) {
            if (!order.includes(baseId)) order.push(baseId);
        }

        const nativeArrowSvg = '<svg width="24" height="24" viewBox="0 0 24 24" class="Zi Zi--ArrowRight zh-chat-nav-arrow" fill="currentColor"><path fill-rule="evenodd" d="M10.518 6.224a.875.875 0 0 1 1.212.248l3.335 5.05a.875.875 0 0 1 0 .964l-3.334 5.043a.875.875 0 0 1-1.46-.965l3.015-4.56-3.016-4.568a.875.875 0 0 1 .248-1.212Z" clip-rule="evenodd"></path></svg>';

        nav.innerHTML = '';
        for (const gid of order) {
            const isNative = gid === '__recent__' || gid === '__friends__';
            const cat = isNative ? null : catMap.get(gid);
            if (!isNative && !cat) continue;

            const item = document.createElement('div');
            item.className = 'zh-chat-nav-item' + (gid === activeChatGroupId ? ' is-active' : '');
            item.setAttribute('data-zh-group-id', gid);
            const label = isNative ? (gid === '__recent__' ? '最近联系' : '互相关注') : `${cat.name}${cat.acceptMessages === false ? ' (免打扰)' : ''}`;
            item.innerHTML = `
                <span class="zh-chat-nav-label"></span>
                <span class="zh-chat-nav-right">
                    ${isNative ? '' : '<button type="button" class="zh-chat-cat-op-btn" title="重命名">✎</button><button type="button" class="zh-chat-cat-op-btn" title="删除分类">×</button>'}
                    ${nativeArrowSvg}
                </span>
            `;
            item.querySelector('.zh-chat-nav-label').textContent = label;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.zh-chat-cat-op-btn')) return;
                selectChatGroup(gid, true);
            });
            if (!isNative && cat) {
                const opBtns = item.querySelectorAll('.zh-chat-cat-op-btn');
                opBtns[0].addEventListener('click', (e) => {
                    e.stopPropagation();
                    showZhDialog({
                        title: '重命名分类',
                        placeholder: '请输入分类名称',
                        defaultValue: cat.name,
                        confirmText: '保存',
                        onConfirm: (nextName) => {
                            cat.name = nextName;
                            saveSettings(settings);
                            renderCustomChatCategories(true);
                        }
                    });
                });
                opBtns[1].addEventListener('click', (e) => {
                    e.stopPropagation();
                    showZhDialog({
                        title: '删除分类',
                        message: `确定删除分类「${cat.name}」吗？`,
                        confirmText: '删除',
                        isConfirmOnly: true,
                        onConfirm: () => {
                            settings.chatCategories = settings.chatCategories.filter((c) => c.id !== cat.id);
                            if (Array.isArray(settings.chatGroupOrder)) {
                                settings.chatGroupOrder = settings.chatGroupOrder.filter((id) => id !== cat.id);
                            }
                            if (settings.defaultChatGroup === cat.id) settings.defaultChatGroup = '__recent__';
                            if (activeChatGroupId === cat.id) activeChatGroupId = '__recent__';
                            saveSettings(settings);
                            renderCustomChatCategories(true);
                        }
                    });
                });
            }
            nav.appendChild(item);
        }

        // 渲染当前选中自定义分类的用户列表到中栏 #zh-chat-custom-users
        usersWrap.innerHTML = '';
        const activeCat = catMap.get(activeChatGroupId);
        if (activeCat) {
            const users = Array.isArray(activeCat.users) ? activeCat.users : [];
            if (users.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding: 28px 16px; text-align: center; font-size: 13px; color: #8491a5;';
                empty.textContent = '该分类暂无联系人';
                usersWrap.appendChild(empty);
            } else {
                for (const u of users) {
                    const row = document.createElement('div');
                    row.className = 'zh-chat-cat-user-row';
                    const avatarHtml = u.avatar
                        ? `<img class="zh-chat-cat-user-avatar" src="${u.avatar}" alt="">`
                        : '<div class="zh-chat-cat-user-avatar"></div>';
                    row.innerHTML = `${avatarHtml}<span class="zh-chat-cat-user-name"></span><button type="button" class="zh-chat-cat-user-del" title="从分类移除">×</button>`;
                    row.querySelector('.zh-chat-cat-user-name').textContent = u.name;
                    row.addEventListener('click', (e) => {
                        if (e.target.closest('.zh-chat-cat-user-del')) return;
                        openChatForCategoryUser(u);
                        if (window.innerWidth < 620) {
                            narrowChatStep = 'chat';
                            setTimeout(updateChatNarrowState, 60);
                        }
                    });
                    row.querySelector('.zh-chat-cat-user-del').addEventListener('click', (e) => {
                        e.stopPropagation();
                        activeCat.users = (activeCat.users || []).filter((x) => x.name !== u.name);
                        saveSettings(settings);
                        renderCustomChatCategories(true);
                    });
                    usersWrap.appendChild(row);
                }
            }
        }
        applyActiveChatGroupView();
    }

    function isMessagesEmbedMode() {
        return location.pathname.startsWith('/messages') && (window.self !== window.top || location.search.includes('zh_embed=1'));
    }

    function insertTextIntoChatInput(text) {
        const chatBox = document.querySelector('.Chat-ChatBox');
        if (!chatBox || !text) return;
        const textarea = chatBox.querySelector('textarea');
        if (textarea) {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            const cur = textarea.value || '';
            const nextVal = cur ? `${cur}${text}` : text;
            if (setter) setter.call(textarea, nextVal);
            else textarea.value = nextVal;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();
            return;
        }
        const editable = chatBox.querySelector('[contenteditable="true"]');
        if (editable) {
            editable.focus();
            document.execCommand('insertText', false, text);
            editable.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function closeQuickReplyMenu() {
        const old = document.getElementById('zh-chat-quick-menu');
        if (old) old.remove();
    }

    function openQuickReplyMenu(anchorBtn) {
        closeQuickReplyMenu();
        const menu = document.createElement('div');
        menu.id = 'zh-chat-quick-menu';

        const list = Array.isArray(settings.chatQuickReplies) && settings.chatQuickReplies.length > 0
            ? settings.chatQuickReplies
            : ['人工客服'];

        list.forEach((txt, idx) => {
            const item = document.createElement('div');
            item.className = 'zh-chat-quick-item';
            const label = document.createElement('span');
            label.style.cssText = 'flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            label.textContent = txt;
            item.appendChild(label);

            if (list.length > 1) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'zh-chat-quick-del';
                del.textContent = '×';
                del.title = '删除此条预设';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    settings.chatQuickReplies.splice(idx, 1);
                    saveSettings(settings);
                    openQuickReplyMenu(anchorBtn);
                });
                item.appendChild(del);
            }
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                insertTextIntoChatInput(txt);
                closeQuickReplyMenu();
            });
            menu.appendChild(item);
        });

        const addRow = document.createElement('div');
        addRow.className = 'zh-chat-quick-add';
        addRow.textContent = '+ 添加常用内容';
        addRow.addEventListener('click', (e) => {
            e.stopPropagation();
            closeQuickReplyMenu();
            showZhDialog({
                title: '添加常用回复',
                placeholder: '请输入常用内容（如：人工客服）',
                confirmText: '添加',
                onConfirm: (val) => {
                    if (!Array.isArray(settings.chatQuickReplies)) settings.chatQuickReplies = ['人工客服'];
                    if (!settings.chatQuickReplies.includes(val)) {
                        settings.chatQuickReplies.push(val);
                        saveSettings(settings);
                    }
                    showToast(`已添加常用回复：${val}`);
                }
            });
        });
        menu.appendChild(addRow);

        document.body.appendChild(menu);
        const rect = anchorBtn.getBoundingClientRect();
        const menuW = menu.offsetWidth || 180;
        const menuH = menu.offsetHeight || 100;
        menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8)) + 'px';
        menu.style.top = Math.max(8, rect.top - menuH - 6) + 'px';

        setTimeout(() => {
            document.addEventListener('click', closeQuickReplyMenu, { once: true });
        }, 0);
    }

    function fixEmojiPopoverPosition(emojiBtn) {
        if (!emojiBtn) return;
        const applyPos = () => {
            const pop = Array.from(document.querySelectorAll('.Popover-content')).find((p) => {
                const r = p.getBoundingClientRect();
                return r.width > 180 && r.height > 150 && (p.querySelector('img') || p.querySelector('[class*="emoji"], [class*="Sticker"], [class*="Emoticon"]'));
            });
            if (!pop) return;
            const btnRect = emojiBtn.getBoundingClientRect();
            const popRect = pop.getBoundingClientRect();
            const targetLeft = Math.max(8, Math.min(btnRect.left, window.innerWidth - popRect.width - 8));
            const targetTop = Math.max(8, btnRect.top - popRect.height - 8);
            pop.style.setProperty('position', 'fixed', 'important');
            pop.style.setProperty('left', `${Math.round(targetLeft)}px`, 'important');
            pop.style.setProperty('top', `${Math.round(targetTop)}px`, 'important');
            pop.style.setProperty('right', 'auto', 'important');
            pop.style.setProperty('bottom', 'auto', 'important');
            pop.style.setProperty('transform', 'none', 'important');
        };
        requestAnimationFrame(applyPos);
        setTimeout(applyPos, 40);
        setTimeout(applyPos, 120);
    }

    function enhanceChatInputBox() {
        const chatBox = document.querySelector('.Chat-ChatBox');
        if (!chatBox) return;

        // 1. 精准定位原生 ToolBar、表情按钮(.EmoticonTool)与图片按钮(.UploadPicture-wrapper)
        const toolbar = chatBox.querySelector('ul.ToolBar') || chatBox.querySelector('.InputBox ul');
        const emojiBtn = chatBox.querySelector('.EmoticonTool');
        const imgBtn = chatBox.querySelector('.UploadPicture-wrapper') || chatBox.querySelector('input[type="file"]')?.closest('label, button');

        if (toolbar && !toolbar.classList.contains('zh-chat-toolbar')) {
            toolbar.classList.add('zh-chat-toolbar');
        }

        // 2. 修复表情弹窗默认在按钮上方往右展开
        if (emojiBtn && !emojiBtn.dataset.zhEmojiPosBound) {
            emojiBtn.dataset.zhEmojiPosBound = '1';
            emojiBtn.addEventListener('click', () => fixEmojiPopoverPosition(emojiBtn));
        }

        // 3. 在 ul.ToolBar 末尾添加与原生同色同尺寸的机器人常用回复按钮（<li class="ToolBar-item">）
        if (toolbar && !toolbar.querySelector('.zh-chat-robot-btn')) {
            const li = document.createElement('li');
            li.className = 'ToolBar-item';
            const robotBtn = document.createElement('button');
            robotBtn.type = 'button';
            robotBtn.className = 'zh-chat-robot-btn';
            robotBtn.title = '常用回复（右键可添加/管理预设）';
            const emojiSvg = emojiBtn?.querySelector('svg');
            if (emojiSvg) {
                robotBtn.style.color = window.getComputedStyle(emojiSvg).color || '#535861';
            }
            robotBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" style="fill:none !important;stroke:currentColor;" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3" r="1" style="fill:currentColor;stroke:none;"/><circle cx="9.2" cy="13.5" r="1.15" style="fill:currentColor;stroke:none;"/><circle cx="14.8" cy="13.5" r="1.15" style="fill:currentColor;stroke:none;"/><path d="M9.5 17h5"/></svg>';
            robotBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const replies = Array.isArray(settings.chatQuickReplies) && settings.chatQuickReplies.length > 0
                    ? settings.chatQuickReplies
                    : ['人工客服'];
                if (replies.length === 1) {
                    insertTextIntoChatInput(replies[0]);
                } else {
                    openQuickReplyMenu(robotBtn);
                }
            });
            robotBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openQuickReplyMenu(robotBtn);
            });
            li.appendChild(robotBtn);
            toolbar.appendChild(li);
        }

        // 4. 支持直接 Ctrl+V 粘贴剪贴板图片到聊天框上传
        if (!chatBox.dataset.zhPasteImgBound) {
            chatBox.dataset.zhPasteImgBound = '1';
            chatBox.addEventListener('paste', (e) => {
                const dt = e.clipboardData;
                if (!dt) return;
                let imageFile = null;
                if (dt.items) {
                    for (const item of dt.items) {
                        if (item.kind === 'file' && item.type.startsWith('image/')) {
                            imageFile = item.getAsFile();
                            break;
                        }
                    }
                }
                if (!imageFile && dt.files && dt.files.length > 0) {
                    for (const f of dt.files) {
                        if (f.type && f.type.startsWith('image/')) {
                            imageFile = f;
                            break;
                        }
                    }
                }
                if (!imageFile) return;

                e.preventDefault();
                e.stopPropagation();

                const applyFileToInput = (inp) => {
                    if (!inp) return false;
                    const transfer = new DataTransfer();
                    transfer.items.add(imageFile);
                    inp.files = transfer.files;
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                };

                const existingInput = chatBox.querySelector('input[type="file"]');
                if (existingInput && applyFileToInput(existingInput)) return;

                if (imgBtn) {
                    const origClick = HTMLInputElement.prototype.click;
                    let captured = false;
                    HTMLInputElement.prototype.click = function () {
                        if (this.type === 'file' && !captured) {
                            captured = true;
                            applyFileToInput(this);
                            return;
                        }
                        return origClick.apply(this, arguments);
                    };
                    imgBtn.click();
                    setTimeout(() => {
                        HTMLInputElement.prototype.click = origClick;
                        if (!captured) {
                            const lazyInp = chatBox.querySelector('input[type="file"]');
                            if (!applyFileToInput(lazyInp)) {
                                showToast('未能触发图片上传框，请手动点击图片按钮');
                            }
                        }
                    }, 150);
                }
            }, true);
        }
    }

    function enhanceMessagesPage() {
        if (!location.pathname.startsWith('/messages')) return;
        const embed = isMessagesEmbedMode();
        document.documentElement.classList.toggle('zh-messages-embed', embed);
        if (document.body) {
            document.body.classList.toggle('zh-messages-embed', embed);
        }
        if (embed) {
            const sb = document.querySelector('.ChatSideBar');
            const lg = document.querySelector('.ChatSideBar .ChatListGroup');
            const se = document.querySelector('.ChatSideBar-Search');
            if (se) se.style.setProperty('display', 'none', 'important');
            if (sb) sb.style.setProperty('padding-top', '0px', 'important');
            if (lg) {
                lg.style.setProperty('margin-top', '0px', 'important');
                lg.style.setProperty('padding-top', '0px', 'important');
                lg.style.setProperty('top', '0px', 'important');
            }
        }
        if (embed) {
            document.querySelectorAll('.Chat-ChatBox img.ImageMessage, .Chat-ChatBox img[scene="message"]').forEach((img) => {
                if (img.getAttribute('loading') === 'lazy') {
                    img.setAttribute('loading', 'eager');
                }
                img.style.setProperty('visibility', 'visible', 'important');
                img.style.setProperty('cursor', 'zoom-in', 'important');
            });
        }
        if (embed && !window.__zhChatImgPreviewHook) {
            window.__zhChatImgPreviewHook = true;
            const triggerPreview = (img, e) => {
                if (!img) return;
                const rc = img.getBoundingClientRect();
                if (rc.width < 44 && rc.height < 44) return;
                const src = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.currentSrc || img.src;
                if (!src) return;
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                try {
                    if (typeof unsafeWindow !== 'undefined' && unsafeWindow.parent && typeof unsafeWindow.parent.__zhOpenChatLightbox === 'function') {
                        unsafeWindow.parent.__zhOpenChatLightbox(src);
                        return;
                    }
                } catch { /* ignore */ }
                try {
                    if (typeof unsafeWindow !== 'undefined' && unsafeWindow.parent && unsafeWindow.parent !== unsafeWindow) {
                        unsafeWindow.parent.postMessage({ type: 'zh-chat-image-preview', src }, '*');
                    }
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'zh-chat-image-preview', src }, '*');
                    } else {
                        openChatImageLightbox(src);
                    }
                } catch { /* ignore */ }
            };
            document.addEventListener('click', (e) => {
                if (e.target.closest('button, .InputBox, .Popover-content, .EmoticonTool')) return;
                let img = e.target.closest('.Chat-ChatBox img.ImageMessage, .Chat-ChatBox img[scene="message"]');
                if (!img) {
                    const anyImg = e.target.closest('.Chat-ChatBox img');
                    if (anyImg && !anyImg.closest('a, [class*="Avatar"], [class*="avatar"]')) {
                        img = anyImg;
                    }
                }
                if (!img) {
                    const wrap = e.target.closest('.Chat-ChatBox div');
                    if (wrap) {
                        img = wrap.querySelector(':scope > img.ImageMessage, :scope > img[scene="message"]');
                    }
                }
                triggerPreview(img, e);
            }, true);
        }
        if (embed && !window.__zhEmbedReadySent && document.querySelector('.ChatWrapper .ChatSideBar')) {
            window.__zhEmbedReadySent = true;
            try {
                window.parent.postMessage({ type: 'zh-messages-embed-ready' }, '*');
            } catch { /* ignore */ }
        }

        renderCustomChatCategories(false);
        enhanceChatInputBox();

        const closeNativeActionMenu = () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        };

        const injectChatActionMenu = () => {
            const userInfo = window.__zhPendingChatMenuUser;
            if (!userInfo) return false;
            const menus = Array.from(document.querySelectorAll('.Popover-content ul.ActionMenu'));
            const menu = menus[menus.length - 1];
            if (!menu) return false;
            if (menu.dataset.zhCatMenuInjected === '1' && menu.querySelector('.zh-chat-action-copy-item')) return true;
            menu.dataset.zhCatMenuInjected = '1';

            const copyLi = document.createElement('li');
            copyLi.className = 'ActionMenu-item zh-chat-action-copy-item';
            copyLi.textContent = '复制到 ▸';

            let hideTimer = null;
            const scheduleHide = () => {
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                    const p = document.getElementById('zh-chat-cat-picker');
                    if (p && !p.matches(':hover') && !copyLi.matches(':hover')) {
                        closeChatCatPicker();
                    }
                }, 180);
            };
            const showSubmenu = () => {
                clearTimeout(hideTimer);
                const picker = openChatCatPicker(copyLi, userInfo, closeNativeActionMenu);
                if (picker) {
                    picker.addEventListener('mouseenter', () => clearTimeout(hideTimer));
                    picker.addEventListener('mouseleave', scheduleHide);
                }
            };

            copyLi.addEventListener('mouseenter', showSubmenu);
            copyLi.addEventListener('mouseleave', scheduleHide);
            copyLi.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                showSubmenu();
            });
            menu.appendChild(copyLi);
            return true;
        };

        if (!window.__zhChatActionMenuHook) {
            window.__zhChatActionMenuHook = true;
            document.addEventListener('click', (e) => {
                const moreBtn = e.target.closest('.ChatUserListItem .Chat-ActionMenuPopover-Button');
                if (!moreBtn || moreBtn.classList.contains('zh-chat-more-cat-btn')) return;
                const itemEl = moreBtn.closest('.ChatUserListItem');
                if (!itemEl) return;
                const name = (itemEl.querySelector('.userName-nameArea, [class*="nameArea"]')?.textContent || '').trim();
                if (!name) return;
                const matched = findChatEntityByName(name);
                const uObj = matched?.user || { name };
                const avatarEl = itemEl.querySelector('img');
                window.__zhPendingChatMenuUser = {
                    id: uObj.id ? String(uObj.id) : '',
                    urlToken: uObj.urlToken || '',
                    name,
                    avatar: avatarEl?.getAttribute('src') || uObj.avatarUrl || ''
                };

                setTimeout(() => {
                    if (!injectChatActionMenu()) {
                        setTimeout(() => {
                            if (!injectChatActionMenu()) {
                                setTimeout(() => {
                                    if (!injectChatActionMenu()) setTimeout(injectChatActionMenu, 260);
                                }, 120);
                            }
                        }, 40);
                    }
                }, 0);
            }, true);
        }
        injectChatActionMenu();

        const items = document.querySelectorAll('.ChatSideBar .ChatUserListItem');
        items.forEach((item) => {
            const nameEl = item.querySelector('.userName-nameArea, [class*="nameArea"]');
            const name = (nameEl?.textContent || '').trim();
            if (!name) return;

            const matched = findChatEntityByName(name);
            const userObj = matched?.user || { name };
            if (isMutedByCategory(userObj)) {
                item.classList.add('zh-blocked-dm-hidden');
                const chatId = matched?.chatId;
                const hasUnreadDom = !!item.querySelector('[class*="unread"], [class*="Badge"], [class*="dot"]');
                if (chatId && ((matched?.chat?.unreadCount || 0) > 0 || hasUnreadDom)) {
                    markThreadAsRead(chatId);
                }
                return;
            }
            item.classList.remove('zh-blocked-dm-hidden');

            // 清理旧的“+ 分类”悬浮按钮，改由原生“...”菜单内嵌分类选项
            const oldAddBtn = item.querySelector('.zh-chat-add-to-cat-btn');
            if (oldAddBtn) oldAddBtn.remove();

            // 若当前列表项无原生“...”按钮（如“互相关注”分组），补一个同款“...”按钮
            if (!item.querySelector('.Chat-ActionMenuPopover-Button')) {
                const avatarEl = item.querySelector('img');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'Chat-ActionMenuPopover-Button zh-chat-more-cat-btn';
                btn.setAttribute('aria-label', '更多');
                btn.title = '分类操作';
                btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" class="Zi Zi--Dots Message-status--more" fill="currentColor"><path d="M6 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM16.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"></path></svg>';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openChatCatPicker(btn, {
                        id: userObj.id ? String(userObj.id) : '',
                        urlToken: userObj.urlToken || '',
                        name,
                        avatar: avatarEl?.getAttribute('src') || userObj.avatarUrl || ''
                    });
                });
                item.appendChild(btn);
            }
        });
    }

    function closeQqChatShell() {
        document.body.classList.remove('zh-qq-chat-open');
    }

    function ensureQqChatShell() {
        if (!document.getElementById('zh-qq-chat-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'zh-qq-chat-backdrop';
            backdrop.addEventListener('click', closeQqChatShell);
            document.body.appendChild(backdrop);
        }
        let shell = document.getElementById('zh-qq-chat-shell');
        if (!shell) {
            shell = document.createElement('div');
            shell.id = 'zh-qq-chat-shell';
            shell.innerHTML = `
                <div class="zh-qq-shell-topbar">
                    <span>私信</span>
                    <input type="search" class="zh-qq-top-search" placeholder="搜索联系人">
                    <div class="zh-qq-shell-topbar-actions">
                        <button type="button" class="zh-qq-pin-btn" title="钉住窗口（点击外部不关闭，可操作后方页面）">钉住</button>
                        <a class="zh-qq-mini-btn" href="https://www.zhihu.com/messages" target="_blank" rel="noopener">新标签页打开</a>
                        <button type="button" class="zh-qq-shell-close" aria-label="关闭">×</button>
                    </div>
                </div>
                <div class="zh-qq-iframe-wrap is-loading">
                    <div class="zh-qq-loading">
                        <div class="zh-qq-spinner"></div>
                        <span>正在加载私信窗口...</span>
                    </div>
                    <iframe id="zh-qq-chat-iframe" src="about:blank" title="知乎私信"></iframe>
                </div>
                <div class="zh-qq-resize-handle zh-qq-resize-r" data-dir="r"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-l" data-dir="l"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-t" data-dir="t"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-b" data-dir="b"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-br" data-dir="br"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-bl" data-dir="bl"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-tr" data-dir="tr"></div>
                <div class="zh-qq-resize-handle zh-qq-resize-tl" data-dir="tl"></div>
            `;
            document.body.appendChild(shell);

            if (settings.chatModalRect && typeof settings.chatModalRect === 'object') {
                const r = settings.chatModalRect;
                const w = Math.max(280, Math.min(window.innerWidth - 20, Number(r.width) || 980));
                const h = Math.max(360, Math.min(window.innerHeight - 20, Number(r.height) || 680));
                const l = Math.max(0, Math.min(window.innerWidth - w, Number(r.left) || 0));
                const t = Math.max(0, Math.min(window.innerHeight - h, Number(r.top) || 0));
                shell.classList.add('zh-has-rect');
                shell.style.setProperty('width', `${w}px`, 'important');
                shell.style.setProperty('height', `${h}px`, 'important');
                shell.style.setProperty('left', `${l}px`, 'important');
                shell.style.setProperty('top', `${t}px`, 'important');
            }

            const saveRect = () => {
                const rc = shell.getBoundingClientRect();
                settings.chatModalRect = {
                    left: Math.round(rc.left),
                    top: Math.round(rc.top),
                    width: Math.round(rc.width),
                    height: Math.round(rc.height)
                };
                saveSettings(settings);
            };

            const clampShellToViewport = () => {
                if (!shell.classList.contains('zh-has-rect')) return;
                const maxW = Math.max(280, window.innerWidth - 16);
                const maxH = Math.max(360, window.innerHeight - 16);
                const curW = parseFloat(shell.style.width) || shell.offsetWidth || maxW;
                const curH = parseFloat(shell.style.height) || shell.offsetHeight || maxH;
                const w = Math.max(280, Math.min(maxW, curW));
                const h = Math.max(360, Math.min(maxH, curH));
                const curL = parseFloat(shell.style.left) || 8;
                const curT = parseFloat(shell.style.top) || 8;
                const l = Math.max(8, Math.min(Math.max(8, window.innerWidth - w - 8), curL));
                const t = Math.max(8, Math.min(Math.max(8, window.innerHeight - h - 8), curT));
                shell.style.setProperty('width', `${w}px`, 'important');
                shell.style.setProperty('height', `${h}px`, 'important');
                shell.style.setProperty('left', `${l}px`, 'important');
                shell.style.setProperty('top', `${t}px`, 'important');
            };
            if (!window.__zhChatShellResizeHook) {
                window.__zhChatShellResizeHook = true;
                window.addEventListener('resize', clampShellToViewport, { passive: true });
            }

            const topbar = shell.querySelector('.zh-qq-shell-topbar');
            const topSearch = shell.querySelector('.zh-qq-top-search');
            if (topSearch) {
                topSearch.addEventListener('input', () => {
                    try {
                        iframe.contentWindow.postMessage({ type: 'zh-chat-search', query: topSearch.value }, '*');
                    } catch { /* ignore */ }
                });
            }
            topbar.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || e.target.closest('.zh-qq-shell-topbar-actions, .zh-qq-top-search')) return;
                e.preventDefault();
                const rc = shell.getBoundingClientRect();
                shell.classList.add('zh-has-rect', 'zh-dragging');
                shell.style.setProperty('left', `${rc.left}px`, 'important');
                shell.style.setProperty('top', `${rc.top}px`, 'important');
                shell.style.setProperty('width', `${rc.width}px`, 'important');
                shell.style.setProperty('height', `${rc.height}px`, 'important');
                const startX = e.clientX;
                const startY = e.clientY;
                const onMove = (ev) => {
                    const nl = Math.max(0, Math.min(window.innerWidth - rc.width, rc.left + (ev.clientX - startX)));
                    const nt = Math.max(0, Math.min(window.innerHeight - rc.height, rc.top + (ev.clientY - startY)));
                    shell.style.setProperty('left', `${nl}px`, 'important');
                    shell.style.setProperty('top', `${nt}px`, 'important');
                };
                const onUp = () => {
                    shell.classList.remove('zh-dragging');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    saveRect();
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            shell.querySelectorAll('.zh-qq-resize-handle').forEach((handle) => {
                handle.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const dir = handle.getAttribute('data-dir');
                    const rc = shell.getBoundingClientRect();
                    shell.classList.add('zh-has-rect', 'zh-dragging');
                    shell.style.setProperty('left', `${rc.left}px`, 'important');
                    shell.style.setProperty('top', `${rc.top}px`, 'important');
                    shell.style.setProperty('width', `${rc.width}px`, 'important');
                    shell.style.setProperty('height', `${rc.height}px`, 'important');
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const onMove = (ev) => {
                        const dx = ev.clientX - startX;
                        const dy = ev.clientY - startY;
                        if (dir.includes('r')) {
                            const nw = Math.max(280, Math.min(window.innerWidth - rc.left, rc.width + dx));
                            shell.style.setProperty('width', `${nw}px`, 'important');
                        }
                        if (dir.includes('l')) {
                            const nw = Math.max(280, Math.min(rc.right, rc.width - dx));
                            const nl = rc.right - nw;
                            shell.style.setProperty('width', `${nw}px`, 'important');
                            shell.style.setProperty('left', `${Math.max(0, nl)}px`, 'important');
                        }
                        if (dir.includes('b')) {
                            const nh = Math.max(360, Math.min(window.innerHeight - rc.top, rc.height + dy));
                            shell.style.setProperty('height', `${nh}px`, 'important');
                        }
                        if (dir.includes('t')) {
                            const nh = Math.max(360, Math.min(rc.bottom, rc.height - dy));
                            const nt = rc.bottom - nh;
                            shell.style.setProperty('height', `${nh}px`, 'important');
                            shell.style.setProperty('top', `${Math.max(0, nt)}px`, 'important');
                        }
                    };
                    const onUp = () => {
                        shell.classList.remove('zh-dragging');
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        saveRect();
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                });
            });
            const wrap = shell.querySelector('.zh-qq-iframe-wrap');
            const iframe = shell.querySelector('#zh-qq-chat-iframe');
            const finishLoading = () => {
                if (wrap) wrap.classList.remove('is-loading');
            };
            iframe.addEventListener('load', () => {
                const src = iframe.getAttribute('src') || '';
                if (src && src !== 'about:blank') {
                    setTimeout(finishLoading, 220);
                }
            });
            if (!window.__zhQqMsgHook) {
                window.__zhQqMsgHook = true;
                if (typeof unsafeWindow !== 'undefined') {
                    unsafeWindow.__zhOpenChatLightbox = openChatImageLightbox;
                }
                const onParentMsg = (e) => {
                    if (e.data && e.data.type === 'zh-messages-embed-ready') {
                        finishLoading();
                    } else if (e.data && e.data.type === 'zh-chat-image-preview' && e.data.src) {
                        openChatImageLightbox(e.data.src);
                    }
                };
                window.addEventListener('message', onParentMsg);
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== window) {
                    unsafeWindow.addEventListener('message', onParentMsg);
                }
            }
            const pinBtn = shell.querySelector('.zh-qq-pin-btn');
            if (pinBtn) {
                pinBtn.addEventListener('click', () => {
                    const pinned = !document.body.classList.contains('zh-qq-chat-pinned');
                    document.body.classList.toggle('zh-qq-chat-pinned', pinned);
                    pinBtn.classList.toggle('is-pinned', pinned);
                    pinBtn.textContent = pinned ? '已钉住' : '钉住';
                });
            }
            shell.querySelector('.zh-qq-shell-close').addEventListener('click', closeQqChatShell);
            if (!window.__zhQqEscHook) {
                window.__zhQqEscHook = true;
                document.addEventListener('keydown', (e) => {
                    const lb = document.getElementById('zh-chat-img-lightbox');
                    if (e.key === 'Escape' && lb) {
                        lb.remove();
                        return;
                    }
                    if (e.key === 'Escape' && document.body.classList.contains('zh-qq-chat-open') && !document.body.classList.contains('zh-qq-chat-pinned')) {
                        closeQqChatShell();
                    }
                });
            }
        }
        return shell;
    }

    let lastLightboxSrc = '';
    let lastLightboxAt = 0;

    function openChatImageLightbox(src, targetDoc) {
        const doc = targetDoc || document;
        const now = Date.now();
        if (src === lastLightboxSrc && now - lastLightboxAt < 200) return;
        lastLightboxSrc = src;
        lastLightboxAt = now;
        const old = doc.getElementById('zh-chat-img-lightbox');
        if (old) old.remove();
        const lb = doc.createElement('div');
        lb.id = 'zh-chat-img-lightbox';
        lb.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:zoom-out;';
        const img = doc.createElement('img');
        img.referrerPolicy = 'origin';
        img.src = src;
        img.style.cssText = 'max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,0.45);transition:transform 0.12s ease;cursor:default;background:#fff;';
        let scale = 1;
        img.addEventListener('click', (e) => e.stopPropagation());
        img.addEventListener('wheel', (e) => {
            e.preventDefault();
            scale = Math.max(0.5, Math.min(4, scale + (e.deltaY < 0 ? 0.15 : -0.15)));
            img.style.transform = `scale(${scale.toFixed(2)})`;
        }, { passive: false });
        img.addEventListener('error', () => {
            const errTip = doc.createElement('div');
            errTip.style.cssText = 'color:#fff;font-size:14px;';
            errTip.textContent = '图片加载失败，请点击下方在新标签页打开';
            lb.insertBefore(errTip, img);
            img.style.display = 'none';
        });
        const openLink = doc.createElement('a');
        openLink.href = src;
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.textContent = '在新标签页打开原图';
        openLink.style.cssText = 'color:#e5e7eb;font-size:12.5px;text-decoration:underline;';
        openLink.addEventListener('click', (e) => e.stopPropagation());
        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'position:fixed;top:16px;right:20px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:22px;line-height:36px;cursor:pointer;';
        closeBtn.addEventListener('click', () => lb.remove());
        lb.addEventListener('click', () => lb.remove());
        lb.appendChild(img);
        lb.appendChild(openLink);
        lb.appendChild(closeBtn);
        (doc.body || doc.documentElement).appendChild(lb);
    }

    function openQqChatShell() {
        if (location.pathname.startsWith('/messages')) {
            window.focus();
            return;
        }
        const shell = ensureQqChatShell();
        const wrap = shell.querySelector('.zh-qq-iframe-wrap');
        const iframe = shell.querySelector('#zh-qq-chat-iframe');
        const targetSrc = 'https://www.zhihu.com/messages?zh_embed=1';
        if (iframe && (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank')) {
            if (wrap) wrap.classList.add('is-loading');
            iframe.setAttribute('src', targetSrc);
        }
        document.body.classList.add('zh-qq-chat-open');
    }

    function triggerProfileMenuAction(act) {
        if (act.id === 'my-messages') {
            openQqChatShell();
            return;
        }
        if (act.id === 'creator-center') {
            window.open(act.fallbackUrl || 'https://www.zhihu.com/creator', '_blank');
            return;
        }
        const avatarBtn = document.querySelector('.AppHeader-profileAvatar, .AppHeader-userInfo button, .AppHeader-profile button');
        if (avatarBtn) {
            avatarBtn.click();
            setTimeout(() => {
                const items = document.querySelectorAll('.Popover-content a, .Popover-content button, .Menu a, .Menu button');
                const target = Array.from(items).find((n) => n.textContent.trim() === act.menuText);
                if (target) {
                    target.click();
                } else if (act.id === 'my-theme') {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
                } else if (act.fallbackUrl) {
                    window.open(act.fallbackUrl, '_blank');
                }
            }, 90);
            return;
        }
        if (act.id === 'my-theme') {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
        } else if (act.fallbackUrl) {
            window.open(act.fallbackUrl, '_blank');
        }
    }

    function triggerSidebarCreateAction(action) {
        // 优先尝试触发原生“+ 创作”菜单或页面快捷按钮
        const createBtn = document.querySelector('[data-zh-create-btn="true"]');
        if (createBtn) {
            createBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            createBtn.click();
            setTimeout(() => {
                const menuItem = Array.from(document.querySelectorAll('.Popover-content a, .Popover-content button, [role="menu"] a, [role="menu"] button, [role="menuitem"]'))
                    .find((n) => n.textContent.trim() === action.label);
                if (menuItem) {
                    menuItem.click();
                } else {
                    window.open(action.url, '_blank');
                }
            }, 80);
            return;
        }
        window.open(action.url, '_blank');
    }

    function getSidebarItemId(txt) {
        if (txt === '首页' || txt.includes('首页')) return 'home';
        if (txt.includes('专栏')) return 'column';
        if (txt.includes('圈子')) return 'circle';
        if (txt.includes('直答')) return 'zhida';
        if (txt.includes('AI Works')) return 'aiworks';
        if (txt.includes('盐言故事')) return 'yanyan';
        if (txt.includes('付费咨询')) return 'consult';
        if (txt.includes('知学堂')) return 'zhixuetang';
        if (txt.includes('创作')) return 'create';
        if (txt.includes('关于我们')) return 'about';
        return '';
    }

    function applySidebarOrderAndVisibility() {
        const sidebar = document.querySelector('[data-zh-sidebar="true"]');
        if (!sidebar) return;

        const orderMap = new Map();
        const visibleMap = new Map();
        settings.sidebarItems.forEach((item, idx) => {
            orderMap.set(item.id, idx);
            visibleMap.set(item.id, item.visible !== false);
        });

        // 同步动态分隔线节点到“首页”所在主容器，并清除原生边框线
        const mainParent = sidebar.querySelector('[data-zh-sidebar-id="home"]')?.parentElement ||
            sidebar.querySelector('[data-zh-sidebar-id]')?.parentElement;
        if (mainParent) {
            mainParent.style.setProperty('border-top', 'none', 'important');
            mainParent.style.setProperty('border-bottom', 'none', 'important');
            for (const child of mainParent.children) {
                if (!child.classList.contains('zh-sidebar-divider')) {
                    child.style.setProperty('border-top', 'none', 'important');
                    child.style.setProperty('border-bottom', 'none', 'important');
                }
            }
            const wantedDividerIds = new Set(settings.sidebarItems.filter((x) => x.kind === 'divider').map((x) => x.id));
            mainParent.querySelectorAll('.zh-sidebar-divider').forEach((divEl) => {
                if (!wantedDividerIds.has(divEl.getAttribute('data-zh-sidebar-id'))) {
                    divEl.remove();
                }
            });
            for (const item of settings.sidebarItems) {
                if (item.kind === 'divider' && !mainParent.querySelector(`.zh-sidebar-divider[data-zh-sidebar-id="${CSS.escape(item.id)}"]`)) {
                    const divEl = document.createElement('div');
                    divEl.className = 'zh-sidebar-divider';
                    divEl.setAttribute('data-zh-sidebar-id', item.id);
                    mainParent.appendChild(divEl);
                }
            }
        }

        // 收集所有带 data-zh-sidebar-id 的行容器并按配置排序与显隐
        const itemsByParent = new Map();
        sidebar.querySelectorAll('[data-zh-sidebar-id]').forEach((node) => {
            const id = node.getAttribute('data-zh-sidebar-id');
            const isVisible = visibleMap.has(id) ? visibleMap.get(id) : true;
            if (isVisible) {
                node.removeAttribute('data-zh-hide-sidebar-item');
            } else {
                node.setAttribute('data-zh-hide-sidebar-item', 'true');
            }
            const p = node.parentElement;
            if (p) {
                if (!itemsByParent.has(p)) itemsByParent.set(p, []);
                itemsByParent.get(p).push(node);
            }
        });

        // 在同一个父容器内，若顺序与 settings.sidebarItems 不一致则重排 DOM
        for (const [parent, nodes] of itemsByParent.entries()) {
            const sorted = [...nodes].sort((a, b) => {
                const ia = orderMap.get(a.getAttribute('data-zh-sidebar-id')) ?? 999;
                const ib = orderMap.get(b.getAttribute('data-zh-sidebar-id')) ?? 999;
                return ia - ib;
            });
            // 判断是否需要调整顺序
            let changed = false;
            for (let i = 0; i < sorted.length; i++) {
                if (nodes[i] !== sorted[i]) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                const anchor = null;
                for (const node of sorted) {
                    parent.insertBefore(node, anchor);
                }
            }
        }
    }

    function ensureHamburgerButton() {
        if (isMessagesEmbedMode() || !document.body) return null;
        let btn = document.getElementById('zh-sidebar-hamburger-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'zh-sidebar-hamburger-btn';
            btn.type = 'button';
            btn.title = '展开/收起导航菜单';
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.body.classList.toggle('zh-sidebar-drawer-open');
            });

            if (!window.__zhHamburgerOutsideHook) {
                window.__zhHamburgerOutsideHook = true;
                document.addEventListener('click', (e) => {
                    if (!document.body.classList.contains('zh-sidebar-drawer-open')) return;
                    if (e.target.closest('#zh-sidebar-hamburger-btn, [data-zh-sidebar="true"], #zh-floating-left-sidebar')) return;
                    document.body.classList.remove('zh-sidebar-drawer-open');
                });
            }
        }
        if (btn.parentElement !== document.body) {
            document.body.appendChild(btn);
        }
        btn.style.removeProperty('left');
        return btn;
    }

    function updateAutoSidebarCollapse() {
        if (!document.body) return;
        if (isMessagesEmbedMode()) {
            document.body.classList.remove('zh-sidebar-collapsed', 'zh-sidebar-hamburger', 'zh-sidebar-drawer-open');
            return;
        }
        const sidebar = document.querySelector('[data-zh-sidebar="true"]');
        if (!sidebar) {
            document.body.classList.remove('zh-sidebar-collapsed', 'zh-sidebar-hamburger', 'zh-sidebar-drawer-open');
            return;
        }
        const isHamburger = window.innerWidth < 900;
        document.body.classList.toggle('zh-sidebar-hamburger', isHamburger);
        if (isHamburger) {
            ensureHamburgerButton();
            document.body.classList.remove('zh-sidebar-collapsed');
            return;
        }
        document.body.classList.remove('zh-sidebar-drawer-open');
        const mainCol = document.querySelector('.Topstory-mainColumn, .Question-mainColumn, .Profile-mainColumn, .SearchMain, .ExploreHomePage-ContentSection-more');
        const mainWidth = mainCol ? Math.min(1040, mainCol.offsetWidth || 1000) : 1000;
        const sideSpace = (window.innerWidth - mainWidth) / 2;
        const shouldCollapse = window.innerWidth < 1320 || sideSpace < 276;
        document.body.classList.toggle('zh-sidebar-collapsed', shouldCollapse);
    }

    function ensureFloatingLeftSidebar() {
        if (isMessagesEmbedMode() || !document.body) return;
        if (document.querySelector('[data-zh-sidebar="true"]')) return;
        // 仅在 www.zhihu.com 主站无原生侧栏的页面（如 /settings/*、/question/*、/people/*、/explore 等）显示
        if (location.hostname !== 'www.zhihu.com') return;

        const aside = document.createElement('aside');
        aside.id = 'zh-floating-left-sidebar';
        aside.setAttribute('data-zh-sidebar', 'true');
        aside.setAttribute('data-zh-sidebar-card', 'true');

        const nav = document.createElement('nav');
        nav.style.cssText = 'display:flex;flex-direction:column;width:100%;';

        // 首页
        const homeLink = document.createElement('a');
        homeLink.href = 'https://www.zhihu.com/';
        homeLink.className = 'zh-sidebar-create-item';
        homeLink.setAttribute('data-zh-sidebar-id', 'home');
        homeLink.title = '首页';
        homeLink.style.setProperty('--zh-pad-left', '14px');
        homeLink.style.setProperty('--zh-gap', '14px');
        homeLink.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M14.625 17a.875.875 0 0 1 0 1.75h-5.25a.875.875 0 0 1 0-1.75h5.25Z"/><path fill-rule="evenodd" d="M9.901 2.758a3.875 3.875 0 0 1 4.198 0l6 3.865a3.876 3.876 0 0 1 1.776 3.258V18A3.875 3.875 0 0 1 18 21.876H6A3.875 3.875 0 0 1 2.125 18V9.88c0-1.317.67-2.545 1.776-3.258l6-3.865Zm3.25 1.471a2.126 2.126 0 0 0-2.301 0l-6 3.865a2.126 2.126 0 0 0-.975 1.787V18c0 1.173.952 2.125 2.125 2.125h12A2.125 2.125 0 0 0 20.125 18V9.88c0-.723-.367-1.395-.975-1.787l-6-3.865Z" clip-rule="evenodd"/></svg><span>首页</span>';
        nav.appendChild(homeLink);

        const idMap = { '提问题': 'ask', '写回答': 'answer', '发想法': 'pin', '写文章': 'article' };
        for (const act of SIDEBAR_CREATE_ACTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zh-sidebar-create-item';
            btn.setAttribute('data-zh-sidebar-id', idMap[act.label] || act.label);
            btn.title = act.label;
            btn.style.setProperty('--zh-pad-left', '14px');
            btn.style.setProperty('--zh-gap', '14px');
            btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${act.svg}</svg><span>${act.label}</span>`;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerSidebarCreateAction(act);
            });
            nav.appendChild(btn);
        }

        for (const pact of SIDEBAR_PROFILE_ACTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zh-sidebar-create-item';
            btn.setAttribute('data-zh-sidebar-id', pact.id);
            btn.title = pact.label;
            btn.style.setProperty('--zh-pad-left', '14px');
            btn.style.setProperty('--zh-gap', '14px');
            btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${pact.svg}</svg><span>${pact.label}</span>`;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if ((e.ctrlKey || e.metaKey) && (pact.id === 'my-home' || pact.id === 'my-history')) {
                    resolveProfileActionUrl(pact, openUrlInBackgroundTab);
                    return;
                }
                triggerProfileMenuAction(pact);
            });
            if (pact.id === 'my-home' || pact.id === 'my-history' || pact.id === 'creator-center') {
                btn.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
                btn.addEventListener('auxclick', (e) => {
                    if (e.button === 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (pact.id === 'creator-center') openUrlInBackgroundTab(pact.fallbackUrl);
                        else resolveProfileActionUrl(pact, openUrlInBackgroundTab);
                    }
                });
            }
            nav.appendChild(btn);
        }

        const setBtn = document.createElement('button');
        setBtn.type = 'button';
        setBtn.className = 'zh-sidebar-create-item zh-sidebar-settings-btn';
        setBtn.setAttribute('data-zh-sidebar-id', 'settings');
        setBtn.title = '脚本设置';
        setBtn.style.setProperty('--zh-pad-left', '14px');
        setBtn.style.setProperty('--zh-gap', '14px');
        setBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.79 1.02 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg><span>脚本设置</span>';
        setBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openScriptSettingsPage();
        });
        nav.appendChild(setBtn);

        aside.appendChild(nav);
        document.body.appendChild(aside);
        applySidebarOrderAndVisibility();
        updateAutoSidebarCollapse();
    }

    function tagLeftSidebar() {
        if (isMessagesEmbedMode()) return;
        const existing = document.querySelector('[data-zh-sidebar="true"]');
        if (existing) {
            existing.querySelectorAll('[data-zh-sidebar-id]').forEach((node) => {
                if (!node.getAttribute('title')) {
                    const label = (node.textContent || '').trim();
                    if (label) node.setAttribute('title', label);
                }
            });
            applySidebarOrderAndVisibility();
            updateAutoSidebarCollapse();
            return;
        }

        const candidates = document.querySelectorAll('nav, aside, div');
        for (const el of candidates) {
            if (el.clientWidth === 0 || el.clientWidth > 320) continue;
            const links = el.querySelectorAll('a, button');
            if (links.length < 5 || links.length > 20) continue;

            const texts = Array.from(links).map((n) => n.textContent.trim());
            const hasHome = texts.some((t) => t === '首页' || t.includes('首页'));
            const hasSpecial = texts.some((t) => t.includes('直答') || t.includes('盐言故事') || t.includes('专栏'));
            if (!hasHome || !hasSpecial) continue;

            el.setAttribute('data-zh-sidebar', 'true');
            let createBtnEl = null;
            for (const item of links) {
                const txt = item.textContent.trim();
                const id = getSidebarItemId(txt);
                if (id) {
                    const rowWrap = item.closest('li') || item;
                    rowWrap.setAttribute('data-zh-sidebar-id', id);
                    if (id === 'create') {
                        item.setAttribute('data-zh-create-btn', 'true');
                        createBtnEl = item;
                    }
                }
            }

            // 将自定义按钮统一插入到“首页”所在主容器中，确保与“首页”及分隔线共享同一父容器以便自由穿插排序
            if (createBtnEl && !el.querySelector('.zh-sidebar-create-item')) {
                const anchor = createBtnEl.closest('li') || createBtnEl;
                const homeItem = Array.from(links).find((n) => n.textContent.trim() === '首页');
                const targetContainer = (homeItem ? (homeItem.closest('li') || homeItem).parentElement : null) || anchor.parentElement;
                const homeSvg = homeItem ? homeItem.querySelector('svg') : null;
                const homeSpan = homeItem ? Array.from(homeItem.querySelectorAll('span, div')).find((s) => s.textContent.trim() === '首页') : null;

                let refLeftPad = '';
                let refGap = '';
                if (homeSvg && homeSpan) {
                    const homeRow = homeItem.closest('li') || homeItem;
                    const homeRowRect = homeRow.getBoundingClientRect();
                    const svgRect = homeSvg.getBoundingClientRect();
                    const spanRect = homeSpan.getBoundingClientRect();
                    if (svgRect.width > 0 && spanRect.width > 0) {
                        refLeftPad = `${Math.max(0, Math.round(svgRect.left - homeRowRect.left))}px`;
                        refGap = `${Math.max(8, Math.round(spanRect.left - svgRect.right))}px`;
                    }
                }

                const idMap = { '提问题': 'ask', '写回答': 'answer', '发想法': 'pin', '写文章': 'article' };
                for (const act of SIDEBAR_CREATE_ACTIONS) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'zh-sidebar-create-item';
                    btn.setAttribute('data-zh-sidebar-id', idMap[act.label] || act.label);
                    if (refLeftPad) btn.style.setProperty('--zh-pad-left', refLeftPad);
                    if (refGap) btn.style.setProperty('--zh-gap', refGap);
                    btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${act.svg}</svg><span>${act.label}</span>`;
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerSidebarCreateAction(act);
                    });
                    targetContainer.appendChild(btn);
                }

                // 插入头像菜单里的：我的主页、最近浏览、显示模式、知乎设置
                for (const pact of SIDEBAR_PROFILE_ACTIONS) {
                    if (el.querySelector(`[data-zh-sidebar-id="${pact.id}"]`)) continue;
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'zh-sidebar-create-item';
                    btn.setAttribute('data-zh-sidebar-id', pact.id);
                    if (refLeftPad) btn.style.setProperty('--zh-pad-left', refLeftPad);
                    if (refGap) btn.style.setProperty('--zh-gap', refGap);
                    btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${pact.svg}</svg><span>${pact.label}</span>`;
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if ((e.ctrlKey || e.metaKey) && (pact.id === 'my-home' || pact.id === 'my-history')) {
                            resolveProfileActionUrl(pact, openUrlInBackgroundTab);
                            return;
                        }
                        triggerProfileMenuAction(pact);
                    });
                    if (pact.id === 'my-home' || pact.id === 'my-history' || pact.id === 'creator-center') {
                        btn.addEventListener('mousedown', (e) => {
                            if (e.button === 1) e.preventDefault();
                        });
                        btn.addEventListener('auxclick', (e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                e.stopPropagation();
                                if (pact.id === 'creator-center') {
                                    openUrlInBackgroundTab(pact.fallbackUrl);
                                } else {
                                    resolveProfileActionUrl(pact, openUrlInBackgroundTab);
                                }
                            }
                        });
                    }
                    targetContainer.appendChild(btn);
                }

                // 在侧栏底部添加“脚本设置”入口，点击在新标签页打开知乎偏好设置页
                if (!el.querySelector('.zh-sidebar-settings-btn')) {
                    const setBtn = document.createElement('button');
                    setBtn.type = 'button';
                    setBtn.className = 'zh-sidebar-create-item zh-sidebar-settings-btn';
                    setBtn.setAttribute('data-zh-sidebar-id', 'settings');
                    if (refLeftPad) setBtn.style.setProperty('--zh-pad-left', refLeftPad);
                    if (refGap) setBtn.style.setProperty('--zh-gap', refGap);
                    setBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.79 1.02 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg><span>脚本设置</span>`;
                    setBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openScriptSettingsPage();
                    });
                    targetContainer.appendChild(setBtn);
                }
            }

            applySidebarOrderAndVisibility();
            el.querySelectorAll('[data-zh-sidebar-id]').forEach((node) => {
                if (!node.getAttribute('title')) {
                    const label = (node.textContent || '').trim();
                    if (label) node.setAttribute('title', label);
                }
            });
            updateAutoSidebarCollapse();

            // 向上查找带有白色背景/圆角/边框的卡片外框容器，以及布局列容器
            let curr = el;
            for (let i = 0; i < 4 && curr && curr.parentElement; i++) {
                const style = window.getComputedStyle(curr);
                const hasBg = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                const hasRadius = parseFloat(style.borderRadius) > 0;
                const hasShadow = style.boxShadow && style.boxShadow !== 'none';
                const hasBorder = parseFloat(style.borderWidth) > 0;

                if (curr.clientWidth <= 260 && (hasBg || hasRadius || hasShadow || hasBorder)) {
                    curr.setAttribute('data-zh-sidebar-card', 'true');
                }

                const parent = curr.parentElement;
                if (parent && parent.clientWidth > 0 && parent.clientWidth <= 260 && !parent.querySelector('.Topstory-mainColumn')) {
                    parent.setAttribute('data-zh-sidebar-col', 'true');
                }
                curr = parent;
            }
            break;
        }
        if (!document.querySelector('[data-zh-sidebar="true"]')) {
            ensureFloatingLeftSidebar();
        }
    }

    // =========================================================================
    // 5. 屏蔽用户逻辑（仅调用知乎官方屏蔽接口，不隐藏当前页面回答）
    // =========================================================================
    function extractUserToken(href) {
        if (!href) return '';
        const match = href.match(/\/(?:people|org)\/([^/?#]+)/);
        return match ? match[1] : '';
    }

    async function toggleBlockUser(token, name, btn) {
        if (!token) return;
        const isBlocked = blockedTokenSet.has(token);
        const method = isBlocked ? 'DELETE' : 'POST';

        try {
            const xsrf = getCookie('_xsrf');
            const headers = { 'content-type': 'application/json' };
            if (xsrf) headers['x-xsrftoken'] = xsrf;

            const res = await fetch(`https://www.zhihu.com/api/v4/members/${encodeURIComponent(token)}/actions/block`, {
                method,
                credentials: 'include',
                headers
            });

            if (res.ok) {
                if (isBlocked) {
                    blockedTokenSet.delete(token);
                    showToast(`已取消屏蔽：${name || token}`);
                } else {
                    blockedTokenSet.add(token);
                    showToast(`已屏蔽用户：${name || token}`);
                }
                updateButtonStates(token);
            } else {
                showToast(`操作失败（HTTP ${res.status}），请确认已登录知乎`);
            }
        } catch {
            showToast('网络请求失败，无法完成屏蔽操作');
        }
    }

    function updateButtonStates(token) {
        const isBlocked = blockedTokenSet.has(token);
        document.querySelectorAll(`.zh-block-user-btn[data-zh-block-token="${CSS.escape(token)}"]`).forEach((b) => {
            b.textContent = isBlocked ? '已屏蔽' : '屏蔽用户';
            b.classList.toggle('is-blocked', isBlocked);
        });
    }

    function createBlockButton(token, name) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'zh-block-user-btn' + (blockedTokenSet.has(token) ? ' is-blocked' : '');
        btn.textContent = blockedTokenSet.has(token) ? '已屏蔽' : '屏蔽用户';
        btn.title = `屏蔽 ${name || token}`;
        btn.setAttribute('data-zh-block-token', token);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleBlockUser(token, name, btn);
        });
        return btn;
    }

    async function toggleFollowUser(token, name) {
        if (!token) return;
        const isFollowed = followedTokenSet.has(token);
        const method = isFollowed ? 'DELETE' : 'POST';

        try {
            const xsrf = getCookie('_xsrf');
            const headers = { 'content-type': 'application/json' };
            if (xsrf) headers['x-xsrftoken'] = xsrf;

            const res = await fetch(`https://www.zhihu.com/api/v4/members/${encodeURIComponent(token)}/followers`, {
                method,
                credentials: 'include',
                headers
            });

            if (res.ok) {
                if (isFollowed) {
                    followedTokenSet.delete(token);
                    showToast(`已取消关注：${name || token}`);
                } else {
                    followedTokenSet.add(token);
                    showToast(`已关注用户：${name || token}`);
                }
                document.querySelectorAll(`.zh-follow-user-btn[data-zh-follow-token="${CSS.escape(token)}"]`).forEach((b) => {
                    const followed = followedTokenSet.has(token);
                    b.textContent = followed ? '已关注' : '+ 关注';
                    b.classList.toggle('is-followed', followed);
                });
            } else {
                showToast(`关注操作失败（HTTP ${res.status}），请确认已登录知乎`);
            }
        } catch {
            showToast('网络请求失败，无法完成关注操作');
        }
    }

    function createFollowButton(token, name) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const followed = followedTokenSet.has(token);
        btn.className = 'zh-follow-user-btn' + (followed ? ' is-followed' : '');
        btn.textContent = followed ? '已关注' : '+ 关注';
        btn.title = `关注 ${name || token}`;
        btn.setAttribute('data-zh-follow-token', token);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFollowUser(token, name);
        });
        return btn;
    }

    function attachBlockButtons() {
        if (!settings.showBlockBtn && !settings.showFollowBtn) return;
        // 1) 作者头部（回答、文章、想法、推荐关注等）
        const authorHeads = document.querySelectorAll('.AuthorInfo-head, .FeedSource-firstline');
        for (const head of authorHeads) {
            const link = head.querySelector('a[href*="/people/"], a[href*="/org/"]');
            if (!link) continue;
            const token = extractUserToken(link.getAttribute('href'));
            if (!token) continue;
            const name = link.textContent.trim();
            const nameWrap = head.querySelector('.AuthorInfo-name') || link;

            if (settings.showBlockBtn && !head.querySelector('.zh-block-user-btn')) {
                nameWrap.insertAdjacentElement('afterend', createBlockButton(token, name));
            }
            if (settings.showFollowBtn && !head.querySelector('.zh-follow-user-btn')) {
                const anchor = head.querySelector('.zh-block-user-btn') || nameWrap;
                anchor.insertAdjacentElement('afterend', createFollowButton(token, name));
            }
        }

        // 2) 评论区用户 ID（兼容新版与旧版评论区）
        const commentUserLinks = document.querySelectorAll(
            '.CommentItemV2-meta a[href*="/people/"], .CommentItemV2-meta a[href*="/org/"], ' +
            '[class*="Comment"] a[href*="/people/"], [class*="Comment"] a[href*="/org/"], ' +
            '.Modal-content a[href*="/people/"], .Modal-content a[href*="/org/"]'
        );
        for (const link of commentUserLinks) {
            const name = link.textContent.trim();
            if (!name) continue;
            const token = extractUserToken(link.getAttribute('href'));
            if (!token) continue;

            if (settings.showBlockBtn) {
                const hasBlock = link.parentElement && link.parentElement.querySelector(`:scope > .zh-block-user-btn[data-zh-block-token="${CSS.escape(token)}"]`);
                if (!hasBlock) {
                    link.insertAdjacentElement('afterend', createBlockButton(token, name));
                }
            }
            if (settings.showFollowBtn) {
                const hasFollow = link.parentElement && link.parentElement.querySelector(`:scope > .zh-follow-user-btn[data-zh-follow-token="${CSS.escape(token)}"]`);
                if (!hasFollow) {
                    const nextBlock = link.nextElementSibling && link.nextElementSibling.classList.contains('zh-block-user-btn')
                        ? link.nextElementSibling
                        : link;
                    nextBlock.insertAdjacentElement('afterend', createFollowButton(token, name));
                }
            }
        }
    }

    // =========================================================================
    // 6. 在“xx人赞同该回答/文章/想法”右边显示发布时间与修改时间 + 5行预览
    // =========================================================================
    function extractContentMeta(itemEl) {
        let id = '';
        let type = '';
        const zopEl = itemEl.closest('[data-zop]') || itemEl.querySelector('[data-zop]') || itemEl;
        if (zopEl && zopEl.getAttribute('data-zop')) {
            try {
                const zop = JSON.parse(zopEl.getAttribute('data-zop'));
                if (zop.itemId) id = String(zop.itemId);
                if (zop.type) type = String(zop.type);
            } catch { /* ignore */ }
        }
        if (!id) {
            const extraEl = itemEl.closest('[data-za-extra-module]') || itemEl.querySelector('[data-za-extra-module]') || itemEl;
            if (extraEl && extraEl.getAttribute('data-za-extra-module')) {
                try {
                    const extra = JSON.parse(extraEl.getAttribute('data-za-extra-module'));
                    const token = extra?.card?.content?.token;
                    const ctype = extra?.card?.content?.type;
                    if (token) id = String(token);
                    if (!type && ctype) type = String(ctype).toLowerCase();
                } catch { /* ignore */ }
            }
        }
        if (!id && itemEl.getAttribute('name') && /^\d+$/.test(itemEl.getAttribute('name'))) {
            id = itemEl.getAttribute('name');
        }
        if (!id || !type) {
            const ansLink = itemEl.querySelector('a[href*="/answer/"]');
            if (ansLink) {
                const m = ansLink.getAttribute('href').match(/\/answer\/(\d+)/);
                if (m) { id = id || m[1]; type = type || 'answer'; }
            }
            const artLink = itemEl.querySelector('a[href*="zhuanlan.zhihu.com/p/"], a[href*="/p/"]');
            if (artLink && !id) {
                const m = artLink.getAttribute('href').match(/\/p\/(\d+)/);
                if (m) { id = m[1]; type = type || 'article'; }
            }
            const pinLink = itemEl.querySelector('a[href*="/pin/"]');
            if (pinLink && !id) {
                const m = pinLink.getAttribute('href').match(/\/pin\/(\d+)/);
                if (m) { id = m[1]; type = type || 'pin'; }
            }
        }
        if (!type) {
            if (itemEl.classList.contains('ArticleItem')) type = 'article';
            else if (itemEl.classList.contains('PinItem')) type = 'pin';
            else type = 'answer';
        }
        return { id, type };
    }

    function getAnswerTimesFromDom(answerEl) {
        let created = '';
        let updated = '';

        const { id: answerId, type } = extractContentMeta(answerEl);
        const cacheKey = answerId ? (answerTimeCache.has(`${type}:${answerId}`) ? `${type}:${answerId}` : answerId) : '';
        if (cacheKey && answerTimeCache.has(cacheKey)) {
            const cached = answerTimeCache.get(cacheKey);
            created = formatTimestamp(cached.created);
            updated = formatTimestamp(cached.updated);
        }

        if (!created) {
            const metaCreated = answerEl.querySelector('meta[itemprop="dateCreated"]');
            if (metaCreated) created = formatTimestamp(metaCreated.getAttribute('content'));
        }
        if (!updated) {
            const metaModified = answerEl.querySelector('meta[itemprop="dateModified"]');
            if (metaModified) updated = formatTimestamp(metaModified.getAttribute('content'));
        }

        if (!created || !updated) {
            const timeCandidates = answerEl.querySelectorAll('.ContentItem-time, .ContentItem-time *, [data-tooltip*="发布于"], [data-tooltip*="编辑于"], a, span, div');
            for (const el of timeCandidates) {
                if (el.children.length > 2) continue;
                const tooltip = el.getAttribute('data-tooltip') || el.getAttribute('title') || el.getAttribute('aria-label') || '';
                const text = el.textContent ? el.textContent.trim() : '';
                if (tooltip.includes('发布于') && !created) {
                    created = formatTimestamp(tooltip) || tooltip.replace(/^发布于\s*/, '').trim();
                }
                if (tooltip.includes('编辑于') && !updated) {
                    updated = formatTimestamp(tooltip) || tooltip.replace(/^编辑于\s*/, '').trim();
                }
                if (text.length <= 40) {
                    if (text.startsWith('发布于') && !created) {
                        created = formatTimestamp(text) || text.replace(/^发布于\s*/, '').trim();
                    } else if (text.startsWith('编辑于') && !updated) {
                        updated = formatTimestamp(text) || text.replace(/^编辑于\s*/, '').trim();
                    }
                }
                if (created && updated) break;
            }
        }

        return { created, updated, answerId, type };
    }

    function fetchAnswerTimeFallback(id, type = 'answer') {
        const key = `${type}:${id}`;
        if (!id || answerTimeCache.has(key) || answerTimeCache.has(id) || pendingAnswerFetchSet.has(key)) return;
        pendingAnswerFetchSet.add(key);

        let apiUrl = `https://www.zhihu.com/api/v4/answers/${encodeURIComponent(id)}?include=created_time,updated_time`;
        if (type === 'article') {
            apiUrl = `https://www.zhihu.com/api/v4/articles/${encodeURIComponent(id)}`;
        } else if (type === 'pin') {
            apiUrl = `https://www.zhihu.com/api/v4/pins/${encodeURIComponent(id)}`;
        }

        fetch(apiUrl, { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) {
                    saveItemMeta(type, id, data);
                    scheduleEnhance();
                }
            })
            .catch(() => {})
            .finally(() => {
                pendingAnswerFetchSet.delete(key);
            });
    }

    function findVotersTargets() {
        const targets = new Set();
        document.querySelectorAll('.Voters').forEach((el) => targets.add(el));

        // 清理跨节点拆分的“航海家 xxx 等 53 人赞同”
        document.querySelectorAll('.Voters, .AnswerItem div, .AnswerItem span, .ContentItem div, .ContentItem span').forEach((el) => {
            if (el.children.length > 3) return;
            const fullTxt = el.textContent.trim();
            if (fullTxt.length < 65 && fullTxt.startsWith('航海家')) {
                const m = fullTxt.match(/^航海家\s+.+?\s*等\s*([\d,.]+\s*[万亿kKwW]?\s*人赞同)/);
                if (m) {
                    el.textContent = `${m[1].trim()}了该回答`;
                }
            }
        });

        if (document.body) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const val = node.nodeValue;
                if (!val) continue;
                const navMatch = val.match(/^航海家\s+.+?\s*等\s*([\d,.]+\s*[万亿kKwW]?\s*人赞同.*)$/);
                if (navMatch) {
                    node.nodeValue = `${navMatch[1].trim()}了该回答`;
                }
                const curVal = node.nodeValue;
                if (!/人赞同了该(?:回答|文章|想法)/.test(curVal) && !/[\d,.]+\s*[万亿kKwW]?\s*人赞同/.test(curVal)) continue;
                const el = node.parentElement;
                if (!el) continue;
                const target = el.closest('.Voters, button, a') || el.closest('span, div');
                if (target && target.textContent.trim().length < 60) {
                    targets.add(target);
                }
            }
        }
        return Array.from(targets);
    }

    function findAnswerContainer(votersEl) {
        const classic = votersEl.closest('.AnswerItem, .ArticleItem, .PinItem, .ContentItem, .TopstoryItem, .List-item');
        if (classic) return classic;

        let curr = votersEl.parentElement;
        for (let i = 0; i < 10 && curr && curr !== document.body; i++) {
            if (curr.querySelector('[data-zop], a[href*="/answer/"], a[href*="/p/"], a[href*="/pin/"], .ContentItem-actions')) {
                return curr;
            }
            curr = curr.parentElement;
        }
        return votersEl.parentElement;
    }

    function attachAnswerTimes() {
        if (!settings.showAnswerTime) return;
        const votersList = findVotersTargets();
        for (const voters of votersList) {
            const parent = voters.parentElement;
            if (!parent) continue;

            const answerEl = findAnswerContainer(voters);
            if (!answerEl) continue;

            const { created, updated, answerId, type } = getAnswerTimesFromDom(answerEl);
            if (!created && !updated) {
                if (answerId) fetchAnswerTimeFallback(answerId, type);
                continue;
            }
            if (answerId && (!created || !updated) && !answerTimeCache.has(`${type}:${answerId}`) && !answerTimeCache.has(answerId)) {
                fetchAnswerTimeFallback(answerId, type);
            }

            const createLabel = type === 'answer' ? '回答于' : '发布于';
            const parts = [];
            if (created) parts.push(`${createLabel} ${created}`);
            if (updated && updated !== created) {
                parts.push(`修改于 ${updated}`);
            } else if (updated && !created) {
                parts.push(`修改于 ${updated}`);
            }
            const nextText = parts.join(' · ');

            const existing = parent.querySelector('.zh-answer-time-meta');
            if (existing) {
                if (existing.textContent !== nextText) {
                    existing.textContent = nextText;
                }
                continue;
            }

            parent.classList.add('zh-voters-wrap');
            const timeSpan = document.createElement('span');
            timeSpan.className = 'zh-answer-time-meta';
            timeSpan.textContent = nextText;
            voters.insertAdjacentElement('afterend', timeSpan);
        }

        // 想法（PinItem）若无“xx人赞同了该想法”，则在作者栏下方补充显示发布/修改时间
        document.querySelectorAll('.PinItem').forEach((pinEl) => {
            if (pinEl.querySelector('.zh-answer-time-meta')) return;
            const metaContainer = pinEl.querySelector('.ContentItem-meta, .PinItem-author');
            if (!metaContainer) return;
            const { created, updated, answerId, type } = getAnswerTimesFromDom(pinEl);
            if (!created && !updated) {
                if (answerId) fetchAnswerTimeFallback(answerId, type || 'pin');
                return;
            }
            const parts = [];
            if (created) parts.push(`发布于 ${created}`);
            if (updated && updated !== created) parts.push(`修改于 ${updated}`);
            const timeSpan = document.createElement('div');
            timeSpan.className = 'zh-answer-time-meta';
            timeSpan.style.marginLeft = '0';
            timeSpan.style.marginTop = '4px';
            timeSpan.textContent = parts.join(' · ');
            metaContainer.appendChild(timeSpan);
        });
    }

    function attachFiveLinePreviews() {
        const collapsedList = document.querySelectorAll('.RichContent.is-collapsed');
        for (const rc of collapsedList) {
            const inner = rc.querySelector('.RichContent-inner');
            const richText = inner ? inner.querySelector('.RichText') : null;
            const existingPreview = inner ? inner.querySelector('.zh-5line-preview') : null;

            if (!inner || !richText) {
                rc.removeAttribute('data-zh-has-preview');
                continue;
            }
            if (existingPreview) {
                rc.setAttribute('data-zh-has-preview', 'true');
                continue;
            }
            // 若此前曾标记但预览节点被 React 重渲染清掉了，先恢复原生摘要显示
            rc.removeAttribute('data-zh-has-preview');

            const itemEl = rc.closest('.AnswerItem, .ArticleItem, .PinItem, .ContentItem, .TopstoryItem, .List-item');
            if (!itemEl) continue;

            const { id, type } = extractContentMeta(itemEl);
            if (!id) continue;

            const fullText = contentPreviewCache.get(`${type}:${id}`) || contentPreviewCache.get(id);
            if (!fullText) {
                if (richText.textContent.trim().length < 180) {
                    fetchAnswerTimeFallback(id, type);
                }
                continue;
            }

            if (fullText.length <= richText.textContent.trim().length + 20) continue;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'zh-5line-preview';
            previewDiv.textContent = fullText;
            if (richText.parentNode) {
                richText.parentNode.insertBefore(previewDiv, richText);
                rc.setAttribute('data-zh-has-preview', 'true');
            }
        }
    }

    // =========================================================================
    // 7. 个人主页（/people/、/org/）：默认展开详细资料、头像放大、隐藏收起按钮、关注私信移至ID右侧
    // =========================================================================
    function isProfilePage() {
        return /^\/(?:people|org)\//.test(location.pathname);
    }

    function adjustProfileHeader() {
        if (!isProfilePage()) return;
        const headerRoot = document.querySelector('#ProfileHeader, .ProfileHeader, [class*="ProfileHeader"]');
        if (!headerRoot) return;

        // 1) 自动展开“查看详细资料”，并隐藏“查看/收起详细资料”按钮（红框4）
        const allButtons = headerRoot.querySelectorAll('button');
        for (const btn of allButtons) {
            const txt = btn.textContent.replace(/\s+/g, '');
            if (txt.includes('查看详细资料')) {
                if (!btn.getAttribute('data-zh-auto-expanded')) {
                    btn.setAttribute('data-zh-auto-expanded', 'true');
                    btn.click();
                }
                btn.setAttribute('data-zh-hide-expand-btn', 'true');
            } else if (txt.includes('收起详细资料')) {
                btn.setAttribute('data-zh-hide-expand-btn', 'true');
            }
        }

        // 2) 标记头像与内容区（红框1：放大头像框，小图居中白底显示不模糊，并调整内容区左边距防遮挡）
        const avatarEl = headerRoot.querySelector('.ProfileHeader-avatar, [class*="ProfileHeader-avatar"]') ||
            headerRoot.querySelector('.UserAvatar');
        if (avatarEl) {
            avatarEl.setAttribute('data-zh-profile-avatar', 'true');
            const img = avatarEl.querySelector('img');
            if (img) {
                const checkAvatarSize = () => {
                    if (img.naturalWidth > 0 && img.naturalWidth < 160) {
                        img.setAttribute('data-zh-small-avatar', 'true');
                    } else {
                        img.removeAttribute('data-zh-small-avatar');
                    }
                };
                if (img.complete) {
                    checkAvatarSize();
                } else {
                    img.addEventListener('load', checkAvatarSize, { once: true });
                }
            }
        }
        const contentEl = headerRoot.querySelector('.ProfileHeader-content, [class*="ProfileHeader-content"]');
        if (contentEl) {
            contentEl.setAttribute('data-zh-profile-content', 'true');
        }

        // 3) 将“关注”和“发私信”按钮移至用户 ID 右侧（红框2 & 3）
        const titleEl = headerRoot.querySelector('.ProfileHeader-title, h1');
        let buttonsEl = headerRoot.querySelector('.ProfileHeader-buttons, .MemberButtonGroup');
        if (!buttonsEl) {
            // 通过“发私信”按钮反向定位按钮组容器
            for (const btn of allButtons) {
                if (btn.textContent.replace(/\s+/g, '').includes('发私信')) {
                    buttonsEl = btn.parentElement;
                    break;
                }
            }
        }

        if (titleEl && buttonsEl && !(buttonsEl.getAttribute('data-zh-moved-buttons') === 'true' && titleEl.contains(buttonsEl))) {
            titleEl.setAttribute('data-zh-profile-title', 'true');
            buttonsEl.setAttribute('data-zh-moved-buttons', 'true');
            titleEl.appendChild(buttonsEl);
        }

        // 3.5) 他人主页：在“关注 / 发私信”右侧添加统一的“屏蔽用户”与“付费咨询”按钮，并将“关注了 / 关注者”移至头像下方
        const isOwnProfile = Array.from(allButtons).some((b) => b.textContent.replace(/\s+/g, '').includes('编辑个人资料'));
        if (!isOwnProfile && buttonsEl && titleEl && titleEl.contains(buttonsEl)) {
            const footerOps = document.querySelectorAll('.Profile-sideColumn .Profile-footerOperations button, .Profile-footerOperations button, .Profile-footerOperations a');
            const nativeBlockBtn = Array.from(footerOps).find((el) => /屏蔽/.test((el.textContent || '').trim()));
            if (nativeBlockBtn) {
                let topBlockBtn = buttonsEl.querySelector('.zh-profile-block-btn');
                if (!topBlockBtn) {
                    topBlockBtn = document.createElement('button');
                    topBlockBtn.type = 'button';
                    topBlockBtn.className = 'Button Button--grey Button--withIcon Button--withLabel zh-profile-block-btn';
                    topBlockBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5ZM3.75 12a8.25 8.25 0 0 1 13.52-6.33l-11.6 11.6A8.215 8.215 0 0 1 3.75 12Zm3.02 6.33 11.6-11.6A8.25 8.25 0 0 1 6.77 18.33Z" clip-rule="evenodd"/></svg><span class="zh-profile-block-label"></span>';
                    topBlockBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentNative = Array.from(
                            document.querySelectorAll('.Profile-sideColumn .Profile-footerOperations button, .Profile-footerOperations button, .Profile-footerOperations a')
                        ).find((el) => /屏蔽/.test((el.textContent || '').trim()));
                        if (currentNative) {
                            currentNative.click();
                            setTimeout(adjustProfileHeader, 150);
                            setTimeout(adjustProfileHeader, 500);
                        }
                    });
                    buttonsEl.appendChild(topBlockBtn);
                }
                const nativeTxt = (nativeBlockBtn.textContent || '').replace(/\s+/g, '');
                const isBlocked = /已屏蔽|取消屏蔽/.test(nativeTxt);
                const labelEl = topBlockBtn.querySelector('.zh-profile-block-label');
                const nextLabel = isBlocked ? '已屏蔽' : '屏蔽用户';
                if (labelEl && labelEl.textContent !== nextLabel) {
                    labelEl.textContent = nextLabel;
                }
                topBlockBtn.classList.toggle('is-blocked', isBlocked);
            }

            // 付费咨询按钮：隐藏右侧付费咨询卡片，并在屏蔽用户右侧添加按钮代理点击
            const sideCards = document.querySelectorAll('.Profile-sideColumn .Card');
            let nativeConsultBtn = null;
            for (const card of sideCards) {
                const headerTxt = (card.querySelector('.Card-headerText')?.textContent || '').trim();
                if (!headerTxt.includes('付费咨询')) continue;
                card.setAttribute('data-zh-hide-consult-card', 'true');
                nativeConsultBtn = Array.from(card.querySelectorAll('button, a')).find((el) => /付费咨询/.test((el.textContent || '').trim()));
                break;
            }
            const existingConsultBtn = buttonsEl.querySelector('.zh-profile-consult-btn');
            if (nativeConsultBtn) {
                if (!existingConsultBtn) {
                    const consultBtn = document.createElement('button');
                    consultBtn.type = 'button';
                    consultBtn.className = 'Button Button--blue Button--withIcon Button--withLabel zh-profile-consult-btn';
                    consultBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.125c5.454 0 9.875 4.421 9.875 9.875v6A3.875 3.875 0 0 1 18 21.875h-6c-5.454 0-9.875-4.421-9.875-9.875S6.546 2.125 12 2.125Zm-1.523 7.253a.875.875 0 1 0-1.194 1.28l1.574 1.467H9.5a.875.875 0 0 0 0 1.75h1.625V15.5a.875.875 0 0 0 1.75 0v-1.625H14.5a.875.875 0 1 0 0-1.75h-1.354l1.573-1.467a.875.875 0 1 0-1.193-1.28L12 10.8l-1.524-1.422Z"/></svg><span>付费咨询</span>';
                    consultBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const cards = document.querySelectorAll('.Profile-sideColumn .Card');
                        for (const c of cards) {
                            const h = (c.querySelector('.Card-headerText')?.textContent || '').trim();
                            if (!h.includes('付费咨询')) continue;
                            const btn = Array.from(c.querySelectorAll('button, a')).find((el) => /付费咨询/.test((el.textContent || '').trim()));
                            if (btn) btn.click();
                            break;
                        }
                    });
                    buttonsEl.appendChild(consultBtn);
                }
            } else if (existingConsultBtn) {
                existingConsultBtn.remove();
            }
        }

        // 3.6) 将右侧“关注了 / 关注者”卡片内容移至头像下方，并隐藏右侧原卡片
        const headerMain = headerRoot.querySelector('.ProfileHeader-main');
        if (headerMain) {
            const followshipCard = document.querySelector('.Profile-sideColumn .FollowshipCard') ||
                Array.from(document.querySelectorAll('.Profile-sideColumn .Card')).find((c) => {
                    const t = c.textContent || '';
                    return t.includes('关注了') && t.includes('关注者');
                });
            if (followshipCard) {
                followshipCard.setAttribute('data-zh-hide-followship-card', 'true');
                const boardItems = Array.from(followshipCard.querySelectorAll('a.NumberBoard-item, a[href*="/following"], a[href*="/followers"]'));
                const parsedItems = [];
                for (const a of boardItems) {
                    const nameEl = a.querySelector('.NumberBoard-itemName');
                    const valEl = a.querySelector('.NumberBoard-itemValue');
                    let label = (nameEl?.textContent || '').trim();
                    let num = (valEl?.textContent || '').trim();
                    if (!label || !num) {
                        const txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
                        const m = txt.match(/(关注了|关注者)\s*([\d,]+)/);
                        if (m) {
                            label = m[1];
                            num = m[2];
                        }
                    }
                    if (label && num) {
                        parsedItems.push({ label, num, href: a.getAttribute('href') || '' });
                    }
                }
                if (parsedItems.length > 0) {
                    let box = headerMain.querySelector('.zh-profile-followship-box');
                    if (!box) {
                        box = document.createElement('div');
                        box.className = 'zh-profile-followship-box';
                        headerMain.appendChild(box);
                    }
                    const nextHtml = parsedItems.map((it) => {
                        const hrefAttr = it.href ? ` href="${it.href}"` : '';
                        return `<a class="zh-profile-followship-item"${hrefAttr}><span class="zh-profile-followship-label">${it.label}</span><span class="zh-profile-followship-num">${it.num}</span></a>`;
                    }).join('');
                    if (box.innerHTML !== nextHtml) {
                        box.innerHTML = nextHtml;
                    }
                    // 动态计算头像底部位置与宽度，避免个人介绍较短时被头像遮挡
                    const avEl = headerMain.querySelector('[data-zh-profile-avatar="true"], .ProfileHeader-avatar, .UserAvatar');
                    const avTop = avEl ? avEl.offsetTop : -57;
                    const avHeight = avEl ? avEl.offsetHeight : (settings.scaleProfileAvatar ? 200 : 160);
                    const avWidth = avEl ? avEl.offsetWidth : (settings.scaleProfileAvatar ? 200 : 160);
                    const boxTop = Math.max(0, avTop + avHeight + 8);
                    box.style.setProperty('top', `${boxTop}px`, 'important');
                    box.style.setProperty('width', `${avWidth}px`, 'important');
                    const boxHeight = box.offsetHeight || 46;
                    headerMain.style.setProperty('min-height', `${boxTop + boxHeight + 8}px`, 'important');
                }
            }
        }

        // 4) 若底部 footer 已空（展开按钮已隐藏且关注/私信已移走），隐藏 footer 减少留白
        const footerEl = headerRoot.querySelector('.ProfileHeader-contentFooter');
        if (footerEl && footerEl.querySelector('[data-zh-hide-expand-btn="true"]') && !footerEl.querySelector('.MemberButtonGroup, .ProfileHeader-buttons')) {
            footerEl.setAttribute('data-zh-profile-footer', 'true');
        }
    }

    // =========================================================================
    // 7.5 右侧栏隐藏 + 顶部栏放大
    // =========================================================================

    function syncQuestionHeaderWidth() {
        const refEl = document.querySelector('.Question-mainColumn .Card, .Question-mainColumn .List-item, .Question-mainColumn');
        if (!refEl) return;
        const refRect = refEl.getBoundingClientRect();
        const w = Math.floor(refRect.width);
        if (w <= 200) return;

        const descEl = document.querySelector('[data-za-detail-view-path-module="QuestionDescription"]');
        const dividerEl = descEl && descEl.nextElementSibling && descEl.nextElementSibling.querySelector('#AnswerFormPortalContainer')
            ? descEl.nextElementSibling
            : document.querySelector('#AnswerFormPortalContainer')?.parentElement;

        const targets = [
            document.querySelector('.QuestionHeader-main'),
            document.querySelector('.QuestionHeader-footer-inner'),
            document.querySelector('.QuestionHeader-footer-main'),
            descEl,
            document.querySelector('[data-zop-question]'),
            dividerEl
        ];
        const seen = new Set();
        for (const el of targets) {
            if (!el || seen.has(el)) continue;
            seen.add(el);

            el.style.setProperty('width', `${w}px`, 'important');
            el.style.setProperty('min-width', '0', 'important');
            el.style.setProperty('max-width', `${w}px`, 'important');
            el.style.setProperty('padding-left', '0', 'important');
            el.style.setProperty('padding-right', '0', 'important');
            el.style.setProperty('flex', '0 0 auto', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');

            // 对齐左边缘：若问题头部与下方回答卡片左边缘存在水平偏移，则补偿 margin-left
            const elRect = el.getBoundingClientRect();
            const deltaLeft = Math.round(refRect.left - elRect.left);
            if (Math.abs(deltaLeft) > 1) {
                const curMarginLeft = parseFloat(window.getComputedStyle(el).marginLeft) || 0;
                el.style.setProperty('margin-left', `${Math.max(0, Math.round(curMarginLeft + deltaLeft))}px`, 'important');
            }
        }
        if (dividerEl) {
            for (const child of dividerEl.children) {
                child.style.setProperty('width', '100%', 'important');
                child.style.setProperty('margin-left', '0', 'important');
                child.style.setProperty('margin-right', '0', 'important');
                child.style.setProperty('padding-left', '0', 'important');
                child.style.setProperty('padding-right', '0', 'important');
            }
        }
    }

    function hideLiuKanshan() {
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        document.querySelectorAll('div, button, a, aside').forEach((el) => {
            if (el.getAttribute('data-zh-hide-kanshan') === 'true') return;
            const style = window.getComputedStyle(el);
            if (style.position !== 'fixed') return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            // 右下角浮动按钮区域（包含 Hi 徽标或“看山”文本/aria-label）
            if (rect.right >= vw - 140 && rect.bottom >= vh - 200 && rect.width <= 140 && rect.height <= 140) {
                const txt = (el.textContent || '').trim();
                const aria = el.getAttribute('aria-label') || '';
                if (txt.includes('Hi') || txt.includes('看山') || aria.includes('看山') || el.querySelector('img[src*="kanshan"], svg')) {
                    // 保留纯“回到顶部”箭头按钮（通常有 title="回到顶部" 或 aria-label="回到顶部"）
                    if (aria.includes('回到顶部') || el.getAttribute('title')?.includes('回到顶部')) return;
                    el.setAttribute('data-zh-hide-kanshan', 'true');
                }
            }
        });
    }

    function hideRightSidebarCards() {
        const rightSide = document.querySelector('.GlobalSideBar, [class*="GlobalSideBar"], .Topstory-rightColumn');
        if (rightSide) {
            rightSide.setAttribute('data-zh-hide-keep-space', 'true');
        }
        // 首页新版结构：.Topstory-mainColumn 的右侧兄弟栏即为右侧边栏（含“分享此刻的想法 / 盐言作者平台 / 大家都在搜”等）
        const mainCol = document.querySelector('.Topstory-mainColumn');
        if (mainCol && mainCol.parentElement) {
            for (const sibling of mainCol.parentElement.children) {
                if (sibling === mainCol) continue;
                if (sibling.getAttribute('data-zh-sidebar-col') === 'true') continue;
                if (sibling.querySelector('[data-zh-sidebar="true"], .Topstory-mainColumn')) continue;
                sibling.setAttribute('data-zh-hide-keep-space', 'true');
            }
        }
        const candidates = document.querySelectorAll('aside, div');
        for (const el of candidates) {
            if (el.getAttribute('data-zh-hide-keep-space') === 'true') continue;
            if (el.closest('[data-zh-sidebar="true"], header, .AppHeader, .Modal, .Popover')) continue;
            if (el.querySelector('.Topstory-mainColumn, .TopstoryItem, .Feed, .ContentItem, .Question-mainColumn, .Profile-mainColumn')) continue;
            const w = el.clientWidth;
            if (w < 200 || w > 420) continue;
            const txt = el.textContent || '';
            if (
                txt.includes('大家都在搜') ||
                txt.includes('盐言作者平台') ||
                (txt.includes('创作中心') && txt.includes('草稿箱')) ||
                (txt.includes('分享此刻的想法') && txt.includes('发想法'))
            ) {
                el.setAttribute('data-zh-hide-keep-space', 'true');
            }
        }
        hideLiuKanshan();
    }

    function enhanceTopHeader() {
        // 顶部“关注 / 推荐 / 热榜”三个标签放大
        const tabLinks = document.querySelectorAll('header a, nav a, .TopstoryTabs a');
        for (const a of tabLinks) {
            const t = a.textContent.trim();
            if (t === '关注' || t === '推荐' || t === '热榜') {
                a.setAttribute('data-zh-top-tab', 'true');
            }
        }
        // 顶部搜索框加高（不左右延长）& 可选关闭预设热点提示
        const searchInputs = document.querySelectorAll('.SearchBar-input, header input[type="search"], header input[role="combobox"]');
        for (const inp of searchInputs) {
            const box = inp.closest('.SearchBar-input') || inp.parentElement;
            if (box) box.setAttribute('data-zh-search-box', 'true');
            const realInput = inp.tagName === 'INPUT' ? inp : inp.querySelector('input');
            if (realInput) {
                const curPh = realInput.getAttribute('placeholder') || '';
                if (curPh && !realInput.dataset.zhOrigPlaceholder) {
                    realInput.dataset.zhOrigPlaceholder = curPh;
                }
                if (settings.hideSearchHotHint) {
                    if (curPh) realInput.setAttribute('placeholder', '');
                    if (!realInput.dataset.zhPhObserverBound) {
                        realInput.dataset.zhPhObserverBound = '1';
                        const phObs = new MutationObserver(() => {
                            if (!settings.hideSearchHotHint) return;
                            const nextPh = realInput.getAttribute('placeholder') || '';
                            if (nextPh) {
                                realInput.dataset.zhOrigPlaceholder = nextPh;
                                realInput.setAttribute('placeholder', '');
                            }
                        });
                        phObs.observe(realInput, { attributes: true, attributeFilter: ['placeholder'] });
                    }
                } else if (!curPh && realInput.dataset.zhOrigPlaceholder) {
                    realInput.setAttribute('placeholder', realInput.dataset.zhOrigPlaceholder);
                }
            }
        }
        // 关闭搜索下拉中的知乎热搜/猜你想搜等预设推荐（不影响输入后的实时搜索联想）
        if (settings.hideSearchHotHint) {
            const menus = document.querySelectorAll('.SearchBar-menu, .Popover-content .Menu, .Popover-content');
            for (const menu of menus) {
                if (menu.getAttribute('data-zh-hide-hot-search') === 'true') continue;
                const txt = menu.textContent || '';
                if (txt.includes('知乎热搜') || txt.includes('猜你想搜') || txt.includes('大家都在搜')) {
                    menu.setAttribute('data-zh-hide-hot-search', 'true');
                }
            }
        } else {
            document.querySelectorAll('[data-zh-hide-hot-search="true"]').forEach((el) => {
                el.removeAttribute('data-zh-hide-hot-search');
            });
        }
    }

    // =========================================================================
    // 7.6 问题页头部改造：xx人已关注、问题日志、添加评论、浏览量前置标签、删邀请回答与底部冗余栏
    // =========================================================================
    function getQuestionId() {
        const m = location.pathname.match(/\/question\/(\d+)/);
        if (m) return m[1];
        const zopEl = document.querySelector('[data-zop-question]');
        if (zopEl) {
            try {
                const zop = JSON.parse(zopEl.getAttribute('data-zop-question') || '{}');
                if (zop.id) return String(zop.id);
            } catch { /* ignore */ }
        }
        return '';
    }

    function enhanceQuestionPageHeader() {
        const qDesc = document.querySelector('[data-za-detail-view-path-module="QuestionDescription"], .QuestionHeader');
        if (!qDesc) return;
        const qId = getQuestionId();
        if (!qId) return;

        // 1) 提取关注人数、浏览量、评论数
        let followerCount = '';
        const metaFollower = document.querySelector('meta[itemprop="zhihu:followerCount"]');
        if (metaFollower && metaFollower.getAttribute('content')) {
            followerCount = metaFollower.getAttribute('content').trim();
        }
        let commentCount = '';
        const metaComment = document.querySelector('meta[itemprop="commentCount"]');
        if (metaComment && metaComment.getAttribute('content')) {
            commentCount = metaComment.getAttribute('content').trim();
        }
        let viewText = '';
        const spans = qDesc.querySelectorAll('span, div, button');
        for (const sp of spans) {
            if (sp.children.length > 2) continue;
            const t = sp.textContent.trim();
            if (!followerCount) {
                const fm = t.match(/^([\d,.]+\s*[万亿]?)\s*关注$/);
                if (fm) followerCount = fm[1].trim();
            }
            if (!viewText) {
                const vm = t.match(/^([\d,.]+\s*[万亿]?\s*浏览)$/);
                if (vm) viewText = vm[1].trim();
            }
            if (!commentCount) {
                const cm = t.match(/^([\d,.]+\s*[万亿]?)\s*条评论$/);
                if (cm) commentCount = cm[1].trim();
            }
        }

        // 2) 将“xx浏览 · xx关注”以更深色标签显示在话题标签最前面
        if (viewText || followerCount) {
            const topicsWrap = qDesc.querySelector('.QuestionHeader-topics, .css-tohka4') ||
                (qDesc.querySelector('.Tag') ? qDesc.querySelector('.Tag').parentElement : null);
            if (topicsWrap) {
                const tagParts = [];
                if (viewText) tagParts.push(viewText);
                if (followerCount) tagParts.push(`${followerCount} 关注`);
                const tagText = tagParts.join(' · ');

                let viewTag = topicsWrap.querySelector('.zh-view-count-tag');
                if (!viewTag) {
                    viewTag = document.createElement('div');
                    viewTag.className = 'Tag zh-view-count-tag';
                    topicsWrap.insertBefore(viewTag, topicsWrap.firstChild);
                }
                if (viewTag.textContent !== tagText) {
                    viewTag.textContent = tagText;
                }
            }
        }

        // 3) 改造操作按钮组顺序与样式：写回答 -> 关注问题/已关注 -> 问题日志 -> x条评论（隐藏邀请回答）
        const btnGroup = qDesc.querySelector('.QuestionButtonGroup');
        if (btnGroup) {
            const writeBtn = btnGroup.querySelector('.WriteAnswerButton') ||
                Array.from(btnGroup.querySelectorAll('button, a')).find((b) => {
                    const t = b.textContent.trim();
                    return t.includes('写回答') || t.includes('编辑回答') || t.includes('查看我的回答');
                });
            const followBtn = btnGroup.querySelector('.FollowButton');

            // 隐藏“邀请回答”按钮
            btnGroup.querySelectorAll('button, a').forEach((b) => {
                if (b.classList.contains('QuestionButtonGroup-invite') || b.textContent.includes('邀请回答')) {
                    b.setAttribute('data-zh-hide-invite', 'true');
                }
            });

            // 找到原生评论按钮用于代理点击
            const nativeCommentBtn = qDesc.querySelector('.QuestionHeader-Comment button') ||
                Array.from(qDesc.querySelectorAll('button')).find((b) => {
                    const t = b.textContent.trim();
                    return (t.includes('条评论') || t === '添加评论') && !b.classList.contains('zh-q-action-btn');
                });

            // 标记按钮顺序：写回答(1) -> 关注问题/已关注(2) -> 问题日志(3) -> x条评论(4)
            if (writeBtn) writeBtn.setAttribute('data-zh-btn-order', '1');
            if (followBtn) followBtn.setAttribute('data-zh-btn-order', '2');

            // 插入“问题日志”按钮（在关注按钮右侧）
            let logBtn = btnGroup.querySelector('.zh-q-log-btn');
            if (!logBtn) {
                logBtn = document.createElement('button');
                logBtn.type = 'button';
                logBtn.className = 'Button Button--grey zh-q-action-btn zh-q-log-btn';
                logBtn.textContent = '问题日志';
                logBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`https://www.zhihu.com/question/${encodeURIComponent(qId)}/log`, '_blank');
                });
                if (followBtn) {
                    followBtn.insertAdjacentElement('afterend', logBtn);
                } else {
                    btnGroup.appendChild(logBtn);
                }
            }

            // 插入“x 条评论”按钮（在问题日志右侧）
            if (nativeCommentBtn) {
                const cmtLabel = `${commentCount || '0'} 条评论`;
                let cmtBtn = btnGroup.querySelector('.zh-q-comment-btn');
                if (!cmtBtn) {
                    cmtBtn = document.createElement('button');
                    cmtBtn.type = 'button';
                    cmtBtn.className = 'Button Button--grey zh-q-action-btn zh-q-comment-btn';
                    cmtBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        nativeCommentBtn.click();
                    });
                    logBtn.insertAdjacentElement('afterend', cmtBtn);
                }
                if (cmtBtn.textContent !== cmtLabel) {
                    cmtBtn.textContent = cmtLabel;
                }
            }

            // 4) 隐藏图4红框部分的底部次要信息栏（兼容兄弟节点与外层父节点结构，保留“收起”按钮）
            const metaContainers = [];
            let sib = btnGroup.nextElementSibling;
            while (sib) {
                metaContainers.push(sib);
                sib = sib.nextElementSibling;
            }
            if (btnGroup.parentElement && btnGroup.parentElement.nextElementSibling) {
                const parentSib = btnGroup.parentElement.nextElementSibling;
                const pTxt = parentSib.textContent || '';
                if (pTxt.includes('好问题') || pTxt.includes('浏览') || pTxt.includes('分享')) {
                    metaContainers.push(parentSib);
                }
            }
            for (const metaRow of metaContainers) {
                for (const child of metaRow.children) {
                    const txt = child.textContent.replace(/\s+/g, '');
                    if (txt.startsWith('收起')) {
                        child.classList.add('zh-keep-collapse');
                        child.removeAttribute('data-zh-hide-q-meta');
                        continue;
                    }
                    child.setAttribute('data-zh-hide-q-meta', 'true');
                }
            }
        }
    }

    // =========================================================================
    // 8. 任意页面：点击左右空白区域展开或折叠回答/问题详情
    // =========================================================================
    function findCollapseButton(itemEl) {
        const buttons = itemEl.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent.replace(/\s+/g, '');
            if (text === '收起' || text === '收起全文' || (text.startsWith('收起') && text.length <= 4)) {
                return btn;
            }
        }
        return null;
    }

    function findExpandButton(itemEl) {
        const moreBtn = itemEl.querySelector('button.ContentItem-more, button.QuestionRichText-more');
        if (moreBtn && !moreBtn.hasAttribute('data-zh-hide-expand-btn')) {
            return moreBtn;
        }
        const buttons = itemEl.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.hasAttribute('data-zh-hide-expand-btn') || btn.classList.contains('zh-q-action-btn')) continue;
            const text = btn.textContent.replace(/\s+/g, '');
            if (text === '阅读全文' || text === '展开阅读全文' || text === '展开全文' || text === '显示全部') {
                return btn;
            }
        }
        return null;
    }

    function setupBlankClickCollapse() {
        if (window.__zhBlankCollapseBound) return;
        window.__zhBlankCollapseBound = true;

        document.addEventListener('click', (e) => {
            if (!settings.enableBlankCollapse) return;
            if (e.button !== 0) return;
            const sel = window.getSelection();
            if (sel && sel.toString().trim().length > 0) return;

            const target = e.target;
            if (!(target instanceof Element)) return;

            // 排除点击在交互控件、弹窗、顶栏、侧栏或回答卡片内部的情况
            if (target.closest(
                'a, button, input, textarea, select, [role="button"], ' +
                '.Modal, .Popover, .AppHeader, ' +
                '[data-zh-sidebar-card], [data-zh-sidebar], ' +
                '[data-za-detail-view-path-module="QuestionDescription"], .QuestionHeader, ' +
                '.ContentItem, .AnswerItem, .ArticleItem, .TopstoryItem, ' +
                '.GlobalSideBar, .Question-sideColumn, .Profile-sideColumn'
            )) {
                return;
            }

            // 收集当前页面中可折叠或可展开的回答或问题详情
            const items = document.querySelectorAll(
                '.AnswerItem, .ContentItem, .TopstoryItem, ' +
                '[data-za-detail-view-path-module="QuestionDescription"], .QuestionHeader'
            );
            let targetItem = null;
            let targetBtn = null;
            let isCollapseAction = false;
            let bestDist = Infinity;
            const vh = window.innerHeight || document.documentElement.clientHeight;

            for (const item of items) {
                const collapseBtn = findCollapseButton(item);
                const expandBtn = collapseBtn ? null : findExpandButton(item);
                const btn = collapseBtn || expandBtn;
                if (!btn) continue;

                const rect = item.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                // 确认点击位置在回答卡片的左侧或右侧空白处
                if (e.clientX >= rect.left && e.clientX <= rect.right) continue;

                // 优先匹配纵向包含点击 Y 坐标的回答
                if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    targetItem = item;
                    targetBtn = btn;
                    isCollapseAction = Boolean(collapseBtn);
                    break;
                }

                // 否则匹配视口内距离点击 Y 坐标最近的回答
                if (rect.bottom > 0 && rect.top < vh) {
                    const dist = Math.min(Math.abs(e.clientY - rect.top), Math.abs(e.clientY - rect.bottom));
                    if (dist < bestDist) {
                        bestDist = dist;
                        targetItem = item;
                        targetBtn = btn;
                        isCollapseAction = Boolean(collapseBtn);
                    }
                }
            }

            if (targetBtn && targetItem) {
                const rectBefore = targetItem.getBoundingClientRect();
                targetBtn.click();
                // 若折叠前回答顶部已滚出视口上方，则平滑回到该回答顶部，避免迷失位置
                if (isCollapseAction && rectBefore.top < 60) {
                    requestAnimationFrame(() => {
                        const rectAfter = targetItem.getBoundingClientRect();
                        if (rectAfter.top < 60) {
                            window.scrollBy({ top: rectAfter.top - 72, behavior: 'smooth' });
                        }
                    });
                }
            }
        }, false);
    }

    // =========================================================================
    // 8.5 写文章页（zhuanlan.zhihu.com）：标题栏支持粘贴图片直接设为文章封面
    // =========================================================================
    function findCoverFileInput() {
        const labelEl = Array.from(document.querySelectorAll('div, span, button, label')).find((el) => {
            if (el.children.length > 3) return false;
            const t = (el.textContent || '').trim();
            return t === '添加文章封面' || t === '添加封面';
        });
        if (labelEl) {
            let curr = labelEl;
            for (let i = 0; i < 6 && curr && curr !== document.body; i++) {
                const inp = curr.querySelector('input[type="file"]');
                if (inp) return inp;
                curr = curr.parentElement;
            }
        }
        const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        return allInputs.find((inp) => !inp.closest('.Editable') && !inp.closest('.AnswerFormEditorContainer')) || null;
    }

    function enhanceArticleTitlePasteCover() {
        if (!location.hostname.includes('zhuanlan.zhihu.com')) return;
        const titleInput = document.querySelector('textarea[placeholder*="请输入标题"], input[placeholder*="请输入标题"]');
        if (!titleInput) return;

        if (!titleInput.getAttribute('data-zh-cover-paste-bound')) {
            titleInput.setAttribute('data-zh-cover-paste-bound', 'true');
            const oldPh = titleInput.getAttribute('placeholder') || '请输入标题（最多 100 个字）';
            if (!oldPh.includes('粘贴图片')) {
                titleInput.setAttribute('placeholder', oldPh.replace(/）$/, '，粘贴图片可设为封面）'));
                if (!titleInput.getAttribute('placeholder').includes('粘贴图片')) {
                    titleInput.setAttribute('placeholder', `${oldPh}（粘贴图片可设为封面）`);
                }
            }

            titleInput.addEventListener('paste', (e) => {
                const dt = e.clipboardData;
                if (!dt) return;
                let imageFile = null;
                if (dt.items) {
                    for (const item of dt.items) {
                        if (item.kind === 'file' && item.type.startsWith('image/')) {
                            imageFile = item.getAsFile();
                            break;
                        }
                    }
                }
                if (!imageFile && dt.files && dt.files.length > 0) {
                    for (const f of dt.files) {
                        if (f.type && f.type.startsWith('image/')) {
                            imageFile = f;
                            break;
                        }
                    }
                }
                if (!imageFile) return;

                e.preventDefault();
                e.stopPropagation();

                const coverInput = findCoverFileInput();
                if (!coverInput) {
                    showToast('未找到文章封面上传框，请展开底部发布设置后重试');
                    return;
                }
                const transfer = new DataTransfer();
                transfer.items.add(imageFile);
                coverInput.files = transfer.files;
                coverInput.dispatchEvent(new Event('change', { bubbles: true }));
                showToast('已将粘贴的图片设为文章封面');
            });
        }
    }

    // =========================================================================
    // 9. 偏好设置页内嵌脚本设置与主循环监听
    // =========================================================================
    function applySettingsClasses() {
        if (!document.body) return;
        document.body.classList.toggle('zh-off-block', !settings.showBlockBtn);
        document.body.classList.toggle('zh-off-follow', !settings.showFollowBtn);
        document.body.classList.toggle('zh-off-time', !settings.showAnswerTime);
        document.body.classList.toggle('zh-off-view-tag', !settings.showViewTag);
        document.body.classList.toggle('zh-blue-view-tag', !!settings.blueViewTag);
        document.body.classList.toggle('zh-disable-entity-ai', !!settings.disableEntityAiLink);
        document.body.classList.toggle('zh-scale-profile-avatar', !!settings.scaleProfileAvatar);
        document.body.classList.toggle('zh-full-profile-cover', !!settings.fullProfileCover);
        document.body.classList.toggle('zh-hide-search-hot-hint', !!settings.hideSearchHotHint);
        document.body.classList.toggle('zh-messages-embed', isMessagesEmbedMode());
        updateAutoSidebarCollapse();
        const avatarBg = settings.profileAvatarBg || 'mosaic';
        document.body.classList.toggle('zh-avatar-bg-mosaic', avatarBg === 'mosaic');
        if (avatarBg !== 'mosaic') {
            document.body.style.setProperty('--zh-avatar-bg', avatarBg);
        } else {
            document.body.style.removeProperty('--zh-avatar-bg');
        }
        const mSize = Math.max(4, Math.min(64, Number(settings.profileAvatarMosaicSize) || 16));
        const mHalf = mSize / 2;
        document.body.style.setProperty('--zh-mosaic-size', `${mSize}px`);
        document.body.style.setProperty('--zh-mosaic-half', `${mHalf}px`);
        document.body.style.setProperty('--zh-mosaic-neg-half', `${-mHalf}px`);
        document.body.style.setProperty('--zh-mosaic-color', settings.profileAvatarMosaicColor || '#e5e7eb');
        document.body.style.setProperty('--zh-mosaic-base', settings.profileAvatarMosaicBg || '#ffffff');
    }

    function openScriptSettingsPage() {
        if (location.pathname.startsWith('/settings/preference')) {
            const sec = document.getElementById('zh-preference-settings-section');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        window.open('https://www.zhihu.com/settings/preference', '_blank');
    }

    function injectPreferenceSettings() {
        if (!location.pathname.startsWith('/settings/preference')) return;
        if (document.getElementById('zh-preference-settings-section')) return;

        // 精准定位 #SettingsMain 内部“摘录到百科”或“快捷键”所在的偏好行（与 .RecommendEnginePreference 同级）
        const settingsRoot = document.getElementById('SettingsMain') || document;
        const heading = Array.from(settingsRoot.querySelectorAll('h3')).find((h) => {
            const t = h.textContent.trim();
            return t === '摘录到百科' || t === '快捷键';
        });
        if (!heading) return;

        let anchorItem = heading;
        while (anchorItem.parentElement && anchorItem.parentElement !== settingsRoot) {
            if (anchorItem.parentElement.querySelector('.RecommendEnginePreference') ||
                anchorItem.parentElement.previousElementSibling?.classList.contains('SettingsNav')) {
                break;
            }
            anchorItem = anchorItem.parentElement;
        }
        if (!anchorItem || !anchorItem.parentElement) return;

        const section = document.createElement('div');
        section.id = 'zh-preference-settings-section';

        const toggleDefs = [
            { key: 'showBlockBtn', label: '作者/评论 ID 旁显示「屏蔽用户」按钮', desc: '在回答、文章作者及评论区用户名右侧添加屏蔽用户按钮' },
            { key: 'showFollowBtn', label: '作者/评论 ID 旁显示「+ 关注」按钮', desc: '在作者及评论区用户名右侧额外添加关注/取消关注按钮' },
            { key: 'showAnswerTime', label: '赞同数旁显示回答/修改时间', desc: '在「xx 人赞同了该回答/文章/想法」右侧显示发布与修改时间' },
            { key: 'enableBlankCollapse', label: '点击左右空白区域展开/折叠回答或问题', desc: '单击回答或问题详情左右两侧空白处，可快速展开或收起内容' },
            { key: 'showViewTag', label: '问题顶部显示「浏览 · 关注」标签', desc: '将问题浏览数与关注数以标签形式前置显示在话题标签最前面' },
            { key: 'blueViewTag', label: '问题顶部「浏览 · 关注」标签改为蓝底白字', desc: '开启后该标签将使用知乎主题蓝底白字高亮显示' },
            { key: 'defaultCloseAiAssistant', label: '默认不展开创作助手', desc: '打开写回答时默认关闭右侧创作助手面板（点击顶栏「助手」可随时展开）' },
            { key: 'disableEntityAiLink', label: '关闭正文 AI 词条（直答/看山）高亮链接', desc: '隐藏正文词语旁的四角星图标并取消蓝色高亮与点击跳转，恢复为普通文本' },
            { key: 'scaleProfileAvatar', label: '完整显示个人主页头像（不裁切）', desc: '开启后按原图比例完整居中显示个人主页头像，不再裁剪边缘（默认关闭保持原生样式）' },
            { key: 'fullProfileCover', label: '完整显示个人主页顶部海报（封面图）', desc: '开启后不再裁剪个人主页顶部自定义海报图片，按原图比例完整显示（头像会轻微遮挡左下角）' },
            { key: 'hideSearchHotHint', label: '隐藏搜索框预设热点提示', desc: '开启后清空顶部搜索框的默认热搜词提示，并隐藏下拉弹窗中的知乎热搜/猜你想搜推荐（默认关闭）' }
        ];

        let avatarBgRow = null;
        for (const def of toggleDefs) {
            const row = document.createElement('div');
            row.className = 'zh-pref-row';

            const info = document.createElement('div');
            info.className = 'zh-pref-info';
            const title = document.createElement('div');
            title.className = 'zh-pref-title';
            title.textContent = def.label;
            const desc = document.createElement('div');
            desc.className = 'zh-pref-desc';
            desc.textContent = def.desc;
            info.appendChild(title);
            info.appendChild(desc);

            const switchLabel = document.createElement('label');
            switchLabel.className = 'zh-switch';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!settings[def.key];
            cb.addEventListener('change', () => {
                settings[def.key] = cb.checked;
                saveSettings(settings);
                applySettingsClasses();
                if (def.key === 'scaleProfileAvatar' && avatarBgRow) {
                    avatarBgRow.style.display = cb.checked ? 'flex' : 'none';
                }
                scheduleEnhance();
            });
            const slider = document.createElement('span');
            slider.className = 'zh-switch-slider';
            switchLabel.appendChild(cb);
            switchLabel.appendChild(slider);

            row.appendChild(info);
            row.appendChild(switchLabel);
            section.appendChild(row);

            if (def.key === 'scaleProfileAvatar') {
                avatarBgRow = document.createElement('div');
                avatarBgRow.className = 'zh-pref-row';
                avatarBgRow.style.cssText = `padding-left: 16px; display: ${settings.scaleProfileAvatar ? 'flex' : 'none'}; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap;`;

                const bgInfo = document.createElement('div');
                bgInfo.className = 'zh-pref-info';
                bgInfo.innerHTML = '<div class="zh-pref-title">头像留白背景样式</div><div class="zh-pref-desc">当头像非正方形或需要留白填充时，可选「马赛克」（自定义格子大小与双色）或「纯色」</div>';

                const bgControls = document.createElement('div');
                bgControls.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 8px;';

                const typeRow = document.createElement('div');
                typeRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
                const mosaicSubRow = document.createElement('div');
                mosaicSubRow.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;';
                const solidSubRow = document.createElement('div');
                solidSubRow.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;';

                const makeChipBtn = (label) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.style.cssText = 'height: 26px; padding: 0 10px; font-size: 12px; border: 1px solid #d0d7de; border-radius: 4px; background: transparent; cursor: pointer;';
                    return b;
                };
                const setChipActive = (btn, active) => {
                    btn.style.borderColor = active ? '#1772f6' : '#d0d7de';
                    btn.style.color = active ? '#1772f6' : 'inherit';
                    btn.style.fontWeight = active ? '600' : '400';
                };

                const mosaicModeBtn = makeChipBtn('1. 马赛克');
                const solidModeBtn = makeChipBtn('2. 纯色');
                typeRow.appendChild(mosaicModeBtn);
                typeRow.appendChild(solidModeBtn);

                // 马赛克子类：大小 + 格子色 + 底色
                const sizePresets = [
                    { size: 8, label: '小' },
                    { size: 16, label: '中' },
                    { size: 24, label: '大' },
                    { size: 32, label: '超大' }
                ];
                const sizeBtns = sizePresets.map(({ size, label }) => {
                    const b = makeChipBtn(label);
                    b.addEventListener('click', () => {
                        settings.profileAvatarBg = 'mosaic';
                        settings.profileAvatarMosaicSize = size;
                        saveSettings(settings);
                        applySettingsClasses();
                        syncBgControls();
                    });
                    mosaicSubRow.appendChild(b);
                    return { btn: b, size };
                });

                const makeColorPicker = (titleText, initialVal, onChange) => {
                    const wrap = document.createElement('label');
                    wrap.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #646973; cursor: pointer;';
                    wrap.title = titleText;
                    const txt = document.createElement('span');
                    txt.textContent = titleText;
                    const inp = document.createElement('input');
                    inp.type = 'color';
                    inp.value = /^#[0-9a-f]{6}$/i.test(initialVal || '') ? initialVal : '#ffffff';
                    inp.style.cssText = 'width: 24px; height: 24px; padding: 0; border: 1px solid #d0d7de; border-radius: 4px; cursor: pointer; background: transparent;';
                    inp.addEventListener('input', () => onChange(inp.value));
                    wrap.appendChild(txt);
                    wrap.appendChild(inp);
                    return { wrap, inp };
                };

                const mosaicColorPicker = makeColorPicker('格子色', settings.profileAvatarMosaicColor || '#e5e7eb', (v) => {
                    settings.profileAvatarBg = 'mosaic';
                    settings.profileAvatarMosaicColor = v;
                    saveSettings(settings);
                    applySettingsClasses();
                });
                const mosaicBasePicker = makeColorPicker('底色', settings.profileAvatarMosaicBg || '#ffffff', (v) => {
                    settings.profileAvatarBg = 'mosaic';
                    settings.profileAvatarMosaicBg = v;
                    saveSettings(settings);
                    applySettingsClasses();
                });
                mosaicSubRow.appendChild(mosaicColorPicker.wrap);
                mosaicSubRow.appendChild(mosaicBasePicker.wrap);

                // 纯色子类：预设 + 颜色选择器
                const solidPresets = [
                    { val: '#ffffff', label: '纯白' },
                    { val: '#f4f6f9', label: '浅灰' },
                    { val: '#191b1f', label: '深黑' }
                ];
                const solidBtns = solidPresets.map(({ val, label }) => {
                    const b = makeChipBtn(label);
                    b.addEventListener('click', () => {
                        settings.profileAvatarBg = val;
                        saveSettings(settings);
                        applySettingsClasses();
                        syncBgControls();
                    });
                    solidSubRow.appendChild(b);
                    return { btn: b, val };
                });
                const solidColorPicker = makeColorPicker('自定义', (settings.profileAvatarBg && settings.profileAvatarBg !== 'mosaic') ? settings.profileAvatarBg : '#ffffff', (v) => {
                    settings.profileAvatarBg = v;
                    saveSettings(settings);
                    applySettingsClasses();
                    syncBgControls();
                });
                solidSubRow.appendChild(solidColorPicker.wrap);

                function syncBgControls() {
                    const cur = settings.profileAvatarBg || 'mosaic';
                    const isMosaic = cur === 'mosaic';
                    setChipActive(mosaicModeBtn, isMosaic);
                    setChipActive(solidModeBtn, !isMosaic);
                    mosaicSubRow.style.display = isMosaic ? 'flex' : 'none';
                    solidSubRow.style.display = isMosaic ? 'none' : 'flex';

                    const curSize = Number(settings.profileAvatarMosaicSize) || 16;
                    sizeBtns.forEach(({ btn, size }) => setChipActive(btn, curSize === size));
                    solidBtns.forEach(({ btn, val }) => setChipActive(btn, !isMosaic && cur.toLowerCase() === val.toLowerCase()));
                    if (!isMosaic && /^#[0-9a-f]{6}$/i.test(cur)) {
                        solidColorPicker.inp.value = cur;
                    }
                }

                mosaicModeBtn.addEventListener('click', () => {
                    settings.profileAvatarBg = 'mosaic';
                    saveSettings(settings);
                    applySettingsClasses();
                    syncBgControls();
                });
                solidModeBtn.addEventListener('click', () => {
                    if (!settings.profileAvatarBg || settings.profileAvatarBg === 'mosaic') {
                        settings.profileAvatarBg = solidColorPicker.inp.value || '#ffffff';
                    }
                    saveSettings(settings);
                    applySettingsClasses();
                    syncBgControls();
                });

                bgControls.appendChild(typeRow);
                bgControls.appendChild(mosaicSubRow);
                bgControls.appendChild(solidSubRow);
                syncBgControls();

                avatarBgRow.appendChild(bgInfo);
                avatarBgRow.appendChild(bgControls);
                section.appendChild(avatarBgRow);
            }
        }

        // 左侧栏按钮显示与排序
        const sidebarBox = document.createElement('div');
        sidebarBox.className = 'zh-pref-sidebar-box';
        const sbHeader = document.createElement('div');
        sbHeader.className = 'zh-pref-info';
        sbHeader.innerHTML = '<div class="zh-pref-title">左侧栏按钮显示与排序</div><div class="zh-pref-desc">勾选控制显示或隐藏（隐藏项自动归入下方），拖拽卡片即可自由调整顺序，支持新增与删除分隔线</div>';
        sidebarBox.appendChild(sbHeader);

        const sortList = document.createElement('div');
        sortList.className = 'zh-sidebar-sort-list';

        function groupSidebarItemsByVisibility() {
            const visibleItems = settings.sidebarItems.filter((x) => x.visible !== false);
            const hiddenItems = settings.sidebarItems.filter((x) => x.visible === false);
            settings.sidebarItems = [...visibleItems, ...hiddenItems];
        }
        groupSidebarItemsByVisibility();

        let dragSrcIdx = -1;
        function renderSortList() {
            sortList.innerHTML = '';
            const clearDragMarks = () => {
                sortList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            };

            settings.sidebarItems.forEach((item, idx) => {
                const isHidden = item.visible === false;
                const row = document.createElement('div');
                row.className = 'zh-sidebar-sort-item' + (isHidden ? ' is-hidden-item' : '');
                row.draggable = true;

                row.addEventListener('dragstart', (e) => {
                    dragSrcIdx = idx;
                    row.classList.add('is-dragging');
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(idx));
                    }
                });
                row.addEventListener('dragend', () => {
                    dragSrcIdx = -1;
                    row.classList.remove('is-dragging');
                    clearDragMarks();
                });
                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (dragSrcIdx === -1 || dragSrcIdx === idx) return;
                    clearDragMarks();
                    const rect = row.getBoundingClientRect();
                    const insertAfter = e.clientY > rect.top + rect.height / 2;
                    row.classList.add(insertAfter ? 'drag-over-bottom' : 'drag-over-top');
                });
                row.addEventListener('dragleave', () => {
                    row.classList.remove('drag-over-top', 'drag-over-bottom');
                });
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const rect = row.getBoundingClientRect();
                    const insertAfter = e.clientY > rect.top + rect.height / 2;
                    clearDragMarks();
                    if (dragSrcIdx === -1 || dragSrcIdx === idx) return;

                    const arr = settings.sidebarItems;
                    const [moved] = arr.splice(dragSrcIdx, 1);
                    let targetIdx = idx;
                    if (dragSrcIdx < idx) targetIdx -= 1;
                    if (insertAfter) targetIdx += 1;
                    arr.splice(targetIdx, 0, moved);

                    groupSidebarItemsByVisibility();
                    saveSettings(settings);
                    renderSortList();
                    applySidebarOrderAndVisibility();
                });

                const left = document.createElement('label');
                left.className = 'zh-sidebar-sort-left';
                const handle = document.createElement('span');
                handle.className = 'zh-drag-handle';
                handle.textContent = '⋮⋮';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = !isHidden;
                cb.addEventListener('change', () => {
                    item.visible = cb.checked;
                    groupSidebarItemsByVisibility();
                    saveSettings(settings);
                    renderSortList();
                    applySidebarOrderAndVisibility();
                });
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.label;
                left.appendChild(handle);
                left.appendChild(cb);
                left.appendChild(nameSpan);

                const btns = document.createElement('div');
                btns.className = 'zh-sidebar-sort-btns';
                if (item.kind === 'divider') {
                    const delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = 'zh-sort-btn';
                    delBtn.textContent = '删除';
                    delBtn.style.color = '#e64545';
                    delBtn.addEventListener('click', () => {
                        settings.sidebarItems.splice(idx, 1);
                        saveSettings(settings);
                        renderSortList();
                        applySidebarOrderAndVisibility();
                    });
                    btns.appendChild(delBtn);
                }
                row.appendChild(left);
                row.appendChild(btns);
                sortList.appendChild(row);
            });
        }
        renderSortList();
        sidebarBox.appendChild(sortList);

        const addDividerBtn = document.createElement('button');
        addDividerBtn.type = 'button';
        addDividerBtn.className = 'zh-sort-btn';
        addDividerBtn.style.alignSelf = 'flex-start';
        addDividerBtn.style.padding = '5px 12px';
        addDividerBtn.textContent = '+ 新增分隔线';
        addDividerBtn.addEventListener('click', () => {
            settings.sidebarItems.push({
                id: `divider-${Date.now()}`,
                label: '── 分隔线 ──',
                visible: true,
                kind: 'divider'
            });
            saveSettings(settings);
            renderSortList();
            applySidebarOrderAndVisibility();
        });
        sidebarBox.appendChild(addDividerBtn);

        // 私信分组排序与消息接收设置
        const chatBox = document.createElement('div');
        chatBox.className = 'zh-pref-row';
        chatBox.style.flexDirection = 'column';
        chatBox.style.alignItems = 'stretch';
        chatBox.style.gap = '10px';
        chatBox.style.marginTop = '12px';
        chatBox.innerHTML = `
            <div class="zh-pref-info">
                <div class="zh-pref-title">私信分组排序与消息接收</div>
                <div class="zh-pref-desc">调整私信左侧「最近联系」「互相关注」及自定义分类的排列顺序；取消勾选「接受消息」将自动已读并隐藏该分类成员的私信提醒</div>
            </div>
        `;
        const chatOrderList = document.createElement('div');
        chatOrderList.className = 'zh-sidebar-sort-list';

        function syncChatGroupOrder() {
            if (!Array.isArray(settings.chatGroupOrder)) settings.chatGroupOrder = ['__recent__', '__friends__'];
            const validIds = new Set(['__recent__', '__friends__', ...(settings.chatCategories || []).map((c) => c.id)]);
            settings.chatGroupOrder = settings.chatGroupOrder.filter((id) => validIds.has(id));
            validIds.forEach((id) => {
                if (!settings.chatGroupOrder.includes(id)) settings.chatGroupOrder.push(id);
            });
        }

        function renderChatGroupList() {
            syncChatGroupOrder();
            chatOrderList.innerHTML = '';
            const catMap = new Map((settings.chatCategories || []).map((c) => [c.id, c]));
            settings.chatGroupOrder.forEach((gid, idx) => {
                const row = document.createElement('div');
                row.className = 'zh-sidebar-sort-row';
                const isNative = gid === '__recent__' || gid === '__friends__';
                const cat = isNative ? null : catMap.get(gid);
                const labelText = gid === '__recent__' ? '最近联系（原生）' : (gid === '__friends__' ? '互相关注（原生）' : `${cat?.name || gid}（自定义 · ${(cat?.users || []).length}人）`);

                const left = document.createElement('label');
                left.className = 'zh-sidebar-sort-left';
                if (!isNative && cat) {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = cat.acceptMessages !== false;
                    cb.addEventListener('change', () => {
                        cat.acceptMessages = cb.checked;
                        saveSettings(settings);
                    });
                    left.appendChild(cb);
                }
                const nameSpan = document.createElement('span');
                nameSpan.textContent = labelText + (!isNative && cat && cat.acceptMessages === false ? ' [不接受消息]' : (!isNative ? ' [接受消息]' : ''));
                left.appendChild(nameSpan);

                const btns = document.createElement('div');
                btns.className = 'zh-sidebar-sort-btns';
                const defLabel = document.createElement('label');
                defLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#646464;cursor:pointer;margin-right:6px;';
                const defRadio = document.createElement('input');
                defRadio.type = 'radio';
                defRadio.name = 'zh_default_chat_group';
                defRadio.checked = (settings.defaultChatGroup || '__recent__') === gid;
                defRadio.addEventListener('change', () => {
                    settings.defaultChatGroup = gid;
                    saveSettings(settings);
                });
                defLabel.appendChild(defRadio);
                defLabel.appendChild(document.createTextNode('默认展开'));
                btns.appendChild(defLabel);

                const upBtn = document.createElement('button');
                upBtn.type = 'button';
                upBtn.className = 'zh-sort-btn';
                upBtn.textContent = '↑';
                upBtn.disabled = idx === 0;
                upBtn.addEventListener('click', () => {
                    if (idx === 0) return;
                    const arr = settings.chatGroupOrder;
                    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                    saveSettings(settings);
                    renderChatGroupList();
                });
                const downBtn = document.createElement('button');
                downBtn.type = 'button';
                downBtn.className = 'zh-sort-btn';
                downBtn.textContent = '↓';
                downBtn.disabled = idx === settings.chatGroupOrder.length - 1;
                downBtn.addEventListener('click', () => {
                    const arr = settings.chatGroupOrder;
                    if (idx >= arr.length - 1) return;
                    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                    saveSettings(settings);
                    renderChatGroupList();
                });
                btns.appendChild(upBtn);
                btns.appendChild(downBtn);

                row.appendChild(left);
                row.appendChild(btns);
                chatOrderList.appendChild(row);
            });
        }
        renderChatGroupList();
        chatBox.appendChild(chatOrderList);

        // 私信机器人常用回复预设
        const quickBox = document.createElement('div');
        quickBox.className = 'zh-pref-row';
        quickBox.style.flexDirection = 'column';
        quickBox.style.alignItems = 'stretch';
        quickBox.style.gap = '8px';
        quickBox.style.marginTop = '12px';
        quickBox.innerHTML = `
            <div class="zh-pref-info">
                <div class="zh-pref-title">私信常用回复预设（机器人按钮）</div>
                <div class="zh-pref-desc">仅有一条预设时点击聊天框机器人按钮直接填入；有多条时弹出选择菜单（也可在聊天框右键机器人按钮快捷管理）</div>
            </div>
        `;
        const quickListEl = document.createElement('div');
        quickListEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
        function renderQuickRepliesPref() {
            quickListEl.innerHTML = '';
            const arr = Array.isArray(settings.chatQuickReplies) && settings.chatQuickReplies.length > 0
                ? settings.chatQuickReplies
                : ['人工客服'];
            settings.chatQuickReplies = arr;
            arr.forEach((txt, idx) => {
                const chip = document.createElement('span');
                chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d0d7de;border-radius:14px;font-size:12.5px;';
                chip.textContent = txt;
                if (arr.length > 1) {
                    const del = document.createElement('button');
                    del.type = 'button';
                    del.textContent = '×';
                    del.style.cssText = 'border:none;background:transparent;color:#8491a5;cursor:pointer;padding:0;font-size:13px;';
                    del.addEventListener('click', () => {
                        arr.splice(idx, 1);
                        saveSettings(settings);
                        renderQuickRepliesPref();
                    });
                    chip.appendChild(del);
                }
                quickListEl.appendChild(chip);
            });
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'zh-sort-btn';
            addBtn.textContent = '+ 添加预设';
            addBtn.addEventListener('click', () => {
                showZhDialog({
                    title: '添加常用回复预设',
                    placeholder: '请输入常用内容',
                    confirmText: '添加',
                    onConfirm: (val) => {
                        if (!arr.includes(val)) {
                            arr.push(val);
                            saveSettings(settings);
                            renderQuickRepliesPref();
                        }
                    }
                });
            });
            quickListEl.appendChild(addBtn);
        }
        renderQuickRepliesPref();
        quickBox.appendChild(quickListEl);

        // 配置导入与导出
        const backupBox = document.createElement('div');
        backupBox.className = 'zh-pref-row';
        backupBox.style.cssText = 'margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;';
        const backupInfo = document.createElement('div');
        backupInfo.className = 'zh-pref-info';
        backupInfo.innerHTML = '<div class="zh-pref-title">配置导入与导出</div><div class="zh-pref-desc">将当前所有脚本开关、侧栏排序、私信分类与常用回复等设置导出为 JSON 文件备份，或从备份文件恢复</div>';

        const backupControls = document.createElement('div');
        backupControls.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
        const backupMsg = document.createElement('span');
        backupMsg.style.cssText = 'font-size: 12px; color: #1772f6;';

        const makeBackupBtn = (text) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'zh-sort-btn';
            b.style.cssText = 'padding: 5px 12px; font-size: 12.5px;';
            b.textContent = text;
            return b;
        };

        const exportFileBtn = makeBackupBtn('导出配置 (JSON)');
        exportFileBtn.addEventListener('click', () => {
            const payload = {
                app: 'zhihu-enhancer',
                exportedAt: new Date().toISOString(),
                settings
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zhihu-enhancer-settings-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            backupMsg.textContent = '已导出配置文件';
            setTimeout(() => { backupMsg.textContent = ''; }, 2500);
        });

        const copyJsonBtn = makeBackupBtn('复制 JSON');
        copyJsonBtn.addEventListener('click', async () => {
            const payload = {
                app: 'zhihu-enhancer',
                exportedAt: new Date().toISOString(),
                settings
            };
            try {
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                backupMsg.textContent = '已复制到剪贴板';
            } catch {
                backupMsg.textContent = '复制失败，请使用导出文件';
            }
            setTimeout(() => { backupMsg.textContent = ''; }, 2500);
        });

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.display = 'none';
        const applyImportedObject = (rawObj) => {
            const imported = (rawObj && typeof rawObj === 'object' && rawObj.settings && typeof rawObj.settings === 'object')
                ? rawObj.settings
                : rawObj;
            if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
                throw new Error('无效的配置格式');
            }
            const next = Object.assign({}, DEFAULT_SETTINGS, imported);
            saveSettings(next);
            settings = loadSettings();
            applySettingsClasses();
            applySidebarOrderAndVisibility();
            section.remove();
            openScriptSettingsPage();
        };
        importInput.addEventListener('change', () => {
            const file = importInput.files && importInput.files[0];
            importInput.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result || ''));
                    applyImportedObject(parsed);
                } catch {
                    backupMsg.style.color = '#e64545';
                    backupMsg.textContent = '导入失败：JSON 格式无效';
                    setTimeout(() => { backupMsg.textContent = ''; backupMsg.style.color = '#1772f6'; }, 3000);
                }
            };
            reader.readAsText(file, 'utf-8');
        });

        const importFileBtn = makeBackupBtn('导入配置 (JSON)');
        importFileBtn.addEventListener('click', () => importInput.click());

        backupControls.appendChild(backupMsg);
        backupControls.appendChild(exportFileBtn);
        backupControls.appendChild(copyJsonBtn);
        backupControls.appendChild(importFileBtn);
        backupControls.appendChild(importInput);
        backupBox.appendChild(backupInfo);
        backupBox.appendChild(backupControls);

        section.appendChild(sidebarBox);
        section.appendChild(chatBox);
        section.appendChild(quickBox);
        section.appendChild(backupBox);
        anchorItem.insertAdjacentElement('afterend', section);
    }

    let menuRegistered = false;
    function registerSettingsMenu() {
        if (menuRegistered || typeof GM_registerMenuCommand !== 'function') return;
        menuRegistered = true;
        GM_registerMenuCommand('⚙️ 知乎增强设置（偏好设置页）', openScriptSettingsPage);
    }
    registerSettingsMenu();

    function closePopoverSilently(moreBtn) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        setTimeout(() => {
            if (document.querySelector('.Popover-content') && moreBtn) {
                moreBtn.click();
            }
            setTimeout(() => document.body.classList.remove('zh-silent-popover'), 100);
        }, 30);
    }

    function triggerMoreMenuAction(moreBtn, keywords, onDone, readOnly = false) {
        if (!moreBtn) return;
        document.body.classList.add('zh-silent-popover');
        moreBtn.click();

        let attempts = 0;
        const maxAttempts = 15;
        const poll = () => {
            attempts += 1;
            const popovers = Array.from(document.querySelectorAll('.Popover-content'));
            let matchedContainer = null;
            let matchedItem = null;

            for (const pop of popovers) {
                const candidates = Array.from(pop.querySelectorAll('button, a, label, [role="menuitem"], [role="switch"], li, div'));
                const matches = candidates.filter((el) => {
                    const txt = (el.textContent || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
                    if (!txt || txt.length > 40) return false;
                    return keywords.some((kw) => txt.toLowerCase().includes(kw.toLowerCase()));
                });
                // 选取最内层（没有子元素也匹配关键词）的精确菜单项，避免误点外层容器里的第一个按钮
                const leafMatch = matches.find((el) => !matches.some((other) => other !== el && el.contains(other)));
                if (leafMatch) {
                    const innerSwitch = leafMatch.querySelector('input[type="checkbox"], [role="switch"]');
                    matchedContainer = leafMatch;
                    matchedItem = innerSwitch || leafMatch;
                    break;
                }
            }

            if (matchedItem) {
                if (!readOnly) {
                    matchedItem.click();
                }
                setTimeout(() => {
                    if (typeof onDone === 'function') onDone(matchedContainer, matchedItem);
                    closePopoverSilently(moreBtn);
                }, 40);
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(poll, 20);
            } else {
                closePopoverSilently(moreBtn);
            }
        };
        setTimeout(poll, 20);
    }

    function createUnpackedToolbarBtn(sampleBtn, label, ariaLabel, svgPathMarkup) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = (sampleBtn ? sampleBtn.className : 'Button ToolbarButton Button--plain') + ' zh-unpacked-more-btn';
        btn.setAttribute('aria-label', ariaLabel || label);

        const sampleInner = sampleBtn ? sampleBtn.querySelector('div') : null;
        const sampleLabel = sampleBtn ? sampleBtn.querySelector('div > span:last-child') : null;

        const inner = document.createElement('div');
        inner.className = sampleInner ? sampleInner.className : '';
        if (!sampleInner) {
            inner.style.display = 'flex';
            inner.style.flexDirection = 'column';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = 'center';
            inner.style.gap = '2px';
        }

        const iconWrap = document.createElement('span');
        iconWrap.style.display = 'inline-flex';
        iconWrap.style.alignItems = 'center';
        iconWrap.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">${svgPathMarkup}</svg>`;

        const textSpan = document.createElement('span');
        textSpan.className = sampleLabel ? sampleLabel.className : '';
        textSpan.textContent = label;

        inner.appendChild(iconWrap);
        inner.appendChild(textSpan);
        btn.appendChild(inner);
        return btn;
    }

    function unpackToolbarMoreMenu() {
        const toolbars = document.querySelectorAll('.toolbarV3');
        toolbars.forEach((toolbar) => {
            if (toolbar.getAttribute('data-zh-more-unpacked') === 'true') return;

            const cleanText = (s) => (s || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
            const moreBtn = Array.from(toolbar.querySelectorAll('button')).find((b) => {
                if (b.classList.contains('zh-unpacked-more-btn')) return false;
                const aria = cleanText(b.getAttribute('aria-label'));
                const txt = cleanText(b.textContent);
                return aria === '更多' || txt === '更多';
            });
            if (!moreBtn) return;

            toolbar.setAttribute('data-zh-more-unpacked', 'true');
            const moreArea = moreBtn.closest('.moreArea');
            if (moreArea) moreArea.setAttribute('data-zh-more-unpacked', 'true');
            moreBtn.classList.add('zh-more-hidden-trigger');

            const sampleBtn = toolbar.querySelector('.ToolbarButton:not(.zh-more-hidden-trigger):not(.zh-unpacked-more-btn)');
            const insertAnchor = moreBtn.closest('.Popover') || moreBtn;

            const helpBtn = createUnpackedToolbarBtn(
                sampleBtn,
                '帮助',
                '帮助文档',
                '<path fill-rule="evenodd" d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5ZM3.75 12a8.25 8.25 0 1 1 16.5 0 8.25 8.25 0 0 1-16.5 0Zm8.25-4.25a2.25 2.25 0 0 0-2.163 1.627.75.75 0 1 1-1.442-.416 3.75 3.75 0 1 1 4.41 4.687c-.35.107-.555.34-.555.602v.5a.75.75 0 0 1-1.5 0v-.5c0-1.016.696-1.787 1.615-2.067A2.25 2.25 0 0 0 12 7.75Zm0 8.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" clip-rule="evenodd"/>'
            );
            helpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerMoreMenuAction(moreBtn, ['帮助文档']);
            });

            const defaultSettingBtn = createUnpackedToolbarBtn(
                sampleBtn,
                '设置',
                '默认设置',
                '<path fill-rule="evenodd" d="M10.49 2.883a1.75 1.75 0 0 1 3.02 0l.73 1.264a.25.25 0 0 0 .285.118l1.404-.402a1.75 1.75 0 0 1 2.163 2.163l-.402 1.404a.25.25 0 0 0 .118.285l1.264.73a1.75 1.75 0 0 1 0 3.02l-1.264.73a.25.25 0 0 0-.118.285l.402 1.404a1.75 1.75 0 0 1-2.163 2.163l-1.404-.402a.25.25 0 0 0-.285.118l-.73 1.264a1.75 1.75 0 0 1-3.02 0l-.73-1.264a.25.25 0 0 0-.285-.118l-1.404.402a1.75 1.75 0 0 1-2.163-2.163l.402-1.404a.25.25 0 0 0-.118-.285l-1.264-.73a1.75 1.75 0 0 1 0-3.02l1.264-.73a.25.25 0 0 0 .118-.285l-.402-1.404a1.75 1.75 0 0 1 2.163-2.163l1.404.402a.25.25 0 0 0 .285-.118l.73-1.264Zm1.721.75a.25.25 0 0 0-.422 0l-.73 1.264a1.75 1.75 0 0 1-1.997.826l-1.404-.402a.25.25 0 0 0-.31.31l.403 1.403a1.75 1.75 0 0 1-.826 1.998l-1.264.73a.25.25 0 0 0 0 .422l1.264.73a1.75 1.75 0 0 1 .826 1.997l-.402 1.404a.25.25 0 0 0 .31.31l1.403-.403a1.75 1.75 0 0 1 1.998.826l.73 1.264a.25.25 0 0 0 .422 0l.73-1.264a1.75 1.75 0 0 1 1.997-.826l1.404.402a.25.25 0 0 0 .31-.31l-.403-1.403a1.75 1.75 0 0 1 .826-1.998l1.264-.73a.25.25 0 0 0 0-.422l-1.264-.73a1.75 1.75 0 0 1-.826-1.997l.402-1.404a.25.25 0 0 0-.31-.31l-1.403.403a1.75 1.75 0 0 1-1.998-.826l-.73-1.264ZM12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM10.25 12a1.75 1.75 0 1 1 3.5 0 1.75 1.75 0 0 1-3.5 0Z" clip-rule="evenodd"/>'
            );
            defaultSettingBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerMoreMenuAction(moreBtn, ['默认设置']);
            });

            const mdBtn = createUnpackedToolbarBtn(
                sampleBtn,
                'MD',
                'Markdown 开关',
                '<path fill-rule="evenodd" d="M3.5 5.75A1.75 1.75 0 0 1 5.25 4h13.5A1.75 1.75 0 0 1 20.5 5.75v12.5A1.75 1.75 0 0 1 18.75 20H5.25a1.75 1.75 0 0 1-1.75-1.75V5.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h13.5a.25.25 0 0 0 .25-.25V5.75a.25.25 0 0 0-.25-.25H5.25Zm1.5 10V8.5h1.6l1.9 2.55L12.15 8.5h1.6v7h-1.5v-4.45l-2 2.65-2-2.65v4.45h-1.5Zm10.75-7v4.4h1.35L16.75 16l-2.1-3.1H16V8.5h1.5Z" clip-rule="evenodd"/>'
            );
            const syncMdState = (container, item, isToggle) => {
                const cb = (container && container.querySelector('input[type="checkbox"]')) || (item && item.matches('input[type="checkbox"]') ? item : null);
                const sw = (container && container.querySelector('[role="switch"]')) || (item && item.getAttribute('role') === 'switch' ? item : null);
                const isChecked = cb ? cb.checked : (sw ? sw.getAttribute('aria-checked') === 'true' : (isToggle ? mdBtn.getAttribute('data-zh-active') !== 'true' : false));
                mdBtn.setAttribute('data-zh-active', isChecked ? 'true' : 'false');
            };
            mdBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerMoreMenuAction(moreBtn, ['markdown', 'md'], (container, item) => syncMdState(container, item, true), false);
            });
            setTimeout(() => {
                triggerMoreMenuAction(moreBtn, ['markdown', 'md'], (container, item) => syncMdState(container, item, false), true);
            }, 120);

            insertAnchor.insertAdjacentElement('afterend', mdBtn);
            insertAnchor.insertAdjacentElement('afterend', defaultSettingBtn);
            insertAnchor.insertAdjacentElement('afterend', helpBtn);
        });
    }

    function moveSecondaryToolsToTopBar() {
        const portal = document.getElementById('AnswerFormPortalContainer');
        if (!portal) return;
        let headerBar = portal.querySelector('.AnswerAdd > div:first-child, .AnswerForm > div:first-child');
        const toolbar = portal.querySelector('.toolbarV3');
        if (!toolbar) return;
        if (!headerBar || headerBar.contains(toolbar)) {
            const fsEl = Array.from(portal.querySelectorAll('button, span, div')).find((el) => el.textContent.trim() === '全屏编辑');
            let cur = fsEl ? fsEl.parentElement : null;
            while (cur && cur !== portal) {
                if (!cur.contains(toolbar) && cur.clientWidth > 300 && cur.clientHeight >= 28 && cur.clientHeight <= 80) {
                    headerBar = cur;
                    break;
                }
                cur = cur.parentElement;
            }
        }
        if (!headerBar || headerBar.contains(toolbar)) return;
        headerBar.setAttribute('data-zh-editor-topbar', 'true');
        Array.from(headerBar.children).forEach((ch) => {
            if (ch.textContent.trim() === '本回答为图文回答') {
                ch.setAttribute('data-zh-hide-editor-hint', 'true');
            }
        });

        let undoGroup = headerBar.querySelector('.zh-top-undo-group');
        if (!undoGroup) {
            undoGroup = document.createElement('div');
            undoGroup.className = 'zh-top-undo-group';
            const tabs = headerBar.querySelector('ul.Tabs');
            if (tabs) {
                tabs.insertAdjacentElement('afterend', undoGroup);
            } else {
                headerBar.insertBefore(undoGroup, headerBar.firstChild);
            }
        }

        let slot = headerBar.querySelector('.zh-top-toolbar-slot');
        if (!slot) {
            slot = document.createElement('div');
            slot.className = 'zh-top-toolbar-slot';
            undoGroup.insertAdjacentElement('afterend', slot);
        }

        const shortLabels = {
            '草稿备份': '草稿',
            '帮助文档': '帮助',
            '默认设置': '设置',
            'Markdown 开关': 'MD',
            'MD开关': 'MD',
            '创作助手': '助手'
        };
        const cleanText = (s) => (s || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
        const moveButtonsToContainer = (names, container) => {
            names.forEach((name) => {
                const shortName = shortLabels[name] || name;
                const existing = Array.from(container.querySelectorAll('button')).some((b) => {
                    const aria = cleanText(b.getAttribute('aria-label'));
                    const txt = cleanText(b.textContent);
                    return aria === cleanText(name) || txt === cleanText(name) || txt === cleanText(shortName);
                });
                if (existing) return;

                const btn = Array.from(toolbar.querySelectorAll('button')).find((b) => {
                    if (b.classList.contains('zh-more-hidden-trigger')) return false;
                    const aria = cleanText(b.getAttribute('aria-label'));
                    const txt = cleanText(b.textContent);
                    return aria === cleanText(name) || txt === cleanText(name) || txt === cleanText(shortName);
                });
                if (!btn) return;

                if (shortLabels[name]) {
                    const labelSpan = btn.querySelector('div > span:last-child');
                    if (labelSpan) labelSpan.textContent = shortLabels[name];
                }

                const pop = btn.closest('.Popover');
                const nodeToMove = (pop && toolbar.contains(pop)) ? pop : btn;
                container.appendChild(nodeToMove);
            });
        };

        moveButtonsToContainer(['撤销', '重做'], undoGroup);
        moveButtonsToContainer(['图片', '视频', '附件', '导入', '草稿备份', '帮助文档', '默认设置', 'Markdown 开关', '创作助手'], slot);

        // 将工具栏中的“清除格式”改名为“格式刷”
        toolbar.querySelectorAll('button').forEach((btn) => {
            const aria = cleanText(btn.getAttribute('aria-label'));
            const txt = cleanText(btn.textContent);
            if (aria === '清除格式' || txt === '清除格式') {
                const labelSpan = btn.querySelector('div > span:last-child') || btn.querySelector('span:last-child');
                if (labelSpan && labelSpan.textContent !== '格式刷') {
                    labelSpan.textContent = '格式刷';
                }
            }
        });

        // 隐藏末尾或无意义的多余分割线
        const dividers = Array.from(toolbar.querySelectorAll('.ToolbarDivider'));
        dividers.forEach((div) => {
            const section = div.closest('.toolbar-section, .fixArea, .moreArea, .AiAssistantArea');
            if (!section) return;
            const hasVisibleBtnAfter = Array.from(section.querySelectorAll('button')).some((b) => {
                return !b.classList.contains('zh-more-hidden-trigger') && div.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
            });
            if (!hasVisibleBtnAfter) {
                div.style.display = 'none';
            }
        });
    }

    function compactAiAssistantPanel(aiPanel) {
        if (!aiPanel) return;
        const allEls = Array.from(aiPanel.querySelectorAll('div, p, span, button'));

        // 1) 隐藏欢迎语（支持外层或叶子文本节点）
        allEls.forEach((el) => {
            if (el.closest('[data-zh-publish-in-ai="true"]')) return;
            const t = (el.textContent || '').trim();
            if ((t.startsWith('Hello') || t.includes('欢迎使用知乎创作助手')) && t.length <= 60) {
                const hasMatchingChild = Array.from(el.children).some((c) => (c.textContent || '').includes('欢迎使用知乎创作助手'));
                if (!hasMatchingChild) el.setAttribute('data-zh-ai-hide', 'true');
            }
        });

        // 2) 精简各功能卡片：隐藏功能描述与“更多功能”，仅保留4个横向按钮
        const featureTitles = ['内容检测', '智能排版', '提取导语', 'AI 配图', 'AI配图', '更多功能'];
        const descPrefixes = ['识别错别字', '自动修正空格', '理清全文思路', '输入你的图片灵感', '持续更新中'];

        allEls.forEach((el) => {
            if (el.closest('[data-zh-publish-in-ai="true"]')) return;
            const t = (el.textContent || '').trim();
            if (t.length <= 30 && descPrefixes.some((p) => t.startsWith(p))) {
                const hasMatchingChild = Array.from(el.children).some((c) => descPrefixes.some((p) => (c.textContent || '').trim().startsWith(p)));
                if (!hasMatchingChild) el.setAttribute('data-zh-ai-desc', 'true');
            }
        });

        const cards = new Set();
        allEls.forEach((el) => {
            if (el.closest('[data-zh-publish-in-ai="true"]')) return;
            const t = (el.textContent || '').replace(/\s+/g, '');
            const matchedTitle = featureTitles.find((ft) => t === ft.replace(/\s+/g, ''));
            if (!matchedTitle) return;

            let card = el.parentElement;
            for (let i = 0; i < 5 && card && card !== aiPanel; i++) {
                const txt = (card.textContent || '').trim();
                const matchCount = featureTitles.filter((ft) => txt.includes(ft.replace(/\s+/g, '')) || txt.includes(ft)).length;
                if (matchCount > 1) break;
                const parent = card.parentElement;
                if (parent) {
                    const parentTxt = (parent.textContent || '').trim();
                    const parentMatchCount = featureTitles.filter((ft) => parentTxt.includes(ft.replace(/\s+/g, '')) || parentTxt.includes(ft)).length;
                    if (parentMatchCount >= 2) {
                        cards.add(card);
                        break;
                    }
                }
                card = card.parentElement;
            }
        });

        cards.forEach((card) => {
            const txt = (card.textContent || '').trim();
            if (txt.includes('更多功能')) {
                card.setAttribute('data-zh-ai-hide', 'true');
            } else {
                card.setAttribute('data-zh-ai-card', 'true');
                if (card.parentElement && card.parentElement !== aiPanel) {
                    card.parentElement.setAttribute('data-zh-ai-grid', 'true');
                }
            }
        });
    }

    function layoutAiAssistantPanel() {
        const portal = document.getElementById('AnswerFormPortalContainer');
        if (!portal) return;
        const aiPanel = portal.querySelector('.AIAssistantPanelV2-container');
        if (!aiPanel) return;

        if (!aiPanel.hasAttribute('data-zh-ai-init')) {
            aiPanel.setAttribute('data-zh-ai-init', 'true');
            if (settings.defaultCloseAiAssistant && portal.getAttribute('data-zh-ai-user-opened') !== 'true') {
                aiPanel.setAttribute('data-zh-ai-closed', 'true');
            }
        }

        compactAiAssistantPanel(aiPanel);

        if (aiPanel.getAttribute('data-zh-ai-closed') === 'true') {
            aiPanel.removeAttribute('data-zh-ai-floating');
            return;
        }

        const portalRect = portal.getBoundingClientRect();
        if (portalRect.width <= 0 || portalRect.height <= 0) {
            aiPanel.removeAttribute('data-zh-ai-floating');
            return;
        }

        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const availableRight = (vw - 16) - portalRect.right - 24;
        const top = Math.round(Math.max(72, Math.min(portalRect.top, vh - 260)));
        const maxH = Math.max(160, vh - top - 24);
        aiPanel.setAttribute('data-zh-ai-floating', 'true');
        if (availableRight >= 210) {
            const w = Math.min(340, Math.floor(availableRight));
            if (w < 300) {
                aiPanel.setAttribute('data-zh-ai-narrow', 'true');
            } else {
                aiPanel.removeAttribute('data-zh-ai-narrow');
            }
            aiPanel.style.setProperty('left', `${Math.round(portalRect.right + 12)}px`, 'important');
            aiPanel.style.removeProperty('right');
            aiPanel.style.setProperty('top', `${top}px`, 'important');
            aiPanel.style.setProperty('width', `${w}px`, 'important');
            aiPanel.style.setProperty('max-height', `${maxH}px`, 'important');
        } else {
            // 窗口较窄时固定悬浮在视口右侧，绝不落回写回答输入框内部
            aiPanel.setAttribute('data-zh-ai-narrow', 'true');
            aiPanel.style.removeProperty('left');
            aiPanel.style.setProperty('right', '12px', 'important');
            aiPanel.style.setProperty('top', `${top}px`, 'important');
            aiPanel.style.setProperty('width', '280px', 'important');
            aiPanel.style.setProperty('max-height', `${maxH}px`, 'important');
        }
    }

    function collapseAnswerPublishSettings() {
        const portal = document.getElementById('AnswerFormPortalContainer');
        if (!portal) return;

        const publishBtn = Array.from(portal.querySelectorAll('button')).find((b) => {
            if (b.classList.contains('zh-toggle-publish-settings-btn')) return false;
            const t = (b.textContent || '').replace(/\s+/g, '');
            return t === '发布回答' || t === '提交回答' || t === '更新回答' || t === '提交修改' || t === '保存修改';
        });
        if (!publishBtn) return;

        // 找到“发布设置”区块（包含“创作声明”与“评论权限”且不包含发布按钮）
        let settingsPanel = portal.querySelector('[data-zh-publish-panel="true"]');
        if (!settingsPanel) {
            const titleEl = Array.from(portal.querySelectorAll('div, span, h3, h4')).find((el) => {
                if (el.children.length > 0) return false;
                return (el.textContent || '').trim() === '发布设置';
            });
            if (titleEl) {
                let curr = titleEl.parentElement;
                for (let i = 0; i < 6 && curr && curr !== portal; i++) {
                    const txt = curr.textContent || '';
                    if (txt.includes('创作声明') && (txt.includes('评论权限') || txt.includes('内容来源'))) {
                        if (!curr.contains(publishBtn)) {
                            settingsPanel = curr;
                            break;
                        }
                    }
                    curr = curr.parentElement;
                }
            }
            if (settingsPanel) {
                settingsPanel.setAttribute('data-zh-publish-panel', 'true');
                if (!settingsPanel.hasAttribute('data-zh-publish-collapsed')) {
                    settingsPanel.setAttribute('data-zh-publish-collapsed', 'true');
                }
            }
        }

        if (!settingsPanel) return;

        if (publishBtn.parentElement) {
            publishBtn.parentElement.setAttribute('data-zh-publish-bar', 'true');
            if (publishBtn.parentElement.parentElement && publishBtn.parentElement.parentElement !== portal) {
                publishBtn.parentElement.parentElement.setAttribute('data-zh-publish-bar-wrap', 'true');
            }
        }

        // 移除旧的“展开更多”按钮（如果存在）
        const oldToggleBtn = portal.querySelector('.zh-toggle-publish-settings-btn');
        if (oldToggleBtn) oldToggleBtn.remove();

        // 将“发布设置”整体放入右侧悬浮的“创作助手”面板中，字体与布局自适应紧凑化
        const aiPanel = portal.querySelector('.AIAssistantPanelV2-container');
        if (aiPanel && aiPanel.getAttribute('data-zh-ai-closed') !== 'true') {
            settingsPanel.removeAttribute('data-zh-publish-collapsed');
            settingsPanel.setAttribute('data-zh-publish-in-ai', 'true');
            // 隐藏冗长说明文字（根据自媒体投稿规范... / 将发布到个人主页的...）
            settingsPanel.querySelectorAll('div, p, span').forEach((el) => {
                if (el.children.length > 0) return;
                const t = (el.textContent || '').trim();
                if (t.includes('根据自媒体投稿规范') || t.includes('将发布到个人主页的')) {
                    el.setAttribute('data-zh-ai-hide', 'true');
                }
            });
            // 将单选框组标记为两行竖排，避免右侧裁切
            settingsPanel.querySelectorAll('label[for^="PublishPanel-"]').forEach((lbl) => {
                if (lbl.parentElement) {
                    lbl.parentElement.setAttribute('data-zh-radio-group', 'true');
                }
            });
            // 将“定时发布”大开关替换为“选择时间”按钮
            const scheduleRow = Array.from(settingsPanel.children).find((row) => {
                const lbl = row.querySelector('label');
                return lbl && (lbl.textContent || '').trim() === '定时发布';
            });
            if (scheduleRow) {
                const cb = scheduleRow.querySelector('input[type="checkbox"]');
                const switchBox = cb ? (cb.closest('div') && cb.closest('div').parentElement ? cb.closest('div').parentElement : cb.parentElement) : null;
                if (cb && switchBox && !scheduleRow.querySelector('.zh-schedule-time-btn')) {
                    switchBox.setAttribute('data-zh-schedule-switch', 'true');
                    const timeBtn = document.createElement('button');
                    timeBtn.type = 'button';
                    timeBtn.className = 'zh-schedule-time-btn';
                    const syncTimeLabel = () => {
                        timeBtn.textContent = cb.checked ? '取消定时' : '选择时间';
                    };
                    syncTimeLabel();
                    timeBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cb.click();
                        setTimeout(syncTimeLabel, 20);
                    });
                    switchBox.insertAdjacentElement('afterend', timeBtn);
                }
            }
            if (!settingsPanel._zhOrigParent && settingsPanel.parentElement && !settingsPanel.parentElement.closest('.AIAssistantPanelV2-container')) {
                settingsPanel._zhOrigParent = settingsPanel.parentElement;
                settingsPanel._zhOrigNextSibling = settingsPanel.nextSibling;
            }
            if (!aiPanel.contains(settingsPanel)) {
                aiPanel.appendChild(settingsPanel);
            }
        } else {
            settingsPanel.setAttribute('data-zh-publish-collapsed', 'true');
        }
    }

    function restorePublishSettingsFromAi(portal) {
        if (!portal) return;
        const settingsPanel = portal.querySelector('[data-zh-publish-panel="true"]');
        if (!settingsPanel) return;
        settingsPanel.removeAttribute('data-zh-publish-in-ai');
        settingsPanel.setAttribute('data-zh-publish-collapsed', 'true');
        if (settingsPanel._zhOrigParent && settingsPanel._zhOrigParent.isConnected) {
            if (settingsPanel._zhOrigNextSibling && settingsPanel._zhOrigNextSibling.parentElement === settingsPanel._zhOrigParent) {
                settingsPanel._zhOrigParent.insertBefore(settingsPanel, settingsPanel._zhOrigNextSibling);
            } else {
                settingsPanel._zhOrigParent.appendChild(settingsPanel);
            }
        }
    }

    function enhanceProfileSearchBar() {
        const m = location.pathname.match(/^\/(people|org)\/([^/]+)/);
        if (!m) return;
        document.querySelectorAll('.ProfileMain-tabs').forEach((ul) => {
            ul.classList.remove('withSearchIcon');
            const next = ul.nextElementSibling;
            if (next && next.querySelector('.ZDI--Search24, [class*="Search"]')) {
                next.setAttribute('data-zh-hide-profile-search', 'true');
            }
        });
        const basePath = `/${m[1]}/${m[2]}`;
        const isOwnProfile = Boolean(
            Array.from(document.querySelectorAll('#ProfileHeader button, .ProfileHeader button, #ProfileHeader a, .ProfileHeader a'))
                .some((el) => (el.textContent || '').includes('编辑个人资料'))
        );

        const listHeaders = document.querySelectorAll('.Profile-mainColumn .List-header, .ProfileMain .List-header, #ProfileMain .List-header, .Profile-answers .List-header');
        // 提取并隐藏右侧“个人成就”卡片及“赞同我 / 我赞同他(她)”链接
        const pronoun = (() => {
            const metaGender = document.querySelector('meta[itemprop="gender"]')?.getAttribute('content');
            if (metaGender === 'Male') return '他';
            if (metaGender === 'Female') return '她';
            for (const item of document.querySelectorAll('.ProfileHeader-detailItem')) {
                const lb = (item.querySelector('.ProfileHeader-detailLabel')?.textContent || '').trim();
                if (lb === '性别') {
                    const val = (item.querySelector('.ProfileHeader-detailValue')?.textContent || '').trim();
                    if (val.includes('男')) return '他';
                    if (val.includes('女')) return '她';
                }
            }
            return 'TA';
        })();

        const achievementItems = [];
        const agreeLinks = [];
        const sideCards = document.querySelectorAll('.Profile-sideColumn .Card');
        for (const card of sideCards) {
            const headerTxt = (card.querySelector('.Card-headerText')?.textContent || '').trim();
            if (!headerTxt.includes('个人成就')) continue;
            card.setAttribute('data-zh-hide-achievement-card', 'true');
            const bodyTxt = (card.textContent || '').replace(/\s+/g, ' ');
            const upvoteMatch = bodyTxt.match(/获得\s*([\d,]+)\s*次赞同/);
            const likeMatch = bodyTxt.match(/([\d,]+)\s*次喜欢/);
            const favMatch = bodyTxt.match(/([\d,]+)\s*次收藏/);
            if (upvoteMatch) achievementItems.push({ num: upvoteMatch[1], label: '赞同' });
            if (likeMatch) achievementItems.push({ num: likeMatch[1], label: '喜欢' });
            if (favMatch) achievementItems.push({ num: favMatch[1], label: '收藏' });
            if (achievementItems.length === 0) {
                const editMatch = bodyTxt.match(/参与\s*([\d,]+)\s*次公共编辑/);
                if (editMatch) achievementItems.push({ num: editMatch[1], label: '公共编辑' });
            }
            break;
        }

        if (!isOwnProfile) {
            // 提取右侧“他/她赞同我 x 次”与“我赞同他/她 x 次”链接并隐藏原行
            const sideCol = document.querySelector('.Profile-sideColumn');
            if (sideCol) {
                const seenAgree = new Set();
                const candidates = sideCol.querySelectorAll('a, div, p, li, span');
                for (const el of candidates) {
                    if (el.closest('[data-zh-hide-achievement-card="true"], .Profile-lightList, .Profile-footerOperations')) continue;
                    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    const mToMe = txt.match(/^(?:他|她|TA)赞同我\s*([\d,]+)\s*次$/);
                    const mToOther = txt.match(/^我赞同(?:他|她|TA)\s*([\d,]+)\s*次$/);
                    if (!mToMe && !mToOther) continue;
                    // 避免父级与子级重复匹配：只取内层包含完整文本（且若有子节点则子节点不含完整文本）的节点
                    const hasChildMatch = Array.from(el.children).some((ch) => /^(?:(?:他|她|TA)赞同我|我赞同(?:他|她|TA))\s*[\d,]+\s*次$/.test((ch.textContent || '').replace(/\s+/g, ' ').trim()));
                    if (hasChildMatch) continue;
                    const type = mToMe ? 'toMe' : 'toOther';
                    if (seenAgree.has(type)) continue;
                    seenAgree.add(type);

                    const anchor = el.tagName === 'A' ? el : el.querySelector('a');
                    const href = anchor ? (anchor.getAttribute('href') || '') : '';
                    const target = anchor ? (anchor.getAttribute('target') || '') : '';
                    const text = mToMe ? `${pronoun}赞同我 ${mToMe[1]} 次` : `我赞同${pronoun} ${mToOther[1]} 次`;
                    agreeLinks.push({ type, text, href, target, nativeEl: anchor || el });
                    el.setAttribute('data-zh-hide-followship-card', 'true');
                }
            }
        }

        listHeaders.forEach((lh) => {
            // 隐藏“我的视频 / 他的回答 / 我的文章”等冗余标题节点
            Array.from(lh.children).forEach((child) => {
                if (
                    child.classList.contains('zh-profile-search-box') ||
                    child.classList.contains('zh-profile-achievement-text') ||
                    child.classList.contains('List-headerOptions')
                ) return;
                const txt = (child.textContent || '').trim();
                if (child.classList.contains('List-headerText') || /^(我的|他的|她的|TA的)(动态|回答|视频|提问|文章|专栏|想法|收藏|划线)$/.test(txt)) {
                    child.setAttribute('data-zh-hide-header-title', 'true');
                }
            });

            const titleEl = lh.querySelector('.List-headerText, [data-zh-hide-header-title="true"]');
            const titleTxt = titleEl ? (titleEl.textContent || '').trim() : '';
            const fullTxt = (lh.textContent || '').trim();
            const isMine = isOwnProfile || titleTxt.startsWith('我的') || fullTxt.includes('我关注的人');
            const placeholder = isMine ? '搜索我的动态' : '搜索他的动态';

            let achEl = lh.querySelector('.zh-profile-achievement-text');
            if (achievementItems.length > 0 || agreeLinks.length > 0) {
                if (!achEl) {
                    achEl = document.createElement('div');
                    achEl.className = 'zh-profile-achievement-text';
                    lh.insertBefore(achEl, lh.firstChild);
                }
                const sig = JSON.stringify({ achievementItems, agreeLinks: agreeLinks.map((a) => ({ text: a.text, href: a.href })) });
                if (achEl.getAttribute('data-zh-ach-sig') !== sig) {
                    achEl.setAttribute('data-zh-ach-sig', sig);
                    achEl.innerHTML = '';
                    const parts = [];
                    for (const item of achievementItems) {
                        const span = document.createElement('span');
                        span.innerHTML = `<b>${item.num}</b> ${item.label}`;
                        parts.push(span);
                    }
                    for (const ag of agreeLinks) {
                        const a = document.createElement('a');
                        a.className = 'zh-profile-agree-link';
                        a.textContent = ag.text;
                        if (ag.href) a.href = ag.href;
                        else a.href = 'javascript:void(0)';
                        if (ag.target) a.target = ag.target;
                        if (!ag.href || ag.href === '#' || ag.href.startsWith('javascript:')) {
                            a.addEventListener('click', (e) => {
                                e.preventDefault();
                                ag.nativeEl?.click();
                            });
                        }
                        parts.push(a);
                    }
                    parts.forEach((node, idx) => {
                        if (idx > 0) {
                            const sep = document.createElement('span');
                            sep.className = 'zh-profile-achievement-sep';
                            sep.textContent = '·';
                            achEl.appendChild(sep);
                        }
                        achEl.appendChild(node);
                    });
                }
            } else if (achEl) {
                achEl.remove();
            }

            let box = lh.querySelector('.zh-profile-search-box');
            if (!box) {
                box = document.createElement('form');
                box.className = 'zh-profile-search-box';
                const input = document.createElement('input');
                input.type = 'search';
                input.className = 'zh-profile-search-input';
                input.placeholder = placeholder;
                const initKw = new URLSearchParams(location.search).get('keyword');
                if (initKw) input.value = initKw;
                const btn = document.createElement('button');
                btn.type = 'submit';
                btn.className = 'zh-profile-search-btn';
                btn.setAttribute('aria-label', '搜索');
                btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clip-rule="evenodd"/></svg>';
                box.appendChild(input);
                box.appendChild(btn);

                box.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const q = input.value.trim();
                    if (!q) return;
                    const pathBefore = location.pathname.startsWith(`${basePath}/search`) ? basePath : location.pathname;
                    location.href = `${basePath}/search?keyword=${encodeURIComponent(q)}&pathBefore=${encodeURIComponent(pathBefore)}`;
                });

                const optionsEl = lh.querySelector('.List-headerOptions');
                if (optionsEl) {
                    lh.insertBefore(box, optionsEl);
                } else {
                    lh.appendChild(box);
                }
            } else {
                const input = box.querySelector('.zh-profile-search-input');
                if (input && input.placeholder !== placeholder) {
                    input.placeholder = placeholder;
                }
            }
        });
    }

    let rafPending = false;
    function runEnhancements() {
        rafPending = false;
        const steps = [
            applySettingsClasses,
            parseInitialData,
            tagLeftSidebar,
            enhanceTopHeader,
            attachBlockButtons,
            attachAnswerTimes,
            attachFiveLinePreviews,
            adjustProfileHeader,
            enhanceProfileSearchBar,
            syncQuestionHeaderWidth,
            enhanceQuestionPageHeader,
            hideRightSidebarCards,
            injectPreferenceSettings,
            enhanceArticleTitlePasteCover,
            unpackToolbarMoreMenu,
            moveSecondaryToolsToTopBar,
            layoutAiAssistantPanel,
            collapseAnswerPublishSettings,
            enhanceMessagesPage,
            checkAndAutoReadMutedCategoryDms
        ];
        for (const fn of steps) {
            try {
                fn();
            } catch { /* isolate step errors */ }
        }
    }

    function scheduleEnhance() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(runEnhancements);
    }

    function setupAiAssistantCloseFix() {
        if (window.__zhAiAssistantCloseBound) return;
        window.__zhAiAssistantCloseBound = true;
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('#AnswerFormPortalContainer button[aria-label="关闭创作助手"]');
            if (closeBtn) {
                const portal = closeBtn.closest('#AnswerFormPortalContainer');
                const panel = closeBtn.closest('.AIAssistantPanelV2-container');
                // 在 React 卸载创作助手面板前，先把“发布设置”节点移回原父级保存，防止随面板一同销毁
                restorePublishSettingsFromAi(portal);
                if (portal) portal.removeAttribute('data-zh-ai-user-opened');
                if (panel) panel.setAttribute('data-zh-ai-closed', 'true');
                return;
            }
            const openBtn = e.target.closest('#AnswerFormPortalContainer button[aria-label="创作助手"]');
            if (openBtn) {
                const portal = openBtn.closest('#AnswerFormPortalContainer');
                const panel = portal ? portal.querySelector('.AIAssistantPanelV2-container') : null;
                if (panel && panel.getAttribute('data-zh-ai-closed') !== 'true') {
                    restorePublishSettingsFromAi(portal);
                    if (portal) portal.removeAttribute('data-zh-ai-user-opened');
                    panel.setAttribute('data-zh-ai-closed', 'true');
                } else {
                    if (portal) portal.setAttribute('data-zh-ai-user-opened', 'true');
                    if (panel) panel.removeAttribute('data-zh-ai-closed');
                    const syncOpen = () => {
                        layoutAiAssistantPanel();
                        collapseAnswerPublishSettings();
                    };
                    requestAnimationFrame(syncOpen);
                    setTimeout(syncOpen, 60);
                }
            }
        }, true);

        let aiRaf = false;
        const onViewportChange = () => {
            if (aiRaf) return;
            aiRaf = true;
            requestAnimationFrame(() => {
                aiRaf = false;
                layoutAiAssistantPanel();
            });
        };
        window.addEventListener('scroll', onViewportChange, { passive: true });
        window.addEventListener('resize', onViewportChange, { passive: true });
    }

    function setupProfileTabSearchHook() {
        if (window.__zhProfileTabHookBound) return;
        window.__zhProfileTabHookBound = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('.ProfileMain-tabs .Tabs-link')) {
                setTimeout(enhanceProfileSearchBar, 100);
                setTimeout(enhanceProfileSearchBar, 350);
                setTimeout(enhanceProfileSearchBar, 800);
            }
        }, true);
    }

    function init() {
        setupBlankClickCollapse();
        setupAiAssistantCloseFix();
        setupProfileTabSearchHook();
        if (!window.__zhAutoSidebarResizeHook) {
            window.__zhAutoSidebarResizeHook = true;
            window.addEventListener('resize', () => {
                requestAnimationFrame(updateAutoSidebarCollapse);
            }, { passive: true });
        }
        runEnhancements();
        const observer = new MutationObserver(() => {
            scheduleEnhance();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
