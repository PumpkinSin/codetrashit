# 🍪 RSS 订阅 Cookie 提取器

由于各大平台的验证 Cookie（如 B站的 `SESSDATA`、知乎的 `d_c0` 等）大都采用 `HttpOnly` 标记，导致普通的网页 JS 或书签脚本（Bookmarklet）无法读取。

为了方便快速提取并生成 `.env` 格式的配置，本项目提供了一个极简的浏览器扩展。

## 适用浏览器

支持所有基于 Chromium 的浏览器（Chrome、Edge、Brave、Arc 等）和 Firefox 浏览器。

## 安装步骤

### Chrome / Edge (Chromium 内核)

1. 打开浏览器扩展管理页面
   - Chrome: 访问 `chrome://extensions/`
   - Edge: 访问 `edge://extensions/`
2. 开启右上角的 **“开发者模式”**（Developer mode）
3. 点击 **“加载已解压的扩展程序”**（Load unpacked）
4. 选择本项目目录下的 `tools/cookie-ext` 文件夹

### Firefox (火狐浏览器)

1. 访问 Firefox 调试页面：`about:debugging#/runtime/this-firefox`
2. 点击 **“临时载入附加组件...”**（Load Temporary Add-on...）
3. 选择本项目目录下的 `tools/cookie-ext-firefox/manifest.json` 文件
*(注：由于 Firefox 的安全策略，临时载入的扩展在浏览器重启后会失效，需重新载入。如果你需要持久使用，需要通过 Mozilla Add-ons 签名)*

## 使用方法

1. 确保你已经在浏览器中登录了 B站、知乎、豆瓣 这三个网站。
2. 点击浏览器工具栏中刚刚安装的 **“提取 Cookie”** 插件图标（如果没看到，请点击工具栏的拼图图标把它固定出来）。
3. 点击面板里的 **“提取并复制到剪贴板”** 按钮。
4. 打开你的 `server/.env` 文件，直接粘贴覆盖原本的 `BILIBILI_SESSDATA`、`ZHIHU_COOKIE`、`DOUBAN_COOKIE` 即可！
