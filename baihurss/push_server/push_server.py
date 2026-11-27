#!/usr/bin/env python3
"""
通用轻量推送服务端 (push-server) + 订阅名单管理前端
零第三方依赖，支持：
  GET  /                           内置订阅管理 WebUI（打开时自动向吉签中出扩展拉取新主页链接）
  GET  /health                     健康检查
  GET  /api/channels               列出已有推送频道及条数
  GET  /api/feed/<channel>         读取频道数据（支持 ?limit=50）
  POST /api/push/<channel>         写入频道数据
  GET  /api/users                  获取订阅用户列表（自动从 sources.yaml 初始化）
  POST /api/users/sync-bookmarks   合并吉签中出书签中的 B站/知乎主页（新发现默认不推送）
  POST /api/users/update           更新单个用户模式 / 手动添加 / 删除，并实时写回 sources.yaml
"""

import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("PUSH_HOST", "0.0.0.0")
PORT = int(os.environ.get("PUSH_PORT", "3457"))
DATA_DIR = Path(os.environ.get("PUSH_DATA_DIR", "/app/push-server/data"))
SOURCES_FILE = Path(os.environ.get("PUSH_SOURCES_FILE", "/app/push-server/sources.yaml"))
USERS_FILE = DATA_DIR / "_users.json"
PUSH_TOKEN = os.environ.get("PUSH_TOKEN", "").strip()
DEFAULT_MAX_ITEMS = int(os.environ.get("PUSH_MAX_ITEMS", "200"))

CHANNEL_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
BILI_URL_RE = re.compile(r"space\.bilibili\.com/(\d+)")
ZHIHU_URL_RE = re.compile(r"zhihu\.com/(?:people|org)/([^/?#]+)")


def sanitize_channel(name: str):
    return name if CHANNEL_RE.match(name) else None


def channel_file(channel: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{channel}.json"


def load_channel(channel: str) -> dict:
    fp = channel_file(channel)
    if not fp.exists():
        return {"channel": channel, "updatedAt": 0, "items": []}
    try:
        return json.loads(fp.read_text(encoding="utf-8"))
    except Exception:
        return {"channel": channel, "updatedAt": 0, "items": []}


def save_channel(channel: str, items: list, mode: str = "replace", max_items: int = DEFAULT_MAX_ITEMS) -> dict:
    if mode == "merge":
        existing = load_channel(channel).get("items", [])
        merged = {}
        for item in existing + items:
            key = str(item.get("id") or item.get("bvid") or item.get("url") or json.dumps(item, sort_keys=True))
            merged[key] = item
        items = list(merged.values())
        items.sort(key=lambda x: x.get("publishTime") or x.get("pubdate") or 0, reverse=True)

    if max_items > 0:
        items = items[:max_items]

    payload = {
        "channel": channel,
        "updatedAt": int(time.time()),
        "count": len(items),
        "items": items,
    }
    fp = channel_file(channel)
    tmp = fp.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(fp)
    if channel in ("bilibili", "zhihu"):
        backfill_user_avatars(channel, items)
    return payload


def backfill_user_avatars(platform: str, items: list):
    """顺带把抓取响应里已有的头像/昵称回填到 _users.json（零额外请求）。"""
    if not items:
        return
    try:
        users = load_users()
        bucket = users.get(platform, {})
        changed = False
        for it in items:
            uid = str(it.get("mid") or "").strip()
            if not uid or uid not in bucket:
                continue
            u = bucket[uid]
            av = str(it.get("avatar") or "").strip()
            if av and u.get("avatar") != av:
                u["avatar"] = av
                changed = True
            author = str(it.get("author") or "").strip()
            if author and (not u.get("name") or u.get("name") == uid):
                u["name"] = author
                changed = True
        if changed:
            save_users(users, sync_yaml=False)
    except Exception:
        pass


def parse_profile_url(url: str):
    """识别 B 站或知乎用户主页链接，返回 (platform, id, normalized_url) 或 None。"""
    u = (url or "").strip()
    m = BILI_URL_RE.search(u)
    if m:
        uid = m.group(1)
        return ("bilibili", uid, f"https://space.bilibili.com/{uid}")
    m = ZHIHU_URL_RE.search(u)
    if m:
        tok = m.group(1)
        return ("zhihu", tok, f"https://www.zhihu.com/people/{tok}")
    return None


def import_users_from_sources_yaml() -> dict:
    """首次启动时从现有 sources.yaml 导入用户列表。"""
    users = {"bilibili": {}, "zhihu": {}}
    if not SOURCES_FILE.exists():
        return users
    section = None
    for raw_line in SOURCES_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
        comment = ""
        if "#" in raw_line:
            code_part, comment = raw_line.split("#", 1)
            comment = comment.strip()
        else:
            code_part = raw_line
        line = code_part.strip()
        if not line:
            continue
        if line.endswith(":"):
            sec = line[:-1].strip().lower()
            section = sec if sec in users else None
            continue
        if section and line.startswith("-"):
            val = line[1:].strip().strip('"').strip("'")
            mode = "video" if section == "bilibili" else "all"
            if "|" in val:
                val, mode = [x.strip() for x in val.split("|", 1)]
            parsed = parse_profile_url(val)
            if not parsed:
                if section == "bilibili" and val.isdigit():
                    parsed = ("bilibili", val, f"https://space.bilibili.com/{val}")
                elif section == "zhihu" and val:
                    parsed = ("zhihu", val, f"https://www.zhihu.com/people/{val}")
            if parsed:
                plat, uid, norm_url = parsed
                users[plat][uid] = {
                    "id": uid,
                    "name": comment or uid,
                    "url": norm_url,
                    "mode": mode,
                    "source": "imported",
                    "addedAt": int(time.time()),
                }
    return users


def load_users() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            if "bilibili" in data and "zhihu" in data:
                return data
        except Exception:
            pass
    data = import_users_from_sources_yaml()
    save_users(data, sync_yaml=False)
    return data


def write_sources_yaml(users: dict):
    """将所有非 none 模式的订阅用户实时写回白虎的 sources.yaml。"""
    lines = [
        "# 由 push-server WebUI 自动维护（仅包含已开启推送的用户）",
        "# B站支持模式: video (仅视频), all (全部动态)",
        "# 知乎支持模式: all (全部动态), answers (仅回答)",
        "bilibili:",
    ]
    for u in sorted(users.get("bilibili", {}).values(), key=lambda x: x.get("name", "")):
        mode = u.get("mode", "none")
        if mode == "none":
            continue
        suffix = f" | {mode}" if mode != "video" else ""
        lines.append(f"  - {u['url']}{suffix}  # {u.get('name', u['id'])}")
    lines.append("")
    lines.append("zhihu:")
    for u in sorted(users.get("zhihu", {}).values(), key=lambda x: x.get("name", "")):
        mode = u.get("mode", "none")
        if mode == "none":
            continue
        suffix = f" | {mode}" if mode != "all" else ""
        lines.append(f"  - {u['url']}{suffix}  # {u.get('name', u['id'])}")
    lines.append("")
    try:
        SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
        SOURCES_FILE.write_text("\n".join(lines), encoding="utf-8")
    except Exception as exc:
        print(f"[push-server] 写入 sources.yaml 失败: {exc}", flush=True)


def save_users(users: dict, sync_yaml: bool = True):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = USERS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(USERS_FILE)
    if sync_yaml:
        write_sources_yaml(users)


WEB_UI_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="baihurss-push-server" content="1" />
<title>推送服务端 · 订阅管理</title>
<style>
  :root { --bg:#121318; --card:#1b1d25; --border:#2b2f3c; --text:#e6e8ef; --muted:#8f96a8; --accent:#00aeec; --green:#22c55e; --danger:#ef4444; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
  .wrap { max-width:1120px; margin:0 auto; padding:24px 18px 48px; }
  header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
  h1 { margin:0; font-size:20px; font-weight:600; }
  .badge { font-size:12px; padding:3px 9px; border-radius:999px; background:#232735; color:var(--muted); }
  .badge.ok { background:rgba(34,197,94,.16); color:#4ade80; }
  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; }
  .tabs { display:flex; gap:6px; background:var(--card); padding:4px; border-radius:10px; border:1px solid var(--border); }
  .tab { border:none; background:transparent; color:var(--muted); padding:7px 14px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:500; }
  .tab.active { background:var(--accent); color:#0b1117; }
  input[type=text], select { background:var(--card); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:7px 10px; font-size:13px; outline:none; }
  input[type=text]:focus, select:focus { border-color:var(--accent); }
  .btn { cursor:pointer; border:1px solid var(--border); background:var(--card); color:var(--text); padding:7px 12px; border-radius:8px; font-size:13px; }
  .btn.primary { background:var(--accent); color:#0b1117; border-color:var(--accent); font-weight:600; }
  .btn.danger { color:#f87171; border-color:rgba(239,68,68,.35); }
  .btn:hover { opacity:.88; }
  .add-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; padding:12px; background:var(--card); border:1px solid var(--border); border-radius:12px; }
  .add-row input { flex:1; min-width:220px; }
  .list { display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:14px; }
  .card { position:relative; display:flex; flex-direction:column; gap:14px; padding:16px; background:var(--card); border:1px solid var(--border); border-radius:14px; transition:border-color .16s ease, transform .16s ease, opacity .16s ease, box-shadow .16s ease; }
  .card:hover { border-color:#3d4458; transform:translateY(-1px); box-shadow:0 8px 24px rgba(0,0,0,.28); }
  .card.active-sub { border-color:rgba(0,174,236,.35); background:linear-gradient(180deg, rgba(0,174,236,.05) 0%, var(--card) 55%); }
  .card.off { opacity:.68; }
  .card.off:hover { opacity:.95; }
  .card-top { display:flex; align-items:center; gap:14px; min-width:0; }
  .avatar-wrap { width:54px; height:54px; border-radius:50%; flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:700; color:#fff; box-shadow:0 2px 10px rgba(0,0,0,.35); border:2px solid rgba(255,255,255,.08); user-select:none; }
  .avatar-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
  .card-info { min-width:0; flex:1; padding-right:22px; }
  .name { font-size:15px; font-weight:600; display:flex; align-items:center; gap:6px; min-width:0; }
  .name a { color:var(--text); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .name a:hover { color:var(--accent); }
  .src-tag { font-size:11px; padding:1px 6px; border-radius:4px; background:#262b3a; color:var(--muted); flex-shrink:0; }
  .src-tag.sidebar { background:rgba(0,174,236,.16); color:#38bdf8; }
  .uid-line { font-size:12px; color:var(--muted); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .del-btn { position:absolute; top:10px; right:10px; width:24px; height:24px; border-radius:6px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:15px; line-height:1; display:flex; align-items:center; justify-content:center; opacity:.55; transition:background .15s, color .15s, opacity .15s; }
  .del-btn:hover { background:rgba(239,68,68,.16); color:#f87171; opacity:1; }
  .mode-pills { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; background:#14161d; padding:4px; border-radius:10px; border:1px solid rgba(255,255,255,.05); }
  .mode-pill { border:none; background:transparent; color:var(--muted); padding:6px 4px; border-radius:7px; cursor:pointer; font-size:12.5px; font-weight:500; transition:background .15s, color .15s; }
  .mode-pill:hover { color:var(--text); background:rgba(255,255,255,.05); }
  .mode-pill.on { background:var(--accent); color:#0b1117; font-weight:600; }
  .mode-pill.on-off { background:#2a2f3d; color:#d4d7e0; font-weight:600; }
  .toast { position:fixed; bottom:20px; right:20px; background:#232838; color:#fff; padding:10px 16px; border-radius:8px; border:1px solid var(--accent); font-size:13px; display:none; z-index:99; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div style="display:flex;align-items:center;gap:10px;">
      <h1>📡 推送服务端 · 订阅管理</h1>
      <span id="bridgeStatus" class="badge">等待吉签中出连接…</span>
    </div>
    <button class="btn" id="syncSidebarBtn">🔄 从吉签中出拉取新主页</button>
  </header>

  <div class="bar">
    <div class="tabs">
      <button class="tab active" data-plat="bilibili">B 站 (<span id="cntBili">0</span>)</button>
      <button class="tab" data-plat="zhihu">知乎 (<span id="cntZhihu">0</span>)</button>
    </div>
    <input type="text" id="searchInput" placeholder="搜索昵称 / UID / 链接…" style="flex:1;min-width:180px;" />
    <select id="filterMode">
      <option value="all_items">全部状态</option>
      <option value="enabled">仅已开启推送</option>
      <option value="none">仅未推送</option>
    </select>
  </div>

  <div class="add-row">
    <input type="text" id="newUrl" placeholder="粘贴 B 站主页 (space.bilibili.com/xxx) 或知乎主页 (zhihu.com/people/xxx)" />
    <input type="text" id="newName" placeholder="备注昵称（可选）" style="max-width:200px;" />
    <button class="btn primary" id="addBtn">+ 手动添加</button>
  </div>

  <div id="userList" class="list"></div>
</div>
<div id="toast" class="toast"></div>

<script>
let state = { bilibili: {}, zhihu: {} };
let curPlat = 'bilibili';
let bridgeReady = false;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = 'none', 2600);
}

async function loadUsers() {
  const r = await fetch('/api/users');
  const d = await r.json();
  state = d.users || { bilibili: {}, zhihu: {} };
  render();
}

function render() {
  const bVals = Object.values(state.bilibili || {});
  const zVals = Object.values(state.zhihu || {});
  document.getElementById('cntBili').textContent = `${bVals.filter(u => u.mode !== 'none').length}/${bVals.length}`;
  document.getElementById('cntZhihu').textContent = `${zVals.filter(u => u.mode !== 'none').length}/${zVals.length}`;

  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const f = document.getElementById('filterMode').value;
  let list = Object.values(state[curPlat] || {});
  if (q) list = list.filter(u => (u.name||'').toLowerCase().includes(q) || (u.id||'').toLowerCase().includes(q) || (u.url||'').toLowerCase().includes(q));
  if (f === 'enabled') list = list.filter(u => u.mode !== 'none');
  if (f === 'none') list = list.filter(u => u.mode === 'none');

  // 新发现未推送的优先排在最上面方便挑选，其次按昵称排序
  list.sort((a, b) => {
    if ((a.source === 'sidebar' && a.mode === 'none') !== (b.source === 'sidebar' && b.mode === 'none')) {
      return (a.source === 'sidebar' && a.mode === 'none') ? -1 : 1;
    }
    return (b.addedAt || 0) - (a.addedAt || 0);
  });

  const box = document.getElementById('userList');
  if (list.length === 0) {
    box.innerHTML = '<div style="text-align:center;padding:40px;color:#8f96a8;">暂无匹配用户</div>';
    return;
  }

  const opts = curPlat === 'bilibili'
    ? [['none','不推送'],['video','仅视频'],['all','全部动态']]
    : [['none','不推送'],['all','全部动态'],['answers','仅回答']];

  const gradients = [
    'linear-gradient(135deg,#0ea5e9,#2563eb)',
    'linear-gradient(135deg,#ec4899,#8b5cf6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#10b981,#0d9488)',
    'linear-gradient(135deg,#6366f1,#a855f7)',
    'linear-gradient(135deg,#14b8a6,#0284c7)'
  ];
  function pickGrad(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return gradients[h % gradients.length];
  }

  box.innerHTML = list.map(u => {
    const displayName = u.name || u.id || '?';
    const initial = escapeHtml(Array.from(displayName.trim())[0] || '?');
    const grad = pickGrad(u.id || displayName);
    const avatarHtml = u.avatar
      ? `<img src="${escapeHtml(u.avatar)}" referrerpolicy="no-referrer" alt="" onerror="this.remove();this.parentElement.textContent='${escapeAttr(initial)}';" />`
      : initial;
    const isOff = u.mode === 'none';
    return `
      <div class="card ${isOff ? 'off' : 'active-sub'}">
        <button class="del-btn" title="移除" onclick="deleteUser('${curPlat}','${escapeAttr(u.id)}')">×</button>
        <div class="card-top">
          <a href="${u.url}" target="_blank" rel="noopener" class="avatar-wrap" style="background:${grad};text-decoration:none;">${avatarHtml}</a>
          <div class="card-info">
            <div class="name">
              <a href="${u.url}" target="_blank" rel="noopener" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</a>
              ${u.source === 'sidebar' ? '<span class="src-tag sidebar">吉签中出</span>' : ''}
            </div>
            <div class="uid-line" title="${escapeHtml(u.url)}">${curPlat === 'bilibili' ? 'UID: ' : '@'}${escapeHtml(u.id)}</div>
          </div>
        </div>
        <div class="mode-pills">
          ${opts.map(([v, lbl]) => {
            const cls = u.mode === v ? (v === 'none' ? 'on-off' : 'on') : '';
            return `<button type="button" class="mode-pill ${cls}" onclick="updateMode('${curPlat}','${escapeAttr(u.id)}','${v}')">${lbl}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(s) { return String(s||'').replace(/'/g,"\\'"); }

async function updateMode(plat, id, mode) {
  const r = await fetch('/api/users/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_mode', platform: plat, id, mode })
  });
  const d = await r.json();
  if (d.ok) { state = d.users; render(); toast('已保存并同步到白虎 sources.yaml'); }
}

async function deleteUser(plat, id) {
  if (!confirm('确认从列表移除该用户？')) return;
  const r = await fetch('/api/users/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', platform: plat, id })
  });
  const d = await r.json();
  if (d.ok) { state = d.users; render(); toast('已移除并更新 sources.yaml'); }
}

document.getElementById('addBtn').onclick = async () => {
  const url = document.getElementById('newUrl').value.trim();
  const name = document.getElementById('newName').value.trim();
  if (!url) return;
  const r = await fetch('/api/users/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', url, name })
  });
  const d = await r.json();
  if (d.ok) {
    document.getElementById('newUrl').value = '';
    document.getElementById('newName').value = '';
    state = d.users;
    render();
    toast('已添加（默认不推送，请在右侧选择推送模式）');
  } else {
    toast(d.error || '添加失败');
  }
};

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    curPlat = btn.dataset.plat;
    render();
  };
});
document.getElementById('searchInput').oninput = render;
document.getElementById('filterMode').onchange = render;

function requestSidebarBookmarks() {
  window.postMessage({ type: 'BAIHURSS_REQ_BOOKMARKS' }, '*');
}

window.addEventListener('message', async (ev) => {
  if (ev.source !== window || !ev.data) return;
  if (ev.data.type === 'BAIHURSS_BRIDGE_READY') {
    bridgeReady = true;
    const el = document.getElementById('bridgeStatus');
    el.textContent = '✓ 已连接吉签中出';
    el.classList.add('ok');
    requestSidebarBookmarks();
  }
  if (ev.data.type === 'BAIHURSS_RES_BOOKMARKS') {
    bridgeReady = true;
    const el = document.getElementById('bridgeStatus');
    el.textContent = '✓ 已连接吉签中出';
    el.classList.add('ok');
    const items = ev.data.items || ev.data.bookmarks || [];
    const r = await fetch('/api/users/sync-bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const d = await r.json();
    if (d.ok) {
      state = d.users;
      render();
      if (d.added > 0) toast(`从吉签中出发现了 ${d.added} 个新主页（已默认设为「不推送」）`);
    }
  }
});

document.getElementById('syncSidebarBtn').onclick = () => {
  if (!bridgeReady) toast('未检测到吉签中出扩展响应，请确认已在浏览器启用并刷新吉签中出扩展');
  requestSidebarBookmarks();
};

loadUsers().then(() => setTimeout(requestSidebarBookmarks, 600));
</script>
</body>
</html>
"""


class PushHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Push-Token")

    def _send_json(self, status: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html_str: str):
        body = html_str.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path == "/":
            self._send_html(WEB_UI_HTML)
            return

        if path == "/health":
            self._send_json(200, {"ok": True, "time": int(time.time())})
            return

        if path == "/api/users":
            self._send_json(200, {"ok": True, "users": load_users()})
            return

        if path == "/api/channels":
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            channels = []
            for fp in sorted(DATA_DIR.glob("*.json")):
                if fp.stem.startswith("_"):
                    continue
                data = load_channel(fp.stem)
                channels.append({
                    "channel": fp.stem,
                    "count": len(data.get("items", [])),
                    "updatedAt": data.get("updatedAt", 0),
                })
            self._send_json(200, {"ok": True, "channels": channels})
            return

        if path.startswith("/api/feed/"):
            ch = sanitize_channel(path[len("/api/feed/"):])
            if not ch:
                self._send_json(400, {"ok": False, "error": "invalid channel name"})
                return
            data = load_channel(ch)
            limit = int(qs.get("limit", ["0"])[0] or 0)
            if limit > 0:
                data = dict(data)
                data["items"] = data.get("items", [])[:limit]
                data["count"] = len(data["items"])
            self._send_json(200, data)
            return

        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/users/sync-bookmarks":
            try:
                body = self._read_json_body()
            except Exception as exc:
                self._send_json(400, {"ok": False, "error": f"invalid json: {exc}"})
                return
            users = load_users()
            added = 0
            now = int(time.time())
            for it in body.get("items", []):
                parsed_p = parse_profile_url(it.get("url", ""))
                if not parsed_p:
                    continue
                plat, uid, norm_url = parsed_p
                if uid not in users[plat]:
                    users[plat][uid] = {
                        "id": uid,
                        "name": (it.get("name") or uid).strip(),
                        "url": norm_url,
                        "mode": "none",  # 新发现默认不推送
                        "source": "sidebar",
                        "addedAt": now,
                    }
                    added += 1
            if added > 0:
                save_users(users, sync_yaml=False)  # 默认不推送，不改变 sources.yaml
            self._send_json(200, {"ok": True, "added": added, "users": users})
            return

        if path == "/api/users/update":
            try:
                body = self._read_json_body()
            except Exception as exc:
                self._send_json(400, {"ok": False, "error": f"invalid json: {exc}"})
                return
            users = load_users()
            action = body.get("action")
            if action == "set_mode":
                plat = body.get("platform")
                uid = str(body.get("id", ""))
                mode = body.get("mode", "none")
                if plat in users and uid in users[plat]:
                    users[plat][uid]["mode"] = mode
                    save_users(users, sync_yaml=True)
                    self._send_json(200, {"ok": True, "users": users})
                    return
                self._send_json(404, {"ok": False, "error": "user not found"})
                return
            if action == "delete":
                plat = body.get("platform")
                uid = str(body.get("id", ""))
                if plat in users and uid in users[plat]:
                    del users[plat][uid]
                    save_users(users, sync_yaml=True)
                    self._send_json(200, {"ok": True, "users": users})
                    return
                self._send_json(404, {"ok": False, "error": "user not found"})
                return
            if action == "add":
                parsed_p = parse_profile_url(body.get("url", ""))
                if not parsed_p:
                    self._send_json(400, {"ok": False, "error": "请粘贴有效的 B站 (space.bilibili.com/UID) 或知乎 (zhihu.com/people/xxx) 主页链接"})
                    return
                plat, uid, norm_url = parsed_p
                users[plat][uid] = {
                    "id": uid,
                    "name": (body.get("name") or users[plat].get(uid, {}).get("name") or uid).strip(),
                    "url": norm_url,
                    "mode": users[plat].get(uid, {}).get("mode", "none"),
                    "source": "manual",
                    "addedAt": int(time.time()),
                }
                save_users(users, sync_yaml=True)
                self._send_json(200, {"ok": True, "users": users})
                return
            self._send_json(400, {"ok": False, "error": "unknown action"})
            return

        if not path.startswith("/api/push/"):
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        if PUSH_TOKEN:
            auth = self.headers.get("Authorization", "")
            token = self.headers.get("X-Push-Token", "") or (auth[7:] if auth.startswith("Bearer ") else "")
            if token != PUSH_TOKEN:
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return

        ch = sanitize_channel(path[len("/api/push/"):])
        if not ch:
            self._send_json(400, {"ok": False, "error": "invalid channel name"})
            return

        try:
            body = self._read_json_body()
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": f"invalid json: {exc}"})
            return

        if isinstance(body, list):
            items, mode, max_items = body, "replace", DEFAULT_MAX_ITEMS
        elif isinstance(body, dict):
            items = body.get("items", [])
            mode = body.get("mode", "replace")
            max_items = int(body.get("max_items", DEFAULT_MAX_ITEMS))
        else:
            self._send_json(400, {"ok": False, "error": "body must be list or object"})
            return

        if not isinstance(items, list):
            self._send_json(400, {"ok": False, "error": "items must be a list"})
            return

        saved = save_channel(ch, items, mode=mode, max_items=max_items)
        self._send_json(200, {"ok": True, "channel": ch, "count": saved["count"], "updatedAt": saved["updatedAt"]})

    def log_message(self, fmt, *args):
        print(f"[push-server] {self.address_string()} - {fmt % args}", flush=True)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    load_users()
    server = ThreadingHTTPServer((HOST, PORT), PushHandler)
    print(f"[push-server] listening on http://{HOST}:{PORT} (data={DATA_DIR}, sources={SOURCES_FILE})", flush=True)
    server.serve_forever()
