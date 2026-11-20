# -*- coding: utf-8 -*-
"""翻译引擎(轮子):把 book.md 拆成逐章翻译单元,供子代理翻译,并对账。

流程:
  translate.py --prepare --work work/<书名>   拆章+切单元,产物落盘
  (在会话中由 AI 派发子代理,按 units 文件逐单元翻译,
   译文写入 work/<书名>/translations/zh/chXX.txt,格式每行 "[编号] 译文")
  translate.py --verify  --work work/<书名>   段落对账,报告缺失单元

设计要点:
- 翻译单元与结构元素分离:标题/段落/列表/表格 = 可翻译单元(有编号);
  图片、页码锚点、脚注定义 = 结构元素(原样透传,不进单元)。
- 编号规则确定性:prepare 与 verify/build 用同一套切分函数,互为唯一事实来源。
"""
import argparse
import importlib
import re
from pathlib import Path

from common import ROOT, get_logger, load_json, save_json

log = get_logger("translate")

m05 = importlib.import_module("05_build_epub")   # 复用拆章逻辑

SKIP_TITLE_RE = re.compile(
    r"front matter|contents|list of (plates|figures|tables)|bibliography|"
    r"references|^index\b|acknowledg|cambridge introductions to", re.I)

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
IMAGE_RE = re.compile(r"^!\[[^\]]*\]\([^)]+\)")
PAGEBREAK_RE = re.compile(r'^<span epub:type="pagebreak"')
FNDEF_RE = re.compile(r"^\[\^fn\d+\]:")
LISTLINE_RE = re.compile(r"^\s*(?:[-•*▪◦●∙–—]\s+|\d{1,2}[.)]\s+)")
TABLELINE_RE = re.compile(r"^\s*\|")


def split_blocks(md_text: str):
    """把章节 md 切成带类型的块列表:
    ('heading'|'para'|'list'|'table'|'caption'|'image'|'pagebreak'|'fndef'|'blank', text)
    相邻列表行/表格行合并为一个块。"""
    blocks = []
    for raw in re.split(r"\n\s*\n", md_text):
        t = raw.strip()
        if not t:
            continue
        lines = t.splitlines()
        first = lines[0].strip()
        if PAGEBREAK_RE.match(first) and len(lines) == 1:
            blocks.append(("pagebreak", t))
        elif HEADING_RE.match(first):
            blocks.append(("heading", t))
        elif IMAGE_RE.match(first):
            blocks.append(("image", t))
        elif FNDEF_RE.match(first):
            blocks.append(("fndef", t))
        elif all(TABLELINE_RE.match(l) for l in lines if l.strip()):
            blocks.append(("table", t))
        elif all(LISTLINE_RE.match(l) for l in lines if l.strip()):
            blocks.append(("list", t))
        elif len(lines) == 1 and (first.startswith("*") and first.endswith("*")
                                  or first.startswith("_") and first.endswith("_")):
            blocks.append(("caption", t))
        else:
            blocks.append(("para", t))
    return blocks


def translatable_blocks(blocks):
    """可翻译单元(headings/para/list/table/caption)。"""
    return [b for b in blocks if b[0] in ("heading", "para", "list", "table", "caption")]


def write_units_file(chapter_dir: Path, ch_id: str, blocks):
    units = translatable_blocks(blocks)
    lines = []
    for i, (_, text) in enumerate(units, 1):
        lines.append(f"[{i}]")
        lines.append(text)
        lines.append("")
    (chapter_dir / f"{ch_id}.units.md").write_text("\n".join(lines), encoding="utf-8")
    return units


def load_glossary(work: Path) -> str:
    """全局术语表 + 书级覆盖。"""
    entries = []
    for g in [ROOT / "pipeline" / "glossaries" / "common.yaml",
              work / "glossary.yaml"]:
        if g.exists():
            for ln in g.read_text(encoding="utf-8").splitlines():
                ln = ln.strip()
                if ln and not ln.startswith("#") and ":" in ln:
                    entries.append(ln)
    return "\n".join(entries)


