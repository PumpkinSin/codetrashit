# -*- coding: utf-8 -*-
"""ScanBook Studio 免界面 CLI 统一入口：支持外部直接调用 PDF->EPUB3、翻译全流程、进度查询。"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PIPELINE = ROOT / "pipeline"


def run_py(script_name: str, extra_args: list[str], model_dir: str = "") -> int:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if model_dir:
        env["SCANBOOK_MODEL_DIR"] = model_dir
    cmd = [sys.executable, str(PIPELINE / script_name), *extra_args]
    return subprocess.run(cmd, env=env, cwd=str(ROOT)).returncode


def main():
    ap = argparse.ArgumentParser(
        prog="scanbook_cli",
        description="ScanBook Studio 无界面命令行工具（供外部脚本与 Antigravity 直接调用）",
    )
    ap.add_argument("--model-dir", default="", help="可选：覆盖模型/工具根目录（如 C:\\path\\to\\models）")
    sub = ap.add_subparsers(dest="cmd", required=True)

    # 1. pdf2epub
    p_epub = sub.add_parser("pdf2epub", help="PDF -> EPUB3（5 阶段完整管线，支持断点续跑）")
    p_epub.add_argument("pdf", help="输入 PDF 路径")
    p_epub.add_argument("--name", default=None, help="书名/工作目录名（默认取 PDF 文件名）")
    p_epub.add_argument("--lang", default="zh-CN", help="原书语言（zh-CN 或 en）")
    p_epub.add_argument("--ngl", type=int, default=99, help="Vulkan GPU 层数（失败时可传 0 改 CPU）")

    # 2. translate-prepare
    p_prep = sub.add_parser("translate-prepare", help="拆章并切分待翻译单元")
    p_prep.add_argument("--work", required=True, help="work/<书名> 目录")

    # 3. translate-api
    p_api = sub.add_parser("translate-api", help="使用设置中的 OpenAI 兼容 API 自动并发翻译")
    p_api.add_argument("--work", required=True, help="work/<书名> 目录")
    p_api.add_argument("--api-url", default="", help="覆盖 API Base URL")
    p_api.add_argument("--api-key", default="", help="覆盖 API Key")
    p_api.add_argument("--model", default="", help="覆盖模型名")
    p_api.add_argument("--concurrency", type=int, default=0, help="并发数")
    p_api.add_argument("--batch-size", type=int, default=12, help="每批单元数")

    # 4. translate-verify
    p_ver = sub.add_parser("translate-verify", help="单元级翻译对账（防丢段）")
    p_ver.add_argument("--work", required=True, help="work/<书名> 目录")

    # 5. translate-build
    p_bld = sub.add_parser("translate-build", help="组装纯中文或双语对照 EPUB3")
    p_bld.add_argument("--work", required=True, help="work/<书名> 目录")
    p_bld.add_argument("--mode", choices=["bilingual", "zh"], default="bilingual", help="bilingual=双语对照, zh=纯中文")

    # 6. translate-all (one-shot: prepare -> api -> verify -> build)
    p_tall = sub.add_parser("translate-all", help="一键完成：拆章 -> API 翻译 -> 对账 -> 组装 EPUB3")
    p_tall.add_argument("--work", required=True, help="work/<书名> 目录")
    p_tall.add_argument("--mode", choices=["bilingual", "zh"], default="bilingual")
    p_tall.add_argument("--api-url", default="")
    p_tall.add_argument("--api-key", default="")
    p_tall.add_argument("--model", default="")
    p_tall.add_argument("--concurrency", type=int, default=0)

    # 7. translate-epub (existing epub file directly)
    p_ep_tr = sub.add_parser("translate-epub", help="直接处理/翻译现有 EPUB 文件")
    p_ep_tr.add_argument("args", nargs=argparse.REMAINDER, help="透传给 pipeline/epub_translate.py 的参数")

    # 8. progress
    p_prog = sub.add_parser("progress", help="查看 OCR/EPUB/翻译进度")
    p_prog.add_argument("--work", required=True, help="work/<书名> 目录")

    args = ap.parse_args()
    rc = 0
    if args.cmd == "pdf2epub":
        extra = [args.pdf, "--lang", args.lang, "--ngl", str(args.ngl)]
        if args.name:
            extra.extend(["--name", args.name])
        rc = run_py("run_all.py", extra, args.model_dir)
    elif args.cmd == "translate-prepare":
        rc = run_py("translate.py", ["prepare", "--work", args.work], args.model_dir)
    elif args.cmd == "translate-api":
        extra = ["--work", args.work, "--batch-size", str(args.batch_size)]
        if args.api_url: extra.extend(["--api-url", args.api_url])
        if args.api_key: extra.extend(["--api-key", args.api_key])
        if args.model: extra.extend(["--model", args.model])
        if args.concurrency: extra.extend(["--concurrency", str(args.concurrency)])
        rc = run_py("api_translate.py", extra, args.model_dir)
    elif args.cmd == "translate-verify":
        rc = run_py("translate.py", ["verify", "--work", args.work], args.model_dir)
    elif args.cmd == "translate-build":
        rc = run_py("build_translated.py", ["--work", args.work, "--mode", args.mode], args.model_dir)
    elif args.cmd == "translate-all":
        rc = run_py("translate.py", ["prepare", "--work", args.work], args.model_dir)
        if rc == 0:
            extra = ["--work", args.work]
            if args.api_url: extra.extend(["--api-url", args.api_url])
            if args.api_key: extra.extend(["--api-key", args.api_key])
            if args.model: extra.extend(["--model", args.model])
            if args.concurrency: extra.extend(["--concurrency", str(args.concurrency)])
            rc = run_py("api_translate.py", extra, args.model_dir)
        if rc == 0:
            rc = run_py("translate.py", ["verify", "--work", args.work], args.model_dir)
        if rc == 0:
            rc = run_py("build_translated.py", ["--work", args.work, "--mode", args.mode], args.model_dir)
    elif args.cmd == "translate-epub":
        rc = run_py("epub_translate.py", args.args, args.model_dir)
    elif args.cmd == "progress":
        rc = run_py("progress.py", ["--work", args.work], args.model_dir)

    sys.exit(rc)


if __name__ == "__main__":
    main()
