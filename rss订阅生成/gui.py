"""
RSS 动态服务管理 GUI
功能：启动/停止服务 · 读取浏览器 Cookie · 平台开关 · B站屏蔽词管理
"""

import os, sys, json, sqlite3, shutil, subprocess, threading, tempfile, re, base64, ctypes, ctypes.wintypes
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk
import pystray
from PIL import Image, ImageDraw, ImageFont, ImageTk

# ── 路径 ──────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent.resolve()
SERVER_DIR  = SCRIPT_DIR / "server"
ENV_FILE    = SERVER_DIR / ".env"
CONFIG_FILE = SCRIPT_DIR / "gui_config.json"
PORT        = 3457

# ── 默认配置 ──────────────────────────────────────────────
DEFAULT_CONFIG = {
    "auto_start":       False,
    "keep_server":      False,
    "no_tray":          False,
    "start_minimized":  False,
    "platform_enabled": {"bilibili.com": True, "zhihu.com": True, "douban.com": True},
}

def load_config() -> dict:
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        cfg = dict(DEFAULT_CONFIG)
        cfg.update({k: v for k, v in data.items() if k != "platform_enabled"})
        cfg["platform_enabled"] = {**DEFAULT_CONFIG["platform_enabled"],
                                    **data.get("platform_enabled", {})}
        return cfg
    except Exception:
        return dict(DEFAULT_CONFIG)

def save_config(cfg: dict):
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

# ── 颜色 ──────────────────────────────────────────────────
BG      = "#1a1b2e"
BG3     = "#0f3460"
SURFACE = "#1e2040"
SURF2   = "#252747"
ACCENT  = "#7c6af7"
ACCENT2 = "#a89cf7"
GREEN   = "#4ade80"
RED     = "#f87171"
TEXT    = "#e2e8f0"
TEXT2   = "#94a3b8"

# ── .env 读写 ─────────────────────────────────────────────
def read_env() -> dict:
    result = {}
    if not ENV_FILE.exists():
        return result
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip()
    return result

def write_env_key(key: str, value: str):
    if not ENV_FILE.exists():
        ENV_FILE.write_text(f"{key}={value}\n", encoding="utf-8")
        return
    content = ENV_FILE.read_text(encoding="utf-8")
    pattern = re.compile(rf"^{re.escape(key)}\s*=.*$", re.MULTILINE)
    new_line = f"{key}={value}"
    if pattern.search(content):
        content = pattern.sub(new_line, content)
    else:
        content = content.rstrip("\n") + f"\n{new_line}\n"
    ENV_FILE.write_text(content, encoding="utf-8")

# ── Chrome 解密 ───────────────────────────────────────────
def _get_chrome_key(user_data_dir: Path):
    try:
        local_state = user_data_dir / "Local State"
        if not local_state.exists():
            return None
        data = json.loads(local_state.read_text(encoding="utf-8"))
        enc_key = base64.b64decode(data["os_crypt"]["encrypted_key"])[5:]
        buf = ctypes.create_string_buffer(enc_key)
        desc_in  = ctypes.wintypes.DATA_BLOB(len(enc_key), buf)
        desc_out = ctypes.wintypes.DATA_BLOB()
        if ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(desc_in), None, None, None, None, 0, ctypes.byref(desc_out)
        ):
            key = ctypes.string_at(desc_out.pbData, desc_out.cbData)
            ctypes.windll.kernel32.LocalFree(desc_out.pbData)
            return key
    except Exception:
        pass
    return None

def _chrome_decrypt(encrypted: bytes, key: bytes) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        if encrypted[:3] in (b"v10", b"v11"):
            return AESGCM(key).decrypt(encrypted[3:15], encrypted[15:], None).decode("utf-8", errors="replace")
    except Exception:
        pass
    return ""

def read_chromium_cookies(profile_dir: Path, domains: list) -> dict:
    db = profile_dir / "Network" / "Cookies"
    if not db.exists():
        db = profile_dir / "Cookies"
    if not db.exists():
        return {}
    key = _get_chrome_key(profile_dir.parent)
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp = f.name
    try:
        shutil.copy2(db, tmp)
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        results = {}
        for domain in domains:
            cur.execute(
                "SELECT name, value, encrypted_value FROM cookies WHERE host_key=? OR host_key=?",
                (domain, "." + domain)
            )
            cmap = {}
            for row in cur.fetchall():
                val = row["value"]
                if not val and row["encrypted_value"] and key:
                    val = _chrome_decrypt(bytes(row["encrypted_value"]), key)
                if row["name"] not in cmap or val:
                    cmap[row["name"]] = val
            if cmap:
                results[domain] = "; ".join(f"{k}={v}" for k, v in cmap.items())
        conn.close()
    finally:
        try: os.unlink(tmp)
        except: pass
    return results

def read_firefox_cookies(profile_dir: Path, domains: list) -> dict:
    db = profile_dir / "cookies.sqlite"
    if not db.exists():
        return {}
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp = f.name
    try:
        shutil.copy2(db, tmp)
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        results = {}
        for domain in domains:
            cur.execute(
                "SELECT name, value FROM moz_cookies WHERE host=? OR host=?",
                (domain, "." + domain)
            )
            cmap = {}
            for row in cur.fetchall():
                if row["name"] not in cmap or row["value"]:
                    cmap[row["name"]] = row["value"]
            if cmap:
                results[domain] = "; ".join(f"{k}={v}" for k, v in cmap.items())
        conn.close()
    finally:
        try: os.unlink(tmp)
        except: pass
    return results

# ── 浏览器 Profile 发现 ───────────────────────────────────
LOCALAPPDATA = Path(os.environ.get("LOCALAPPDATA", ""))
APPDATA      = Path(os.environ.get("APPDATA", ""))

def find_chromium_profiles(name: str) -> list:
    bases = {
        "Chrome":  LOCALAPPDATA / "Google"    / "Chrome"  / "User Data",
        "Vivaldi": LOCALAPPDATA / "Vivaldi"   / "User Data",
        "Edge":    LOCALAPPDATA / "Microsoft" / "Edge"    / "User Data",
    }
    base = bases.get(name)
    if not base or not base.exists():
        return []
    profiles = []
    for entry in base.iterdir():
        if (entry.name == "Default" or entry.name.startswith("Profile ")) and \
           ((entry / "Network" / "Cookies").exists() or (entry / "Cookies").exists()):
            label = entry.name
            try:
                prefs = json.loads((entry / "Preferences").read_text(encoding="utf-8", errors="ignore"))
                n = prefs.get("profile", {}).get("name", "")
                if n: label = f"{entry.name} ({n})"
            except: pass
            profiles.append({"label": label, "profile_dir": entry})
    return sorted(profiles, key=lambda x: x["label"])

def find_firefox_profiles(name: str) -> list:
    bases = {
        "Firefox": APPDATA / "Mozilla" / "Firefox" / "Profiles",
        "Zen":     APPDATA / "zen"     / "Profiles",
    }
    base = bases.get(name)
    if not base or not base.exists():
        return []
    return sorted(
        [{"label": e.name, "profile_dir": e}
         for e in base.iterdir() if e.is_dir() and (e / "cookies.sqlite").exists()],
        key=lambda x: x["label"]
    )

BROWSERS = {
    "Chrome":  {"type": "chromium", "finder": lambda: find_chromium_profiles("Chrome")},
    "Vivaldi": {"type": "chromium", "finder": lambda: find_chromium_profiles("Vivaldi")},
    "Firefox": {"type": "firefox",  "finder": lambda: find_firefox_profiles("Firefox")},
    "Zen":     {"type": "firefox",  "finder": lambda: find_firefox_profiles("Zen")},
}

DOMAINS  = ["bilibili.com", "zhihu.com", "douban.com"]
ENV_KEYS = {"bilibili.com": "BILIBILI_COOKIE", "zhihu.com": "ZHIHU_COOKIE", "douban.com": "DOUBAN_COOKIE"}
LABELS   = {"bilibili.com": "B站 (bilibili.com)", "zhihu.com": "知乎 (zhihu.com)", "douban.com": "豆瓣 (douban.com)"}

# ═══════════════════════════════════════════════════════════
#  主窗口
# ═══════════════════════════════════════════════════════════
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("RSS 动态服务管理")
        self.geometry("820x820")
        self.minsize(700, 640)
        self.configure(bg=BG)
        self.resizable(True, True)

        self._proc:         subprocess.Popen | None = None
        self._log_thread:   threading.Thread | None = None
        self._poll_after                            = None
        self._tray:         pystray.Icon | None     = None
        self._quitting                              = False

        self._cfg = load_config()
        self._var_auto_start     = tk.BooleanVar(value=self._cfg["auto_start"])
        self._var_keep_server    = tk.BooleanVar(value=self._cfg["keep_server"])
        self._var_no_tray        = tk.BooleanVar(value=self._cfg["no_tray"])
        self._var_start_minimized= tk.BooleanVar(value=self._cfg["start_minimized"])

        self._build_ui()
        self._poll_status()
        self._load_profiles()
        self._refresh_cookie_status()

        self.bind("<Unmap>", self._on_unmap)
        self.protocol("WM_DELETE_WINDOW", self._hide_to_tray)

        # 窗口图标
        try:
            self._win_icon = ImageTk.PhotoImage(self._make_icon(64))
            self.iconphoto(True, self._win_icon)
        except Exception:
            pass

        # 启动时静默到托盘（在显示窗口之前 withdraw）
        if self._cfg.get("start_minimized"):
            self.withdraw()
            if not self._cfg.get("no_tray"):
                self._start_tray()

        if self._cfg["auto_start"]:
            self.after(600, self._start_server)

    # ── 图标 ─────────────────────────────────────────────

    def _make_icon(self, size: int, running: bool = False) -> Image.Image:
        img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        r = size // 5
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=(12, 30, 68))
        draw.rounded_rectangle([0, 0, size-1, size//2], radius=r, fill=(30, 60, 110, 55))
        font = None
        for fp in ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/calibrib.ttf",
                   "C:/Windows/Fonts/arial.ttf"]:
            try:
                font = ImageFont.truetype(fp, int(size * 0.42))
                break
            except: pass
        text_col = (180, 160, 255)
        if font:
            bb = draw.textbbox((0, 0), "RSS", font=font)
            tx = (size - (bb[2]-bb[0])) // 2 - bb[0]
            ty = (size - (bb[3]-bb[1])) // 2 - bb[1] - size//12
        else:
            tx, ty = size//6, size//4
        draw.text((tx, ty), "RSS", fill=text_col, font=font)
        dr  = max(3, size // 9)
        pad = max(2, size // 16)
        draw.ellipse([size-dr*2-pad, size-dr*2-pad, size-pad, size-pad],
                     fill=(74, 222, 128) if running else (248, 113, 113))
        return img

    # ── 托盘 ─────────────────────────────────────────────

    def _start_tray(self):
        if self._tray:
            return
        menu = pystray.Menu(
            pystray.MenuItem("显示面板", self._show_from_tray, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("启动服务", lambda *_: self.after(0, self._start_server)),
            pystray.MenuItem("停止服务", lambda *_: self.after(0, self._stop_server)),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出",     self._quit_app),
        )
        self._tray = pystray.Icon("rss_mgr", self._make_icon(32), "RSS 动态服务管理", menu)
        threading.Thread(target=self._tray.run, daemon=True).start()

    def _stop_tray(self):
        if self._tray:
            try: self._tray.stop()
            except: pass
            self._tray = None

    def _update_tray_icon(self, running: bool):
        if self._tray:
            self._tray.icon = self._make_icon(32, running)

    def _on_unmap(self, event):
        if event.widget is self and self.state() == "iconic":
            self._hide_to_tray()

    def _hide_to_tray(self):
        self.withdraw()
        if not self._cfg.get("no_tray"):
            self._start_tray()

    def _show_from_tray(self, *_):
        self.after(0, lambda: (self.deiconify(), self.lift(), self.focus_force()))

    def _quit_app(self, *_):
        self._quitting = True
        self._stop_tray()
        self.after(0, self.destroy)

    # ── UI 构建 ───────────────────────────────────────────

    def _build_ui(self):
        # 标题栏
        hdr = tk.Frame(self, bg=BG3, pady=12)
        hdr.pack(fill=tk.X)
        tk.Label(hdr, text="📡  RSS 动态服务管理", font=("Segoe UI", 16, "bold"),
                 bg=BG3, fg=TEXT).pack(side=tk.LEFT, padx=20)

        paned = tk.PanedWindow(self, orient=tk.VERTICAL, bg=BG,
                               sashrelief=tk.FLAT, sashwidth=6)
        paned.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        top = tk.Frame(paned, bg=BG)
        paned.add(top, minsize=220)
        self._build_service_panel(top)

        mid = tk.Frame(paned, bg=BG)
        paned.add(mid, minsize=240)
        self._build_cookie_panel(mid)

        bot = tk.Frame(paned, bg=BG)
        paned.add(bot, minsize=150)
        self._build_keywords_panel(bot)

    def _card(self, parent, title: str) -> tk.Frame:
        outer = tk.Frame(parent, bg=BG, pady=4)
        outer.pack(fill=tk.BOTH, expand=True)
        tk.Label(outer, text=title, font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=ACCENT2).pack(anchor=tk.W, padx=4, pady=(0, 4))
        inner = tk.Frame(outer, bg=SURFACE, padx=14, pady=10)
        inner.pack(fill=tk.BOTH, expand=True)
        return inner

    def _btn(self, parent, text, bg, cmd, fg=TEXT, pad=(10, 6)):
        b = tk.Button(parent, text=text, command=cmd, bg=bg, fg=fg,
                      activebackground=ACCENT, activeforeground=TEXT,
                      font=("Segoe UI", 9, "bold"), relief=tk.FLAT, bd=0,
                      padx=pad[0], pady=pad[1], cursor="hand2")
        orig = bg
        b.bind("<Enter>", lambda e: b.configure(bg=self._lighten(orig)))
        b.bind("<Leave>", lambda e: b.configure(bg=orig))
        return b

    @staticmethod
    def _lighten(c: str) -> str:
        try:
            r,g,b = int(c[1:3],16), int(c[3:5],16), int(c[5:7],16)
            return f"#{min(255,int(r*1.2+20)):02x}{min(255,int(g*1.2+20)):02x}{min(255,int(b*1.2+20)):02x}"
        except: return c

    # ── 服务控制面板 ──────────────────────────────────────

    def _build_service_panel(self, parent):
        card = self._card(parent, "▶  服务控制")

        # 设置复选框
        cfg_row = tk.Frame(card, bg=SURFACE)
        cfg_row.pack(fill=tk.X, pady=(0, 8))
        for var, text, key in [
            (self._var_auto_start,      "启动时自动运行服务",   "auto_start"),
            (self._var_keep_server,     "退出时保持服务运行",   "keep_server"),
            (self._var_no_tray,         "最小化不显示托盘",     "no_tray"),
            (self._var_start_minimized, "启动时静默到托盘",     "start_minimized"),
        ]:
            tk.Checkbutton(cfg_row, text=text, variable=var,
                           bg=SURFACE, fg=TEXT2, selectcolor=BG3,
                           activebackground=SURFACE, activeforeground=TEXT,
                           font=("Segoe UI", 8), bd=0, cursor="hand2",
                           command=lambda k=key, v=var: self._save_setting(k, v.get())
                           ).pack(side=tk.LEFT, padx=(0, 16))

        # 状态行
        sr = tk.Frame(card, bg=SURFACE)
        sr.pack(fill=tk.X, pady=(0, 8))
        tk.Label(sr, text="状态", font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2).pack(side=tk.LEFT)
        self._dot   = tk.Label(sr, text="●", font=("Segoe UI", 14), bg=SURFACE, fg=TEXT2)
        self._dot.pack(side=tk.LEFT, padx=(8, 4))
        self._slbl  = tk.Label(sr, text="检测中…", font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2)
        self._slbl.pack(side=tk.LEFT)

        # 操作按钮
        br = tk.Frame(card, bg=SURFACE)
        br.pack(fill=tk.X, pady=(0, 8))
        self._btn(br, "▶  启动服务", ACCENT,    self._start_server).pack(side=tk.LEFT, padx=(0,10))
        self._btn(br, "■  停止服务", "#374151", self._stop_server).pack(side=tk.LEFT, padx=(0,10))
        self._btn(br, "↻  手动抓取", BG3,       self._manual_fetch).pack(side=tk.LEFT)

        # 日志
        tk.Label(card, text="服务日志", font=("Segoe UI", 8), bg=SURFACE, fg=TEXT2).pack(anchor=tk.W)
        lf = tk.Frame(card, bg="#0d0f1a")
        lf.pack(fill=tk.BOTH, expand=True, pady=(4, 0))
        self._log = tk.Text(lf, bg="#0d0f1a", fg="#a5f3fc", font=("Consolas", 8),
                            relief=tk.FLAT, bd=0, state=tk.DISABLED, wrap=tk.WORD)
        sb = ttk.Scrollbar(lf, command=self._log.yview)
        self._log.configure(yscrollcommand=sb.set)
        self._log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=6, pady=6)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

    # ── Cookie 管理面板 ───────────────────────────────────

    def _build_cookie_panel(self, parent):
        card = self._card(parent, "🍪  Cookie 管理")

        # 浏览器 / Profile 选择
        sel = tk.Frame(card, bg=SURFACE)
        sel.pack(fill=tk.X, pady=(0, 10))

        tk.Label(sel, text="浏览器", font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2).pack(side=tk.LEFT)
        self._browser_var = tk.StringVar()
        self._browser_cb  = ttk.Combobox(sel, textvariable=self._browser_var,
                                          state="readonly", width=14, font=("Segoe UI", 9))
        self._browser_cb["values"] = list(BROWSERS.keys())
        self._browser_cb.pack(side=tk.LEFT, padx=(8, 12))
        self._browser_cb.bind("<<ComboboxSelected>>", lambda _: self._load_profiles())

        tk.Label(sel, text="Profile", font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2).pack(side=tk.LEFT)
        self._profile_var = tk.StringVar()
        self._profile_cb  = ttk.Combobox(sel, textvariable=self._profile_var,
                                          state="readonly", width=28, font=("Segoe UI", 9))
        self._profile_cb.pack(side=tk.LEFT, padx=(8, 12))
        self._btn(sel, "🔍  读取并保存", GREEN, self._read_all_cookies, fg="#0f172a").pack(side=tk.LEFT)

        # 平台行（每行带开关）
        self._cookie_rows: dict[str, dict] = {}
        for domain in DOMAINS:
            enabled = self._cfg["platform_enabled"].get(domain, True)
            var = tk.BooleanVar(value=enabled)

            row = tk.Frame(card, bg=SURF2, pady=8, padx=10)
            row.pack(fill=tk.X, pady=3)

            tk.Checkbutton(row, variable=var, bg=SURF2, activebackground=SURF2,
                           selectcolor=BG3, bd=0, cursor="hand2",
                           command=lambda d=domain, v=var: self._toggle_platform(d, v.get())
                           ).pack(side=tk.LEFT, padx=(0, 4))

            name_lbl = tk.Label(row, text=LABELS[domain], font=("Segoe UI", 9, "bold"),
                                bg=SURF2, fg=TEXT if enabled else TEXT2, width=22, anchor=tk.W)
            name_lbl.pack(side=tk.LEFT)

            dot = tk.Label(row, text="●", font=("Segoe UI", 11), bg=SURF2,
                           fg=TEXT2 if enabled else "#555577")
            dot.pack(side=tk.LEFT, padx=(0, 6))

            slbl = tk.Label(row, text="未知" if enabled else "已禁用",
                            font=("Segoe UI", 9), bg=SURF2,
                            fg=TEXT2 if enabled else "#555577", width=18, anchor=tk.W)
            slbl.pack(side=tk.LEFT)

            read_btn = self._btn(row, "单独读取", BG3,
                                 lambda d=domain: self._read_one_cookie(d), pad=(6, 3))
            read_btn.pack(side=tk.RIGHT, padx=(0, 4))
            if not enabled:
                read_btn.configure(state=tk.DISABLED, bg="#2a2a3a", cursor="")

            self._cookie_rows[domain] = {
                "dot": dot, "slbl": slbl, "env_key": ENV_KEYS[domain],
                "name_lbl": name_lbl, "btn": read_btn, "var": var,
            }

        tk.Label(card, text="※ 读取前请确保浏览器已关闭（或数据库未被锁定）",
                 font=("Segoe UI", 8), bg=SURFACE, fg=TEXT2).pack(anchor=tk.W, pady=(8, 0))

    # ── 屏蔽词面板 ────────────────────────────────────────

    def _build_keywords_panel(self, parent):
        card = self._card(parent, "🚫  B站屏蔽词（匹配标题/正文，不区分大小写）")

        inp = tk.Frame(card, bg=SURFACE)
        inp.pack(fill=tk.X, pady=(0, 8))
        self._kw_entry = tk.Entry(inp, bg=SURF2, fg=TEXT, insertbackground=TEXT,
                                  relief=tk.FLAT, font=("Segoe UI", 9), bd=0)
        self._kw_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=6, padx=(0, 8))
        self._kw_entry.bind("<Return>", lambda _: self._add_keyword())
        self._btn(inp, "+ 添加", ACCENT, self._add_keyword, pad=(12, 5)).pack(side=tk.LEFT)

        tags_outer = tk.Frame(card, bg=SURF2)
        tags_outer.pack(fill=tk.BOTH, expand=True)
        self._tags_cv = tk.Canvas(tags_outer, bg=SURF2, highlightthickness=0, bd=0)
        tsb = ttk.Scrollbar(tags_outer, orient=tk.VERTICAL, command=self._tags_cv.yview)
        self._tags_cv.configure(yscrollcommand=tsb.set)
        self._tags_cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=6, pady=6)
        tsb.pack(side=tk.RIGHT, fill=tk.Y)
        self._tags_fr = tk.Frame(self._tags_cv, bg=SURF2)
        self._tags_win = self._tags_cv.create_window((0, 0), window=self._tags_fr, anchor="nw")
        self._tags_fr.bind("<Configure>",
                           lambda e: self._tags_cv.configure(scrollregion=self._tags_cv.bbox("all")))
        self._tags_cv.bind("<Configure>",
                           lambda e: self._tags_cv.itemconfig(self._tags_win, width=e.width))
        self._tags_cv.bind("<MouseWheel>",
                           lambda e: self._tags_cv.yview_scroll(-1*(e.delta//120), "units"))
        self._refresh_keywords()

    # ── 日志写入 ──────────────────────────────────────────

    def _log_write(self, msg: str):
        self._log.configure(state=tk.NORMAL)
        ts = datetime.now().strftime("%H:%M:%S")
        self._log.insert(tk.END, f"[{ts}] {msg}\n")
        self._log.see(tk.END)
        self._log.configure(state=tk.DISABLED)

    # ── 服务控制 ──────────────────────────────────────────

    def _start_server(self):
        if self._proc and self._proc.poll() is None:
            self._log_write("⚠ 服务已在运行中")
            return
        try:
            self._log_write("启动 Node.js 服务…")
            self._proc = subprocess.Popen(
                ["node", "server.js"], cwd=str(SERVER_DIR),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            threading.Thread(target=self._pump_logs, daemon=True).start()
            self._set_status(True)
        except FileNotFoundError:
            self._log_write("❌ 未找到 node 命令，请先安装 Node.js")
        except Exception as e:
            self._log_write(f"❌ 启动失败: {e}")

    def _stop_server(self):
        if self._proc and self._proc.poll() is None:
            self._log_write("正在停止服务…")
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try: self._proc.kill()
                except: pass
            self._log_write("✅ 服务已停止")
            self._set_status(False)
        else:
            self._log_write("查找占用端口的进程…")
            subprocess.run(
                f'for /f "tokens=5" %a in (\'netstat -aon ^| findstr ":{PORT}" ^| findstr "LISTENING"\') '
                f'do taskkill /F /PID %a',
                shell=True, capture_output=True
            )
            self._log_write("✅ 已发送停止命令")
            self._set_status(False)

    def _manual_fetch(self):
        def _do():
            try:
                import urllib.request
                req = urllib.request.Request(
                    f"http://localhost:{PORT}/api/fetch", data=b"{}",
                    headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=30) as resp:
                    self.after(0, self._log_write, f"✅ 手动抓取完成: {resp.read().decode()}")
            except Exception as e:
                self.after(0, self._log_write, f"❌ 抓取失败: {e}")
        threading.Thread(target=_do, daemon=True).start()

    def _pump_logs(self):
        try:
            for line in self._proc.stdout:
                line = line.rstrip()
                if line:
                    self.after(0, self._log_write, line)
        except Exception:
            pass
        self.after(0, self._log_write, "— 服务进程已退出 —")
        self.after(0, self._set_status, False)

    def _poll_status(self):
        def _check():
            try:
                import urllib.request
                with urllib.request.urlopen(f"http://localhost:{PORT}/api/status", timeout=2) as resp:
                    data = json.loads(resp.read())
                    self.after(0, self._set_status, True, data)
            except Exception:
                running = bool(self._proc and self._proc.poll() is None)
                self.after(0, self._set_status, running)
        threading.Thread(target=_check, daemon=True).start()
        self._poll_after = self.after(3000, self._poll_status)

    def _set_status(self, running: bool, data: dict = None):
        if running:
            self._dot.configure(fg=GREEN)
            if data:
                u = int(data.get("uptime", 0))
                self._slbl.configure(text=f"运行中 | {u//3600:02d}:{(u%3600)//60:02d}:{u%60:02d}", fg=GREEN)
            else:
                self._slbl.configure(text="运行中", fg=GREEN)
        else:
            self._dot.configure(fg=RED)
            self._slbl.configure(text="已停止", fg=RED)
        self._update_tray_icon(running)

    # ── Cookie 逻辑 ───────────────────────────────────────

    def _load_profiles(self):
        browser = self._browser_var.get()
        if not browser:
            for name in BROWSERS:
                if BROWSERS[name]["finder"]():
                    self._browser_var.set(name)
                    browser = name
                    break
        if not browser:
            return
        profiles = BROWSERS[browser]["finder"]()
        self._profile_cb["values"] = [p["label"] for p in profiles]
        self._profile_cb._profiles = profiles
        if profiles:
            self._profile_cb.current(0)

    def _get_profile_dir(self):
        profiles = getattr(self._profile_cb, "_profiles", [])
        idx = self._profile_cb.current()
        if 0 <= idx < len(profiles):
            return profiles[idx]["profile_dir"]
        return None

    def _read_from_browser(self, domains: list) -> dict:
        browser = self._browser_var.get()
        pdir = self._get_profile_dir()
        if not browser or not pdir:
            raise ValueError("请先选择浏览器和 Profile")
        if BROWSERS[browser]["type"] == "chromium":
            return read_chromium_cookies(pdir, domains)
        return read_firefox_cookies(pdir, domains)

    def _is_enabled(self, domain: str) -> bool:
        return self._cfg["platform_enabled"].get(domain, True)

    def _toggle_platform(self, domain: str, enabled: bool):
        self._cfg["platform_enabled"][domain] = enabled
        save_config(self._cfg)
        w = self._cookie_rows[domain]
        if enabled:
            w["name_lbl"].configure(fg=TEXT)
            w["btn"].configure(state=tk.NORMAL, bg=BG3, cursor="hand2")
            self._log_write(f"▶ {domain} 已启用，请重新读取 Cookie")
            self._refresh_cookie_status()
        else:
            write_env_key(w["env_key"], "")
            w["dot"].configure(fg="#555577")
            w["slbl"].configure(text="已禁用", fg="#555577")
            w["name_lbl"].configure(fg=TEXT2)
            w["btn"].configure(state=tk.DISABLED, bg="#2a2a3a", cursor="")
            self._log_write(f"⏸ {domain} 已禁用，cookie 已清空")

    def _read_all_cookies(self):
        def _do():
            active = [d for d in DOMAINS if self._is_enabled(d)]
            if not active:
                self.after(0, self._log_write, "⚠ 所有平台均已禁用")
                return
            try:
                self.after(0, self._log_write, "正在读取 Cookie…")
                results = self._read_from_browser(active)
                for domain in active:
                    val = results.get(domain)
                    key = ENV_KEYS[domain]
                    if val:
                        write_env_key(key, val)
                        self.after(0, self._log_write, f"✅ {domain} 已更新（{len(val)} 字节）")
                    else:
                        self.after(0, self._log_write, f"⚠ {domain} 未找到 Cookie（可能未登录）")
                self.after(0, self._refresh_cookie_status)
                self.after(0, self._log_write, "✅ 读取完成，已写入 .env")
            except Exception as e:
                self.after(0, self._log_write, f"❌ 读取失败: {e}")
        threading.Thread(target=_do, daemon=True).start()

    def _read_one_cookie(self, domain: str):
        if not self._is_enabled(domain):
            self._log_write(f"⚠ {domain} 已禁用，先打开开关")
            return
        def _do():
            try:
                self.after(0, self._log_write, f"正在读取 {domain} Cookie…")
                results = self._read_from_browser([domain])
                val = results.get(domain)
                key = ENV_KEYS[domain]
                if val:
                    write_env_key(key, val)
                    self.after(0, self._log_write, f"✅ {domain} 已更新（{len(val)} 字节）")
                else:
                    self.after(0, self._log_write, f"⚠ {domain} 未找到 Cookie")
                self.after(0, self._refresh_cookie_status)
            except Exception as e:
                self.after(0, self._log_write, f"❌ 读取失败: {e}")
        threading.Thread(target=_do, daemon=True).start()

    def _refresh_cookie_status(self):
        env = read_env()
        for domain, w in self._cookie_rows.items():
            if not self._is_enabled(domain):
                continue
            val = env.get(w["env_key"], "")
            if val:
                w["dot"].configure(fg=GREEN)
                w["slbl"].configure(text="已配置 ✓", fg=GREEN)
            else:
                w["dot"].configure(fg=RED)
                w["slbl"].configure(text="未配置", fg=RED)

    # ── 屏蔽词逻辑 ────────────────────────────────────────

    def _get_keywords(self) -> list:
        raw = read_env().get("BILIBILI_BLOCK_KEYWORDS", "")
        return [k.strip() for k in raw.split(",") if k.strip()]

    def _save_keywords(self, kws: list):
        write_env_key("BILIBILI_BLOCK_KEYWORDS", ",".join(kws))
        self._log_write(f"✅ 屏蔽词已更新（共 {len(kws)} 个）")

    def _add_keyword(self):
        word = self._kw_entry.get().strip()
        if not word:
            return
        kws = self._get_keywords()
        if word not in kws:
            kws.append(word)
            self._save_keywords(kws)
        self._kw_entry.delete(0, tk.END)
        self._refresh_keywords()

    def _remove_keyword(self, word: str):
        kws = [k for k in self._get_keywords() if k != word]
        self._save_keywords(kws)
        self._refresh_keywords()

    def _refresh_keywords(self):
        for w in self._tags_fr.winfo_children():
            w.destroy()
        kws = self._get_keywords()
        if not kws:
            tk.Label(self._tags_fr, text="暂无屏蔽词",
                     bg=SURF2, fg=TEXT2, font=("Segoe UI", 9)).pack(side=tk.LEFT, padx=8, pady=6)
            return
        row_fr, row_w = None, 0
        for kw in kws:
            tw = len(kw) * 9 + 50
            if row_fr is None or row_w + tw > 660:
                row_fr = tk.Frame(self._tags_fr, bg=SURF2)
                row_fr.pack(anchor=tk.W, pady=2, padx=4)
                row_w = 0
            tag = tk.Frame(row_fr, bg=BG3, padx=8, pady=4)
            tag.pack(side=tk.LEFT, padx=(0, 6))
            tk.Label(tag, text=kw, bg=BG3, fg=TEXT, font=("Segoe UI", 9)).pack(side=tk.LEFT)
            x = tk.Label(tag, text="✕", bg=BG3, fg=TEXT2, font=("Segoe UI", 8), cursor="hand2")
            x.pack(side=tk.LEFT, padx=(4, 0))
            x.bind("<Button-1>", lambda e, w=kw: self._remove_keyword(w))
            x.bind("<Enter>",    lambda e, l=x: l.configure(fg=RED))
            x.bind("<Leave>",    lambda e, l=x: l.configure(fg=TEXT2))
            row_w += tw + 6

    # ── 设置保存 ──────────────────────────────────────────

    def _save_setting(self, key: str, val):
        self._cfg[key] = val
        save_config(self._cfg)

    # ── 退出 ──────────────────────────────────────────────

    def destroy(self):
        if self._poll_after:
            self.after_cancel(self._poll_after)
        self._stop_tray()
        if not self._cfg.get("keep_server"):
            if self._proc and self._proc.poll() is None:
                try: self._proc.terminate()
                except: pass
        super().destroy()


# ── ttk 样式 ──────────────────────────────────────────────
def apply_styles():
    s = ttk.Style()
    s.theme_use("clam")
    s.configure("TCombobox", fieldbackground=SURF2, background=SURF2,
                foreground=TEXT, arrowcolor=ACCENT2, borderwidth=0)
    s.map("TCombobox",
          fieldbackground=[("readonly", SURF2)],
          selectbackground=[("readonly", ACCENT)],
          selectforeground=[("readonly", TEXT)])
    s.configure("Vertical.TScrollbar", background=SURF2, troughcolor=BG,
                borderwidth=0, arrowcolor=ACCENT2)


if __name__ == "__main__":
    app = App()
    apply_styles()
    app.mainloop()
