# -*- coding: utf-8 -*-
"""阶段 4:拼装——阅读顺序合成 Markdown、脚注配对、跨页段落合并、页码锚点。"""
import argparse
import re
import shutil
import unicodedata
from pathlib import Path

from common import ROOT, get_logger, load_json, save_json

log = get_logger("04_assemble")

# 页底脚注起始行的常见标记(全角圈号、方括号、上标数字;容忍列表/引用前缀)
FN_MARK = re.compile(r"^\s*(?:[-*>+]\s*)?(?:\d+[.、]\s*)?([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\[\d{1,2}\]|[¹²³⁴⁵⁶⁷⁸⁹])\s*")
CITE_MARK = re.compile(r"([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\[\d{1,2}\]|[¹²³⁴⁵⁶⁷⁸⁹])")
TERMINAL = tuple("。.!?!?…;”』」)")


def norm_line(s: str) -> str:
    s = re.sub(r"\s+", "", s)
    return re.sub(r"^[-*>+]+", "", s)


def norm_alpha(s: str) -> str:
    """只留字母数字汉字,用于跨样式(斜体标记等)匹配页眉。"""
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", s)


def smart_join(a: str, b: str) -> str:
    """拼接两段文本:两侧都是 ASCII 字母数字时补空格(英文),中文不受影响。"""
    a, b = a.rstrip(), b.lstrip()
    if a and b and re.match(r"[A-Za-z0-9]", a[-1]) and re.match(r"[A-Za-z0-9]", b[0]):
        return a + " " + b
    return a + b


SYMBOL_FONT_HINTS = ("symbol", "wingding", "dingbat", "zapf", "marlett", "webdings")


def page_has_symbol_bullets(page) -> bool:
    """页面上是否存在符号字体渲染的项目符号(独立短行或行内短 span)。"""
    d = page.get_text("dict")
    font_count = {}
    spans_all = []
    for blk in d.get("blocks", []):
        if blk.get("type") != 0:
            continue
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                spans_all.append((sp, ln))
                font_count[sp.get("font", "?")] = font_count.get(sp.get("font", "?"), 0) + 1
    body_font = max(font_count, key=font_count.get) if font_count else ""
    for sp, ln in spans_all:
        f = sp.get("font", "").lower()
        t = sp.get("text", "").strip()
        if t and len(t) <= 2:
            if any(h in f for h in SYMBOL_FONT_HINTS) or sp.get("font", "") != body_font:
                return True
    return False


def text_page_analysis(doc, pno, page_h):
    """文本页的页眉/页脚/页底脚注(基于坐标,避免把参考文献误判为脚注)。"""
    import pymupdf
    page = doc[pno]
    d = page.get_text("dict")
    headers, footers, footnotes = [], [], []
    for blk in d.get("blocks", []):
        if blk.get("type") != 0:
            continue
        x0, y0, x1, y1 = blk["bbox"]
        text = " ".join(
            sp["text"] for ln in blk.get("lines", []) for sp in ln.get("spans", []))
        text = text.strip()
        if not text:
            continue
        if y1 < page_h * 0.08:
            headers.append(text)
        elif y0 > page_h * 0.92:
            footers.append(text)
        elif y0 > page_h * 0.72 and FN_MARK.match(text):
            footnotes.append({"text": text, "bbox": blk["bbox"]})
    return headers, footers, footnotes


def strip_lines(md_text: str, remove_norms: set) -> str:
    out = []
    for ln in md_text.splitlines():
        if norm_line(ln) and norm_line(ln) in remove_norms:
            continue
        out.append(ln)
    return "\n".join(out)


IMG_REF = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def rewrite_images(md_text: str, work: Path, page_no: int, counter: dict):
    """把 pymupdf4llm 写出的图片引用复制到 book_assets 并改写路径。"""
    def _repl(m):
        alt, path = m.group(1), m.group(2).strip()
        cand = [ROOT / path, work / path, work.parent.parent / path]
        src = next((c for c in cand if c.exists()), None)
        if src is None:
            return m.group(0)
        counter[0] += 1
        name = f"img_p{page_no}_{counter[0]}.png"
        dst = work / "book_assets" / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        return f"![{alt}](book_assets/{name})"

    return IMG_REF.sub(_repl, md_text)


