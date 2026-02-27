/**
 * douban-fetcher.js — 豆瓣关注动态抓取模块（Node 端）
 *
 * 使用 dbcl2 Cookie 调用豆瓣移动端 Rexxar API 获取关注时间线
 */

const config = require('../config');
const dataStore = require('./data-store');

const API_BASE = 'https://m.douban.com/rexxar/api/v2/status/home_timeline';

/**
 * 抓取豆瓣关注动态
 */
async function fetchAndStore() {
    const { cookie: rawCookie, maxPages, extraPages, skipActivities } = config.douban;

    if (!rawCookie) {
        console.log('[DoubanFetcher] 未配置 Cookie，跳过');
        return { newCount: 0, totalCount: 0 };
    }

    // Cookie 处理：支持完整 Cookie 字符串或仅 dbcl2 值
    let cookie = rawCookie;
    if (!cookie.includes('dbcl2=')) {
        // 用户只填了 dbcl2 的值，自动包装
        const val = cookie.replace(/^"|"$/g, '');
        cookie = `dbcl2="${val}"`;
    }

    // 从 Cookie 中提取 ck（CSRF token）用于 URL 参数
    let ck = '';
    const ckMatch = cookie.match(/(?:^|;\s*)ck=([^;]*)/);
    if (ckMatch) ck = ckMatch[1];

    console.log(`[DoubanFetcher] 开始抓取（最多 ${maxPages} 页，重叠后再爬 ${extraPages} 页）...`);

    const existingIds = new Set(dataStore.load('douban').map(i => i.id));
    const items = [];
    let maxId = '';
    let overlapPagesLeft = -1;

    for (let page = 0; page < maxPages; page++) {
        const url = maxId
            ? `${API_BASE}?max_id=${maxId}&ck=${ck}&for_mobile=1`
            : `${API_BASE}?ck=${ck}&for_mobile=1`;

        let json;
        try {
            const resp = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Host': 'm.douban.com',
                    'Origin': 'https://m.douban.com',
                    'Referer': 'https://m.douban.com/mine/statuses',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                    'Cookie': cookie,
                },
            });

            if (!resp.ok) {
                console.warn(`[DoubanFetcher] 第 ${page + 1} 页 HTTP ${resp.status}，停止`);
                break;
            }
            json = await resp.json();
        } catch (e) {
            console.warn('[DoubanFetcher] 请求异常:', e.message);
            break;
        }

        const statusItems = json.items || [];
        if (statusItems.length === 0) break;

        let pageNewCount = 0;
        let pageTotalCount = 0;

        for (const item of statusItems) {
            const status = item.status || item;
            if (!status) continue;

            const activity = status.activity || '';

            // 跳过用户配置的动态类型
            if (skipActivities.length > 0 && skipActivities.includes(activity)) continue;

            const normalized = normalizeStatus(status);
            if (!normalized) continue;

            pageTotalCount++;
            if (!existingIds.has(normalized.id)) pageNewCount++;
            items.push(normalized);
        }

        // 检测重叠
        if (overlapPagesLeft < 0 && pageTotalCount > 0 && pageNewCount < pageTotalCount / 2) {
            overlapPagesLeft = extraPages;
            console.log(`[DoubanFetcher] 第 ${page + 1} 页检测到重叠（${pageNewCount}/${pageTotalCount} 新），再爬 ${extraPages} 页`);
        }

        if (overlapPagesLeft >= 0) {
            if (overlapPagesLeft <= 0) {
                console.log('[DoubanFetcher] 额外页数已用完，停止');
                break;
            }
            overlapPagesLeft--;
        }

        // 翻页：取最后一个 item 的 id 作为 max_id
        const lastItem = statusItems[statusItems.length - 1];
        maxId = lastItem?.id || '';
        if (!maxId) break;

        // 延迟 8~15 秒
        await sleep(8000 + Math.random() * 7000);
    }

    if (items.length === 0) {
        console.log('[DoubanFetcher] 无新数据');
        return { newCount: 0, totalCount: dataStore.load('douban').length };
    }

    const result = dataStore.merge('douban', items);
    console.log(`[DoubanFetcher] 抓取 ${items.length} 条，新增 ${result.newCount} 条`);
    return result;
}

/**
 * 标准化豆瓣动态数据
 */
function normalizeStatus(status) {
    try {
        const author = status.author?.name || '未知用户';
        const authorAvatar = status.author?.avatar || '';
        const activity = status.activity || '说';
        const text = status.text || '';
        const createTime = status.create_time || '';
        const sharingUrl = status.sharing_url || '';
        const statusId = String(status.id || Date.now());

        // 构建标题
        let title = '';
        if (status.card) {
            const cardTitle = status.card.title || '';
            title = cardTitle
                ? `${author} ${activity}《${cardTitle}》`
                : `${author} ${activity}`;
        } else if (activity === '转发' && status.reshared_status) {
            const origAuthor = status.reshared_status.author?.name || '未知';
            title = `${author} 转发了 ${origAuthor} 的广播`;
        } else {
            title = text
                ? `${author} ${activity}：${text.slice(0, 50)}`
                : `${author} ${activity}`;
        }

        // 构建正文
        let content = text;
        if (status.reshared_status) {
            const rs = status.reshared_status;
            content += `\n\n【转发自 @${rs.author?.name || '未知'}】`;
            if (rs.text) content += `\n${rs.text}`;
            if (rs.card?.title) content += `\n《${rs.card.title}》`;
        }
        if (status.card) {
            const card = status.card;
            if (card.subtitle) content += `\n${card.subtitle}`;
            if (card.rating) content += `\n⭐ ${card.rating}`;
        }

        // 提取图片
        const images = [];
        if (status.images?.length) {
            for (const img of status.images) {
                const src = img.large?.url || img.normal?.url || img.url || '';
                if (src) images.push(src);
            }
        }

        // 卡片封面
        let videoCover = '';
        if (status.card?.image?.large?.url) {
            videoCover = status.card.image.large.url;
        } else if (status.card?.image?.normal?.url) {
            videoCover = status.card.image.normal.url;
        }

        // 解析时间
        let publishTime = 0;
        if (createTime) {
            const d = new Date(createTime);
            publishTime = isNaN(d.getTime()) ? 0 : d.getTime();
        }

        return {
            id: `douban_${statusId}`,
            platform: 'douban',
            type: activity,
            author,
            authorFace: authorAvatar,
            title,
            content: content.trim(),
            link: sharingUrl,
            images,
            videoCover,
            publishTime,
            stats: {
                like: status.like_count || 0,
                comment: status.comments_count || 0,
                reshare: status.reshares_count || 0,
            },
        };
    } catch (e) {
        console.warn('[DoubanFetcher] 解析动态失败:', e.message);
        return null;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchAndStore };
