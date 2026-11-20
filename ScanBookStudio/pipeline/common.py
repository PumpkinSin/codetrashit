# -*- coding: utf-8 -*-
"""共用配置与工具:路径、日志、标签映射、图像辅助函数。"""
import json
import logging
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
TOOLS_DIR = ROOT / "tools"
WORK_DIR = ROOT / "work"
OUTPUT_DIR = ROOT / "output"
SETTINGS_FILE = ROOT / "data" / "app_settings.json"


def _load_custom_model_dir() -> str:
    env_dir = os.environ.get("SCANBOOK_MODEL_DIR", "").strip()
    if env_dir:
        return env_dir
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            return str(data.get("custom_model_dir", "") or "").strip()
        except Exception:
            pass
    return ""


def resolve_asset(rel_candidates: list[str], fallback: Path, exe_name: str | None = None) -> Path:
    bases: list[Path] = []
    custom = _load_custom_model_dir()
    if custom:
        c = Path(custom)
        bases.extend([c, c / "models", c / "model", c / "onnx", c / "tools", c.parent])
    bases.extend([
        ROOT,
        MODELS_DIR,
        TOOLS_DIR,
    ])
    for b in bases:
        for rel in rel_candidates:
            p = b / rel
            if p.exists():
                return p
    if exe_name:
        found = shutil.which(exe_name)
        if found:
            return Path(found)
    return fallback


LLAMA_SERVER = resolve_asset(["llamacpp/llama-server.exe", "tools/llamacpp/llama-server.exe", "llama-server.exe"], TOOLS_DIR / "llamacpp" / "llama-server.exe", "llama-server.exe")
LLAMA_MAIN_GGUF = resolve_asset(["PaddleOCR-VL-1.6-GGUF.gguf", "models/PaddleOCR-VL-1.6-GGUF.gguf"], MODELS_DIR / "PaddleOCR-VL-1.6-GGUF.gguf")
LLAMA_MMPROJ_GGUF = resolve_asset(["PaddleOCR-VL-1.6-GGUF-mmproj.gguf", "models/PaddleOCR-VL-1.6-GGUF-mmproj.gguf"], MODELS_DIR / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf")
PP_DOCLAYOUT_ONNX = resolve_asset(["pp_doc_layoutv3.onnx", "models/pp_doc_layoutv3.onnx", "onnx/pp_doc_layoutv3.onnx"], MODELS_DIR / "pp_doc_layoutv3.onnx")
PANDOC_EXE = resolve_asset(["pandoc/pandoc-3.14/pandoc.exe", "tools/pandoc/pandoc-3.14/pandoc.exe", "pandoc/pandoc.exe", "pandoc.exe"], TOOLS_DIR / "pandoc" / "pandoc-3.14" / "pandoc.exe", "pandoc.exe")

DEFAULT_SERVER_PORT = 8199

# PP-DocLayoutV3 的 25 类标签(运行时会用 ONNX 元数据覆盖,此处仅兜底)
DOCLAYOUT_LABELS = [
    "abstract", "algorithm", "aside_text", "chart", "content", "display_formula",
    "doc_title", "figure_title", "footer", "footer_image", "footnote",
    "formula_number", "header", "header_image", "image", "inline_formula",
    "number", "paragraph_title", "reference", "reference_content", "seal",
    "table", "text", "vertical_text", "vision_footnote",
]

# 哪些区块交给 VL 做 OCR,哪些走专门任务,哪些跳过
VL_PROMPT = {
    "ocr": "OCR:",
    "table": "Table Recognition:",
    "formula": "Formula Recognition:",
    "chart": "Chart Recognition:",
    "seal": "Seal Recognition:",
}
TYPE_TASK = {
    "text": "ocr", "abstract": "ocr", "content": "ocr", "number": "ocr",
    "paragraph_title": "ocr", "doc_title": "ocr", "aside_text": "ocr",
    "footnote": "ocr", "vision_footnote": "ocr", "reference": "ocr",
    "reference_content": "ocr", "vertical_text": "ocr",
    "header": "ocr", "footer": "ocr",
    "figure_title": "ocr", "algorithm": "ocr",
    "table": "table", "display_formula": "formula", "inline_formula": "formula",
    "chart": "chart", "seal": "seal",
    "image": None, "header_image": None, "footer_image": None,
}

TEXT_TYPES = {k for k, v in TYPE_TASK.items() if v == "ocr"}
DROP_TYPES = {"header", "footer", "header_image", "footer_image", "seal"}


def get_logger(name: str) -> logging.Logger:
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    return logging.getLogger(name)


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def book_dirs(name: str):
    """一本书的中间产物目录结构。"""
    w = WORK_DIR / name
    d = {
        "root": w,
        "pages": w / "pages",        # 整页渲染 PNG(扫描页)
        "blocks": w / "blocks",      # 版面块 JSON
        "crops": w / "crops",        # 版面块裁剪图
        "assets": w / "book_assets", # EPUB 用的最终图片
        "qa": w / "qa",
    }
    for p in d.values():
        p.mkdir(parents=True, exist_ok=True)
    return d
