# -*- coding: utf-8 -*-
"""阶段 1b:列表结构探针。

对文本层页做三件事:
1. 从 PDF 坐标提取真实列表项(bullet 字形/符号字体);
2. 校验 pymupdf4llm 的 md 是否保住了列表结构(每项独立成行、无杂字);
3. 结构保不住的"可疑页"转为扫描页路径,交给版面+VL 整页解析(A+B 方案的 B 兜底)。

输出:更新后的 manifest.json + list_probe_report.json
"""
import argparse
import re

import pymupdf

from common import ROOT, get_logger, load_json, save_json

log = get_logger("01b_probe")

BULLET_CHARS = set("•●◦‣⁃▪▫·∙●○*–—-")
SYMBOL_FONT_HINTS = ("symbol", "wingding", "dingbat", "zapf", "marlett", "webdings")
LIST_MARKER_RE = re.compile(r"^\s*(?:[-•*▪◦●∙–—]\s+|\d{1,2}[.)]\s+)")


def norm_alpha(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", s).lower()


def line_item_text(spans, symbol_seen: bool) -> str | None:
    """行首是项目符号时返回清理后的条目文本,否则 None。"""
    if not spans:
        return None
    first = spans[0]
    txt = first.get("text", "").strip()
    font = first.get("font", "").lower()
    # case1:独立符号字体 span(常被错映射成 r/p/q 等字母)
    if txt and len(txt) <= 2 and any(h in font for h in SYMBOL_FONT_HINTS):
        return "".join(sp.get("text", "") for sp in spans[1:]).strip()
    # case2:文本以可见 bullet 字符开头
    if txt and txt[0] in BULLET_CHARS:
        rest = txt[1:].strip() or "".join(sp.get("text", "") for sp in spans[1:]).strip()
        return rest
    # case3:符号字体证据存在时,行首孤立 "r " 视为错映射 bullet
    if symbol_seen:
        m = re.match(r"^r\s+(.+)$", txt)
        if m and len(txt) < 80:
            return m.group(1)
    return None


def collect_list_groups(page):
    """从 PDF 坐标提取列表分组:[(item_text, ...)],按连续行聚类。

    支持 bullet 的三种形态:
    1. 行内独立符号字体 span(LCIDRCLE/Wingdings 类,常错映射成字母);
    2. 行内可见 bullet 字符开头;
    3. 孤立短行作为 bullet + 缩进的条目行(LaTeX 排版常见)。
    """
    d = page.get_text("dict")
    lines = []
    for blk in d.get("blocks", []):
        if blk.get("type") != 0:
            continue
        for ln in blk.get("lines", []):
            spans = ln.get("spans", [])
            text = "".join(sp.get("text", "") for sp in spans).strip()
            if text:
                lines.append((ln["bbox"][1], ln["bbox"][0], spans, text))
    lines.sort(key=lambda t: (round(t[0], 1), t[1]))

    # 页面是否存在符号字体 bullet(case3 的前提):独立短行 + 非主流字体
    font_count = {}
    for _, _, spans, text in lines:
        if len(text) > 2:
            for sp in spans:
                font_count[sp.get("font", "?")] = font_count.get(sp.get("font", "?"), 0) + 1
    body_font = max(font_count, key=font_count.get) if font_count else ""
    symbol_seen = False
    for _, _, spans, text in lines:
        if len(text) <= 2:
            for sp in spans:
                f = sp.get("font", "")
                if f and f != body_font:
                    symbol_seen = True

    groups, cur = [], []
    prev_y = None
    i = 0
    while i < len(lines):
        y, x, spans, text = lines[i]
        # case3:孤立短行 = bullet 字形行,条目在右侧缩进行
        if len(text) <= 2 and i + 1 < len(lines) and lines[i + 1][1] > x + 3 \
                and 0 <= lines[i + 1][0] - y < 12:
            item = lines[i + 1][3].strip()
            if item:
                if cur and prev_y is not None and y - prev_y > 40:
                    groups.append(cur)
                    cur = []
                cur.append(item)
                prev_y = lines[i + 1][0]
                i += 2
                continue
            i += 1
            continue
        item = line_item_text(spans, symbol_seen)
        if item is not None and len(item) > 1:
            if cur and prev_y is not None and y - prev_y > 40:
                groups.append(cur)
                cur = []
            cur.append(item)
            prev_y = y
        else:
            if cur:
                groups.append(cur)
                cur = []
            prev_y = y
        i += 1
    if cur:
        groups.append(cur)
    return [g for g in groups if len(g) >= 2]


def verify_md_list(md_text: str, items) -> bool:
    """md 是否以"每项独立列表行"的形式保住了该组条目。"""
    marker_lines = [norm_alpha(l) for l in md_text.splitlines() if LIST_MARKER_RE.match(l)]
    for it in items:
        key = norm_alpha(it)[:20]
        if not key:
            return False
        if not any(key and (ml.startswith(key) or key in ml[:len(key) + 6])
                   for ml in marker_lines):
            return False
    return True


def main(work):
    manifest = load_json(work / "manifest.json")
    doc = pymupdf.open(manifest["pdf"])
    report = {"checked": 0, "repaired_pages": [], "flagged_pages": []}

    for p in manifest["pages"]:
        if p["type"] != "text":
            continue
        report["checked"] += 1
        page = doc[p["n"] - 1]
        groups = collect_list_groups(page)
        if not groups:
            continue
        md = p.get("md_text", "")
        bad = [g for g in groups if not verify_md_list(md, g)]
        if bad:
            # 结构保不住 -> 转 VL 整页解析路径
            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(manifest["dpi"] / 72, manifest["dpi"] / 72), alpha=False)
            img_path = work / "pages" / f"p{p['n']:04d}.png"
            pix.save(img_path)
            p["type"] = "scan"
            p["png"] = str(img_path.relative_to(work))
            p["w"], p["h"] = pix.width, pix.height
            report["flagged_pages"].append(
                {"page": p["n"], "groups": len(groups), "broken": len(bad)})
        else:
            report["repaired_pages"].append(p["n"])

    save_json(work / "manifest.json", manifest)
    save_json(work / "list_probe_report.json", report)
    log.info("列表探针:检查 %d 页,结构良好 %d 页,转 VL 兜底 %s 页",
             report["checked"], len(report["repaired_pages"]),
             [x["page"] for x in report["flagged_pages"]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    args = ap.parse_args()
    main(ROOT / args.work)
