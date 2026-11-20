# 历史旧版本归档 (Old Legacy Archive)

> [!NOTE]
> 本目录为项目早期版本（Node.js + Python Tkinter）的代码归档，仅作为历史参考保留。
> **当前实际运行的系统已全面重构为 Rust 高性能引擎 + Flutter 现代桌面端**，无需使用此目录下的任何脚本或服务。

---

## 📁 归档内容说明

| 目录/文件 | 原始用途 | 现状与替代 |
| :--- | :--- | :--- |
| `server/` | 基于 Node.js (Express + Axios) 的旧版抓取服务 | 已被根目录下的 `rust_engine` 完全替代（内存占用降低 90%，单文件独立二进制运行，无需 Node.js 环境） |
| `gui.py` | 基于 Python Tkinter 的旧版控制面板 | 已被 `flutter_ui` 现代化桌面端替代（支持 Windows 系统托盘、开机自启、状态监视、一键提取 Cookies） |
| `bilibili-gate-小号/` | B 站小号代理与动态提取脚本 | 已内置于 Rust 引擎与 Flutter 界面的多账号管理中 |
| `tools/` | 手动提取 Cookie 的浏览器小扩展（Chrome/Firefox） | 已被内置的本地浏览器 Cookie 自动提取与失效自动刷新算法替代，无需手动装扩展 |
| `start.bat` / `stop.bat` / `start-gui.bat` | 旧版本的启动与停止批处理脚本 | 已废弃，现使用根目录下的 `start-desktop.bat` 或 `start-engine.bat` |
| `legacy_original_backup/` | 早期最原始的项目备份存档 | 仅用于历史追踪 |

---

## ⚠️ 注意事项

1. **请勿启动**此目录下的 `server/server.js` 或 `gui.py`，避免与新版 Rust 引擎（端口 3457）发生端口冲突或重复写入。
2. 新系统的完整代码与可运行程序请参阅项目根目录下的 [README.md](../README.md)。
