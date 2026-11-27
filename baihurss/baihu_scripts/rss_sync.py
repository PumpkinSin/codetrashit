#!/usr/bin/env python3
"""
白虎面板 B站(仅视频) + 知乎(全部动态) 手动名单 RSS 抓取与同步脚本
特性：
  - 支持 CookieCloud 自动拉取最新大号 Cookie（也支持环境变量兜底）
  - 仅抓取 sources.yaml 中手动维护的名单，不抓账号关注流
  - 分批游标轮询（Cursor Batching）+ 随机间隔防风控
  - 结合最新 RSSHub 规则：B站 WBI 投稿视频接口（无动态/图文），知乎单人动态 + 图片防盗链清洗
  - 零第三方 S3 库实现 AWS S3 SigV4 上传 Cloudflare R2
  - 自动推送精简数据至通用推送服务端 (push-server)
"""

import argparse
import datetime
import hashlib
import hmac
import html
import json
import os
import random
import re
import time
from email.utils import formatdate
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from xml.sax.saxutils import escape as xml_escape

import requests

from cookiecloud_client import fetch_cookie_dict, get_domain_cookie_string

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("BAIHURSS_DATA_DIR", str(SCRIPT_DIR / "baihurss_data")))
SOURCES_FILE = Path(os.environ.get("BAIHURSS_SOURCES_FILE", str(SCRIPT_DIR / "sources.yaml")))

# CookieCloud 配置
CC_URL = os.environ.get("COOKIECLOUD_URL", "").strip()
CC_UUID = os.environ.get("COOKIECLOUD_UUID", "").strip()
CC_PASS = os.environ.get("COOKIECLOUD_PASSWORD", "").strip()

# R2 配置
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "").strip()
R2_BUCKET = os.environ.get("R2_BUCKET_NAME", "").strip()
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").strip().rstrip("/")
RSS_BILI_KEY = os.environ.get("RSS_BILIBILI_KEY", "bilibili.xml").strip()
RSS_ZHIHU_KEY = os.environ.get("RSS_ZHIHU_KEY", "zhihu.xml").strip()
RSS_BILI_TITLE = os.environ.get("RSS_BILIBILI_TITLE", "B站订阅视频").strip()
RSS_ZHIHU_TITLE = os.environ.get("RSS_ZHIHU_TITLE", "知乎订阅动态").strip()
RSS_MAX_ITEMS = int(os.environ.get("RSS_MAX_ITEMS", "200"))

# 推送服务端配置
PUSH_SERVER_URL = os.environ.get("PUSH_SERVER_URL", "http://192.168.31.2:3457").strip().rstrip("/")
PUSH_TOKEN = os.environ.get("PUSH_TOKEN", "").strip()

# 分批风控参数
BILI_BATCH_SIZE = int(os.environ.get("BILI_BATCH_SIZE", "8"))
ZHIHU_BATCH_SIZE = int(os.environ.get("ZHIHU_BATCH_SIZE", "4"))
BILI_PER_USER_LIMIT = int(os.environ.get("BILI_PER_USER_LIMIT", "5"))
ZHIHU_PER_USER_LIMIT = int(os.environ.get("ZHIHU_PER_USER_LIMIT", "5"))

# Telegram 告警
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()
TG_USER_ID = os.environ.get("TG_USER_ID", "").strip()

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# WBI 混淆表 (Bilibili 官方)
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]


def send_tg(msg: str):
    if not TG_BOT_TOKEN or not TG_USER_ID:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
            json={"chat_id": TG_USER_ID, "text": msg, "disable_web_page_preview": True},
            timeout=15,
        )
    except Exception as exc:
        print(f"[TG] 发送失败: {exc}")


def proxy_image(url: str) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    if "wsrv.nl" in url:
        return url
    return f"https://wsrv.nl/?url={quote(url, safe='')}"


