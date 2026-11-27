// ==UserScript==
// @name         Bilibili-Gate 个人推送
// @namespace    bilibili-gate-personal-push
// @version      1.0.0
// @description  在最新版 Bilibili-Gate 新增「个人推送」Tab，从通用推送服务端获取 BV 号列表，并实时拉取 B 站最新播放量/弹幕/时间，自动对齐 Bilibili-Gate 原生卡片样式
// @author       baihurss
// @match        *://www.bilibili.com/
// @match        *://www.bilibili.com/?*
// @match        *://www.bilibili.com/index.html
// @match        *://www.bilibili.com/index.html?*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      192.168.31.2
// @connect      127.0.0.1
// @connect      localhost
// @connect      api.bilibili.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_API_URL = 'http://192.168.31.2:3457/api/feed/bilibili';
    const API_URL_KEY = 'personal_push_api_url';
    const CACHE_KEY = 'personal-push-feed-cache-v2';
    const TAB_KEY = 'personal-push-feed';
    const LIVE_CACHE_TTL = 5 * 60 * 1000; // 实时视频信息内存缓存 5 分钟
    const MAX_LIVE_FETCH = 48; // 单次最多实时刷新前 48 个视频，防止触发频控

    let tabActive = false;
    let currentVideos = [];
    const liveInfoCache = new Map(); // bvid -> { ts, data }

    function getApiUrl() {
        return GM_getValue(API_URL_KEY, DEFAULT_API_URL);
    }

    GM_registerMenuCommand('⚙️ 设置推送服务端地址', () => {
        const cur = getApiUrl();
        const next = prompt('请输入推送服务端 B 站频道接口地址：', cur);
        if (next && next.trim()) {
            GM_setValue(API_URL_KEY, next.trim());
            alert('已保存！重新点击「个人推送」Tab 或刷新即可生效。');
        }
    });

    function loadCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveCache(items) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(items));
        } catch { }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatCount(num) {
        if (num === undefined || num === null || num === '') return '';
        const n = Number(num);
        if (Number.isNaN(n)) return String(num);
        if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
        return String(n);
    }

    function formatDuration(val) {
        if (typeof val === 'string' && val.includes(':')) return val;
        const sec = Number(val);
        if (!sec || Number.isNaN(sec)) return '';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const pad = (x) => String(x).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function formatRelativeTime(tsSec) {
        if (!tsSec) return '';
        const ts = tsSec > 1e12 ? Math.floor(tsSec / 1000) : Number(tsSec);
        const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
        if (diff < 86400 * 2) return '昨天';
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}天前`;
        const d = new Date(ts * 1000);
        const now = new Date();
        if (d.getFullYear() === now.getFullYear()) {
            return `${d.getMonth() + 1}-${d.getDate()}`;
        }
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    // 样式极简化：尽量继承 Bilibili-Gate 原生 CSS 变量与主题
    GM_addStyle(`
        .pp-tab-btn { cursor: pointer; user-select: none; position: relative; }
        .pp-panel { display: none; width: 100%; }
        .pp-panel.is-active { display: block; }
        .pp-toolbar {
            display: flex; justify-content: flex-end; align-items: center;
            gap: 10px; padding: 6px 0 12px; font-size: 12px;
            color: var(--bilibili-gate--text-color-lighter, #9499a0);
        }
        .pp-refresh-btn {
            cursor: pointer; padding: 4px 12px; border-radius: 6px;
            border: 1px solid var(--bilibili-gate--brand-color, #00aeec);
            background: transparent;
            color: var(--bilibili-gate--brand-color, #00aeec);
            font-size: 12px; transition: opacity .15s;
        }
        .pp-refresh-btn:hover { opacity: .8; }
        .pp-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 20px 14px;
        }
        .pp-card { width: 100%; }
        .pp-cover-link {
            position: relative; display: block; overflow: hidden;
            border-radius: var(--bilibili-gate--video-card--border-radius, 12px);
            aspect-ratio: 16 / 9; background: rgba(128,128,128,.12);
        }
        .pp-cover-img {
            display: block; width: 100%; height: 100%; object-fit: cover;
            transition: transform .25s ease;
        }
        .pp-cover-link:hover .pp-cover-img { transform: scale(1.03); }
        .pp-stats {
            position: absolute; left: 0; right: 0; bottom: 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 8px 6px;
            background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.72) 100%);
            color: #fff; font-size: 13px; line-height: 18px; pointer-events: none;
        }
        .pp-stats-left { display: flex; align-items: center; gap: 10px; }
        .pp-stat-item { display: inline-flex; align-items: center; gap: 3px; }
        .pp-info { padding: 8px 2px 2px; }
        .pp-title {
            margin: 0; font-size: 15px; line-height: 22px; font-weight: 500;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden; text-overflow: ellipsis; min-height: 44px;
            color: var(--bilibili-gate--text-color, inherit);
        }
        .pp-title a { color: inherit; text-decoration: none; }
        .pp-title a:hover { color: var(--bilibili-gate--brand-color, #00aeec); }
        .pp-owner {
            display: flex; align-items: center; gap: 4px; margin-top: 6px;
            font-size: 13px; line-height: 18px;
            color: var(--bilibili-gate--text-color-lighter, #9499a0);
            text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pp-owner:hover { color: var(--bilibili-gate--brand-color, #00aeec); }
        .pp-up-icon {
            display: inline-flex; align-items: center; justify-content: center;
            flex-shrink: 0; width: 17px; height: 15px;
            border: 1.2px solid currentColor; border-radius: 3px;
            font-size: 9px; font-weight: 700; line-height: 1; letter-spacing: -0.5px;
        }
        .pp-empty {
            grid-column: 1 / -1; text-align: center; padding: 60px 20px;
            color: var(--bilibili-gate--text-color-lighter, #9499a0); font-size: 14px;
        }
    `);

    const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"></path><path d="M14.7138 10.96875C15.50765 11.4271 15.50765 12.573 14.71375 13.0313L11.5362 14.8659C10.74235 15.3242 9.75 14.7513 9.75001 13.8346L9.75001 10.1655C9.75001 9.24881 10.74235 8.67587 11.5362 9.13422L14.7138 10.96875z"></path></svg>`;
    const DANMAKU_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"></path><path d="M15.875 10.75L9.875 10.75C9.46079 10.75 9.125 10.4142 9.125 10C9.125 9.58579 9.46079 9.25 9.875 9.25L15.875 9.25C16.2892 9.25 16.625 9.58579 16.625 10C16.625 10.4142 16.2892 10.75 15.875 10.75z"></path><path d="M17.375 14.75L11.375 14.75C10.9608 14.75 10.625 14.4142 10.625 14C10.625 13.5858 10.9608 13.25 11.375 13.25L17.375 13.25C17.7892 13.25 18.125 13.5858 18.125 14C18.125 14.4142 17.7892 14.75 17.375 14.75z"></path><path d="M7.875 10C7.875 10.4142 7.53921 10.75 7.125 10.75L6.625 10.75C6.21079 10.75 5.875 10.4142 5.875 10C5.875 9.58579 6.21079 9.25 6.625 9.25L7.125 9.25C7.53921 9.25 7.875 9.58579 7.875 10z"></path><path d="M9.375 14C9.375 14.4142 9.03921 14.75 8.625 14.75L8.125 14.75C7.71079 14.75 7.375 14.4142 7.375 14C7.375 13.5858 7.71079 13.25 8.125 13.25L8.625 13.25C9.03921 13.25 9.375 13.5858 9.375 14z"></path></svg>`;

    // 从页面已有 Bilibili-Gate 原生网格同步列数与间距，自动适配最新版布局
    function syncNativeGridStyle(gridEl) {
        const nativeCard = document.querySelector('.bilibili-gate-root .bili-video-card:not(.pp-card)');
        if (!nativeCard || !nativeCard.parentElement) return;
        const cs = getComputedStyle(nativeCard.parentElement);
        if (cs.display === 'grid' && cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none') {
            gridEl.style.gridTemplateColumns = cs.gridTemplateColumns;
            if (cs.gap && cs.gap !== 'normal') gridEl.style.gap = cs.gap;
        }
    }

    function createCardElement(video) {
        const bvid = video.bvid || video.id;
        let cover = video.cover || '';
        if (cover.startsWith('//')) cover = 'https:' + cover;
        else if (cover.startsWith('http://')) cover = cover.replace('http://', 'https://');

        const ts = Number(video.publishTime || video.pubdate || 0);
        const relTime = formatRelativeTime(ts);
        const duration = formatDuration(video.duration);
        const videoUrl = `https://www.bilibili.com/video/${bvid}/`;
        const spaceUrl = video.mid ? `https://space.bilibili.com/${video.mid}/video` : '#';

        const card = document.createElement('div');
        card.className = 'bili-video-card bilibili-gate-video-card pp-card';
        card.dataset.bvid = bvid;

        card.innerHTML = `
            <div class="bili-video-card__wrap">
                <a href="${videoUrl}" target="_blank" rel="noopener" class="pp-cover-link">
                    ${cover ? `<img loading="lazy" class="pp-cover-img" referrerpolicy="no-referrer" alt="${escapeHtml(video.title)}" src="${cover}@672w_378h_1c_!web-home-common-cover.webp">` : ''}
                    <div class="pp-stats">
                        <div class="pp-stats-left">
                            <span class="pp-stat-item" data-live="view" style="display:none;">${PLAY_SVG}<span class="pp-stat-val"></span></span>
                            <span class="pp-stat-item" data-live="danmaku" style="display:none;">${DANMAKU_SVG}<span class="pp-stat-val"></span></span>
                        </div>
                        <span data-live="duration">${escapeHtml(duration)}</span>
                    </div>
                </a>
                <div class="pp-info">
                    <h3 class="pp-title" title="${escapeHtml(video.title)}">
                        <a href="${videoUrl}" target="_blank" rel="noopener" data-live="title">${escapeHtml(video.title)}</a>
                    </h3>
                    <a class="pp-owner" href="${spaceUrl}" target="_blank" rel="noopener" title="${escapeHtml(video.author)}">
                        <span class="pp-up-icon">UP</span>
                        <span data-live="author" style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(video.author)}</span>
                        <span data-live="time" style="flex-shrink:0;">${relTime ? '· ' + relTime : ''}</span>
                    </a>
                </div>
            </div>
        `;
        return card;
    }

    function applyLiveDataToCard(card, info) {
        if (!card || !info) return;
        const stat = info.stat || {};
        const viewEl = card.querySelector('[data-live="view"]');
        if (viewEl && stat.view !== undefined) {
            viewEl.querySelector('.pp-stat-val').textContent = formatCount(stat.view);
            viewEl.style.display = 'inline-flex';
        }
        const dmEl = card.querySelector('[data-live="danmaku"]');
        if (dmEl && stat.danmaku !== undefined) {
            dmEl.querySelector('.pp-stat-val').textContent = formatCount(stat.danmaku);
            dmEl.style.display = 'inline-flex';
        }
        const durEl = card.querySelector('[data-live="duration"]');
        if (durEl && info.duration) {
            durEl.textContent = formatDuration(info.duration);
        }
        const titleEl = card.querySelector('[data-live="title"]');
        if (titleEl && info.title) {
            titleEl.textContent = info.title;
            titleEl.parentElement.title = info.title;
        }
        const timeEl = card.querySelector('[data-live="time"]');
        if (timeEl && info.pubdate) {
            const rt = formatRelativeTime(info.pubdate);
            if (rt) timeEl.textContent = '· ' + rt;
        }
    }

    async function fetchLiveBiliView(bvid) {
        const cached = liveInfoCache.get(bvid);
        if (cached && Date.now() - cached.ts < LIVE_CACHE_TTL) {
            return cached.data;
        }
        try {
            const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
                credentials: 'include',
            });
            const j = await resp.json();
            if (j && j.code === 0 && j.data) {
                liveInfoCache.set(bvid, { ts: Date.now(), data: j.data });
                return j.data;
            }
        } catch { }
        return null;
    }

    async function hydrateCardsWithLiveStats(gridEl) {
        const cards = Array.from(gridEl.querySelectorAll('.pp-card')).slice(0, MAX_LIVE_FETCH);
        let idx = 0;
        const concurrency = 4;
        async function worker() {
            while (idx < cards.length && tabActive) {
                const card = cards[idx++];
                const bvid = card.dataset.bvid;
                if (!bvid) continue;
                const info = await fetchLiveBiliView(bvid);
                if (info) applyLiveDataToCard(card, info);
            }
        }
        await Promise.all(Array.from({ length: concurrency }, worker));
    }

    function renderVideos(videos) {
        const grid = document.querySelector('.pp-grid');
        const countEl = document.querySelector('.pp-count');
        if (!grid) return;

        syncNativeGridStyle(grid);
        grid.innerHTML = '';

        if (!videos || videos.length === 0) {
            grid.innerHTML = `<div class="pp-empty">📭 暂无个人推送视频<br><span style="font-size:12px;opacity:.7;">请确认推送服务端 (${escapeHtml(getApiUrl())}) 已正常运行</span></div>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        const sorted = [...videos]
            .filter((v) => v && (v.bvid || v.id))
            .sort((a, b) => Number(b.publishTime || b.pubdate || 0) - Number(a.publishTime || a.pubdate || 0));

        for (const v of sorted) {
            const card = createCardElement(v);
            const cachedLive = liveInfoCache.get(v.bvid || v.id);
            if (cachedLive) applyLiveDataToCard(card, cachedLive.data);
            grid.appendChild(card);
        }

        if (countEl) countEl.textContent = `共 ${sorted.length} 个视频（数据实时拉取）`;
        hydrateCardsWithLiveStats(grid);
    }

    function fetchPushServer() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: getApiUrl(),
                timeout: 10000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const items = Array.isArray(data) ? data : (data.items || []);
                        resolve(items);
                    } catch {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
            });
        });
    }

    async function refreshFeed(forceLive = false) {
        if (forceLive) liveInfoCache.clear();
        const items = await fetchPushServer();
        if (items && items.length > 0) {
            currentVideos = items;
            saveCache(items);
            if (tabActive) renderVideos(items);
        } else if (tabActive && currentVideos.length === 0) {
            renderVideos([]);
        }
    }

    function findTabBar() {
        const rg = document.querySelector('.bilibili-gate-root .ant-radio-group');
        if (rg) return rg;
        const tab = document.querySelector('.bilibili-gate-root .video-source-tab');
        return tab ? tab.parentElement : null;
    }

    function findContentArea() {
        const dataTabs = document.querySelectorAll('.bilibili-gate-root [data-tab]');
        if (dataTabs.length > 0) return dataTabs[0].parentElement;
        const card = document.querySelector('.bilibili-gate-root .bili-video-card');
        if (card) {
            let el = card;
            while (el && el.parentElement && !el.parentElement.classList.contains('bilibili-gate-root')) {
                el = el.parentElement;
            }
            return el ? el.parentElement : null;
        }
        return null;
    }

    function createTabButton() {
        const firstTab = document.querySelector('.bilibili-gate-root .video-source-tab');
        const classes = firstTab
            ? Array.from(firstTab.classList).filter((c) => !c.includes('checked'))
            : ['ant-radio-button-wrapper', 'video-source-tab'];

        const label = document.createElement('label');
        label.className = classes.join(' ') + ' pp-tab-btn';
        const iconSvg = `<svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" class="size-18px mr-4px"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.6 7.4-5.2 5.2a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 1 1 1.4-1.4l1.9 1.9 4.5-4.5a1 1 0 0 1 1.4 1.4z"/></svg>`;
        label.innerHTML = `
            <span class="ant-radio-button">
                <input tabindex="-1" class="ant-radio-button-input" type="radio" value="${TAB_KEY}">
                <span class="ant-radio-button-inner"></span>
            </span>
            <span class="ant-radio-button-label">
                <span class="h-full flex items-center line-height-unset">${iconSvg}个人推送</span>
            </span>`;
        return label;
    }

    function activateTab(tabBar, contentArea) {
        tabActive = true;
        for (const child of tabBar.children) {
            if (child.classList.contains('pp-tab-btn')) continue;
            child.classList.remove('ant-radio-button-wrapper-checked');
            const inner = child.querySelector('.ant-radio-button');
            if (inner) inner.classList.remove('ant-radio-button-checked');
            const inp = child.querySelector('input[type="radio"]');
            if (inp) inp.checked = false;
        }
        const btn = tabBar.querySelector('.pp-tab-btn');
        if (btn) {
            btn.classList.add('ant-radio-button-wrapper-checked');
            const inner = btn.querySelector('.ant-radio-button');
            if (inner) inner.classList.add('ant-radio-button-checked');
            const inp = btn.querySelector('input[type="radio"]');
            if (inp) inp.checked = true;
        }
        if (contentArea) {
            for (const child of contentArea.children) {
                if (child.classList.contains('pp-panel')) {
                    child.classList.add('is-active');
                } else {
                    if (child._ppOrigDisplay === undefined) child._ppOrigDisplay = child.style.display;
                    child.style.display = 'none';
                }
            }
        }
        const cached = currentVideos.length > 0 ? currentVideos : loadCache();
        if (cached.length > 0) renderVideos(cached);
        refreshFeed(false);
    }

    function deactivateTab(tabBar) {
        tabActive = false;
        const btn = tabBar.querySelector('.pp-tab-btn');
        if (btn) {
            btn.classList.remove('ant-radio-button-wrapper-checked');
            const inner = btn.querySelector('.ant-radio-button');
            if (inner) inner.classList.remove('ant-radio-button-checked');
            const inp = btn.querySelector('input[type="radio"]');
            if (inp) inp.checked = false;
        }
        const panel = document.querySelector('.pp-panel');
        const contentArea = panel ? panel.parentElement : null;
        if (contentArea) {
            for (const child of contentArea.children) {
                if (child.classList.contains('pp-panel')) {
                    child.classList.remove('is-active');
                } else if (child._ppOrigDisplay !== undefined) {
                    child.style.display = child._ppOrigDisplay;
                    delete child._ppOrigDisplay;
                }
            }
        }
    }

    function inject() {
        const tabBar = findTabBar();
        if (!tabBar || tabBar.querySelector('.pp-tab-btn')) return;
        const contentArea = findContentArea();
        if (!contentArea) return;

        const btn = createTabButton();
        tabBar.appendChild(btn);

        if (!contentArea.querySelector('.pp-panel')) {
            const panel = document.createElement('div');
            panel.className = 'pp-panel';
            panel.innerHTML = `
                <div class="pp-toolbar">
                    <span class="pp-count"></span>
                    <button class="pp-refresh-btn" type="button">↻ 刷新最新数据</button>
                </div>
                <div class="pp-grid"></div>
            `;
            panel.querySelector('.pp-refresh-btn').addEventListener('click', () => refreshFeed(true));
            contentArea.appendChild(panel);
        }

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            activateTab(tabBar, contentArea);
        });

        for (const child of tabBar.children) {
            if (child.classList.contains('pp-tab-btn')) continue;
            child.addEventListener('click', () => {
                if (tabActive) deactivateTab(tabBar);
            });
        }
    }

    const observer = new MutationObserver(() => inject());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(inject, 1000);
    setTimeout(inject, 2500);
})();
