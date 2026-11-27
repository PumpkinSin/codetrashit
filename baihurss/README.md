# baihurss

面向 **白虎面板（Baihu Panel）+ 软路由 / 轻量 Linux** 的 B 站（仅视频投稿）与知乎（全部动态）手动名单 RSS 生成器 + 通用推送服务端 + Bilibili-Gate「个人推送」油猴脚本。

## 架构概览

1. **CookieCloud 服务端**（`8088`）：浏览器安装 CookieCloud 扩展，端到端加密同步 `bilibili.com` / `zhihu.com` 的登录 Cookie。
2. **白虎定时脚本（`baihu_scripts/`）**：
   - 仅抓取 `sources.yaml` 中手动维护的 UP 主 / 知乎答主链接，不抓账号关注流；
   - **分批游标轮询（Cursor Batching）+ 随机间隔**，极大降低风控概率；
   - B 站采用 WBI 签名投稿视频接口（仅视频，无动态/图文），知乎参考最新 RSSHub 规则清洗跳转外链与图片防盗链；
   - 有新内容时自动生成标准 RSS 2.0 XML 上传至 Cloudflare R2（纯 Python 实现 AWS S3 SigV4，零 `boto3` 依赖），并同步推送精简索引到 `push-server`。
3. **通用推送服务端（`push_server/`，`3457`）**：
   - 零第三方依赖、极轻量（~18 MB 内存），支持任意频道读写：
     - `POST /api/push/<channel>`
     - `GET  /api/feed/<channel>`
4. **「个人推送」油猴脚本（`userscript/bilibili-gate-personal-push.user.js`）**：
   - 在最新版 `magicdawn/Bilibili-Gate` 中注入「个人推送」Tab；
   - 运行时复用 Bilibili-Gate 原生视频卡片 DOM/样式，并根据 BV 号实时拉取 B 站最新播放量、弹幕数、时长与发布时间。

## 目录结构

```text
baihurss/
├── baihu_scripts/
│   ├── cookiecloud_client.py   # CookieCloud 客户端（AES-256-CBC 解密）
│   ├── rss_sync.py             # B站 + 知乎分批抓取、R2 上传与推送主脚本
│   └── sources.example.yaml    # 订阅名单示例（复制为 sources.yaml 使用）
├── push_server/
│   ├── push_server.py          # 通用频道推送服务端
│   └── Dockerfile
└── userscript/
    └── bilibili-gate-personal-push.user.js
```

## 环境变量（在白虎「变量机密」中配置）

| 变量名 | 说明 |
| --- | --- |
| `COOKIECLOUD_URL` | CookieCloud 服务地址，如 `http://192.168.31.2:8088` |
| `COOKIECLOUD_UUID` | CookieCloud UUID |
| `COOKIECLOUD_PASSWORD` | CookieCloud 加密密码 |
| `CF_ACCOUNT_ID` / `R2_BUCKET_NAME` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_URL` | Cloudflare R2 配置 |
| `RSS_BILIBILI_KEY` / `RSS_ZHIHU_KEY` | 上传到 R2 的 XML 文件名（默认 `bilibili.xml` / `zhihu.xml`） |
| `PUSH_SERVER_URL` | 推送服务端地址，如 `http://192.168.31.2:3457` |
| `BILI_BATCH_SIZE` / `ZHIHU_BATCH_SIZE` | 每批抓取人数（默认 `8` / `4`） |
| `TG_BOT_TOKEN` / `TG_USER_ID` | 可选，Cookie 过期或风控时发送 Telegram 告警 |
