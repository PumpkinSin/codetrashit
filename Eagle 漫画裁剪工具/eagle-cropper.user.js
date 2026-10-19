// ==UserScript==
// @name         Eagle 一键收图工具
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  一键将图片发送到 Eagle。配合"图片全载Next"脚本使用。
// @author       ai
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      *
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/563933/Eagle%20%E5%9B%BE%E7%89%87%E8%A3%81%E5%89%AA%E5%B7%A5%E5%85%B7.user.js
// @updateURL https://update.greasyfork.org/scripts/563933/Eagle%20%E5%9B%BE%E7%89%87%E8%A3%81%E5%89%AA%E5%B7%A5%E5%85%B7.meta.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Eagle] 脚本已加载 v3.0');

    // ==================== 设置界面 ====================
    function openSettings() {
        const { defaultRule, siteRules } = loadRules();

        const modal = document.createElement('div');
        modal.id = 'eagle-settings-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8);
            z-index: 2147483647; display: flex; align-items: center; justify-content: center;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: #1a1a1a; border-radius: 8px; width: 90%; max-width: 800px; max-height: 90vh;
            overflow-y: auto; padding: 20px; color: white;
        `;

        panel.innerHTML = `
            <h2 style="margin-top: 0;">Eagle 收图规则设置</h2>
            <div style="background: #2a2a2a; border-radius: 6px; margin-bottom: 20px; overflow: hidden;">
                <div id="default-rule-header" style="display: flex; align-items: center; padding: 10px 15px; cursor: pointer; user-select: none;">
                    <h3 style="margin: 0; flex: 1; font-size: 15px;">全网默认设置</h3>
                    <button id="default-rule-toggle" style="padding: 4px 12px; border-radius: 4px; border: none; background: #2196F3; color: white; cursor: pointer; font-size: 12px;">编辑</button>
                </div>
                <div id="default-rule-editor" style="display: none; padding: 0 15px 15px; border-top: 1px solid #444;"></div>
            </div>
            <div style="background: #2a2a2a; padding: 15px; border-radius: 6px;">
                <h3 style="margin-top: 0; display: inline-block;">站点规则</h3>
                <button id="add-rule-btn" style="float: right; padding: 5px 15px; border-radius: 4px; border: none; background: #4CAF50; color: white; cursor: pointer;">+ 添加规则</button>
                <div id="site-rules-list" style="clear: both; margin-top: 15px;"></div>
            </div>
            <div style="margin-top: 20px; text-align: right;">
                <button id="save-settings-btn" style="padding: 10px 30px; border-radius: 4px; border: none; background: #4CAF50; color: white; cursor: pointer; margin-right: 10px;">保存</button>
                <button id="cancel-settings-btn" style="padding: 10px 30px; border-radius: 4px; border: none; background: #666; color: white; cursor: pointer;">取消</button>
            </div>
        `;

        modal.appendChild(panel);
        document.body.appendChild(modal);

        // 渲染规则编辑器
        function renderRuleEditor(rule, container) {
            container.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: #aaa;">标题 (Name)</label>
                    <select class="rule-name-source" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px;">
                        <option value="page-title" ${rule.name.source === 'page-title' ? 'selected' : ''}>网页名</option>
                        <option value="filename" ${rule.name.source === 'filename' ? 'selected' : ''}>文件名</option>
                        <option value="url" ${rule.name.source === 'url' ? 'selected' : ''}>网址</option>
                        <option value="custom" ${rule.name.source === 'custom' ? 'selected' : ''}>自定义</option>
                    </select>
                    <input type="text" class="rule-name-custom" placeholder="自定义文本 (支持 {title} {filename} {url} {domain} {date} {time})" value="${rule.name.customText}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px; ${rule.name.source !== 'custom' ? 'display: none;' : ''}">
                    <input type="text" class="rule-name-regex" placeholder="正则表达式(可选,提取第一个捕获组)" value="${rule.name.regex}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: #aaa;">注释 (Annotation)</label>
                    <select class="rule-annotation-source" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px;">
                        <option value="page-title" ${rule.annotation.source === 'page-title' ? 'selected' : ''}>网页名</option>
                        <option value="filename" ${rule.annotation.source === 'filename' ? 'selected' : ''}>文件名</option>
                        <option value="url" ${rule.annotation.source === 'url' ? 'selected' : ''}>网址</option>
                        <option value="custom" ${rule.annotation.source === 'custom' ? 'selected' : ''}>自定义</option>
                    </select>
                    <input type="text" class="rule-annotation-custom" placeholder="自定义文本" value="${rule.annotation.customText}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px; ${rule.annotation.source !== 'custom' ? 'display: none;' : ''}">
                    <input type="text" class="rule-annotation-regex" placeholder="正则表达式(可选)" value="${rule.annotation.regex}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: #aaa;">网址 (Website)</label>
                    <select class="rule-website-source" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px;">
                        <option value="page-title" ${rule.website.source === 'page-title' ? 'selected' : ''}>网页名</option>
                        <option value="filename" ${rule.website.source === 'filename' ? 'selected' : ''}>文件名</option>
                        <option value="url" ${rule.website.source === 'url' ? 'selected' : ''}>网址</option>
                        <option value="custom" ${rule.website.source === 'custom' ? 'selected' : ''}>自定义</option>
                    </select>
                    <input type="text" class="rule-website-custom" placeholder="自定义文本" value="${rule.website.customText}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; margin-bottom: 5px; ${rule.website.source !== 'custom' ? 'display: none;' : ''}">
                    <input type="text" class="rule-website-regex" placeholder="正则表达式(可选)" value="${rule.website.regex}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; color: #aaa;">标签 (逗号分隔)</label>
                    <input type="text" class="rule-tags" placeholder="标签1, 标签2" value="${(rule.tags || []).join(', ')}" style="width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                </div>
            `;

            // 切换自定义文本框显示
            ['name', 'annotation', 'website'].forEach(field => {
                const select = container.querySelector(`.rule-${field}-source`);
                const customInput = container.querySelector(`.rule-${field}-custom`);
                select.addEventListener('change', () => {
                    customInput.style.display = select.value === 'custom' ? 'block' : 'none';
                });
            });
        }

        // 默认规则折叠切换
        let defaultExpanded = false;
        const defaultToggleBtn = panel.querySelector('#default-rule-toggle');
        const defaultEditor = panel.querySelector('#default-rule-editor');
        panel.querySelector('#default-rule-header').addEventListener('click', () => {
            defaultExpanded = !defaultExpanded;
            defaultEditor.style.display = defaultExpanded ? 'block' : 'none';
            defaultEditor.style.paddingTop = defaultExpanded ? '15px' : '0';
            defaultToggleBtn.textContent = defaultExpanded ? '收起' : '编辑';
            defaultToggleBtn.style.background = defaultExpanded ? '#888' : '#2196F3';
            if (defaultExpanded && !defaultEditor.hasChildNodes()) {
                renderRuleEditor(defaultRule, defaultEditor);
            }
        });

        // 渲染站点规则列表（紧凑模式，点击编辑展开）
        function renderSiteRulesList(expandIndex = -1) {
            const list = panel.querySelector('#site-rules-list');
            list.innerHTML = '';
            siteRules.forEach((rule, index) => {
                const ruleDiv = document.createElement('div');
                ruleDiv.style.cssText = 'background: #333; border-radius: 6px; margin-bottom: 6px; overflow: hidden;';

                const isExpanded = index === expandIndex;

                // 紧凑行：显示所有 URL 模式
                const patterns = rule.urlPatterns || (rule.urlPattern ? [rule.urlPattern] : []);
                const urlLabel = patterns.length > 0 ? patterns.join('  |  ') : '(未设置 URL)';

                const headerRow = document.createElement('div');
                headerRow.style.cssText = 'display: flex; align-items: center; padding: 8px 12px; gap: 8px;';
                headerRow.innerHTML = `
                    <span class="rule-url-label" style="flex: 1; color: #ccc; font-family: monospace; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${urlLabel}</span>
                    <button class="edit-rule-btn" data-index="${index}" style="padding: 4px 12px; border-radius: 4px; border: none; background: ${isExpanded ? '#888' : '#2196F3'}; color: white; cursor: pointer; font-size: 12px; flex-shrink: 0;">${isExpanded ? '收起' : '编辑'}</button>
                    <button class="delete-rule-btn" data-index="${index}" style="padding: 4px 12px; border-radius: 4px; border: none; background: #f44336; color: white; cursor: pointer; font-size: 12px; flex-shrink: 0;">删除</button>
                `;

                // 展开编辑区
                const editorArea = document.createElement('div');
                editorArea.style.cssText = `padding: ${isExpanded ? '12px' : '0'}; border-top: ${isExpanded ? '1px solid #444' : 'none'}; display: ${isExpanded ? 'block' : 'none'};`;

                if (isExpanded) {
                    // 多 URL 区域
                    const urlSection = document.createElement('div');
                    urlSection.style.cssText = 'margin-bottom: 10px;';
                    urlSection.innerHTML = `<label style="display: block; margin-bottom: 4px; color: #aaa; font-size: 12px;">URL 模式（支持通配符 *，可添加多个）</label>`;

                    const urlInputsWrap = document.createElement('div');
                    urlInputsWrap.className = 'rule-url-inputs';

                    function addUrlInput(val) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display: flex; gap: 6px; margin-bottom: 5px;';
                        const inp = document.createElement('input');
                        inp.type = 'text';
                        inp.className = 'rule-url-pattern';
                        inp.value = val;
                        inp.placeholder = '例：*.example.com/*';
                        inp.style.cssText = 'flex: 1; padding: 7px; background: #222; color: white; border: 1px solid #555; border-radius: 4px; box-sizing: border-box;';
                        inp.addEventListener('input', updateHeaderLabel);
                        const rmBtn = document.createElement('button');
                        rmBtn.textContent = '×';
                        rmBtn.style.cssText = 'padding: 4px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer; flex-shrink: 0;';
                        rmBtn.addEventListener('click', () => { row.remove(); updateHeaderLabel(); });
                        row.appendChild(inp);
                        row.appendChild(rmBtn);
                        urlInputsWrap.appendChild(row);
                    }

                    function updateHeaderLabel() {
                        const vals = [...urlInputsWrap.querySelectorAll('.rule-url-pattern')].map(i => i.value.trim()).filter(Boolean);
                        headerRow.querySelector('.rule-url-label').textContent = vals.length ? vals.join('  |  ') : '(未设置 URL)';
                    }

                    patterns.forEach(p => addUrlInput(p));
                    if (patterns.length === 0) addUrlInput('');

                    const addUrlBtn = document.createElement('button');
                    addUrlBtn.textContent = '+ 添加网址';
                    addUrlBtn.style.cssText = 'margin-top: 2px; padding: 4px 12px; background: #444; color: #ccc; border: 1px dashed #666; border-radius: 4px; cursor: pointer; font-size: 12px;';
                    addUrlBtn.addEventListener('click', () => { addUrlInput(''); });

                    urlSection.appendChild(urlInputsWrap);
                    urlSection.appendChild(addUrlBtn);
                    editorArea.appendChild(urlSection);

                    const editorSlot = document.createElement('div');
                    editorSlot.className = 'rule-editor-slot';
                    editorArea.appendChild(editorSlot);
                    renderRuleEditor(rule, editorSlot);
                }

                // 编辑/收起按钮
                headerRow.querySelector('.edit-rule-btn').addEventListener('click', () => {
                    syncExpandedRule(currentExpandIndex);
                    currentExpandIndex = isExpanded ? -1 : index;
                    renderSiteRulesList(currentExpandIndex);
                });

                // 删除按钮
                headerRow.querySelector('.delete-rule-btn').addEventListener('click', () => {
                    syncExpandedRule(currentExpandIndex);
                    siteRules.splice(index, 1);
                    currentExpandIndex = -1;
                    renderSiteRulesList();
                });

                ruleDiv.appendChild(headerRow);
                ruleDiv.appendChild(editorArea);
                list.appendChild(ruleDiv);
            });
        }

        renderSiteRulesList();

        // 将当前展开的规则表单值同步回 siteRules
        function syncExpandedRule(expandIndex) {
            if (expandIndex < 0 || expandIndex >= siteRules.length) return;
            const list = panel.querySelector('#site-rules-list');
            const ruleDivs = list.querySelectorAll(':scope > div');
            const ruleDiv = ruleDivs[expandIndex];
            if (!ruleDiv) return;
            const urlInputs = ruleDiv.querySelectorAll('.rule-url-pattern');
            const nameSource = ruleDiv.querySelector('.rule-name-source');
            if (!urlInputs.length || !nameSource) return; // 未展开
            const urlPatterns = [...urlInputs].map(el => el.value.trim()).filter(Boolean);
            siteRules[expandIndex] = {
                urlPatterns,
                urlPattern: urlPatterns[0] || '', // 向后兼容
                name: {
                    source: ruleDiv.querySelector('.rule-name-source').value,
                    customText: ruleDiv.querySelector('.rule-name-custom').value,
                    regex: ruleDiv.querySelector('.rule-name-regex').value
                },
                annotation: {
                    source: ruleDiv.querySelector('.rule-annotation-source').value,
                    customText: ruleDiv.querySelector('.rule-annotation-custom').value,
                    regex: ruleDiv.querySelector('.rule-annotation-regex').value
                },
                website: {
                    source: ruleDiv.querySelector('.rule-website-source').value,
                    customText: ruleDiv.querySelector('.rule-website-custom').value,
                    regex: ruleDiv.querySelector('.rule-website-regex').value
                },
                tags: ruleDiv.querySelector('.rule-tags').value.split(',').map(t => t.trim()).filter(t => t)
            };
        }

        // 当前展开的规则索引（闭包共享）
        let currentExpandIndex = -1;

        // 添加规则按钮
        panel.querySelector('#add-rule-btn').addEventListener('click', () => {
            syncExpandedRule(currentExpandIndex);
            siteRules.push(JSON.parse(JSON.stringify(DEFAULT_RULE)));
            currentExpandIndex = siteRules.length - 1;
            renderSiteRulesList(currentExpandIndex);
        });

        // 保存按钮
        panel.querySelector('#save-settings-btn').addEventListener('click', () => {
            // 先把展开规则的表单内容同步回 siteRules
            syncExpandedRule(currentExpandIndex);

            // 读取默认规则（可能未展开）
            const defEditor = panel.querySelector('#default-rule-editor');
            let newDefaultRule;
            if (defEditor.hasChildNodes()) {
                newDefaultRule = {
                    urlPattern: '*',
                    name: {
                        source: defEditor.querySelector('.rule-name-source').value,
                        customText: defEditor.querySelector('.rule-name-custom').value,
                        regex: defEditor.querySelector('.rule-name-regex').value
                    },
                    annotation: {
                        source: defEditor.querySelector('.rule-annotation-source').value,
                        customText: defEditor.querySelector('.rule-annotation-custom').value,
                        regex: defEditor.querySelector('.rule-annotation-regex').value
                    },
                    website: {
                        source: defEditor.querySelector('.rule-website-source').value,
                        customText: defEditor.querySelector('.rule-website-custom').value,
                        regex: defEditor.querySelector('.rule-website-regex').value
                    },
                    tags: defEditor.querySelector('.rule-tags').value.split(',').map(t => t.trim()).filter(t => t)
                };
            } else {
                newDefaultRule = defaultRule; // 未编辑，保持原值
            }

            saveRules(newDefaultRule, siteRules);
            alert('规则已保存!');
            modal.remove();
        });

        // 取消按钮
        panel.querySelector('#cancel-settings-btn').addEventListener('click', () => {
            modal.remove();
        });
    }

    // ==================== 初始化 ====================
    const CONFIG = {
        eagleApiUrl: 'http://localhost:41595'
    };

    // ==================== 规则配置 ====================
    const DEFAULT_RULE = {
        urlPattern: '*',
        name: { source: 'page-title', customText: '', regex: '' },
        annotation: { source: 'custom', customText: '', regex: '' },
        website: { source: 'url', customText: '', regex: '' },
        tags: ['漫画']
    };

    // 加载规则配置
    function loadRules() {
        const defaultRule = GM_getValue('eagle_default_rule', DEFAULT_RULE);
        const siteRules = GM_getValue('eagle_site_rules', []);
        return { defaultRule, siteRules };
    }

    // 保存规则配置
    function saveRules(defaultRule, siteRules) {
        GM_setValue('eagle_default_rule', defaultRule);
        GM_setValue('eagle_site_rules', siteRules);
    }

    // URL 模式匹配 (支持通配符)
    function matchUrlPattern(pattern, url) {
        if (pattern === '*') return true;

        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        const regex = new RegExp('^' + regexPattern + '$', 'i');
        return regex.test(url);
    }

    // 查找匹配当前URL的规则
    function findMatchingRule(url) {
        const { defaultRule, siteRules } = loadRules();

        for (const rule of siteRules) {
            // 支持新字段 urlPatterns（数组）和旧字段 urlPattern（字符串）
            const patterns = rule.urlPatterns?.length ? rule.urlPatterns
                : rule.urlPattern ? [rule.urlPattern]
                    : [];
            if (patterns.some(p => matchUrlPattern(p, url))) {
                console.log('[Eagle] 匹配规则:', patterns.join(', '));
                return rule;
            }
        }

        console.log('[Eagle] 使用默认规则');
        return defaultRule;
    }

    // 变量替换
    function replaceVariables(text, context) {
        return text
            .replace(/\{title\}/g, context.title || '')
            .replace(/\{filename\}/g, context.filename || '')
            .replace(/\{url\}/g, context.url || '')
            .replace(/\{domain\}/g, context.domain || '')
            .replace(/\{date\}/g, new Date().toISOString().split('T')[0])
            .replace(/\{time\}/g, new Date().toTimeString().split(' ')[0]);
    }

    // 正则提取
    function extractByRegex(text, regex) {
        if (!regex) return text;
        try {
            const match = text.match(new RegExp(regex));
            return match && match[1] ? match[1] : text;
        } catch (e) {
            console.error('[Eagle] 正则表达式错误:', e);
            return text;
        }
    }

    // 生成元数据
    function generateMetadata(imageUrl, rule) {
        const context = {
            title: document.title,
            filename: imageUrl.split('/').pop().split('?')[0],
            url: location.href,
            domain: location.hostname
        };

        const getValue = (config) => {
            let value = '';
            switch (config.source) {
                case 'page-title':
                    value = context.title;
                    break;
                case 'filename':
                    value = context.filename;
                    break;
                case 'url':
                    value = context.url;
                    break;
                case 'custom':
                    value = replaceVariables(config.customText, context);
                    break;
            }

            if (config.regex) {
                value = extractByRegex(value, config.regex);
            }

            return value;
        };

        return {
            name: getValue(rule.name),
            annotation: getValue(rule.annotation),
            website: getValue(rule.website),
            tags: rule.tags || []
        };
    }

    // ==================== 发送到 Eagle ====================
    function sendToEagle(imageUrl) {
        return new Promise((resolve, reject) => {
            const apiUrl = `${CONFIG.eagleApiUrl}/api/item/addFromURL`;

            console.log('[Eagle] 正在发送到 Eagle...');
            console.log('[Eagle] 图片 URL:', imageUrl);

            // 使用规则生成元数据
            const rule = findMatchingRule(location.href);
            const metadata = generateMetadata(imageUrl, rule);

            console.log('[Eagle] 使用元数据:', metadata);

            GM_xmlhttpRequest({
                method: 'POST',
                url: apiUrl,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    url: imageUrl,
                    name: metadata.name,
                    website: metadata.website,
                    annotation: metadata.annotation,
                    tags: metadata.tags
                }),
                onload: (response) => {
                    console.log('[Eagle] API 响应状态:', response.status);
                    console.log('[Eagle] 响应内容:', response.responseText);

                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result);
                        } catch (e) {
                            resolve({ status: 'success' });
                        }
                    } else if (response.status === 404) {
                        reject(new Error('Eagle API 端点不存在\n请确保:\n1. Eagle 应用正在运行\n2. 已在 Eagle 设置中启用 API\n3. Eagle 版本 ≥ 3.0'));
                    } else {
                        reject(new Error(`Eagle API 错误: ${response.status}\n${response.responseText}`));
                    }
                },
                onerror: (error) => {
                    console.error('[Eagle] API 连接失败:', error);
                    reject(new Error('无法连接到 Eagle (http://localhost:41595)\n\n请确保:\n1. Eagle 应用正在运行\n2. 已在 Eagle 设置 → 实验室 中启用 API\n3. API 端口为 41595'));
                },
                ontimeout: () => {
                    reject(new Error('Eagle API 请求超时'));
                }
            });
        });
    }

    // 发送裁剪图片到 Eagle（使用 data: URI 通过 addFromURL 发送）
    function sendBase64ToEagle(base64Data, imageUrl) {
        return new Promise((resolve, reject) => {
            const apiUrl = `${CONFIG.eagleApiUrl}/api/item/addFromURL`;
            const rule = findMatchingRule(location.href);
            const metadata = generateMetadata(imageUrl || location.href, rule);

            GM_xmlhttpRequest({
                method: 'POST',
                url: apiUrl,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    url: base64Data,          // data:image/png;base64,... Eagle 支持 data: URI
                    name: metadata.name,
                    website: metadata.website,
                    annotation: metadata.annotation,
                    tags: metadata.tags
                }),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try { resolve(JSON.parse(response.responseText)); }
                        catch (e) { resolve({ status: 'success' }); }
                    } else {
                        reject(new Error(`Eagle API 错误: ${response.status}\n${response.responseText}`));
                    }
                },
                onerror: () => reject(new Error('无法连接到 Eagle')),
                ontimeout: () => reject(new Error('Eagle API 请求超时'))
            });
        });
    }

    // ==================== 裁剪界面 ====================
    function openCropUI(imageUrl, pageImgEl) {
        // 防止重复打开
        if (document.getElementById('eagle-crop-overlay')) return;

        // 优先挂载到 Fancybox 容器内，保证层级高于灯箱本身
        const fancyboxRoot = document.querySelector('.fancybox__container') || document.body;
        const useAbsolute = fancyboxRoot !== document.body;

        const overlay = document.createElement('div');
        overlay.id = 'eagle-crop-overlay';
        overlay.style.cssText = `
            position: ${useAbsolute ? 'absolute' : 'fixed'}; inset: 0; z-index: 2147483647;
            background: rgba(0,0,0,0.85);
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            cursor: crosshair;
        `;

        // 提示文字
        const hint = document.createElement('div');
        hint.style.cssText = 'position: absolute; top: 14px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px; pointer-events: none; white-space: nowrap;';
        hint.textContent = '拖拽选择裁剪区域 · ESC 取消';
        overlay.appendChild(hint);

        // 后台用 GM_xmlhttpRequest 下载无跨域污染的 blob，供裁剪导出用
        // cleanImgPromise resolve(HTMLImageElement) when ready
        let cleanImgResolve, cleanImgReject;
        const cleanImgPromise = new Promise((res, rej) => { cleanImgResolve = res; cleanImgReject = rej; });
        GM_xmlhttpRequest({
            method: 'GET',
            url: imageUrl,
            responseType: 'blob',
            onload: (resp) => {
                const blobUrl = URL.createObjectURL(resp.response);
                const blobImg = new Image();
                blobImg.onload = () => { cleanImgResolve(blobImg); URL.revokeObjectURL(blobUrl); };
                blobImg.onerror = () => cleanImgReject(new Error('blob img load failed'));
                blobImg.src = blobUrl;
            },
            onerror: () => cleanImgReject(new Error('GM download failed'))
        });

        // 如果有页面已加载的 img 元素，直接用它即时渲染；否则等 GM 下载
        if (pageImgEl) {
            hint.textContent = '拖拽选择裁剪区域 · ESC 取消';
            loadImage(pageImgEl, cleanImgPromise);
        } else {
            hint.textContent = '图片加载中...';
            cleanImgPromise.then(blobImg => {
                hint.textContent = '拖拽选择裁剪区域 · ESC 取消';
                loadImage(blobImg, Promise.resolve(blobImg));
            }).catch(() => {
                // GM 失败时用直接加载作为最后手段
                hint.textContent = '拖拽选择裁剪区域 · ESC 取消';
                const fallbackImg = new Image();
                const fallbackPromise = new Promise((res, rej) => {
                    fallbackImg.onload = () => res(fallbackImg);
                    fallbackImg.onerror = rej;
                });
                fallbackImg.src = imageUrl;
                fallbackImg.onload = () => loadImage(fallbackImg, fallbackPromise);
            });
        }

        // displayImg: HTMLImageElement 用于即时渲染
        // cleanImgPromise: Promise<HTMLImageElement> 无跨域污染的图片，供最终裁剪导出
        function loadImage(displayImg, cleanImgPromise) {
            const img = displayImg;
            const naturalW = img.naturalWidth;
            const naturalH = img.naturalHeight;

            const maxW = window.innerWidth * 0.9;
            const maxH = window.innerHeight * 0.85;
            // baseScale: 将原图缩放至适合屏幕的比例（viewZoom=1 时使用）
            const baseScale = Math.min(maxW / naturalW, maxH / naturalH, 1);
            const dispW = Math.round(naturalW * baseScale);
            const dispH = Math.round(naturalH * baseScale);

            const dpr = window.devicePixelRatio || 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(dispW * dpr);
            canvas.height = Math.round(dispH * dpr);
            canvas.style.cssText = `display: block; width: ${dispW}px; height: ${dispH}px; cursor: crosshair; outline: 2px solid #fff; box-shadow: 0 0 30px rgba(0,0,0,0.8);`;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // ─── 缩放 / 平移状态 ──────────────────────────────────────
            let viewZoom = 1;   // 额外缩放倍率（1 = 适应屏幕）
            let panX = 0;       // 图片左上角在画布 CSS px 中的偏移
            let panY = 0;
            const MIN_ZOOM = 1, MAX_ZOOM = 10;

            function clampPan() {
                if (viewZoom <= 1) { panX = 0; panY = 0; return; }
                panX = Math.min(0, Math.max(dispW - dispW * viewZoom, panX));
                panY = Math.min(0, Math.max(dispH - dispH * viewZoom, panY));
            }

            function redrawCanvas() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.scale(dpr, dpr);
                // 可见区域在画布 CSS px 中的目标矩形
                const dstX = Math.max(0, panX);
                const dstY = Math.max(0, panY);
                const dstW = Math.min(dispW - dstX, dispW * viewZoom - Math.max(0, -panX));
                const dstH = Math.min(dispH - dstY, dispH * viewZoom - Math.max(0, -panY));
                if (dstW > 0 && dstH > 0) {
                    // 对应原图的源矩形
                    const srcX = Math.max(0, -panX / (baseScale * viewZoom));
                    const srcY = Math.max(0, -panY / (baseScale * viewZoom));
                    const srcW = dstW / (baseScale * viewZoom);
                    const srcH = dstH / (baseScale * viewZoom);
                    ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
                }
                ctx.restore();
            }

            redrawCanvas();
            overlay.appendChild(canvas);

            // 缩放比例标签（右上角）
            const zoomLabel = document.createElement('div');
            zoomLabel.style.cssText = 'position: absolute; top: 14px; right: 20px; color: #fff; font-size: 13px; background: rgba(0,0,0,0.55); padding: 4px 10px; border-radius: 12px; pointer-events: none; user-select: none;';
            zoomLabel.textContent = '100%';
            overlay.appendChild(zoomLabel);

            // 更新提示文字
            hint.textContent = '拖拽选区 · 滚轮缩放 · 中键平移 · ESC取消';

            // 提前声明（供 applyZoom 闭包引用）
            let cropRect = null;
            let selDisplay = null;

            // ─── 按钮栏 ───────────────────────────────────────────────
            const btnBar = document.createElement('div');
            btnBar.style.cssText = 'position: absolute; bottom: 24px; display: flex; gap: 10px; z-index: 10; align-items: center;';

            function mkBtn(text, bg, title) {
                const b = document.createElement('button');
                b.textContent = text;
                if (title) b.title = title;
                b.style.cssText = `padding: 9px 15px; background: ${bg}; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;`;
                return b;
            }
            const zoomOutBtn = mkBtn('－', '#444', '缩小 (滚轮)');
            const zoomResetBtn = mkBtn('100%', '#444', '重置缩放');
            const zoomInBtn = mkBtn('＋', '#444', '放大 (滚轮)');
            const confirmBtn = mkBtn('✓ 裁剪并发送到 Eagle', '#4CAF50');
            const cancelBtn = mkBtn('✕ 取消', '#666');
            confirmBtn.style.opacity = '0.4';
            confirmBtn.style.pointerEvents = 'none';

            btnBar.append(zoomOutBtn, zoomResetBtn, zoomInBtn, confirmBtn, cancelBtn);
            overlay.appendChild(btnBar);

            // ─── 缩放逻辑 ─────────────────────────────────────────────
            function applyZoom(newZoom, cx, cy) {
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                if (newZoom === viewZoom) return;
                const factor = newZoom / viewZoom;
                panX = cx - (cx - panX) * factor;
                panY = cy - (cy - panY) * factor;
                viewZoom = newZoom;
                clampPan();
                redrawCanvas();
                const pct = Math.round(viewZoom * 100) + '%';
                zoomLabel.textContent = pct;
                zoomResetBtn.textContent = pct;
                canvas.style.cursor = viewZoom > 1 ? 'grab' : 'crosshair';
                // 缩放时清除选区（坐标已失效）
                cropRect = null; selDisplay = null;
                selDiv.style.display = 'none';
                confirmBtn.style.opacity = '0.4';
                confirmBtn.style.pointerEvents = 'none';
            }

            zoomInBtn.addEventListener('click', () => applyZoom(viewZoom * 1.5, dispW / 2, dispH / 2));
            zoomOutBtn.addEventListener('click', () => applyZoom(viewZoom / 1.5, dispW / 2, dispH / 2));
            zoomResetBtn.addEventListener('click', () => {
                viewZoom = 1; panX = 0; panY = 0;
                redrawCanvas();
                zoomLabel.textContent = zoomResetBtn.textContent = '100%';
                canvas.style.cursor = 'crosshair';
                cropRect = null; selDisplay = null;
                selDiv.style.display = 'none';
                confirmBtn.style.opacity = '0.4';
                confirmBtn.style.pointerEvents = 'none';
            });

            // 滚轮缩放（以鼠标为中心）
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault(); e.stopPropagation();
                const rect = canvas.getBoundingClientRect();
                applyZoom(
                    viewZoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2),
                    e.clientX - rect.left,
                    e.clientY - rect.top
                );
            }, { passive: false });

            // ─── 选区框 & 手柄 ────────────────────────────────────────
            const selDiv = document.createElement('div');
            selDiv.style.cssText = 'position: absolute; border: 2px dashed #fff; box-sizing: border-box; display: none; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); cursor: move; z-index: 1;';
            overlay.appendChild(selDiv);

            const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            const HANDLE_CURSORS = { nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize', se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize' };
            const handleEls = {};
            HANDLES.forEach(pos => {
                const hEl = document.createElement('div');
                hEl.dataset.handle = pos;
                hEl.style.cssText = `position: absolute; width: 10px; height: 10px; background: #fff; border: 1px solid #333; box-sizing: border-box; cursor: ${HANDLE_CURSORS[pos]}; z-index: 2;`;
                selDiv.appendChild(hEl);
                handleEls[pos] = hEl;
            });

            function positionHandles() {
                const W = parseFloat(selDiv.style.width);
                const H = parseFloat(selDiv.style.height);
                const half = 5;
                const positions = {
                    nw: [-half, -half], n: [W / 2 - half, -half], ne: [W - half, -half],
                    e: [W - half, H / 2 - half],
                    se: [W - half, H - half], s: [W / 2 - half, H - half], sw: [-half, H - half],
                    w: [-half, H / 2 - half]
                };
                HANDLES.forEach(p => {
                    handleEls[p].style.left = positions[p][0] + 'px';
                    handleEls[p].style.top = positions[p][1] + 'px';
                });
            }

            function canvasPos(e) {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: Math.max(0, Math.min(e.clientX - rect.left, dispW)),
                    y: Math.max(0, Math.min(e.clientY - rect.top, dispH))
                };
            }

            function updateSelDiv(dx, dy, dw, dh) {
                const r = canvas.getBoundingClientRect();
                selDiv.style.left = (r.left + dx) + 'px';
                selDiv.style.top = (r.top + dy) + 'px';
                selDiv.style.width = dw + 'px';
                selDiv.style.height = dh + 'px';
                selDiv.style.display = dw > 2 && dh > 2 ? 'block' : 'none';
                if (dw > 2 && dh > 2) positionHandles();
            }

            function commitSel(dx, dy, dw, dh) {
                dx = Math.max(0, Math.min(dx, dispW - dw));
                dy = Math.max(0, Math.min(dy, dispH - dh));
                dw = Math.min(dw, dispW - dx);
                dh = Math.min(dh, dispH - dy);
                selDisplay = { x: dx, y: dy, w: dw, h: dh };
                updateSelDiv(dx, dy, dw, dh);
                if (dw > 4 && dh > 4) {
                    // 画布 CSS px → 原图像素（同时考虑 baseScale 与 viewZoom，以及平移偏移）
                    const imgX = Math.round((dx - panX) / (baseScale * viewZoom));
                    const imgY = Math.round((dy - panY) / (baseScale * viewZoom));
                    const imgW = Math.round(dw / (baseScale * viewZoom));
                    const imgH = Math.round(dh / (baseScale * viewZoom));
                    cropRect = {
                        x: Math.max(0, imgX),
                        y: Math.max(0, imgY),
                        w: Math.min(naturalW - Math.max(0, imgX), imgW),
                        h: Math.min(naturalH - Math.max(0, imgY), imgH)
                    };
                    confirmBtn.style.opacity = '1';
                    confirmBtn.style.pointerEvents = 'auto';
                } else {
                    cropRect = null;
                    selDiv.style.display = 'none';
                    confirmBtn.style.opacity = '0.4';
                    confirmBtn.style.pointerEvents = 'none';
                }
            }

            // ─── 拖动状态 ─────────────────────────────────────────────
            let startX, startY;
            let dragMode = null;   // null | 'draw' | 'move' | 'pan' | handle-key
            let dragStart = null;

            // 选区移动
            selDiv.addEventListener('mousedown', (e) => {
                if (e.target.dataset.handle) return;
                e.stopPropagation(); e.preventDefault();
                dragMode = 'move';
                dragStart = { clientX: e.clientX, clientY: e.clientY, ...selDisplay };
            });

            // 手柄缩放
            selDiv.addEventListener('mousedown', (e) => {
                const h = e.target.dataset.handle;
                if (!h) return;
                e.stopPropagation(); e.preventDefault();
                dragMode = h;
                dragStart = { clientX: e.clientX, clientY: e.clientY, ...selDisplay };
            });

            // 画布：新建选区 或 中键平移
            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 1) {
                    // 中键平移
                    e.preventDefault();
                    dragMode = 'pan';
                    dragStart = { clientX: e.clientX, clientY: e.clientY, panX, panY };
                    canvas.style.cursor = 'grabbing';
                    return;
                }
                if (e.button !== 0) return;
                e.stopPropagation();
                const pos = canvasPos(e);
                startX = pos.x; startY = pos.y;
                dragMode = 'draw';
                cropRect = null; selDisplay = null;
                selDiv.style.display = 'none';
                confirmBtn.style.opacity = '0.4';
                confirmBtn.style.pointerEvents = 'none';
            });

            overlay.addEventListener('mousemove', (e) => {
                if (!dragMode) return;
                e.preventDefault();

                if (dragMode === 'pan') {
                    panX = dragStart.panX + (e.clientX - dragStart.clientX);
                    panY = dragStart.panY + (e.clientY - dragStart.clientY);
                    clampPan();
                    redrawCanvas();
                    return;
                }

                if (dragMode === 'draw') {
                    const pos = canvasPos(e);
                    updateSelDiv(
                        Math.min(startX, pos.x), Math.min(startY, pos.y),
                        Math.abs(pos.x - startX), Math.abs(pos.y - startY)
                    );
                    return;
                }

                const ddx = e.clientX - dragStart.clientX;
                const ddy = e.clientY - dragStart.clientY;
                let { x, y, w, h } = dragStart;
                if (dragMode === 'move') {
                    x += ddx; y += ddy;
                } else {
                    if (dragMode.includes('n')) { y += ddy; h -= ddy; }
                    if (dragMode.includes('s')) { h += ddy; }
                    if (dragMode.includes('w')) { x += ddx; w -= ddx; }
                    if (dragMode.includes('e')) { w += ddx; }
                    if (w < 4) { if (dragMode.includes('w')) x = dragStart.x + dragStart.w - 4; w = 4; }
                    if (h < 4) { if (dragMode.includes('n')) y = dragStart.y + dragStart.h - 4; h = 4; }
                }
                x = Math.max(0, Math.min(x, dispW - w));
                y = Math.max(0, Math.min(y, dispH - h));
                w = Math.min(w, dispW - x);
                h = Math.min(h, dispH - y);
                updateSelDiv(x, y, w, h);
            });

            overlay.addEventListener('mouseup', (e) => {
                if (!dragMode) return;

                if (dragMode === 'pan') {
                    dragMode = null; dragStart = null;
                    canvas.style.cursor = viewZoom > 1 ? 'grab' : 'crosshair';
                    return;
                }

                if (dragMode === 'draw') {
                    const pos = canvasPos(e);
                    commitSel(
                        Math.min(startX, pos.x), Math.min(startY, pos.y),
                        Math.abs(pos.x - startX), Math.abs(pos.y - startY)
                    );
                    dragMode = null;
                    return;
                }

                // move / handle commit
                const ddx = e.clientX - dragStart.clientX;
                const ddy = e.clientY - dragStart.clientY;
                let { x, y, w, h } = dragStart;
                if (dragMode === 'move') {
                    x += ddx; y += ddy;
                } else {
                    if (dragMode.includes('n')) { y += ddy; h -= ddy; }
                    if (dragMode.includes('s')) { h += ddy; }
                    if (dragMode.includes('w')) { x += ddx; w -= ddx; }
                    if (dragMode.includes('e')) { w += ddx; }
                    if (w < 4) { if (dragMode.includes('w')) x = dragStart.x + dragStart.w - 4; w = 4; }
                    if (h < 4) { if (dragMode.includes('n')) y = dragStart.y + dragStart.h - 4; h = 4; }
                }
                commitSel(x, y, w, h);
                dragMode = null;
            });

            // ─── 确认 / 取消 ──────────────────────────────────────────
            confirmBtn.addEventListener('click', async () => {
                if (!cropRect) return;
                confirmBtn.textContent = '发送中...';
                confirmBtn.style.opacity = '0.6';
                confirmBtn.style.pointerEvents = 'none';
                try {
                    const cleanImg = await cleanImgPromise;
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = cropRect.w; cropCanvas.height = cropRect.h;
                    cropCanvas.getContext('2d').drawImage(
                        cleanImg, cropRect.x, cropRect.y, cropRect.w, cropRect.h,
                        0, 0, cropRect.w, cropRect.h
                    );
                    const base64 = cropCanvas.toDataURL('image/png');
                    await sendBase64ToEagle(base64, imageUrl);
                    confirmBtn.textContent = '✓ 已发送!';
                    setTimeout(() => overlay.remove(), 1200);
                } catch (err) {
                    alert('发送到 Eagle 失败:\n' + err.message);
                    confirmBtn.textContent = '✓ 裁剪并发送到 Eagle';
                    confirmBtn.style.opacity = '1';
                    confirmBtn.style.pointerEvents = 'auto';
                }
            });

            cancelBtn.addEventListener('click', () => overlay.remove());
        } // end loadImage

        fancyboxRoot.appendChild(overlay);

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);
        overlay.addEventListener('remove', () => document.removeEventListener('keydown', escHandler));
    }

    // ==================== 获取当前图片 URL ====================
    function getCurrentImageUrl() {
        const selectors = [
            '.f-carousel__slide.is-selected img',
            '.fancybox__slide.is-selected img',
            '.fancybox__slide.has-image img',
            '.f-carousel__slide.has-image img'
        ];
        for (const selector of selectors) {
            const img = document.querySelector(selector);
            if (img) {
                const url = img.src || img.dataset.src || img.dataset.lazySrc;
                if (url) { console.log('[Eagle] 通过选择器找到图片:', selector); return url; }
            }
        }
        const fancyboxImgs = document.querySelectorAll('.fancybox__container img, .f-carousel img');
        for (const img of fancyboxImgs) {
            const url = img.src || img.dataset.src || img.dataset.lazySrc;
            if (url && !url.includes('data:image')) { console.log('[Eagle] 通过容器找到图片'); return url; }
        }
        if (window.Fancybox) {
            try {
                const instance = window.Fancybox.getInstance();
                if (instance && instance.getSlide) {
                    const slide = instance.getSlide();
                    const url = slide?.src || slide?.thumb;
                    if (url) { console.log('[Eagle] 通过 Fancybox API 找到图片'); return url; }
                }
            } catch (err) { console.log('[Eagle] Fancybox API 不可用'); }
        }
        return null;
    }

    // ==================== 按钮注入 ====================
    function addSendButton() {
        const toolbar = document.querySelector('.f-carousel__toolbar .is-middle, .f-carousel__toolbar__column.is-middle');

        if (toolbar && !toolbar.querySelector('.eagle-send-button')) {
            console.log('[Eagle] 添加发送按钮');

            // ---- 发送按钮 ----
            const button = document.createElement('button');
            button.className = 'f-button eagle-send-button';
            button.title = '发送到 Eagle';
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            `;

            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const imageUrl = getCurrentImageUrl();

                if (!imageUrl) {
                    console.error('[Eagle] 无法获取图片URL,请检查页面结构');
                    alert('无法获取图片URL\n请在控制台查看详细信息');
                    console.log('[Eagle] 调试信息:');
                    console.log('- Fancybox容器:', document.querySelector('.fancybox__container'));
                    console.log('- 所有图片:', document.querySelectorAll('.fancybox__container img'));
                    return;
                }

                console.log('[Eagle] 最终图片URL:', imageUrl);

                try {
                    button.disabled = true;
                    button.style.opacity = '0.5';
                    button.title = '正在发送...';

                    await sendToEagle(imageUrl);

                    button.title = '✓ 已发送!';
                    button.style.opacity = '1';
                    setTimeout(() => {
                        button.disabled = false;
                        button.title = '发送到 Eagle';
                    }, 1500);
                } catch (error) {
                    console.error('[Eagle] 发送失败:', error);
                    alert('发送到 Eagle 失败:\n' + error.message);
                    button.disabled = false;
                    button.style.opacity = '1';
                    button.title = '发送到 Eagle';
                }
            });

            toolbar.appendChild(button);

            // ---- 裁剪按钮 ----
            const cropButton = document.createElement('button');
            cropButton.className = 'f-button eagle-crop-button';
            cropButton.title = '裁剪后发送到 Eagle';
            cropButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 2 6 8 2 8"></polyline>
                    <polyline points="18 22 18 16 22 16"></polyline>
                    <path d="M6 8L18 8 18 20"></path>
                    <path d="M6 4L6 16 18 16"></path>
                </svg>
            `;

            cropButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const imageUrl = getCurrentImageUrl();
                if (!imageUrl) {
                    alert('无法获取图片URL');
                    return;
                }
                // 把页面上已加载的 img 元素一起传入，用于即时渲染
                const pageImg = document.querySelector(
                    '.f-carousel__slide.is-selected img, .fancybox__slide.is-selected img, .fancybox__slide.has-image img, .f-carousel__slide.has-image img'
                );
                openCropUI(imageUrl, pageImg && pageImg.complete && pageImg.naturalWidth > 0 ? pageImg : null);
            });

            toolbar.appendChild(cropButton);
            console.log('[Eagle] 按钮已添加');
        }
    }

    // ==================== 监听 DOM ====================
    const observer = new MutationObserver(() => {
        const hasFancybox = document.querySelector('.fancybox__container, .f-carousel__toolbar');
        const hasButton = document.querySelector('.eagle-send-button');

        if (hasFancybox && !hasButton) {
            setTimeout(addSendButton, 100);
            setTimeout(addSendButton, 500);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(addSendButton, 1000);
    console.log('[Eagle] 监听器已启动');

    // 注册菜单命令
    GM_registerMenuCommand('Eagle 收图设置', openSettings);

})();
