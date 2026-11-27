import html
import os
import re
import time
from urllib.parse import unquote
import requests

RANKING_URL = os.environ.get(
    "CLIP_RANKING_URL",
    "https://assets.clip-studio.com/zh-tw/ranking?freq=daily&sales=free&content=clipstudio&corp=priv",
)
CLIP_COOKIE = os.environ.get("CLIP_COOKIE", "").strip()
CLAIM_DELAY = float(os.environ.get("CLIP_DELAY", "3"))
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()
TG_USER_ID = os.environ.get("TG_USER_ID", "").strip()

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def send_telegram(text: str) -> None:
    if not TG_BOT_TOKEN or not TG_USER_ID:
        print("未配置 TG_BOT_TOKEN 或 TG_USER_ID，跳过 Telegram 推送")
        return
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
            json={"chat_id": TG_USER_ID, "text": text, "disable_web_page_preview": True},
            timeout=15,
        )
        if resp.status_code == 200:
            print("Telegram 推送成功")
        else:
            print(f"Telegram 推送失败: HTTP {resp.status_code} {resp.text[:200]}")
    except Exception as exc:
        print(f"Telegram 推送异常: {exc}")


def load_cookies(session: requests.Session, cookie_str: str) -> None:
    for item in cookie_str.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        k, v = item.split("=", 1)
        k = k.strip()
        v = v.strip()
        domain = ".clip-studio.com" if k in ("CLIP_AUTH_TOKEN", "timezone_offset") else "assets.clip-studio.com"
        session.cookies.set(k, v, domain=domain, path="/")


def extract_csrf(page_html: str, session: requests.Session, cookie_str: str) -> str:
    m = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', page_html)
    if m:
        return m.group(1)
    xsrf = session.cookies.get("XSRF-TOKEN", domain="assets.clip-studio.com") or session.cookies.get("XSRF-TOKEN")
    if xsrf:
        return unquote(xsrf)
    m = re.search(r"(?:^|;\s*)XSRF-TOKEN=([^;]+)", cookie_str)
    if m:
        return unquote(m.group(1))
    return ""


def parse_ranking_cards(page_html: str):
    """解析排行榜页面中的真实素材卡片（跳过 jsrender 模板）。"""
    cleaned = re.sub(
        r'<script[^>]*id=["\']materialCardTemplate["\'][^>]*>[\s\S]*?</script>',
        "",
        page_html,
        flags=re.IGNORECASE,
    )
    parts = re.split(r'(?=<li\s+class="materialCard[^"]*"\s+data-material-card>)', cleaned)
    cards = []
    for part in parts:
        if "data-material-card" not in part:
            continue
        id_match = re.search(r'href="/[a-z]{2}-[a-z]{2}/detail\?id=(\d+)"', part)
        if not id_match:
            continue
        mat_id = id_match.group(1)
        title_match = re.search(r'<h6\s+title="([^"]*)"', part)
        title = html.unescape(title_match.group(1)).strip() if title_match else f"素材 {mat_id}"
        is_owned = ("purchasedItem" in part.split(">", 1)[0]) or ("materialCard__purchased" in part)
        is_paid = bool(re.search(r"materialCard__price(?:Gold|Clippy)", part))
        cards.append(
            {
                "id": mat_id,
                "title": title,
                "owned": is_owned,
                "paid": is_paid,
            }
        )
    return cards


def claim_material(session: requests.Session, mat_id: str, csrf_token: str, lang: str = "zh-tw"):
    base_ajax = f"https://assets.clip-studio.com/{lang}/detail/ajax"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRF-Token": csrf_token,
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://assets.clip-studio.com",
        "Referer": f"https://assets.clip-studio.com/{lang}/detail?id={mat_id}",
    }

    star_resp = session.post(f"{base_ajax}/register-star", data={"id": mat_id}, headers=headers, timeout=15)
    claim_resp = session.post(
        f"{base_ajax}/purchase-material-free", data={"material_id": mat_id}, headers=headers, timeout=15
    )

    star_ok = 200 <= star_resp.status_code < 300
    claim_ok = 200 <= claim_resp.status_code < 300
    auth_error = star_resp.status_code in (401, 403, 419) or claim_resp.status_code in (401, 403, 419)
    return star_ok, claim_ok, auth_error, claim_resp.status_code, claim_resp.text[:150]


def main():
    if not CLIP_COOKIE:
        msg = "未检测到环境变量 CLIP_COOKIE，请先在白虎「变量机密」中配置 assets.clip-studio.com 的 Cookie。"
        print(msg)
        send_telegram(f"⚠️ CLIP 笔刷入库未执行：{msg}")
        return

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"})
    load_cookies(session, CLIP_COOKIE)

    print(f"正在抓取排行榜: {RANKING_URL}")
    resp = session.get(RANKING_URL, timeout=20)
    if resp.status_code != 200:
        msg = f"抓取排行榜失败: HTTP {resp.status_code}"
        print(msg)
        send_telegram(f"❌ CLIP 笔刷入库失败：{msg}")
        return

    page_html = resp.text
    csrf_token = extract_csrf(page_html, session, CLIP_COOKIE)
    if not csrf_token:
        msg = "未找到 CSRF Token，请检查 CLIP_COOKIE 是否完整或已过期。"
        print(msg)
        send_telegram("⚠️ CLIP 笔刷入库：未找到 CSRF Token，请更新 CLIP_COOKIE。")
        return

    cards = parse_ranking_cards(page_html)
    print(f"共解析到 {len(cards)} 个排行素材")
    if not cards:
        send_telegram("⚠️ CLIP 笔刷入库：未能解析到任何素材卡片，请检查页面结构或网络。")
        return

    owned_count = sum(1 for c in cards if c["owned"])
    paid_count = sum(1 for c in cards if not c["owned"] and c["paid"])
    targets = [c for c in cards if not c["owned"] and not c["paid"]]
    print(f"已入库: {owned_count} 个 | 跳过付费: {paid_count} 个 | 待入库: {len(targets)} 个")

    if not targets:
        print("当前排行榜免费素材已全部入库，无需操作。")
        send_telegram(f"✅ CLIP 每日免费榜巡检完成：共 {len(cards)} 个素材，已全部入库（无需新增）。")
        return

    lang_match = re.search(r"assets\.clip-studio\.com/([a-z]{2}-[a-z]{2})/", RANKING_URL)
    lang = lang_match.group(1) if lang_match else "zh-tw"

    success_items = []
    fail_items = []
    cookie_expired = False

    for idx, item in enumerate(targets, 1):
        mat_id = item["id"]
        title = item["title"]
        try:
            star_ok, claim_ok, auth_err, status_code, body = claim_material(session, mat_id, csrf_token, lang)
            if auth_err:
                print(f"[{idx}/{len(targets)}] {mat_id} ({title}) -> 鉴权失败 HTTP {status_code}，Cookie 可能已过期")
                cookie_expired = True
                fail_items.append(f"{title} ({mat_id}: HTTP {status_code})")
                break
            if claim_ok:
                print(f"[{idx}/{len(targets)}] ✓ 入库成功: {title} (id={mat_id}, 收藏={star_ok})")
                success_items.append(f"• {title} (https://assets.clip-studio.com/{lang}/detail?id={mat_id})")
            else:
                print(f"[{idx}/{len(targets)}] ✗ 入库失败: {title} (id={mat_id}, HTTP {status_code}: {body})")
                fail_items.append(f"{title} ({mat_id}: HTTP {status_code})")
        except Exception as exc:
            print(f"[{idx}/{len(targets)}] ✗ 请求异常: {title} (id={mat_id}): {exc}")
            fail_items.append(f"{title} ({mat_id})")

        if idx < len(targets):
            time.sleep(CLAIM_DELAY)

    lines = [
        "🎨 CLIP 每日免费榜自动入库报告",
        f"扫描: {len(cards)} 个 | 原已入库: {owned_count} 个",
        f"本次成功: {len(success_items)} 个 | 失败: {len(fail_items)} 个",
    ]
    if cookie_expired:
        lines.append("⚠️ 检测到鉴权失败（401/403/419），请更新白虎环境变量 CLIP_COOKIE！")
    if success_items:
        lines.append("\n新增入库：")
        lines.extend(success_items[:15])
        if len(success_items) > 15:
            lines.append(f"...等共 {len(success_items)} 个")
    if fail_items and not cookie_expired:
        lines.append("\n失败列表：")
        lines.extend(fail_items[:5])

    send_telegram("\n".join(lines))


if __name__ == "__main__":
    main()
