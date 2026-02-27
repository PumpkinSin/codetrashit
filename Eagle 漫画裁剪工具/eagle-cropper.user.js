// ==UserScript==
// @name         Eagle 一键收图工具
// @namespace    http://tampermonkey.net/
// @version      3.0.0
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
            <div style="background: #2a2a2a; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin-top: 0;">全网默认设置</h3>
                <div id="default-rule-editor"></div>
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

        // 渲染默认规则编辑器
        renderRuleEditor(defaultRule, panel.querySelector('#default-rule-editor'));

        // 渲染站点规则列表
        function renderSiteRulesList() {
            const list = panel.querySelector('#site-rules-list');
            list.innerHTML = '';
            siteRules.forEach((rule, index) => {
                const ruleDiv = document.createElement('div');
                ruleDiv.style.cssText = 'background: #333; padding: 15px; border-radius: 6px; margin-bottom: 10px;';
                ruleDiv.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <label style="color: #aaa;">URL 模式 (支持通配符 *)</label>
                        <input type="text" class="rule-url-pattern" value="${rule.urlPattern}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #555; border-radius: 4px; margin-top: 5px;">
                    </div>
                    <div class="rule-editor-${index}"></div>
                    <div style="margin-top: 10px;">
                        <button class="delete-rule-btn" data-index="${index}" style="padding: 5px 15px; border-radius: 4px; border: none; background: #f44336; color: white; cursor: pointer;">删除</button>
                    </div>
                `;
                list.appendChild(ruleDiv);
                renderRuleEditor(rule, ruleDiv.querySelector(`.rule-editor-${index}`));
            });

            // 删除按钮事件
            list.querySelectorAll('.delete-rule-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    siteRules.splice(index, 1);
                    renderSiteRulesList();
                });
            });
        }

        renderSiteRulesList();

        // 添加规则按钮
        panel.querySelector('#add-rule-btn').addEventListener('click', () => {
            siteRules.push(JSON.parse(JSON.stringify(DEFAULT_RULE)));
            renderSiteRulesList();
        });

        // 保存按钮
        panel.querySelector('#save-settings-btn').addEventListener('click', () => {
            // 读取默认规则
            const defaultEditor = panel.querySelector('#default-rule-editor');
            const newDefaultRule = {
                urlPattern: '*',
                name: {
                    source: defaultEditor.querySelector('.rule-name-source').value,
                    customText: defaultEditor.querySelector('.rule-name-custom').value,
                    regex: defaultEditor.querySelector('.rule-name-regex').value
                },
                annotation: {
                    source: defaultEditor.querySelector('.rule-annotation-source').value,
                    customText: defaultEditor.querySelector('.rule-annotation-custom').value,
                    regex: defaultEditor.querySelector('.rule-annotation-regex').value
                },
                website: {
                    source: defaultEditor.querySelector('.rule-website-source').value,
                    customText: defaultEditor.querySelector('.rule-website-custom').value,
                    regex: defaultEditor.querySelector('.rule-website-regex').value
                },
                tags: defaultEditor.querySelector('.rule-tags').value.split(',').map(t => t.trim()).filter(t => t)
            };

            // 读取站点规则
            const newSiteRules = [];
            panel.querySelectorAll('#site-rules-list > div').forEach((ruleDiv, index) => {
                newSiteRules.push({
                    urlPattern: ruleDiv.querySelector('.rule-url-pattern').value,
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
                });
            });

            saveRules(newDefaultRule, newSiteRules);
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
            if (matchUrlPattern(rule.urlPattern, url)) {
                console.log('[Eagle] 匹配规则:', rule.urlPattern);
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

    // ==================== 按钮注入 ====================
    function addSendButton() {
        const toolbar = document.querySelector('.f-carousel__toolbar .is-middle, .f-carousel__toolbar__column.is-middle');

        if (toolbar && !toolbar.querySelector('.eagle-send-button')) {
            console.log('[Eagle] 添加发送按钮');

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

                // 全面的图片URL获取策略
                let imageUrl = null;

                // 方法1: 当前选中的幻灯片
                const selectors = [
                    '.f-carousel__slide.is-selected img',
                    '.fancybox__slide.is-selected img',
                    '.fancybox__slide.has-image img',
                    '.f-carousel__slide.has-image img'
                ];

                for (const selector of selectors) {
                    const img = document.querySelector(selector);
                    if (img) {
                        imageUrl = img.src || img.dataset.src || img.dataset.lazySrc;
                        if (imageUrl) {
                            console.log('[Eagle] 通过选择器找到图片:', selector);
                            break;
                        }
                    }
                }

                // 方法2: 任意 Fancybox 内的图片
                if (!imageUrl) {
                    const fancyboxImgs = document.querySelectorAll('.fancybox__container img, .f-carousel img');
                    for (const img of fancyboxImgs) {
                        const url = img.src || img.dataset.src || img.dataset.lazySrc;
                        if (url && !url.includes('data:image')) {
                            imageUrl = url;
                            console.log('[Eagle] 通过容器找到图片');
                            break;
                        }
                    }
                }

                // 方法3: 检查 Fancybox API (如果可用)
                if (!imageUrl && window.Fancybox) {
                    try {
                        const instance = window.Fancybox.getInstance();
                        if (instance && instance.getSlide) {
                            const slide = instance.getSlide();
                            imageUrl = slide?.src || slide?.thumb;
                            if (imageUrl) {
                                console.log('[Eagle] 通过 Fancybox API 找到图片');
                            }
                        }
                    } catch (err) {
                        console.log('[Eagle] Fancybox API 不可用');
                    }
                }

                if (!imageUrl) {
                    console.error('[Eagle] 无法获取图片URL,请检查页面结构');
                    alert('无法获取图片URL\n请在控制台查看详细信息');
                    console.log('[Eagle] 调试信息:');
                    console.log('- Fancybox容器:', document.querySelector('.fancybox__container'));
                    console.log('- 所有图片:', document.querySelectorAll('.fancybox__container img'));
                    return;
                }

                console.log('[Eagle] 最终图片URL:', imageUrl);

                // 直接发送到 Eagle
                try {
                    button.disabled = true;
                    button.style.opacity = '0.5';
                    button.title = '正在发送...';

                    await sendToEagle(imageUrl);

                    button.title = '✓ 已发送!';
                    button.style.opacity = '1';
                    // 短暂显示成功状态后恢复
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
