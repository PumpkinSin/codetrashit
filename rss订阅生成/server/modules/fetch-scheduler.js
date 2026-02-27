/**
 * fetch-scheduler.js — 定时抓取调度器
 *
 * 启动后定期调用 B 站 / 知乎抓取模块，
 * 将数据存储到本地并同步到 R2
 */

const config = require('../config');
const bilibiliFetcher = require('./bilibili-fetcher');
const zhihuFetcher = require('./zhihu-fetcher');
const doubanFetcher = require('./douban-fetcher');
const rssGenerator = require('./rss-generator');
const r2Uploader = require('./r2-uploader');
const dataStore = require('./data-store');

let timer = null;

/**
 * 初始化调度器
 */
function init() {
    const { intervalMinutes } = config.fetch;

    // 检查是否有任何抓取配置
    const hasBilibili = !!config.bilibili.sessdata;
    const hasBilibiliAlt = !!config.bilibiliAlt.sessdata;
    const hasZhihu = !!config.zhihu.cookie;
    const hasDouban = !!config.douban.cookie;

    if (!hasBilibili && !hasBilibiliAlt && !hasZhihu && !hasDouban) {
        console.log('[Scheduler] ⚠️  未配置任何 Cookie，定时抓取未启动');
        console.log('[Scheduler]    请在 .env 中配置 BILIBILI_SESSDATA / ZHIHU_COOKIE');
        return;
    }

    const platforms = [];
    if (hasBilibili) platforms.push('B站主号');
    if (hasBilibiliAlt) platforms.push('B站小号');
    if (hasZhihu) platforms.push('知乎');
    if (hasDouban) platforms.push('豆瓣');

    console.log(`[Scheduler] ✅ 定时抓取已启动`);
    console.log(`[Scheduler]    平台: ${platforms.join(', ')}`);
    console.log(`[Scheduler]    间隔: ${intervalMinutes} 分钟`);

    // 启动后延迟 10 秒首次抓取
    setTimeout(() => runAll(), 10 * 1000);

    // 定时抓取
    timer = setInterval(() => runAll(), intervalMinutes * 60 * 1000);
}

/**
 * 执行一次完整抓取
 */
async function runAll() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    console.log(`\n[Scheduler] ========== 开始定时抓取 (${timeStr}) ==========`);
    const startTime = Date.now();

    // B 站主号
    if (config.bilibili.sessdata) {
        try {
            const result = await bilibiliFetcher.fetchAndStore({
                sessdata: config.bilibili.sessdata,
                platform: 'bilibili',
                maxPages: config.bilibili.maxPages,
            });
            if (result.newCount > 0) await syncPlatform('bilibili');
        } catch (e) {
            console.error('[Scheduler] B站主号抓取失败:', e.message);
        }
    }

    // B 站小号（独立 SESSDATA）
    if (config.bilibiliAlt.sessdata) {
        try {
            const result = await bilibiliFetcher.fetchAndStore({
                sessdata: config.bilibiliAlt.sessdata,
                platform: 'bilibili-alt',
                maxPages: config.bilibiliAlt.maxPages,
                videoOnly: true,
            });
            if (result.newCount > 0) await syncPlatform('bilibili-alt');
        } catch (e) {
            console.error('[Scheduler] B站小号抓取失败:', e.message);
        }
    }

    // 知乎
    if (config.zhihu.cookie) {
        try {
            const result = await zhihuFetcher.fetchAndStore({
                cookie: config.zhihu.cookie,
                maxPages: config.zhihu.maxPages,
            });
            if (result.newCount > 0) await syncPlatform('zhihu');
        } catch (e) {
            console.error('[Scheduler] 知乎抓取失败:', e.message);
        }
    }

    // 豆瓣
    if (config.douban.cookie) {
        try {
            const result = await doubanFetcher.fetchAndStore();
            if (result.newCount > 0) await syncPlatform('douban');
        } catch (e) {
            console.error('[Scheduler] 豆瓣抓取失败:', e.message);
        }
    }



    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] ========== 抓取完成（耗时 ${elapsed}s）==========\n`);
}

/**
 * 生成 RSS 并上传到 R2
 */
async function syncPlatform(platform) {
    if (!config.autoSync.enabled) return;

    const items = dataStore.load(platform);
    if (items.length === 0) return;

    const xml = rssGenerator.generate(platform, items);

    const keyMap = {
        'bilibili': config.rss.bilibiliKey,
        'zhihu': config.rss.zhihuKey,
        'douban': config.rss.doubanKey,
    };
    const key = keyMap[platform];
    if (!key) return;

    try {
        await r2Uploader.upload(key, xml);
    } catch (e) {
        console.error(`[Scheduler] 同步 ${platform} 到 R2 失败:`, e.message);
    }
}

/**
 * 手动触发一次抓取
 */
async function runNow() {
    return runAll();
}

/**
 * 停止调度器
 */
function stop() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

module.exports = { init, runNow, stop };
