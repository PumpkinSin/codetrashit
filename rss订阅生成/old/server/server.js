/**
 * server.js — Express HTTP 服务入口
 *
 * 纯 Node 服务：定时抓取 B 站/知乎/豆瓣动态 + 生成 RSS + 上传 R2
 *
 * 端点：
 *   POST /api/feed           — 接收外部推送的动态数据（兼容扩展）
 *   GET  /api/status          — 服务状态查询
 *   POST /api/sync            — 手动触发 R2 上传
 *   POST /api/fetch           — 手动触发一次抓取
 *   GET  /api/feed/:platform  — 预览本地 RSS XML
 */

const express = require('express');
const config = require('./config');
const dataStore = require('./modules/data-store');
const rssGenerator = require('./modules/rss-generator');
const r2Uploader = require('./modules/r2-uploader');
const fetchScheduler = require('./modules/fetch-scheduler');

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ========== POST /api/feed ==========
// 接收外部推送的动态数据（兼容扩展）
app.post('/api/feed', async (req, res) => {
    try {
        const { platform, items } = req.body;

        if (!platform || !Array.isArray(items)) {
            return res.status(400).json({ error: '参数错误: 需要 platform 和 items[]' });
        }

        if (!['bilibili', 'zhihu', 'bilibili-alt'].includes(platform)) {
            return res.status(400).json({ error: `不支持的平台: ${platform}` });
        }

        const result = dataStore.merge(platform, items);
        console.log(`[Server] 收到 ${platform} 数据: ${items.length} 条，新增 ${result.newCount} 条`);

        if (platform === 'bilibili') {
            const videoItems = items.filter(i => i.type === 'DYNAMIC_TYPE_AV');
            if (videoItems.length > 0) {
                const altResult = dataStore.merge('bilibili-alt', videoItems);
                console.log(`[Server] 已提取 ${videoItems.length} 条视频 → bilibili-alt（新增 ${altResult.newCount} 条）`);
            }
        }

        // 自动同步到 R2（bilibili-alt 仅本地使用，不上传）
        let syncResult = null;
        if (config.autoSync.enabled && result.newCount > 0) {
            try {
                syncResult = await syncPlatform(platform);
            } catch (e) {
                console.error(`[Server] 自动同步 ${platform} 失败:`, e.message);
                syncResult = { error: e.message };
            }
        }

        res.json({ success: true, ...result, sync: syncResult });
    } catch (e) {
        console.error('[Server] /api/feed 错误:', e);
        res.status(500).json({ error: e.message });
    }
});

// ========== GET /api/status ==========
app.get('/api/status', (req, res) => {
    const bilibiliItems = dataStore.load('bilibili');
    const zhihuItems = dataStore.load('zhihu');
    const bilibiliAltItems = dataStore.load('bilibili-alt');

    res.json({
        online: true,
        uptime: process.uptime(),
        r2Configured: !!(config.r2.accountId && config.r2.accessKeyId),
        autoSync: config.autoSync.enabled,
        fetch: {
            bilibili: !!config.bilibili.sessdata,
            bilibiliAlt: !!config.bilibiliAlt.sessdata,
            zhihu: !!config.zhihu.cookie,
            douban: !!config.douban.cookie,
            intervalMinutes: config.fetch.intervalMinutes,
        },
        data: {
            bilibili: bilibiliItems.length,
            zhihu: zhihuItems.length,
            'bilibili-alt': bilibiliAltItems.length,
            douban: dataStore.load('douban').length,
        },
    });
});

// ========== POST /api/fetch ==========
// 手动触发一次抓取
app.post('/api/fetch', async (req, res) => {
    try {
        console.log('[Server] 手动触发抓取...');
        await fetchScheduler.runNow();
        res.json({ success: true, message: '抓取完成' });
    } catch (e) {
        console.error('[Server] /api/fetch 错误:', e);
        res.status(500).json({ error: e.message });
    }
});



// ========== POST /api/sync ==========
app.post('/api/sync', async (req, res) => {
    try {
        const results = {};
        for (const platform of ['bilibili', 'zhihu']) {
            const items = dataStore.load(platform);
            if (items.length > 0) {
                results[platform] = await syncPlatform(platform);
            }
        }
        res.json({ success: true, results });
    } catch (e) {
        console.error('[Server] /api/sync 错误:', e);
        res.status(500).json({ error: e.message });
    }
});

// ========== GET /api/feed/:platform ==========
app.get('/api/feed/:platform', (req, res) => {
    const { platform } = req.params;
    if (!['bilibili', 'zhihu', 'bilibili-alt', 'douban'].includes(platform)) {
        return res.status(400).json({ error: `不支持的平台: ${platform}` });
    }
    const items = dataStore.load(platform);
    const xml = rssGenerator.generate(platform, items);
    res.type('application/rss+xml').send(xml);
});

// ========== GET /api/data/:platform ==========
// 返回平台原始 JSON 数据（油猴脚本等使用）
app.get('/api/data/:platform', (req, res) => {
    const { platform } = req.params;
    if (!['bilibili', 'zhihu', 'bilibili-alt', 'douban'].includes(platform)) {
        return res.status(400).json({ error: `不支持的平台: ${platform}` });
    }
    const items = dataStore.load(platform);
    res.json({ code: 0, data: items, total: items.length });
});

// ========== 辅助函数 ==========

async function syncPlatform(platform) {
    const items = dataStore.load(platform);
    const xml = rssGenerator.generate(platform, items);

    const keyMap = {
        'bilibili': config.rss.bilibiliKey,
        'zhihu': config.rss.zhihuKey,
        'douban': config.rss.doubanKey,
    };
    const key = keyMap[platform];
    return await r2Uploader.upload(key, xml);
}

// ========== 启动 ==========
app.listen(config.port, () => {
    console.log(`\n🚀 RSS 动态服务已启动: http://localhost:${config.port}`);
    console.log(`   R2 配置: ${config.r2.accountId ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   自动同步: ${config.autoSync.enabled ? '✅ 开启' : '❌ 关闭'}`);
    console.log(`   数据目录: ${config.data.dir}`);

    // 抓取配置
    console.log(`\n🔑 抓取配置:`);
    console.log(`   B站主号: ${config.bilibili.sessdata ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   B站小号: ${config.bilibiliAlt.sessdata ? '✅ 已配置' : '⚡ 使用主号视频数据'}`);
    console.log(`   知乎:    ${config.zhihu.cookie ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   豆瓣:    ${config.douban.cookie ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   抓取间隔: ${config.fetch.intervalMinutes} 分钟`);

    console.log(`\n📡 端点:`);
    console.log(`   POST /api/feed         接收外部数据`);
    console.log(`   GET  /api/status        服务状态`);
    console.log(`   POST /api/sync          手动同步到R2`);
    console.log(`   POST /api/fetch         手动触发抓取`);
    console.log(`   GET  /api/feed/:platform  预览RSS`);
    console.log(`   GET  /api/data/:platform  原始JSON数据\n`);

    // 启动定时抓取
    fetchScheduler.init();
});
