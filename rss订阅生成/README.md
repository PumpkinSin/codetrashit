# RSS 动态订阅生成器

定时抓取 B站 / 知乎 / 豆瓣关注动态 → 生成 RSS → 上传 Cloudflare R2，配合 Inoreader 等阅读器使用。

> 纯 Node.js，无需数据库。一个 `.env` 搞定所有配置。

## 功能一览

| 模块 | 说明 |
|------|------|
| 📺 B站主号 | 抓取关注列表的全部动态（视频、图文、文章、转发等） |
| 📺 B站小号 | 独立 SESSDATA，只抓视频动态 |
| 💬 知乎 | 关注列表的回答、文章、想法（自动过滤广告/推广/无效链接） |
| 📖 豆瓣 | 采用类似 RSSHub 的串行抓取策略，绕过风控，拉取并合并关注者的个人广播 |
| ☁️ R2 上传 | RSS XML 自动同步到 Cloudflare R2 |
| 🔄 定时抓取 | 可配置间隔（默认 30 分钟），控制台显示时间戳 |
| 🔍 智能翻页 | 发现重复后可多爬 N 页，捕捉延迟出现的内容（B站/知乎） |
| 🚫 内容过滤 | 按动态类型、关键词精细过滤 |
| 🖼️ 图片代理 | 所有图片统一走 wsrv.nl 代理，避免 RSS 阅读器防盗链问题 |
| 🧹 HTML 清理 | 知乎、豆瓣内容自动 sanitize，保留格式标签，剔除无用属性 |
| 🎯 小号 Tab | 油猴脚本在 Bilibili-Gate 中注入独立「小号」Tab，点击 UP 主名可跳转动态页 |

> **鸣谢：** 豆瓣抓取逻辑深刻参考了 [RSSHub](https://github.com/DIYgod/RSSHub) 的实现思路，在此表示感谢。由于豆瓣对 `home_timeline` 的风控极其严格（第三方统一 403），本项目同样采用了“先获取关注列表，再逐一并发/串行获取各用户 `user_timeline`，最后合并去重排序”的安全策略。

---

## 快速开始

```bash
cd server
npm install
cp .env.example .env   # 编辑 .env 填入你的 Cookie 和 R2 配置
node server.js         # 或双击 start.bat
```

启动后访问 `http://localhost:3457/api/status` 确认服务状态。

---

## 配置

所有配置在 `.env` 文件中，参考 `.env.example`。

### Cookie 获取

| 平台 | 需要的 Cookie | 获取方式 |
|------|-------------|----------|
| B站 | `SESSDATA` | F12 → 应用 → Cookie → `bilibili.com` |
| 知乎 | `d_c0` | F12 → 应用 → Cookie → `zhihu.com` |
| 豆瓣 | `dbcl2`, `ck` | F12 → Network → 找 `m.douban.com` 的请求 → 复制完整 Cookie |

```env
BILIBILI_SESSDATA=你的SESSDATA值
BILIBILI_ALT_SESSDATA=小号的SESSDATA值（可选）
ZHIHU_COOKIE=d_c0=你的d_c0值
DOUBAN_COOKIE=dbcl2="你的dbcl2值"; ck=你的ck值; 
```

> ⚠️ Cookie 约 1 个月过期，届时需从浏览器重新复制并更新 `.env`，然后重启服务。

### 内容过滤与特殊配置

```env
# B站：跳过指定动态类型
BILIBILI_SKIP_TYPES=DYNAMIC_TYPE_LIVE_RCMD,DYNAMIC_TYPE_FORWARD

# B站：关键词黑名单（匹配标题/正文，不区分大小写）
BILIBILI_BLOCK_KEYWORDS=外卖红包,优惠券,拼多多

# 知乎：跳过指定动态类型
ZHIHU_SKIP_VERBS=MEMBER_FOLLOW_QUESTION,QUESTION_FOLLOW

# 豆瓣：跳过指定活动类型
DOUBAN_SKIP_ACTIVITIES=想看,想读,想听

# 豆瓣：每次都重新拉取关注列表（默认 false，使用本地缓存节省网络请求）
# 如果新关注了用户，可临时设为 true 跑一次后改回 false
DOUBAN_REFRESH_FOLLOWING=false
```

### 智能翻页

```env
BILIBILI_EXTRA_PAGES=2   # 发现重叠后再多爬 2 页 (对抗 B 站动态时间线延迟)
ZHIHU_EXTRA_PAGES=2
```

---

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 服务状态（各平台数据量、配置情况等） |
| `POST` | `/api/fetch` | 手动触发一次全平台抓取 |
| `POST` | `/api/sync` | 手动同步 RSS 到 R2 |
| `GET` | `/api/feed/:platform` | 预览 RSS XML（`bilibili` / `zhihu` / `douban` / `bilibili-alt`） |
| `GET` | `/api/data/:platform` | 返回原始 JSON 数据（油猴脚本使用） |
| `POST` | `/api/feed` | 接收外部推送的动态数据（兼容扩展） |

---

## 油猴脚本：小号 Tab

`bilibili-gate-小号/gate-other.js` 是一个油猴脚本，需配合 [Bilibili-Gate](https://github.com/magicdawn/bilibili-gate) 使用。

**功能：**
- 在 Bilibili-Gate 界面新增独立「小号」Tab
- 从本地服务拉取小号视频数据，以 Gate 风格卡片展示
- 点击 UP 主名可直接跳转到 `space.bilibili.com/{mid}/dynamic`
- 30 秒自动轮询刷新 + 手动刷新按钮

**安装：**
1. 安装 Tampermonkey / Violentmonkey
2. 新建脚本，粘贴 `gate-other.js` 内容
3. 确保本地服务已启动（默认 `http://127.0.0.1:3457`）

---

## 项目结构

```
server/
├── .env.example             # 配置模板
├── server.js                # Express 服务入口
├── config.js                # .env → 配置对象
├── modules/
│   ├── bilibili-fetcher.js  # B站动态抓取（主号/小号复用）
│   ├── zhihu-fetcher.js     # 知乎动态抓取（自动过滤广告/无效链接）
│   ├── douban-fetcher.js    # 豆瓣采用关注者列表串行拉取策略
│   ├── fetch-scheduler.js   # 定时调度器
│   ├── data-store.js        # 本地 JSON 存储（去重/合并）
│   ├── rss-generator.js     # RSS XML 生成（图片代理 + HTML 清理）
│   └── r2-uploader.js       # Cloudflare R2 上传
└── data/                    # 运行时数据（自动生成，已 gitignore）

bilibili-gate-小号/
├── gate-other.js            # 油猴脚本：Bilibili-Gate 小号 Tab
└── Bilibili-Gate.js         # Bilibili-Gate 本体（供参考）

start.bat                    # Windows 一键启动
```