def is_scan_page(p):
    return p["type"] == "scan"


def split_footnote_entries(text: str):
    """把脚注块文本按编号标记切成 [(marker, content), ...]。"""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    entries = []
    for ln in lines:
        m = FN_MARK.match(ln)
        if m:
            entries.append([m.group(1), ln[m.end():].strip()])
        elif entries:
            entries[-1][1] += " " + ln
        else:
            # 整块没有编号标记:当作单条脚注
            entries.append(["", ln])
    return entries


def extract_citations(text: str):
    return CITE_MARK.findall(text)


def copy_asset(work: Path, src_rel: str, new_name: str) -> str | None:
    src = work / src_rel
    if not src.exists():
        return None
    dst = work / "book_assets" / new_name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    return f"book_assets/{new_name}"


def build_scan_page_segments(work, page, blocks_doc, recs):
    """扫描页 -> 有序内容段列表。返回 (body_segments, footnote_texts, dropped)"""
    h = blocks_doc["h"]
    w = blocks_doc["w"]
    blocks = blocks_doc["blocks"]
    body, footnotes, dropped, pending_bottom = [], [], [], []
    img_idx = 0
    ordered = [blocks[i] for i in blocks_doc["order"]]

    for b in ordered:
        t = b["type_name"]
        x1, y1, x2, y2 = b["bbox"]
        rec_key = str(blocks.index(b))
        if t in ("header", "footer", "header_image", "footer_image", "number", "seal"):
            dropped.append({"type": t, "bbox": b["bbox"]})
            continue
        if t in ("footnote", "vision_footnote"):
            text = recs.get(rec_key, {}).get("text", "")
            if text:
                footnotes.append({"text": text, "bbox": b["bbox"]})
            continue
        if t in ("text", "aside_text") and y1 > h * 0.82:
            # 底部文本块:待定——VL 文本带编号标记或页面已有脚注时才算脚注
            text = recs.get(rec_key, {}).get("text", "")
            pending_bottom.append((b, rec_key, text))
            continue
        if t == "image":
            img_idx += 1
            rel = copy_asset(work, b["crop"], f"img_p{page['n']}_{img_idx}.png")
            if rel:
                body.append({"kind": "image", "path": rel, "bbox": b["bbox"]})
            continue
        if t == "chart":
            img_idx += 1
            rel = copy_asset(work, b["crop"], f"chart_p{page['n']}_{img_idx}.png")
            if rel:
                body.append({"kind": "image", "path": rel, "bbox": b["bbox"],
                             "caption": "图(图表原样保留)"})
            continue
        if t == "figure_title":
            text = recs.get(str(blocks.index(b)), {}).get("text", "").strip()
            if body and body[-1]["kind"] == "image":
                body[-1]["caption"] = text
            else:
                body.append({"kind": "caption", "text": text, "bbox": b["bbox"]})
            continue
        if t == "table":
            text = recs.get(str(blocks.index(b)), {}).get("text", "")
            body.append({"kind": "table", "text": text, "bbox": b["bbox"]})
            continue
        if t == "display_formula":
            text = recs.get(str(blocks.index(b)), {}).get("text", "").strip().strip("$ ")
            body.append({"kind": "formula", "text": f"$$\n{text}\n$$", "bbox": b["bbox"]})
            continue
        if t == "inline_formula":
            text = recs.get(str(blocks.index(b)), {}).get("text", "").strip()
            body.append({"kind": "inline_formula", "text": f"${text}$", "bbox": b["bbox"]})
            continue
        # 其余按文本处理
        text = recs.get(rec_key, {}).get("text", "").strip()
        if not text:
            continue
        if t in ("paragraph_title", "doc_title"):
            body.append({"kind": "heading", "text": text, "type": t, "bbox": b["bbox"]})
            continue
        # VL 逐行输出且多为短行/无句读 -> 判定为列表(VL 保真了行结构)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        if len(lines) >= 2:
            shortish = sum(1 for l in lines
                           if len(l) <= 60 and not l.endswith(TERMINAL))
            if shortish >= max(2, int(0.6 * len(lines))):
                body.append({"kind": "list", "items": lines, "bbox": b["bbox"]})
                continue
        body.append({"kind": "para", "text": text, "type": t, "bbox": b["bbox"]})

    # 待定的页底文本块:有编号标记,或页面已有脚注且位于最底部 -> 脚注;否则正文
    has_strict_fn = bool(footnotes)
    last_body_y = max((s["bbox"][1] for s in body if s.get("bbox")), default=0)
    for b, rec_key, text in pending_bottom:
        if not text:
            continue
        is_fn = bool(FN_MARK.match(text)) or (has_strict_fn and b["bbox"][1] > last_body_y)
        if is_fn:
            footnotes.append({"text": text, "bbox": b["bbox"]})
        else:
            kind = "heading" if b["type_name"] == "doc_title" else "para"
            body.append({"kind": kind, "text": text, "type": b["type_name"],
                         "bbox": b["bbox"]})
    return body, footnotes, dropped


def unify_heading_levels(body):
    """doc_title -> ##,paragraph_title -> ###(章级由 TOC 决定)。"""
    for seg in body:
        if seg.get("kind") == "heading":
            seg["level"] = 2 if seg.get("type") == "doc_title" else 3
    return body


LIST_MARKER_RE = re.compile(r"^\s*(?:[-•*▪◦●∙–—]\s+|\d{1,2}[.)]\s+)")


def is_list_line(s: str) -> bool:
    return bool(LIST_MARKER_RE.match(s))


def merge_paragraphs_in_page(md_text: str) -> str:
    """页内空行拆段的合并:上段未完句且下段非特殊行 -> 拼接。
    列表行(带项目符号/编号)永远不参与合并。"""
    parts = [p.strip() for p in md_text.split("\n\n") if p.strip()]
    if len(parts) <= 1:
        return md_text
    out = [parts[0]]
    for seg in parts[1:]:
        tail = out[-1].rstrip()
        if (not tail.startswith(("#",)) and not is_list_line(tail)
                and not tail.endswith(TERMINAL)
                and not tail.endswith((":", ":", ",", ","))
                and not seg.startswith(("#", "!", "$", "|", "[", "<", "*", ">"))
                and not is_list_line(seg)):
            out[-1] = smart_join(tail, seg)
        else:
            out.append(seg)
    return "\n\n".join(out)


def running_head_prefixes(band_items):
    """识别页眉的字母主干:支持"章名+页码"与"页码+书名"两种形态,≥2 页出现。"""
    groups = {}
    for _, _, raw in band_items:
        a = norm_alpha(raw)
        m = re.match(r"^(\d{1,3})?(.*?)(\d{1,3})?$", a)
        if m and len(m.group(2)) >= 4:
            groups.setdefault(m.group(2), set()).add(a)
    return {p for p, seen in groups.items() if len(seen) >= 2}


def strip_running_heads(md_text: str, prefixes) -> str:
    """从 markdown 行首切除粘连的页眉(可带页码/斜体标记,页码在前或在后)。"""
    if not prefixes:
        return md_text
    out = []
    for ln in md_text.splitlines():
        a = norm_alpha(ln)
        hit_len = 0
        for p in prefixes:
            m = re.match(r"^(\d{0,3})" + re.escape(p) + r"(\d{0,3})", a)
            if m:
                hit_len = m.end()
                # 整行就是页眉:后面没有别的字母内容
                if re.fullmatch(r"\d{0,3}" + re.escape(p) + r"\d{0,3}", a):
                    hit_len = len(a)
                break
        if hit_len:
            if hit_len >= len(a):
                continue  # 整行就是页眉
            built = ""
            cut = -1
            for i, ch in enumerate(ln):
                if re.match(r"[0-9A-Za-z\u4e00-\u9fff]", ch):
                    built += ch
                if len(built) == hit_len:
                    cut = i + 1
                    break
            if cut > 0:
                m = re.match(r"[\s_:,]*", ln[cut:])
                ln = ln[cut + (m.end() if m else 0):]
        out.append(ln)
    return "\n".join(out)


def reconstruct_page_text(page) -> str:
    """字符级空格重建:很多盗版/OCR PDF 的文本层没有空格字符,
    只有 1 个空格宽度的字间空隙;按字距阈值把空格补回来。"""
    raw = page.get_text("rawdict")
    out_lines = []
    for blk in raw.get("blocks", []):
        if blk.get("type") != 0:
            continue
        for line in blk.get("lines", []):
            spans = line.get("spans", [])
            chars = [c for sp in spans for c in sp.get("chars", [])]
            if not chars:
                continue
            size = max((sp.get("size", 10.0) for sp in spans), default=10.0)
            th = max(0.3, size * 0.05)
            parts = []
            prev_end = None
            for c in chars:
                x0, _, x1, _ = c["bbox"]
                if (prev_end is not None and x0 - prev_end > th
                        and parts and not parts[-1].endswith(" ")):
                    parts.append(" ")
                parts.append(c["c"])
                prev_end = x1
            t = "".join(parts).strip()
            if t:
                out_lines.append(t)
    return "\n".join(out_lines)


LIGATURES = {"ﬃ": "ffi", "ﬄ": "ffl", "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff"}


def expand_ligatures(s: str) -> str:
    for k, v in LIGATURES.items():
        if k in s:
            s = s.replace(k, v)
    return s


def normalize_corrected(corrected: str) -> str:
    """展开连字、合并行尾断词连字符(gen-\\nerally -> generally),
    硬连字符(English-speaking 不在行尾断词位置)不受影响。"""
    return re.sub(r"-[ \t]*\r?\n[ \t]*", "", expand_ligatures(corrected or ""))


def repair_fused_words(md_text: str, corrected: str) -> str:
    """用重建后的带空格文本,修复 markdown 里的长粘连英文串。"""
    corrected = normalize_corrected(corrected or "")
    if not corrected:
        return md_text
    norm_chars, positions = [], []
    for i, ch in enumerate(corrected):
        if not ch.isspace():
            norm_chars.append(ch.lower())
            positions.append(i)
    norm_corr = "".join(norm_chars)

    def _is_standalone(run: str) -> bool:
        return re.search(r"(?<![A-Za-z])" + re.escape(run) + r"(?![A-Za-z])",
                         corrected, re.IGNORECASE) is not None

    out, last = [], 0
    for m in re.finditer(r"[A-Za-z]{12,}", md_text):
        run = m.group(0)
        if _is_standalone(run):
            continue
        k = norm_corr.find(run.lower())
        if k < 0:
            continue
        k2 = k + len(run) - 1
        if k2 >= len(positions):
            continue
        fixed = corrected[positions[k]:positions[k2] + 1]
        out.append(md_text[last:m.start()])
        out.append(fixed)
        last = m.end()
    out.append(md_text[last:])
    return "".join(out)


def repair_segments(md_text: str, corrected: str) -> str:
    """分词级修复:无 markdown 标记的词元在重建文本中定位,
    原书该处有空格而 md 没有(标点边界粘连)时补空格。"""
    corrected = normalize_corrected(corrected or "")
    if not corrected:
        return md_text
    norm_chars, positions = [], []
    for i, ch in enumerate(corrected):
        if not ch.isspace():
            norm_chars.append(ch.lower())
            positions.append(i)
    norm_corr = "".join(norm_chars)

    def fix_token(tok: str) -> str:
        if len(tok) < 8 or re.search(r"[_*`\[\]#|>]", tok):
            return tok
        k = norm_corr.find(tok.lower())
        if k < 0:
            return tok
        k2 = k + len(tok) - 1
        if k2 >= len(positions):
            return tok
        fixed = corrected[positions[k]:positions[k2] + 1]
        if re.sub(r"\s+", "", fixed).lower() == tok.lower():
            return fixed
        return tok

    out_lines = []
    for line in md_text.splitlines():
        out_lines.append(" ".join(fix_token(t) for t in line.split(" ")))
    return "\n".join(out_lines)


def merge_cross_page(all_pages_body):
    """相邻页末段未完句 -> 与下页首段合并。"""
    merged_pages = []
    for pi, body in enumerate(all_pages_body):
        if (pi > 0 and body and merged_pages
                and merged_pages[-1] and merged_pages[-1][-1].get("kind") == "para"
                and body[0].get("kind") == "para"):
            tail = merged_pages[-1][-1]["text"].rstrip()
            head = body[0]["text"].lstrip()
            if (tail and not tail.endswith(TERMINAL)
                    and not head.startswith(("#", "!", "$", "|", "["))
                    and not is_list_line(head) and not is_list_line(tail)):
                merged_pages[-1][-1]["text"] = smart_join(tail, head)
                merged_pages[-1][-1]["merged_next_page"] = True
                body = body[1:]
        merged_pages.append(body)
    return merged_pages


def pair_footnotes(pages_body, pages_footnotes):
    """页内脚注 <-> 正文引用标记配对,输出全局脚注注册表与替换计划。"""
    registry = []       # [{id, marker, text, page}]
    pair_log = []
    for pi, fns in enumerate(pages_footnotes):
        if not fns:
            continue
        fns = sorted(fns, key=lambda f: f["bbox"][1] if f.get("bbox") else 1 << 30)
        page_body = pages_body[pi]
        page_text = "\n".join(s.get("text", "") for s in page_body)
        entries = []
        for fn in fns:
            entries.extend(split_footnote_entries(fn["text"]))
        cites = extract_citations(page_text)
        for marker, content in entries:
            fid = f"fn{len(registry) + 1}"
            registry.append({"id": fid, "marker": marker or "•", "text": content,
                             "page": pi + 1})
            pair_log.append({"page": pi + 1, "id": fid, "marker": marker,
                             "matched": bool(marker) and marker in cites,
                             "content_head": content[:40]})
    return registry, pair_log


def inline_cite_to_refs(text, page_registry):
    """把正文里的引用标记替换为 [^fnN]。仅替换每个标记的首次出现。"""
    by_marker = {}
    for e in page_registry:
        m = e["marker"]
        if m and m not in by_marker:
            by_marker[m] = e["id"]

    def _sub(mm):
        mark = mm.group(1)
        fid = by_marker.get(mark)
        if fid:
            # 首次替换后移除,避免重复引用同一脚注
            by_marker.pop(mark)
            return f"[^{fid}]"
        return mark

    return CITE_MARK.sub(_sub, text)


