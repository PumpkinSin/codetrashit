# -*- coding: utf-8 -*-
"""阶段 1:PDF 前处理——文本层检测分流、扫描页渲染、目录书签提取。"""
import argparse
from pathlib import Path

import pymupdf
import pymupdf4llm

from common import ROOT, get_logger, save_json

log = get_logger("01_render")

TEXT_CHAR_MIN = 50          # 少于 50 个可提取字符视为扫描页
SCAN_DPI = 200


def classify_page(page) -> str:
    text = page.get_text("text").strip()
    return "text" if len(text) >= TEXT_CHAR_MIN else "scan"


def run(pdf_path: Path, work: Path):
    import shutil
    pages_dir = (work / "pages").resolve()
    pages_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    toc = doc.get_toc()

    # pymupdf4llm internally replaces spaces in image_path with underscores;
    # use a space-free staging dir when pages_dir contains spaces.
    stage_dir = pages_dir
    if " " in str(pages_dir):
        stage_dir = (ROOT / "data" / f"tmp_render_{abs(hash(str(pages_dir)))}").resolve()
        stage_dir.mkdir(parents=True, exist_ok=True)

    # 文本层页:用 pymupdf4llm 批量抽取 per-page markdown(含图片导出)
    chunks = pymupdf4llm.to_markdown(
        str(pdf_path),
        page_chunks=True,
        write_images=True,
        image_path=str(stage_dir),
        image_format="png",
        image_size_limit=0.0,   # 不缩放,保留原始嵌入图
    )
    if stage_dir != pages_dir:
        for f in stage_dir.iterdir():
            if f.is_file():
                shutil.move(str(f), str(pages_dir / f.name))
        try:
            stage_dir.rmdir()
        except Exception:
            pass
    chunk_by_page = {}
    for ch in chunks:
        pno = ch.get("metadata", {}).get("page_number")
        if pno is None:
            continue
        chunk_by_page[pno - 1] = ch   # page_number 为 1 基

    manifest_pages = []
    for pno in range(len(doc)):
        page = doc[pno]
        ptype = classify_page(page)
        entry = {"n": pno + 1, "type": ptype}   # n 为 1 基页码
        if ptype == "scan":
            pix = page.get_pixmap(matrix=pymupdf.Matrix(SCAN_DPI / 72, SCAN_DPI / 72), alpha=False)
            img_path = work / "pages" / f"p{pno + 1:04d}.png"
            pix.save(img_path)
            entry["png"] = str(img_path.relative_to(work))
            entry["w"], entry["h"] = pix.width, pix.height
        else:
            ch = chunk_by_page.get(pno, {})
            entry["md_text"] = ch.get("text", "")
            imgs = ch.get("images", [])
            rel = []
            for i in imgs:
                ip = i.get("image_path") or ""
                if stage_dir != pages_dir and ip:
                    moved = pages_dir / Path(ip).name
                    if moved.exists():
                        ip = str(moved)
                try:
                    rel.append({**i, "path": str(Path(ip).relative_to(work)) if ip and Path(ip).exists() else None})
                except ValueError:
                    rel.append({**i, "path": None})
            entry["md_images"] = rel
        manifest_pages.append(entry)

    manifest = {
        "pdf": str(pdf_path.resolve()),
        "title": (doc.metadata or {}).get("title") or pdf_path.stem,
        "dpi": SCAN_DPI,
        "pages": manifest_pages,
        "toc": toc,
    }
    save_json(work / "manifest.json", manifest)
    n_text = sum(1 for p in manifest_pages if p["type"] == "text")
    log.info("完成:%d 页(文本层 %d / 扫描 %d),书签 %d 条",
             len(manifest_pages), n_text, len(manifest_pages) - n_text, len(toc))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="PDF 路径")
    ap.add_argument("--work", default=None, help="工作目录,默认 work/<书名>")
    args = ap.parse_args()
    pdf = Path(args.pdf)
    name = args.work or (ROOT / "work" / pdf.stem)
    run(pdf, Path(name))
