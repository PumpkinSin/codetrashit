/**
 * douban-fetcher.js — 豆瓣关注动态抓取模块（Node 端）
 *
 * 策略：先获取关注列表，再逐一拉取每人的广播，按时间合并。
 * 原因：豆瓣 home_timeline API 对第三方请求严格限流（403），
 *       但 user_timeline 和 following 接口仍可正常访问。
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const dataStore = require('./data-store');

const M_API = 'https://m.douban.com/rexxar/api/v2';

// 公共请求头（无需 Cookie 也能访问部分接口）
const BASE_HEADERS = {
    'Accept': 'application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://m.douban.com/',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

/**
 * 抓取豆瓣关注动态
 */
async function fetchAndStore() {
    const { cookie: rawCookie, skipActivities } = config.douban;

    if (!rawCookie) {
        console.log('[DoubanFetcher] 未配置 Cookie，跳过');
        return { newCount: 0, totalCount: 0 };
    }

    const cookie = rawCookie;

    // 从 dbcl2="uid:token" 中提取当前用户 UID
    const uidMatch = cookie.match(/(?:^|;\s*)dbcl2="?(\d+):/);
    if (!uidMatch) {
        console.warn('[DoubanFetcher] 无法从 Cookie 中解析 UID（期望 dbcl2="uid:..."），跳过');
        return { newCount: 0, totalCount: 0 };
    }
    const selfUid = uidMatch[1];
    console.log(`[DoubanFetcher] 当前用户 UID: ${selfUid}`);

    // 提取 ck（CSRF token），部分接口需要
    const ckMatch = cookie.match(/(?:^|;\s*)ck=([^;]*)/);
    const ck = ckMatch ? ckMatch[1] : '';

    const headers = { ...BASE_HEADERS, 'Cookie': cookie };

    // 1. 获取关注者 UID 列表（将自己也加进去）
    let followingUids;
    const cacheFile = path.join(config.data.dir, 'douban-following.json');
    if (!config.douban.refreshFollowing && cacheFileExists(cacheFile)) {
        followingUids = loadFollowingCache(cacheFile);
        console.log(`[DoubanFetcher] 使用缓存的关注列表（${followingUids.length} 人），如需重新拉取请设置 DOUBAN_REFRESH_FOLLOWING=true`);
    } else {
        followingUids = await getAllFollowingUids(selfUid, ck, headers);
        saveFollowingCache(cacheFile, followingUids);
        console.log(`[DoubanFetcher] 重新拉取关注列表，共 ${followingUids.length} 人，已缓存`);
    }

    // 把自己的 UID 也加进去，抓自己的广播
    const allUids = [selfUid, ...followingUids];

    // 2. 加载已有 ID，用于去重
    const existingIds = new Set(dataStore.load('douban').map(i => i.id));

    // 3. 逐一拉取每人最新广播（串行，含延迟）
    const allItems = [];
    for (let i = 0; i < allUids.length; i++) {
        const uid = allUids[i];
        try {
            const items = await fetchUserTimeline(uid, headers, existingIds);
            allItems.push(...items);
        } catch (e) {
            console.warn(`[DoubanFetcher] 拉取 UID ${uid} 的广播失败: ${e.message}`);
        }
        // 每人之间延迟 4~5 秒防风控（最后一个不需要等）
        if (i < allUids.length - 1) {
            await sleep(4000 + Math.random() * 1000);
        }
    }

    // 4. 过滤、去重、排序
    const filteredItems = allItems
        .map(status => normalizeStatus(status))
        .filter(Boolean)
        .filter(item => {
            // 跳过已配置的 activity 类型
            if (skipActivities.length > 0 && skipActivities.includes(item.type)) return false;
            return true;
        });

    // 按时间降序排列
    filteredItems.sort((a, b) => b.publishTime - a.publishTime);

    if (filteredItems.length === 0) {
        console.log('[DoubanFetcher] 无新数据');
        return { newCount: 0, totalCount: dataStore.load('douban').length };
    }

    const result = dataStore.merge('douban', filteredItems);
    console.log(`[DoubanFetcher] 抓取 ${filteredItems.length} 条，新增 ${result.newCount} 条`);
    return result;
}

/**
 * 获取指定用户的全部关注者 UID 数组（自动分页）
 */
async function getAllFollowingUids(uid, ck, headers) {
    const uids = [];
    let start = 0;
    const count = 50; // 每页最多 50 个

    while (true) {
        const url = `${M_API}/user/${uid}/following?start=${start}&count=${count}&for_mobile=1${ck ? `&ck=${ck}` : ''}`;
        let json;
        try {
            const resp = await fetch(url, { headers });
            if (!resp.ok) {
                console.warn(`[DoubanFetcher] 获取关注列表失败: HTTP ${resp.status}`);
                break;
            }
            json = await resp.json();
        } catch (e) {
            console.warn('[DoubanFetcher] 获取关注列表异常:', e.message);
            break;
        }

        const users = json.users || [];
        for (const u of users) {
            if (u.id) uids.push(u.id);
        }

        // 判断是否还有更多
        const total = json.total || 0;
        start += users.length;
        if (start >= total || users.length === 0) break;

        // 分页间短暂延迟
        await sleep(800 + Math.random() * 500);
    }

    return uids;
}

// ========== 关注列表本地缓存 ==========

function cacheFileExists(filePath) {
    try { return fs.existsSync(filePath); } catch { return false; }
}

function loadFollowingCache(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch { return []; }
}

function saveFollowingCache(filePath, uids) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(uids), 'utf8');
    } catch (e) {
        console.warn('[DoubanFetcher] 关注列表缓存写入失败:', e.message);
    }
}

