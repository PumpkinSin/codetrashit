# 🚀 RSS 动态订阅生成器 (Rust + Flutter 桌面版)

定时抓取 **B站 (主号/小号) / 知乎 / 豆瓣** 的关注动态，自动转换为标准 RSS 2.0 订阅源，并通过 S3 协议自动同步上传至 **Cloudflare R2** 云端存储，配合 Inoreader、Follow、NetNewsWire 等现代 RSS 阅读器使用。

> ⚡ **全栈原生重构**：后端采用 Rust 高性能异步引擎（Axum + Reqwest + Tokio），前端采用 Flutter 现代化桌面客户端（支持 Windows 系统托盘、开机自启、浏览器 Cookie 免扫码一键提取与失效自动刷新）。

---

## 🌟 核心特性

| 平台 / 模块 | 核心功能与特性 |
| :--- | :--- |
| 📺 **B站关注动态** | 适配现代 **OPUS 图文**体系；解析真实**直播卡片**（分区、人数、封面、直达链接）；支持番剧（PGC）、课堂（COURSES）、音频及专栏文章；支持关联商品（带货挂件）信息提取。 |
| 📺 **B站小号模式** | 支持独立小号 Cookie（仅抓视频），或在无独立 Cookie 时自动从主号动态中提取 `DYNAMIC_TYPE_AV` 纯视频动态到 `bilibili-alt`。 |
| 💬 **知乎关注动态** | 支持 `feed_group` 折叠动态聚合展开；智能图文降级提取（优先 `content_html`）；自动将知乎懒加载 SVG 占位图替换为高清真实原图；去除作者名重复。 |
| 📖 **豆瓣广播动态** | 支持从关注列表串行拉取广播，内置签名与风控规避策略，支持转发/引用卡片与视频渲染。 |
| 🚫 **B站精准屏蔽词** | **仅对 B 站图文/非视频动态生效，完全不影响视频投稿**；支持转发原动态内容穿透匹配，并在抓取与 RSS 生成双阶段实时过滤。 |
| 🍪 **Cookie 提取与自愈** | 原生解密本地主流浏览器（**Chrome / Edge / Vivaldi / Firefox / Zen**）的 Cookie；抓取遇到鉴权失效时，自动尝试从浏览器重新提取最新 Cookie 并重试。 |
| ☁️ **Cloudflare R2 同步** | 内置 AWS S3 SigV4 签名上传，支持定时自动同步与手动一键同步至 R2 存储桶，生成公网订阅地址。 |
| 🖼️ **防盗链与富文本渲染** | 图片自动通过 `wsrv.nl` 代理解决防盗链；HTML 安全标签清洗；支持可选 B 站嵌入式播放器与 `<enclosure>` 封面图提取。 |
| 🖥️ **Windows 桌面端** | 支持系统托盘常驻、关闭最小化到托盘、开机自启、实时日志监视与在线配置管理。 |

---

## 🧠 核心机制说明

### 1. 定时调度与自动同步机制
- 引擎启动后等待 **10 秒** 执行首次全平台抓取，之后按 `FETCH_INTERVAL`（默认 `30` 分钟）循环调度。
- 每次抓取前与抓取后都会自动重新加载 `.env`，确保通过 UI 或手动修改的配置即时生效。
- 若开启 `AUTO_SYNC=true`（默认开启），每次抓取完成后会依次为 `bilibili`、`zhihu`、`douban` 生成 RSS 2.0 XML，并以 1.5 秒间隔串行上传至 Cloudflare R2。

### 2. 增量去重与重叠翻页机制
- 各平台抓取后统一交由 `DataStore` 按动态 `id` 去重合并，按 `publishTime` 降序排列，并按 `RSS_MAX_ITEMS`（默认 `200` 条，`bilibili-alt` 默认 `100` 条）截断持久化到 `data/<platform>.json`。
- 翻页时引入**重叠检测**：当某一页的新动态占比不足一半时，再额外向后抓取 `*_EXTRA_PAGES` 页后停止，兼顾不漏抓与避免无效翻页。

### 3. B 站屏蔽词过滤机制（仅限图文/动态，不影响视频）
- **作用范围**：屏蔽词（`BILIBILI_BLOCK_KEYWORDS`）**仅对 B 站非视频动态生效**，视频投稿（`DYNAMIC_TYPE_AV`）与 `bilibili-alt` 均不受任何影响。
  - 会被过滤的类型包括：`DYNAMIC_TYPE_OPUS`（图文）、`DYNAMIC_TYPE_DRAW`（带图动态）、`DYNAMIC_TYPE_ARTICLE`（专栏文章）、`DYNAMIC_TYPE_WORD`（纯文字动态）、`DYNAMIC_TYPE_FORWARD`（转发动态）等。
- **匹配字段**：不区分大小写，合并检查动态的 `title`、`rawTitle`、`content`，以及**转发动态中被转发的原动态** `origDynamic.title` 与 `origDynamic.content`。
- **双阶段实时生效**：
  1. **抓取阶段**：新抓取到的命中屏蔽词的非视频动态会被直接跳过，不写入本地缓存。
  2. **RSS 生成阶段**：在生成 RSS XML（无论是 `/api/feed/bilibili` 还是上传 R2）时也会实时执行一次过滤。因此你在桌面端「屏蔽词」面板新增或移除关键词后，**无需清空历史数据**，已入库的旧图文动态也会立即被屏蔽或恢复。

### 4. Cookie 提取与失效自动刷新
- **提取方式**：桌面端「Cookie 管理」会自动扫描本机已安装的 **Chrome、Edge、Vivaldi**（Chromium DPAPI/AES-GCM 解密）和 **Firefox、Zen**（SQLite 直接读取）配置文件，一键提取 `bilibili.com`、`zhihu.com`、`douban.com` 的 Cookie 并写入 `.env`。
- **失效自愈**：抓取过程中如遇到 HTTP 鉴权错误或 B 站返回 `code == -101` 等未登录状态，引擎会自动调用本机浏览器 Cookie 刷新逻辑重新提取并立即重试当前页。

### 5. 图片防盗链与内容渲染
- B 站（`hdslb.com` / `bilivideo.com` / `biliimg.com`）、知乎（`zhimg.com`）、豆瓣（`doubanio.com`）图片默认通过 `https://wsrv.nl/?url=...` 代理，避免 RSS 阅读器因 Referer 限制裂图。
- 每条动态优先提取正文首图或视频封面作为 `<enclosure>`（绝不使用作者头像），提升阅读器卡片排版效果。

---

## 📦 目录架构

```text
├── dist/                     # 🚀 完整打包发布目录（绿色免安装，可直接运行）
│   ├── RSSManager.exe        # Flutter 桌面端主程序（含系统托盘）
│   ├── rss_engine.exe        # Rust 后台服务引擎
│   ├── .env                  # 核心运行配置文件（R2、Cookie、屏蔽词、抓取参数等）
│   ├── gui_config.json       # 桌面端偏好设置（托盘、开机自启等）
│   └── data/                 # 各平台动态 JSON 缓存目录
│
├── rust_engine/              # 🦀 Rust 后端引擎源码 (Axum + Reqwest + Rusqlite)
├── flutter_ui/               # 💙 Flutter 桌面端源码
├── data/                     # 本地调试运行时的动态缓存目录
├── old/                      # 📜 历史旧版本归档（原 Node.js + Python 脚本）
│
├── build.bat                 # 一键编译 Rust 与 Flutter 并打包输出到 dist/
├── start-desktop.bat         # 启动桌面端管理程序
└── start-engine.bat          # 单独前台启动 Rust 服务引擎（调试/纯后台用）
```

---

## 🏃 快速上手与日常用法

### 方式 1：直接使用（推荐）
1. 双击运行 [`dist/RSSManager.exe`](file:///F:/code/github/codetrashit/rss%E8%AE%A2%E9%98%85%E7%94%9F%E6%88%90/dist/RSSManager.exe) 或根目录下的 [`start-desktop.bat`](file:///F:/code/github/codetrashit/rss%E8%AE%A2%E9%98%85%E7%94%9F%E6%88%90/start-desktop.bat)，桌面端会自动拉起 `rss_engine.exe`。
2. 在主界面顶部三个选项卡中完成配置与操作：
   - **服务控制**：查看各平台动态数量、手动触发全量抓取、手动同步至 R2、管理开机自启与托盘设置，并在下方实时查看运行日志。
   - **Cookie 管理**：选择常用浏览器配置文件，勾选平台后点击扫描提取；也支持手动粘贴 Cookie 保存。
   - **屏蔽词**：添加或删除 B 站屏蔽词（仅过滤图文/动态，不影响视频），修改后立即生效并持久化至 `.env`。
3. 如需无界面纯后台运行，可直接运行 [`start-engine.bat`](file:///F:/code/github/codetrashit/rss%E8%AE%A2%E9%98%85%E7%94%9F%E6%88%90/start-engine.bat)。

### 方式 2：从源码编译打包
修改 `rust_engine/` 或 `flutter_ui/` 后，在根目录运行：
```bat
build.bat
```
脚本会依次执行 `cargo build --release` 与 `flutter build windows --release`，将最新可执行文件及配置同步到 `dist/`，并自动清理编译缓存。

---

## ⚙️ 配置文件说明 (`.env`)

程序优先读取当前工作目录下的 `.env`（桌面端打包运行时为 `dist/.env`）。

### 1. 基础与调度参数

```env
PORT=3457                 # 本地 HTTP 服务端口
DATA_DIR=./data           # 动态缓存 JSON 目录
FETCH_INTERVAL=30         # 定时抓取间隔（分钟，最小 1）
AUTO_SYNC=true            # 抓取完成后是否自动上传 R2（设 false 关闭）
RSS_MAX_ITEMS=200         # 单平台 RSS 最大保留条数
BILIBILI_EMBED_PLAYER=false # 是否在 RSS 正文中嵌入 B 站播放器 iframe
```

### 2. ☁️ 配置 Cloudflare R2（云端公网订阅）

```env
CF_ACCOUNT_ID=你的Account_ID
R2_BUCKET_NAME=你的存储桶名称
R2_ACCESS_KEY_ID=你的Access_Key_ID
R2_SECRET_ACCESS_KEY=你的Secret_Access_Key
R2_PUBLIC_URL=https://pub-xxxxxx.r2.dev
```

<details>
<summary>点击展开：Cloudflare R2 详细获取步骤</summary>

1. **获取 `CF_ACCOUNT_ID`**：登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，在侧边栏或主页右侧复制 **Account ID**。
2. **创建 `R2_BUCKET_NAME`**：进入 **R2 对象存储** → **创建存储桶**（如 `my-rss-feed`），名称即为 `R2_BUCKET_NAME`。
3. **获取 API 凭证**：在 R2 首页点击 **管理 R2 API 令牌** → **创建 API 令牌**，权限选择 **对象读和写 (Object Read & Write)**，将生成的 `Access Key ID` 与 `Secret Access Key` 填入对应字段。
4. **配置 `R2_PUBLIC_URL`**：进入存储桶 **设置 (Settings)** → **公开访问 (Public access)**，开启 **R2.dev 子域** 或绑定自定义域名，将访问地址（不带末尾斜杠）填入 `R2_PUBLIC_URL`。

配置完成后，公网订阅地址为：
- B站动态：`${R2_PUBLIC_URL}/bilibili.xml`
- 知乎动态：`${R2_PUBLIC_URL}/zhihu.xml`
- 豆瓣动态：`${R2_PUBLIC_URL}/douban.xml`
- B站小号：`${R2_PUBLIC_URL}/bilibili-alt.xml`（需手动或通过 `/api/feed/bilibili-alt` 订阅）

</details>

### 3. 平台抓取与过滤参数

```env
# B站主号
BILIBILI_COOKIE=...
BILIBILI_SESSDATA=...
BILIBILI_MAX_PAGES=5
BILIBILI_EXTRA_PAGES=0
BILIBILI_SKIP_TYPES=                  # 跳过指定动态类型，逗号分隔，如 DYNAMIC_TYPE_LIVE_RCMD
BILIBILI_BLOCK_KEYWORDS=外卖,红包,优惠券 # 屏蔽词，逗号分隔（仅屏蔽非视频动态）

# B站小号（可选，留空则自动从主号提取视频）
BILIBILI_ALT_COOKIE=
BILIBILI_ALT_SESSDATA=
BILIBILI_ALT_MAX_PAGES=5
BILIBILI_ALT_MAX_ITEMS=100

# 知乎
ZHIHU_COOKIE=...
ZHIHU_MAX_PAGES=5
ZHIHU_EXTRA_PAGES=0
ZHIHU_SKIP_VERBS=                     # 跳过指定动态动作，逗号分隔

# 豆瓣
DOUBAN_COOKIE=...
DOUBAN_MAX_PAGES=5
DOUBAN_EXTRA_PAGES=0
DOUBAN_SKIP_ACTIVITIES=               # 跳过指定广播类型，逗号分隔
DOUBAN_REFRESH_FOLLOWING=false        # 是否在定时抓取时顺带刷新豆瓣关注列表缓存

# 自定义 RSS 文件名与标题（可选）
RSS_BILIBILI_KEY=bilibili.xml
RSS_ZHIHU_KEY=zhihu.xml
RSS_DOUBAN_KEY=douban.xml
RSS_BILIBILI_ALT_KEY=bilibili-alt.xml
```

---

## 🌐 本地 HTTP API 接口速查 (默认端口 `3457`)

| 方法 | 端点 | 功能说明 |
| :--- | :--- | :--- |
| `GET` | `/api/status` | 获取服务运行状态、运行时长、R2 状态与各平台缓存条数 |
| `POST` | `/api/fetch` | 异步触发一次全平台抓取（抓取前自动重载 `.env`） |
| `POST` | `/api/sync` | 立即生成并上传 `bilibili` / `zhihu` / `douban` RSS 至 Cloudflare R2 |
| `POST` | `/api/douban/refresh-following` | 手动刷新豆瓣关注列表缓存 |
| `GET` | `/api/feed/:platform` | 获取本地生成的 RSS 2.0 XML（`bilibili` / `zhihu` / `douban` / `bilibili-alt`） |
| `GET` | `/api/data/:platform` | 返回原始结构化 JSON 动态数据（可供 Bilibili-Gate 等脚本调用） |
| `POST` | `/api/feed` | 接收外部推送的动态 JSON 并合并入库 |
| `GET` | `/api/cookies/browsers` | 扫描本机可用的浏览器及配置文件列表 |
| `POST` | `/api/cookies/extract` | 从指定浏览器配置文件提取指定域名 Cookie 并保存至 `.env` |
| `POST` | `/api/cookies/save` | 手动保存指定平台的 Cookie 至 `.env` |
| `GET` | `/api/config` | 获取当前屏蔽词、抓取间隔、自动同步与播放器嵌入配置 |
| `POST` | `/api/config/keywords` | 添加或移除 B 站屏蔽词（`{"action": "add"|"remove", "keyword": "..."}`） |
| `GET` | `/api/logs` | 获取引擎内存环形缓冲区中的最近日志（最多 500 条） |
