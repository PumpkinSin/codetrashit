"""
视频封面拼接工具 — FastAPI 后端
启动: uvicorn main:app --reload --port 8000
或:   python main.py
"""

import json
import os
import time
import urllib.parse
from pathlib import Path

import httpx

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="视频封面拼接工具")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
FONT_DIR = BASE_DIR / "assets" / "fonts"
CONFIG_FILE = BASE_DIR / "config.json"
CACHE_DIR = BASE_DIR / "cache" / "hoyo"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}
FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2"}


# ---------- Config (收藏夹持久化) ----------

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"favorite_folders": []}


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------- Helpers ----------

def scan_images(folder: Path) -> list[dict]:
    """扫描文件夹中的图片文件，返回 [{name, path}]。"""
    if not folder.exists() or not folder.is_dir():
        return []
    result = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
            result.append({"name": f.name})
    return result


def scan_fonts(folder: Path) -> list[dict]:
    """扫描字体文件，返回 [{name, file, url}]。"""
    if not folder.exists():
        return []
    result = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in FONT_EXTS:
            result.append({
                "name": f.stem,
                "file": f.name,
                "url": f"/api/file?path={urllib.parse.quote(str(f))}",
            })
    return result


# ---------- API: 文件夹浏览 ----------

@app.get("/api/browse")
def browse_folder(path: str = Query(..., description="文件夹绝对路径")):
    """浏览指定文件夹，返回子文件夹列表和图片列表。"""
    folder = Path(path)
    if not folder.exists():
        raise HTTPException(404, f"路径不存在: {path}")
    if not folder.is_dir():
        raise HTTPException(400, f"不是文件夹: {path}")

    subdirs = []
    images = []
    try:
        for item in sorted(folder.iterdir()):
            if item.name.startswith('.'):
                continue
            if item.is_dir():
                subdirs.append({"name": item.name, "path": str(item)})
            elif item.is_file() and item.suffix.lower() in IMAGE_EXTS:
                images.append({
                    "name": item.name,
                    "url": f"/api/file?path={urllib.parse.quote(str(item))}",
                })
    except PermissionError:
        raise HTTPException(403, f"无权限访问: {path}")

    parent = str(folder.parent) if folder.parent != folder else None

    return {
        "current": str(folder),
        "parent": parent,
        "subdirs": subdirs,
        "images": images,
    }


@app.get("/api/drives")
def list_drives():
    """列出可用的磁盘驱动器（Windows）或根目录。"""
    if os.name == 'nt':
        import string
        drives = []
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                drives.append({"name": f"{letter}:", "path": drive})
        return drives
    else:
        return [{"name": "/", "path": "/"}]


@app.get("/api/file")
def serve_file(path: str = Query(...)):
    """返回指定路径的文件。"""
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(file_path)


# ---------- API: 收藏夹 ----------

@app.get("/api/favorites")
def get_favorites():
    """获取收藏的文件夹列表。"""
    cfg = load_config()
    return cfg.get("favorite_folders", [])


@app.post("/api/favorites")
def add_favorite(data: dict):
    """添加文件夹到收藏。"""
    folder_path = data.get("path", "").strip()
    name = data.get("name", "").strip()
    if not folder_path:
        raise HTTPException(400, "路径不能为空")
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, f"文件夹不存在: {folder_path}")

    if not name:
        name = folder.name or folder_path

    cfg = load_config()
    favs = cfg.get("favorite_folders", [])

    # 避免重复
    for f in favs:
        if f["path"] == folder_path:
            raise HTTPException(400, "已经收藏过了")

    favs.append({"name": name, "path": folder_path})
    cfg["favorite_folders"] = favs
    save_config(cfg)
    return {"ok": True}


@app.delete("/api/favorites")
def remove_favorite(path: str = Query(...)):
    """从收藏中移除文件夹。"""
    cfg = load_config()
    favs = cfg.get("favorite_folders", [])
    cfg["favorite_folders"] = [f for f in favs if f["path"] != path]
    save_config(cfg)
    return {"ok": True}


# ---------- API: 字体 ----------

@app.get("/api/fonts")
def list_fonts():
    """返回 fonts 文件夹下的字体列表。"""
    return scan_fonts(FONT_DIR)


# ---------- API: HoYoverse 游戏素材 ----------

HOYO_SOURCES = {
    "genshin_characters": {
        "game": "genshin", "category": "角色",
        "url": "https://gi.yatta.moe/api/v2/chs/avatar",
        "cache_json": "genshin_characters.json",
        "cache_subdir": "genshin_char",
    },
    "starrail_characters": {
        "game": "starrail", "category": "角色",
        "url": "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/cn/characters.json",
        "cache_json": "starrail_characters.json",
        "cache_subdir": "starrail_char",
    },
    "zzz_characters": {
        "game": "zzz", "category": "角色",
        "url": None,
        "cache_json": "zzz_characters.json",
        "cache_subdir": "zzz_char",
    },
}

CACHE_TTL = 86400 * 3650  # ~10年，不自动过期，手动点🔄刷新


def _parse_genshin_chars(data: dict) -> list[dict]:
    items = data.get("data", {}).get("items", {})
    result = []
    seen = set()
    for k, v in items.items():
        name = v.get("name", "")
        if name in seen or not name:
            continue
        seen.add(name)
        icon = v.get("icon", "")
        if not icon:
            continue
        result.append({
            "id": str(v.get("id", k)), "name": name,
            "rarity": v.get("rank", 4), "element": v.get("element", ""),
            "icon_url": f"https://enka.network/ui/{icon}.png",
            "filename": f"{icon}.png",
        })
    result.sort(key=lambda x: (-x["rarity"], x["name"]))
    return result



def _parse_starrail_chars(data: dict) -> list[dict]:
    result = []
    for k, v in data.items():
        cid = v.get("id", k)
        name = v.get("name", "")
        preview = v.get("preview", "")
        if not name or not preview:
            continue
        result.append({
            "id": str(cid), "name": name,
            "rarity": v.get("rarity", 4), "element": v.get("element", ""),
            "icon_url": f"https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/{preview}",
            "filename": f"sr_{cid}.png",
        })
    result.sort(key=lambda x: (-x["rarity"], x["name"]))
    return result


def _get_zzz_characters() -> list[dict]:
    agents = [
        ("1011", "安比·德玛拉", 4), ("1021", "妮可·德玛拉", 4),
        ("1031", "比利·基德", 4), ("1041", "艾莲·乔", 5),
        ("1061", "莱卡恩", 5), ("1081", "格莉丝", 4),
        ("1091", "可琳", 4), ("1101", "珠", 5),
        ("1111", "本", 4), ("1121", "露西", 4),
        ("1131", "派派", 4), ("1141", "11号", 5),
        ("1151", "苍角", 5), ("1161", "赛斯", 4),
        ("1171", "索恩", 5), ("1181", "猫又", 5),
        ("1191", "安东", 4), ("1201", "简", 5),
        ("1211", "朱鸢", 5), ("1221", "雅", 5),
        ("1241", "丽娜", 5), ("1251", "塞斯", 5),
        ("1261", "千冬", 5), ("1271", "哈露", 5),
        ("1281", "紫月", 5), ("1311", "燕秋", 5),
        ("1381", "灵", 5),
    ]
    result = []
    for cid, name, rarity in agents:
        result.append({
            "id": cid, "name": name, "rarity": rarity, "element": "",
            "icon_url": f"https://act-webstatic.mihoyo.com/game_record/zzz/role_square_avatar/role_square_avatar_{cid}.png",
            "filename": f"zzz_{cid}.png",
        })
    result.sort(key=lambda x: (-x["rarity"], x["name"]))
    return result


_PARSERS = {
    "genshin_characters": _parse_genshin_chars,
    "starrail_characters": _parse_starrail_chars,
}


