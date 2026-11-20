# -*- coding: utf-8 -*-
"""翻译进度检查:python pipeline/progress.py --work work/<书名>"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, load_json

work = ROOT / sys.argv[sys.argv.index("--work") + 1] if "--work" in sys.argv else None
if work is None:
    books = sorted((ROOT / "work").glob("*/translations/plan.json"))
    if not books:
        print("没有找到任何翻译任务")
        sys.exit(0)
    work = books[0].parent.parent

plan = load_json(work / "translations" / "plan.json")
zh_dir = work / "translations" / "zh"
total_units = sum(p["units"] for p in plan if not p["skip"])
done_units = 0
print(f"书目:{work.name}")
print(f"{'章节':<46}{'进度':>10}")
print("-" * 58)
for i, p in enumerate(plan):
    ch_id = f"ch{i:02d}"
    if p["skip"]:
        print(f"{ch_id} {p['title'][:38]:<42}{'跳过':>8}")
        continue
    f = zh_dir / f"{ch_id}.txt"
    if not f.exists():
        state = "  0/" + str(p["units"])
        mark = "⏳ 排队/进行中"
    else:
        n = len(re.findall(r"^\[\d+\]", f.read_text(encoding="utf-8"), re.M))
        done_units += min(n, p["units"])
        state = f"{min(n, p['units']):>4}/{p['units']:<5}"
        mark = "✔ 完成" if n >= p["units"] else "✏ 翻译中"
    print(f"{ch_id} {p['title'][:38]:<42}{state:>10} {mark}")
print("-" * 58)
print(f"总进度:{done_units}/{total_units} 单元({done_units * 100 // max(1, total_units)}%)")
