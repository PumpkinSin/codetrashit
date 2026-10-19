// ==UserScript==
// @name         DeepSeek 官网体验优化 (回车发送 + 自定义快捷短语选单)
// @namespace    https://github.com/codetrashit/deepseek-enhancer
// @version      1.2.0
// @description  DeepSeek 网页端体验优化：默认回车发送消息，Shift+Enter换行，完美兼容中文拼音输入法；在底部增加快捷短语选单按钮，可快速选择并插入预设文本（支持Body全局浮层，彻底解决被遮挡问题）；支持可视化弹窗设置，自由增删改查短语并支持配置导入导出。
// @author       TraShIt
// @match        https://chat.deepseek.com/*
// @icon         https://chat.deepseek.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // 1. 默认数据与存储管理
    // ==========================================
    const STORAGE_KEY_PROMPTS = 'ds_enhancer_prompts_v3';
    const STORAGE_KEY_SETTINGS = 'ds_enhancer_settings_v3';

    const DEFAULT_PROMPTS = [
        {
            id: 'p_trans_zh',
            title: '翻译成中文',
            content: '请将上述内容准确、流畅、自然地翻译成中文。'
        },
        {
            id: 'p1',
            title: '中文深度思考与推理',
            content: '请使用中文详细逐步分析上述问题，给出严谨的推导过程并总结核心要点。'
        },
        {
            id: 'p2',
            title: '精简核心结论',
            content: '请直接给出精简结论与要点清单，不要冗长铺垫和套话。'
        },
        {
            id: 'p3',
            title: '代码审查与最佳实践',
            content: '请审查上述代码，指出潜在Bug、性能隐患并提供重构后的最佳实践代码与详细注释。'
        },
        {
            id: 'p4',
            title: '专业学术语气润色',
            content: '请使用更加专业、严谨、流畅的学术语气对上述内容进行润色和提升表达。'
        },
        {
            id: 'p5',
            title: '扮演资深专家解答',
            content: '请作为该领域的资深行业专家，结合实践经验从原理、痛点与解决方案三个维度进行深入解答。'
        }
    ];

    const DEFAULT_SETTINGS = {
        enterToSend: true,        // 默认 Enter 发送，Shift+Enter 换行
        sendAfterInsert: false,   // 点击快捷文本后是否立即发送
        insertMode: 'cursor'      // 'cursor' (光标处插入) 或 'append' (末尾追加)
    };

    function getStoredData(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                const val = GM_getValue(key);
                if (val !== undefined && val !== null) {
                    return typeof val === 'string' ? JSON.parse(val) : val;
                }
            } else if (window.localStorage) {
                const val = localStorage.getItem(key);
                if (val !== null) return JSON.parse(val);
            }
        } catch (e) {
            console.warn('[DeepSeek Enhancer] 读取存储失败:', e);
        }
        return fallback;
    }

    function setStoredData(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
            } else if (window.localStorage) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            console.error('[DeepSeek Enhancer] 写入存储失败:', e);
        }
    }

    let prompts = getStoredData(STORAGE_KEY_PROMPTS, null);
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
        // 如果旧版 v2 有数据也可以迁移过来
        const oldPrompts = getStoredData('ds_enhancer_prompts_v2', null) || getStoredData('ds_enhancer_prompts_v1', null);
        if (oldPrompts && Array.isArray(oldPrompts) && oldPrompts.length > 0) {
            prompts = oldPrompts;
        } else {
            prompts = DEFAULT_PROMPTS;
        }
    }

    // 确保默认有“翻译成中文”
    const hasTransZh = prompts.some(p => p.title && p.title.includes('翻译成中文'));
    if (!hasTransZh) {
        prompts.unshift({
            id: 'p_trans_zh',
            title: '翻译成中文',
            content: '请将上述内容准确、流畅、自然地翻译成中文。'
        });
        setStoredData(STORAGE_KEY_PROMPTS, prompts);
    }

    let settings = Object.assign({}, DEFAULT_SETTINGS, getStoredData(STORAGE_KEY_SETTINGS, {}));

    function savePrompts() {
        setStoredData(STORAGE_KEY_PROMPTS, prompts);
    }

    function saveSettings() {
        setStoredData(STORAGE_KEY_SETTINGS, settings);
    }

    // ==========================================
    // 2. CSS 样式注入 (深浅色无缝自适应)
    // ==========================================
    const STYLE_ID = 'ds-enhancer-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* --- 快捷按钮样式 --- */
            .ds-enhancer-btn {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 0 10px;
                height: 28px;
                border-radius: 9999px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                border: 1px solid var(--dsw-border-color, rgba(0, 0, 0, 0.1));
                background-color: var(--dsw-bg-secondary, rgba(0, 0, 0, 0.04));
                color: var(--dsw-text-primary, #333);
                outline: none;
                position: relative;
                margin-left: 6px;
                vertical-align: middle;
            }

            .ds-enhancer-btn:hover {
                background-color: var(--dsw-bg-hover, rgba(0, 0, 0, 0.08));
                border-color: var(--dsw-alias-brand-primary, #4d6bfe);
                color: var(--dsw-alias-brand-primary, #4d6bfe);
            }

            .ds-enhancer-btn.active {
                background-color: var(--dsw-alias-brand-subtle, rgba(77, 107, 254, 0.12));
                border-color: var(--dsw-alias-brand-primary, #4d6bfe);
                color: var(--dsw-alias-brand-primary, #4d6bfe);
            }

            .ds-enhancer-btn svg {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
            }

            .ds-enhancer-arrow {
                transition: transform 0.2s ease;
                font-size: 10px;
                opacity: 0.6;
            }
            .ds-enhancer-btn.active .ds-enhancer-arrow {
                transform: rotate(180deg);
            }

            /* --- 下拉选单浮层 (挂载在 body，使用 fixed 定位，杜绝任何 overflow 裁剪) --- */
            .ds-enhancer-dropdown {
                position: fixed;
                width: 320px;
                max-width: 90vw;
                background: #ffffff;
                border: 1px solid rgba(0, 0, 0, 0.12);
                border-radius: 12px;
                box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.22), 0 6px 14px -2px rgba(0, 0, 0, 0.1);
                z-index: 9999999;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: inherit;
                animation: dsEnhancerFadeIn 0.15s ease-out;
            }

            @keyframes dsEnhancerFadeIn {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* 深色模式适配 */
            body.dark .ds-enhancer-dropdown,
            [data-theme="dark"] .ds-enhancer-dropdown {
                background: #23272e;
                border-color: rgba(255, 255, 255, 0.16);
                box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.7);
                color: #e3e5e8;
            }

            .ds-enhancer-dropdown-header {
                padding: 10px 14px 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.06);
            }
            body.dark .ds-enhancer-dropdown-header {
                border-bottom-color: rgba(255, 255, 255, 0.08);
            }

            .ds-enhancer-dropdown-title-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                font-weight: 600;
                color: #888;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ds-enhancer-search-input {
                width: 100%;
                box-sizing: border-box;
                padding: 5px 8px;
                border-radius: 6px;
                border: 1px solid rgba(0, 0, 0, 0.1);
                background: rgba(0, 0, 0, 0.03);
                font-size: 12px;
                outline: none;
                transition: border-color 0.2s;
                color: inherit;
            }
            body.dark .ds-enhancer-search-input {
                background: rgba(255, 255, 255, 0.06);
                border-color: rgba(255, 255, 255, 0.12);
            }
            .ds-enhancer-search-input:focus {
                border-color: var(--dsw-alias-brand-primary, #4d6bfe);
                background: transparent;
            }

            .ds-enhancer-dropdown-list {
                list-style: none;
                margin: 0;
                padding: 6px;
                overflow-y: auto;
                max-height: 250px;
            }

            .ds-enhancer-dropdown-item {
                padding: 8px 10px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s ease;
                display: flex;
                flex-direction: column;
                gap: 2px;
                user-select: none;
            }

            .ds-enhancer-dropdown-item:hover {
                background: rgba(77, 107, 254, 0.08);
            }
            body.dark .ds-enhancer-dropdown-item:hover {
                background: rgba(77, 107, 254, 0.2);
            }

            .ds-enhancer-dropdown-item-title {
                font-size: 13px;
                font-weight: 500;
                color: #1a1a1a;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            body.dark .ds-enhancer-dropdown-item-title {
                color: #f0f0f0;
            }

            .ds-enhancer-dropdown-item-desc {
                font-size: 11px;
                color: #777;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 290px;
            }
            body.dark .ds-enhancer-dropdown-item-desc {
                color: #aaa;
            }

            .ds-enhancer-dropdown-empty {
                padding: 20px 14px;
                text-align: center;
                color: #999;
                font-size: 12px;
            }

            .ds-enhancer-dropdown-footer {
                padding: 8px 12px;
                border-top: 1px solid rgba(0, 0, 0, 0.06);
                background: rgba(0, 0, 0, 0.02);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            body.dark .ds-enhancer-dropdown-footer {
                border-top-color: rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.02);
            }

            .ds-enhancer-manage-btn {
                background: none;
                border: none;
                color: var(--dsw-alias-brand-primary, #4d6bfe);
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 4px 8px;
                border-radius: 6px;
                transition: background 0.15s ease;
            }
            .ds-enhancer-manage-btn:hover {
                background: rgba(77, 107, 254, 0.1);
            }

            /* --- 设置弹窗 Modal --- */
            .ds-enhancer-modal-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(5px);
                z-index: 10000000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: dsModalFadeIn 0.2s ease-out;
            }

            @keyframes dsModalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .ds-enhancer-modal {
                background: #ffffff;
                width: 600px;
                max-width: 92vw;
                max-height: 85vh;
                border-radius: 16px;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                color: #222;
                font-family: inherit;
                animation: dsModalPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            @keyframes dsModalPop {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            body.dark .ds-enhancer-modal,
            [data-theme="dark"] .ds-enhancer-modal {
                background: #1e2229;
                color: #e3e5e8;
                border: 1px solid rgba(255, 255, 255, 0.12);
            }

            .ds-enhancer-modal-header {
                padding: 16px 20px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            body.dark .ds-enhancer-modal-header {
                border-bottom-color: rgba(255, 255, 255, 0.08);
            }

            .ds-enhancer-modal-title {
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .ds-enhancer-modal-close {
                background: none;
                border: none;
                font-size: 22px;
                line-height: 1;
                cursor: pointer;
                color: #888;
                border-radius: 6px;
                padding: 2px 6px;
                transition: all 0.15s ease;
            }
            .ds-enhancer-modal-close:hover {
                background: rgba(0, 0, 0, 0.08);
                color: #111;
            }
            body.dark .ds-enhancer-modal-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }

            .ds-enhancer-modal-body {
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .ds-enhancer-section-title {
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #555;
            }
            body.dark .ds-enhancer-section-title {
                color: #aaa;
            }

            /* 设置项行 */
            .ds-enhancer-setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: rgba(0, 0, 0, 0.02);
                border-radius: 10px;
                border: 1px solid rgba(0, 0, 0, 0.06);
            }
            body.dark .ds-enhancer-setting-row {
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.06);
            }

            .ds-enhancer-setting-label {
                font-size: 13px;
                font-weight: 500;
            }
            .ds-enhancer-setting-hint {
                font-size: 11px;
                color: #888;
                margin-top: 2px;
            }

            /* 开关样式 Switch */
            .ds-enhancer-switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                flex-shrink: 0;
            }
            .ds-enhancer-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .ds-enhancer-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #cbd5e1;
                transition: .25s;
                border-radius: 24px;
            }
            .ds-enhancer-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .25s;
                border-radius: 50%;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            input:checked + .ds-enhancer-slider {
                background-color: #4d6bfe;
            }
            input:checked + .ds-enhancer-slider:before {
                transform: translateX(20px);
            }

            /* 短语列表 */
            .ds-enhancer-prompt-card {
                background: rgba(0, 0, 0, 0.02);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 10px;
                padding: 10px 14px;
                margin-bottom: 8px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                position: relative;
                transition: border-color 0.15s ease;
            }
            body.dark .ds-enhancer-prompt-card {
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.08);
            }
            .ds-enhancer-prompt-card:hover {
                border-color: rgba(77, 107, 254, 0.4);
            }

            .ds-enhancer-prompt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .ds-enhancer-prompt-title {
                font-weight: 600;
                font-size: 13px;
                color: #222;
            }
            body.dark .ds-enhancer-prompt-title {
                color: #eee;
            }

            .ds-enhancer-prompt-content {
                font-size: 12px;
                color: #666;
                white-space: pre-wrap;
                word-break: break-all;
                line-height: 1.4;
                max-height: 80px;
                overflow-y: auto;
            }
            body.dark .ds-enhancer-prompt-content {
                color: #bbb;
            }

            .ds-enhancer-actions {
                display: flex;
                gap: 4px;
            }
            .ds-enhancer-icon-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 12px;
                color: #666;
                transition: all 0.15s;
            }
            .ds-enhancer-icon-btn:hover {
                background: rgba(0, 0, 0, 0.08);
                color: #111;
            }
            body.dark .ds-enhancer-icon-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            .ds-enhancer-icon-btn.danger:hover {
                color: #e53935;
                background: rgba(229, 57, 53, 0.1);
            }

            /* 添加/编辑短语表单 */
            .ds-enhancer-form {
                background: rgba(77, 107, 254, 0.04);
                border: 1px dashed rgba(77, 107, 254, 0.3);
                border-radius: 10px;
                padding: 12px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 8px;
            }
            body.dark .ds-enhancer-form {
                background: rgba(77, 107, 254, 0.08);
                border-color: rgba(77, 107, 254, 0.4);
            }

            .ds-enhancer-input, .ds-enhancer-textarea {
                width: 100%;
                box-sizing: border-box;
                padding: 8px 10px;
                border-radius: 6px;
                border: 1px solid rgba(0, 0, 0, 0.15);
                background: #fff;
                font-size: 13px;
                font-family: inherit;
                outline: none;
                transition: border-color 0.2s;
            }
            body.dark .ds-enhancer-input, body.dark .ds-enhancer-textarea {
                background: #2b303a;
                border-color: rgba(255, 255, 255, 0.15);
                color: #fff;
            }
            .ds-enhancer-input:focus, .ds-enhancer-textarea:focus {
                border-color: #4d6bfe;
            }

            .ds-enhancer-textarea {
                resize: vertical;
                min-height: 65px;
            }

            .ds-enhancer-form-btns {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }

            .ds-enhancer-primary-btn {
                background: #4d6bfe;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .ds-enhancer-primary-btn:hover {
                background: #3a56ea;
            }

            .ds-enhancer-secondary-btn {
                background: rgba(0, 0, 0, 0.05);
                color: inherit;
                border: none;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .ds-enhancer-secondary-btn:hover {
                background: rgba(0, 0, 0, 0.1);
            }
            body.dark .ds-enhancer-secondary-btn {
                background: rgba(255, 255, 255, 0.08);
            }
            body.dark .ds-enhancer-secondary-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .ds-enhancer-modal-footer {
                padding: 12px 20px;
                border-top: 1px solid rgba(0, 0, 0, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(0, 0, 0, 0.01);
            }
            body.dark .ds-enhancer-modal-footer {
                border-top-color: rgba(255, 255, 255, 0.08);
            }

            .ds-enhancer-backup-area {
                display: flex;
                gap: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // 3. 核心机制：文本框原生触发与回车拦截
    // ==========================================

    function insertTextToDeepSeek(text, autoSend = false) {
        const textarea = findActiveTextarea();
        if (!textarea) {
            console.warn('[DeepSeek Enhancer] 未找到目标输入框');
            return;
        }

        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const currentVal = textarea.value || '';

        let newVal = '';
        if (settings.insertMode === 'cursor' && start !== undefined) {
            newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
        } else {
            newVal = currentVal ? (currentVal + (currentVal.endsWith('\n') ? '' : '\n') + text) : text;
        }

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(textarea, newVal);
        } else {
            textarea.value = newVal;
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        textarea.focus();
        const nextPos = (settings.insertMode === 'cursor' ? start : currentVal.length) + text.length;
        try {
            textarea.setSelectionRange(nextPos, nextPos);
        } catch (e) {}

        textarea.dispatchEvent(new Event('scroll', { bubbles: true }));

        if (autoSend || settings.sendAfterInsert) {
            setTimeout(() => {
                triggerSendMessage();
            }, 60);
        }
    }

    function findActiveTextarea() {
        return document.querySelector('textarea[name="search"]') ||
               document.querySelector('textarea.ds-scroll-area') ||
               document.querySelector('textarea[placeholder*="DeepSeek"]') ||
               document.querySelector('textarea');
    }

    function triggerSendMessage() {
        const textarea = findActiveTextarea();
        if (!textarea) return;

        if (!textarea.value || !textarea.value.trim()) {
            return;
        }

        const container = textarea.closest('div.aaff8b8f') || 
                          textarea.closest('div._020ab5b')?.parentElement ||
                          document;

        const buttons = Array.from(container.querySelectorAll('[role="button"], button'));
        
        let sendBtn = buttons.find(btn => {
            const isCircle = btn.classList.contains('ds-button--circle');
            const hasArrow = btn.querySelector('svg path[d*="M8.3125"]') || btn.querySelector('svg path[d*="M8"]');
            const isDisabled = btn.classList.contains('ds-button--disabled') || btn.getAttribute('aria-disabled') === 'true';
            return (isCircle || hasArrow) && !isDisabled;
        });

        if (!sendBtn) {
            sendBtn = buttons.find(btn => {
                const svg = btn.querySelector('svg');
                return svg && !btn.classList.contains('ds-button--disabled') && btn.className.includes('primary');
            });
        }

        if (sendBtn) {
            sendBtn.click();
        } else {
            setTimeout(() => {
                const retryBtn = document.querySelector('[role="button"].ds-button--circle:not(.ds-button--disabled)') ||
                                 document.querySelector('[role="button"].bd74640a:not(.ds-button--disabled)');
                if (retryBtn) retryBtn.click();
            }, 70);
        }
    }

    // 中文输入法状态追踪与 100ms 保护
    let isComposing = false;
    let lastCompositionEndTime = 0;

    window.addEventListener('compositionstart', () => {
        isComposing = true;
    }, true);

    window.addEventListener('compositionend', () => {
        isComposing = false;
        lastCompositionEndTime = Date.now();
    }, true);

    function handleKeydown(e) {
        if (!settings.enterToSend) return;

        const target = e.target;
        if (!target || target.tagName !== 'TEXTAREA') return;

        if (!target.placeholder?.includes('DeepSeek') && target.name !== 'search' && !target.classList.contains('ds-scroll-area')) {
            return;
        }

        if (e.isComposing || e.keyCode === 229 || isComposing || (Date.now() - lastCompositionEndTime < 100)) {
            return;
        }

        if (e.key === 'Enter') {
            if (e.shiftKey) {
                return;
            }

            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                triggerSendMessage();
            }
        }
    }

    window.addEventListener('keydown', handleKeydown, true);

    // ==========================================
    // 4. UI 注入：快捷文本按钮与全局浮动选单 (Popper/Portal 模式)
    // ==========================================

    let activeDropdown = null;
    let activeTriggerBtn = null;

    function closeDropdown() {
        if (activeDropdown) {
            activeDropdown.remove();
            activeDropdown = null;
        }
        if (activeTriggerBtn) {
            activeTriggerBtn.classList.remove('active');
            activeTriggerBtn = null;
        }
        window.removeEventListener('resize', updateDropdownPos);
        window.removeEventListener('scroll', updateDropdownPos, true);
    }

    function updateDropdownPos() {
        if (!activeDropdown || !activeTriggerBtn) return;
        const rect = activeTriggerBtn.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            closeDropdown();
            return;
        }

        const dropdownHeight = activeDropdown.offsetHeight || 300;
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        // 默认优先向上展开，若上方空间不足且下方更大则向下展开
        if (spaceAbove >= dropdownHeight + 10 || spaceAbove > spaceBelow) {
            activeDropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            activeDropdown.style.top = 'auto';
        } else {
            activeDropdown.style.top = `${rect.bottom + 8}px`;
            activeDropdown.style.bottom = 'auto';
        }

        // 水平对齐：左对齐，避免溢出屏幕右边界
        let left = rect.left;
        const dropdownWidth = activeDropdown.offsetWidth || 320;
        if (left + dropdownWidth > window.innerWidth - 12) {
            left = Math.max(12, window.innerWidth - dropdownWidth - 12);
        }
        activeDropdown.style.left = `${left}px`;
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ds-enhancer-dropdown') && !e.target.closest('.ds-enhancer-btn')) {
            closeDropdown();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
            closeModal();
        }
    });

    /**
     * 创建下拉选单并挂载到 document.body (避开所有父容器 overflow 限制)
     */
    function createDropdown(parentBtn) {
        closeDropdown();

        parentBtn.classList.add('active');
        activeTriggerBtn = parentBtn;

        const dropdown = document.createElement('div');
        dropdown.className = 'ds-enhancer-dropdown';

        // 标题与即时搜索栏
        const header = document.createElement('div');
        header.className = 'ds-enhancer-dropdown-header';
        header.innerHTML = `
            <div class="ds-enhancer-dropdown-title-row">
                <span>快捷短语选单</span>
                <span style="font-size: 10px; font-weight: normal; color: #999;">点击插入输入框</span>
            </div>
            <input type="text" class="ds-enhancer-search-input" placeholder="🔍 快速过滤短语..." />
        `;
        dropdown.appendChild(header);

        // 列表区域
        const list = document.createElement('ul');
        list.className = 'ds-enhancer-dropdown-list';
        dropdown.appendChild(list);

        function renderList(filterKeyword = '') {
            list.innerHTML = '';
            const filtered = prompts.filter(p => {
                if (!filterKeyword) return true;
                const kw = filterKeyword.toLowerCase();
                return p.title.toLowerCase().includes(kw) || p.content.toLowerCase().includes(kw);
            });

            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'ds-enhancer-dropdown-empty';
                empty.textContent = filterKeyword ? '未找到匹配的短语' : '暂无短语，请点击下方管理添加';
                list.appendChild(empty);
                return;
            }

            filtered.forEach(item => {
                const li = document.createElement('li');
                li.className = 'ds-enhancer-dropdown-item';
                li.innerHTML = `
                    <div class="ds-enhancer-dropdown-item-title">
                        <span>${escapeHtml(item.title)}</span>
                    </div>
                    <div class="ds-enhancer-dropdown-item-desc">${escapeHtml(item.content)}</div>
                `;
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertTextToDeepSeek(item.content);
                    closeDropdown();
                });
                list.appendChild(li);
            });
        }

        renderList();

        const searchInput = header.querySelector('.ds-enhancer-search-input');
        searchInput.addEventListener('input', (e) => {
            renderList(e.target.value.trim());
            updateDropdownPos();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstItem = list.querySelector('.ds-enhancer-dropdown-item');
                if (firstItem) firstItem.click();
            }
        });

        // 底部设置按钮
        const footer = document.createElement('div');
        footer.className = 'ds-enhancer-dropdown-footer';
        footer.innerHTML = `
            <button class="ds-enhancer-manage-btn" id="ds-enhancer-open-modal-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                自定义短语与偏好设置
            </button>
            <span style="font-size: 11px; color: #999;">共 ${prompts.length} 项</span>
        `;

        footer.querySelector('#ds-enhancer-open-modal-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();
            openSettingsModal();
        });

        dropdown.appendChild(footer);

        // 核心突破：挂载到 document.body，绝不被任何输入框 overflow 限制！
        document.body.appendChild(dropdown);
        activeDropdown = dropdown;

        updateDropdownPos();

        window.addEventListener('resize', updateDropdownPos);
        window.addEventListener('scroll', updateDropdownPos, true);

        setTimeout(() => searchInput.focus(), 50);
    }

    /**
     * 注入快捷按钮到“深度思考”和“智能搜索”右侧
     */
    function tryInjectEnhancerButton() {
        injectStyles();

        const toggleButtons = document.querySelectorAll('.ds-toggle-button');
        let targetContainer = null;

        for (const btn of toggleButtons) {
            const text = btn.textContent;
            if (text.includes('深度思考') || text.includes('智能搜索')) {
                targetContainer = btn.parentElement;
                break;
            }
        }

        if (targetContainer && !targetContainer.querySelector('.ds-enhancer-btn')) {
            const customBtn = document.createElement('div');
            customBtn.className = 'ds-enhancer-btn';
            customBtn.setAttribute('tabindex', '0');
            customBtn.setAttribute('role', 'button');
            customBtn.title = '点击展开自定义快捷短语选单';

            // 精致的书签/模板图标，使用纯 stroke 避免渲染成色块
            customBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>快捷短语</span>
                <span class="ds-enhancer-arrow">▼</span>
            `;

            customBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeDropdown && activeTriggerBtn === customBtn) {
                    closeDropdown();
                } else {
                    createDropdown(customBtn);
                }
            });

            targetContainer.appendChild(customBtn);
        }
    }

    // ==========================================
    // 5. 设置弹窗：短语管理与功能偏好
    // ==========================================

    let currentModalOverlay = null;

    function closeModal() {
        if (currentModalOverlay) {
            currentModalOverlay.remove();
            currentModalOverlay = null;
        }
    }

    function openSettingsModal() {
        closeModal();

        const overlay = document.createElement('div');
        overlay.className = 'ds-enhancer-modal-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const modal = document.createElement('div');
        modal.className = 'ds-enhancer-modal';

        // 头部
        const header = document.createElement('div');
        header.className = 'ds-enhancer-modal-header';
        header.innerHTML = `
            <div class="ds-enhancer-modal-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4d6bfe" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                DeepSeek 体验优化设置
            </div>
            <button class="ds-enhancer-modal-close" title="关闭">&times;</button>
        `;
        header.querySelector('.ds-enhancer-modal-close').addEventListener('click', closeModal);
        modal.appendChild(header);

        // 主体
        const body = document.createElement('div');
        body.className = 'ds-enhancer-modal-body';

        // 1. 发送与按键偏好
        const prefSection = document.createElement('div');
        prefSection.innerHTML = `
            <div class="ds-enhancer-section-title">按键与发送设置</div>
            <div class="ds-enhancer-setting-row">
                <div>
                    <div class="ds-enhancer-setting-label">默认回车发送消息 (Enter 发送)</div>
                    <div class="ds-enhancer-setting-hint">开启后回车直接发送消息，Shift + Enter 执行换行（输入法拼音输入中不受影响）</div>
                </div>
                <label class="ds-enhancer-switch">
                    <input type="checkbox" id="ds-toggle-enter-send" ${settings.enterToSend ? 'checked' : ''}>
                    <span class="ds-enhancer-slider"></span>
                </label>
            </div>
            <div class="ds-enhancer-setting-row" style="margin-top: 8px;">
                <div>
                    <div class="ds-enhancer-setting-label">在选单选择文本后立即发送</div>
                    <div class="ds-enhancer-setting-hint">点击快捷短语填入文本框后，立即触发发送</div>
                </div>
                <label class="ds-enhancer-switch">
                    <input type="checkbox" id="ds-toggle-auto-send" ${settings.sendAfterInsert ? 'checked' : ''}>
                    <span class="ds-enhancer-slider"></span>
                </label>
            </div>
        `;

        prefSection.querySelector('#ds-toggle-enter-send').addEventListener('change', (e) => {
            settings.enterToSend = e.target.checked;
            saveSettings();
        });
        prefSection.querySelector('#ds-toggle-auto-send').addEventListener('change', (e) => {
            settings.sendAfterInsert = e.target.checked;
            saveSettings();
        });
        body.appendChild(prefSection);

        // 2. 自定义快捷短语管理
        const promptsSection = document.createElement('div');
        body.appendChild(promptsSection);

        function renderPromptsSection() {
            promptsSection.innerHTML = `
                <div class="ds-enhancer-section-title">
                    <span>快捷短语管理 (${prompts.length})</span>
                    <button class="ds-enhancer-primary-btn" id="ds-enhancer-show-add-btn" style="padding: 4px 10px; font-size: 11px;">
                        + 添加新短语
                    </button>
                </div>
                <div id="ds-enhancer-add-form-container"></div>
                <div id="ds-enhancer-prompts-list"></div>
            `;

            const listContainer = promptsSection.querySelector('#ds-enhancer-prompts-list');
            const formContainer = promptsSection.querySelector('#ds-enhancer-add-form-container');
            const showAddBtn = promptsSection.querySelector('#ds-enhancer-show-add-btn');

            showAddBtn.addEventListener('click', () => {
                showAddForm(formContainer, showAddBtn);
            });

            if (prompts.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: #888; font-size: 12px; padding: 20px;">短语列表为空，赶快点击右上角添加吧！</div>';
            } else {
                prompts.forEach((item, index) => {
                    const card = document.createElement('div');
                    card.className = 'ds-enhancer-prompt-card';
                    card.innerHTML = `
                        <div class="ds-enhancer-prompt-header">
                            <span class="ds-enhancer-prompt-title">${escapeHtml(item.title)}</span>
                            <div class="ds-enhancer-actions">
                                ${index > 0 ? `<button class="ds-enhancer-icon-btn btn-up" title="上移">↑</button>` : ''}
                                ${index < prompts.length - 1 ? `<button class="ds-enhancer-icon-btn btn-down" title="下移">↓</button>` : ''}
                                <button class="ds-enhancer-icon-btn btn-edit" title="编辑">✏️</button>
                                <button class="ds-enhancer-icon-btn danger btn-del" title="删除">🗑️</button>
                            </div>
                        </div>
                        <div class="ds-enhancer-prompt-content">${escapeHtml(item.content)}</div>
                    `;

                    card.querySelector('.btn-up')?.addEventListener('click', () => {
                        const temp = prompts[index];
                        prompts[index] = prompts[index - 1];
                        prompts[index - 1] = temp;
                        savePrompts();
                        renderPromptsSection();
                    });

                    card.querySelector('.btn-down')?.addEventListener('click', () => {
                        const temp = prompts[index];
                        prompts[index] = prompts[index + 1];
                        prompts[index + 1] = temp;
                        savePrompts();
                        renderPromptsSection();
                    });

                    card.querySelector('.btn-edit').addEventListener('click', () => {
                        showEditForm(card, item, index);
                    });

                    card.querySelector('.btn-del').addEventListener('click', () => {
                        if (confirm(`确定要删除快捷短语「${item.title}」吗？`)) {
                            prompts.splice(index, 1);
                            savePrompts();
                            renderPromptsSection();
                        }
                    });

                    listContainer.appendChild(card);
                });
            }
        }

        function showAddForm(container, addBtn) {
            addBtn.style.display = 'none';
            container.innerHTML = `
                <div class="ds-enhancer-form">
                    <input type="text" class="ds-enhancer-input" id="ds-add-title" placeholder="短语名称（在选单中展示，如：深入分析）" />
                    <textarea class="ds-enhancer-textarea" id="ds-add-content" placeholder="短语具体内容（点击后自动插入输入框）" rows="3"></textarea>
                    <div class="ds-enhancer-form-btns">
                        <button class="ds-enhancer-secondary-btn" id="ds-add-cancel">取消</button>
                        <button class="ds-enhancer-primary-btn" id="ds-add-save">保存</button>
                    </div>
                </div>
            `;

            container.querySelector('#ds-add-cancel').addEventListener('click', () => {
                container.innerHTML = '';
                addBtn.style.display = 'inline-block';
            });

            container.querySelector('#ds-add-save').addEventListener('click', () => {
                const title = container.querySelector('#ds-add-title').value.trim();
                const content = container.querySelector('#ds-add-content').value.trim();
                if (!title || !content) {
                    alert('请完整填写标题和内容！');
                    return;
                }
                prompts.push({
                    id: 'p_' + Date.now(),
                    title,
                    content
                });
                savePrompts();
                renderPromptsSection();
            });
        }

        function showEditForm(card, item, index) {
            card.innerHTML = `
                <div class="ds-enhancer-form" style="margin: 0;">
                    <input type="text" class="ds-enhancer-input" id="ds-edit-title" value="${escapeHtml(item.title)}" />
                    <textarea class="ds-enhancer-textarea" id="ds-edit-content" rows="3">${escapeHtml(item.content)}</textarea>
                    <div class="ds-enhancer-form-btns">
                        <button class="ds-enhancer-secondary-btn" id="ds-edit-cancel">取消</button>
                        <button class="ds-enhancer-primary-btn" id="ds-edit-save">保存</button>
                    </div>
                </div>
            `;

            card.querySelector('#ds-edit-cancel').addEventListener('click', () => {
                renderPromptsSection();
            });

            card.querySelector('#ds-edit-save').addEventListener('click', () => {
                const title = card.querySelector('#ds-edit-title').value.trim();
                const content = card.querySelector('#ds-edit-content').value.trim();
                if (!title || !content) {
                    alert('请完整填写标题和内容！');
                    return;
                }
                prompts[index].title = title;
                prompts[index].content = content;
                savePrompts();
                renderPromptsSection();
            });
        }

        renderPromptsSection();
        modal.appendChild(body);

        // 底部工具栏与备份
        const footer = document.createElement('div');
        footer.className = 'ds-enhancer-modal-footer';
        footer.innerHTML = `
            <div class="ds-enhancer-backup-area">
                <button class="ds-enhancer-secondary-btn" id="ds-enhancer-export" title="导出当前配置为 JSON">
                    📤 导出备份
                </button>
                <button class="ds-enhancer-secondary-btn" id="ds-enhancer-import" title="从 JSON 文件或文本导入配置">
                    📥 导入配置
                </button>
                <button class="ds-enhancer-secondary-btn" id="ds-enhancer-reset-default" style="color: #888;" title="恢复至默认预设">
                    恢复默认
                </button>
            </div>
            <button class="ds-enhancer-primary-btn" id="ds-enhancer-done-btn">
                完成保存
            </button>
        `;

        footer.querySelector('#ds-enhancer-export').addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prompts, null, 2));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `deepseek_prompts_backup_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
        });

        footer.querySelector('#ds-enhancer-import').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const parsed = JSON.parse(event.target.result);
                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title && parsed[0].content) {
                            prompts = parsed;
                            savePrompts();
                            renderPromptsSection();
                            alert(`成功导入 ${parsed.length} 条快捷短语！`);
                        } else {
                            alert('导入失败：JSON 格式不符合短语数据结构。');
                        }
                    } catch (err) {
                        alert('文件解析失败，请确保是合法的 JSON 格式。');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        footer.querySelector('#ds-enhancer-reset-default').addEventListener('click', () => {
            if (confirm('确定要恢复为内置的默认短语吗？现有的短语将被重置。')) {
                prompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS));
                savePrompts();
                renderPromptsSection();
            }
        });

        footer.querySelector('#ds-enhancer-done-btn').addEventListener('click', closeModal);

        modal.appendChild(footer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        currentModalOverlay = overlay;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================
    // 6. 注册油猴脚本菜单项
    // ==========================================
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ 打开快捷短语与偏好设置', openSettingsModal);
        GM_registerMenuCommand('🔄 切换回车发送模式', () => {
            settings.enterToSend = !settings.enterToSend;
            saveSettings();
            alert(`已${settings.enterToSend ? '开启' : '关闭'}【回车发送消息】（Shift+Enter换行）`);
        });
    }

    // ==========================================
    // 7. 页面动态观察与自动挂载 (MutationObserver)
    // ==========================================
    let observerDebounce = null;
    const observer = new MutationObserver(() => {
        if (observerDebounce) clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => {
            tryInjectEnhancerButton();
        }, 120);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    tryInjectEnhancerButton();

    console.log('[DeepSeek Enhancer] 油猴脚本 v1.2.0 已加载完成！默认 Enter 发送，Shift+Enter 换行。');
})();