def parse_sources(path: Path) -> dict:
    """轻量解析 sources.yaml（支持可选 '| mode' 后缀，不依赖 PyYAML）。"""
    result = {"bilibili": [], "zhihu": []}
    seen = {"bilibili": set(), "zhihu": set()}
    if not path.exists():
        return result
    section = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.endswith(":"):
            sec = line[:-1].strip().lower()
            section = sec if sec in result else None
            continue
        if section and line.startswith("-"):
            val = line[1:].strip().strip('"').strip("'")
            mode = "video" if section == "bilibili" else "all"
            if "|" in val:
                val, mode = [x.strip() for x in val.split("|", 1)]
            if not val or mode == "none":
                continue
            if section == "bilibili":
                m = re.search(r"space\.bilibili\.com/(\d+)", val)
                uid = m.group(1) if m else (val if val.isdigit() else "")
                if uid and uid not in seen["bilibili"]:
                    seen["bilibili"].add(uid)
                    result["bilibili"].append({"id": uid, "mode": mode})
            elif section == "zhihu":
                m = re.search(r"zhihu\.com/(?:people|org)/([^/?#]+)", val)
                tok = m.group(1) if m else val
                if tok and tok not in seen["zhihu"]:
                    seen["zhihu"].add(tok)
                    result["zhihu"].append({"id": tok, "mode": mode})
    return result


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def resolve_cookies() -> dict:
    cookies = {
        "bilibili": os.environ.get("BILIBILI_COOKIE", "").strip(),
        "zhihu": os.environ.get("ZHIHU_COOKIE", "").strip(),
    }
    if CC_URL and CC_UUID and CC_PASS:
        try:
            cc_data = fetch_cookie_dict(CC_URL, CC_UUID, CC_PASS)
            b_cc = get_domain_cookie_string(cc_data, "bilibili.com")
            z_cc = get_domain_cookie_string(cc_data, "zhihu.com")
            if b_cc:
                cookies["bilibili"] = b_cc
                print(f"[CookieCloud] 已获取 bilibili.com Cookie ({len(b_cc)} chars)")
            if z_cc:
                cookies["zhihu"] = z_cc
                print(f"[CookieCloud] 已获取 zhihu.com Cookie ({len(z_cc)} chars)")
        except Exception as exc:
            print(f"[CookieCloud] 拉取失败，回退环境变量 Cookie: {exc}")
    return cookies


# ============================================================
# B站抓取 (RSSHub bilibili/video.ts 风格：仅视频投稿)
# ============================================================
def get_wbi_mixin_key(session: requests.Session) -> str:
    resp = session.get("https://api.bilibili.com/x/web-interface/nav", timeout=15)
    data = resp.json().get("data", {})
    wbi = data.get("wbi_img", {})
    img_key = wbi.get("img_url", "").rsplit("/", 1)[-1].split(".")[0]
    sub_key = wbi.get("sub_url", "").rsplit("/", 1)[-1].split(".")[0]
    raw = img_key + sub_key
    if len(raw) < 64:
        return ""
    return "".join(raw[i] for i in MIXIN_KEY_ENC_TAB)[:32]


def sign_wbi(params: dict, mixin_key: str) -> dict:
    p = {k: re.sub(r"[!'()*]", "", str(v)) for k, v in params.items()}
    p["wts"] = str(int(time.time()))
    query = urlencode(sorted(p.items()))
    p["w_rid"] = hashlib.md5((query + mixin_key).encode("utf-8")).hexdigest()
    return p


def fetch_bilibili_batch(uids: list, state: dict, cookie: str) -> tuple:
    if not uids:
        print("[B站] 名单为空，跳过")
        return [], False
    if not cookie:
        print("[B站] 未配置 Cookie，跳过")
        return [], False

    cursor = int(state.get("bilibili_cursor", 0)) % len(uids)
    batch = [uids[(cursor + i) % len(uids)] for i in range(min(BILI_BATCH_SIZE, len(uids)))]
    state["bilibili_cursor"] = (cursor + len(batch)) % len(uids)
    print(f"[B站] 本批抓取 {len(batch)}/{len(uids)} 位 UP 主 (cursor {cursor} -> {state['bilibili_cursor']})")

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Cookie": cookie, "Referer": "https://www.bilibili.com/"})

    mixin_key = get_wbi_mixin_key(session)
    if not mixin_key:
        print("[B站] 获取 WBI 密钥失败")
        return [], False

    items = []
    auth_failed = False
    for idx, entry in enumerate(batch, 1):
        uid = entry["id"] if isinstance(entry, dict) else entry
        mode = entry.get("mode", "video") if isinstance(entry, dict) else "video"
        try:
            if mode == "all":
                # 订阅全部动态（含图文/视频）
                r = session.get(
                    "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space",
                    params={"host_mid": uid, "features": "itemOpusStyle"},
                    headers={"Referer": f"https://space.bilibili.com/{uid}/dynamic"},
                    timeout=15,
                )
                j = r.json()
                code = j.get("code", -1)
                if code in (-101, -352, -412):
                    print(f"[B站] [{idx}/{len(batch)}] uid={uid} (all) 风控/未登录 code={code}")
                    if code == -101:
                        auth_failed = True
                        break
                    time.sleep(random.uniform(4, 7))
                    continue
                dlist = (j.get("data", {}).get("items") or [])[:BILI_PER_USER_LIMIT]
                print(f"[B站] [{idx}/{len(batch)}] uid={uid} (all) 获取 {len(dlist)} 条动态")
                for d in dlist:
                    did = str(d.get("id_str") or "")
                    mods = d.get("modules") or {}
                    mod_author = mods.get("module_author") or {}
                    author = mod_author.get("name", "")
                    avatar = mod_author.get("face", "")
                    if avatar.startswith("//"):
                        avatar = "https:" + avatar
                    pub_ts = int(mod_author.get("pub_ts") or 0)
                    dyn = mods.get("module_dynamic") or {}
                    major = dyn.get("major") or {}
                    if major.get("type") == "MAJOR_TYPE_ARCHIVE" and major.get("archive"):
                        arc = major["archive"]
                        bvid = arc.get("bvid", "")
                        pic = arc.get("cover", "")
                        if pic.startswith("//"):
                            pic = "https:" + pic
                        items.append({
                            "id": bvid or did, "bvid": bvid, "title": arc.get("title", ""),
                            "author": author, "mid": str(uid), "avatar": avatar,
                            "link": f"https://www.bilibili.com/video/{bvid}" if bvid else f"https://t.bilibili.com/{did}",
                            "cover": pic, "duration": arc.get("duration_text", ""),
                            "publishTime": pub_ts,
                            "content": f'<p><img src="{proxy_image(pic)}" referrerpolicy="no-referrer"/></p><p>{html.escape(arc.get("desc",""))}</p>',
                        })
                    else:
                        text = ((dyn.get("desc") or {}).get("text") or ((major.get("opus") or {}).get("summary") or {}).get("text") or "").strip()
                        title = f"[{author} 动态] {(text or did)[:45]}"
                        pics = ((major.get("opus") or {}).get("pics") or []) + ((major.get("draw") or {}).get("items") or [])
                        imgs_html = "".join(f'<p><img src="{proxy_image(p.get("url") or p.get("src",""))}" referrerpolicy="no-referrer"/></p>' for p in pics if (p.get("url") or p.get("src")))
                        items.append({
                            "id": did, "bvid": "", "title": title, "author": author, "mid": str(uid), "avatar": avatar,
                            "link": f"https://t.bilibili.com/{did}", "cover": "", "duration": "",
                            "publishTime": pub_ts,
                            "content": f"<p>{html.escape(text).replace(chr(10), '<br/>')}</p>{imgs_html}",
                        })
                if idx < len(batch):
                    time.sleep(random.uniform(2.0, 4.0))
                continue

            params = sign_wbi(
                {"mid": uid, "pn": 1, "ps": BILI_PER_USER_LIMIT, "order": "pubdate", "tid": 0},
                mixin_key,
            )
            r = session.get(
                "https://api.bilibili.com/x/space/wbi/arc/search",
                params=params,
                headers={"Referer": f"https://space.bilibili.com/{uid}/video"},
                timeout=15,
            )
            j = r.json()
            code = j.get("code", -1)
            if code in (-101, -352, -412):
                print(f"[B站] [{idx}/{len(batch)}] uid={uid} 触发风控/未登录 code={code}: {j.get('message')}")
                if code == -101:
                    auth_failed = True
                    break
                time.sleep(random.uniform(4, 7))
                continue
            vlist = j.get("data", {}).get("list", {}).get("vlist") or []
            print(f"[B站] [{idx}/{len(batch)}] uid={uid} 获取 {len(vlist)} 条视频")
            for v in vlist:
                bvid = v.get("bvid")
                if not bvid:
                    continue
                pic = v.get("pic", "")
                if pic.startswith("//"):
                    pic = "https:" + pic
                desc_text = html.escape(v.get("description") or "").replace("\n", "<br/>")
                content_html = f'<p><img src="{proxy_image(pic)}" referrerpolicy="no-referrer"/></p><p>{desc_text}</p>'
                items.append(
                    {
                        "id": bvid,
                        "bvid": bvid,
                        "title": v.get("title", ""),
                        "author": v.get("author", ""),
                        "mid": str(v.get("mid", uid)),
                        "link": f"https://www.bilibili.com/video/{bvid}",
                        "cover": pic,
                        "duration": v.get("length", ""),
                        "publishTime": int(v.get("created", 0)),
                        "content": content_html,
                    }
                )
        except Exception as exc:
            print(f"[B站] [{idx}/{len(batch)}] uid={uid} 异常: {exc}")
        if idx < len(batch):
            time.sleep(random.uniform(2.0, 4.0))

    return items, auth_failed


# ============================================================
# 知乎抓取 (RSSHub zhihu/activities.ts + utils.ts 风格：全部动态)
# ============================================================
def clean_zhihu_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    s = re.sub(r"<noscript[\s\S]*?</noscript>", "", raw_html, flags=re.IGNORECASE)
    s = re.sub(r'<a[^>]*data-draft-type=["\']mcn-link-card["\'][^>]*>[\s\S]*?</a>', "", s, flags=re.IGNORECASE)

    def _unwrap_link(m):
        qs = parse_qs(urlparse(html.unescape(m.group(1))).query)
        target = qs.get("target", [""])[0]
        return f'href="{unquote(target)}"' if target else m.group(0)

    s = re.sub(r'href="(https?://link\.zhihu\.com/\?target=[^"]+)"', _unwrap_link, s)

    def _fix_img(m):
        tag = m.group(0)
        src_m = re.search(r'data-original="([^"]+)"', tag) or re.search(r'data-actualsrc="([^"]+)"', tag) or re.search(r'src="([^"]+)"', tag)
        if not src_m:
            return tag
        real_url = html.unescape(src_m.group(1))
        if real_url.startswith("data:image/svg"):
            return ""
        return f'<img src="{proxy_image(real_url)}" referrerpolicy="no-referrer"/>'

    s = re.sub(r"<img\b[^>]*>", _fix_img, s, flags=re.IGNORECASE)
    return s


def fetch_zhihu_batch(tokens: list, state: dict, cookie: str) -> tuple:
    if not tokens:
        print("[知乎] 名单为空，跳过")
        return [], False
    if not cookie:
        print("[知乎] 未配置 Cookie，跳过")
        return [], False

    cursor = int(state.get("zhihu_cursor", 0)) % len(tokens)
    batch = [tokens[(cursor + i) % len(tokens)] for i in range(min(ZHIHU_BATCH_SIZE, len(tokens)))]
    state["zhihu_cursor"] = (cursor + len(batch)) % len(tokens)
    print(f"[知乎] 本批抓取 {len(batch)}/{len(tokens)} 位答主 (cursor {cursor} -> {state['zhihu_cursor']})")

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": UA,
            "Cookie": cookie,
            "x-api-version": "3.0.91",
            "Accept": "application/json, text/plain, */*",
        }
    )

    items = []
    auth_failed = False
    for idx, entry in enumerate(batch, 1):
        tok = entry["id"] if isinstance(entry, dict) else entry
        mode = entry.get("mode", "all") if isinstance(entry, dict) else "all"
        try:
            if mode == "answers":
                url = f"https://www.zhihu.com/api/v4/members/{tok}/answers?limit={ZHIHU_PER_USER_LIMIT}&include=data[*].is_normal,content"
            else:
                url = f"https://www.zhihu.com/api/v3/moments/{tok}/activities?limit={ZHIHU_PER_USER_LIMIT}&desktop=true&ws_qiangzhisafe=0"
            r = session.get(url, headers={"Referer": f"https://www.zhihu.com/people/{tok}"}, timeout=15)
            if r.status_code in (401, 403):
                print(f"[知乎] [{idx}/{len(batch)}] {tok} HTTP {r.status_code}: {r.text[:160]}")
                if r.status_code == 401 or "40362" in r.text or "10003" in r.text:
                    auth_failed = True
                    break
                time.sleep(random.uniform(5, 8))
                continue
            data = r.json().get("data") or []
            print(f"[知乎] [{idx}/{len(batch)}] {tok} ({mode}) 获取 {len(data)} 条")
            for act in data:
                if mode == "answers":
                    q = act.get("question") or {}
                    author_obj = act.get("author") or {}
                    actor = author_obj.get("name") or tok
                    avatar = author_obj.get("avatar_url") or ""
                    aid = str(act.get("id") or "")
                    created = int(act.get("created_time") or act.get("updated_time") or 0)
                    items.append({
                        "id": f"ans_{aid}",
                        "title": f"[{actor} 回答] {q.get('title', '回答')}",
                        "author": actor,
                        "mid": tok,
                        "avatar": avatar,
                        "link": f"https://www.zhihu.com/question/{q.get('id', '')}/answer/{aid}",
                        "cover": "",
                        "publishTime": created,
                        "content": clean_zhihu_html(act.get("content") or act.get("excerpt") or ""),
                    })
                    continue
                act_id = str(act.get("id") or "")
                verb = act.get("action_text") or act.get("verb") or "动态"
                actor_obj = act.get("actor") or {}
                actor = actor_obj.get("name") or tok
                avatar = actor_obj.get("avatar_url") or ""
                target = act.get("target") or {}
                t_type = target.get("type", "")
                created = int(act.get("created_time") or target.get("created_time") or target.get("updated_time") or 0)

                if t_type == "answer":
                    q = target.get("question") or {}
                    title = f"[{actor} {verb}] {q.get('title', '回答')}"
                    link = f"https://www.zhihu.com/question/{q.get('id', '')}/answer/{target.get('id', '')}"
                    body = clean_zhihu_html(target.get("content") or target.get("excerpt") or "")
                elif t_type == "article":
                    title = f"[{actor} {verb}] {target.get('title', '专栏文章')}"
                    link = f"https://zhuanlan.zhihu.com/p/{target.get('id', '')}"
                    body = clean_zhihu_html(target.get("content") or target.get("excerpt") or "")
                elif t_type == "pin":
                    raw_text = target.get("excerpt_title") or ""
                    parts = []
                    for c in target.get("content") or []:
                        if c.get("type") == "text":
                            parts.append(f"<p>{c.get('content', '')}</p>")
                        elif c.get("type") == "image" and c.get("url"):
                            parts.append(f'<p><img src="{proxy_image(c["url"])}" referrerpolicy="no-referrer"/></p>')
                    title = f"[{actor} {verb}] {(raw_text or '想法')[:45]}"
                    link = f"https://www.zhihu.com/pin/{target.get('id', '')}"
                    body = "".join(parts) or clean_zhihu_html(target.get("content_html") or "")
                else:
                    q_title = target.get("title") or (target.get("question") or {}).get("title") or verb
                    title = f"[{actor} {verb}] {q_title}"
                    link = target.get("url", f"https://www.zhihu.com/people/{tok}").replace("api.zhihu.com/questions", "www.zhihu.com/question")
                    body = clean_zhihu_html(target.get("content") or target.get("excerpt") or "")

                if not act_id:
                    act_id = hashlib.md5(f"{tok}:{link}:{created}".encode()).hexdigest()

                items.append(
                    {
                        "id": act_id,
                        "title": title,
                        "author": actor,
                        "mid": tok,
                        "avatar": avatar,
                        "link": link,
                        "cover": "",
                        "publishTime": created,
                        "content": body,
                    }
                )
        except Exception as exc:
            print(f"[知乎] [{idx}/{len(batch)}] {tok} 异常: {exc}")
        if idx < len(batch):
            time.sleep(random.uniform(3.0, 6.0))

    return items, auth_failed


# ============================================================
# RSS 2.0 生成与 Cloudflare R2 S3 SigV4 上传
# ============================================================
def build_rss_xml(title: str, link: str, desc: str, items: list) -> str:
    now_rfc = formatdate(time.time(), usegmt=True)
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"  <title>{xml_escape(title)}</title>",
        f"  <link>{xml_escape(link)}</link>",
        f"  <description>{xml_escape(desc)}</description>",
        f"  <lastBuildDate>{now_rfc}</lastBuildDate>",
    ]
    for it in items:
        pub = formatdate(int(it.get("publishTime") or time.time()), usegmt=True)
        out.append("  <item>")
        out.append(f"    <title>{xml_escape(it.get('title', ''))}</title>")
        out.append(f"    <link>{xml_escape(it.get('link', ''))}</link>")
        out.append(f"    <guid isPermaLink=\"false\">{xml_escape(str(it.get('id', '')))}</guid>")
        out.append(f"    <pubDate>{pub}</pubDate>")
        if it.get("author"):
            out.append(f"    <author>{xml_escape(it['author'])}</author>")
        if it.get("cover"):
            out.append(f'    <enclosure url="{xml_escape(proxy_image(it["cover"]))}" type="image/jpeg"/>')
        content = (it.get("content") or "").replace("]]>", "]]]]><![CDATA[>")
        out.append(f"    <description><![CDATA[{content}]]></description>")
        out.append("  </item>")
    out.append("</channel>")
    out.append("</rss>")
    return "\n".join(out)


def upload_to_r2(key: str, body_bytes: bytes, content_type: str = "application/xml; charset=utf-8") -> bool:
    if not (CF_ACCOUNT_ID and R2_BUCKET and R2_ACCESS_KEY and R2_SECRET_KEY):
        print(f"[R2] 未完整配置 R2 环境变量，跳过上传 {key}")
        return False

    host = f"{CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
    region = "auto"
    service = "s3"
    canonical_uri = f"/{R2_BUCKET}/{quote(key.lstrip('/'), safe='/')}"
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body_bytes).hexdigest()

    canonical_headers = f"content-type:{content_type}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = f"PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"

    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = f"AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode()).hexdigest()}"

    def _sign(k, msg):
        return hmac.new(k, msg.encode("utf-8"), hashlib.sha256).digest()

    k_date = _sign(("AWS4" + R2_SECRET_KEY).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    k_signing = _sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    auth_header = f"AWS4-HMAC-SHA256 Credential={R2_ACCESS_KEY}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    url = f"https://{host}{canonical_uri}"
    resp = requests.put(
        url,
        data=body_bytes,
        headers={
            "Content-Type": content_type,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            "Authorization": auth_header,
        },
        timeout=30,
    )
    if 200 <= resp.status_code < 300:
        pub = f"{R2_PUBLIC_URL}/{key.lstrip('/')}" if R2_PUBLIC_URL else key
        print(f"[R2] 上传成功: {pub} ({len(body_bytes)} bytes)")
        return True
    print(f"[R2] 上传失败 HTTP {resp.status_code}: {resp.text[:200]}")
    return False


def push_to_server(channel: str, items: list):
    if not PUSH_SERVER_URL:
        return
    slim = [
        {
            "id": it.get("id"),
            "bvid": it.get("bvid", ""),
            "title": it.get("title", ""),
            "author": it.get("author", ""),
            "mid": it.get("mid", ""),
            "avatar": it.get("avatar", ""),
            "link": it.get("link", ""),
            "cover": it.get("cover", ""),
            "duration": it.get("duration", ""),
            "publishTime": it.get("publishTime", 0),
        }
        for it in items
    ]
    headers = {"Content-Type": "application/json"}
    if PUSH_TOKEN:
        headers["X-Push-Token"] = PUSH_TOKEN
    try:
        r = requests.post(
            f"{PUSH_SERVER_URL}/api/push/{channel}",
            json={"mode": "replace", "max_items": RSS_MAX_ITEMS, "items": slim},
            headers=headers,
            timeout=15,
        )
        print(f"[PushServer] 推送 {channel} -> HTTP {r.status_code}: {r.text[:120]}")
    except Exception as exc:
        print(f"[PushServer] 推送 {channel} 失败: {exc}")


def merge_items(existing: list, fetched: list) -> tuple:
    by_id = {str(x["id"]): x for x in existing if x.get("id")}
    new_count = 0
    for it in fetched:
        k = str(it["id"])
        if k not in by_id:
            new_count += 1
        by_id[k] = it
    merged = sorted(by_id.values(), key=lambda x: int(x.get("publishTime") or 0), reverse=True)[:RSS_MAX_ITEMS]
    return merged, new_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=["all", "bilibili", "zhihu"], default="all")
    parser.add_argument("--force-sync", action="store_true", help="即使无新增也强制上传 R2 与推送服务端")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sources = parse_sources(SOURCES_FILE)
    state_file = DATA_DIR / "state.json"
    state = load_json(state_file, {})
    cookies = resolve_cookies()

    if args.platform in ("all", "bilibili"):
        fetched, auth_err = fetch_bilibili_batch(sources["bilibili"], state, cookies["bilibili"])
        if auth_err:
            send_tg("⚠️ B站 RSS 抓取鉴权失败（Cookie 过期），请检查 Vivaldi CookieCloud 同步状态。")
        store_file = DATA_DIR / "bilibili.json"
        existing = load_json(store_file, [])
        merged, new_cnt = merge_items(existing, fetched)
        print(f"[B站] 本批新增 {new_cnt} 条，累计保留 {len(merged)} 条")
        if new_cnt > 0 or (args.force_sync and merged):
            save_json(store_file, merged)
            xml_str = build_rss_xml(RSS_BILI_TITLE, "https://www.bilibili.com/", "B站手动订阅视频流", merged)
            upload_to_r2(RSS_BILI_KEY, xml_str.encode("utf-8"))
            push_to_server("bilibili", merged)

    if args.platform in ("all", "zhihu"):
        fetched, auth_err = fetch_zhihu_batch(sources["zhihu"], state, cookies["zhihu"])
        if auth_err:
            send_tg("⚠️ 知乎 RSS 抓取触发风控或 Cookie 过期，请检查 Vivaldi CookieCloud 或浏览器登录状态。")
        store_file = DATA_DIR / "zhihu.json"
        existing = load_json(store_file, [])
        merged, new_cnt = merge_items(existing, fetched)
        print(f"[知乎] 本批新增 {new_cnt} 条，累计保留 {len(merged)} 条")
        if new_cnt > 0 or (args.force_sync and merged):
            save_json(store_file, merged)
            xml_str = build_rss_xml(RSS_ZHIHU_TITLE, "https://www.zhihu.com/", "知乎手动订阅动态流", merged)
            upload_to_r2(RSS_ZHIHU_KEY, xml_str.encode("utf-8"))
            push_to_server("zhihu", merged)

    save_json(state_file, state)


if __name__ == "__main__":
    main()