/**
 * 获取指定用户的最新广播（最多 3 页，检测到与已有数据重叠则提前停止）
 * @param {string} uid
 * @param {object} headers
 * @param {Set} existingIds - 已有条目 id 集合，用于重叠检测
 */
async function fetchUserTimeline(uid, headers, existingIds) {
    const MAX_PAGES = 3;
    const allStatuses = [];
    let sinceId = '';

    for (let page = 0; page < MAX_PAGES; page++) {
        const url = sinceId
            ? `${M_API}/status/user_timeline/${uid}?for_mobile=1&max_id=${sinceId}`
            : `${M_API}/status/user_timeline/${uid}?for_mobile=1`;

        const resp = await fetch(url, { headers });
        if (!resp.ok) {
            // 部分用户账号被封禁，400/403 是正常情况，静默跳过
            break;
        }
        const json = await resp.json();
        const statuses = (json.items || [])
            .map(item => item.status || item)
            .filter(Boolean);

        if (statuses.length === 0) break;
        allStatuses.push(...statuses);

        // 如果本页中有任何一条已经在 existingIds 中，说明已经追上旧数据，停止翻页
        const hasOverlap = statuses.some(s => existingIds.has(`douban_${s.id}`));
        if (hasOverlap) break;

        // 没有更多页则停止
        if (!json.items || json.items.length === 0) break;

        // 取最后一条的 id 作为下一页的 max_id
        const last = statuses[statuses.length - 1];
        sinceId = last?.id ? String(last.id) : '';
        if (!sinceId) break;

        // 翻页间短暂延迟（2~3 秒）
        if (page < MAX_PAGES - 1) {
            await sleep(2000 + Math.random() * 1000);
        }
    }

    return allStatuses;
}

/**
 * 检查状态是否有效，对已删除/隐藏的广播返回占位文本
 * @param {object|null} status
 * @returns {{ isFixSuccess: boolean, why: string }}
 */
function tryFixStatus(status) {
    if (!status) {
        return { isFixSuccess: false, why: '[ 无内容 ]' };
    }
    if (status.deleted) {
        return { isFixSuccess: false, why: status.msg ?? '[ 内容已被删除 ]' };
    }
    if (status.hidden) {
        return { isFixSuccess: false, why: status.msg ?? '[ 内容已被设为不可见 ]' };
    }
    if (status.text === undefined || status.text === null || !status.uri) {
        return { isFixSuccess: false, why: status.msg ?? '[ 内容已不可访问 ]' };
    }
    // 修复缺失字段
    if (!status.author) status.author = {};
    if (!status.author.url) status.author.url = 'https://www.douban.com/people/1/';
    if (!status.author.name) status.author.name = '[作者不可见]';
    if (!status.author.avatar) status.author.avatar = 'https://img1.doubanio.com/icon/user_normal.jpg';
    if (!status.entities) status.entities = [];
    return { isFixSuccess: true, why: '' };
}

