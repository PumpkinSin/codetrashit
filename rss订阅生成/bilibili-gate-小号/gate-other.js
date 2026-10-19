// ==UserScript==
// @name         Bilibili-Gate 小号独立标签
// @namespace    bilibili-alt-tab
// @version      5.1.0
// @description  在 Bilibili-Gate 新增独立「小号」Tab，展示聚合服务抓取的小号视频
// @author       You
// @match        *://www.bilibili.com/
// @match        *://www.bilibili.com/?*
// @match        *://www.bilibili.com/index.html
// @match        *://www.bilibili.com/index.html?*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      127.0.0.1
// @run-at       document-idle
// @noframes
// UI 适配基于 magicdawn 的 Bilibili-Gate 项目 (MIT License)
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const API_URL = 'http://127.0.0.1:3457/api/data/bilibili-alt';
    const CACHE_KEY = 'alt-feed-cache';
    const ALT_TAB_KEY = 'alt-feed';
    const POLL_INTERVAL = 30000; // 30s 轮询刷新
    let altTabActive = false;
    let lastFetchedVideos = [];

    // 从 localStorage 读取缓存
    function loadCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }
    function saveCache(videos) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(videos)); } catch { }
    }

    // ============================================================
    // 注入样式
    // ============================================================
    GM_addStyle(`
    /* ---- 小号 Tab 按钮 ---- */
    .alt-tab-btn {
      cursor: pointer;
      user-select: none;
      position: relative;
    }

    /* ---- 小号面板 ---- */
    .alt-feed-panel {
      display: none;
      width: 100%;
    }
    .alt-feed-panel.is-active {
      display: block;
    }
    .alt-feed-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px 12px;
      padding: 12px 0;
    }

    /* ---- 空状态 ---- */
    .alt-feed-empty {
      text-align: center;
      padding: 60px 20px;
      color: #999;
      font-size: 14px;
    }
    .alt-feed-empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    /* ---- 刷新按钮 ---- */
    .alt-feed-toolbar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 8px 0;
      gap: 12px;
    }
    .alt-feed-refresh {
      cursor: pointer;
      padding: 4px 12px;
      border: 1px solid #00aeec;
      border-radius: 6px;
      background: transparent;
      color: #00aeec;
      font-size: 12px;
      transition: all 0.2s;
    }
    .alt-feed-refresh:hover {
      background: #00aeec;
      color: #fff;
    }
    .alt-feed-count {
      font-size: 12px;
      color: #999;
    }

    /* ---- 防止卡片内容被裁剪 ---- */
    .alt-injected-card,
    .alt-injected-card .bili-video-card__wrap {
      overflow: visible !important;
      height: auto !important;
    }
    .alt-injected-card .bili-video-card__info--tit {
      height: auto !important;
      max-height: none !important;
    }
    .alt-feed-grid {
      grid-auto-rows: min-content !important;
    }
    `);

    // ============================================================
    // 获取小号视频数据（从服务器获取并更新缓存）
    // ============================================================
    function fetchAltVideos() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: API_URL,
                responseType: 'json',
                onload(resp) {
                    try {
                        const json = typeof resp.response === 'string'
                            ? JSON.parse(resp.response)
                            : resp.response;
                        if (json && json.code === 0 && Array.isArray(json.data)) {
                            // 转换为卡片所需格式
                            const videos = json.data.map(item => ({
                                bvid: item.id || '',
                                title: item.rawTitle || item.title || item.content || '',
                                cover: item.videoCover || '',
                                author: item.author || '',
                                authorFace: item.authorFace || '',
                                authorMid: item.authorMid || '',
                                pubdate: item.publishTime ? Math.floor(item.publishTime / 1000) : 0,
                                play: item.stats?.view || 0,
                                danmaku: item.stats?.danmaku || 0,
                                duration: 0,
                                durationStr: item.videoDuration || '',
                            }));
                            // 从 link 中提取 bvid
                            for (let i = 0; i < videos.length; i++) {
                                const link = json.data[i].link || '';
                                const m = link.match(/\/video\/(BV[a-zA-Z0-9]+)/);
                                if (m) videos[i].bvid = m[1];
                            }
                            const limited = videos.slice(0, 100);
                            saveCache(limited);
                            lastFetchedVideos = limited;
                            resolve(limited);
                        } else {
                            resolve([]);
                        }
                    } catch { resolve([]); }
                },
                onerror() { resolve([]); },
                ontimeout() { resolve([]); },
            });
        });
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function getAltVideoTimestamp(video) {
        return video.pubdate || video.pubts || video.receivedAt || 0;
    }

    function formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function formatCount(n) {
        if (!n && n !== 0) return '';
        if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
        return String(n);
    }

    function formatDuration(sec) {
        if (!sec) return '';
        sec = Math.floor(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ============================================================
    // 创建视频卡片（完全匹配 Gate 风格）
    // ============================================================
    function createVideoCard(video) {
        let coverBase = video.cover || '';
        if (coverBase.startsWith('//')) coverBase = 'https:' + coverBase;
        else if (coverBase.startsWith('http://')) coverBase = coverBase.replace('http://', 'https://');
        const ts = getAltVideoTimestamp(video);
        const dateStr = formatDate(ts);
        const playStr = formatCount(video.play || video.view);
        const danmakuStr = formatCount(video.danmaku || video.video_review);
        const durationStr = video.durationStr || formatDuration(video.duration);
        const authorFace = video.authorFace || video.face || '';
        const videoUrl = `/video/${video.bvid}/`;
        const spaceUrl = video.authorMid ? `https://space.bilibili.com/${video.authorMid}/dynamic` : '#';

        // play icon SVG (Gate 原版)
        const playSvg = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" class="size-18px"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"></path><path d="M14.7138 10.96875C15.50765 11.4271 15.50765 12.573 14.71375 13.0313L11.5362 14.8659C10.74235 15.3242 9.75 14.7513 9.75001 13.8346L9.75001 10.1655C9.75001 9.24881 10.74235 8.67587 11.5362 9.13422L14.7138 10.96875z"></path></svg>`;

        // danmaku icon SVG (Gate 原版)
        const danmakuSvg = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" class="size-18px"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"></path><path d="M15.875 10.75L9.875 10.75C9.46079 10.75 9.125 10.4142 9.125 10C9.125 9.58579 9.46079 9.25 9.875 9.25L15.875 9.25C16.2892 9.25 16.625 9.58579 16.625 10C16.625 10.4142 16.2892 10.75 15.875 10.75z"></path><path d="M17.375 14.75L11.375 14.75C10.9608 14.75 10.625 14.4142 10.625 14C10.625 13.5858 10.9608 13.25 11.375 13.25L17.375 13.25C17.7892 13.25 18.125 13.5858 18.125 14C18.125 14.4142 17.7892 14.75 17.375 14.75z"></path><path d="M7.875 10C7.875 10.4142 7.53921 10.75 7.125 10.75L6.625 10.75C6.21079 10.75 5.875 10.4142 5.875 10C5.875 9.58579 6.21079 9.25 6.625 9.25L7.125 9.25C7.53921 9.25 7.875 9.58579 7.875 10z"></path><path d="M9.375 14C9.375 14.4142 9.03921 14.75 8.625 14.75L8.125 14.75C7.71079 14.75 7.375 14.4142 7.375 14C7.375 13.5858 7.71079 13.25 8.125 13.25L8.625 13.25C9.03921 13.25 9.375 13.5858 9.375 14z"></path></svg>`;

        const card = document.createElement('div');
        card.className = 'bili-video-card bilibili-gate-video-card relative alt-injected-card';
        card.dataset.bvid = video.bvid;

        card.innerHTML = `
            <div class="bili-video-card__wrap">
                <a href="${videoUrl}" target="_blank" class="bilibili-gate-video-card-cover relative block overflow-hidden" style="border-radius: var(--bilibili-gate--video-card--border-radius, 15px);">
                    <div class="bili-video-card__image" style="aspect-ratio: 16 / 9;">
                        <div class="bili-video-card__image--wrap">
                            <picture class="h-full w-full object-cover bili-video-card__cover v-img" style="border-radius: 0px;">
                                ${coverBase ? `
                                <source srcset="${coverBase}@672w_378h_1c_!web-home-common-cover.avif" type="image/avif">
                                <source srcset="${coverBase}@672w_378h_1c_!web-home-common-cover.webp" type="image/webp">
                                <img loading="lazy" class="block h-full w-full" style="object-fit:cover;" alt="${escapeHtml(video.title)}" referrerpolicy="no-referrer"
                                     src="${coverBase}@672w_378h_1c_!web-home-common-cover">
                                ` : `<div style="width:100%;height:100%;background:#333;"></div>`}
                            </picture>
                        </div>
                    </div>
                    <div class="bili-video-card__stats" style="position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,.6));color:#fff;font-size:13px;border-radius:0 0 var(--bilibili-gate--video-card--border-radius, 15px) var(--bilibili-gate--video-card--border-radius, 15px);">
                        <div class="bili-video-card__stats--left" style="display:flex;align-items:center;gap:4px 8px;">
                            ${playStr ? `<span data-field="play" class="bili-video-card__stats--item" style="display:flex;align-items:center;gap:2px;">${playSvg}<span class="bili-video-card__stats--text" style="line-height:18px;">${playStr}</span></span>` : ''}
                            ${danmakuStr ? `<span data-field="danmaku" class="bili-video-card__stats--item" style="display:flex;align-items:center;gap:2px;">${danmakuSvg}<span class="bili-video-card__stats--text" style="line-height:18px;">${danmakuStr}</span></span>` : ''}
                        </div>
                        ${durationStr ? `<span class="bili-video-card__stats__duration">${durationStr}</span>` : ''}
                    </div>
                </a>
                <div style="padding:8px 5px 6px;">
                    <h3 class="bili-video-card__info--tit" title="${escapeHtml(video.title)}" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;font-size:14px;line-height:1.4;font-weight:500;margin:0;">
                        <a href="${videoUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escapeHtml(video.title)}</a>
                    </h3>
                    <a class="bili-video-card__info--owner" href="${spaceUrl}" target="_blank"
                       title="${escapeHtml(video.author)}${dateStr ? ' · ' + dateStr : ''}"
                       style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:13px;color:var(--bilibili-gate--text-color-lighter, #9499a0);text-decoration:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
                        ${authorFace ? `<img src="${authorFace}@48w_48h_1c_1s_!web-avatar.avif" referrerpolicy="no-referrer" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;" />` : ''}
                        <span class="bili-video-card__info--author" style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(video.author)}</span>
                        ${dateStr ? `<span class="bili-video-card__info--date" style="flex-shrink:0;">· ${dateStr}</span>` : ''}
                    </a>
                </div>
            </div>`;

        return card;
    }

    // ============================================================
    // 渲染视频到面板
    // ============================================================
    function renderVideosToPanel(videos) {
        const grid = document.querySelector('.alt-feed-grid');
        const countEl = document.querySelector('.alt-feed-count');
        if (!grid) return;

        grid.innerHTML = '';

        if (!videos || videos.length === 0) {
            grid.innerHTML = `
                <div class="alt-feed-empty" style="grid-column: 1 / -1;">
                    <div class="alt-feed-empty-icon">📭</div>
                    <div>暂无小号视频</div>
                    <div style="font-size:12px;margin-top:6px;color:#bbb;">请确保聚合服务已启动且扩展已抓取数据</div>
                </div>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        // 按时间排序（最新的排前面）
        const sorted = [...videos].sort((a, b) => getAltVideoTimestamp(b) - getAltVideoTimestamp(a));

        for (const video of sorted) {
            if (!video.bvid) continue;
            grid.appendChild(createVideoCard(video));
        }

        if (countEl) countEl.textContent = `共 ${sorted.length} 个视频`;
    }

    // ============================================================
    // 刷新小号数据
    // ============================================================
    async function refreshAltFeed() {
        const btn = document.querySelector('.alt-feed-refresh');
        if (btn) {
            btn.textContent = '⏳ 刷新中...';
            btn.disabled = true;
        }

        const videos = await fetchAltVideos();
        lastFetchedVideos = videos;
        renderVideosToPanel(videos);

        if (btn) {
            btn.textContent = '🔄 刷新';
            btn.disabled = false;
        }
    }

    // ============================================================
    // 创建小号内容面板
    // ============================================================
    function createAltPanel() {
        const panel = document.createElement('div');
        panel.className = 'alt-feed-panel';
        panel.dataset.tab = ALT_TAB_KEY;
        panel.innerHTML = `
            <div class="alt-feed-toolbar">
                <span class="alt-feed-count"></span>
                <button class="alt-feed-refresh">🔄 刷新</button>
            </div>
            <div class="alt-feed-grid"></div>`;

        panel.querySelector('.alt-feed-refresh').addEventListener('click', refreshAltFeed);
        return panel;
    }

    // ============================================================
    // 查找 Bilibili-Gate 的 Tab 栏（Ant Design Radio Group）
    // ============================================================
    function findGateTabBar() {
        // Gate 使用 ant-radio-group，内部包含 .video-source-tab
        const radioGroup = document.querySelector('.bilibili-gate-root .ant-radio-group');
        if (radioGroup) return radioGroup;

        // 备选：直接找包含 video-source-tab 的父容器
        const tab = document.querySelector('.bilibili-gate-root .video-source-tab');
        if (tab) return tab.parentElement;

        return null;
    }

    function findGateContentArea() {
        // 内容区域：包含 data-tab 属性的容器
        const dataTabs = document.querySelectorAll('.bilibili-gate-root [data-tab]');
        if (dataTabs.length > 0) {
            return dataTabs[0].parentElement;
        }

        // 备选：找包含视频网格的区域
        const cards = document.querySelectorAll('.bilibili-gate-root .bili-video-card');
        if (cards.length > 0) {
            let el = cards[0];
            while (el && el.parentElement) {
                el = el.parentElement;
                if (el.classList.contains('bilibili-gate-root')) break;
                for (const s of (el.parentElement?.children || [])) {
                    if (s.dataset && s.dataset.tab) return el.parentElement;
                }
            }
        }

        return null;
    }

    // ============================================================
    // 创建 Ant Design 风格的 Tab 按钮
    // ============================================================
    function createAltTabButton() {
        // 复制第一个 tab 的 CSS class（不含 checked 相关的）
        const firstTab = document.querySelector('.bilibili-gate-root .video-source-tab');
        const cssClasses = [];
        if (firstTab) {
            for (const cls of firstTab.classList) {
                if (!cls.includes('checked')) {
                    cssClasses.push(cls);
                }
            }
        } else {
            cssClasses.push('ant-radio-button-wrapper', 'video-source-tab');
        }

        const label = document.createElement('label');
        label.className = cssClasses.join(' ') + ' alt-tab-btn';

        // 小号 SVG 图标（用户图标）
        const iconSvg = `<svg viewBox="0 0 1024 1024" fill="currentColor" width="1em" height="1em" class="size-18px mr-4px">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-87.2 0-167.4-30.4-230.4-81.2C320 734.4 412.8 688 512 688s192 46.4 230.4 114.8C679.4 853.6 599.2 884 512 884zm288-548c0 44.2-35.8 80-80 80s-80-35.8-80-80 35.8-80 80-80 80 35.8 80 80zm-400 0c0 44.2-35.8 80-80 80s-80-35.8-80-80 35.8-80 80-80 80 35.8 80 80zm200 120c-88 0-160-72-160-160s72-160 160-160 160 72 160 160-72 160-160 160z"/>
        </svg>`;

        label.innerHTML = `
            <span class="ant-radio-button">
                <input tabindex="-1" class="ant-radio-button-input" type="radio" value="${ALT_TAB_KEY}" name="_r_1_">
                <span class="ant-radio-button-inner"></span>
            </span>
            <span class="ant-radio-button-label">
                <span class="h-full flex items-center line-height-unset">
                    ${iconSvg}小号
                </span>
            </span>`;

        return label;
    }

    // ============================================================
    // 激活小号 Tab
    // ============================================================
    function activateAltTab(tabBar, contentArea) {
        altTabActive = true;

        // 取消其他 tab 的 checked 状态
        for (const child of tabBar.children) {
            if (child.classList.contains('alt-tab-btn')) continue;
            child.classList.remove('ant-radio-button-wrapper-checked');
            const innerBtn = child.querySelector('.ant-radio-button');
            if (innerBtn) innerBtn.classList.remove('ant-radio-button-checked');
            // 取消 radio input 的 checked
            const input = child.querySelector('input[type="radio"]');
            if (input) input.checked = false;
        }

        // 激活小号 tab
        const altBtn = tabBar.querySelector('.alt-tab-btn');
        if (altBtn) {
            altBtn.classList.add('ant-radio-button-wrapper-checked');
            const innerBtn = altBtn.querySelector('.ant-radio-button');
            if (innerBtn) innerBtn.classList.add('ant-radio-button-checked');
            const input = altBtn.querySelector('input[type="radio"]');
            if (input) input.checked = true;
        }

        // 隐藏所有原生 tab 内容
        if (contentArea) {
            for (const child of contentArea.children) {
                if (child.classList.contains('alt-feed-panel')) {
                    child.classList.add('is-active');
                } else {
                    child._altOriginalDisplay = child.style.display;
                    child.style.display = 'none';
                }
            }
        }

        // 先显示缓存数据，再后台刷新
        const cached = lastFetchedVideos.length > 0 ? lastFetchedVideos : loadCache();
        if (cached.length > 0) {
            renderVideosToPanel(cached);
        }
        // 后台刷新最新数据
        refreshAltFeed();
    }

    // ============================================================
    // 取消激活小号 Tab
    // ============================================================
    function deactivateAltTab(tabBar) {
        altTabActive = false;

        // 移除小号 tab 的 checked 状态
        const altBtn = tabBar.querySelector('.alt-tab-btn');
        if (altBtn) {
            altBtn.classList.remove('ant-radio-button-wrapper-checked');
            const innerBtn = altBtn.querySelector('.ant-radio-button');
            if (innerBtn) innerBtn.classList.remove('ant-radio-button-checked');
            const input = altBtn.querySelector('input[type="radio"]');
            if (input) input.checked = false;
        }

        // 恢复原始内容显示
        const contentArea = document.querySelector('.alt-feed-panel')?.parentElement;
        if (contentArea) {
            for (const child of contentArea.children) {
                if (child.classList.contains('alt-feed-panel')) {
                    child.classList.remove('is-active');
                } else if (child._altOriginalDisplay !== undefined) {
                    child.style.display = child._altOriginalDisplay;
                    delete child._altOriginalDisplay;
                }
            }
        }
    }

    // ============================================================
    // 注入 Tab 和面板
    // ============================================================
    let injected = false;

    function tryInject() {
        if (injected) return;

        const tabBar = findGateTabBar();
        if (!tabBar) return;

        // 已经注入过了？
        if (tabBar.querySelector('.alt-tab-btn')) {
            injected = true;
            return;
        }

        console.log('[小号独立Tab] 找到 Gate Tab 栏（ant-radio-group），开始注入');

        // 找到内容区域
        const contentArea = findGateContentArea();

        // 创建小号 tab 按钮（Ant Design 格式）
        const altTab = createAltTabButton();

        // 小号 tab 按钮点击事件
        altTab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (altTabActive) return;
            activateAltTab(tabBar, contentArea);
        });

        // 拦截其他 tab 的点击 — 取消小号 tab 激活状态
        for (const child of tabBar.children) {
            child.addEventListener('click', () => {
                if (altTabActive) {
                    deactivateAltTab(tabBar);
                }
            }, true);
        }

        // 将小号 tab 添加到 tab 栏
        tabBar.appendChild(altTab);

        // 创建并添加小号内容面板
        if (contentArea) {
            contentArea.appendChild(createAltPanel());
        } else {
            // 如果找不到内容区，在 tab 栏后面创建
            const panelContainer = document.createElement('div');
            panelContainer.style.width = '100%';
            panelContainer.appendChild(createAltPanel());
            tabBar.parentElement.appendChild(panelContainer);
        }

        injected = true;
        console.log('[小号独立Tab] ✅ 注入完成');
    }

    // ============================================================
    // 监听 Gate 重渲染，重新注入
    // ============================================================
    function watchTabChanges() {
        const gateRoot = document.querySelector('.bilibili-gate-root');
        if (!gateRoot) return;

        const observer = new MutationObserver(() => {
            if (!injected) {
                tryInject();
                return;
            }

            // 如果小号 tab 按钮从 DOM 中消失了（Gate 重渲染），重新注入
            if (!document.querySelector('.alt-tab-btn')) {
                injected = false;
                altTabActive = false;
                tryInject();
            }
        });

        observer.observe(gateRoot, { childList: true, subtree: true });
    }

    // ============================================================
    // 定期轮询刷新（仅在小号 tab 激活时）
    // ============================================================
    setInterval(() => {
        if (altTabActive) {
            refreshAltFeed();
        }
    }, POLL_INTERVAL);

    // ============================================================
    // 启动
    // ============================================================
    function init() {
        const gateRoot = document.querySelector('.bilibili-gate-root');
        if (gateRoot) {
            tryInject();
            watchTabChanges();
            // 启动时预拉取数据到缓存，切 Tab 时可立即显示
            fetchAltVideos().then(videos => {
                lastFetchedVideos = videos;
                console.log(`[小号独立Tab] v5.2 已加载，预缓存 ${videos.length} 条`);
            });
        } else {
            setTimeout(init, 1000);
        }
    }

    // 等待页面加载
    setTimeout(init, 2000);
})();
