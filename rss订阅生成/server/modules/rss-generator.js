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
    if (item.platform === 'bilibili' || item.platform === 'bilibili-alt') {
        return buildBilibiliHtml(item);
    }
    if (item.platform === 'douban') {
        return buildDoubanHtml(item);
    }
    return buildGenericHtml(item);
}

/**
 * B 站专用 HTML 渲染（参考 RSSHub）
 * - 嵌入式视频播放器
 * - 表情图片渲染
 * - 转发动态 blockquote
 */
function buildBilibiliHtml(item) {
    const parts = [];

    // 正文（含表情渲染）
    if (item.content) {
        let text = escapeHtml(item.content).replace(/\n/g, '<br>');
        text = renderEmojis(text, item.emojis);
        parts.push(`<p>${text}</p>`);
    }

    // 图片
    if (item.images && item.images.length > 0) {
        for (const img of item.images) {
            const src = proxyImage(img);
            parts.push(`<p><img src="${src}" style="max-width:100%" referrerpolicy="no-referrer" /></p>`);
        }
    }

    // 视频封面 + 时长 + 嵌入式播放器
    if (item.videoCover) {
        const coverSrc = proxyImage(item.videoCover);
        let coverHtml = `<img src="${coverSrc}" style="max-width:100%" referrerpolicy="no-referrer" />`;
        if (item.videoDuration) {
            coverHtml = `<div style="position:relative;display:inline-block">${coverHtml}` +
                `<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.7);color:#fff;` +
                `padding:1px 4px;border-radius:2px;font-size:12px">${item.videoDuration}</span></div>`;
        }
        parts.push(`<p>${coverHtml}</p>`);
    }

    // 嵌入式播放器（仅视频类型，受配置开关控制）
    if (item.videoBvid && config.render.bilibiliEmbedPlayer) {
        parts.push(buildBilibiliIframe(item.videoBvid));
    }

    // 转发动态 — 用 blockquote 展示原始内容
    if (item.origDynamic) {
        parts.push(buildOrigDynamicHtml(item.origDynamic));
    }

    // 统计信息
    parts.push(buildStatsHtml(item.stats));

    return parts.filter(Boolean).join('\n') || '<p>（无内容）</p>';
}

/**
 * 渲染转发动态的原始内容
 */
function buildOrigDynamicHtml(orig) {
    const inner = [];

    // 原作者
    if (orig.author) {
        inner.push(`<strong>@${escapeHtml(orig.author)}</strong>`);
    }

    // 原标题
    if (orig.title) {
        inner.push(`<p>${escapeHtml(orig.title)}</p>`);
    }

    // 原正文（含表情）
    if (orig.content) {
        let text = escapeHtml(orig.content).replace(/\n/g, '<br>');
        text = renderEmojis(text, orig.emojis);
        inner.push(`<p>${text}</p>`);
    }

    // 原图片
    if (orig.images && orig.images.length > 0) {
        for (const img of orig.images) {
            const src = proxyImage(img);
            inner.push(`<p><img src="${src}" style="max-width:100%" referrerpolicy="no-referrer" /></p>`);
        }
    }

    // 原视频封面
    if (orig.videoCover) {
        const coverSrc = proxyImage(orig.videoCover);
        let coverHtml = `<img src="${coverSrc}" style="max-width:100%" referrerpolicy="no-referrer" />`;
        if (orig.videoDuration) {
            coverHtml = `<div style="position:relative;display:inline-block">${coverHtml}` +
                `<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.7);color:#fff;` +
                `padding:1px 4px;border-radius:2px;font-size:12px">${orig.videoDuration}</span></div>`;
        }
        inner.push(`<p>${coverHtml}</p>`);
    }

    // 原视频嵌入
    if (orig.videoBvid && config.render.bilibiliEmbedPlayer) {
        inner.push(buildBilibiliIframe(orig.videoBvid));
    }

    // 原链接
    if (orig.link) {
        inner.push(`<p><a href="${orig.link}" target="_blank">查看原动态</a></p>`);
    }

    return `<blockquote style="border-left:3px solid #00a1d6;padding:8px 12px;margin:8px 0;background:#f4f5f7">${inner.join('\n')}</blockquote>`;
}

/**
 * 生成 B 站嵌入式播放器 iframe
 * 参考 RSSHub utils.iframe()
 */
function buildBilibiliIframe(bvid) {
    if (!bvid) return '';
    return `<p><iframe src="https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=${bvid}&high_quality=1&autoplay=0" ` +
        `width="650" height="477" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe></p>`;
}

/**
 * 替换 B 站表情文本为内联图片
 * 例如 [doge] → <img alt="[doge]" src="..." />
 */