/**
 * 利用 status.entities 将纯文本中的话题/链接转换为 HTML 超链接
 * @param {string} text
 * @param {Array} entities
 * @returns {string} 转换后的 HTML 字符串
 */
function linkifyText(text, entities) {
    if (!text) return '';
    if (!entities || !entities.length) return escapeHtml(text);

    let lastIndex = 0;
    const segments = [];
    for (const entity of entities) {
        // 将实体前的纯文本 escape 后压入
        segments.push(escapeHtml(text.slice(lastIndex, entity.start)));
        // 转换 douban:// 协议链接为 https
        const href = (entity.uri || '').replace('douban://douban.com', 'https://www.douban.com/doubanapp/dispatch?uri=');
        const label = escapeHtml(entity.title || text.slice(entity.start, entity.end));
        segments.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
        lastIndex = entity.end;
    }
    segments.push(escapeHtml(text.slice(lastIndex)));
    return segments.join('');
}

/**
 * 标准化豆瓣动态数据
 */
function normalizeStatus(status) {
    try {
        if (!status || !status.id) return null;

        // 先修复并验证状态有效性
        const { isFixSuccess, why } = tryFixStatus(status);
        if (!isFixSuccess) {
            // 对于已删除/隐藏的条目，生成一个占位条目而不是直接跳过
            const now = Date.now();
            return {
                id: `douban_${status.id || now}`,
                platform: 'douban',
                type: '其他',
                author: status.author?.name || '[未知]',
                authorFace: status.author?.avatar || '',
                authorUrl: status.author?.url || '',
                title: why,
                content: `<p style="color:#999">${why}</p>`,
                link: `https://www.douban.com?rsshub_failed=${now}`,
                images: [],
                videoCover: '',
                publishTime: status.create_time ? new Date(status.create_time + ' GMT+0800').getTime() : now,
                stats: { like: 0, comment: 0, reshare: 0 },
            };
        }

        const author = status.author.name;
        const authorAvatar = status.author.avatar;
        const authorUrl = status.author.url;
        const activity = status.activity || '说';
        const rawText = status.text || '';
        const createTime = status.create_time || '';
        // 去掉 sharing_url 的 query 参数
        let sharingUrl = status.sharing_url ? status.sharing_url.split('?')[0] : '';
        const statusId = String(status.id);

        // ---- 构建标题 ----
        let title = `${author} `;

        if (activity === '转发') {
            const { isFixSuccess: resharedOk } = tryFixStatus(status.reshared_status);
            if (resharedOk) {
                title += `转发 ${status.reshared_status.author.name} 的广播: ${status.reshared_status.text.replace(/\n/g, '').slice(0, 40)}`;
            } else {
                title += '转发广播';
            }
        } else if (status.card) {
            const cardTitle = status.card.title || '';
            const quote = status.card.rating ? `《${cardTitle}》` : `「${cardTitle}」`;
            title += `${activity}${cardTitle ? quote : ''}`;
            // 若带有书面文字，追加文字
            if (rawText) title += `: ${rawText.replace(/\n/g, '').slice(0, 40)}`;
        } else {
            title += `${activity}: ${rawText.replace(/\n/g, '').slice(0, 50)}`;
        }

        // ---- 构建正文 HTML ----
        const contentParts = [];

        // RSS 阅读器缩略图技巧：将所有配图以 0x0 方式提前插入，
        // 避免头像被误当作封面。真正的图片稍后再正常渲染。
        const hiddenPicsPrefix = [];
        if (status.images?.length) {
            for (const img of status.images) {
                const src = img.large?.url || img.normal?.url || img.url || '';
                if (src) hiddenPicsPrefix.push(`<img width="0" height="0" hidden="true" src="${src}">`);
            }
        }

        // 正文文字（含实体链接转换）
        if (rawText) {
            const linkedText = linkifyText(rawText, status.entities);
            contentParts.push(`<p>${linkedText.replace(/\n/g, '<br>')}</p>`);
        }

        // 配图
        if (status.images?.length) {
            const imgs = status.images
                .map(img => img.large?.url || img.normal?.url || img.url || '')
                .filter(Boolean)
                .map(src => `<img src="${src}" style="max-width:100%" referrerpolicy="no-referrer">`);
            if (imgs.length) contentParts.push(`<p>${imgs.join('<br>')}</p>`);
        }

        // 视频（行内）
        if (status.video_info?.video_url) {
            const v = status.video_info;
            contentParts.push(`<p><video src="${v.video_url}"${v.cover_url ? ` poster="${v.cover_url}"` : ''} controls style="max-width:100%"></video></p>`);
        }

        // 转发的原始广播 (reshared_status)
        if (status.reshared_status) {
            const rs = status.reshared_status;
            const { isFixSuccess: rsOk, why: rsWhy } = tryFixStatus(rs);
            let rsHtml;
            if (rsOk) {
                const rsParts = [];
                const rsAuthorLink = rs.author.url
                    ? `<a href="${rs.author.url}" target="_blank" rel="noopener noreferrer"><strong>@${escapeHtml(rs.author.name)}</strong></a>`
                    : `<strong>@${escapeHtml(rs.author.name)}</strong>`;
                rsParts.push(rsParts.length === 0 ? rsAuthorLink + ':&ensp;' : rsAuthorLink);
                if (rs.text) {
                    const linkedRsText = linkifyText(rs.text, rs.entities);
                    rsParts.push(linkedRsText.replace(/\n/g, '<br>'));
                }
                if (rs.images?.length) {
                    const rsImgs = rs.images
                        .map(img => img.large?.url || img.normal?.url || '')
                        .filter(Boolean)
                        .map(src => `<img src="${src}" style="max-width:100%" referrerpolicy="no-referrer">`);
                    if (rsImgs.length) rsParts.push(`<br>${rsImgs.join('<br>')}`);
                }
                // 若被转发的广播也指向特定 uri，附上原始链接
                if (rs.uri) {
                    const resharedUrl = rs.uri.replace('douban://douban.com', 'https://www.douban.com/doubanapp/dispatch?uri=');
                    rsParts.push(`<br><small>原动态：<a href="${resharedUrl}" target="_blank" rel="noopener noreferrer">${resharedUrl}</a></small>`);
                }
                rsHtml = rsParts.join('');
            } else {
                rsHtml = `<em style="color:#999">${rsWhy}</em>`;
            }
            contentParts.push(`<blockquote style="background:#80808010;border-top:1px solid #80808030;border-bottom:1px solid #80808030;margin:8px 0;padding:5px 20px;">${rsHtml}</blockquote>`);
        }

        // 转发小组讨论 (parent_status)
        if (status.parent_status) {
            const ps = status.parent_status;
            const { isFixSuccess: psOk, why: psWhy } = tryFixStatus(ps);
            let psHtml;
            if (psOk) {
                const psAuthor = ps.author.url
                    ? `<a href="${ps.author.url}" target="_blank"><strong>@${escapeHtml(ps.author.name)}</strong></a>`
                    : `<strong>@${escapeHtml(ps.author.name)}</strong>`;
                const psText = linkifyText(ps.text, ps.entities);
                psHtml = `${psAuthor}:&ensp;${psText.replace(/\n/g, '<br>')}`;
            } else {
                psHtml = `<em style="color:#999">${psWhy}</em>`;
            }
            contentParts.push(`<blockquote style="background:#80808010;border-top:1px solid #80808030;border-bottom:1px solid #80808030;margin:8px 0;padding:5px 20px;">${psHtml}</blockquote>`);
        }

        // 书影音/话题卡片 (card)
        if (status.card) {
            const card = status.card;
            const cardParts = [];

            // 封面图（悬浮左侧）
            const cardImgSrc = card.image?.large?.url || card.image?.normal?.url || '';
            if (cardImgSrc && !card.images_block) {
                cardParts.push(`<img src="${cardImgSrc}" vspace="0" hspace="12" align="left" height="75" style="height:75px;" referrerpolicy="no-referrer">`);
            }

            // 是否为转发小组讨论
            const isNewReshared = status.activity === '转发小组讨论' || (card.type === 'topic' && rawText !== '' && status.activity === '');
            const isNewStatus = !isNewReshared && card.type === 'topic' && rawText === '' && status.activity === '';
            if (isNewStatus) {
                // 新版话题动态：链接直接指向话题页
                sharingUrl = card.url || sharingUrl;
            }

            const cardInfoParts = [];
            if (card.title) {
                let descTitle = `<strong>${escapeHtml(card.title)}</strong>`;
                if (card.url) descTitle = `<a href="${card.url}" target="_blank" rel="noopener noreferrer">${descTitle}</a>`;
                cardInfoParts.push(descTitle);
            }
            if (card.subtitle) {
                const prefix = isNewReshared ? `${escapeHtml(card.owner_name || '')}：` : '';
                cardInfoParts.push(prefix + escapeHtml(card.subtitle));
            }
            if (card.rating?.value) {
                cardInfoParts.push(`评分：${card.rating.value}`);
            }
            if (cardInfoParts.length) cardParts.push(cardInfoParts.join('<br>'));
            cardParts.push('<br clear="both"><div style="clear:both"></div>');

            // 话题图片组
            if (card.images_block?.images?.length) {
                const blockImgs = card.images_block.images
                    .map(img => img.image?.large?.url)
                    .filter(Boolean)
                    .map(src => `<img src="${src}" style="max-width:100%" referrerpolicy="no-referrer">`);
                if (blockImgs.length) cardParts.push(blockImgs.join('<br>'));
            }

            contentParts.push(`<blockquote style="background:#80808010;border-top:1px solid #80808030;border-bottom:1px solid #80808030;margin:8px 0;padding:5px 20px;">${cardParts.join('')}</blockquote>`);
        }

        // 视频卡片 (video_card)
        if (status.video_card) {
            const vc = status.video_card;
            if (!vc.url) vc.url = 'https://www.douban.com';
            const vcVideoSrc = vc.video_info?.video_url || '';
            const vcCover = vc.video_info?.cover_url || '';
            const vcVideoTag = vcVideoSrc ? `<video src="${vcVideoSrc}"${vcCover ? ` poster="${vcCover}"` : ''} controls style="max-width:100%"></video><br>` : '';
            const vcTitle = vc.title ? `<a href="${vc.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(vc.title)}</a>` : '';
            contentParts.push(`<blockquote style="background:#80808010;border-top:1px solid #80808030;border-bottom:1px solid #80808030;margin:8px 0;padding:5px 20px;">${vcVideoTag}${vcTitle}</blockquote>`);
        }

        // 互动统计
        const statParts = [];
        if (status.like_count) statParts.push(`👍 ${status.like_count}`);
        if (status.comments_count) statParts.push(`💬 ${status.comments_count}`);
        if (status.reshares_count) statParts.push(`🔄 ${status.reshares_count}`);
        if (statParts.length) {
            contentParts.push(`<p style="color:#888;font-size:12px">${statParts.join(' · ')}</p>`);
        }

        // 拼接最终 HTML（0x0 隐藏占位图放最前面）
        const finalContent = (hiddenPicsPrefix.join('') + contentParts.join('\n')).trim().replaceAll('\r\n', '\n');

        // 提取配图列表（供外部缩略图用）
        const images = [];
        if (status.images?.length) {
            for (const img of status.images) {
                const src = img.large?.url || img.normal?.url || img.url || '';
                if (src) images.push(src);
            }
        }
        let videoCover = '';
        if (status.card?.image?.large?.url) videoCover = status.card.image.large.url;
        else if (status.card?.image?.normal?.url) videoCover = status.card.image.normal.url;
        else if (status.video_info?.cover_url) videoCover = status.video_info.cover_url;

        // 解析时间
        let publishTime = 0;
        if (createTime) {
            // 豆瓣时间格式：2024-01-15 18:30:00，需当作 +0800
            const d = new Date(createTime + ' GMT+0800');
            publishTime = isNaN(d.getTime()) ? 0 : d.getTime();
        }

        return {
            id: `douban_${statusId}`,
            platform: 'douban',
            type: activity,
            author,
            authorFace: authorAvatar,
            authorUrl,
            title,
            content: finalContent,
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
        console.warn('[DoubanFetcher] 解析动态失败:', e.message, e.stack);
        return null;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchAndStore };
