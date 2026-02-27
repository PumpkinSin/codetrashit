// ============================================================
// popup.js — 配置界面逻辑
// ============================================================

const DEFAULTS = {
    port: 8080,
    maxPages: 5,
    interval: 30,
    minDelay: 10,
    maxDelay: 15,
};

const fields = ['port', 'maxPages', 'interval', 'minDelay', 'maxDelay'];
const statusEl = () => document.getElementById('status');

// ---- 加载配置 ----
async function loadConfig() {
    const result = await browser.storage.local.get('config');
    const config = result.config || {};
    for (const key of fields) {
        const input = document.getElementById(key);
        if (input) input.value = config[key] ?? DEFAULTS[key];
    }
}

// ---- 保存配置 ----
async function saveConfig() {
    const config = {};
    for (const key of fields) {
        const input = document.getElementById(key);
        const val = parseInt(input.value, 10);
        config[key] = isNaN(val) ? DEFAULTS[key] : val;
    }

    // 验证
    if (config.minDelay >= config.maxDelay) {
        showStatus('❌ 最小延迟必须小于最大延迟', true);
        return;
    }
    if (config.interval < 5) {
        showStatus('❌ 抓取间隔不能小于 5 分钟', true);
        return;
    }

    await browser.storage.local.set({ config });

    // 通知 background 重新注册 alarm
    try {
        await browser.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
    } catch (e) {
        // background 可能未运行，忽略
    }

    showStatus('✅ 配置已保存');
}

// ---- 立刻抓取 ----
async function runNow() {
    showStatus('⏳ 正在触发抓取...');
    try {
        await browser.runtime.sendMessage({ type: 'RUN_NOW' });
        showStatus('✅ 抓取任务已触发，请查看控制台');
    } catch (e) {
        showStatus('⚠️ 触发失败，请先重载扩展');
    }
}

function showStatus(msg, isError = false) {
    const el = statusEl();
    el.textContent = msg;
    el.style.color = isError ? '#e74c3c' : '#4caf50';
    if (!isError) setTimeout(() => { el.textContent = ''; }, 3000);
}

// ---- 事件绑定 ----
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    document.getElementById('btn-save').addEventListener('click', saveConfig);
    document.getElementById('btn-run').addEventListener('click', runNow);
});
