// ==UserScript==
// @name         豆瓣书籍复制ID
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  在豆瓣书籍搜索页面（专用/通用）和详情页面添加复制按钮，复制格式化的豆瓣ID（douban:XXXXXXX），配合https://github.com/PumpkinSin/codetrashit/tree/main/calibre-douban使用。
// @author       ai
// @match        https://search.douban.com/book/subject_search*
// @match        https://www.douban.com/search?q=*
// @match        https://book.douban.com/subject/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// 网址可以参考   https://open-slum.org
// @downloadURL https://update.greasyfork.org/scripts/564680/%E8%B1%86%E7%93%A3%E4%B9%A6%E7%B1%8D%E5%A4%8D%E5%88%B6ID.user.js
// @updateURL https://update.greasyfork.org/scripts/564680/%E8%B1%86%E7%93%A3%E4%B9%A6%E7%B1%8D%E5%A4%8D%E5%88%B6ID.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // 默认的安娜书库域名
    const DEFAULT_ANNA_DOMAIN = 'https://zh.annas-archive.li';

    // 默认的Z-Library域名
    const DEFAULT_ZLIBRARY_DOMAIN = 'https://z-library.sk';

    // 默认的LibGen域名
    const DEFAULT_LIBGEN_DOMAIN = 'https://libgen.vg';

    // 统一处理域名输入
    function normalizeDomain(raw) {
        let domain = raw.trim();
        if (domain.endsWith('/')) domain = domain.slice(0, -1);
        if (domain && !domain.startsWith('http')) domain = 'https://' + domain;
        return domain;
    }

    // 显示域名设置弹窗
    function showSettingsModal() {
        // 避免重复创建
        if (document.getElementById('db-settings-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'db-settings-modal';
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.25);
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff;
            border-radius: 8px;
            padding: 28px 32px 24px;
            width: 420px;
            max-width: 90vw;
            box-shadow: 0 4px 24px rgba(0,0,0,0.12);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        const title = document.createElement('div');
        title.textContent = '书库域名设置';
        title.style.cssText = `font-size: 15px; font-weight: 600; color: #111; margin-bottom: 20px;`;
        modal.appendChild(title);

        const fields = [
            { label: '安娜书库', key: 'anna_domain', def: DEFAULT_ANNA_DOMAIN },
            { label: 'Z-Library', key: 'zlibrary_domain', def: DEFAULT_ZLIBRARY_DOMAIN },
            { label: 'LibGen', key: 'libgen_domain', def: DEFAULT_LIBGEN_DOMAIN },
        ];

        const inputs = {};
        fields.forEach(({ label, key, def }) => {
            const row = document.createElement('div');
            row.style.cssText = `margin-bottom: 14px;`;

            const lbl = document.createElement('label');
            lbl.textContent = label;
            lbl.style.cssText = `display: block; font-size: 12px; color: #555; margin-bottom: 5px;`;
            row.appendChild(lbl);

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = GM_getValue(key, def);
            inp.style.cssText = `
                width: 100%; box-sizing: border-box;
                padding: 7px 10px;
                border: 1px solid #ddd; border-radius: 5px;
                font-size: 13px; color: #222;
                outline: none;
            `;
            inp.addEventListener('focus', () => inp.style.borderColor = '#42BD56');
            inp.addEventListener('blur', () => inp.style.borderColor = '#ddd');
            row.appendChild(inp);
            inputs[key] = inp;
            modal.appendChild(row);
        });

        // 按钮行
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px;`;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 7px 18px; border: 1px solid #ddd; border-radius: 5px;
            background: #fff; color: #555; font-size: 13px; cursor: pointer;
        `;
        cancelBtn.addEventListener('click', () => overlay.remove());

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存';
        saveBtn.style.cssText = `
            padding: 7px 18px; border: none; border-radius: 5px;
            background: #42BD56; color: #fff; font-size: 13px; cursor: pointer;
        `;
        saveBtn.addEventListener('click', () => {
            fields.forEach(({ key }) => {
                const val = normalizeDomain(inputs[key].value);
                if (val) GM_setValue(key, val);
            });
            overlay.remove();
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        modal.appendChild(btnRow);

        overlay.appendChild(modal);
        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        inputs[fields[0].key].focus();
    }

    // 注册设置菜单
    try {
        GM_registerMenuCommand('书库域名设置', showSettingsModal);
    } catch (e) {
        console.warn('Tampermonkey API not available for menu command registration.', e);
    }

    // 获取当前的安娜书库域名
    function getAnnaDomain() {
        try {
            return GM_getValue('anna_domain', DEFAULT_ANNA_DOMAIN);
        } catch (e) {
            return DEFAULT_ANNA_DOMAIN;
        }
    }

    // 获取当前的Z-Library域名
    function getZLibraryDomain() {
        try {
            return GM_getValue('zlibrary_domain', DEFAULT_ZLIBRARY_DOMAIN);
        } catch (e) {
            return DEFAULT_ZLIBRARY_DOMAIN;
        }
    }

    // 获取当前的LibGen域名
    function getLibGenDomain() {
        try {
            return GM_getValue('libgen_domain', DEFAULT_LIBGEN_DOMAIN);
        } catch (e) {
            return DEFAULT_LIBGEN_DOMAIN;
        }
    }

    // 通用的复制按钮样式
    const buttonStyle = `
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        background-color: #42BD56;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        font-weight: normal;
        transition: background-color 0.2s;
    `;

    const buttonHoverStyle = `
        background-color: #3AA84A;
    `;

    // 创建复制按钮
    function createCopyButton(bookId) {
        const button = document.createElement('button');
        button.textContent = '复制ID';
        button.style.cssText = buttonStyle;
        button.title = `复制: doubanbook:${bookId}`;

        // 鼠标悬停效果
        button.addEventListener('mouseenter', function () {
            this.style.backgroundColor = '#3AA84A';
        });
        button.addEventListener('mouseleave', function () {
            this.style.backgroundColor = '#42BD56';
        });

        // 点击复制
        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const textToCopy = `doubanbook:${bookId}`;

            // 使用GM_setClipboard复制到剪贴板
            GM_setClipboard(textToCopy);

            // 显示反馈
            const originalText = this.textContent;
            this.textContent = '已复制!';
            this.style.backgroundColor = '#37A41C';

            setTimeout(() => {
                this.textContent = originalText;
                this.style.backgroundColor = '#42BD56';
            }, 1500);

            // 显示通知
            GM_notification({
                text: `已复制: ${textToCopy}`,
                timeout: 2000
            });
        });

        return button;
    }

    // 从URL中提取书籍ID
    function extractBookIdFromUrl(url) {
        // 支持两种格式：
        // 1. 直接链接：/subject/36956912
        // 2. 重定向链接：/doubanapp/dispatch?uri=/book/36956912
        let match = url.match(/\/subject\/(\d+)/);
        if (match) return match[1];

        match = url.match(/uri=\/book\/(\d+)/);
        if (match) return match[1];

        return null;
    }

    // 处理搜索结果页面（专用书籍搜索页）
    function handleSearchPage() {
        // 查找所有书籍标题链接
        const bookLinks = document.querySelectorAll('.title a[href*="/subject/"]');

        bookLinks.forEach(link => {
            // 检查是否已经添加过按钮
            if (link.parentElement.querySelector('.douban-copy-btn')) {
                return;
            }

            const bookId = extractBookIdFromUrl(link.href);
            if (bookId) {
                const button = createCopyButton(bookId);
                button.classList.add('douban-copy-btn');

                // 在标题链接后插入按钮
                link.parentElement.insertBefore(button, link.nextSibling);
            }
        });
    }

    // 处理通用搜索页面（www.douban.com/search）
    function handleGeneralSearchPage() {
        // 查找所有书籍标题链接（通用搜索页面使用不同的选择器）
        // 新版豆瓣搜索页面使用 DouWeb-SR-subject-info-name.book 类
        const bookLinks = document.querySelectorAll('a.DouWeb-SR-subject-info-name.book, a[href*="/doubanapp/dispatch?uri=/book/"]');

        bookLinks.forEach(link => {
            // 检查是否已经添加过按钮
            if (link.parentElement.querySelector('.douban-copy-btn')) {
                return;
            }

            const bookId = extractBookIdFromUrl(link.href);
            if (bookId) {
                const button = createCopyButton(bookId);
                button.classList.add('douban-copy-btn');

                // 在标题链接后插入按钮
                link.parentElement.insertBefore(button, link.nextSibling);
            }
        });
    }

    // 提取ISBN信息
    function extractISBN() {
        const isbnElement = document.querySelector('#info');
        if (!isbnElement) return null;

        const isbnMatch = isbnElement.textContent.match(/ISBN[:：]\s*(\d+)/);
        return isbnMatch ? isbnMatch[1] : null;
    }

    // 提取作者信息
    function extractAuthor() {
        const infoSection = document.querySelector('#info');
        if (!infoSection) {
            console.log('未找到#info元素');
            return null;
        }

        // 使用正则表达式从info区域提取作者
        const authorMatch = infoSection.textContent.match(/作者[:：]\s*([^\n]+)/);
        if (authorMatch) {
            // 移除副标题和其他额外信息，只保留第一个作者名
            let authorText = authorMatch[1].trim();
            // 移除可能的链接或其他格式
            authorText = authorText.replace(/\s*\/.*$/, ''); // 移除斜杠后的内容
            authorText = authorText.replace(/\s*\[.*?\]\s*/g, ''); // 移除方括号内容
            console.log('提取的作者:', authorText.trim());
            return authorText.trim();
        }

        console.log('未能从info中提取作者');
        return null;
    }

    // 创建通用按钮
    function createActionButton(text, color, onClick, url) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            display: inline-block;
            margin-left: 8px;
            padding: 4px 12px;
            background-color: ${color};
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            font-weight: normal;
            line-height: 1.5;
            transition: background-color 0.2s;
        `;

        button.addEventListener('mouseenter', function () {
            this.style.opacity = '0.8';
        });
        button.addEventListener('mouseleave', function () {
            this.style.opacity = '1';
        });

        button.addEventListener('click', onClick);

        if (url) {
            button.addEventListener('mousedown', function (e) {
                if (e.button === 1) {
                    e.preventDefault();
                    requestAnimationFrame(() => {
                        window.open(url, '_blank');
                        setTimeout(() => window.focus(), 0);
                    });
                }
            });
        }

        return button;
    }

    // 处理书籍详情页面
    function handleDetailPage() {
        // 从URL中提取书籍ID
        const bookId = extractBookIdFromUrl(window.location.href);

        if (!bookId) {
            console.log('无法从URL中提取书籍ID');
            return;
        }

        // 查找书名元素（详情页面的书名）
        const titleElement = document.querySelector('h1 span[property="v:itemreviewed"]');
        console.log('找到书名元素:', titleElement);

        if (titleElement && !document.querySelector('.douban-detail-buttons')) {
            // 创建按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('douban-detail-buttons');
            buttonContainer.style.cssText = `
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            // 复制ID按钮
            const copyButton = createCopyButton(bookId);
            copyButton.classList.add('douban-detail-copy-btn');
            copyButton.style.fontSize = '14px';
            copyButton.style.padding = '4px 12px';
            copyButton.style.marginLeft = '0';
            buttonContainer.appendChild(copyButton);

            // 京东搜索按钮
            const isbn = extractISBN();
            if (isbn) {
                const jdUrl = `https://search.jd.com/Search?keyword=${encodeURIComponent(isbn)}&enc=utf-8`;
                const jdButton = createActionButton('京东搜索', '#E3393C', function (e) {
                    e.preventDefault();
                    window.open(jdUrl, '_blank');
                }, jdUrl);
                jdButton.title = `在京东搜索ISBN: ${isbn}`;
                buttonContainer.appendChild(jdButton);
            }

            // B站搜索按钮
            const bookTitle = titleElement.textContent.trim();
            const author = extractAuthor();
            let searchQuery = bookTitle;
            if (author) {
                searchQuery = `${bookTitle} ${author}`;
            }
            const biliUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(searchQuery)}`;
            const biliButton = createActionButton('B站搜索', '#00A1D6', function (e) {
                e.preventDefault();
                window.open(biliUrl, '_blank');
            }, biliUrl);
            biliButton.title = author ? `搜索: ${bookTitle} ${author}` : `搜索: ${bookTitle}`;
            buttonContainer.appendChild(biliButton);

            // Z-Library搜索按钮
            if (isbn) {
                const domain = getZLibraryDomain();
                const zlibUrl = `${domain}/s/${encodeURIComponent(isbn)}`;
                const zlibButton = createActionButton('Z-Library', '#5B4FBE', function (e) {
                    e.preventDefault();
                    window.open(zlibUrl, '_blank');
                }, zlibUrl);
                zlibButton.title = `在Z-Library搜索ISBN: ${isbn}`;
                buttonContainer.appendChild(zlibButton);
            }

            // 安娜书库搜索按钮
            if (isbn) {
                const domain = getAnnaDomain();
                const annaUrl = `${domain}/search?q=${encodeURIComponent(isbn)}`;
                const annaButton = createActionButton('安娜书库', '#E06D14', function (e) {
                    e.preventDefault();
                    window.open(annaUrl, '_blank');
                }, annaUrl);
                annaButton.title = `在安娜书库搜索ISBN: ${isbn}`;
                buttonContainer.appendChild(annaButton);
            }

            // LibGen搜索按钮
            if (isbn) {
                const domain = getLibGenDomain();
                const libgenUrl = `${domain}/search.php?req=${encodeURIComponent(isbn)}&column=identifier`;
                const libgenButton = createActionButton('LibGen', '#4CAF50', function (e) {
                    e.preventDefault();
                    window.open(libgenUrl, '_blank');
                }, libgenUrl);
                libgenButton.title = `在LibGen搜索ISBN: ${isbn}`;
                buttonContainer.appendChild(libgenButton);
            }

            // 将按钮容器插入到书名上方
            const h1Element = titleElement.parentElement;
            console.log('h1元素:', h1Element);
            console.log('h1的父元素:', h1Element.parentElement);
            if (h1Element && h1Element.parentElement) {
                h1Element.parentElement.insertBefore(buttonContainer, h1Element);
                console.log('按钮容器已插入');
            } else {
                console.log('无法插入按钮容器，父元素不存在');
            }
        }
    }

    // 初始化函数
    function init() {
        const currentUrl = window.location.href;

        if (currentUrl.includes('search.douban.com/book/subject_search')) {
            // 专用书籍搜索页面
            handleSearchPage();

            // 监听DOM变化（处理动态加载的内容）
            const observer = new MutationObserver(function (mutations) {
                handleSearchPage();
            });

            const targetNode = document.querySelector('.result-list') || document.body;
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
        } else if (currentUrl.includes('www.douban.com/search')) {
            // 通用搜索页面
            handleGeneralSearchPage();

            // 监听DOM变化（处理动态加载的内容）
            const observer = new MutationObserver(function (mutations) {
                handleGeneralSearchPage();
            });

            const targetNode = document.body;
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
        } else if (currentUrl.includes('book.douban.com/subject/')) {
            // 详情页面
            handleDetailPage();
        }
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
