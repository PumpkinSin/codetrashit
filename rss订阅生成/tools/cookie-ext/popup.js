// 提取特定域名的所有 Cookie，并拼装为 key=value; 字符串
async function getCookiesString(domain) {
    const cookies = await chrome.cookies.getAll({ domain });
    if (cookies.length === 0) return null;
    // 过滤掉一些不相关的或者可能导致请求头过大的无用 Cookie
    return cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
}

document.getElementById('extractBtn').addEventListener('click', async () => {
    let result = '';
    const btn = document.getElementById('extractBtn');
    btn.disabled = true;
    btn.innerText = '提取中...';

    try {
        // --- 1. Bilibili (只需要 SESSDATA) ---
        const biliCookies = await chrome.cookies.getAll({ domain: 'bilibili.com' });
        const sessdata = biliCookies.find(c => c.name === 'SESSDATA');
        if (sessdata) {
            result += `BILIBILI_SESSDATA=${sessdata.value}\n`;
        } else {
            result += `# ⚠️ 未登录 B站（未找到 SESSDATA）\nBILIBILI_SESSDATA=\n`;
        }

        result += '\n';

        // --- 2. Zhihu (全量 Cookie，确保 d_c0 等都在) ---
        const zhihuStr = await getCookiesString('zhihu.com');
        if (zhihuStr) {
            result += `ZHIHU_COOKIE=${zhihuStr}\n`;
        } else {
            result += `# ⚠️ 未登录 知乎\nZHIHU_COOKIE=\n`;
        }

        result += '\n';

        // --- 3. Douban (全量 Cookie，确保 dbcl2, ck, bid 等都在) ---
        const doubanStr = await getCookiesString('douban.com');
        if (doubanStr) {
            result += `DOUBAN_COOKIE=${doubanStr}\n`;
        } else {
            result += `# ⚠️ 未登录 豆瓣\nDOUBAN_COOKIE=\n`;
        }

        // 显示到多行文本框
        const ta = document.getElementById('result');
        ta.value = result;

        // 尝试复制到剪贴板
        try {
            await navigator.clipboard.writeText(result);
            showStatus('✅ 提取成功！已自动复制到剪贴板。', '#28a745');
        } catch (err) {
            // 后备方案：选中并使用 execCommand
            ta.select();
            document.execCommand('copy');
            showStatus('✅ 提取成功！已自动复制到剪贴板。', '#28a745');
        }

    } catch (error) {
        console.error(error);
        showStatus('❌ 提取失败: ' + error.message, '#dc3545');
    } finally {
        btn.disabled = false;
        btn.innerText = '重新提取';
    }
});

function showStatus(text, color) {
    const statusObj = document.getElementById('status');
    statusObj.innerText = text;
    statusObj.style.color = color;
    statusObj.style.display = 'block';
}
