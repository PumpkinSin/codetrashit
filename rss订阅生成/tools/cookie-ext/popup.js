async function getCookiesString(domain) {
    // 豆瓣的部分关键 Cookie（如 dbcl2, ck）是绑定在 .douban.com 上的，
    // 而 Firefox/Chrome 的精确 domain 查询可能漏掉带点的前缀域名，
    // 所以我们需要同时查询 domain 和 .domain，然后去重合并。
    const domains = [domain, `.${domain}`];
    const allCookies = [];

    for (const d of domains) {
        const cookies = await chrome.cookies.getAll({ domain: d });
        allCookies.push(...cookies);
    }

    if (allCookies.length === 0) return null;

    // 根据 cookie 名字去重（优先保留有值的，或者直接后面覆盖前面）
    const cookieMap = new Map();
    for (const c of allCookies) {
        if (!cookieMap.has(c.name) || c.value) {
            cookieMap.set(c.name, c.value);
        }
    }

    return Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

document.getElementById('extractBtn').addEventListener('click', async () => {
    const btn = document.getElementById('extractBtn');
    btn.disabled = true;
    btn.innerText = '提取中...';

    try {
        // --- 1. Bilibili (只需要 SESSDATA) ---
        const biliCookies = await chrome.cookies.getAll({ domain: 'bilibili.com' });
        const sessdata = biliCookies.find(c => c.name === 'SESSDATA');
        updateField('Bili', sessdata ? sessdata.value : '未登录，未找到 SESSDATA');

        // --- 2. Zhihu (全量 Cookie) ---
        const zhihuStr = await getCookiesString('zhihu.com');
        updateField('Zhihu', zhihuStr || '未登录，未找到 Cookie');

        // --- 3. Douban (全量 Cookie) ---
        const doubanStr = await getCookiesString('douban.com');
        updateField('Douban', doubanStr || '未登录，未找到 Cookie');

        showStatus('✅ 提取完成！请分别点击复制', '#28a745');
    } catch (error) {
        console.error(error);
        showStatus('❌ 提取失败: ' + error.message, '#dc3545');
    } finally {
        btn.disabled = false;
        btn.innerText = '重新提取';
    }
});

function updateField(key, value) {
    const ta = document.getElementById('val' + key);
    const copyBtn = document.getElementById('copy' + key);
    ta.value = value;
    if (value && !value.startsWith('未登录')) {
        copyBtn.disabled = false;
        copyBtn.onclick = () => copyText(value, copyBtn);
    } else {
        copyBtn.disabled = true;
    }
}

async function copyText(text, btnElement) {
    try {
        await navigator.clipboard.writeText(text);
        flashButton(btnElement);
    } catch (err) {
        // 后备方案
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        flashButton(btnElement);
    }
}

function flashButton(btnElement) {
    const oldText = btnElement.innerText;
    btnElement.innerText = '已复制!';
    btnElement.style.backgroundColor = '#17a2b8';
    setTimeout(() => {
        btnElement.innerText = oldText;
        btnElement.style.backgroundColor = '';
    }, 1500);
}

function showStatus(text, color) {
    const statusObj = document.getElementById('status');
    statusObj.innerText = text;
    statusObj.style.color = color;
    statusObj.style.display = 'block';
}
