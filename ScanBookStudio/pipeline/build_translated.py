# -*- coding: utf-8 -*-
"""译文组装器:把逐章译文(book.md + translations/zh/chXX.txt)打包成 EPUB。

模式:
  --mode bilingual  段落交错双语(译文套 ::: zh 围栏 div,灰色小字号)
  --mode zh         纯中文(结构元素与未翻译章节保留原文)

复用 05_build_epub 的 pandoc 转换、脚注 aside 化、ebooklib 打包。
"""
import argparse
import importlib
import re
from pathlib import Path

from common import OUTPUT_DIR, ROOT, get_logger, load_json, save_json

log = get_logger("build_translated")

m05 = importlib.import_module("05_build_epub")
mtr = importlib.import_module("translate")

EXTRA_CSS = """
div.zh { color: #4a4a4a; font-size: 0.92em; margin-top: 0.35em; }
div.zh p { margin: 0.35em 0; }
div.img-text { font-size: 0.85em; color: #555; border-top: 1px dotted #999; padding-top: 0.3em; }
"""


def parse_zh_txt(path: Path) -> dict:
    """[编号] 译文(可多行)-> {idx: text}。"""
    out = {}
    cur, buf = None, []
    for ln in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\[(\d+)\]\s*(.*)$", ln)
        if m:
            if cur is not None:
                out[cur] = "\n".join(buf).strip()
            cur, buf = int(m.group(1)), [m.group(2)]
        elif cur is not None:
            buf.append(ln)
    if cur is not None:
        out[cur] = "\n".join(buf).strip()
    return {k: v for k, v in out.items() if v}


def rebuild_chapter(ch_md: str, zh_map: dict, mode: str, img_zh: dict,
                    assets_dir: Path | None = None) -> str:
    """按确定性块切分重建章节:双语 = 原块 + ::: zh 译文块;zh = 只留译文。"""
    out = []
    uid = 0
    for kind, text in mtr.split_blocks(ch_md):
        if kind == "pagebreak" or kind == "fndef":
            out.append(text)
            out.append("")
            continue
        if kind == "image":
            out.append(text)
            out.append("")
            m = re.search(r"\(([^)]+)\)", text)
            if m:
                fname = Path(m.group(1)).name
                zh_img_name = f"{Path(fname).stem}_zh.png"
                if assets_dir and (assets_dir / zh_img_name).exists():
                    out.append(f"![](book_assets/{zh_img_name})")
                    out.append("")
                else:
                    entry = img_zh.get(fname)
                    if entry:
                        lines = " ".join(entry) if isinstance(entry, list) else str(entry)
                        if lines.strip():
                            out.append("::: {.zh .img-text}")
                            out.append(lines.strip())
                            out.append(":::")
                            out.append("")
            continue
        uid += 1
        zh = zh_map.get(uid, "")
        if kind == "heading":
            lvl = len(re.match(r"^(#{1,6})\s", text).group(1))
            if mode == "zh" and zh:
                out.append("#" * lvl + " " + zh)
            else:
                out.append(text)
                if zh:
                    out.append("::: {.zh .subtitle}")
                    out.append(f"**{zh}**")
                    out.append(":::")
            out.append("")
            continue
        # para / list / table / caption
        if mode == "zh":
            out.append(zh if zh else text)
            out.append("")
        else:
            out.append(text)
            out.append("")
            if zh:
                out.append("::: zh")
                out.append(zh)
                out.append(":::")
                out.append("")
    return "\n".join(out)


def main(work: Path, mode: str = "bilingual", out_name: str | None = None,
         language: str | None = None, title_override: str | None = None):
    import ebooklib
    from ebooklib import epub

    manifest = load_json(work / "manifest.json")
    book_md = (work / "book.md").read_text(encoding="utf-8")
    plan = load_json(work / "translations" / "plan.json")
    zh_dir = work / "translations" / "zh"
    img_zh = {}
    img_file = work / "translations" / "img_zh.json"
    if img_file.exists():
        img_zh = load_json(img_file)

    pages_md = m05.split_pages(book_md)
    chapters = m05.build_chapters(manifest, pages_md)
    assert len(chapters) == len(plan), "章节数与 plan 不一致,请重跑 prepare"

    suffix = "(双语对照)" if mode == "bilingual" else "(中文版)"
    base_title = title_override or manifest.get("title") or work.name
    book_title = f"{base_title} {suffix}"
    name = out_name or f"{work.name}{suffix}"
    lang = language or ("zh-CN" if mode == "zh" else "en")

    epub_chapters, fn_id_base = [], 0
    for i, ch in enumerate(chapters):
        entry = plan[i]
        ch_id = f"ch{i:02d}"
        md_text = ch["md"]
        if not entry["skip"]:
            zh_file = zh_dir / f"{ch_id}.txt"
            zh_map = parse_zh_txt(zh_file) if zh_file.exists() else {}
            if zh_map:
                md_text = rebuild_chapter(ch["md"], zh_map, mode, img_zh,
                                          assets_dir=work / "book_assets")
        # 补本章脚注定义(pandoc 需要 defs)
        defs = [e for e in load_json(work / "footnotes.json")
                if ch["from"] <= e["page"] <= ch["to"]]
        if defs:
            md_text += "\n\n" + "\n\n".join(f"[^{e['id']}]: {e['text']}" for e in defs)

        html = m05.pandoc_md_to_html(md_text)
        body_html, asides = m05.html_to_asides(html, id_base=fn_id_base)
        fn_id_base += len(asides)
        if asides:
            body_html += "".join(str(a) for a in asides)
        toc_title = (entry.get("title_zh") if mode == "zh" else entry.get("title_bilingual")) or ch["title"]
        item = epub.EpubHtml(title=toc_title, file_name=f"chap_{i:02d}.xhtml",
                             lang=lang)
        item.content = (f'<html><head><link rel="stylesheet" href="style/main.css"/>'
                        f"</head><body>{body_html}</body></html>").encode("utf-8")
        book_add_later = item
        epub_chapters.append(item)

    book = epub.EpubBook()
    book.set_identifier(f"paddleocr-epub-{work.name}-{mode}")
    book.set_title(book_title)
    book.set_language(lang)

    css = epub.EpubItem(uid="style", file_name="style/main.css",
                        media_type="text/css",
                        content=(m05.EPUB_CSS + EXTRA_CSS).encode("utf-8"))
    book.add_item(css)

    for img in (work / "book_assets").glob("*.png"):
        book.add_item(epub.EpubItem(uid=f"img_{img.stem}",
                                    file_name=f"book_assets/{img.name}",
                                    media_type="image/png", content=img.read_bytes()))
    try:
        import pymupdf
        doc = pymupdf.open(manifest["pdf"])
        pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
        cover = work / "book_assets" / "cover.png"
        pix.save(cover)
        book.set_cover("images/cover.png", cover.read_bytes())
        doc.close()
    except Exception as e:
        log.warning("封面生成失败(忽略):%s", e)

    for item in epub_chapters:
        item.add_item(css)
        book.add_item(item)

    book.toc = epub_chapters
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["cover", "nav"] + epub_chapters

    out_path = OUTPUT_DIR / f"{name}.epub"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(out_path), book, {"raise_exceptions": True})
    log.info("EPUB 已生成:%s(%.1f MB,%d 章,%s 模式)",
             out_path, out_path.stat().st_size / 1e6, len(chapters), mode)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--mode", default="bilingual", choices=["bilingual", "zh"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--title", default=None)
    ap.add_argument("--lang", default=None)
    args = ap.parse_args()
    main(ROOT / args.work, args.mode, args.out, args.lang, args.title)
