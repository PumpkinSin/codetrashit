async function getCookiesString(domain) {
    const domains = [domain, `.${domain}`];
    const allCookies = [];

    if (typeof browser !== 'undefined') {
        for (const d of domains) {
            const cookies = await browser.cookies.getAll({ domain: d });
            allCookies.push(...cookies);
        }
    } else {
        for (const d of domains) {
            const cookies = await new Promise((resolve) => {
                chrome.cookies.getAll({ domain: d }, resolve);
            });
            if (cookies) allCookies.push(...cookies);
        }
    }

    if (allCookies.length === 0) return null;

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

async function getBiliSessdata() {
    const domains = ['bilibili.com', '.bilibili.com'];
    let sessdata = null;

    for (const d of domains) {
        if (typeof browser !== 'undefined') {
            const cookies = await browser.cookies.getAll({ domain: d });
            sessdata = cookies.find(c => c.name === 'SESSDATA');
        } else {
            sessdata = await new Promise((resolve) => {
                chrome.cookies.getAll({ domain: d }, (cookies) => {
                    resolve(cookies ? cookies.find(c => c.name === 'SESSDATA') : null);
                });
            });
        }
        if (sessdata) break; // 找到就退出
    }
    return sessdata;
}

document.getElementById('extractBtn').addEventListener('click', async () => {
    const btn = document.getElementById('extractBtn');
    btn.disabled = true;
    btn.innerText = '提取中...';

    try {
        const sessdata = await getBiliSessdata();
        updateField('Bili', sessdata ? sessdata.value : '未登录，未找到 SESSDATA');

        const zhihuStr = await getCookiesString('zhihu.com');
        updateField('Zhihu', zhihuStr || '未登录，未找到 Cookie');

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