def cmd_prepare(work: Path, engine: str):
    manifest = load_json(work / "manifest.json")
    book_md = (work / "book.md").read_text(encoding="utf-8")
    pages_md = m05.split_pages(book_md)
    chapters = m05.build_chapters(manifest, pages_md)

    glossary = load_glossary(work)
    src_dir = work / "translations" / "src"
    zh_dir = work / "translations" / "zh"
    src_dir.mkdir(parents=True, exist_ok=True)
    zh_dir.mkdir(parents=True, exist_ok=True)

    plan = []
    for i, ch in enumerate(chapters):
        ch_id = f"ch{i:02d}"
        skip = bool(SKIP_TITLE_RE.search(ch["title"]))
        (src_dir / f"{ch_id}.md").write_text(ch["md"], encoding="utf-8")
        n_units = 0
        if not skip:
            blocks = split_blocks(ch["md"])
            units = write_units_file(src_dir, ch_id, blocks)
            n_units = len(units)
        plan.append({"ch": ch_id, "title": ch["title"], "pages": ch["pages"],
                     "skip": skip, "units": n_units,
                     "src": f"translations/src/{ch_id}.units.md" if not skip else "",
                     "out": f"translations/zh/{ch_id}.txt" if not skip else ""})

    save_json(work / "translations" / "plan.json", plan)
    # 派工说明(给子代理的规范模板,含术语表)
    spec = [
        "# 翻译任务规范(每个子代理都要遵守)",
        "",
        "## 输入/输出",
        "- 输入: translations/src/chXX.units.md,每个待译单元以 [编号] 开头",
        "- 输出: translations/zh/chXX.txt,每行格式 `[编号] 译文`(译文内可换行,"
        "直到下一个 [编号] 为止)",
        "- 编号与单元一一对应,不许合并/拆分/遗漏;结构元素(图片/页码锚点)不在单元里,不用管",
        "",
        "## 术语表(必须遵守,英文 -> 中文)",
        glossary or "(空)",
        "",
        "## 风格",
        "- 简体中文,全角标点;学术语体,流畅优先,不逐词硬译",
        "- 人名首次出现附原文括注,如 Marvin Carlson(马文·卡尔森);后文可只中文",
        "- 书名/期刊名保留英文并保住斜体标记 _..._;法语等非英语引文保留原文",
        "- 列表单元逐项翻译,保留行首 '- ';表格单元输出为 markdown 表格,保留列结构",
        "- 标题单元只输出标题译文本身(不带 # 号)",
        "- 原文中的 _斜体_/**粗体**/引号等标记在译文中对应保留",
        "- 文件较大可分多次写入:先 Write 前半,再用 Bash `cat >> 文件` 追加",
    ]
    (work / "translations" / "SPEC.md").write_text("\n".join(spec), encoding="utf-8")

    to_translate = [p for p in plan if not p["skip"]]
    log.info("拆章完成:%d 章;跳过 %d 章(结构类);待翻 %d 章、共 %d 个单元",
             len(plan), len(plan) - len(to_translate),
             len(to_translate), sum(p["units"] for p in to_translate))
    for p in plan:
        log.info("  %s %-55s %s  units=%d", p["ch"], p["title"][:55],
                 "SKIP" if p["skip"] else "TRANSLATE", p["units"])


def cmd_verify(work: Path):
    manifest = load_json(work / "manifest.json")
    book_md = (work / "book.md").read_text(encoding="utf-8")
    pages_md = m05.split_pages(book_md)
    chapters = m05.build_chapters(manifest, pages_md)
    plan = load_json(work / "translations" / "plan.json")

    problems = []
    done = 0
    for i, ch in enumerate(chapters):
        entry = plan[i]
        if entry["skip"]:
            continue
        ch_id = f"ch{i:02d}"
        zh_file = work / "translations" / "zh" / f"{ch_id}.txt"
        if not zh_file.exists():
            problems.append({"ch": ch_id, "title": ch["title"], "missing_units": "ALL"})
            continue
        blocks = split_blocks(ch["md"])
        n = len(translatable_blocks(blocks))
        zh = zh_file.read_text(encoding="utf-8")
        have = {int(m.group(1)) for m in re.finditer(r"^\[(\d+)\]", zh, re.M)}
        missing = [k for k in range(1, n + 1) if k not in have]
        extra = [k for k in have if k < 1 or k > n]
        if missing or extra:
            problems.append({"ch": ch_id, "title": ch["title"],
                             "missing_units": missing[:20], "extra": extra[:10]})
        else:
            done += 1
    save_json(work / "translations" / "verify.json",
              {"done": done, "problems": problems})
    if problems:
        for p in problems:
            log.warning("  %s %s 缺失:%s", p["ch"], p["title"][:40], p.get("missing_units"))
        log.info("对账:%d/%d 章完整,%d 章有问题", done,
                 sum(1 for e in plan if not e["skip"]), len(problems))
    else:
        log.info("对账:全部 %d 章完整,可组装", done)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["prepare", "verify"])
    ap.add_argument("--work", required=True)
    ap.add_argument("--engine", default="subagent", choices=["subagent", "main"])
    args = ap.parse_args()
    work = ROOT / args.work
    if args.cmd == "prepare":
        cmd_prepare(work, args.engine)
    else:
        cmd_verify(work)
