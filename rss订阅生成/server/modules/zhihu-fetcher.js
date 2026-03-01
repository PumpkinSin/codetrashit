/**
 * zhihu-fetcher.js — 知乎动态抓取模块（Node 端）
 *
 * 使用 z_c0 Cookie 调用知乎 API 获取关注动态
 * 参考 RSSHub 的知乎实现，抓取完整 HTML 内容
 */

const config = require('../config');
const dataStore = require('./data-store');
const zhihuUtils = require('./zhihu-utils');

const API_BASE = 'https://www.zhihu.com/api/v3/moments';

/**
 * 抓取知乎关注动态
 * @param {object} opts
 * @param {string} opts.cookie  - 完整 Cookie 字符串（至少包含 z_c0）
 * @param {number} opts.maxPages - 最大页数
 */
async function fetchAndStore(opts) {
    const { cookie, maxPages = 5 } = opts;

    if (!cookie) {
        console.log('[ZhihuFetcher] 未配置 Cookie，跳过');
        return { newCount: 0, totalCount: 0 };
    }

    const extraPages = config.zhihu.extraPages || 0;
    console.log(`[ZhihuFetcher] 开始抓取（最多 ${maxPages} 页，重叠后再爬 ${extraPages} 页）...`);

    // 加载已有 ID，用于检测重叠
    const existingIds = new Set(dataStore.load('zhihu').map(i => i.id));

    const items = [];
    let nextUrl = `${API_BASE}?limit=10&desktop=true`;
    let overlapPagesLeft = -1;

    for (let page = 0; page < maxPages; page++) {
        if (!nextUrl) break;

        let json;
        try {
            const resp = await fetch(nextUrl, {
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://www.zhihu.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
                    'X-Requested-With': 'fetch',
                    'Cookie': cookie,
                },
            });

            if (!resp.ok) {
                console.warn(`[ZhihuFetcher] 第 ${page + 1} 页 HTTP ${resp.status}，停止`);
                break;
            }
            json = await resp.json();
        } catch (e) {
            console.warn('[ZhihuFetcher] 请求异常:', e.message);
            break;
        }

        const momentList = json.data || [];
        if (momentList.length === 0) break;

        let pageNewCount = 0;
        let pageTotalCount = 0;

        for (const moment of momentList) {
            // 没有 verb 的条目是广告
            if (!moment.verb) continue;

            // 过滤用户配置的 verb 类型
            if (config.zhihu.skipVerbs.length > 0 && config.zhihu.skipVerbs.includes(moment.verb)) continue;

            const normalized = normalizeMoment(moment);
            if (!normalized) continue;

            pageTotalCount++;
            if (!existingIds.has(normalized.id)) pageNewCount++;
            items.push(normalized);
        }

        // 检测重叠
        if (overlapPagesLeft < 0 && pageTotalCount > 0 && pageNewCount < pageTotalCount / 2) {
            overlapPagesLeft = extraPages;
            console.log(`[ZhihuFetcher] 第 ${page + 1} 页检测到重叠（${pageNewCount}/${pageTotalCount} 新），再爬 ${extraPages} 页`);
        }

        if (overlapPagesLeft >= 0) {
            if (overlapPagesLeft <= 0) {
                console.log(`[ZhihuFetcher] 额外页数已用完，停止`);
                break;
            }
            overlapPagesLeft--;
        }

        nextUrl = json.paging?.next || '';
        if (json.paging?.is_end) break;

        // 礼貌延迟 10~15 秒
        await sleep(10000 + Math.random() * 5000);
    }

    if (items.length === 0) {
        console.log('[ZhihuFetcher] 无新数据');
        return { newCount: 0, totalCount: dataStore.load('zhihu').length };
    }

    const result = dataStore.merge('zhihu', items);
    console.log(`[ZhihuFetcher] 抓取 ${items.length} 条，新增 ${result.newCount} 条`);
    return result;
}

/**
 * 标准化一条知乎动态
 * 参考 RSSHub activities.js 的处理逻辑
 */