function renderEmojis(text, emojis) {
    if (!emojis || typeof emojis !== 'object') return text;
    for (const [emojiText, emojiUrl] of Object.entries(emojis)) {
        if (!emojiText || !emojiUrl) continue;
        const escaped = escapeHtml(emojiText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const imgTag = `<img alt="${escapeHtml(emojiText)}" src="${emojiUrl}" ` +
            `style="margin:-1px 1px 0;display:inline-block;width:20px;height:20px;vertical-align:text-bottom" referrerpolicy="no-referrer">`;
        text = text.replace(new RegExp(escaped, 'g'), imgTag);
    }
    return text;
}

/**
 * 豆瓣专用 HTML 渲染
 * 新版 douban-fetcher 已在 item.content 中生成完整 HTML（含图片、卡片、统计）
 * 这里只做 sanitize + 图片代理，不再额外追加重复的 images/stats
 */
function buildDoubanHtml(item) {
    if (!item.content) return '<p>（无内容）</p>';
    const hasHtml = /<[a-zA-Z][^>]*>/.test(item.content);
    if (hasHtml) {
        return proxyImagesInHtml(sanitizeHtml(item.content));
    }
    // 纯文本回退（旧数据）
    return buildGenericHtml(item);
}

/**
 * 通用 HTML 渲染（知乎等）
 */
function buildGenericHtml(item) {
    const parts = [];

    // 作者名
    if (item.author) {
        parts.push(`<p><strong>${escapeHtml(item.author)}</strong></p>`);
    }

    // 正文
    if (item.content) {
        const hasHtml = /<[a-zA-Z][^>]*>/.test(item.content);
        if (hasHtml) {
            let htmlContent = sanitizeHtml(item.content);
            htmlContent = proxyImagesInHtml(htmlContent);
            parts.push(htmlContent);
        } else {
            parts.push(`<p>${escapeHtml(item.content).replace(/\n/g, '<br>')}</p>`);
        }
    }

    // 图片
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
    parts.push(buildStatsHtml(item.stats));

    return parts.filter(Boolean).join('\n') || '<p>（无内容）</p>';
}

/**
 * 构建统计信息 HTML
 */
function buildStatsHtml(stats) {
    if (!stats) return '';
    const statParts = [];
    if (stats.like) statParts.push(`👍 ${stats.like}`);
    if (stats.view) statParts.push(`👀 ${stats.view}`);
    if (stats.comment) statParts.push(`💬 ${stats.comment}`);
    if (stats.forward) statParts.push(`🔄 ${stats.forward}`);
    if (stats.danmaku) statParts.push(`💭 ${stats.danmaku}`);
    if (statParts.length > 0) {
        return `<p style="color:#888;font-size:12px">${statParts.join(' · ')}</p>`;
    }
    return '';
}

// ========== 工具函数 ==========

/**
 * 清理 HTML，保留安全的格式标签，去掉危险标签和多余属性
 * 保留: b, i, strong, em, a(href), br, p, blockquote, img, figure, video 等
 * 去掉: script, style, iframe, data-* 属性等
 */
function sanitizeHtml(html) {
    if (!html) return '';
    // 允许的标签白名单
    const allowedTags = new Set([
        'b', 'i', 'strong', 'em', 'a', 'br', 'p', 'blockquote',
        'ul', 'ol', 'li', 'h2', 'h3', 'h4',
        'img', 'figure', 'figcaption', 'video',
        'div', 'span', 'pre', 'code',
        'sup', 'sub', 'hr',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ]);

    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>|<\/([a-zA-Z][a-zA-Z0-9]*)>/g, (match, openTag, closeTag) => {
        const tag = (openTag || closeTag || '').toLowerCase();
        if (!allowedTags.has(tag)) return ''; // 不在白名单中，直接去掉
        if (closeTag) return `</${tag}>`; // 关闭标签

        // a 标签：保留 href 和 target
        if (tag === 'a') {
            const hrefMatch = match.match(/href=["']([^"']*)["']/i);
            const targetMatch = match.match(/target=["']([^"']*)["']/i);
            const attrs = [];
            if (hrefMatch) attrs.push(`href="${hrefMatch[1]}"`);
            if (targetMatch) attrs.push(`target="${targetMatch[1]}"`);
            return attrs.length > 0 ? `<a ${attrs.join(' ')}>` : '<a>';
        }

        // img 标签：保留 src, style, referrerpolicy
        if (tag === 'img') {
            const srcMatch = match.match(/src=["']([^"']*)["']/i);
            const styleMatch = match.match(/style=["']([^"']*)["']/i);
            const attrs = [];
            if (srcMatch) attrs.push(`src="${srcMatch[1]}"`);
            attrs.push('style="' + (styleMatch ? styleMatch[1] : 'max-width:100%') + '"');
            attrs.push('referrerpolicy="no-referrer"');
            return `<img ${attrs.join(' ')} />`;
        }

        // video 标签：保留 src, controls, width, height, poster
        if (tag === 'video') {
            const srcMatch = match.match(/src=["']([^"']*)["']/i);
            const widthMatch = match.match(/width=["']([^"']*)["']/i);
            const heightMatch = match.match(/height=["']([^"']*)["']/i);
            const posterMatch = match.match(/poster=["']([^"']*)["']/i);
            const attrs = ['controls'];
            if (srcMatch) attrs.push(`src="${srcMatch[1]}"`);
            if (widthMatch) attrs.push(`width="${widthMatch[1]}"`);
            if (heightMatch) attrs.push(`height="${heightMatch[1]}"`);
            if (posterMatch) attrs.push(`poster="${posterMatch[1]}"`);
            return `<video ${attrs.join(' ')}>`;
        }

        // 自闭合标签
        if (tag === 'br' || tag === 'hr') return `<${tag}>`;
        return `<${tag}>`;
    });
}

/**
 * 代理 HTML 内容中的所有图片 URL
 * 扫描 <img src="..."> 标签，将需要代理的 URL 替换为 wsrv.nl 代理 URL
 */
function proxyImagesInHtml(html) {
    if (!html) return '';
    return html.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi, (match, before, src, after) => {
        const proxiedSrc = proxyImage(src);
        return `<img${before}src="${proxiedSrc}"${after}/>`;
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
