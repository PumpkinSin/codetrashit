/**
 * r2-uploader.js — Cloudflare R2 上传模块
 *
 * 使用 @aws-sdk/client-s3 的 S3 兼容 API 上传文件到 R2
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');

let client = null;

/**
 * 获取/创建 S3Client 实例（懒初始化）
 */
function getClient() {
    if (client) return client;

    if (!config.r2.accountId || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
        throw new Error('R2 配置不完整，请检查 .env 文件中的 CF_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
    }

    client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.r2.accessKeyId,
            secretAccessKey: config.r2.secretAccessKey,
        },
    });

    return client;
}

/**
 * 上传 RSS XML 到 R2
 * @param {string} key - 文件名/路径，如 'bilibili.xml'
 * @param {string} xmlContent - RSS XML 字符串
 * @returns {Promise<Object>} 上传结果
 */
async function upload(key, xmlContent) {
    const s3 = getClient();

    const command = new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: xmlContent,
        ContentType: 'application/rss+xml; charset=utf-8',
    });

    const result = await s3.send(command);

    const publicUrl = config.r2.publicUrl
        ? `${config.r2.publicUrl}/${key}`
        : `(未配置公开URL) ${key}`;

    console.log(`[R2] 上传成功: ${publicUrl}`);
    return { key, publicUrl, httpStatusCode: result.$metadata?.httpStatusCode };
}

/**
 * 上传 B站 RSS
 */
async function uploadBilibili(xmlContent) {
    return upload(config.rss.bilibiliKey, xmlContent);
}

/**
 * 上传知乎 RSS
 */
async function uploadZhihu(xmlContent) {
    return upload(config.rss.zhihuKey, xmlContent);
}

/**
 * 冒烟测试：上传一个小文件验证配置是否正确
 */
async function testUpload() {
    const testContent = `<?xml version="1.0"?><test>R2 连接测试 - ${new Date().toISOString()}</test>`;
    const result = await upload('_test.xml', testContent);
    console.log('[R2] 测试上传结果:', result);
    return result;
}

module.exports = { upload, uploadBilibili, uploadZhihu, testUpload };
