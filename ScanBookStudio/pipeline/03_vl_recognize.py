# -*- coding: utf-8 -*-
"""阶段 3:PaddleOCR-VL 识别——llama.cpp(Vulkan)逐区块识别,结果落盘可断点续跑。"""
import argparse
import base64
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import (DEFAULT_SERVER_PORT, LLAMA_MAIN_GGUF, LLAMA_MMPROJ_GGUF,
                    LLAMA_SERVER, ROOT, TYPE_TASK, VL_PROMPT, get_logger,
                    load_json, save_json)

log = get_logger("03_vl")

MAX_TOKENS = {"table": 4096, "chart": 3072, "formula": 1024, "seal": 512}


class VlClient:
    def __init__(self, server_url: str, ngl: int = 99, ctx: int = 16384):
        self.url = server_url.rstrip("/")
        self.proc = None
        self.ngl = ngl
        self.ctx = ctx

    def start_server(self):
        cmd = [str(LLAMA_SERVER), "-m", str(LLAMA_MAIN_GGUF),
               "--mmproj", str(LLAMA_MMPROJ_GGUF),
               "--host", "127.0.0.1", "--port", str(DEFAULT_SERVER_PORT),
               "--temp", "0", "-c", str(self.ctx), "-ngl", str(self.ngl)]
        log.info("启动 llama-server:%s", " ".join(cmd))
        self.proc = subprocess.Popen(cmd, cwd=str(LLAMA_SERVER.parent))
        for i in range(180):
            try:
                with urllib.request.urlopen(f"{self.url}/health", timeout=2) as r:
                    if r.status == 200:
                        log.info("llama-server 就绪(等待 %ds)", i)
                        return True
            except Exception:
                time.sleep(1)
        return False

    def ensure(self) -> bool:
        try:
            with urllib.request.urlopen(f"{self.url}/health", timeout=2) as r:
                return r.status == 200
        except Exception:
            return self.start_server()

    def recognize(self, img_path: Path, task: str) -> str:
        b64 = base64.b64encode(img_path.read_bytes()).decode()
        prompt = VL_PROMPT[task]
        payload = {
            "messages": [{"role": "user", "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": prompt},
            ]}],
            "temperature": 0.0,
            "max_tokens": MAX_TOKENS.get(task, 2048),
        }
        req = urllib.request.Request(
            f"{self.url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=600) as r:
                    data = json.loads(r.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"].strip()
            except (urllib.error.URLError, KeyError, TimeoutError) as e:
                log.warning("识别失败(%s),重试 %d/3:%s", task, attempt + 1, e)
                time.sleep(3)
        return ""

    def shutdown(self):
        if self.proc:
            self.proc.terminate()


def main(work: Path, server_url: str, ngl: int):
    manifest = load_json(work / "manifest.json")
    scan_pages = [p for p in manifest["pages"] if p["type"] == "scan"]
    client = VlClient(server_url, ngl=ngl)
    if not client.ensure():
        log.error("llama-server 启动失败")
        raise SystemExit(1)

    t_all = time.time()
    n_calls = 0
    try:
        for p in scan_pages:
            blocks = load_json(work / "blocks" / f"p{p['n']:04d}.json")
            rec_path = work / "blocks" / f"p{p['n']:04d}_rec.json"
            rec = load_json(rec_path) if rec_path.exists() else {}
            t0 = time.time()
            for k, b in enumerate(blocks["blocks"]):
                if str(k) in rec:
                    continue
                task = TYPE_TASK.get(b["type_name"])
                if task is None or not b.get("crop"):
                    continue
                text = client.recognize(work / b["crop"], task)
                rec[str(k)] = {"task": task, "text": text}
                n_calls += 1
            save_json(rec_path, rec)
            log.info("page %d 完成(%d 块,%.1fs,累计 %d 次调用)",
                     p["n"], len(blocks["blocks"]), time.time() - t0, n_calls)
    finally:
        client.shutdown()
    log.info("全部识别完成,共 %d 次调用,耗时 %.1fs", n_calls, time.time() - t_all)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--server", default=f"http://127.0.0.1:{DEFAULT_SERVER_PORT}/")
    ap.add_argument("--ngl", type=int, default=99, help="GPU 层数;CPU 模式用 0")
    args = ap.parse_args()
    main(ROOT / args.work, args.server, args.ngl)
