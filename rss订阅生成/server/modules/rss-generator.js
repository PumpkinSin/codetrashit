/**
 * rss-generator.js — RSS XML 生成模块
 *
 * 使用 'feed' 库将标准化的动态数据转换为 RSS 2.0 XML
 * 所有图片 URL 统一通过 wsrv.nl 代理，防止 RSS 阅读器无法显示
 */

const { Feed } = require('feed');
const config = require('../config');

// ========== 图片代理 ==========

const IMAGE_PROXY_PREFIX = 'https://wsrv.nl/?url=';

/**
 * 将图片 URL 通过 wsrv.nl 代理
 * @param {string} url - 原始图片 URL
 * @returns {string} 代理后的 URL
 */
function proxyImage(url) {
    if (!url) return '';
    // 补全协议
    let fullUrl = url.startsWith('//') ? `https:${url}` : url;
    // 已经代理过的不重复处理
    if (fullUrl.startsWith(IMAGE_PROXY_PREFIX)) return fullUrl;
    // 只代理需要代理的域名（B站、知乎等）
    if (needsProxy(fullUrl)) {
        return `${IMAGE_PROXY_PREFIX}${encodeURIComponent(fullUrl)}`;
    }
    return fullUrl;
}

/**
 * 判断 URL 是否需要代理
 */
function needsProxy(url) {
    const proxyDomains = [
        'hdslb.com',      // B站图片 CDN
        'bilivideo.com',   // B站视频封面
        'biliimg.com',     // B站图片
        'bilibili.com',    // B站
        'zhimg.com',       // 知乎图片 CDN
        'zhihu.com',       // 知乎
        'pic1.zhimg.com',
        'pic2.zhimg.com',
        'pic3.zhimg.com',
        'pic4.zhimg.com',
    ];
    try {
        const hostname = new URL(url).hostname;
        return proxyDomains.some(d => hostname.endsWith(d));
    } catch {
        return false;
    }
}

/**
 * 获取条目的第一张图片 URL（用于缩略图）
 */
function getFirstImage(item) {
    // 优先用图片列表
    if (item.images && item.images.length > 0) {
        return item.images[0];
    }
    // 回退到作者头像
    if (item.authorFace) {
        return item.authorFace;
    }
    return '';
}

// ========== RSS 生成 ==========

/**
 * 生成 RSS XML 字符串
 * @param {string} platform - 'bilibili' | 'zhihu'
 * @param {Array} items - 标准化的动态条目列表
 * @returns {string} RSS 2.0 XML
 */
function generate(platform, items) {
    const isB = platform === 'bilibili';
    const isBAlt = platform === 'bilibili-alt';
    const isZhihu = platform === 'zhihu';

    const titleMap = {
        'bilibili': config.rss.bilibiliTitle,
        'zhihu': config.rss.zhihuTitle,
        'bilibili-alt': config.rss.bilibiliAltTitle,
        'douban': config.rss.doubanTitle,
    };
    const descMap = {
        'bilibili': config.rss.bilibiliDescription,
        'zhihu': config.rss.zhihuDescription,
        'bilibili-alt': config.rss.bilibiliAltDescription,
        'douban': config.rss.doubanDescription,
    };

    const feedConfig = {
        title: titleMap[platform] || platform,
        description: descMap[platform] || '',
        id: platform,
        link: isZhihu ? 'https://www.zhihu.com'
            : (platform === 'douban' ? 'https://www.douban.com' : 'https://www.bilibili.com'),
        language: 'zh-CN',
        updated: new Date(),
        generator: 'RSS 动态抓取器',
    };

    // 如果有 R2 公开 URL，设置 feed 自身链接
    if (config.r2.publicUrl) {
        const keyMap = {
            'bilibili': config.rss.bilibiliKey,
            'zhihu': config.rss.zhihuKey,
            'bilibili-alt': config.rss.bilibiliAltKey,
            'douban': config.rss.doubanKey,
        };
        const key = keyMap[platform];
        if (key) {
            feedConfig.feedLinks = {
                rss: `${config.r2.publicUrl}/${key}`,
            };
        }
    }

    const feed = new Feed(feedConfig);

    // 限制条目数量
    const limitedItems = items.slice(0, config.rss.maxItems);

    for (const item of limitedItems) {
        const entry = {
            id: item.id,
            title: item.title || '无标题',
            link: item.link || '',
            date: item.publishTime ? new Date(item.publishTime) : new Date(),
            // 每条显示不同作者（Inoreader 会显示 "来自 XXX"）
            author: [{ name: item.author || '未知' }],
        };

        // 构建 HTML 内容（图片全部代理）
        entry.content = buildContentHtml(item);
        entry.description = truncate(stripHtml(item.content || item.title || ''), 200);

        // 缩略图：proxied URL 作为 image 和 enclosure
        const firstImage = getFirstImage(item);
        if (firstImage) {
            const proxiedThumb = proxyImage(firstImage);
            entry.image = proxiedThumb;
            entry.enclosure = {
                url: proxiedThumb,
                type: 'image/jpeg',
                length: 0,
            };
        }

        feed.addItem(entry);
    }

    // 生成 RSS 2.0 XML
    let xml = feed.rss2();

    // 后处理：修复 feed 库生成的 enclosure type 错误 (image// → image/jpeg)
    xml = xml.replace(/type="image\/\/"/g, 'type="image/jpeg"');

    return xml;
}