function normalizeMoment(moment) {
    try {
        const target = moment.target || {};
        const actor = moment.actors?.[0] || {};
        const momentType = target.type || moment.type || '';

        // 过滤广告/推广
        const isPromo = (url) => url && /zhihu\.com\/zhihu_/.test(url);
        if (isPromo(target.url)) return null;
        if (isPromo(target.source_url)) return null;

        // 过滤内部类型 ID
        const targetId = String(target.id || '');
        if (/^\d+_\d+_/.test(targetId)) return null;

        const author = actor.name || target.author?.name || '';
        const authorAvatar = actor.avatar_url || target.author?.avatar_url || '';

        // 提取完整内容（使用 RSSHub 风格）
        const extracted = extractContent(target, momentType);

        // 过滤广告
        if (extracted.link && /zhihu\.com\/zhihu_/.test(extracted.link)) return null;
        if (!extracted.link) return null;
        if (!author) return null;

        // 构建标题：RSSHub 风格 — "作者名 动作: 标题"
        const actionText = moment.action_text || '';
        const targetTitle = extracted.title
            || (target.question ? target.question.title : '') || '';
        const title = actionText
            ? (targetTitle ? `${author}${actionText}: ${targetTitle}` : `${author}${actionText}`)
            : (extracted.title || `${author} 的动态`);

        const id = `zhihu_${target.id || moment.id || Date.now()}`;
        const pubTime = (target.created_time || target.updated_time || 0) * 1000;

        return {
            id,
            platform: 'zhihu',
            type: momentType,
            author,
            authorFace: authorAvatar,
            title,
            content: extracted.content || '',
            link: extracted.link,
            images: extracted.images || [],
            videoCover: extracted.videoCover || '',
            publishTime: pubTime,
            stats: {
                like: target.voteup_count || 0,
                comment: target.comment_count || 0,
            },
        };
    } catch (e) {
        console.warn('[ZhihuFetcher] 解析动态失败:', e.message);
        return null;
    }
}

/**
 * 提取内容 — 参考 RSSHub 的 activities.js
 * 关键改进：answer/article 使用 target.content（完整 HTML）而非 excerpt
 */
function extractContent(target, type) {
    let title = '', content = '', link = '';
    let images = [], videoCover = '';

    switch (type) {
        case 'answer': {
            const q = target.question || {};
            title = q.title || '';
            // 使用完整 HTML 内容，通过 zhihu-utils 处理图片和链接
            const rawHtml = target.content || target.excerpt || '';
            content = zhihuUtils.processContent(rawHtml);
            link = `https://www.zhihu.com/question/${q.id}/answer/${target.id}`;
            break;
        }
        case 'article': {
            title = target.title || '';
            // 使用完整 HTML 内容
            const rawHtml = target.content || target.excerpt || '';
            content = zhihuUtils.processContent(rawHtml);
            link = `https://zhuanlan.zhihu.com/p/${target.id}`;
            break;
        }
        case 'pin': {
            title = target.excerpt_title || '';
            // Pin 内容使用专门的 HTML 构建函数
            content = zhihuUtils.buildPinHtml(target.content, target.excerpt_title);
            link = `https://www.zhihu.com/pin/${target.id}`;
            break;
        }
        case 'question': {
            title = target.title || '';
            // question 的 detail 字段可能含 HTML
            const rawHtml = target.detail || target.excerpt || '';
            content = rawHtml ? zhihuUtils.processContent(rawHtml) : '';
            link = `https://www.zhihu.com/question/${target.id}`;
            break;
        }
        case 'column': {
            title = target.title || '';
            // 专栏：描述 + 封面图
            const intro = target.intro || target.description || '';
            const imgHtml = target.image_url
                ? `<p><img src="${target.image_url}" style="max-width:100%" referrerpolicy="no-referrer" /></p>`
                : '';
            content = `<p>${intro}</p>${imgHtml}`;
            link = `https://zhuanlan.zhihu.com/${target.id}`;
            break;
        }
        case 'zvideo': {
            title = target.title || '视频';
            content = target.description || target.excerpt || '';
            link = `https://www.zhihu.com/zvideo/${target.id}`;
            if (target.video?.thumbnail) videoCover = target.video.thumbnail;
            else if (target.thumbnail) videoCover = target.thumbnail;
            else if (target.image_url) videoCover = target.image_url;
            break;
        }
        case 'collection': {
            title = target.title || '';
            content = target.description || '';
            link = `https://www.zhihu.com/collection/${target.id}`;
            break;
        }
        case 'topic': {
            title = target.name || '';
            const intro = target.introduction || '';
            const followers = target.followers_count || 0;
            content = `<p>${intro}</p><p>话题关注者人数：${followers}</p>`;
            link = `https://www.zhihu.com/topic/${target.id}`;
            break;
        }
        case 'live': {
            title = target.subject || '';
            const desc = (target.description || '').replace(/\n|\r/g, '<br>');
            content = desc;
            link = `https://www.zhihu.com/lives/${target.id}`;
            break;
        }
        case 'roundtable': {
            title = target.name || '';
            content = target.description || '';
            link = `https://www.zhihu.com/roundtable/${target.id}`;
            break;
        }
        default: {
            title = target.title || '';
            const rawHtml = target.content || target.excerpt || target.description || '';
            content = rawHtml ? zhihuUtils.processContent(rawHtml) : '';
            if (target.url) link = target.url;
            break;
        }
    }
    return { title, content, link, images, videoCover };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchAndStore };
