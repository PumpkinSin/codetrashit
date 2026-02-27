// ==UserScript==
// @name         Bilibili-Gate 小号独立标签
// @namespace    bilibili-alt-tab
// @version      5.0.0
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
    const API_URL = 'http://127.0.0.1:8080/get_videos';
    const ALT_TAB_KEY = 'alt-feed';
    const POLL_INTERVAL = 30000; // 30s 轮询刷新
    let altTabActive = false;
    let lastFetchedVideos = [];

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

    /* ---- 小号 badge ---- */
    .alt-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      background: linear-gradient(135deg, #ff6699, #ff3366);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      z-index: 10;
      pointer-events: none;
      line-height: 1.3;
      letter-spacing: 0.5px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
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

    /* ---- 卡片样式修正 ---- */
    .alt-injected-card .bili-video-card__wrap {
      position: relative !important;
    }
    `);

    // ============================================================
    // 获取小号视频数据
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
                            resolve(json.data);
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
    // 创建视频卡片（与 Gate 风格一致）
    // ============================================================
    function createVideoCard(video) {
        const coverUrl = video.cover
            ? (video.cover.startsWith('//') ? 'https:' + video.cover : video.cover) + '@412w_232h_1c.webp'
            : '';
        const ts = getAltVideoTimestamp(video);
        const dateStr = formatDate(ts);
        const playStr = formatCount(video.play || video.view);
        const danmakuStr = formatCount(video.danmaku || video.video_review);
        const durationStr = video.durationStr || formatDuration(video.duration);
        const authorFace = video.authorFace || video.face || '';

        const card = document.createElement('div');
        card.className = 'bili-video-card alt-injected-card';
        card.dataset.bvid = video.bvid;

        // 统计叠加层
        let statsHtml = '';
        if (playStr || danmakuStr || durationStr) {
            statsHtml = `
            <div class="bili-video-card__stats" style="position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:linear-gradient(transparent,rgba(0,0,0,.6));color:#fff;font-size:12px;border-radius:0 0 var(--bilibili-gate--video-card--border-radius, 15px) var(--bilibili-gate--video-card--border-radius, 15px);">
                <div class="bili-video-card__stats--left" style="display:flex;align-items:center;gap:8px;">
                    ${playStr ? `<span class="bili-video-card__stats--item" style="display:flex;align-items:center;gap:2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="opacity:.9"><path d="M8 5v14l11-7z"/></svg>
                        <span class="bili-video-card__stats--text">${playStr}</span>
                    </span>` : ''}
                    ${danmakuStr ? `<span class="bili-video-card__stats--item" style="display:flex;align-items:center;gap:2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="opacity:.9"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                        <span class="bili-video-card__stats--text">${danmakuStr}</span>
                    </span>` : ''}
                </div>
                ${durationStr ? `<span class="bili-video-card__stats--duration">${durationStr}</span>` : ''}
            </div>`;
        }

        // 作者信息
        let ownerHtml = '';
        if (video.author) {
            ownerHtml = `
            <a class="bili-video-card__info--owner"
               href="javascript:void(0)"
               style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:13px;color:var(--bilibili-gate--text-color-lighter, #9499a0);text-decoration:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
                ${authorFace ? `<img src="${authorFace}@48w_48h.webp" referrerpolicy="no-referrer" style="width:22px;height:22px;border-radius:50%;flex-shrink:0;" />` : ''}
                <span class="bili-video-card__info--author">${escapeHtml(video.author)}</span>
                ${dateStr ? `<span class="bili-video-card__info--date" style="flex-shrink:0;"> · ${dateStr}</span>` : ''}
            </a>`;
        }

        card.innerHTML = `
            <div class="bili-video-card__wrap __scale-wrap" style="position:relative;">
                <div class="alt-badge">小号</div>
                <a href="https://www.bilibili.com/video/${video.bvid}/" target="_blank"
                   class="bili-video-card__image --cover"
                   style="display:block;position:relative;">
                    <div class="bili-video-card__image--wrap"
                         style="position:relative;padding-top:56.25%;overflow:hidden;border-radius:var(--bilibili-gate--video-card--border-radius, 15px);">
                        <img src="${coverUrl}" alt="${escapeHtml(video.title)}"
                             loading="lazy" referrerpolicy="no-referrer"
                             style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" />
                    </div>
                    ${statsHtml}
                </a>
                <div class="bili-video-card__info" style="padding:8px 0 0;">
                    <h3 class="bili-video-card__info--tit"
                        title="${escapeHtml(video.title)}"
                        style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;font-size:15px;line-height:1.4;font-weight:500;color:var(--bilibili-gate--text-color, #18191c);margin:0;">
                        <a href="https://www.bilibili.com/video/${video.bvid}/" target="_blank"
                           style="color:inherit;text-decoration:none;">
                            ${escapeHtml(video.title)}
                        </a>
                    </h3>
                    ${ownerHtml}
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

        // 拉取并渲染数据
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
            console.log('[小号独立Tab] v5.0 已加载');
        } else {
            setTimeout(init, 1000);
        }
    }

    // 等待页面加载
    setTimeout(init, 2000);
})();
