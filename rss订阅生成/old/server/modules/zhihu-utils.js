/**
 * zhihu-utils.js — 知乎 HTML 处理工具
 *
 * 参考 RSSHub 的 lib/v2/zhihu/utils.js
 * 使用 cheerio 处理知乎 HTML 内容：
 *   - 升级图片分辨率
 *   - 还原跳转链接
 *   - 移除广告元素
 */

const cheerio = require('cheerio');

/**
 * 处理知乎回答/文章的 HTML 内容
 * @param {string} content - 原始 HTML 字符串
 * @returns {string} 处理后的 HTML
 */
function processContent(content) {
    if (!content) return '';

    const $ = cheerio.load(content, null, false);

    // 移除 noscript 标签（知乎用于懒加载图片的备用标签）
    $('noscript').remove();

    // 移除广告链接卡片
    $('a[data-draft-type="mcn-link-card"]').remove();

    // 还原知乎跳转链接 → 原始目标 URL
    $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && href.startsWith('https://link.zhihu.com/?target=')) {
            try {
                const url = new URL(href);
                const target = url.searchParams.get('target');
                if (target) {
                    $(elem).attr('href', decodeURIComponent(target));
                }
            } catch (e) {
                // URL 解析失败，保留原链接
            }
        }
    });

    // 升级图片分辨率：_b.jpg → _1440w.jpg，_r.jpg → _1440w.jpg
    $('img.content_image, img.origin_image, img.content-image, img.data-actualsrc, figure > img, img').each((_, e) => {
        const $e = $(e);
        let src = '';

        if ($e.attr('data-actualsrc')) {
            src = $e.attr('data-actualsrc').replace(/_b\.(jpg|png|gif|webp)/g, '_1440w.$1');
        } else if ($e.attr('data-original')) {
            src = $e.attr('data-original').replace(/_r\.(jpg|png|gif|webp)/g, '_1440w.$1');
        } else if ($e.attr('src')) {
            src = $e.attr('src').replace(/_b\.(jpg|png|gif|webp)/g, '_1440w.$1');
        }

        if (src) {
            $e.attr('src', src);
            $e.removeAttr('width');
            $e.removeAttr('height');
            $e.removeAttr('data-actualsrc');
            $e.removeAttr('data-original');
            // 添加样式使图片在 RSS 阅读器中正常显示
            $e.attr('style', 'max-width:100%');
            $e.attr('referrerpolicy', 'no-referrer');
        }
    });

    // 处理 figure 标签中的 figcaption
    $('figure').each((_, elem) => {
        const $fig = $(elem);
        const $cap = $fig.find('figcaption');
        if ($cap.length) {
            $cap.replaceWith(`<p><em>${$cap.text()}</em></p>`);
        }
    });

    return $.html();
}

/**
 * 将 Pin（想法）的 content 数组转换为 HTML
 * @param {Array|string} contentArr - Pin 的 content 字段
 * @param {string} excerptTitle - Pin 的 excerpt_title
 * @returns {string} HTML 字符串
 */
function buildPinHtml(contentArr, excerptTitle) {
    if (typeof contentArr === 'string') return `<p>${escapeHtml(contentArr)}</p>`;
    if (!Array.isArray(contentArr)) return excerptTitle ? `<p>${escapeHtml(excerptTitle)}</p>` : '';

    const parts = [];

    for (const block of contentArr) {
        switch (block.type) {
            case 'text':
                if (block.own_text || block.content) {
                    parts.push(`<p>${escapeHtml(block.own_text || block.content)}</p>`);
                }
                break;

            case 'image': {
                // 使用高分辨率图片：xl → r 或直接用 original_url
                let imgUrl = block.original_url || block.url || '';
                if (imgUrl) {
                    imgUrl = imgUrl.replace(/\/xl$/, '/r');
                }
                parts.push(`<p><img src="${imgUrl}" style="max-width:100%" referrerpolicy="no-referrer" /></p>`);
                break;
            }

            case 'link':
                if (block.url) {
                    const linkTitle = block.title || block.url;
                    parts.push(`<p><a href="${block.url}" target="_blank">${escapeHtml(linkTitle)}</a></p>`);
                }
                break;

            case 'video': {
                // 视频：优先嵌入播放器，回退到封面图
                if (block.playlist && block.playlist.length > 1) {
                    const video = block.playlist[1]; // 通常第二个是较高质量的
                    parts.push(`<p><video controls width="${video.width || 640}" height="${video.height || 360}" src="${video.url}" poster="${block.cover_url || ''}"></video></p>`);
                } else if (block.cover_url) {
                    parts.push(`<p><img src="${block.cover_url}" style="max-width:100%" referrerpolicy="no-referrer" /><br><em>[视频]</em></p>`);
                } else {
                    parts.push('<p><em>[视频]</em></p>');
                }
                break;
            }

            default:
                if (block.content) {
                    parts.push(`<p>${escapeHtml(block.content)}</p>`);
                }
                break;
        }
    }

    return parts.join('\n');
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { processContent, buildPinHtml };
