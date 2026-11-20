/**
 * config.js — 集中配置管理
 *
 * 所有可调参数都在这里，方便随时修改。
 * 优先读取 .env 文件，回退到默认值。
 *
 * 注意：每次调用 getConfig() / reload() 都会重新读取 .env，
 * 因此在服务运行期间更新 Cookie 后无需重启服务。
 */

const path = require('path');
const fs = require('fs');

const ENV_PATH = path.join(__dirname, '.env');

// 解析逗号分隔的环境变量为数组
function parseList(envVal) {
    if (!envVal) return [];
    return envVal.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 从 .env 文件手动解析键值对（不污染 process.env）
 * 返回一个普通对象，优先级：.env 文件 > process.env > 默认值
 */
function loadEnv() {
    const env = Object.assign({}, process.env); // 基础值（含系统环境变量）
    try {
        if (fs.existsSync(ENV_PATH)) {
            const lines = fs.readFileSync(ENV_PATH, 'utf-8').split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const idx = trimmed.indexOf('=');
                if (idx < 0) continue;
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim();
                env[key] = val; // .env 文件的值覆盖系统环境变量
            }
        }
    } catch (e) {
        // 读取失败时静默回退到 process.env
    }
    return env;
}

/**
 * 根据当前 .env 文件内容构建配置对象
 * 每次调用都会重新读取磁盘，保证 Cookie 更新后即时生效
 */
