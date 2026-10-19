// ==UserScript==
// @name         CLIP STUDIO笔刷入库
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  自动点击收藏和下载按钮，可选阻止弹窗和下载后自动关闭，支持自动跳转繁中；排行榜/搜索页面可静默批量收藏并入库（无需打开新标签页）
// @author       ai
// @match        https://assets.clip-studio.com/*
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      assets.clip-studio.com
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/562667/CLIP%20STUDIO%E7%AC%94%E5%88%B7%E5%85%A5%E5%BA%93.user.js
// @updateURL https://update.greasyfork.org/scripts/562667/CLIP%20STUDIO%E7%AC%94%E5%88%B7%E5%85%A5%E5%BA%93.meta.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('CLIP STUDIO 自动收藏下载笔刷脚本已启动');

    // ========================================
    // 配置选项
    // ========================================
    const CONFIG_KEY = 'blockPopup';
    const AUTO_CLOSE_KEY = 'autoClose';
    const SKIP_PAID_KEY = 'skipPaidMaterials';
    const AUTO_REDIRECT_ZHTW_KEY = 'autoRedirectZhTw';
    const CLAIM_DELAY_KEY = 'claimDelayMs'; // 批量静默领取每条素材之间的间隔（毫秒）
    let blockPopupEnabled = GM_getValue(CONFIG_KEY, true); // 默认启用阻止弹窗
    let autoCloseEnabled = GM_getValue(AUTO_CLOSE_KEY, false); // 默认不启用自动关闭
    let skipPaidMaterials = GM_getValue(SKIP_PAID_KEY, false); // 默认不跳过付费素材
    let autoRedirectZhTw = GM_getValue(AUTO_REDIRECT_ZHTW_KEY, false); // 默认不启用自动跳转繁中
    let claimDelayMs = GM_getValue(CLAIM_DELAY_KEY, 3000); // 默认 3 秒延迟

    // ========================================
    // 设置面板 UI
    // ========================================
    const openSettingsPanel = () => {
        // 避免重复创建
        if (document.getElementById('csa-settings-panel')) {
            document.getElementById('csa-settings-panel').remove();
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'csa-settings-panel';
        panel.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            z-index: 2147483647; width: 340px;
            background: #1e1e2e; border: 1px solid #44475a;
            border-radius: 12px; padding: 20px 24px 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #cdd6f4; box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        `;

        const settings = [
            { key: CONFIG_KEY, label: '阻止下载弹窗', desc: '屏蔽「要打开 CLIP STUDIO 吗？」弹窗', get: () => blockPopupEnabled, set: v => { blockPopupEnabled = v; } },
            { key: AUTO_CLOSE_KEY, label: '下载后自动关闭', desc: '入库完成后自动关闭该标签页', get: () => autoCloseEnabled, set: v => { autoCloseEnabled = v; } },
            { key: SKIP_PAID_KEY, label: '跳过付费素材', desc: '批量领取时跳过需要 G/CP 的素材', get: () => skipPaidMaterials, set: v => { skipPaidMaterials = v; } },
            { key: AUTO_REDIRECT_ZHTW_KEY, label: '自动跳转繁中', desc: '打开页面时自动跳转到繁体中文版本', get: () => autoRedirectZhTw, set: v => { autoRedirectZhTw = v; } },
        ];

        const rows = settings.map(s => {
            const id = `csa-toggle-${s.key}`;
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #313244;">
                <div>
                    <div style="font-size:13px;font-weight:500;">${s.label}</div>
                    <div style="font-size:11px;color:#6c7086;margin-top:2px;">${s.desc}</div>
                </div>
                <label style="position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;margin-left:12px;">
                    <input type="checkbox" id="${id}" ${s.get() ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                    <span style="position:absolute;cursor:pointer;inset:0;background:${s.get() ? '#89b4fa' : '#45475a'};border-radius:22px;transition:.2s;">
                        <span style="position:absolute;content:'';height:16px;width:16px;left:${s.get() ? '21px' : '3px'};bottom:3px;background:#fff;border-radius:50%;transition:.2s;"></span>
                    </span>
                </label>
            </div>`;
        }).join('');

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="font-size:15px;font-weight:600;color:#cba6f7;">⚙️ CLIP STUDIO 笔刷入库 · 设置</div>
                <button id="csa-close-btn" style="background:none;border:none;color:#6c7086;font-size:18px;cursor:pointer;padding:0 2px;line-height:1;">✕</button>
            </div>
            ${rows}
            <div style="padding:10px 0;border-bottom:1px solid #313244;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <div style="font-size:13px;font-weight:500;">批量领取间隔</div>
                        <div style="font-size:11px;color:#6c7086;margin-top:2px;">每个素材之间的等待时间（防风控）</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:12px;">
                        <input id="csa-delay-input" type="number" min="1" max="60" step="0.5"
                            value="${claimDelayMs / 1000}"
                            style="width:54px;padding:4px 6px;background:#313244;border:1px solid #45475a;border-radius:6px;color:#cdd6f4;font-size:13px;text-align:center;">
                        <span style="font-size:12px;color:#6c7086;">秒</span>
                    </div>
                </div>
            </div>
            <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px;">
                <button id="csa-save-btn" style="padding:7px 20px;background:linear-gradient(135deg,#89b4fa,#cba6f7);border:none;border-radius:7px;color:#1e1e2e;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
            </div>
            <div id="csa-saved-msg" style="display:none;text-align:center;color:#a6e3a1;font-size:12px;margin-top:8px;">✓ 已保存，立即生效</div>
        `;

        document.body.appendChild(panel);

        // 关闭按钮
        document.getElementById('csa-close-btn').onclick = () => panel.remove();

        // 点击面板外关闭
        const outsideClick = (e) => { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', outsideClick); } };
        setTimeout(() => document.addEventListener('click', outsideClick), 100);

        // 实时更新 toggle 样式
        settings.forEach(s => {
            const id = `csa-toggle-${s.key}`;
            const checkbox = document.getElementById(id);
            const knob = checkbox.nextElementSibling;
            const dot = knob.querySelector('span');
            checkbox.addEventListener('change', () => {
                const on = checkbox.checked;
                knob.style.background = on ? '#89b4fa' : '#45475a';
                dot.style.left = on ? '21px' : '3px';
            });
        });

        // 保存按钮
        document.getElementById('csa-save-btn').onclick = () => {
            settings.forEach(s => {
                const on = document.getElementById(`csa-toggle-${s.key}`).checked;
                s.set(on);
                GM_setValue(s.key, on);
            });
            const delayInput = parseFloat(document.getElementById('csa-delay-input').value);
            if (!isNaN(delayInput) && delayInput >= 1) {
                claimDelayMs = Math.round(delayInput * 1000);
                GM_setValue(CLAIM_DELAY_KEY, claimDelayMs);
            }
            console.log('✓ 设置已保存');
            document.getElementById('csa-saved-msg').style.display = 'block';
            setTimeout(() => panel.remove(), 1200);
        };
    };

    // 注册单一菜单命令
    GM_registerMenuCommand('⚙️ 打开设置', openSettingsPanel);
    console.log('当前设置 →',
        '阻止弹窗:', blockPopupEnabled,
        '| 自动关闭:', autoCloseEnabled,
        '| 跳过付费:', skipPaidMaterials,
        '| 跳转繁中:', autoRedirectZhTw,
        '| 批量间隔:', claimDelayMs + 'ms'
    );


    // ========================================
    // 功能 1: 自动跳转繁中（可选）
    // ========================================
    if (autoRedirectZhTw) {
        const currentPath = window.location.pathname;
        // 匹配路径中的语言代码 (如 /ko-kr/, /en-us/, /ja-jp/ 等)
        const langMatch = currentPath.match(/^\/(\w{2}-\w{2})\//i);

        if (langMatch && langMatch[1].toLowerCase() !== 'zh-tw') {
            const currentLang = langMatch[1];
            const newUrl = window.location.href.replace(
                new RegExp(`/${currentLang}/`, 'i'),
                '/zh-tw/'
            );
            console.log(`检测到语言: ${currentLang}, 自动跳转到繁中版本...`);
            console.log(`原URL: ${window.location.href}`);
            console.log(`新URL: ${newUrl}`);
            window.location.replace(newUrl);
        } else if (langMatch) {
            console.log('当前已是繁中页面,无需跳转');
        }
    }

    // ========================================
    // 功能 2: 阻止下载弹窗（可选）
    // ========================================
    // 等待 CatalogMaterial 对象加载
    const checkAndReplace = () => {
        if (typeof CatalogMaterial !== 'undefined' && CatalogMaterial.startDownload) {
            console.log('找到 CatalogMaterial.startDownload');

            // 保存原始函数的引用
            const originalStartDownload = CatalogMaterial.startDownload;

            // 替换为条件函数，根据配置决定是否阻止弹窗
            CatalogMaterial.startDownload = function (materialId, uuid) {
                if (blockPopupEnabled) {
                    console.log('已拦截 CLIP STUDIO 弹窗请求');
                    console.log('素材ID:', materialId, 'UUID:', uuid);
                    console.log('笔刷已入库，但不会弹出"要打开 CLIP STUDIO 吗？"的提示框');
                    // 不执行任何操作，直接返回
                    return false;
                } else {
                    console.log('允许弹窗，调用原始下载函数');
                    // 调用原始函数，允许弹窗
                    return originalStartDownload.call(this, materialId, uuid);
                }
            };

            console.log('✓ 成功设置 startDownload 函数拦截器');
        } else {
            // 如果还没加载，继续等待
            setTimeout(checkAndReplace, 100);
        }
    };

    // 开始检查
    checkAndReplace();

    // 额外保险：拦截 location.href 的设置
    try {
        const descriptor = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href');
        if (descriptor && descriptor.set) {
            const originalLocationSetter = descriptor.set;

            Object.defineProperty(window.location, 'href', {
                set: function (url) {
                    if (typeof url === 'string' && url.startsWith('clipstudio://')) {
                        if (blockPopupEnabled) {
                            console.log('已拦截 location.href 设置为 CLIP STUDIO 协议:', url);
                            console.log('笔刷已入库，但不会弹出提示框');
                            return; // 阻止设置
                        } else {
                            console.log('允许 CLIP STUDIO 协议调用:', url);
                        }
                    }
                    originalLocationSetter.call(this, url);
                },
                get: function () {
                    return window.location.href;
                },
                configurable: true
            });

            console.log('✓ 已设置 location.href 拦截器');
        } else {
            console.log('⚠ 无法设置 location.href 拦截器（浏览器不支持），将使用其他方式拦截');
        }
    } catch (error) {
        console.log('⚠ location.href 拦截器设置失败:', error.message);
        console.log('将继续使用 CatalogMaterial.startDownload 拦截方式');
    }

    // ========================================
    // 功能 3: 自动点击收藏和下载按钮
    // ========================================
    let clickAttempts = 0;
    const maxAttempts = 50; // 最多尝试 50 次
    const attemptsPerBatch = 10; // 每批尝试 10 次
    const batchPauseMs = 2000; // 每批之间暂停 2 秒

    const autoClickButtons = () => {
        clickAttempts++;

        // 检查是否在详情页面（包含 /detail 路径）
        if (!window.location.pathname.includes('/detail')) {
            console.log('不在详情页面，跳过自动点击');
            return;
        }

        console.log(`[尝试 ${clickAttempts}/${maxAttempts}] 查找按钮...`);

        // 查找收藏按钮（星标按钮）
        const starButton = document.querySelector('.starButton[data-star-button]');

        // 查找下载按钮 - 使用更宽松的选择器
        const downloadButton = document.querySelector('button[data-material-download-free]');

        console.log('收藏按钮:', starButton ? '✓ 找到' : '✗ 未找到');
        console.log('下载按钮:', downloadButton ? '✓ 找到' : '✗ 未找到');

        if (starButton && downloadButton) {
            console.log('========================================');
            console.log('✓ 找到所有按钮，准备自动点击...');
            console.log('========================================');

            // 先点击收藏按钮
            if (starButton.classList.contains('inactive')) {
                console.log('→ 点击收藏按钮（当前状态：未收藏）');
                try {
                    starButton.click();
                    console.log('✓ 已点击收藏按钮');
                } catch (error) {
                    console.error('✗ 点击收藏按钮失败:', error);
                }
            } else {
                console.log('→ 收藏按钮已激活，跳过点击');
            }

            // 延迟后点击下载按钮
            setTimeout(() => {
                console.log('→ 点击下载按钮');
                try {
                    downloadButton.click();
                    console.log('✓ 已点击下载按钮');
                    console.log('========================================');
                    console.log('✓ 自动收藏和下载完成！');
                    console.log('========================================');

                    // 如果启用了自动关闭，延迟后关闭标签页
                    if (autoCloseEnabled) {
                        setTimeout(() => {
                            console.log('→ 自动关闭标签页...');
                            window.close();
                        }, 1500); // 下载后延迟 1.5 秒关闭
                    }
                } catch (error) {
                    console.error('✗ 点击下载按钮失败:', error);
                }
            }, 800);

        } else {
            // 如果按钮还没加载，继续等待
            if (clickAttempts < maxAttempts) {
                // 检查是否需要暂停（每10次暂停一次）
                const needPause = clickAttempts % attemptsPerBatch === 0;
                const nextDelay = needPause ? batchPauseMs : 200;

                if (needPause) {
                    console.log(`⏸️  已尝试 ${clickAttempts} 次，暂停 ${batchPauseMs / 1000} 秒...`);
                }

                setTimeout(autoClickButtons, nextDelay);
            } else {
                console.error('✗ 超过最大尝试次数，放弃自动点击');
                console.log('请检查页面是否正常加载，或手动点击按钮');
            }
        }
    };

    // 使用多种方式确保脚本执行
    console.log('当前页面状态:', document.readyState);

    // 方式1: DOMContentLoaded
    if (document.readyState === 'loading') {
        console.log('等待 DOMContentLoaded 事件...');
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOMContentLoaded 触发，延迟 500ms 后开始查找按钮');
            setTimeout(autoClickButtons, 500);
        });
    } else {
        // 方式2: 页面已加载，延迟执行
        console.log('页面已加载，延迟 1000ms 后开始查找按钮');
        setTimeout(autoClickButtons, 1000);
    }

    // 方式3: window.onload 作为备用
    window.addEventListener('load', () => {
        console.log('window.load 事件触发');
        // 如果还没找到按钮，再尝试一次
        if (clickAttempts === 0) {
            console.log('备用方案：延迟 500ms 后开始查找按钮');
            setTimeout(autoClickButtons, 500);
        }
    });

    console.log('✓ 自动点击功能已启用');

    // ========================================
    // 功能 4: 排行榜页面手动触发打开未入库素材
    // ========================================
    const initRankingPageButton = () => {
        // 只在排行榜或搜索页面执行
        if (!window.location.pathname.includes('/ranking') && !window.location.pathname.includes('/search')) {
            return;
        }

        const pageType = window.location.pathname.includes('/ranking') ? '排行榜' : '搜索';
        console.log(`✓ 检测到${pageType}页面，添加手动触发按钮...`);

        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'auto-open-unowned-btn';
        buttonContainer.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        `;

        // 创建按钮
        const button = document.createElement('button');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z"/>
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            <span>识别未入库素材</span>
        `;
        button.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px 18px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            transition: all 0.3s ease;
            white-space: nowrap;
        `;

        // 悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
        });

        // 点击事件
        button.addEventListener('click', () => {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'not-allowed';
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                    <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 1 1 6 6v2a8 8 0 0 0 0-16z"/>
                </svg>
                <span>扫描中...</span>
            `;

            // 添加旋转动画
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);

            // 根据页面类型决定是否自动滚动
            const isSearchPage = window.location.pathname.includes('/search');
            if (isSearchPage) {
                // 搜索页面：执行自动加载和扫描
                autoLoadAllContent(button);
            } else {
                // 排行榜页面：直接扫描当前可见素材，不滚动
                console.log('排行榜页面：直接扫描当前可见素材（不自动滚动）');
                scanAndOpenUnownedMaterials(button);
            }
        });

        buttonContainer.appendChild(button);
        document.body.appendChild(buttonContainer);

        console.log('✓ 手动触发按钮已添加到页面右上角');
    };

    // 自动加载所有内容的函数
    const autoLoadAllContent = (button) => {
        console.log('========================================');
        console.log('📜 开始自动滚动加载页面...');
        console.log('========================================');

        let lastHeight = 0;
        let noChangeCount = 0;
        const maxNoChange = 3; // 连续3次高度无变化则认为加载完毕
        const checkInterval = 2000; // 每次检测间隔2秒

        const scrollAndCheck = () => {
            const currentHeight = document.body.scrollHeight;
            const currentCards = document.querySelectorAll('.materialCard').length;

            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                    <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 1 1 6 6v2a8 8 0 0 0 0-16z"/>
                </svg>
                <span>加载中... (已发现 ${currentCards})</span>
            `;

            console.log(`当前页面高度: ${currentHeight}, 素材数量: ${currentCards}`);

            if (currentHeight === lastHeight) {
                noChangeCount++;
                console.log(`页面高度无变化 (${noChangeCount}/${maxNoChange})`);
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
                console.log('页面内容已更新，继续滚动...');
            }

            if (noChangeCount >= maxNoChange) {
                console.log('✓ 页面加载似乎已完成');
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                        <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 1 1 6 6v2a8 8 0 0 0 0-16z"/>
                    </svg>
                    <span>正在分析素材...</span>
                `;

                // 给一点缓冲时间，然后开始扫描
                setTimeout(() => {
                    scanAndOpenUnownedMaterials(button);
                }, 1000);
            } else {
                // 滚动到底部
                window.scrollTo(0, document.body.scrollHeight);
                // 继续检测
                setTimeout(scrollAndCheck, checkInterval);
            }
        };

        // 开始第一次滚动
        scrollAndCheck();
    };

    // ========================================
    // 工具函数：从页面获取 CSRF Token
    // 优先读 meta 标签（详情页），fallback 读 XSRF-TOKEN cookie（搜索/排行榜页）
    // ========================================
    const getCsrfToken = () => {
        // 1. 尝试从 meta 标签读取（详情页有）
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');

        // 2. fallback：从 XSRF-TOKEN cookie 读取（搜索/排行榜页面登录后有）
        const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
        if (match) {
            try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
        }

        return null;
    };

    // ========================================
    // 工具函数：从当前 URL 提取语言前缀（如 zh-tw）
    // ========================================
    const getLangPrefix = () => {
        const match = window.location.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i);
        return match ? match[1] : 'zh-tw'; // 默认繁中
    };

    // ========================================
    // 工具函数：延迟 Promise
    // ========================================
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ========================================
    // 核心功能：静默收藏并入库单个素材
    // 返回 Promise<{ starred: boolean, claimed: boolean, error: string|null }>
    // ========================================
    const claimMaterialSilently = (materialId, csrfToken, langPrefix) => {
        const baseUrl = `https://assets.clip-studio.com/${langPrefix}/detail/ajax`;
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-CSRF-Token': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `https://assets.clip-studio.com/${langPrefix}/detail?id=${materialId}`,
        };

        const postRequest = (url, body) => new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: headers,
                data: body,
                onload: (resp) => {
                    resolve({ ok: resp.status >= 200 && resp.status < 300, status: resp.status, text: resp.responseText });
                },
                onerror: (err) => {
                    resolve({ ok: false, status: 0, text: String(err) });
                },
            });
        });

        return (async () => {
            const result = { starred: false, claimed: false, error: null };

            // Step 1: 收藏（register-star）
            try {
                const starResp = await postRequest(`${baseUrl}/register-star`, `id=${materialId}`);
                if (starResp.ok) {
                    result.starred = true;
                    console.log(`[${materialId}] ⭐ 收藏成功`);
                } else {
                    console.warn(`[${materialId}] ⭐ 收藏失败 HTTP ${starResp.status}:`, starResp.text.substring(0, 200));
                }
            } catch (e) {
                console.error(`[${materialId}] ⭐ 收藏异常:`, e);
            }

            // Step 2: 入库（purchase-material-free）
            try {
                const claimResp = await postRequest(`${baseUrl}/purchase-material-free`, `material_id=${materialId}`);
                if (claimResp.ok) {
                    result.claimed = true;
                    console.log(`[${materialId}] 📥 入库成功`);
                } else {
                    console.warn(`[${materialId}] 📥 入库失败 HTTP ${claimResp.status}:`, claimResp.text.substring(0, 200));
                }
            } catch (e) {
                console.error(`[${materialId}] 📥 入库异常:`, e);
            }

            return result;
        })();
    };

    // ========================================
    // 扫描并静默领取未入库素材
    // ========================================
    const scanAndOpenUnownedMaterials = (button) => {
        console.log('========================================');
        console.log('🔍 开始扫描未入库素材（静默模式）...');
        console.log('========================================');

        const waitForMaterials = () => {
            const allCards = document.querySelectorAll('.materialCard');

            if (allCards.length === 0) {
                console.log('⏳ 等待素材卡片加载...');
                setTimeout(waitForMaterials, 500);
                return;
            }

            console.log(`✓ 找到 ${allCards.length} 个素材卡片`);

            // 筛选出未入库的素材（没有绿色勾选标记）
            let unownedCards = Array.from(allCards).filter(card => {
                return !card.querySelector('.materialCard__purchased');
            });

            console.log(`📦 未入库素材数量: ${unownedCards.length}`);

            // 根据配置过滤付费素材
            let filteredCards = unownedCards;
            let skippedPaidCount = 0;

            if (skipPaidMaterials) {
                filteredCards = unownedCards.filter(card => {
                    const priceElement = card.querySelector('.materialCard__price');
                    if (!priceElement) return true;
                    const priceText = priceElement.textContent.trim();
                    const hasPaidPrice = /\d+\s*(G|CP)/i.test(priceText);
                    if (hasPaidPrice) { skippedPaidCount++; return false; }
                    return true;
                });
                if (skippedPaidCount > 0) {
                    console.log(`🚫 已过滤付费素材: ${skippedPaidCount} 个`);
                    console.log(`✅ 剩余待领取素材: ${filteredCards.length} 个`);
                }
            }

            if (filteredCards.length === 0) {
                const message = unownedCards.length > 0 ? '所有未入库素材都已被过滤！' : '所有素材都已入库！';
                console.log(`✓ ${message}`);
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                    </svg>
                    <span>全部已入库</span>
                `;
                button.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
                setTimeout(() => {
                    button.disabled = false;
                    button.style.opacity = '1';
                    button.style.cursor = 'pointer';
                    button.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
                            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z"/>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                        </svg>
                        <span>识别未入库素材</span>
                    `;
                    button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }, 3000);
                return;
            }

            // 提取素材 ID 列表
            const materialIds = filteredCards.map(card => {
                const link = card.querySelector('a.materialCard__cardContentBlock');
                if (!link) return null;
                const match = link.href.match(/[?&]id=(\d+)/);
                return match ? match[1] : null;
            }).filter(id => id !== null);

            console.log(`� 准备静默领取 ${materialIds.length} 个素材，间隔 ${claimDelayMs / 1000}s...`);

            // 获取 CSRF Token 和语言前缀
            const csrfToken = getCsrfToken();
            const langPrefix = getLangPrefix();

            if (!csrfToken) {
                console.error('✗ 无法获取 CSRF Token，请确认已登录');
                alert('无法获取 CSRF Token，请确认已登录账号后刷新页面重试');
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
                return;
            }

            console.log(`✓ CSRF Token 已获取，语言前缀: ${langPrefix}`);

            // 统计结果
            let successCount = 0;
            let failCount = 0;

            // 逐个处理
            const processNext = async (index) => {
                if (index >= materialIds.length) {
                    console.log('========================================');
                    console.log(`✓ 批量领取完成！成功: ${successCount}, 失败: ${failCount}`);
                    console.log('========================================');

                    button.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
                            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                        </svg>
                        <span>完成 ✓${successCount} ✗${failCount}</span>
                    `;
                    button.style.background = failCount > 0
                        ? 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)'
                        : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';

                    setTimeout(() => {
                        button.disabled = false;
                        button.style.opacity = '1';
                        button.style.cursor = 'pointer';
                        button.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle;">
                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z"/>
                                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                            </svg>
                            <span>识别未入库素材</span>
                        `;
                        button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 4000);
                    return;
                }

                const id = materialIds[index];

                // 更新按钮进度
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                        <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 1 1 6 6v2a8 8 0 0 0 0-16z"/>
                    </svg>
                    <span>领取中 ${index + 1}/${materialIds.length}</span>
                `;

                const result = await claimMaterialSilently(id, csrfToken, langPrefix);
                if (result.claimed) {
                    successCount++;
                } else {
                    failCount++;
                    console.warn(`[${id}] 领取失败（收藏: ${result.starred}）`);
                }

                // 延迟后处理下一个
                await delay(claimDelayMs);
                processNext(index + 1);
            };

            processNext(0);
        };

        waitForMaterials();
    };

    // 初始化排行榜页面按钮
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initRankingPageButton, 1000));
    } else {
        setTimeout(initRankingPageButton, 1000);
    }
})();