async def _download_image(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        return
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                dest.write_bytes(resp.content)
    except Exception:
        pass


async def _batch_download(tasks):
    import asyncio
    sem = asyncio.Semaphore(5)
    async def limited(t):
        async with sem:
            await t
    await asyncio.gather(*[limited(t) for t in tasks], return_exceptions=True)


@app.get("/api/hoyo/resources")
async def hoyo_resources(source: str = Query(..., description="e.g. genshin_characters, genshin_monsters, starrail_characters, zzz_characters")):
    """获取游戏资源列表，自动缓存图片。"""
    if source not in HOYO_SOURCES:
        raise HTTPException(400, f"不支持的资源: {source}")

    cfg = HOYO_SOURCES[source]
    cache_json = CACHE_DIR / cfg["cache_json"]
    img_dir = CACHE_DIR / cfg["cache_subdir"]
    img_dir.mkdir(parents=True, exist_ok=True)

    # Check cache
    items = None
    if cache_json.exists():
        age = time.time() - cache_json.stat().st_mtime
        if age < CACHE_TTL:
            try:
                items = json.loads(cache_json.read_text(encoding="utf-8"))
            except Exception:
                pass

    # Fetch fresh
    if items is None:
        if source == "zzz_characters":
            items = _get_zzz_characters()
        else:
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    resp = await client.get(cfg["url"])
                    resp.raise_for_status()
                    raw = resp.json()
                parser = _PARSERS.get(source)
                if parser:
                    items = parser(raw)
                else:
                    items = []
            except Exception as e:
                if cache_json.exists():
                    items = json.loads(cache_json.read_text(encoding="utf-8"))
                else:
                    raise HTTPException(502, f"无法获取资源: {e}")

        cache_json.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

    # Background download
    import asyncio
    tasks = []
    for it in items:
        dest = img_dir / it["filename"]
        if not dest.exists():
            tasks.append(_download_image(it["icon_url"], dest))
    if tasks:
        asyncio.create_task(_batch_download(tasks))

    # Build response
    result = []
    for it in items:
        dest = img_dir / it["filename"]
        local_url = f"/api/file?path={urllib.parse.quote(str(dest))}" if dest.exists() else it["icon_url"]
        result.append({
            "id": it["id"], "name": it["name"],
            "rarity": it["rarity"], "element": it.get("element", ""),
            "url": local_url, "cached": dest.exists(),
        })
    return {"source": source, "game": cfg["game"], "category": cfg["category"], "items": result}


# Keep old endpoint for backwards compat
@app.get("/api/hoyo/characters")
async def hoyo_characters(game: str = Query(...)):
    return await hoyo_resources(source=f"{game}_characters")


@app.get("/api/hoyo/refresh")
async def hoyo_refresh(source: str = Query(...)):
    if source not in HOYO_SOURCES:
        raise HTTPException(400, f"不支持的资源: {source}")
    cache_json = CACHE_DIR / HOYO_SOURCES[source]["cache_json"]
    if cache_json.exists():
        cache_json.unlink()
    return await hoyo_resources(source=source)


@app.get("/api/hoyo/retry_image")
async def hoyo_retry_image(source: str = Query(...), name: str = Query(...)):
    """重试下载单张图片，同步等待下载完成后返回本地URL。"""
    if source not in HOYO_SOURCES:
        raise HTTPException(400, f"不支持的资源: {source}")
    cfg = HOYO_SOURCES[source]
    cache_json = CACHE_DIR / cfg["cache_json"]
    img_dir = CACHE_DIR / cfg["cache_subdir"]
    img_dir.mkdir(parents=True, exist_ok=True)

    if not cache_json.exists():
        raise HTTPException(404, "缓存不存在，请先加载资源列表")

    items = json.loads(cache_json.read_text(encoding="utf-8"))
    target = None
    for it in items:
        if it["name"] == name:
            target = it
            break
    if not target:
        raise HTTPException(404, f"未找到: {name}")

    dest = img_dir / target["filename"]
    # Force re-download (delete existing broken file if any)
    if dest.exists() and dest.stat().st_size == 0:
        dest.unlink()

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(target["icon_url"])
            if resp.status_code == 200 and len(resp.content) > 0:
                dest.write_bytes(resp.content)
            else:
                raise HTTPException(502, f"下载失败: HTTP {resp.status_code}")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"下载失败: {e}")

    local_url = f"/api/file?path={urllib.parse.quote(str(dest))}"
    return {"ok": True, "url": local_url}


# ---------- 前端页面 ----------

@app.get("/", response_class=HTMLResponse)
def serve_index():
    html_path = BASE_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


# ---------- 启动 ----------

if __name__ == "__main__":
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    fonts = scan_fonts(FONT_DIR)
    cfg = load_config()
    favs = cfg.get("favorite_folders", [])
    print("\n  [*] Cover Composer Tool")
    print(f"  Fonts:      {FONT_DIR}  ({len(fonts)} fonts)")
    print(f"  Favorites:  {len(favs)} folders")
    for fv in favs:
        print(f"              ⭐ {fv['name']} → {fv['path']}")
    print("  Open browser: http://localhost:8000\n")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
