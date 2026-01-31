// ==UserScript==
// @name         豆瓣书籍复制ID
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  在豆瓣书籍搜索页面（专用/通用）和详情页面添加复制按钮，复制格式化的豆瓣ID（douban:XXXXXXX）
// @author       ai
// @match        https://search.douban.com/book/subject_search*
// @match        https://www.douban.com/search?q=*
// @match        https://book.douban.com/subject/*
// @grant        GM_setClipboard
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

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
    function createActionButton(text, color, onClick) {
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
            transition: background-color 0.2s;
        `;

        button.addEventListener('mouseenter', function () {
            this.style.opacity = '0.8';
        });
        button.addEventListener('mouseleave', function () {
            this.style.opacity = '1';
        });

        button.addEventListener('click', onClick);

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
                const jdButton = createActionButton('京东搜索', '#E3393C', function (e) {
                    e.preventDefault();
                    const jdUrl = `https://search.jd.com/Search?keyword=${encodeURIComponent(isbn)}&enc=utf-8`;
                    window.open(jdUrl, '_blank');
                });
                jdButton.title = `在京东搜索ISBN: ${isbn}`;
                buttonContainer.appendChild(jdButton);
            }

            // B站搜索按钮
            const bookTitle = titleElement.textContent.trim();
            const author = extractAuthor();
            const biliButton = createActionButton('B站搜索', '#00A1D6', function (e) {
                e.preventDefault();
                let searchQuery = bookTitle;
                if (author) {
                    searchQuery = `${bookTitle} ${author}`;
                }
                const biliUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(searchQuery)}`;
                window.open(biliUrl, '_blank');
            });
            biliButton.title = author ? `搜索: ${bookTitle} ${author}` : `搜索: ${bookTitle}`;
            buttonContainer.appendChild(biliButton);

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
