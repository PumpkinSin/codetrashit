<p align="center">
  <img src="assets/logo.png" width="128" alt="ScanBook Studio Logo" />
</p>

# ScanBook Studio

古籍与扫描书籍图像增强、版面插图提取、PDF 导出（支持矢量路径 / 无损黑白 1-bit / PNG / JPG）与 **EPUB3 识别/翻译** 一体化桌面工具（Flutter + Rust + ONNX DirectML + PaddleOCR-VL）。

---

## 一、 环境准备与安装

### 1. 基础依赖
- **Rust**（用于编译 `rust_core.dll`）
- **Flutter SDK**（Windows 桌面端）
- **Python 3.10+**

### 2. 安装 Python 依赖（推荐创建 `.venv` 虚拟环境）

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 编译 Rust 核心库与运行界面

```bat
cd rust_core
cargo build --release
cd ..
flutter pub get
flutter run -d windows
```

或者构建 Release：

```bat
flutter build windows --release
```

### 4. 模型与外部工具（按需下载，不随仓库打包）

将以下模型放入 `models\` 目录（或在软件「设置 → AI 模型目录」中选择包含它们的任意文件夹/父目录）：
- `pp_doc_layoutv3.onnx`（PP-DocLayoutV3 版面分析：用于智能裁剪、双页中缝识别、插图自动提取）
- `UVDoc_grid.onnx`（UVDoc 曲面展平大模型）
- `PaddleOCR-VL-1.6-GGUF.gguf` 与 `PaddleOCR-VL-1.6-GGUF-mmproj.gguf`（用于 EPUB3 识别）

若使用 EPUB3 生成功能，还需将 `llama-server.exe` 放入 `tools\llamacpp\`、将 `pandoc.exe` 放入 `tools\pandoc\`（或添加到系统 `PATH`）。

---

## 二、 个人配置与隐私隔离说明

- 个人运行配置保存在 `data/app_settings.json`（已加入 `.gitignore`，不会上传至 GitHub）。
- 仓库仅提供无敏感信息的模板 `data/app_settings.example.json`，可复制为 `data/app_settings.json` 或直接在软件「设置」界面填写：

```json
{
  "default_remove_margin_fingers": true,
  "default_remove_edge_black": true,
  "custom_model_dir": "",
  "ai_assist_crop": true,
  "ai_assist_split": true,
  "ai_assist_illustrations": true,
  "translation_api_url": "https://api.openai.com/v1",
  "translation_api_key": "",
  "translation_model": "gpt-4o-mini",
  "translation_concurrency": 4
}
```

---

## 三、 免界面 CLI 调用指南（供外部脚本与 AI 代理直接调用）

无需启动图形界面，直接运行根目录的 `cli.bat`（或 `scanbook_cli.py`）即可完成 **PDF → EPUB3**、**拆章翻译**、**单元对账**、**双语/纯中文 EPUB 组装** 与 **进度查询**。

### 1. PDF → EPUB3（5 阶段完整管线，支持断点续跑）

```bat
cli.bat pdf2epub "path\to\input.pdf" --name 书名 --lang en
```

- `--name`：工作目录与输出文件名（默认取 PDF 文件名）。
- `--lang`：原书语种，`zh-CN`（默认）或 `en`。
- `--ngl`：Vulkan GPU 卸载层数（默认 `99`；若显卡初始化失败可传 `--ngl 0` 改用 CPU）。
- `--model-dir`（全局参数，放在子命令前）：覆盖模型/工具根目录。

输出：`output\<书名>.epub`；中间产物：`work\<书名>\`。

### 2. 翻译与双语 / 纯中文出书

#### 一键全自动翻译（拆章 → API 并发翻译 → 单元对账 → 组装 EPUB3）

```bat
cli.bat translate-all --work work\书名 --mode bilingual
```

- `--mode`：`bilingual`（双语对照）或 `zh`（纯中文）。
- 可选覆盖 API 参数：`--api-url`、`--api-key`、`--model`、`--concurrency`。

#### 分步调用（支持人工或 AI 子代理分章翻译）

```bat
cli.bat translate-prepare --work work\书名
cli.bat translate-api --work work\书名 --batch-size 12
cli.bat translate-verify --work work\书名
cli.bat translate-build --work work\书名 --mode bilingual
```

#### 直接翻译现有 EPUB / 查看进度

```bat
cli.bat translate-epub <透传参数>
cli.bat progress --work work\书名
```
