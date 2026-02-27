/**
 * zhihu-fetcher.js — 知乎动态抓取模块（Node 端）
 *
 * 使用 z_c0 Cookie 调用知乎 API 获取关注动态
 */

const config = require('../config');
const dataStore = require('./data-store');

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

function normalizeMoment(moment) {
    try {
        const target = moment.target || {};
        const actor = moment.actors?.[0] || {};
        const momentType = target.type || moment.type || '';

        // 过滤广告/推广：多重检查（zhihu_AD_、zhihu_13_、zhihu_16_ 等内部链接）
        const isPromo = (url) => url && /zhihu\.com\/zhihu_/.test(url);
        if (isPromo(target.url)) return null;
        if (isPromo(target.source_url)) return null;

        // 过滤内部类型 ID（如 16_xxx、13_xxx 等不可访问的条目）
        const targetId = String(target.id || '');
        if (/^\d+_\d+_/.test(targetId)) return null;

        const author = actor.name || target.author?.name || '';
        const authorAvatar = actor.avatar_url || target.author?.avatar_url || '';
        const extracted = extractContent(target, momentType);

        // 过滤广告：生成的链接包含 zhihu_ 内部路径
        if (extracted.link && /zhihu\.com\/zhihu_/.test(extracted.link)) return null;

        // 过滤没有有效链接的条目（通常是广告或不可访问的内容）
        if (!extracted.link) return null;

        // 过滤无作者条目（通常是广告）
        if (!author) return null;

        // 使用 action_text_tpl 生成描述性标题
        const actors = (moment.actors || []).map(a => a.name).join(', ');
        const actionText = moment.action_text_tpl
            ? moment.action_text_tpl.replace('{}', actors) : '';
        const targetTitle = extracted.title
            || (target.question ? target.question.title : '') || '';
        const title = actionText
            ? (targetTitle ? `${actionText}：${targetTitle}` : actionText)
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

function extractContent(target, type) {
    let title = '', content = '', link = '';
    let images = [], videoCover = '';

    switch (type) {
        case 'answer': {
            const q = target.question || {};
            title = q.title || '';
            content = target.excerpt || target.content || '';
            link = `https://www.zhihu.com/question/${q.id}/answer/${target.id}`;
            if (target.thumbnail) images.push(target.thumbnail);
            break;
        }
        case 'article': {
            title = target.title || '';
            content = target.excerpt || target.content || '';
            link = `https://zhuanlan.zhihu.com/p/${target.id}`;
            if (target.image_url) images.push(target.image_url);
            if (target.title_image && target.title_image !== target.image_url)
                images.push(target.title_image);
            break;
        }
        case 'pin': {
            const pinResult = extractPinContent(target);
            content = pinResult.text;
            images = pinResult.images;
            link = `https://www.zhihu.com/pin/${target.id}`;
            break;
        }
        case 'question': {
            title = target.title || '';
            content = target.excerpt || '';
            link = `https://www.zhihu.com/question/${target.id}`;
            break;
        }
        case 'column': {
            title = target.title || '';
            content = target.description || target.intro || '';
            link = `https://zhuanlan.zhihu.com/${target.id}`;
            if (target.image_url) images.push(target.image_url);
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
        default: {
            title = target.title || '';
            content = target.excerpt || target.content || target.description || '';
            if (target.url) link = target.url;
            if (target.image_url) images.push(target.image_url);
            break;
        }
    }
    return { title, content, link, images, videoCover };
}

function extractPinContent(pin) {
    const contentArr = pin.content || [];
    const images = [];
    if (typeof contentArr === 'string') return { text: contentArr, images };
    if (!Array.isArray(contentArr)) return { text: pin.excerpt_title || '', images };

    const textParts = [];
    for (const block of contentArr) {
        switch (block.type) {
            case 'text': textParts.push(block.content || ''); break;
            case 'link': textParts.push(`[${block.title || block.url}](${block.url})`); break;
            case 'image':
                if (block.url) images.push(block.url);
                else if (block.original_url) images.push(block.original_url);
                break;
            case 'video':
                textParts.push('[视频]');
                if (block.cover_url) images.push(block.cover_url);
                break;
            default:
                if (block.content) textParts.push(block.content);
                break;
        }
    }
    return { text: textParts.join('').trim(), images };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchAndStore };
