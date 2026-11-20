# -*- coding: utf-8 -*-
"""EPUB -> 中文版 / 双语对照 EPUB 翻译管线（免 OCR，直接保真解析/重建 HTML）。

用法:
  python pipeline/epub_translate.py prepare --epub "<EPUB路径>" --work work/<书名>
  python pipeline/epub_translate.py verify  --work work/<书名>
  python pipeline/epub_translate.py build   --work work/<书名> --mode bilingual|zh --out "<输出名>"
"""
import argparse
import html as html_lib
import re
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag
import ebooklib
from ebooklib import epub

from common import OUTPUT_DIR, ROOT, get_logger, load_json, save_json

log = get_logger("epub_translate")

BLOCK_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote"}

EXTRA_CSS = """
.zh { color: #3a3a3a; font-size: 0.94em; margin-top: 0.35em; margin-bottom: 0.8em; text-indent: 0; }
.zh-heading { color: #222; margin-top: 0.25em; margin-bottom: 0.6em; }
"""


def is_leaf_block(tag: Tag) -> bool:
    """判断是否为最内层块级元素（内部不再嵌套 BLOCK_TAGS）。"""
    if tag.name in BLOCK_TAGS:
        return not any(isinstance(c, Tag) and c.name in BLOCK_TAGS for c in tag.descendants)
    if tag.name == "div":
        if any(isinstance(c, Tag) and (c.name in BLOCK_TAGS or c.name == "div") for c in tag.descendants):
            return False
        return bool(tag.get_text(strip=True))
    return False


def iter_leaf_blocks(body: Tag):
    """按文档顺序遍历 body 下的全部最内层文本块。"""
    for el in body.descendants:
        if isinstance(el, Tag) and is_leaf_block(el):
            if el.get_text(" ", strip=True):
                yield el


def serialize_inline(node, fn_list: list, page_anchors: list) -> str:
    """把块内 HTML 节点转为带 _斜体_ / **粗体** / [[fn:k]] 占位符的纯文本。"""
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name == "br":
        return "\n"
    if node.name == "a":
        # 页码锚点（无文本且 id 以 page 开头）
        aid = node.get("id", "")
        if not node.get_text(strip=True) and aid:
            page_anchors.append(str(node))
            return ""
        # 脚注/内链（保留完整 <a> 标签以便原样恢复）
        if node.get("href"):
            idx = len(fn_list) + 1
            fn_list.append(str(node))
            return f"[[fn:{idx}]]"
    inner = "".join(serialize_inline(c, fn_list, page_anchors) for c in node.children)
    if node.name in ("em", "i"):
        s = inner.strip()
        return f" _{s}_ " if s else ""
    if node.name in ("strong", "b"):
        s = inner.strip()
        return f" **{s}** " if s else ""
    if node.name == "sup":
        return f"^{inner}^" if inner.strip() and not inner.strip().startswith("[[fn:") else inner
    return inner


def clean_text(s: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.splitlines()]
    return "\n".join(ln for ln in lines if ln).strip()


def md_to_inline_html(text: str, fn_list: list) -> str:
    """把译文中的 [[fn:k]]、_斜体_、**粗体**、换行转回 HTML。"""
    # 先转义 HTML 特殊字符
    out = html_lib.escape(text, quote=False)
    # 恢复换行
    out = out.replace("\n", "<br/>")
    # **粗体** 与 _斜体_
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])", r"<em>\1</em>", out)
    # 恢复 [[fn:k]]
    def repl_fn(m):
        idx = int(m.group(1)) - 1
        return fn_list[idx] if 0 <= idx < len(fn_list) else m.group(0)
    out = re.sub(r"\[\[fn:(\d+)\]\]", repl_fn, out)
    return out


def cmd_prepare(epub_path: Path, work: Path):
    book = epub.read_epub(str(epub_path))
    src_dir = work / "translations" / "src"
    zh_dir = work / "translations" / "zh"
    src_dir.mkdir(parents=True, exist_ok=True)
    zh_dir.mkdir(parents=True, exist_ok=True)

    # 收集 TOC 标题映射 href -> title
    toc_titles = {}
    def walk_toc(toc):
        for it in toc:
            if isinstance(it, tuple):
                sec, children = it
                toc_titles[sec.href.split("#")[0]] = sec.title
                walk_toc(children)
            else:
                toc_titles[it.href.split("#")[0]] = it.title
    walk_toc(book.toc)

    plan = []
    idx = 0
    for item_id, _ in book.spine:
        item = book.get_item_with_id(item_id)
        if not item:
            continue
        soup = BeautifulSoup(item.get_content(), "html.parser")
        if not soup.body:
            continue
        blocks = list(iter_leaf_blocks(soup.body))
        if not blocks:
            continue

        ch_id = f"ch{idx:02d}"
        idx += 1
        units_lines = []
        meta = []
        for u_idx, blk in enumerate(blocks, 1):
            fn_list, page_anchors = [], []
            raw = "".join(serialize_inline(c, fn_list, page_anchors) for c in blk.children)
            txt = clean_text(raw)
            if not txt:
                continue
            uid = len(meta) + 1
            units_lines.append(f"[{uid}]")
            units_lines.append(txt)
            units_lines.append("")
            meta.append({"id": uid, "tag": blk.name, "fns": fn_list, "anchors": page_anchors})

        if not meta:
            continue
        (src_dir / f"{ch_id}.units.md").write_text("\n".join(units_lines), encoding="utf-8")
        save_json(src_dir / f"{ch_id}.meta.json", meta)

        title = toc_titles.get(item.file_name, Path(item.file_name).stem)
        plan.append({
            "ch": ch_id,
            "file_name": item.file_name,
            "title": title,
            "title_zh": title,
            "title_bilingual": title,
            "skip": False,
            "units": len(meta),
            "src": f"translations/src/{ch_id}.units.md",
            "out": f"translations/zh/{ch_id}.txt",
        })

    save_json(work / "translations" / "plan.json", plan)
    save_json(work / "manifest.json", {
        "epub": str(epub_path),
        "title": (book.get_metadata("DC", "title")[0][0] if book.get_metadata("DC", "title") else work.name),
    })

    spec = [
        "# EPUB 翻译任务规范（每个子代理都要遵守）",
        "",
        "## 输入/输出",
        "- 输入: translations/src/chXX.units.md，每个待译单元以 `[编号]` 开头",
        "- 输出: translations/zh/chXX.txt，格式 `[编号] 译文`（多行译文直到下一个 `[编号]` 为止）",
        "- 编号与单元一一对应，严禁合并/拆分/遗漏",
        "- **重要**：原文中的 `[[fn:1]]`、`[[fn:2]]` 等脚注/内链占位符必须在译文对应位置**原样保留**！",
        "",
        "## 风格",
        "- 简体中文，全角标点；历史学术散文体，典雅流畅，不逐词硬译",
        "- 人名首次出现附原文括注，如 Bernard Bailyn（伯纳德·贝林）；后文可只用中文",
        "- 书名/期刊名保留英文并保住斜体标记 `_..._`；原文中的 `_斜体_` / `**粗体**` 在译文中对应保留",
        "- 注释（Notes）中的文献条目：保留作者、英文书名/篇名（`_..._`）与出版信息，仅翻译导语、评述性文字及页码/卷期等必要说明",
    ]
    (work / "translations" / "SPEC.md").write_text("\n".join(spec), encoding="utf-8")

    log.info("拆章完成: %d 章, 共 %d 个单元", len(plan), sum(p["units"] for p in plan))
    for p in plan:
        log.info("  %s %-55s units=%d", p["ch"], p["title"][:55], p["units"])


def parse_zh_txt(path: Path) -> dict:
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


def cmd_verify(work: Path):
    plan = load_json(work / "translations" / "plan.json")
    zh_dir = work / "translations" / "zh"
    bad = 0
    for p in plan:
        if p.get("skip"):
            continue
        zf = zh_dir / f"{p['ch']}.txt"
        if not zf.exists():
            log.warning("  %s %-45s 缺失: ALL (%d units)", p["ch"], p["title"][:45], p["units"])
            bad += 1
            continue
        zh_map = parse_zh_txt(zf)
        missing = [i for i in range(1, p["units"] + 1) if i not in zh_map]
        if missing:
            log.warning("  %s %-45s 缺失 %d/%d: %s", p["ch"], p["title"][:45],
                        len(missing), p["units"], missing[:10])
            bad += 1
    if bad == 0:
        log.info("对账: 全部 %d 章完整, 可组装", len([p for p in plan if not p.get("skip")]))
    else:
        log.info("对账: %d/%d 章完整, %d 章有问题",
                 len(plan) - bad, len(plan), bad)


def cmd_build(work: Path, mode: str, out_name: str | None = None):
    manifest = load_json(work / "manifest.json")
    plan = load_json(work / "translations" / "plan.json")
    plan_by_file = {p["file_name"]: p for p in plan}
    src_dir = work / "translations" / "src"
    zh_dir = work / "translations" / "zh"

    book = epub.read_epub(manifest["epub"])
    base_title = manifest.get("title") or work.name
    suffix = "(双语对照)" if mode == "bilingual" else "(中文版)"
    book.set_title(f"{base_title} {suffix}")
    if mode == "zh":
        book.set_language("zh-CN")

    # 追加 CSS 样式
    for css_item in book.get_items_of_type(ebooklib.ITEM_STYLE):
        css_item.set_content(css_item.get_content() + EXTRA_CSS.encode("utf-8"))

    # 中文版替换封面与扉页图（若存在 work/zh_images/<name>）
    zh_img_dir = work / "zh_images"
    if mode == "zh" and zh_img_dir.exists():
        for im in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            cand = zh_img_dir / Path(im.file_name).name
            if cand.exists():
                im.set_content(cand.read_bytes())

    # 替换各章节 HTML
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        entry = plan_by_file.get(item.file_name)
        if not entry or entry.get("skip"):
            continue
        zf = zh_dir / f"{entry['ch']}.txt"
        if not zf.exists():
            continue
        zh_map = parse_zh_txt(zf)
        meta = load_json(src_dir / f"{entry['ch']}.meta.json")
        soup = BeautifulSoup(item.get_content(), "html.parser")
        if not soup.body:
            continue
        blocks = [b for b in iter_leaf_blocks(soup.body) if b.get_text(" ", strip=True)]
        # 只匹配有非空序列化文本的块（与 prepare 保持一致）
        valid_blocks = []
        for blk in blocks:
            fn_tmp, anc_tmp = [], []
            raw = "".join(serialize_inline(c, fn_tmp, anc_tmp) for c in blk.children)
            if clean_text(raw):
                valid_blocks.append(blk)

        if len(valid_blocks) != len(meta):
            log.warning("%s 块数不匹配 (%d vs %d), 跳过修改", entry["ch"], len(valid_blocks), len(meta))
            continue

        for blk, m_info in zip(valid_blocks, meta):
            zh_txt = zh_map.get(m_info["id"], "")
            if not zh_txt:
                continue
            inline_html = md_to_inline_html(zh_txt, m_info["fns"])
            if mode == "zh":
                anchors_html = "".join(m_info["anchors"])
                blk.clear()
                frag = BeautifulSoup(anchors_html + inline_html, "html.parser")
                for child in list(frag.contents):
                    blk.append(child)
            else:
                cls = "zh zh-heading" if blk.name.startswith("h") else "zh"
                zh_tag = soup.new_tag("div", attrs={"class": cls})
                if blk.name.startswith("h"):
                    inner = soup.new_tag(blk.name)
                    frag = BeautifulSoup(inline_html, "html.parser")
                    for child in list(frag.contents):
                        inner.append(child)
                    zh_tag.append(inner)
                else:
                    p_tag = soup.new_tag("p")
                    frag = BeautifulSoup(inline_html, "html.parser")
                    for child in list(frag.contents):
                        p_tag.append(child)
                    zh_tag.append(p_tag)
                blk.insert_after(zh_tag)

        item.set_content(str(soup).encode("utf-8"))

    # 更新 TOC 标题
    def update_toc(toc):
        for it in toc:
            if isinstance(it, tuple):
                sec, children = it
                p = plan_by_file.get(sec.href.split("#")[0])
                if p:
                    sec.title = p["title_zh"] if mode == "zh" else p["title_bilingual"]
                update_toc(children)
            else:
                p = plan_by_file.get(it.href.split("#")[0])
                if p:
                    it.title = p["title_zh"] if mode == "zh" else p["title_bilingual"]
    update_toc(book.toc)

    name = out_name or f"{base_title} {suffix}"
    out_path = OUTPUT_DIR / f"{name}.epub"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(out_path), book, {"raise_exceptions": True})
    log.info("EPUB 已生成: %s (%.2f MB, %s 模式)",
             out_path, out_path.stat().st_size / 1e6, mode)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_prep = sub.add_parser("prepare")
    p_prep.add_argument("--epub", required=True)
    p_prep.add_argument("--work", required=True)

    p_ver = sub.add_parser("verify")
    p_ver.add_argument("--work", required=True)

    p_bld = sub.add_parser("build")
    p_bld.add_argument("--work", required=True)
    p_bld.add_argument("--mode", default="bilingual", choices=["bilingual", "zh"])
    p_bld.add_argument("--out", default=None)

    args = ap.parse_args()
    if args.cmd == "prepare":
        cmd_prepare(Path(args.epub), ROOT / args.work)
    elif args.cmd == "verify":
        cmd_verify(ROOT / args.work)
    elif args.cmd == "build":
        cmd_build(ROOT / args.work, args.mode, args.out)
