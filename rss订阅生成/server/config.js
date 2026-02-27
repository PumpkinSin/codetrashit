/**
 * config.js — 集中配置管理
 *
 * 所有可调参数都在这里，方便随时修改。
 * 优先读取 .env 文件，回退到默认值。
 */

require('dotenv').config();

// 解析逗号分隔的环境变量为数组
function parseList(envVal) {
    if (!envVal) return [];
    return envVal.split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = {
    // ========== 服务端口 ==========
    port: parseInt(process.env.PORT, 10) || 3457,

    // ========== Cloudflare R2 ==========
    r2: {
        accountId: process.env.CF_ACCOUNT_ID || '',
        bucketName: process.env.R2_BUCKET_NAME || '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        publicUrl: process.env.R2_PUBLIC_URL || '',
    },

    // ========== 抓取配置 ==========

    // B 站主号
    bilibili: {
        sessdata: process.env.BILIBILI_SESSDATA || '',
        maxPages: parseInt(process.env.BILIBILI_MAX_PAGES, 10) || 5,
        // 要跳过的动态类型（逗号分隔）
        // 可选值: DYNAMIC_TYPE_AV, DYNAMIC_TYPE_DRAW, DYNAMIC_TYPE_ARTICLE,
        //         DYNAMIC_TYPE_WORD, DYNAMIC_TYPE_FORWARD, DYNAMIC_TYPE_LIVE_RCMD,
        //         DYNAMIC_TYPE_MUSIC, DYNAMIC_TYPE_PGC, DYNAMIC_TYPE_COMMON_SQUARE
        skipTypes: parseList(process.env.BILIBILI_SKIP_TYPES),
        // 关键词黑名单（逗号分隔，匹配标题/正文，不区分大小写）
        blockKeywords: parseList(process.env.BILIBILI_BLOCK_KEYWORDS),
        // 发现重叠后再爬几页（捕捉延迟出现的内容）
        extraPages: parseInt(process.env.BILIBILI_EXTRA_PAGES, 10) || 0,
    },

    // B 站小号（可选，不配就用主号的视频数据）
    bilibiliAlt: {
        sessdata: process.env.BILIBILI_ALT_SESSDATA || '',
        maxPages: parseInt(process.env.BILIBILI_ALT_MAX_PAGES, 10) || 5,
    },

    // 知乎
    zhihu: {
        cookie: process.env.ZHIHU_COOKIE || '',
        maxPages: parseInt(process.env.ZHIHU_MAX_PAGES, 10) || 5,
        // 要跳过的 verb 类型（逗号分隔）
        // 可选值: MEMBER_FOLLOW_QUESTION, QUESTION_FOLLOW, MEMBER_VOTEUP_ANSWER,
        //         MEMBER_VOTEUP_ARTICLE, MEMBER_COLLECT_ANSWER, MEMBER_COLLECT_ARTICLE
        skipVerbs: parseList(process.env.ZHIHU_SKIP_VERBS),
        // 发现重叠后再爬几页
        extraPages: parseInt(process.env.ZHIHU_EXTRA_PAGES, 10) || 0,
    },

    // 豆瓣
    douban: {
        cookie: process.env.DOUBAN_COOKIE || '',
        maxPages: parseInt(process.env.DOUBAN_MAX_PAGES, 10) || 5,
        // 要跳过的动态类型（activity 字段，逗号分隔）
        // 可选值: 想看, 想读, 想听, 看过, 读过, 听过, 在看, 在读,
        //         说, 转发, 推荐, 关注, 加入, 赞, 等
        skipActivities: parseList(process.env.DOUBAN_SKIP_ACTIVITIES),
        extraPages: parseInt(process.env.DOUBAN_EXTRA_PAGES, 10) || 0,
    },

    // 通用抓取设置
    fetch: {
        intervalMinutes: parseInt(process.env.FETCH_INTERVAL, 10) || 30,
    },

    // ========== RSS 生成参数 ==========
    rss: {
        bilibiliKey: process.env.RSS_BILIBILI_KEY || 'bilibili.xml',
        zhihuKey: process.env.RSS_ZHIHU_KEY || 'zhihu.xml',
        bilibiliAltKey: process.env.RSS_BILIBILI_ALT_KEY || 'bilibili-alt.xml',
        bilibiliTitle: process.env.RSS_BILIBILI_TITLE || 'B站关注动态',
        zhihuTitle: process.env.RSS_ZHIHU_TITLE || '知乎关注动态',
        bilibiliAltTitle: process.env.RSS_BILIBILI_ALT_TITLE || 'B站小号关注动态',
        bilibiliDescription: process.env.RSS_BILIBILI_DESC || '我的B站关注列表的最新动态',
        zhihuDescription: process.env.RSS_ZHIHU_DESC || '我的知乎关注列表的最新动态',
        bilibiliAltDescription: process.env.RSS_BILIBILI_ALT_DESC || '我的B站小号关注列表的最新动态',
        doubanKey: process.env.RSS_DOUBAN_KEY || 'douban.xml',
        doubanTitle: process.env.RSS_DOUBAN_TITLE || '豆瓣关注动态',
        doubanDescription: process.env.RSS_DOUBAN_DESC || '我的豆瓣关注列表的最新动态',
        maxItems: parseInt(process.env.RSS_MAX_ITEMS, 10) || 200,
    },

    // ========== 本地数据存储 ==========
    data: {
        dir: process.env.DATA_DIR || './data',
        bilibiliFile: 'bilibili.json',
        zhihuFile: 'zhihu.json',
        bilibiliAltFile: 'bilibili-alt.json',
        doubanFile: 'douban.json',
    },

    // ========== 自动同步 ==========
    autoSync: {
        enabled: process.env.AUTO_SYNC !== 'false',
    },
};