function buildConfig(env) {
    return {
        // ========== 服务端口 ==========
        port: parseInt(env.PORT, 10) || 3457,

        // ========== Cloudflare R2 ==========
        r2: {
            accountId: env.CF_ACCOUNT_ID || '',
            bucketName: env.R2_BUCKET_NAME || '',
            accessKeyId: env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
            publicUrl: env.R2_PUBLIC_URL || '',
        },

        // ========== 抓取配置 ==========

        // B 站主号
        bilibili: {
            // 完整 Cookie 字符串（推荐，包含 buvid3 等设备指纹）
            cookie: env.BILIBILI_COOKIE || '',
            // 仅 SESSDATA（向后兼容，如果配置了 BILIBILI_COOKIE 则忽略）
            sessdata: env.BILIBILI_SESSDATA || '',
            maxPages: parseInt(env.BILIBILI_MAX_PAGES, 10) || 5,
            // 要跳过的动态类型（逗号分隔）
            // 可选值: DYNAMIC_TYPE_AV, DYNAMIC_TYPE_DRAW, DYNAMIC_TYPE_ARTICLE,
            //         DYNAMIC_TYPE_WORD, DYNAMIC_TYPE_FORWARD, DYNAMIC_TYPE_LIVE_RCMD,
            //         DYNAMIC_TYPE_MUSIC, DYNAMIC_TYPE_PGC, DYNAMIC_TYPE_COMMON_SQUARE
            skipTypes: parseList(env.BILIBILI_SKIP_TYPES),
            // 关键词黑名单（逗号分隔，匹配标题/正文，不区分大小写）
            blockKeywords: parseList(env.BILIBILI_BLOCK_KEYWORDS),
            // 发现重叠后再爬几页（捕捉延迟出现的内容）
            extraPages: parseInt(env.BILIBILI_EXTRA_PAGES, 10) || 0,
        },

        // B 站小号（可选，不配就用主号的视频数据）
        bilibiliAlt: {
            // 完整 Cookie 字符串（推荐）
            cookie: env.BILIBILI_ALT_COOKIE || '',
            // 仅 SESSDATA（向后兼容）
            sessdata: env.BILIBILI_ALT_SESSDATA || '',
            maxPages: parseInt(env.BILIBILI_ALT_MAX_PAGES, 10) || 5,
            maxItems: parseInt(env.BILIBILI_ALT_MAX_ITEMS, 10) || 100,
        },

        // 知乎
        zhihu: {
            cookie: env.ZHIHU_COOKIE || '',
            maxPages: parseInt(env.ZHIHU_MAX_PAGES, 10) || 5,
            // 要跳过的 verb 类型（逗号分隔）
            // 可选值: MEMBER_FOLLOW_QUESTION, QUESTION_FOLLOW, MEMBER_VOTEUP_ANSWER,
            //         MEMBER_VOTEUP_ARTICLE, MEMBER_COLLECT_ANSWER, MEMBER_COLLECT_ARTICLE
            skipVerbs: parseList(env.ZHIHU_SKIP_VERBS),
            // 发现重叠后再爬几页
            extraPages: parseInt(env.ZHIHU_EXTRA_PAGES, 10) || 0,
        },

        // 豆瓣
        douban: {
            cookie: env.DOUBAN_COOKIE || '',
            maxPages: parseInt(env.DOUBAN_MAX_PAGES, 10) || 5,
            // 要跳过的动态类型（activity 字段，逗号分隔）
            // 可选值: 想看, 想读, 想听, 看过, 读过, 听过, 在看, 在读,
            //         说, 转发, 推荐, 关注, 加入, 赞, 等
            skipActivities: parseList(env.DOUBAN_SKIP_ACTIVITIES),
            extraPages: parseInt(env.DOUBAN_EXTRA_PAGES, 10) || 0,
            // 是否每次都重新拉取关注列表（默认 false，使用本地缓存）
            refreshFollowing: env.DOUBAN_REFRESH_FOLLOWING === 'true',
        },

        // 通用抓取设置
        fetch: {
            intervalMinutes: parseInt(env.FETCH_INTERVAL, 10) || 30,
        },

        // ========== 内容渲染 ==========
        render: {
            // 是否嵌入 B 站 iframe 播放器（关闭可防止 Inoreader 自动播放）
            bilibiliEmbedPlayer: env.BILIBILI_EMBED_PLAYER === 'true',
        },

        // ========== RSS 生成参数 ==========
        rss: {
            bilibiliKey: env.RSS_BILIBILI_KEY || 'bilibili.xml',
            zhihuKey: env.RSS_ZHIHU_KEY || 'zhihu.xml',
            bilibiliAltKey: env.RSS_BILIBILI_ALT_KEY || 'bilibili-alt.xml',
            bilibiliTitle: env.RSS_BILIBILI_TITLE || 'B站关注动态',
            zhihuTitle: env.RSS_ZHIHU_TITLE || '知乎关注动态',
            bilibiliAltTitle: env.RSS_BILIBILI_ALT_TITLE || 'B站小号关注动态',
            bilibiliDescription: env.RSS_BILIBILI_DESC || '我的B站关注列表的最新动态',
            zhihuDescription: env.RSS_ZHIHU_DESC || '我的知乎关注列表的最新动态',
            bilibiliAltDescription: env.RSS_BILIBILI_ALT_DESC || '我的B站小号关注列表的最新动态',
            doubanKey: env.RSS_DOUBAN_KEY || 'douban.xml',
            doubanTitle: env.RSS_DOUBAN_TITLE || '豆瓣关注动态',
            doubanDescription: env.RSS_DOUBAN_DESC || '我的豆瓣关注列表的最新动态',
            maxItems: parseInt(env.RSS_MAX_ITEMS, 10) || 200,
        },

        // ========== 本地数据存储 ==========
        data: {
            dir: env.DATA_DIR || './data',
            bilibiliFile: 'bilibili.json',
            zhihuFile: 'zhihu.json',
            bilibiliAltFile: 'bilibili-alt.json',
            doubanFile: 'douban.json',
        },

        // ========== 自动同步 ==========
        autoSync: {
            enabled: env.AUTO_SYNC !== 'false',
        },
    };
}

// 首次加载（供 server.js 启动时使用端口等静态配置）
let _cached = buildConfig(loadEnv());

/**
 * 重新从磁盘读取 .env 并刷新配置缓存
 * 在每次抓取任务开始前调用，保证 Cookie 变更即时生效
 */
function reload() {
    _cached = buildConfig(loadEnv());
    return _cached;
}

// 用 Proxy 实现透明的属性访问：每次读取顶层属性时自动 reload
// 这样所有已有的 config.bilibili.cookie 等写法无需修改
module.exports = new Proxy(_cached, {
    get(_, key) {
        // 只在访问业务配置时 reload（port 等启动期固定值不触发）
        if (key !== 'port') {
            _cached = buildConfig(loadEnv());
        }
        return _cached[key];
    },
});
