/**
 * data-store.js — 本地 JSON 数据存储模块
 *
 * 职责：
 * - 按平台分文件存储动态数据
 * - 去重（根据 item.id）
 * - 按发布时间排序
 * - 限制最大条目数
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

// 确保数据目录存在
const dataDir = path.resolve(config.data.dir);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * 获取平台数据文件路径
 */
function getFilePath(platform) {
    const fileMap = {
        'bilibili': config.data.bilibiliFile,
        'zhihu': config.data.zhihuFile,
        'bilibili-alt': config.data.bilibiliAltFile,
        'douban': config.data.doubanFile,
    };
    const filename = fileMap[platform];
    if (!filename) throw new Error(`未知平台: ${platform}`);
    return path.join(dataDir, filename);
}

/**
 * 读取平台的所有数据
 * @param {string} platform - 'bilibili' | 'zhihu'
 * @returns {Array} 动态条目列表
 */
function load(platform) {
    const filePath = getFilePath(platform);
    if (!fs.existsSync(filePath)) return [];

    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[DataStore] 读取 ${platform} 数据失败:`, e.message);
        return [];
    }
}

/**
 * 合并新数据（去重 + 排序 + 截断）
 * @param {string} platform - 'bilibili' | 'zhihu'
 * @param {Array} newItems - 新的动态条目
 * @returns {{ totalCount: number, newCount: number }} 合并统计
 */
function merge(platform, newItems) {
    const existing = load(platform);
    const existingIds = new Set(existing.map(item => item.id));

    // 过滤出真正的新数据
    const uniqueNew = newItems.filter(item => !existingIds.has(item.id));
    const newCount = uniqueNew.length;

    if (newCount === 0) {
        return { totalCount: existing.length, newCount: 0 };
    }

    // 合并
    let merged = [...uniqueNew, ...existing];

    // 按发布时间倒序
    merged.sort((a, b) => (b.publishTime || 0) - (a.publishTime || 0));

    // 截断到最大条目数
    if (merged.length > config.rss.maxItems) {
        merged = merged.slice(0, config.rss.maxItems);
    }

    // 写入文件
    save(platform, merged);

    return { totalCount: merged.length, newCount };
}



/**
 * 保存数据到文件
 */
function save(platform, items) {
    const filePath = getFilePath(platform);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
}

/**
 * 清空平台数据
 */
function clear(platform) {
    save(platform, []);
}

module.exports = { load, merge, clear };
