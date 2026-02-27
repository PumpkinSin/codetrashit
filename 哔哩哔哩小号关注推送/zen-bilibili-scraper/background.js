// ============================================================
// Bilibili 小号动态 · 后台极慢速抓取扩展
// 支持 popup 配置：端口、翻页数、间隔、延迟
// ============================================================

const ALARM_NAME = 'bilibili-alt-fetch';
const API_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all';

// 默认配置
const DEFAULTS = {
    port: 8080,
    maxPages: 5,
    interval: 30,   // 分钟
    minDelay: 10,    // 秒
    maxDelay: 15,    // 秒
};

// ----------------------------------------------------------
// 读取配置
// ----------------------------------------------------------
async function getConfig() {
    try {
        const result = await browser.storage.local.get('config');
        return { ...DEFAULTS, ...(result.config || {}) };
    } catch {
        return { ...DEFAULTS };
    }
}

// ----------------------------------------------------------
// 工具函数
// ----------------------------------------------------------

function randomDelay(minSec, maxSec) {
    const minMs = minSec * 1000;
    const maxMs = maxSec * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
    console.log('[B站小号抓取]', ...args);
}

// ----------------------------------------------------------
// 核心：抓取动态流
// ----------------------------------------------------------

async function fetchDynamics() {
    const config = await getConfig();
    const { maxPages, minDelay, maxDelay } = config;

    log(`开始抓取任务... (最多 ${maxPages} 页，延迟 ${minDelay}-${maxDelay}s)`);

    const videos = [];
    let offset = '';
    let pageCount = 0;

    while (pageCount < maxPages) {
        pageCount++;

        const url = offset
            ? `${API_URL}?offset=${offset}&type=all`
            : `${API_URL}?type=all`;

        log(`第 ${pageCount}/${maxPages} 页`, offset ? `offset=${offset}` : '(首页)');

        let json;
        try {
            const resp = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://t.bilibili.com/',
                    'User-Agent': navigator.userAgent,
                },
            });

            if (!resp.ok) {
                log(`HTTP 错误: ${resp.status}，停止抓取`);
                break;
            }

            json = await resp.json();
        } catch (err) {
            log('请求异常，停止抓取:', err.message);
            break;
        }

        if (!json || json.code !== 0 || !json.data) {
            log('接口返回异常，停止抓取:', json?.code, json?.message);
            break;
        }

        const { items, offset: nextOffset, has_more } = json.data;

        if (Array.isArray(items)) {
            for (const item of items) {
                const dynamicType = item.type;
                if (dynamicType !== 'DYNAMIC_TYPE_AV' && dynamicType !== 'DYNAMIC_TYPE_UGC_SEASON') {
                    continue;
                }

                try {
                    const module_author = item.modules?.module_author;
                    const module_dynamic = item.modules?.module_dynamic;
                    const archive = module_dynamic?.major?.archive;

                    if (!archive) continue;

                    videos.push({
                        author: module_author?.name || '未知UP主',
                        bvid: archive.bvid || '',
                        title: archive.title || '无标题',
                        cover: archive.cover || '',
                    });
                } catch (e) {
                    log('解析单条动态失败:', e.message);
                }
            }
        }

        log(`本页提取了视频，累计 ${videos.length} 条`);

        if (!has_more) {
            log('has_more=false，已到达末尾，停止翻页');
            break;
        }

        offset = nextOffset || '';
        if (!offset) {
            log('无 offset，停止翻页');
            break;
        }

        // ⚠️ 防风控延迟
        if (pageCount < maxPages) {
            const delay = randomDelay(minDelay, maxDelay);
            log(`防风控延迟 ${(delay / 1000).toFixed(1)} 秒...`);
            await sleep(delay);
        }
    }

    log(`抓取完成，共获取 ${videos.length} 条视频`);
    return videos;
}

// ----------------------------------------------------------
// POST 到本地服务
// ----------------------------------------------------------

async function postVideos(videos) {
    if (!videos || videos.length === 0) {
        log('无视频可发送，跳过 POST');
        return;
    }

    const config = await getConfig();
    const postUrl = `http://127.0.0.1:${config.port}/update_videos`;

    try {
        const resp = await fetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(videos),
        });

        if (resp.ok) {
            log(`成功发送 ${videos.length} 条视频到本地服务 (端口 ${config.port})`);
        } else {
            log(`POST 失败: HTTP ${resp.status}`);
        }
    } catch (err) {
        log('POST 到本地服务失败（服务可能未运行）:', err.message);
    }
}

// ----------------------------------------------------------
// 主流程
// ----------------------------------------------------------

async function runTask() {
    try {
        const videos = await fetchDynamics();
        await postVideos(videos);
    } catch (err) {
        log('任务执行异常:', err.message);
    }
}

// ----------------------------------------------------------
// Alarm 注册（根据配置动态设定间隔）
// ----------------------------------------------------------

async function setupAlarm() {
    const config = await getConfig();
    await browser.alarms.clear(ALARM_NAME);
    browser.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.1,
        periodInMinutes: config.interval,
    });
    log(`闹钟已注册：每 ${config.interval} 分钟执行一次`);
}

// 监听闹钟触发
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        log('闹钟触发，启动抓取任务');
        runTask();
    }
});

// ----------------------------------------------------------
// 监听来自 popup 的消息
// ----------------------------------------------------------

browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CONFIG_UPDATED') {
        log('配置已更新，重新注册闹钟');
        setupAlarm();
    } else if (msg.type === 'RUN_NOW') {
        log('收到立刻抓取指令');
        runTask();
    }
});

// ----------------------------------------------------------
// 初始化
// ----------------------------------------------------------

setupAlarm();
log('后台脚本已加载，等待闹钟调度...');
