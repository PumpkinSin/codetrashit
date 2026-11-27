# CLIP STUDIO 笔刷自动入库工具

包含两个工具，分别用于 **浏览器手动逛素材** 和 **服务器/软路由（白虎/青龙面板）定时自动领取**。

## 文件说明

- `clipstudio.js`：Tampermonkey 油猴脚本，在浏览器访问 `assets.clip-studio.com` 时自动收藏并免费入库，可阻止 `clipstudio://` 弹窗，并在排行榜/搜索页支持一键静默批量入库。
- `clip_auto_claim.py`：Python 定时任务脚本，适用于 **白虎面板 / 青龙面板 / Linux Cron**，定时抓取每日免费排行榜，跳过已入库和付费素材，自动收藏 + 免费入库，并支持 Telegram 通知。

---

## 一、油猴脚本 (`clipstudio.js`)

1. 在浏览器安装 Tampermonkey / ScriptCat。
2. 新建脚本并粘贴 `clipstudio.js` 保存。
3. 打开 `https://assets.clip-studio.com/` 即可生效，可通过油猴菜单打开设置面板调整延迟、跳过付费素材、自动跳转繁中等选项。

---

## 二、白虎 / 青龙定时脚本 (`clip_auto_claim.py`)

### 1. 依赖
- Python 3 + `requests`（`pip install requests`）

### 2. 环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `CLIP_COOKIE` | 是 | 登录 `assets.clip-studio.com` 后的完整 Cookie（建议同时包含 `assets.clip-studio.com` 和 `.clip-studio.com` 下的 `CLIP_AUTH_TOKEN`、`XSRF-TOKEN`、`CLIP_ASSETS_SESSION`） |
| `CLIP_RANKING_URL` | 否 | 要巡检的排行榜地址，默认：`https://assets.clip-studio.com/zh-tw/ranking?freq=daily&sales=free&content=clipstudio&corp=priv` |
| `CLIP_DELAY` | 否 | 每个素材之间的请求间隔（秒），默认 `3` |
| `TG_BOT_TOKEN` | 否 | Telegram 机器人 Token（不填则跳过推送） |
| `TG_USER_ID` | 否 | Telegram 个人 Chat ID |

### 3. 定时任务配置示例
- **命令**：`python clip_auto_claim.py`
- **定时规则（每 12 小时）**：
  - 6 位 Cron（白虎面板）：`0 30 8,20 * * *`
  - 5 位 Cron（青龙/Linux）：`30 8,20 * * *`

### 4. 注意事项
- `CLIP_AUTH_TOKEN` 通常有十天左右有效期，期间会话 Cookie 会自动续期；若收到 Telegram 鉴权失败（`401/403/419`）提醒，重新登录官网更新 `CLIP_COOKIE` 即可。
