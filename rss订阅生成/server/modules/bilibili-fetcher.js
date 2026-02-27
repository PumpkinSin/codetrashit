/**
 * bilibili-fetcher.js — B站动态抓取模块（Node 端）
 *
 * 使用 SESSDATA Cookie 调用 B站 API 获取关注动态
 * 可复用于主号和小号（传入不同 Cookie 即可）
 */

const config = require('../config');
const dataStore = require('./data-store');

const API_BASE = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all';

/**
 * 抓取 B 站关注动态
 * @param {object} opts
 * @param {string} opts.sessdata  - SESSDATA Cookie
 * @param {string} opts.platform  - 'bilibili' | 'bilibili-alt'
 * @param {number} opts.maxPages  - 最大页数
 * @param {boolean} opts.videoOnly - 是否只保留视频（DYNAMIC_TYPE_AV）
 */
async function fetchAndStore(opts) {
    const { sessdata, platform, maxPages = 5, videoOnly = false } = opts;

    if (!sessdata) {
        console.log(`[BilibiliFetcher] ${platform}: 未配置 SESSDATA，跳过`);
        return { newCount: 0, totalCount: 0 };
    }

    const label = platform === 'bilibili-alt' ? 'B站小号' : 'B站主号';
    const extraPages = config.bilibili.extraPages || 0;
    console.log(`[BilibiliFetcher] ${label}: 开始抓取（最多 ${maxPages} 页，重叠后再爬 ${extraPages} 页）...`);

    // 加载已有 ID，用于检测重叠
    const existingIds = new Set(dataStore.load(platform).map(i => i.id));

    const items = [];
    let offset = '';
    let overlapPagesLeft = -1; // -1=未触发重叠，>=0=剩余额外页数

    for (let page = 0; page < maxPages; page++) {
        const url = new URL(API_BASE);
        url.searchParams.set('type', 'all');
        url.searchParams.set('timezone_offset', '-480');
        if (offset) url.searchParams.set('offset', offset);

        let json;
        try {
            const resp = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://www.bilibili.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
                    'Cookie': `SESSDATA=${sessdata}`,
                },
            });

            if (!resp.ok) {
                console.warn(`[BilibiliFetcher] ${label}: 第 ${page + 1} 页 HTTP ${resp.status}，停止`);
                break;
            }
            json = await resp.json();
        } catch (e) {
            console.warn(`[BilibiliFetcher] ${label}: 请求异常:`, e.message);
            break;
        }

        if (!json || json.code !== 0) {
            console.warn(`[BilibiliFetcher] ${label}: API 错误: ${json?.code} - ${json?.message}`);
            break;
        }

        const dynamicItems = json.data?.items || [];
        if (dynamicItems.length === 0) break;

        let pageNewCount = 0;
        let pageTotalCount = 0;

        for (const item of dynamicItems) {
            if (videoOnly && item.type !== 'DYNAMIC_TYPE_AV') continue;

            // 跳过用户配置的动态类型
            if (config.bilibili.skipTypes.length > 0 && config.bilibili.skipTypes.includes(item.type)) continue;

            const normalized = normalizeDynamic(item, platform);
            if (!normalized) continue;

            // 关键词黑名单（匹配标题 + 正文，不区分大小写）
            if (config.bilibili.blockKeywords.length > 0) {
                const text = `${normalized.title} ${normalized.content}`.toLowerCase();
                const blocked = config.bilibili.blockKeywords.some(kw => text.includes(kw.toLowerCase()));
                if (blocked) {
                    console.log(`[BilibiliFetcher] 关键词过滤: "${normalized.title.slice(0, 40)}..."`);
                    continue;
                }
            }

            pageTotalCount++;
            if (!existingIds.has(normalized.id)) pageNewCount++;
            items.push(normalized);
        }

        // 检测重叠：本页超过一半是已有内容
        if (overlapPagesLeft < 0 && pageTotalCount > 0 && pageNewCount < pageTotalCount / 2) {
            overlapPagesLeft = extraPages;
            console.log(`[BilibiliFetcher] ${label}: 第 ${page + 1} 页检测到重叠（${pageNewCount}/${pageTotalCount} 新），再爬 ${extraPages} 页`);
        }

        // 额外页数用完则停止
        if (overlapPagesLeft >= 0) {
            if (overlapPagesLeft <= 0) {
                console.log(`[BilibiliFetcher] ${label}: 额外页数已用完，停止`);
                break;
            }
            overlapPagesLeft--;
        }

        offset = json.data?.offset || '';
        if (!json.data?.has_more) break;

        // 防风控随机延迟 8~15 秒
        const delay = 8000 + Math.random() * 7000;
        await sleep(delay);
    }

    if (items.length === 0) {
        console.log(`[BilibiliFetcher] ${label}: 无新数据`);
        return { newCount: 0, totalCount: dataStore.load(platform).length };
    }

    const result = dataStore.merge(platform, items);
    console.log(`[BilibiliFetcher] ${label}: 抓取 ${items.length} 条，新增 ${result.newCount} 条`);

    // 主号抓取时，自动提取视频给 bilibili-alt（如果没有独立的小号 SESSDATA）
    if (platform === 'bilibili' && !config.bilibiliAlt.sessdata) {
        const videoItems = items.filter(i => i.type === 'DYNAMIC_TYPE_AV');
        if (videoItems.length > 0) {
            const altResult = dataStore.merge('bilibili-alt', videoItems);
            console.log(`[BilibiliFetcher] 自动提取 ${videoItems.length} 条视频 → bilibili-alt（新增 ${altResult.newCount}）`);
        }
    }

    return result;
}

/**
 * 标准化 B 站动态数据
 */
