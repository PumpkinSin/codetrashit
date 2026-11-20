# -*- coding: utf-8 -*-
"""OpenAI 兼容 API 自动并发翻译器：读取 translations/src/chXX.units.md -> 输出 translations/zh/chXX.txt。"""
import argparse
import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from common import ROOT, SETTINGS_FILE, get_logger, load_json

log = get_logger("api_translate")


def load_api_config(args):
    cfg = {
        "url": "https://api.openai.com/v1",
        "key": "",
        "model": "gpt-4o-mini",
        "concurrency": 4,
    }
    if SETTINGS_FILE.exists():
        try:
            s = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if s.get("translation_api_url"):
                cfg["url"] = str(s["translation_api_url"]).strip()
            if s.get("translation_api_key"):
                cfg["key"] = str(s["translation_api_key"]).strip()
            if s.get("translation_model"):
                cfg["model"] = str(s["translation_model"]).strip()
            if s.get("translation_concurrency"):
                cfg["concurrency"] = max(1, int(s["translation_concurrency"]))
        except Exception:
            pass
    if args.api_url:
        cfg["url"] = args.api_url.strip()
    if args.api_key:
        cfg["key"] = args.api_key.strip()
    if args.model:
        cfg["model"] = args.model.strip()
    if args.concurrency:
        cfg["concurrency"] = max(1, args.concurrency)
    return cfg


def parse_units(md_path: Path) -> list[tuple[int, str]]:
    text = md_path.read_text(encoding="utf-8")
    units: list[tuple[int, str]] = []
    cur_id = None
    cur_lines: list[str] = []
    pat = re.compile(r"^\[(\d+)\]\s*(.*)$")
    for line in text.splitlines():
        m = pat.match(line)
        if m:
            if cur_id is not None:
                units.append((cur_id, "\n".join(cur_lines).strip()))
            cur_id = int(m.group(1))
            cur_lines = [m.group(2)]
        elif cur_id is not None:
            cur_lines.append(line)
    if cur_id is not None:
        units.append((cur_id, "\n".join(cur_lines).strip()))
    return units


def parse_existing_zh(zh_path: Path) -> dict[int, str]:
    if not zh_path.exists():
        return {}
    out: dict[int, str] = {}
    cur_id = None
    cur_lines: list[str] = []
    pat = re.compile(r"^\[(\d+)\]\s*(.*)$")
    for line in zh_path.read_text(encoding="utf-8").splitlines():
        m = pat.match(line)
        if m:
            if cur_id is not None:
                out[cur_id] = "\n".join(cur_lines).strip()
            cur_id = int(m.group(1))
            cur_lines = [m.group(2)]
        elif cur_id is not None:
            cur_lines.append(line)
    if cur_id is not None:
        out[cur_id] = "\n".join(cur_lines).strip()
    return out


def call_chat_api(cfg: dict, batch: list[tuple[int, str]], glossary_hint: str) -> dict[int, str]:
    base = cfg["url"].rstrip("/")
    endpoint = base if base.endswith("/chat/completions") else f"{base}/chat/completions"

    prompt_lines = [
        "你是专业出版级图书翻译专家。请将以下编号文本精准、流畅地翻译为简体中文。",
        "严格遵守格式要求：每个单元必须以 `[编号] ` 开头（例如 `[1] 译文`），不要合并、拆分或遗漏任何编号，不要输出多余解释。",
    ]
    if glossary_hint:
        prompt_lines.append(f"参考术语表：\n{glossary_hint}")
    prompt_lines.append("\n待翻译内容：")
    for uid, txt in batch:
        prompt_lines.append(f"[{uid}] {txt}")

    payload = json.dumps({
        "model": cfg["model"],
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "你是一位严谨的历史与社科图书中译本译者，严格保留 [编号] 格式。"},
            {"role": "user", "content": "\n".join(prompt_lines)},
        ],
    }).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if cfg["key"]:
        headers["Authorization"] = f"Bearer {cfg['key']}"

    req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            parsed: dict[int, str] = {}
            cur_id = None
            cur_lines: list[str] = []
            pat = re.compile(r"^\[(\d+)\]\s*(.*)$")
            for line in content.splitlines():
                m = pat.match(line.strip())
                if m:
                    if cur_id is not None:
                        parsed[cur_id] = "\n".join(cur_lines).strip()
                    cur_id = int(m.group(1))
                    cur_lines = [m.group(2)]
                elif cur_id is not None:
                    cur_lines.append(line)
            if cur_id is not None:
                parsed[cur_id] = "\n".join(cur_lines).strip()
            return parsed
        except Exception as e:
            if attempt == 2:
                raise RuntimeError(f"API 调用失败: {e}") from e
            time.sleep(2 * (attempt + 1))
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, help="work/<书名> 目录")
    ap.add_argument("--api-url", default="")
    ap.add_argument("--api-key", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--concurrency", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=12)
    args = ap.parse_args()

    work = Path(args.work)
    cfg = load_api_config(args)
    if not cfg["key"] and "localhost" not in cfg["url"] and "127.0.0.1" not in cfg["url"]:
        raise SystemExit("未配置翻译 API Key，请在软件「设置 -> 翻译 API 配置」中填写或通过 --api-key 传入。")

    plan = load_json(work / "translations" / "plan.json")
    zh_dir = work / "translations" / "zh"
    zh_dir.mkdir(parents=True, exist_ok=True)

    glossary_hint = ""
    common_gl = ROOT / "pipeline" / "glossaries" / "common.yaml"
    book_gl = work / "glossary.yaml"
    for gp in (common_gl, book_gl):
        if gp.exists():
            glossary_hint += gp.read_text(encoding="utf-8")[:1500] + "\n"

    tasks = []
    for ch in plan["chapters"]:
        if ch.get("skip"):
            continue
        ch_id = ch["ch"]
        src_file = work / ch["src"]
        zh_file = zh_dir / f"{ch_id}.txt"
        units = parse_units(src_file)
        existing = parse_existing_zh(zh_file)
        missing = [(uid, txt) for uid, txt in units if uid not in existing]
        if not missing:
            log.info("  %s 已全部翻译 (%d 单元)，跳过", ch_id, len(units))
            continue
        for i in range(0, len(missing), args.batch_size):
            tasks.append((ch_id, missing[i : i + args.batch_size]))

    if not tasks:
        log.info("所有章节均已翻译完成！")
        return

    log.info("开始翻译: 共 %d 个批次 (并发=%d, 模型=%s)", len(tasks), cfg["concurrency"], cfg["model"])
    ch_updates: dict[str, dict[int, str]] = {}
    done_cnt = 0

    with ThreadPoolExecutor(max_workers=cfg["concurrency"]) as ex:
        fut_map = {ex.submit(call_chat_api, cfg, batch, glossary_hint): (ch_id, batch) for ch_id, batch in tasks}
        for fut in as_completed(fut_map):
            ch_id, batch = fut_map[fut]
            res = fut.result()
            ch_updates.setdefault(ch_id, {}).update(res)
            done_cnt += 1
            log.info("翻译进度: %d/%d 批次 (%s +%d 单元)", done_cnt, len(tasks), ch_id, len(res))

            # Incremental save per chapter
            src_file = work / "translations" / "src" / f"{ch_id}.units.md"
            zh_file = zh_dir / f"{ch_id}.txt"
            units = parse_units(src_file)
            merged = parse_existing_zh(zh_file)
            merged.update(ch_updates[ch_id])
            lines = [f"[{uid}] {merged[uid]}" for uid, _ in units if uid in merged]
            zh_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    log.info("API 翻译完成！")


if __name__ == "__main__":
    main()
