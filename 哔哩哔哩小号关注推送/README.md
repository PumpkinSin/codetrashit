# Bilibili 小号关注推送

在 B 站主号的首页上查看小号关注的视频更新，无需来回切换账号。

## 工作原理

```
Zen 浏览器扩展 (小号登录态)  ──抓取动态──►  本地聚合服务 (Node.js)  ◄──拉取数据──  油猴脚本 (主号页面)
```

1. **Zen 浏览器扩展**：用小号登录 Zen 浏览器，扩展后台定时抓取小号的关注动态
2. **本地聚合服务**：Node.js 服务接收并去重存储视频数据（内存中，关闭即清空）
3. **油猴脚本**：在 B 站首页的 [Bilibili-Gate](https://github.com/magicdawn/Bilibili-Gate) 中注入独立的「小号」Tab，展示小号视频

## 快速开始

### 1. 启动聚合服务

双击 `bilibili-aggregator/启动聚合服务.bat`，或手动运行：

```bash
node bilibili-aggregator/server.js
```

服务监听 `http://127.0.0.1:8080`。

### 2. 安装浏览器扩展

将 `zen-bilibili-scraper` 目录打包为 zip，在 Zen 浏览器（或 Firefox）中加载。用小号登录 B 站后，扩展会自动定时抓取动态。

点击扩展图标可配置：
- 抓取间隔（建议 ≥ 20 分钟）
- 最大翻页数
- 翻页延迟

### 3. 安装油猴脚本

需要先安装 [Bilibili-Gate](https://github.com/magicdawn/Bilibili-Gate) 扩展。

然后在 Tampermonkey / Violentmonkey 中安装 `bilibili-alt-tab.user.js`。

打开 B 站首页，Tab 栏会出现「小号」标签，点击即可查看小号的视频更新。

## 项目结构

```
├── bilibili-aggregator/       # 本地聚合服务
│   ├── server.js              # Node.js 服务端
│   └── 启动聚合服务.bat        # 一键启动脚本
├── zen-bilibili-scraper/      # 浏览器扩展（Zen/Firefox）
│   ├── manifest.json
│   ├── background.js          # 后台抓取逻辑
│   ├── popup.html             # 配置界面
│   └── popup.js
└── bilibili-alt-tab.user.js   # 油猴脚本（注入小号 Tab）
```

## 致谢

- UI 适配基于 [Bilibili-Gate](https://github.com/magicdawn/Bilibili-Gate) (MIT License)