/**
 * 构建条目的 HTML 内容（用于 RSS 阅读器展示）
 * 所有图片都通过 wsrv.nl 代理
 */
function buildContentHtml(item) {
    const parts = [];

    // 作者名（不在正文中显示头像，头像仅作为列表预览缩略图）
    if (item.author) {
        parts.push(`<p><strong>${escapeHtml(item.author)}</strong></p>`);
    }

    // 正文
    if (item.content) {
        // 判断内容是否包含 HTML 标签（知乎回答/文章等自带 HTML）
        const hasHtml = /<[a-zA-Z][^>]*>/.test(item.content);
        const htmlContent = hasHtml
            ? sanitizeHtml(item.content)
            : escapeHtml(item.content).replace(/\n/g, '<br>');
        parts.push(`<p>${htmlContent}</p>`);
    }

    // 图片（全部代理）
    if (item.images && item.images.length > 0) {
        for (const img of item.images) {
            const src = proxyImage(img);
            parts.push(`<p><img src="${src}" style="max-width:100%" referrerpolicy="no-referrer" /></p>`);
        }
    }

    // 视频封面 + 时长
    if (item.videoCover && !item.images?.includes(item.videoCover)) {
        const coverSrc = proxyImage(item.videoCover);
        let coverHtml = `<img src="${coverSrc}" style="max-width:100%" referrerpolicy="no-referrer" />`;
        if (item.videoDuration) {
            coverHtml = `<div style="position:relative;display:inline-block">${coverHtml}` +
                `<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.7);color:#fff;` +
                `padding:1px 4px;border-radius:2px;font-size:12px">${item.videoDuration}</span></div>`;
        }
        parts.push(`<p>${coverHtml}</p>`);
    }

    // 统计信息
    if (item.stats) {
        const statParts = [];
        if (item.stats.like) statParts.push(`👍 ${item.stats.like}`);
        if (item.stats.view) statParts.push(`👀 ${item.stats.view}`);
        if (item.stats.comment) statParts.push(`💬 ${item.stats.comment}`);
        if (item.stats.forward) statParts.push(`🔄 ${item.stats.forward}`);
        if (item.stats.danmaku) statParts.push(`💭 ${item.stats.danmaku}`);
        if (statParts.length > 0) {
            parts.push(`<p style="color:#888;font-size:12px">${statParts.join(' · ')}</p>`);
        }
    }

    return parts.join('\n') || '<p>（无内容）</p>';
}

// ========== 工具函数 ==========

/**
 * 清理 HTML，保留安全的格式标签，去掉危险标签和多余属性
 * 保留: b, i, strong, em, a(href), br, p, blockquote
 * 去掉: script, style, iframe, data-* 属性等
 */
function sanitizeHtml(html) {
    if (!html) return '';
    // 允许的标签白名单
    const allowedTags = new Set(['b', 'i', 'strong', 'em', 'a', 'br', 'p', 'blockquote', 'ul', 'ol', 'li']);
    // a 标签只保留 href 属性
    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>|<\/([a-zA-Z][a-zA-Z0-9]*)>/g, (match, openTag, closeTag) => {
        const tag = (openTag || closeTag || '').toLowerCase();
        if (!allowedTags.has(tag)) return ''; // 不在白名单中，直接去掉
        if (closeTag) return `</${tag}>`; // 关闭标签，直接保留
        // 开启标签：只保留 href（仅 a 标签）
        if (tag === 'a') {
            const hrefMatch = match.match(/href=["']([^"']*)["']/i);
            if (hrefMatch) return `<a href="${hrefMatch[1]}">`;
            return '<a>'; // 无 href 的 a 标签
        }
        // 自闭合标签
        if (tag === 'br') return '<br>';
        return `<${tag}>`;
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function stripHtml(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '');
}

function truncate(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

module.exports = { generate };
