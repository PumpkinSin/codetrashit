// ============================================================
// Bilibili 小号视频聚合 · 本地 Node.js 积累中心
// 监听 8080 端口，积累去重视频数据
// 启动方式：node server.js
// ============================================================

const http = require('http');

const PORT = 8080;
const MAX_VIDEOS = 200;

// 内存中维护的视频数组
let latestVideos = [];

// ----------------------------------------------------------
// CORS 响应头
// ----------------------------------------------------------
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ----------------------------------------------------------
// 读取请求 body
// ----------------------------------------------------------
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString('utf-8');
                resolve(body);
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

// ----------------------------------------------------------
// 路由处理
// ----------------------------------------------------------
const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    // 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url.split('?')[0]; // 去除 query string

    // ---- POST /update_videos ----
    if (req.method === 'POST' && url === '/update_videos') {
        try {
            const body = await readBody(req);
            const newVideos = JSON.parse(body);

            if (!Array.isArray(newVideos)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, message: '请求体必须为数组' }));
                return;
            }

            // 给每条视频添加接收时间戳（如果没有 pubdate 的话，用 receivedAt 排序）
            const now = Math.floor(Date.now() / 1000);
            for (const v of newVideos) {
                if (!v.receivedAt) v.receivedAt = now;
            }

            // 用 bvid 去重：新数据追加到头部
            const existingBvids = new Set(latestVideos.map(v => v.bvid));
            const uniqueNew = newVideos.filter(v => v.bvid && !existingBvids.has(v.bvid));

            latestVideos = [...uniqueNew, ...latestVideos];

            // 保留最新的 MAX_VIDEOS 条
            if (latestVideos.length > MAX_VIDEOS) {
                latestVideos = latestVideos.slice(0, MAX_VIDEOS);
            }

            const msg = `收到 ${newVideos.length} 条，去重后新增 ${uniqueNew.length} 条，当前共 ${latestVideos.length} 条`;
            console.log(`[update] ${msg}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 0, message: msg, total: latestVideos.length }));
        } catch (err) {
            console.error('[update] 解析错误:', err.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, message: '解析 JSON 失败' }));
        }
        return;
    }

    // ---- GET /get_videos ----
    if (req.method === 'GET' && url === '/get_videos') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: latestVideos, total: latestVideos.length }));
        return;
    }

    // ---- 404 ----
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: -1, message: '未知路由' }));
});

// ----------------------------------------------------------
// 启动服务
// ----------------------------------------------------------
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Bilibili 聚合服务] 已启动，监听 http://127.0.0.1:${PORT}`);
    console.log(`  POST /update_videos  — 接收视频数据`);
    console.log(`  GET  /get_videos     — 返回视频数据`);
});
