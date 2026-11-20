# -*- coding: utf-8 -*-
"""阶段 5:EPUB3 构建——章节切分、Pandoc 转换、脚注 aside 化、打包。"""
import argparse
import re
import subprocess
from pathlib import Path

from bs4 import BeautifulSoup, Comment
from common import OUTPUT_DIR, PANDOC_EXE, ROOT, get_logger, load_json

log = get_logger("05_epub")

EPUB_CSS = """
body { font-family: serif; line-height: 1.7; margin: 1em; }
h1, h2, h3 { line-height: 1.3; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 0.8em auto; font-size: 0.92em; }
td, th { border: 1px solid #8a8a8a; padding: 3pt 7pt; }
aside.footnote { font-size: 0.9em; color: #333; margin: 0.6em 0; }
sup a { text-decoration: none; }
figure { margin: 1em 0; text-align: center; }
figcaption { font-size: 0.88em; color: #555; }
"""

PB_TOKEN = re.compile(r'<span epub:type="pagebreak" title="(\d+)"></span>')


def pandoc_md_to_html(md_text: str) -> str:
    p = subprocess.run(
        [str(PANDOC_EXE), "-f",
         "markdown+footnotes+pipe_tables+tex_math_dollars+raw_html+east_asian_line_breaks",
         "-t", "html", "--mathml", "--wrap=none"],
        input=md_text.encode("utf-8"), capture_output=True)
    if p.returncode != 0:
        log.error("pandoc 失败:%s", p.stderr.decode("utf-8", "ignore")[:500])
        return ""
    return p.stdout.decode("utf-8")


def split_pages(book_md: str):
    """按 pagebreak 标记切分每页的 markdown。"""
    parts = PB_TOKEN.split(book_md)
    pages = {}
    for i in range(1, len(parts), 2):
        page_no = int(parts[i])
        pages[page_no] = parts[i + 1]
    return pages


def strip_footnote_defs(md_text: str):
    pat = re.compile(r"^\[\^fn\d+\]:.*$", re.M)
    defs = pat.findall(md_text)
    return pat.sub("", md_text), defs


def html_to_asides(html: str, id_base: int = 0):
    """pandoc 脚注 -> EPUB3 aside(弹窗脚注)。id_base 用于跨章全局唯一 ID。"""
    soup = BeautifulSoup(html, "html.parser")
    # 剔除注释:ebooklib 生成 nav 页码列表时会在注释节点上崩(其 .get 忽略默认值返回 None)
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
    if id_base:
        for a in soup.select('a[href^="#fn"]'):
            a["href"] = re.sub(r"#fn(ref)?(\d+)$",
                               lambda m: f"#fn{m.group(1) or ''}{id_base + int(m.group(2))}",
                               a["href"])
            if a.get("id", "").startswith("fn"):
                a["id"] = re.sub(r"fn(ref)?(\d+)$",
                                 lambda m: f"fn{m.group(1) or ''}{id_base + int(m.group(2))}",
                                 a["id"])
        for el in soup.select('[id^="fn"]'):
            el["id"] = re.sub(r"fn(ref)?(\d+)$",
                              lambda m: f"fn{m.group(1) or ''}{id_base + int(m.group(2))}",
                              el["id"])
    # noteref
    for a in soup.select("a.footnote-ref"):
        a["epub:type"] = "noteref"
        if a.find("sup") is None and a.string:
            new_sup = soup.new_tag("sup")
            new_sup.string = a.string
            a.clear()
            a.append(new_sup)
    # 脚注列表 -> aside(pandoc 3.x 输出 section,旧版为 div)
    wrapper = soup.select_one("section.footnotes") or soup.select_one("div.footnotes")
    asides = []
    if wrapper:
        for li in wrapper.select("ol li"):
            fid = li.get("id")
            for back in li.select("a.footnote-back"):
                back.decompose()
            aside = soup.new_tag("aside")
            aside["epub:type"] = "footnote"
            if fid:
                aside["id"] = fid
            for child in list(li.children):
                aside.append(child.extract())
            asides.append(aside)
        wrapper.decompose()
    return str(soup), asides


def build_chapters(manifest, pages_md):
    """按书签切章;无书签时每 20 页一章。"""
    toc = manifest.get("toc") or []
    chapters = []
    if toc:
        level1 = [(t, int(pg)) for lvl, t, pg in toc if int(lvl) == 1]
        if not level1:
            level1 = [(t, int(pg)) for lvl, t, pg in toc]
        for i, (title, start) in enumerate(level1):
            end = level1[i + 1][1] - 1 if i + 1 < len(level1) else max(pages_md)
            chapters.append({"title": title, "from": start, "to": max(start, end)})
        first = chapters[0]["from"]
        if first > 1:
            chapters.insert(0, {"title": "卷首", "from": 1, "to": first - 1})
    else:
        maxp = max(pages_md)
        for s in range(1, maxp + 1, 20):
            chapters.append({"title": f"第 {s}–{min(s + 19, maxp)} 页",
                             "from": s, "to": min(s + 19, maxp)})
    for ch in chapters:
        ch["pages"] = [n for n in range(ch["from"], ch["to"] + 1) if n in pages_md]
        ch["md"] = "\n\n".join(
            f'<span epub:type="pagebreak" title="{n}"></span>\n\n' + pages_md[n]
            for n in ch["pages"])
        if not ch["md"].strip():
            ch["md"] = "*(本章内容为空——可能是扫描页识别失败或留白页)*"
    return chapters


def main(work: Path, out_name: str | None = None, language: str = "zh-CN",
         title_override: str | None = None):
    import ebooklib
    from ebooklib import epub

    manifest = load_json(work / "manifest.json")
    book_md = (work / "book.md").read_text(encoding="utf-8")
    footnotes = load_json(work / "footnotes.json")
    title = out_name or work.name
    book_title = title_override or manifest.get("title") or title

    pages_md = split_pages(book_md)
    chapters = build_chapters(manifest, pages_md)
    log.info("章节:%s", [(c["title"], c["from"], c["to"]) for c in chapters])

    book = epub.EpubBook()
    book.set_identifier(f"paddleocr-epub-{work.name}")
    book.set_title(book_title)
    book.set_language(language)

    css = epub.EpubItem(uid="style", file_name="style/main.css",
                        media_type="text/css", content=EPUB_CSS.encode("utf-8"))
    book.add_item(css)

    # 图片
    assets = (work / "book_assets")
    for img in assets.glob("*.png"):
        book.add_item(epub.EpubItem(
            uid=f"img_{img.stem}", file_name=f"book_assets/{img.name}",
            media_type="image/png", content=img.read_bytes()))

    # 封面:第 1 页渲染
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

    epub_chapters = []
    fn_id_base = 0
    for i, ch in enumerate(chapters):
        md_text = ch["md"]
        # 补上本章页码范围内的脚注定义(pandoc 需要 defs 才能生成脚注结构)
        defs = [e for e in footnotes if ch["from"] <= e["page"] <= ch["to"]]
        if defs:
            md_text += "\n\n" + "\n\n".join(f"[^{e['id']}]: {e['text']}" for e in defs)
        html = pandoc_md_to_html(md_text)
        body_html, asides = html_to_asides(html, id_base=fn_id_base)
        fn_id_base += len(asides)
        if asides:
            body_html = body_html.replace("</body>", "")
            body_html += "".join(str(a) for a in asides)
        item = epub.EpubHtml(title=ch["title"], file_name=f"chap_{i:02d}.xhtml",
                             lang=language)
        item.content = (f'<html><head><link rel="stylesheet" href="style/main.css"/>'
                        f"</head><body>{body_html}</body></html>").encode("utf-8")
        item.add_item(css)
        book.add_item(item)
        epub_chapters.append(item)

    book.toc = epub_chapters
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["cover", "nav"] + epub_chapters

    out_path = OUTPUT_DIR / f"{title}.epub"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(out_path), book, {"raise_exceptions": True})
    log.info("EPUB 已生成:%s(%.1f MB,%d 章)",
             out_path, out_path.stat().st_size / 1e6, len(chapters))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", default=None, help="输出文件名(不含扩展名)")
    ap.add_argument("--title", default=None, help="EPUB 书名(默认取 PDF 元数据)")
    ap.add_argument("--lang", default="zh-CN")
    args = ap.parse_args()
    main(ROOT / args.work, args.out, args.lang, args.title)
