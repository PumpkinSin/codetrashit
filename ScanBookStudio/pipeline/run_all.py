# -*- coding: utf-8 -*-
"""一键运行整条管线:渲染分流 -> 版面 -> VL 识别 -> 拼装 -> EPUB。

用法:
  python pipeline/run_all.py <pdf路径> [--name 书名] [--ngl 99] [--skip-vl]
各阶段均可断点续跑(已有产物会跳过)。
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, get_logger

log = get_logger("run_all")

PY = sys.executable


def run(script: str, *args):
    cmd = [PY, str(Path(__file__).parent / script), *args]
    log.info(">>> %s", " ".join(cmd))
    p = subprocess.run(cmd, cwd=str(ROOT))
    if p.returncode != 0:
        raise SystemExit(f"{script} 失败(exit {p.returncode})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--name", default=None, help="工作目录/输出名,默认取 PDF 文件名")
    ap.add_argument("--ngl", type=int, default=99, help="llama.cpp GPU 层数,Vulkan 失败时用 0")
    ap.add_argument("--conf", type=float, default=0.35, help="版面置信度阈值")
    ap.add_argument("--lang", default="zh-CN")
    ap.add_argument("--skip-vl", action="store_true", help="只处理文本层页(调试用)")
    args = ap.parse_args()

    pdf = Path(args.pdf)
    if not pdf.exists():
        raise SystemExit(f"找不到 PDF:{pdf}")
    name = args.name or pdf.stem
    work = ROOT / "work" / name

    run("01_render.py", str(pdf), "--work", str(work))
    run("01b_list_probe.py", "--work", str(work))
    run("02_layout.py", "--work", str(work), "--conf", str(args.conf))
    if not args.skip_vl:
        run("03_vl_recognize.py", "--work", str(work), "--ngl", str(args.ngl))
    run("04_assemble.py", "--work", str(work))
    run("05_build_epub.py", "--work", str(work), "--out", name, "--lang", args.lang)
    log.info("全部完成:output/%s.epub", name)


if __name__ == "__main__":
    main()