def main(work: Path):
    import pymupdf

    manifest = load_json(work / "manifest.json")
    pages = manifest["pages"]
    doc = pymupdf.open(manifest["pdf"])

    # 第一遍:收集跨页重复的页眉/页脚文本(全文相同,或前缀相同,或纯页码)
    band_items = []   # [(page, kind, norm_key)]
    for p in pages:
        if p["type"] != "text":
            continue
        hs, fs, _ = text_page_analysis(doc, p["n"] - 1, doc[p["n"] - 1].rect.height)
        for t in hs:
            band_items.append((p["n"], "h", norm_line(t)))
        for t in fs:
            band_items.append((p["n"], "f", norm_line(t)))
    texts = [k for _, _, k in band_items if k]
    recurring = {k for k in texts if texts.count(k) >= 2}
    prefixes = [k[:5] for k in texts if len(k) >= 5]
    recurring |= {k for k in texts
                  if len(k) >= 5 and prefixes.count(k[:5]) >= 2}
    recurring |= {k for k in texts if k.isdigit() or re.fullmatch(r"[-—–·.\s\divxlc]+", k or "x")}
    head_prefixes = running_head_prefixes(band_items)

    img_counter = [0]
    pages_body, pages_footnotes = [], []
    corrected_map = {}   # 页码 -> 该页重建文本(用于跨页合并后的二次修复)
    for p in pages:
        if is_scan_page(p):
            bd = load_json(work / "blocks" / f"p{p['n']:04d}.json")
            rec_path = work / "blocks" / f"p{p['n']:04d}_rec.json"
            recs = load_json(rec_path) if rec_path.exists() else {}
            body, fns, dropped = build_scan_page_segments(work, p, bd, recs)
            body = unify_heading_levels(body)
            pages_body.append(body)
            pages_footnotes.append(fns)
        else:
            # 文本层页:pymupdf4llm markdown + 坐标级页眉页脚/脚注处理
            md = p.get("md_text", "")
            _, _, fns = text_page_analysis(doc, p["n"] - 1, doc[p["n"] - 1].rect.height)
            remove = set()
            hs, fs, _2 = text_page_analysis(doc, p["n"] - 1, doc[p["n"] - 1].rect.height)
            for t in hs + fs:
                key = norm_line(t)
                if key in recurring:
                    remove.add(key)
            # 从 markdown 中移除脚注块对应行(按规范化前缀匹配)
            for fn in fns:
                head = norm_line(fn["text"])[:14]
                for ln in md.splitlines():
                    nln = norm_line(ln)
                    if nln and nln.startswith(head[:14]) and nln[:14] == head:
                        remove.add(nln)
                        break
            md = strip_lines(md, remove)
            md = strip_running_heads(md, head_prefixes)
            if page_has_symbol_bullets(doc[p["n"] - 1]):
                # 符号字体的 bullet 字形常被错误映射成 "r",剥掉杂字
                md = re.sub(r"^([-•*▪◦●∙–—]\s+)r\s+(?=[A-Za-z_*])", r"\1", md, flags=re.M)
            md = rewrite_images(md, work, p["n"], img_counter)
            corrected = expand_ligatures(reconstruct_page_text(doc[p["n"] - 1]))
            corrected_map[p["n"]] = corrected
            md = repair_fused_words(md, corrected)
            md = repair_segments(md, corrected)
            md = merge_paragraphs_in_page(md)
            pages_body.append([{"kind": "md", "text": md.strip()}])
            pages_footnotes.append(fns)

    pages_body = merge_cross_page(pages_body)
    # 跨页合并产生的粘连:用两页拼接的重建文本补一次修复
    for pi, body in enumerate(pages_body):
        for seg in body:
            if seg.get("merged_next_page"):
                corr = (corrected_map.get(pi + 1, "") + "\n"
                        + corrected_map.get(pi + 2, "")).strip()
                seg["text"] = repair_fused_words(seg["text"], corr)
                seg["text"] = repair_segments(seg["text"], corr)
    registry, pair_log = pair_footnotes(pages_body, pages_footnotes)

    # 合成 book.md
    out_md = []
    for pi, body in enumerate(pages_body):
        page_registry = [e for e in registry if e["page"] == pi + 1]
        out_md.append(f'<span epub:type="pagebreak" title="{pi + 1}"></span>\n')
        for seg in body:
            kind = seg.get("kind")
            if kind == "md":
                txt = inline_cite_to_refs(seg["text"], page_registry)
                out_md.append(txt)
            elif kind == "heading":
                txt = inline_cite_to_refs(seg["text"], page_registry)
                out_md.append("#" * seg.get("level", 3) + " " + txt.replace("\n", " "))
            elif kind == "para":
                txt = inline_cite_to_refs(seg["text"], page_registry)
                out_md.append(txt.replace("\n", " "))
            elif kind == "table":
                out_md.append(seg["text"])
            elif kind == "formula":
                out_md.append(seg["text"])
            elif kind == "inline_formula":
                out_md.append(seg["text"])
            elif kind == "list":
                out_md.extend("- " + it for it in seg["items"])
                out_md.append("")
            elif kind == "image":
                cap = seg.get("caption")
                out_md.append(f"![]({seg['path']})" + (f"\n*{cap}*" if cap else ""))
            elif kind == "caption":
                out_md.append(f"*{seg['text']}*")
            out_md.append("")

    # 脚注定义
    if registry:
        out_md.append("\n<!-- footnotes -->\n")
        for e in registry:
            out_md.append(f"[^{e['id']}]: {e['text']}\n")

    (work / "book.md").write_text("\n".join(out_md), encoding="utf-8")
    save_json(work / "footnotes.json", registry)
    n_matched = sum(1 for x in pair_log if x["matched"])
    save_json(work / "assemble_report.json", {
        "footnotes": len(registry),
        "footnotes_matched": n_matched,
        "pair_log": pair_log,
    })
    log.info("book.md 生成:脚注 %d 条(自动配对 %d),页数 %d",
             len(registry), n_matched, len(pages))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    args = ap.parse_args()
    main(ROOT / args.work)