function normalizeDynamic(item, platform) {
    try {
        const modules = item.modules || {};
        const authorModule = modules.module_author || {};
        const dynamicModule = modules.module_dynamic || {};
        const statModule = modules.module_stat || {};

        const author = authorModule.name || '未知作者';
        const authorFace = authorModule.face || '';
        const authorMid = authorModule.mid || '';
        const pubTs = authorModule.pub_ts || 0;
        const dynamicId = item.id_str || '';
        const dynamicType = item.type || '';

        const extracted = extractContent(item, dynamicType, dynamicModule);
        const title = buildTitle(author, dynamicType, extracted.title);

        return {
            id: dynamicId,
            platform,
            type: dynamicType,
            author,
            authorFace,
            authorMid,
            title,
            content: extracted.content || '',
            link: extracted.link || `https://www.bilibili.com/opus/${dynamicId}`,
            images: extracted.images || [],
            videoCover: extracted.videoCover || '',
            videoDuration: extracted.videoDuration || '',
            publishTime: pubTs * 1000,
            stats: {
                like: statModule.like?.count || 0,
                view: statModule.comment?.count || 0,
                comment: statModule.comment?.count || 0,
                forward: statModule.forward?.count || 0,
            },
        };
    } catch (e) {
        console.warn('[BilibiliFetcher] 解析动态失败:', e.message);
        return null;
    }
}

function buildTitle(author, type, contentTitle) {
    const t = contentTitle || '';
    switch (type) {
        case 'DYNAMIC_TYPE_AV':
            return t ? `${author} 投稿了视频：${t}` : `${author} 投稿了视频`;
        case 'DYNAMIC_TYPE_DRAW':
            return `${author} 发布了图文动态`;
        case 'DYNAMIC_TYPE_ARTICLE':
            return t ? `${author} 发表了专栏文章：${t}` : `${author} 发表了专栏文章`;
        case 'DYNAMIC_TYPE_WORD':
            return `${author} 发布了动态`;
        case 'DYNAMIC_TYPE_FORWARD':
            return `${author} 转发了动态`;
        case 'DYNAMIC_TYPE_LIVE_RCMD':
            return t ? `${author} 正在直播：${t}` : `${author} 正在直播`;
        case 'DYNAMIC_TYPE_MUSIC':
            return t ? `${author} 发布了音频：${t}` : `${author} 发布了音频`;
        case 'DYNAMIC_TYPE_PGC':
            return t ? `${author} 分享了番剧：${t}` : `${author} 分享了番剧`;
        default:
            return t ? `${author}：${t}` : `${author} 的动态`;
    }
}

function extractContent(item, type, dynamicModule) {
    const major = dynamicModule?.major || {};
    const desc = dynamicModule?.desc || {};

    let title = '', content = desc?.text || '', link = '';
    let images = [], videoCover = '', videoDuration = '';

    switch (type) {
        case 'DYNAMIC_TYPE_AV': {
            const archive = major.archive || {};
            title = archive.title || '';
            content = archive.desc || content;
            link = archive.jump_url ? `https:${archive.jump_url}` : '';
            videoCover = archive.cover || '';
            videoDuration = archive.duration_text || '';
            break;
        }
        case 'DYNAMIC_TYPE_DRAW': {
            images = (major.draw?.items || []).map(i => i.src).filter(Boolean);
            // 新版图文格式：文字可能在 opus.summary.text 中
            if (!content && major.opus?.summary?.text) {
                content = major.opus.summary.text;
            }
            break;
        }
        case 'DYNAMIC_TYPE_ARTICLE': {
            const article = major.article || {};
            title = article.title || '';
            link = article.jump_url ? `https:${article.jump_url}` : '';
            if (article.covers?.length) images = article.covers;
            break;
        }
        case 'DYNAMIC_TYPE_FORWARD': {
            const orig = item.orig;
            if (orig) {
                const origModules = orig.modules || {};
                const origAuthor = origModules.module_author?.name || '未知';
                const origDynamic = origModules.module_dynamic || {};
                const origType = orig.type || '';
                const origContent = extractContent(orig, origType, origDynamic);
                content += `\n\n【转发自 @${origAuthor}】`;
                if (origContent.title) content += `\n${origContent.title}`;
                if (origContent.content) content += `\n${origContent.content}`;
                if (origContent.images.length > 0) images = origContent.images;
                if (origContent.videoCover) videoCover = origContent.videoCover;
                if (origContent.link) link = origContent.link;
            }
            break;
        }
        case 'DYNAMIC_TYPE_LIVE_RCMD': {
            try {
                const liveInfo = major.live_rcmd?.content
                    ? JSON.parse(major.live_rcmd.content) : {};
                const ld = liveInfo.live_play_info || liveInfo;
                title = ld.title || '直播';
                link = ld.link ? (ld.link.startsWith('//') ? `https:${ld.link}` : ld.link)
                    : `https://live.bilibili.com/${ld.room_id || ''}`;
                if (ld.cover) videoCover = ld.cover;
                content = `🔴 直播中: ${title}`;
            } catch { content = '直播推荐'; }
            break;
        }
        case 'DYNAMIC_TYPE_MUSIC': {
            const music = major.music || {};
            title = music.title || '音频';
            link = music.jump_url ? `https:${music.jump_url}` : '';
            if (music.cover) videoCover = music.cover;
            break;
        }
        case 'DYNAMIC_TYPE_PGC': {
            const pgc = major.pgc || {};
            title = pgc.title || '';
            link = pgc.jump_url ? `https:${pgc.jump_url}` : '';
            if (pgc.cover) videoCover = pgc.cover;
            break;
        }
        default: break;
    }

    return { title, content, link, images, videoCover, videoDuration };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchAndStore };
