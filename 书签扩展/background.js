const DEFAULT_SETTINGS = {
  columns: 2,
  sidebarWidth: 460,
  position: "left",
  triggerMode: "mouseover",
  triggerWidth: 3,
  triggerWidthWindowed: 3,
  triggerTop: 0,
  triggerHeight: 100,
  disableInWindowed: false,
  extraTriggers: [],
  openDelay: 250,
  closeDelay: 160,
  idleTimeout: 5000,
  transitionMs: 160,
  preventPageScroll: false,
  closeOnClickBookmark: true,
  openInNewTab: true,
  openTabActive: true,
  openTabPosition: "after",
  rememberLastCategory: false,
  flatFolderMode: false,
  categorySwitchMode: "hover",
  showOtherFolders: true,
  otherFolderAlign: "left",
  trashFolderName: "回收站",
  showPermanentDelete: false,
  showTrashFolder: true,
  folderBgMaskColor: "#000000",
  folderBgMaskOpacity: 0.35,
  folderBgBlur: 0,
  folderBgEffect: "zoom",
  folderTitlePos: "center",
  folderTitleSize: 0,
  folderTitleFont: "",
  folderTitleWeight: 0,
  showFolderTitle: true,
  folderCountPos: "bottom-right",
  showFolderCount: true,
  siteFilterMode: "all",
  siteFilterList: "",
  sidebarSearchBoxes: [],
  bigCardTwoLines: false,
  fadeOverflowText: false,
  titleStripParens: false,
  titleStripDash: false,
  titleStripPipe: false,
  titleStripColon: false,
  titleCustomRegex: "",
  normalFontSize: 14.5,
  normalRowHeight: 36,
  iconSize: 18,
  itemPaddingX: 8,
  itemGap: 4,
  scrollbarWidth: 0,
  bigScale: 1.6,
  tileHeight: 64,
  tileFontSize: 15,
  tileRadius: 0,
  fontFamily: '"DreamW10", "梦源黑体 SC", "Microsoft YaHei", sans-serif',
  fontWeight: 600,
  tooltipMode: "both",
  splitRatio: 0.5,
  themeId: "win-blue",
  bgColor: "#18191c",
  barColor: "#121316",
  accentColor: "#0078d4",
  tileColor: "#22242a",
  bigCardColor: "#212329",
  hoverColor: "#2a2d35",
  backdropOpacity: 0.25,
  textColor: "#d4d7dd",
  newtabIconShape: "bookmarkOutline",
  newtabIconColor: "#e5e7eb",
  newtabIconBg: "transparent",
  customIconSvg: "",
  syncActionIcon: true,
  didaHost: "dida365.com",
  didaToken: "",
  didaClientId: "",
  didaClientSecret: "",
  didaCustomCss: "",
  newtabWallpaperUrl: "",
  newtabSearchEngines: "",
  customCss: "",
  topSlotCount: 3,
  bottomSlotCount: 3,
  topSlotIds: ["", "", "", "", "", ""],
  bottomSlotIds: ["", "", "", "", "", ""],
  topBigCount: [4, 4, 4, 4, 4, 4],
  bottomBigCount: [4, 4, 4, 4, 4, 4],
  defaultTopSlot: 0,
  defaultBottomSlot: 0,
  siteFolderName: "站内",
  siteFolderRules: [],
  siteAutoSwitch: true,
  siteFallbackToFrequent: true,
  frequentFolderName: "常用",
  frequentMaxCount: 20,
  frequentHalfLifeDays: 14,
  showFrequentInOther: true
};

async function restoreCustomActionIcon() {
  try {
    const [syncRes, localRes] = await Promise.all([
      chrome.storage.sync.get(["syncActionIcon"]),
      chrome.storage.local.get(["customActionIconPng"])
    ]);
    if (syncRes.syncActionIcon === false || !localRes.customActionIconPng) return;
    const res = await fetch(localRes.customActionIconPng);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, 32, 32);
    const imageData = ctx.getImageData(0, 0, 32, 32);
    chrome.action.setIcon({ imageData: { 32: imageData } });
  } catch {
    // Keep default icon on error
  }
}

chrome.runtime.onStartup.addListener(() => {
  restoreCustomActionIcon();
});

restoreCustomActionIcon();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }
  // Automatically re-inject content.js into all already-open tabs so no manual F5 is needed
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {});
  }
});

async function toggleActiveTabSidebar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
  } catch {
    // Ignore tabs where content scripts cannot run
  }
}

chrome.action.onClicked.addListener(() => {
  toggleActiveTabSidebar();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidebar") {
    toggleActiveTabSidebar();
  }
});

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

async function resolvePageTitle(url) {
  // 1. Prefer matching open tab (instant, works for address-bar drags & SPA/login pages)
  try {
    const tabs = await chrome.tabs.query({});
    const normalize = (u) => (u || "").replace(/#.*$/, "").replace(/\/$/, "");
    const targetNorm = normalize(url);
    const exactTab = tabs.find((t) => t.url === url && t.title && t.title !== url);
    if (exactTab) return exactTab.title.trim();
    const normTab = tabs.find((t) => normalize(t.url) === targetNorm && t.title && t.title !== t.url);
    if (normTab) return normTab.title.trim();
  } catch {
    // Ignore tabs query errors
  }

  // 2. Fallback: fetch page HTML and parse <title>
  if (!/^https?:\/\//i.test(url)) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") || "";
    let charset = "utf-8";
    const cm = ct.match(/charset=([^\s;]+)/i);
    if (cm) charset = cm[1].replace(/['"]/g, "");
    let html = "";
    try {
      html = new TextDecoder(charset).decode(buf.slice(0, 65536));
    } catch {
      html = new TextDecoder("utf-8").decode(buf.slice(0, 65536));
    }
    const metaCharset = html.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i);
    if (metaCharset && metaCharset[1].toLowerCase() !== charset.toLowerCase()) {
      try {
        html = new TextDecoder(metaCharset[1]).decode(buf.slice(0, 65536));
      } catch {
        // Keep previous decode
      }
    }
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m && m[1]) {
      return decodeHtmlEntities(m[1]);
    }
  } catch {
    // Ignore network/abort errors
  } finally {
    clearTimeout(timer);
  }
  return "";
}

async function recordBookmarkClick(bookmarkId) {
  if (!bookmarkId) return;
  try {
    const [syncRes, localRes] = await Promise.all([
      chrome.storage.sync.get(["frequentHalfLifeDays"]),
      chrome.storage.local.get(["bookmarkStats"])
    ]);
    const halfLifeDays = Math.max(1, Number(syncRes.frequentHalfLifeDays) || 14);
    const stats =
      localRes.bookmarkStats && typeof localRes.bookmarkStats === "object"
        ? { ...localRes.bookmarkStats }
        : {};
    const now = Date.now();
    const prev = stats[bookmarkId];
    let score = 1;
    let count = 1;
    if (prev && typeof prev === "object") {
      const deltaDays = Math.max(0, (now - (Number(prev.lastClick) || now)) / 86400000);
      const decayed = (Number(prev.score) || 0) * Math.pow(0.5, deltaDays / halfLifeDays);
      score = decayed + 1;
      count = (Number(prev.count) || 0) + 1;
    }
    stats[bookmarkId] = {
      score: Math.round(score * 1000) / 1000,
      count,
      lastClick: now
    };
    await chrome.storage.local.set({ bookmarkStats: stats });
  } catch {
    // Ignore storage errors
  }
}

async function collectBaihuRssBookmarks() {
  const [tree, syncRes] = await Promise.all([
    chrome.bookmarks.getTree(),
    chrome.storage.sync.get(["trashFolderName", "siteFolderRules"])
  ]);
  const trashName = (syncRes.trashFolderName || "回收站").trim() || "回收站";
  const seen = new Set();
  const list = [];

  function isTrash(node) {
    if (!node || !node.children) return false;
    if (node.title === trashName) return true;
    return (
      node.parentId === "0" &&
      (node.folderType === "trash" ||
        node.title === "Trash" ||
        node.title === "回收站" ||
        node.title === "已删除")
    );
  }

  function walk(nodes) {
    for (const n of nodes) {
      if (n.children) {
        if (isTrash(n)) continue;
        walk(n.children);
      } else if (n.url) {
        const u = n.url.trim();
        if (!u || seen.has(u)) continue;
        if (/space\.bilibili\.com\/\d+|zhihu\.com\/(?:people|org)\/[^/?#]+/i.test(u)) {
          seen.add(u);
          list.push({ name: (n.title || "").trim() || u, url: u });
        }
      }
    }
  }
  walk(tree);
  return list;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_BAIHURSS_BOOKMARKS") {
    collectBaihuRssBookmarks()
      .then((bookmarks) => sendResponse({ ok: true, bookmarks }))
      .catch(() => sendResponse({ ok: false, bookmarks: [] }));
    return true;
  }
  if (msg?.type === "RECORD_BOOKMARK_CLICK" && msg.bookmarkId) {
    recordBookmarkClick(msg.bookmarkId);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "CLEAR_BOOKMARK_STATS") {
    chrome.storage.local
      .set({ bookmarkStats: {} })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "DIDA_EXCHANGE_CODE") {
    (async () => {
      try {
        const host = msg.host === "ticktick.com" ? "ticktick.com" : "dida365.com";
        const body = new URLSearchParams({
          client_id: msg.clientId || "",
          client_secret: msg.clientSecret || "",
          code: msg.code || "",
          grant_type: "authorization_code",
          scope: "tasks:read tasks:write",
          redirect_uri: msg.redirectUri || ""
        });
        const res = await fetch(`https://${host}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) {
          sendResponse({ ok: false, error: data.error_description || data.error || `HTTP ${res.status}` });
          return;
        }
        sendResponse({ ok: true, accessToken: data.access_token });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }
  if (msg?.type === "DIDA_API") {
    (async () => {
      try {
        const host = msg.host === "ticktick.com" ? "ticktick.com" : "dida365.com";
        const url = `https://api.${host}${msg.path}`;
        const headers = {
          Authorization: `Bearer ${msg.token || ""}`
        };
        const opts = { method: msg.method || "GET", headers };
        if (msg.body !== undefined) {
          headers["Content-Type"] = "application/json";
          opts.body = JSON.stringify(msg.body);
        }
        const res = await fetch(url, opts);
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        if (!res.ok) {
          sendResponse({
            ok: false,
            status: res.status,
            error: (data && (data.errorMessage || data.error)) || `HTTP ${res.status}`
          });
          return;
        }
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }
  if (msg?.type === "RESOLVE_PAGE_TITLE" && msg.url && msg.bookmarkId) {
    resolvePageTitle(msg.url)
      .then(async (title) => {
        if (title) {
          await chrome.bookmarks.update(msg.bookmarkId, { title }).catch(() => {});
        }
        sendResponse({ ok: true, title });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "OPEN_URL" && msg.url) {
    if (msg.bookmarkId) {
      recordBookmarkClick(msg.bookmarkId);
    }
    if (msg.newTab) {
      const createOpts = {
        url: msg.url,
        active: msg.background ? false : Boolean(msg.active ?? true)
      };
      if (msg.position === "after" && sender?.tab?.index !== undefined) {
        createOpts.index = sender.tab.index + 1;
      }
      chrome.tabs.create(createOpts);
    } else if (sender?.tab?.id) {
      chrome.tabs.update(sender.tab.id, { url: msg.url });
    }
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "OPEN_SHORTCUTS") {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
