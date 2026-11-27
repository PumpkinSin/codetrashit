const THEMES = [
  {
    id: "win-blue",
    name: "Fluent 2 深邃",
    bgColor: "#202020",
    barColor: "#1c1c1c",
    accentColor: "#0078d4",
    tileColor: "#2b2b2b",
    bigCardColor: "#282828",
    hoverColor: "#333333",
    textColor: "#f3f3f3"
  },
  {
    id: "oled-black",
    name: "极简纯黑 OLED",
    bgColor: "#09090b",
    barColor: "#000000",
    accentColor: "#2563eb",
    tileColor: "#16161a",
    bigCardColor: "#141418",
    hoverColor: "#222229",
    textColor: "#e5e7eb"
  },
  {
    id: "nord",
    name: "Nord 极光蓝灰",
    bgColor: "#2e3440",
    barColor: "#242933",
    accentColor: "#5e81ac",
    tileColor: "#3b4252",
    bigCardColor: "#373e4d",
    hoverColor: "#434c5e",
    textColor: "#eceff4"
  },
  {
    id: "catppuccin",
    name: "Catppuccin 暗夜紫",
    bgColor: "#1e1e2e",
    barColor: "#181825",
    accentColor: "#7c3aed",
    tileColor: "#2a2b3d",
    bigCardColor: "#262738",
    hoverColor: "#34364c",
    textColor: "#cdd6f4"
  },
  {
    id: "light-clean",
    name: "Fluent 2 明亮",
    bgColor: "#f3f3f3",
    barColor: "#eaeaea",
    accentColor: "#0067c0",
    tileColor: "#ffffff",
    bigCardColor: "#fbfbfb",
    hoverColor: "#e6e6e6",
    textColor: "#1b1b1b"
  },
  {
    id: "bw-minimal",
    name: "黑白模式",
    bgColor: "#000000",
    barColor: "#0d0d0d",
    accentColor: "#4a4a4a",
    tileColor: "#161616",
    bigCardColor: "#121212",
    hoverColor: "#262626",
    textColor: "#f5f5f5"
  },
  {
    id: "forest-jade",
    name: "翡翠深林",
    bgColor: "#141d19",
    barColor: "#0e1512",
    accentColor: "#10b981",
    tileColor: "#1d2a24",
    bigCardColor: "#1a2520",
    hoverColor: "#24352d",
    textColor: "#d8ebe1"
  },
  {
    id: "rose-dusk",
    name: "暮色玫瑰",
    bgColor: "#1e161b",
    barColor: "#161014",
    accentColor: "#e11d48",
    tileColor: "#2a1f26",
    bigCardColor: "#261c22",
    hoverColor: "#352730",
    textColor: "#f0dfe7"
  },
  {
    id: "warm-paper",
    name: "暖纸护眼",
    bgColor: "#f5efe6",
    barColor: "#ebe2d5",
    accentColor: "#d97706",
    tileColor: "#fbf8f3",
    bigCardColor: "#fbf8f3",
    hoverColor: "#e6dbc9",
    textColor: "#3f3328"
  }
];

const DEFAULTS = {
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

const SITE_CONTEXT_ID = "__site_context__";
const FREQUENT_ID = "__frequent__";
let siteRulesDraft = [];

const statusEl = document.getElementById("status");
const themeListEl = document.getElementById("themeList");
let currentThemeId = "win-blue";
let isFormLoaded = false;

function collectFolders(nodes) {
  const list = [];
  function walk(arr) {
    for (const n of arr) {
      if (n.children) {
        if (n.id !== "0" && n.id !== "1" && n.title) {
          list.push({ id: n.id, title: n.title });
        }
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return list;
}

function getVirtualFolderEntries() {
  const siteName = (document.getElementById("siteFolderName")?.value || "").trim() || "站内";
  const freqName = (document.getElementById("frequentFolderName")?.value || "").trim() || "常用";
  return [
    { id: SITE_CONTEXT_ID, title: `⚡ ${siteName}（按当前网站映射）`, shortTitle: `⚡ ${siteName}` },
    { id: FREQUENT_ID, title: `🔥 ${freqName}（智能频次排序）`, shortTitle: `🔥 ${freqName}` }
  ];
}

function populateSelect(selectEl, folders, selectedId, includeVirtual = true) {
  selectEl.innerHTML = "";
  const autoOpt = document.createElement("option");
  autoOpt.value = "";
  autoOpt.textContent = includeVirtual ? "（自动按顺序匹配）" : "请选择文件夹...";
  selectEl.appendChild(autoOpt);

  if (includeVirtual) {
    for (const vf of getVirtualFolderEntries()) {
      const opt = document.createElement("option");
      opt.value = vf.id;
      opt.textContent = vf.title;
      selectEl.appendChild(opt);
    }
  }

  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.title;
    selectEl.appendChild(opt);
  }
  selectEl.value = selectedId || "";
}

function normalizeRuleSearchSlots(r) {
  if (Array.isArray(r?.searchSlots)) {
    return Array.from({ length: 4 }, (_, i) => String(r.searchSlots[i] || ""));
  }
  const legacyLines = String(r?.searches || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from({ length: 4 }, (_, i) => legacyLines[i] || "");
}

function renderSiteRulesEditor() {
  const listEl = document.getElementById("siteRulesList");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (siteRulesDraft.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无映射规则，点击右上角「+ 添加网站映射」即可将任意书签文件夹绑定到对应网站。";
    listEl.appendChild(empty);
    return;
  }
  siteRulesDraft.forEach((rule, idx) => {
    if (!Array.isArray(rule.searchSlots)) {
      rule.searchSlots = normalizeRuleSearchSlots(rule);
    }

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:8px 10px;border-radius:8px;border:1px solid var(--opt-border);background:var(--opt-input-bg);";

    const domInput = document.createElement("input");
    domInput.type = "text";
    domInput.placeholder = "域名";
    domInput.title = "网站域名，如 bilibili.com";
    domInput.value = rule.domains || "";
    domInput.style.cssText = "width:104px;flex-shrink:0;padding:5px 7px;font-size:12.5px;";
    domInput.addEventListener("input", () => {
      siteRulesDraft[idx].domains = domInput.value;
      scheduleLivePreview();
    });

    const folderSel = document.createElement("select");
    folderSel.title = "对应书签文件夹";
    folderSel.style.cssText = "width:96px;flex-shrink:0;padding:5px 6px;font-size:12.5px;";
    populateSelect(folderSel, cachedFolders, rule.folderId || "", false);
    folderSel.addEventListener("change", () => {
      siteRulesDraft[idx].folderId = folderSel.value;
      scheduleLivePreview();
    });

    const slotsGrid = document.createElement("div");
    slotsGrid.style.cssText =
      "flex:1;min-width:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;";

    for (let s = 0; s < 4; s++) {
      const sInp = document.createElement("input");
      sInp.type = "text";
      sInp.placeholder = `搜索${s + 1} (名|链接)`;
      sInp.title = "格式：名称|含%s链接（留空则不显示）\n例：B站|https://search.bilibili.com/all?keyword=%s";
      sInp.value = rule.searchSlots[s] || "";
      sInp.style.cssText = "width:100%;min-width:0;padding:5px 7px;font-size:12px;";
      sInp.addEventListener("input", () => {
        siteRulesDraft[idx].searchSlots[s] = sInp.value;
        scheduleLivePreview();
      });
      slotsGrid.appendChild(sInp);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-secondary";
    delBtn.textContent = "删除";
    delBtn.style.cssText = "padding:5px 8px;font-size:12px;flex-shrink:0;";
    delBtn.addEventListener("click", () => {
      siteRulesDraft.splice(idx, 1);
      renderSiteRulesEditor();
      scheduleLivePreview();
    });

    row.appendChild(domInput);
    row.appendChild(folderSel);
    row.appendChild(slotsGrid);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}

function renderThemes() {
  themeListEl.innerHTML = "";
  for (const t of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-btn" + (t.id === currentThemeId ? " active" : "");

    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = `linear-gradient(135deg, ${t.bgColor} 50%, ${t.accentColor} 50%)`;

    const text = document.createElement("span");
    text.textContent = t.name;

    btn.appendChild(sw);
    btn.appendChild(text);
    btn.addEventListener("click", () => {
      currentThemeId = t.id;
      document.getElementById("bgColor").value = t.bgColor;
      document.getElementById("barColor").value = t.barColor;
      document.getElementById("accentColor").value = t.accentColor;
      document.getElementById("tileColor").value = t.tileColor;
      document.getElementById("bigCardColor").value = t.bigCardColor;
      document.getElementById("hoverColor").value = t.hoverColor;
      document.getElementById("textColor").value = t.textColor;
      renderThemes();
      scheduleLivePreview();
    });
    themeListEl.appendChild(btn);
  }
}

function applyConfigToForm(cfg, folders) {
  currentThemeId = cfg.themeId || "win-blue";
  renderThemes();

  document.getElementById("bgColor").value = cfg.bgColor;
  document.getElementById("barColor").value = cfg.barColor;
  document.getElementById("accentColor").value = cfg.accentColor;
  document.getElementById("tileColor").value = cfg.tileColor;
  document.getElementById("bigCardColor").value = cfg.bigCardColor;
  document.getElementById("hoverColor").value = cfg.hoverColor;
  document.getElementById("textColor").value = cfg.textColor;
  document.getElementById("backdropOpacity").value = cfg.backdropOpacity;

  const topCount = Math.min(6, Math.max(1, Number(cfg.topSlotCount) || 3));
  const bottomCount = Math.min(6, Math.max(1, Number(cfg.bottomSlotCount) || 3));
  document.getElementById("topSlotCount").value = String(topCount);
  document.getElementById("bottomSlotCount").value = String(bottomCount);

  const topIds = Array.isArray(cfg.topSlotIds) ? cfg.topSlotIds : [];
  const bottomIds = Array.isArray(cfg.bottomSlotIds) ? cfg.bottomSlotIds : [];
  const topCounts = Array.isArray(cfg.topBigCount) ? cfg.topBigCount : [];
  const bottomCounts = Array.isArray(cfg.bottomBigCount) ? cfg.bottomBigCount : [];

  renderDynamicSlotRows(folders, topCount, bottomCount, topIds, bottomIds, topCounts, bottomCounts, cfg.defaultTopSlot ?? 0, cfg.defaultBottomSlot ?? 0);
  document.getElementById("flatFolderMode").checked = Boolean(cfg.flatFolderMode);
  document.getElementById("rememberLastCategory").checked = Boolean(cfg.rememberLastCategory);
  document.getElementById("categorySwitchMode").value = cfg.categorySwitchMode || "hover";
  document.getElementById("showOtherFolders").checked = cfg.showOtherFolders !== false;
  document.getElementById("otherFolderAlign").value = cfg.otherFolderAlign || "left";

  document.getElementById("siteFolderName").value = cfg.siteFolderName || "站内";
  document.getElementById("frequentFolderName").value = cfg.frequentFolderName || "常用";
  document.getElementById("siteAutoSwitch").checked = cfg.siteAutoSwitch !== false;
  document.getElementById("siteFallbackToFrequent").checked = cfg.siteFallbackToFrequent !== false;
  document.getElementById("frequentMaxCount").value = cfg.frequentMaxCount ?? 20;
  document.getElementById("frequentHalfLifeDays").value = cfg.frequentHalfLifeDays ?? 14;
  document.getElementById("showFrequentInOther").checked = cfg.showFrequentInOther !== false;
  siteRulesDraft = Array.isArray(cfg.siteFolderRules)
    ? cfg.siteFolderRules.map((r) => ({
        domains: r?.domains || "",
        folderId: r?.folderId || "",
        searchSlots: normalizeRuleSearchSlots(r),
        activeEngines: Array.isArray(r?.activeEngines) ? [...r.activeEngines] : []
      }))
    : [];
  renderSiteRulesEditor();
  renderVisualSlotEditor(folders);

  document.getElementById("position").value = cfg.position || "left";
  document.getElementById("triggerMode").value = cfg.triggerMode || "mouseover";
  document.getElementById("triggerWidth").value = cfg.triggerWidth;
  document.getElementById("triggerWidthWindowed").value = cfg.triggerWidthWindowed;
  document.getElementById("triggerTop").value = cfg.triggerTop ?? 0;
  document.getElementById("triggerHeight").value = cfg.triggerHeight;
  document.getElementById("disableInWindowed").checked = Boolean(cfg.disableInWindowed);
  extraTriggersDraft = Array.isArray(cfg.extraTriggers)
    ? cfg.extraTriggers.map((t) => ({
        position: t.position || "right",
        triggerMode: t.triggerMode || "mouseover",
        triggerTop: Number(t.triggerTop ?? 0),
        triggerHeight: Number(t.triggerHeight ?? 100),
        triggerWidth: Number(t.triggerWidth ?? 3),
        triggerWidthWindowed: Number(t.triggerWidthWindowed ?? 3),
        disableInWindowed: Boolean(t.disableInWindowed)
      }))
    : [];
  renderExtraTriggers();
  updateMockPreview();

  document.getElementById("openDelay").value = cfg.openDelay;
  document.getElementById("closeDelay").value = cfg.closeDelay;
  document.getElementById("idleTimeout").value = cfg.idleTimeout;
  document.getElementById("transitionMs").value = cfg.transitionMs;
  document.getElementById("openInNewTab").checked = Boolean(cfg.openInNewTab);
  document.getElementById("openTabActive").checked = cfg.openTabActive !== false;
  document.getElementById("openTabPosition").value = cfg.openTabPosition || "after";
  document.getElementById("closeOnClickBookmark").checked = cfg.closeOnClickBookmark !== false;
  document.getElementById("preventPageScroll").checked = Boolean(cfg.preventPageScroll);
  document.getElementById("tooltipMode").value = cfg.tooltipMode || "both";
  document.getElementById("trashFolderName").value = cfg.trashFolderName || "回收站";
  document.getElementById("showPermanentDelete").checked = Boolean(cfg.showPermanentDelete);
  document.getElementById("showTrashFolder").checked = cfg.showTrashFolder !== false;
  document.getElementById("folderBgMaskColor").value = cfg.folderBgMaskColor || "#000000";
  document.getElementById("folderBgMaskOpacity").value = cfg.folderBgMaskOpacity ?? 0.35;
  document.getElementById("folderBgBlur").value = cfg.folderBgBlur ?? 0;
  document.getElementById("folderBgEffect").value = cfg.folderBgEffect || "zoom";
  document.getElementById("showFolderTitle").checked = cfg.showFolderTitle !== false;
  document.getElementById("folderTitlePos").value = cfg.folderTitlePos || "center";
  document.getElementById("folderTitleSize").value = cfg.folderTitleSize ?? 0;
  document.getElementById("folderTitleFont").value = cfg.folderTitleFont || "";
  document.getElementById("folderTitleWeight").value = String(cfg.folderTitleWeight ?? 0);
  document.getElementById("showFolderCount").checked = cfg.showFolderCount !== false;
  document.getElementById("folderCountPos").value = cfg.folderCountPos || "bottom-right";
  populateBgFolderSelect(folders);
  syncCatBarPreviewAspect(cfg);

  document.getElementById("columns").value = String(cfg.columns);
  document.getElementById("sidebarWidth").value = cfg.sidebarWidth;
  document.getElementById("normalFontSize").value = cfg.normalFontSize;
  document.getElementById("normalRowHeight").value = cfg.normalRowHeight;
  document.getElementById("iconSize").value = cfg.iconSize;
  document.getElementById("bigScale").value = cfg.bigScale;
  document.getElementById("itemPaddingX").value = cfg.itemPaddingX;
  document.getElementById("itemGap").value = cfg.itemGap;
  document.getElementById("tileHeight").value = cfg.tileHeight;
  document.getElementById("tileFontSize").value = cfg.tileFontSize;
  document.getElementById("tileRadius").value = cfg.tileRadius;
  document.getElementById("scrollbarWidth").value = cfg.scrollbarWidth;
  document.getElementById("fontFamily").value = cfg.fontFamily;
  syncFontSelectFromInput();
  document.getElementById("fontWeight").value = cfg.fontWeight;
  document.getElementById("splitRatio").value = Number(cfg.splitRatio).toFixed(2);
  sidebarSearchBoxesDraft = Array.isArray(cfg.sidebarSearchBoxes)
    ? cfg.sidebarSearchBoxes.map((b) => ({
        pos: b.pos === "bottom" ? "bottom" : "top",
        engine: b.engine || "Google"
      }))
    : [];
  renderSidebarSearchBoxesUI();
  document.getElementById("bigCardTwoLines").checked = Boolean(cfg.bigCardTwoLines);
  document.getElementById("fadeOverflowText").checked = Boolean(cfg.fadeOverflowText);
  document.getElementById("titleStripParens").checked = Boolean(cfg.titleStripParens);
  document.getElementById("titleStripDash").checked = Boolean(cfg.titleStripDash);
  document.getElementById("titleStripPipe").checked = Boolean(cfg.titleStripPipe);
  document.getElementById("titleStripColon").checked = Boolean(cfg.titleStripColon);
  document.getElementById("titleCustomRegex").value = cfg.titleCustomRegex || "";

  document.getElementById("siteFilterMode").value = cfg.siteFilterMode || "all";
  document.getElementById("siteFilterList").value = cfg.siteFilterList || "";
  document.getElementById("newtabIconShape").value = cfg.newtabIconShape || "bookmarkOutline";
  document.getElementById("newtabIconColor").value = cfg.newtabIconColor || "#e5e7eb";
  document.getElementById("newtabIconBg").value = cfg.newtabIconBg || "transparent";
  document.getElementById("customIconSvg").value = cfg.customIconSvg || "";
  document.getElementById("syncActionIcon").checked = cfg.syncActionIcon !== false;
  document.getElementById("didaHost").value = cfg.didaHost || "dida365.com";
  document.getElementById("didaToken").value = cfg.didaToken || "";
  document.getElementById("didaClientId").value = cfg.didaClientId || "";
  document.getElementById("didaClientSecret").value = cfg.didaClientSecret || "";
  document.getElementById("didaCustomCss").value = cfg.didaCustomCss || "";
  document.getElementById("newtabWallpaperUrl").value = cfg.newtabWallpaperUrl || "";
  document.getElementById("newtabSearchEngines").value = cfg.newtabSearchEngines || "";
  const didaRedirectEl = document.getElementById("didaRedirectHint");
  if (didaRedirectEl) {
    didaRedirectEl.textContent = `若用 Client ID 授权，请将开放平台回调地址（Redirect URL）设为：${chrome.runtime.getURL("options.html")}`;
  }
  syncNewtabIconPickerUI();
  document.getElementById("newtabUrlHint").textContent = `新标签页 URL：${chrome.runtime.getURL("newtab.html")}`;
  document.getElementById("customCss").value = cfg.customCss || "";
  isFormLoaded = true;
  scheduleLivePreview();
}

let cachedFolders = [];

let slotDraft = {
  topCount: 3,
  bottomCount: 3,
  topIds: ["", "", "", "", "", ""],
  bottomIds: ["", "", "", "", "", ""],
  topBig: [4, 4, 4, 4, 4, 4],
  bottomBig: [4, 4, 4, 4, 4, 4],
  defaultTop: 0,
  defaultBottom: 0,
  selected: { isTop: true, idx: 0 }
};

function renderDynamicSlotRows(folders, topCount, bottomCount, topIds, bottomIds, topCounts, bottomCounts, defTop, defBottom) {
  slotDraft.topCount = Math.min(6, Math.max(1, Number(topCount) || 3));
  slotDraft.bottomCount = Math.min(6, Math.max(1, Number(bottomCount) || 3));
  slotDraft.topIds = Array.from({ length: 6 }, (_, i) => topIds[i] || "");
  slotDraft.bottomIds = Array.from({ length: 6 }, (_, i) => bottomIds[i] || "");
  slotDraft.topBig = Array.from({ length: 6 }, (_, i) => topCounts[i] ?? 4);
  slotDraft.bottomBig = Array.from({ length: 6 }, (_, i) => bottomCounts[i] ?? 4);
  slotDraft.defaultTop = Math.min(slotDraft.topCount - 1, Math.max(0, Number(defTop) || 0));
  slotDraft.defaultBottom = Math.min(slotDraft.bottomCount - 1, Math.max(0, Number(defBottom) || 0));
  if (slotDraft.selected.isTop && slotDraft.selected.idx >= slotDraft.topCount) {
    slotDraft.selected.idx = 0;
  }
  if (!slotDraft.selected.isTop && slotDraft.selected.idx >= slotDraft.bottomCount) {
    slotDraft.selected.idx = 0;
  }
  renderVisualSlotEditor(folders);
}

function renderVisualSlotEditor(folders) {
  const topWrap = document.getElementById("slotVisualTop");
  const botWrap = document.getElementById("slotVisualBottom");
  if (!topWrap || !botWrap) return;

  const folderNameMap = new Map(folders.map((f) => [f.id, f.title]));
  for (const vf of getVirtualFolderEntries()) {
    folderNameMap.set(vf.id, vf.shortTitle);
  }

  function buildRow(wrap, isTop, count, ids, bigs, defIdx) {
    wrap.innerHTML = "";
    wrap.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
    for (let i = 0; i < count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      const isSelected = slotDraft.selected.isTop === isTop && slotDraft.selected.idx === i;
      btn.className = "slot-tile-btn" + (isSelected ? " active" : "");

      const fid = ids[i] || "";
      const name = (fid && folderNameMap.get(fid)) || `${isTop ? "上" : "下"}${i + 1} · 自动`;
      const bigN = bigs[i] ?? 4;

      if (i === defIdx) {
        const defBadge = document.createElement("span");
        defBadge.className = "slot-tile-def";
        defBadge.textContent = "默认";
        btn.appendChild(defBadge);
      }
      const nameEl = document.createElement("span");
      nameEl.className = "slot-tile-name";
      nameEl.textContent = name;
      const metaEl = document.createElement("span");
      metaEl.className = "slot-tile-meta";
      metaEl.textContent = `放大 ${bigN}`;
      btn.appendChild(nameEl);
      btn.appendChild(metaEl);

      btn.addEventListener("click", () => {
        slotDraft.selected = { isTop, idx: i };
        renderVisualSlotEditor(folders);
      });
      wrap.appendChild(btn);
    }
  }

  buildRow(topWrap, true, slotDraft.topCount, slotDraft.topIds, slotDraft.topBig, slotDraft.defaultTop);
  buildRow(botWrap, false, slotDraft.bottomCount, slotDraft.bottomIds, slotDraft.bottomBig, slotDraft.defaultBottom);
  syncSlotInspector(folders);
}

function syncSlotInspector(folders) {
  const { isTop, idx } = slotDraft.selected;
  const titleEl = document.getElementById("inspTitle");
  const folderSel = document.getElementById("inspFolderSelect");
  const bigInput = document.getElementById("inspBigCount");
  const defCheck = document.getElementById("inspIsDefault");
  if (!titleEl || !folderSel || !bigInput || !defCheck) return;

  titleEl.textContent = `当前选中：${isTop ? "上排" : "下排"}第 ${idx + 1} 格`;
  const curId = isTop ? slotDraft.topIds[idx] : slotDraft.bottomIds[idx];
  const curBig = isTop ? slotDraft.topBig[idx] : slotDraft.bottomBig[idx];
  const curDef = isTop ? slotDraft.defaultTop === idx : slotDraft.defaultBottom === idx;

  populateSelect(folderSel, folders, curId || "");
  bigInput.value = String(curBig ?? 4);
  defCheck.checked = curDef;

  document.querySelectorAll(".big-pill").forEach((pill) => {
    pill.classList.toggle("active", Number(pill.dataset.big) === Number(curBig ?? 4));
  });
}

function bindSlotInspectorEvents() {
  const folderSel = document.getElementById("inspFolderSelect");
  const bigInput = document.getElementById("inspBigCount");
  const defCheck = document.getElementById("inspIsDefault");
  const goBgBtn = document.getElementById("inspGoBgBtn");

  folderSel?.addEventListener("change", () => {
    const { isTop, idx } = slotDraft.selected;
    if (isTop) slotDraft.topIds[idx] = folderSel.value;
    else slotDraft.bottomIds[idx] = folderSel.value;
    renderVisualSlotEditor(cachedFolders);
    scheduleLivePreview();
  });

  bigInput?.addEventListener("input", () => {
    const { isTop, idx } = slotDraft.selected;
    const val = Math.max(0, Number(bigInput.value) || 0);
    if (isTop) slotDraft.topBig[idx] = val;
    else slotDraft.bottomBig[idx] = val;
    renderVisualSlotEditor(cachedFolders);
    scheduleLivePreview();
  });

  document.querySelectorAll(".big-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const val = Number(pill.dataset.big) || 0;
      const { isTop, idx } = slotDraft.selected;
      if (isTop) slotDraft.topBig[idx] = val;
      else slotDraft.bottomBig[idx] = val;
      renderVisualSlotEditor(cachedFolders);
      scheduleLivePreview();
    });
  });

  defCheck?.addEventListener("change", () => {
    const { isTop, idx } = slotDraft.selected;
    if (defCheck.checked) {
      if (isTop) slotDraft.defaultTop = idx;
      else slotDraft.defaultBottom = idx;
      renderVisualSlotEditor(cachedFolders);
      scheduleLivePreview();
    } else {
      defCheck.checked = true;
    }
  });

  goBgBtn?.addEventListener("click", () => {
    const { isTop, idx } = slotDraft.selected;
    const fid = isTop ? slotDraft.topIds[idx] : slotDraft.bottomIds[idx];
    if (typeof window.__setOptionsTab === "function") {
      window.__setOptionsTab("style", false);
    }
    const bgSel = document.getElementById("bgFolderSelect");
    if (bgSel && fid && Array.from(bgSel.options).some((o) => o.value === fid)) {
      bgSel.value = fid;
      if (typeof window.__syncFolderBgUI === "function") window.__syncFolderBgUI();
    }
    bgSel?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

(function initOptionsSideTabs() {
  const tabBtns = Array.from(document.querySelectorAll(".side-tab-btn[data-opt-tab]"));
  const cards = Array.from(document.querySelectorAll(".card[data-opt-panel]"));
  const container = document.querySelector(".container");
  if (tabBtns.length === 0 || cards.length === 0) return;

  function setOptionsTab(tabName, scrollTop = true) {
    const target = tabName === "style" ? "style" : "settings";
    tabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.optTab === target);
    });
    cards.forEach((card) => {
      card.classList.toggle("tab-hidden", card.dataset.optPanel !== target);
    });
    try {
      localStorage.setItem("bs_options_active_tab", target);
    } catch {
      // Ignore storage errors
    }
    if (scrollTop && container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  window.__setOptionsTab = setOptionsTab;
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setOptionsTab(btn.dataset.optTab, true);
    });
  });

  let savedTab = "settings";
  try {
    const t = localStorage.getItem("bs_options_active_tab");
    if (t === "style" || t === "settings") savedTab = t;
  } catch {
    // Ignore storage errors
  }
  setOptionsTab(savedTab, false);
})();

bindSlotInspectorEvents();

function handleSlotCountChange() {
  renderDynamicSlotRows(
    cachedFolders,
    Number(document.getElementById("topSlotCount").value) || 3,
    Number(document.getElementById("bottomSlotCount").value) || 3,
    slotDraft.topIds,
    slotDraft.bottomIds,
    slotDraft.topBig,
    slotDraft.bottomBig,
    slotDraft.defaultTop,
    slotDraft.defaultBottom
  );
}

document.getElementById("topSlotCount").addEventListener("change", handleSlotCountChange);
document.getElementById("bottomSlotCount").addEventListener("change", handleSlotCountChange);

document.getElementById("addSiteRuleBtn")?.addEventListener("click", () => {
  siteRulesDraft.push({ domains: "", folderId: "" });
  renderSiteRulesEditor();
});

document.getElementById("clearBookmarkStatsBtn")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_BOOKMARK_STATS" }, () => {
    showStatus("已清空常用点击统计");
  });
});

["siteFolderName", "frequentFolderName"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    renderVisualSlotEditor(cachedFolders);
    scheduleLivePreview();
  });
});

async function load() {
  const [data, tree] = await Promise.all([
    chrome.storage.sync.get(Object.keys(DEFAULTS)),
    chrome.bookmarks.getTree()
  ]);
  cachedFolders = collectFolders(tree);
  applyConfigToForm({ ...DEFAULTS, ...data }, cachedFolders);
}

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2200);
}

document.getElementById("shortcutBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_SHORTCUTS" });
});

document.getElementById("previewNewtabBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
});

// Interactive browser mockup trigger bar drag & resize
const mockBody = document.getElementById("mockBody");
const mockTrigger = document.getElementById("mockTrigger");
const mockLabel = document.getElementById("mockLabel");
const handleTop = document.getElementById("handleTop");
const handleBottom = document.getElementById("handleBottom");
const triggerTopInput = document.getElementById("triggerTop");
const triggerHeightInput = document.getElementById("triggerHeight");
const positionSelect = document.getElementById("position");

function updateMockPreview() {
  const isRight = positionSelect.value === "right";
  mockTrigger.classList.toggle("right", isRight);
  mockLabel.classList.toggle("right", isRight);

  let h = Math.min(100, Math.max(5, Number(triggerHeightInput.value) || 100));
  let t = Math.min(100 - h, Math.max(0, Number(triggerTopInput.value) || 0));
  triggerTopInput.value = Math.round(t);
  triggerHeightInput.value = Math.round(h);

  mockTrigger.style.top = `${t}%`;
  mockTrigger.style.height = `${h}%`;
  mockLabel.innerHTML = `位置：距顶 ${Math.round(t)}%<br>高度：${Math.round(h)}%`;
}

positionSelect.addEventListener("change", updateMockPreview);
triggerTopInput.addEventListener("input", updateMockPreview);
triggerHeightInput.addEventListener("input", updateMockPreview);

let mockDragMode = null; // "move" | "top" | "bottom"
let mockStartY = 0;
let mockStartTop = 0;
let mockStartHeight = 100;

mockTrigger.addEventListener("mousedown", (e) => {
  e.preventDefault();
  mockStartY = e.clientY;
  mockStartTop = Number(triggerTopInput.value) || 0;
  mockStartHeight = Number(triggerHeightInput.value) || 100;
  if (e.target === handleTop) mockDragMode = "top";
  else if (e.target === handleBottom) mockDragMode = "bottom";
  else mockDragMode = "move";
});

window.addEventListener("mousemove", (e) => {
  if (!mockDragMode) return;
  const bodyH = mockBody.getBoundingClientRect().height || 200;
  const deltaPct = ((e.clientY - mockStartY) / bodyH) * 100;

  if (mockDragMode === "move") {
    const newTop = Math.min(100 - mockStartHeight, Math.max(0, mockStartTop + deltaPct));
    triggerTopInput.value = Math.round(newTop);
  } else if (mockDragMode === "bottom") {
    const newH = Math.min(100 - mockStartTop, Math.max(5, mockStartHeight + deltaPct));
    triggerHeightInput.value = Math.round(newH);
  } else if (mockDragMode === "top") {
    const bottom = mockStartTop + mockStartHeight;
    const newTop = Math.min(bottom - 5, Math.max(0, mockStartTop + deltaPct));
    const newH = bottom - newTop;
    triggerTopInput.value = Math.round(newTop);
    triggerHeightInput.value = Math.round(newH);
  }
  updateMockPreview();
});

window.addEventListener("mouseup", () => {
  mockDragMode = null;
});

function collectFormSettings() {
  return {
    themeId: currentThemeId,
    bgColor: document.getElementById("bgColor").value,
    barColor: document.getElementById("barColor").value,
    accentColor: document.getElementById("accentColor").value,
    tileColor: document.getElementById("tileColor").value,
    bigCardColor: document.getElementById("bigCardColor").value,
    hoverColor: document.getElementById("hoverColor").value,
    textColor: document.getElementById("textColor").value,
    backdropOpacity: Math.min(0.85, Math.max(0, Number(document.getElementById("backdropOpacity").value) || 0)),
    topSlotCount: slotDraft.topCount,
    bottomSlotCount: slotDraft.bottomCount,
    topSlotIds: [...slotDraft.topIds],
    bottomSlotIds: [...slotDraft.bottomIds],
    topBigCount: [...slotDraft.topBig],
    bottomBigCount: [...slotDraft.bottomBig],
    defaultTopSlot: slotDraft.defaultTop,
    defaultBottomSlot: slotDraft.defaultBottom,
    flatFolderMode: document.getElementById("flatFolderMode").checked,
    rememberLastCategory: document.getElementById("rememberLastCategory").checked,
    categorySwitchMode: document.getElementById("categorySwitchMode").value,
    showOtherFolders: document.getElementById("showOtherFolders").checked,
    otherFolderAlign: document.getElementById("otherFolderAlign").value,
    siteFolderName: document.getElementById("siteFolderName").value.trim() || "站内",
    siteFolderRules: siteRulesDraft
      .map((r) => ({
        domains: (r.domains || "").trim(),
        folderId: (r.folderId || "").trim(),
        searchSlots: normalizeRuleSearchSlots(r).map((s) => s.trim()),
        activeEngines: Array.isArray(r.activeEngines) ? [...r.activeEngines] : []
      }))
      .filter((r) => r.domains && r.folderId),
    siteAutoSwitch: document.getElementById("siteAutoSwitch").checked,
    siteFallbackToFrequent: document.getElementById("siteFallbackToFrequent").checked,
    frequentFolderName: document.getElementById("frequentFolderName").value.trim() || "常用",
    frequentMaxCount: Math.min(60, Math.max(4, Number(document.getElementById("frequentMaxCount").value) || 20)),
    frequentHalfLifeDays: Math.min(90, Math.max(1, Number(document.getElementById("frequentHalfLifeDays").value) || 14)),
    showFrequentInOther: document.getElementById("showFrequentInOther").checked,
    position: document.getElementById("position").value,
    triggerMode: document.getElementById("triggerMode").value,
    triggerWidth: Math.min(30, Math.max(1, Number(document.getElementById("triggerWidth").value) || 3)),
    triggerWidthWindowed: Math.min(30, Math.max(1, Number(document.getElementById("triggerWidthWindowed").value) || 3)),
    triggerTop: Math.min(95, Math.max(0, Number(document.getElementById("triggerTop").value) || 0)),
    triggerHeight: Math.min(100, Math.max(5, Number(document.getElementById("triggerHeight").value) || 100)),
    disableInWindowed: document.getElementById("disableInWindowed").checked,
    extraTriggers: extraTriggersDraft.map((t) => ({ ...t })),
    openDelay: Math.max(0, Number(document.getElementById("openDelay").value) || 0),
    closeDelay: Math.max(0, Number(document.getElementById("closeDelay").value) || 0),
    idleTimeout: Math.max(0, Number(document.getElementById("idleTimeout").value) || 0),
    transitionMs: Math.max(0, Number(document.getElementById("transitionMs").value) || 0),
    openInNewTab: document.getElementById("openInNewTab").checked,
    openTabActive: document.getElementById("openTabActive").checked,
    openTabPosition: document.getElementById("openTabPosition").value,
    closeOnClickBookmark: document.getElementById("closeOnClickBookmark").checked,
    preventPageScroll: document.getElementById("preventPageScroll").checked,
    tooltipMode: document.getElementById("tooltipMode").value,
    trashFolderName: document.getElementById("trashFolderName").value.trim() || "回收站",
    showPermanentDelete: document.getElementById("showPermanentDelete").checked,
    showTrashFolder: document.getElementById("showTrashFolder").checked,
    folderBgMaskColor: document.getElementById("folderBgMaskColor").value || "#000000",
    folderBgMaskOpacity: Math.min(0.9, Math.max(0, Number(document.getElementById("folderBgMaskOpacity").value) || 0)),
    folderBgBlur: Math.min(20, Math.max(0, Number(document.getElementById("folderBgBlur").value) || 0)),
    folderBgEffect: document.getElementById("folderBgEffect").value || "zoom",
    showFolderTitle: document.getElementById("showFolderTitle").checked,
    folderTitlePos: document.getElementById("folderTitlePos").value || "center",
    folderTitleSize: Math.min(36, Math.max(0, Number(document.getElementById("folderTitleSize").value) || 0)),
    folderTitleFont: document.getElementById("folderTitleFont").value || "",
    folderTitleWeight: Number(document.getElementById("folderTitleWeight").value) || 0,
    showFolderCount: document.getElementById("showFolderCount").checked,
    folderCountPos: document.getElementById("folderCountPos").value || "bottom-right",
    columns: Number(document.getElementById("columns").value) || 2,
    sidebarWidth: Math.min(950, Math.max(260, Number(document.getElementById("sidebarWidth").value) || 460)),
    normalFontSize: Math.min(24, Math.max(11, Number(document.getElementById("normalFontSize").value) || 14.5)),
    normalRowHeight: Math.min(64, Math.max(24, Number(document.getElementById("normalRowHeight").value) || 36)),
    iconSize: Math.min(32, Math.max(12, Number(document.getElementById("iconSize").value) || 18)),
    bigScale: Math.min(2.5, Math.max(1, Number(document.getElementById("bigScale").value) || 1.6)),
    itemPaddingX: Math.min(24, Math.max(2, Number(document.getElementById("itemPaddingX").value) || 8)),
    itemGap: Math.min(16, Math.max(0, Number(document.getElementById("itemGap").value) || 0)),
    tileHeight: Math.min(110, Math.max(28, Number(document.getElementById("tileHeight").value) || 64)),
    tileFontSize: Math.min(32, Math.max(10, Number(document.getElementById("tileFontSize").value) || 15)),
    tileRadius: Math.min(16, Math.max(0, Number(document.getElementById("tileRadius").value) || 0)),
    scrollbarWidth: Math.min(16, Math.max(0, Number(document.getElementById("scrollbarWidth").value) || 0)),
    fontFamily: document.getElementById("fontFamily").value.trim() || DEFAULTS.fontFamily,
    fontWeight: Math.min(900, Math.max(100, Number(document.getElementById("fontWeight").value) || 600)),
    splitRatio: Math.min(0.85, Math.max(0.15, Number(document.getElementById("splitRatio").value) || 0.5)),
    sidebarSearchBoxes: sidebarSearchBoxesDraft.map((b) => ({ ...b })),
    bigCardTwoLines: document.getElementById("bigCardTwoLines").checked,
    fadeOverflowText: document.getElementById("fadeOverflowText").checked,
    titleStripParens: document.getElementById("titleStripParens").checked,
    titleStripDash: document.getElementById("titleStripDash").checked,
    titleStripPipe: document.getElementById("titleStripPipe").checked,
    titleStripColon: document.getElementById("titleStripColon").checked,
    titleCustomRegex: document.getElementById("titleCustomRegex").value,
    siteFilterMode: document.getElementById("siteFilterMode").value,
    siteFilterList: document.getElementById("siteFilterList").value,
    newtabIconShape: document.getElementById("newtabIconShape").value,
    newtabIconColor: document.getElementById("newtabIconColor").value,
    newtabIconBg: document.getElementById("newtabIconBg").value,
    customIconSvg: document.getElementById("customIconSvg").value.trim(),
    syncActionIcon: document.getElementById("syncActionIcon").checked,
    didaHost: document.getElementById("didaHost").value || "dida365.com",
    didaToken: document.getElementById("didaToken").value.trim(),
    didaClientId: document.getElementById("didaClientId").value.trim(),
    didaClientSecret: document.getElementById("didaClientSecret").value.trim(),
    didaCustomCss: document.getElementById("didaCustomCss").value,
    newtabWallpaperUrl: document.getElementById("newtabWallpaperUrl").value.trim(),
    newtabSearchEngines: document.getElementById("newtabSearchEngines").value,
    customCss: document.getElementById("customCss").value
  };
}

let livePreviewTimer = null;
function scheduleLivePreview() {
  if (!isFormLoaded) return;
  if (livePreviewTimer) clearTimeout(livePreviewTimer);
  livePreviewTimer = setTimeout(() => {
    livePreviewTimer = null;
    const frame = document.getElementById("livePreviewFrame");
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { type: "PREVIEW_SETTINGS", settings: collectFormSettings() },
        "*"
      );
    } catch {
      // Ignore if preview iframe not ready yet
    }
  }, 40);
}

document.querySelector(".container")?.addEventListener("input", scheduleLivePreview);
document.querySelector(".container")?.addEventListener("change", scheduleLivePreview);
document.getElementById("livePreviewFrame")?.addEventListener("load", scheduleLivePreview);

const PRESET_ICON_SHAPES = {
  plusCircle: (fg) =>
    `<circle cx="16" cy="16" r="11" fill="none" stroke="${fg}" stroke-width="2.2"/><path d="M16 11v10M11 16h10" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>`,
  plusSquare: (fg) =>
    `<rect x="6" y="6" width="20" height="20" rx="3" fill="none" stroke="${fg}" stroke-width="2.2"/><path d="M16 11v10M11 16h10" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>`,
  bookmarkOutline: (fg) =>
    `<path d="M9 4h14v24l-7-5.5L9 28V4z" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linejoin="round"/>`,
  bookmarkSolid: (fg) =>
    `<path d="M9 4h14v24l-7-5.5L9 28V4z" fill="${fg}"/>`,
  starOutline: (fg) =>
    `<path d="M16 4l3.7 7.5 8.3 1.2-6 5.8 1.4 8.3L16 23l-7.4 3.8 1.4-8.3-6-5.8 8.3-1.2L16 4z" fill="none" stroke="${fg}" stroke-width="2" stroke-linejoin="round"/>`,
  starSolid: (fg) =>
    `<path d="M16 4l3.7 7.5 8.3 1.2-6 5.8 1.4 8.3L16 23l-7.4 3.8 1.4-8.3-6-5.8 8.3-1.2L16 4z" fill="${fg}"/>`
};

function buildSvgMarkupForIcon(cfg) {
  const custom = (cfg.customIconSvg || "").trim();
  if (custom && /<svg[\s>]/i.test(custom)) {
    return custom.includes("xmlns=")
      ? custom
      : custom.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const draw = PRESET_ICON_SHAPES[cfg.newtabIconShape] || PRESET_ICON_SHAPES.bookmarkOutline;
  const fg = cfg.newtabIconColor || "#e5e7eb";
  const bg = cfg.newtabIconBg || "transparent";
  const bgRect =
    bg && bg !== "transparent" ? `<rect width="32" height="32" rx="6" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${bgRect}${draw(fg)}</svg>`;
}

function renderSvgToPngDataUrl(svgStr, size = 32) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve({
        pngUrl: canvas.toDataURL("image/png"),
        imageData: ctx.getImageData(0, 0, size, size)
      });
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
  });
}

async function applyActionIconFromCfg(cfg) {
  if (!cfg.syncActionIcon) {
    await chrome.storage.local.remove("customActionIconPng");
    chrome.action.setIcon({
      path: {
        16: "icons/icon16.png",
        32: "icons/icon32.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png"
      }
    });
    return;
  }
  const svgStr = buildSvgMarkupForIcon(cfg);
  const rendered = await renderSvgToPngDataUrl(svgStr, 32);
  if (rendered) {
    await chrome.storage.local.set({ customActionIconPng: rendered.pngUrl });
    chrome.action.setIcon({ imageData: { 32: rendered.imageData } });
  }
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const cfg = collectFormSettings();
  await chrome.storage.sync.set(cfg);
  await applyActionIconFromCfg(cfg);
  showStatus("已保存（立即生效）");
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULTS);
  applyConfigToForm(DEFAULTS, cachedFolders);
  await applyActionIconFromCfg(DEFAULTS);
  scheduleLivePreview();
  showStatus("已恢复默认设置");
});

function syncFontSelectFromInput() {
  const select = document.getElementById("fontFamilySelect");
  const input = document.getElementById("fontFamily");
  if (!select || !input) return;
  const val = input.value.trim();
  const matched = Array.from(select.options).find((opt) => opt.value === val);
  select.value = matched ? val : "__custom__";
}

function populateFontDropdowns(familiesMap, localFaces = []) {
  const select = document.getElementById("fontFamilySelect");
  const titleFontSelect = document.getElementById("folderTitleFont");
  if (!select) return;

  const prevGlobal = document.getElementById("fontFamily")?.value?.trim() || "";
  const prevTitle = titleFontSelect?.value || "";

  select.innerHTML = "";
  const defOpt = document.createElement("option");
  defOpt.value = DEFAULTS.fontFamily;
  defOpt.textContent = "默认推荐字体（梦源黑体 / 微软雅黑）";
  select.appendChild(defOpt);

  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "自定义（使用下方输入框）";
  select.appendChild(customOpt);

  if (titleFontSelect) {
    titleFontSelect.innerHTML = `<option value="">跟随全局字体</option>`;
  }

  if (localFaces.length > 0) {
    const faceGroup = document.createElement("optgroup");
    faceGroup.label = `本机完整子字重（共 ${localFaces.length} 项，如 W1~W12）`;
    const titleFaceGroup = titleFontSelect ? document.createElement("optgroup") : null;
    if (titleFaceGroup) titleFaceGroup.label = faceGroup.label;

    for (const face of localFaces) {
      const opt = document.createElement("option");
      const ps = face.postscriptName && face.postscriptName !== face.fullName ? `|${face.postscriptName}` : "";
      opt.value = `local:${face.fullName}${ps}`;
      opt.textContent = face.fullName;
      faceGroup.appendChild(opt);
      if (titleFaceGroup) titleFaceGroup.appendChild(opt.cloneNode(true));
    }
    select.appendChild(faceGroup);
    if (titleFaceGroup) titleFontSelect.appendChild(titleFaceGroup);
  }

  const famGroup = document.createElement("optgroup");
  famGroup.label = "系统字体族";
  const titleFamGroup = titleFontSelect ? document.createElement("optgroup") : null;
  if (titleFamGroup) titleFamGroup.label = "系统字体族";

  const sorted = Array.from(familiesMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "zh-CN")
  );
  for (const [fontId, displayName] of sorted) {
    const opt = document.createElement("option");
    const safeId = fontId.replace(/"/g, '\\"');
    opt.value = `"${safeId}", sans-serif`;
    opt.textContent = displayName;
    opt.style.fontFamily = opt.value;
    famGroup.appendChild(opt);
    if (titleFamGroup) {
      titleFamGroup.appendChild(opt.cloneNode(true));
    }
  }
  select.appendChild(famGroup);
  if (titleFamGroup) titleFontSelect.appendChild(titleFamGroup);

  if (prevGlobal) {
    syncFontSelectFromInput();
  }
  if (titleFontSelect && prevTitle) {
    titleFontSelect.value = prevTitle;
  }
}

async function loadSystemFonts() {
  const select = document.getElementById("fontFamilySelect");
  const input = document.getElementById("fontFamily");
  const scanBtn = document.getElementById("scanLocalFacesBtn");
  if (!select || !input) return;

  const familiesMap = new Map();
  if (chrome?.fontSettings?.getFontList) {
    try {
      const list = await chrome.fontSettings.getFontList();
      for (const f of list) {
        if (f.fontId) {
          familiesMap.set(f.fontId, f.displayName || f.fontId);
        }
      }
    } catch {
      // Ignore if permission unavailable
    }
  }

  const cached = await chrome.storage.local.get(["cachedLocalFontFaces"]);
  let localFaces = Array.isArray(cached.cachedLocalFontFaces) ? cached.cachedLocalFontFaces : [];
  populateFontDropdowns(familiesMap, localFaces);

  select.addEventListener("change", () => {
    if (select.value !== "__custom__") {
      input.value = select.value;
    }
  });
  input.addEventListener("input", syncFontSelectFromInput);

  const scanBtns = [
    document.getElementById("scanLocalFacesBtn"),
    document.getElementById("scanLocalFacesBtn2")
  ].filter(Boolean);

  async function runLocalFontScan() {
    if (typeof window.queryLocalFonts !== "function") {
      showStatus("当前浏览器不支持读取子字重接口");
      return;
    }
    try {
      scanBtns.forEach((b) => (b.textContent = "读取中..."));
      const raw = await window.queryLocalFonts();
      const seen = new Set();
      const faces = [];
      for (const f of raw) {
        const fullName = (f.fullName || "").trim();
        if (!fullName || seen.has(fullName)) continue;
        seen.add(fullName);
        faces.push({
          fullName,
          postscriptName: (f.postscriptName || "").trim()
        });
      }
      faces.sort((a, b) => a.fullName.localeCompare(b.fullName, "zh-CN", { numeric: true }));
      localFaces = faces;
      await chrome.storage.local.set({ cachedLocalFontFaces: faces });
      populateFontDropdowns(familiesMap, localFaces);
      showStatus(`已读取 ${faces.length} 个子字重（含 W1~W27 等）`);
    } catch {
      showStatus("未授予本地字体权限，无法读取子字重");
    } finally {
      scanBtns.forEach((b) => (b.textContent = "读取子字重"));
    }
  }

  scanBtns.forEach((b) => b.addEventListener("click", runLocalFontScan));

  syncFontSelectFromInput();
}

async function initPageTheme() {
  const toggleBtn = document.getElementById("pageThemeToggle");
  if (!toggleBtn) return;

  function applyPageTheme(mode) {
    const isLight = mode === "light";
    document.body.classList.toggle("light-mode", isLight);
    toggleBtn.textContent = isLight ? "🌙 黑暗模式" : "☀️ 明亮模式";
  }

  const localRes = await chrome.storage.local.get(["optionsPageTheme"]);
  let currentMode = localRes.optionsPageTheme === "light" ? "light" : "dark";
  applyPageTheme(currentMode);

  toggleBtn.addEventListener("click", async () => {
    currentMode = currentMode === "light" ? "dark" : "light";
    applyPageTheme(currentMode);
    await chrome.storage.local.set({ optionsPageTheme: currentMode });
  });
}

let folderBgMap = {};
let folderBgPosMap = {};
let folderClickUrlMap = {};
let categoryBarBg = "";
let categoryBarBgPos = { x: 50, y: 50, scale: 1 };
let extraTriggersDraft = [];

function renderExtraTriggers() {
  const container = document.getElementById("extraTriggersContainer");
  if (!container) return;
  container.innerHTML = "";
  extraTriggersDraft.forEach((tr, idx) => {
    const prefix = "新".repeat(idx + 1);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid var(--opt-border);padding-bottom:10px;">
        <h2 style="margin:0;border:none;padding:0;">【${prefix}】位置、触发方式与快捷键</h2>
        <button type="button" class="btn-secondary extra-del-btn" style="color:#f87171;">删除此区域</button>
      </div>
      <div class="trigger-preview-wrap">
        <div class="browser-mock" title="拖动蓝色条上下移动位置，拖动上下浅蓝手柄调整高度">
          <div class="browser-mock-top">
            <span class="mock-dot"></span><span class="mock-dot"></span><span class="mock-dot"></span>
            <div class="mock-url"></div>
          </div>
          <div class="browser-mock-body">
            <div class="mock-trigger">
              <div class="mock-handle extra-handle-top"></div>
              <div class="mock-handle extra-handle-bottom"></div>
            </div>
            <div class="mock-label"></div>
          </div>
        </div>
        <div class="trigger-fields">
          <div class="row">
            <label>触发位置</label>
            <select class="extra-pos">
              <option value="left">屏幕左侧</option>
              <option value="right">屏幕右侧</option>
            </select>
          </div>
          <div class="row">
            <label>打开方式</label>
            <select class="extra-mode">
              <option value="mouseover">鼠标滑过边缘</option>
              <option value="click">左键点击边缘</option>
              <option value="rightclick">右键点击边缘</option>
            </select>
          </div>
          <div class="row">
            <label>触发区域距顶部 (%)</label>
            <input class="extra-top" type="number" min="0" max="95" step="1" />
          </div>
          <div class="row">
            <label>边缘触发区域高度 (%)</label>
            <input class="extra-height" type="number" min="5" max="100" step="1" />
          </div>
          <div class="row">
            <label>全屏边缘触发宽度 (px)</label>
            <input class="extra-width" type="number" min="1" max="30" step="1" />
          </div>
          <div class="row">
            <label>窗口模式边缘触发宽度 (px)</label>
            <input class="extra-width-win" type="number" min="1" max="30" step="1" />
          </div>
          <div class="row">
            <label>在窗口模式中禁用边缘触发</label>
            <input class="extra-disable-win" type="checkbox" />
          </div>
        </div>
      </div>`;

    const posEl = card.querySelector(".extra-pos");
    const modeEl = card.querySelector(".extra-mode");
    const topEl = card.querySelector(".extra-top");
    const hEl = card.querySelector(".extra-height");
    const wEl = card.querySelector(".extra-width");
    const wwEl = card.querySelector(".extra-width-win");
    const dwEl = card.querySelector(".extra-disable-win");
    const mockBody = card.querySelector(".browser-mock-body");
    const mockTrig = card.querySelector(".mock-trigger");
    const mockLbl = card.querySelector(".mock-label");
    const hTop = card.querySelector(".extra-handle-top");
    const hBot = card.querySelector(".extra-handle-bottom");

    posEl.value = tr.position || "right";
    modeEl.value = tr.triggerMode || "mouseover";
    topEl.value = tr.triggerTop ?? 0;
    hEl.value = tr.triggerHeight ?? 100;
    wEl.value = tr.triggerWidth ?? 3;
    wwEl.value = tr.triggerWidthWindowed ?? 3;
    dwEl.checked = Boolean(tr.disableInWindowed);

    function syncMiniMock() {
      const h = Math.min(100, Math.max(5, Number(tr.triggerHeight) || 100));
      const t = Math.min(100 - h, Math.max(0, Number(tr.triggerTop) || 0));
      const isRight = tr.position === "right";
      mockTrig.style.top = `${t}%`;
      mockTrig.style.height = `${h}%`;
      mockTrig.classList.toggle("right", isRight);
      mockLbl.classList.toggle("right", isRight);
      mockLbl.innerHTML = `位置：距顶 ${Math.round(t)}%<br />高度：${Math.round(h)}%`;
    }
    syncMiniMock();

    const syncFromInputs = () => {
      tr.position = posEl.value;
      tr.triggerMode = modeEl.value;
      tr.triggerTop = Math.min(95, Math.max(0, Number(topEl.value) || 0));
      tr.triggerHeight = Math.min(100, Math.max(5, Number(hEl.value) || 100));
      tr.triggerWidth = Math.min(30, Math.max(1, Number(wEl.value) || 3));
      tr.triggerWidthWindowed = Math.min(30, Math.max(1, Number(wwEl.value) || 3));
      tr.disableInWindowed = dwEl.checked;
      syncMiniMock();
    };
    [posEl, modeEl, topEl, hEl, wEl, wwEl, dwEl].forEach((el) => {
      el.addEventListener("input", syncFromInputs);
      el.addEventListener("change", syncFromInputs);
    });

    let dragMode = null;
    let startY = 0;
    let startT = 0;
    let startH = 100;
    mockTrig.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragMode = e.target === hTop ? "top" : e.target === hBot ? "bottom" : "move";
      startY = e.clientY;
      startT = Number(tr.triggerTop) || 0;
      startH = Number(tr.triggerHeight) || 100;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragMode) return;
      const bodyH = mockBody.getBoundingClientRect().height || 1;
      const deltaPct = ((e.clientY - startY) / bodyH) * 100;
      if (dragMode === "move") {
        tr.triggerTop = Math.round(Math.min(100 - startH, Math.max(0, startT + deltaPct)));
      } else if (dragMode === "bottom") {
        tr.triggerHeight = Math.round(Math.min(100 - startT, Math.max(5, startH + deltaPct)));
      } else if (dragMode === "top") {
        const bottom = startT + startH;
        const newT = Math.min(bottom - 5, Math.max(0, startT + deltaPct));
        tr.triggerTop = Math.round(newT);
        tr.triggerHeight = Math.round(bottom - newT);
      }
      topEl.value = tr.triggerTop;
      hEl.value = tr.triggerHeight;
      syncMiniMock();
    });
    window.addEventListener("mouseup", () => {
      dragMode = null;
    });

    card.querySelector(".extra-del-btn").addEventListener("click", () => {
      extraTriggersDraft.splice(idx, 1);
      renderExtraTriggers();
    });

    container.appendChild(card);
  });
}

document.getElementById("addTriggerZoneBtn")?.addEventListener("click", () => {
  extraTriggersDraft.push({
    position: document.getElementById("position").value === "left" ? "right" : "left",
    triggerMode: "mouseover",
    triggerTop: 0,
    triggerHeight: 100,
    triggerWidth: 3,
    triggerWidthWindowed: 3,
    disableInWindowed: false
  });
  renderExtraTriggers();
});

function syncCatBarPreviewAspect(cfg) {
  const box = document.getElementById("catBarBgPreviewBox");
  if (!box) return;
  const sw = Math.max(260, Number(cfg?.sidebarWidth ?? document.getElementById("sidebarWidth")?.value) || 460);
  const th = Math.max(28, Number(cfg?.tileHeight ?? document.getElementById("tileHeight")?.value) || 64);
  const realH = th * 2 + 22;
  const previewW = 260;
  const previewH = Math.round(Math.min(180, Math.max(54, (previewW * realH) / sw)));
  box.style.width = `${previewW}px`;
  box.style.height = `${previewH}px`;
}

function populateBgFolderSelect(folders) {
  const select = document.getElementById("bgFolderSelect");
  if (!select) return;
  const prev = select.value;
  select.innerHTML = "";
  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    const hasBg = Boolean(folderBgMap[f.id]);
    opt.textContent = `${f.title}${hasBg ? " [已设背景]" : ""}`;
    select.appendChild(opt);
  }
  if (prev && Array.from(select.options).some((o) => o.value === prev)) {
    select.value = prev;
  }
  if (typeof window.__syncFolderBgUI === "function") {
    window.__syncFolderBgUI();
  }
}

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      if (file.size <= 1.5 * 1024 * 1024) {
        resolve(reader.result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const maxSide = 1920;
        let w = img.naturalWidth || 1;
        let h = img.naturalHeight || 1;
        if (w > maxSide || h > maxSide) {
          const ratio = Math.min(maxSide / w, maxSide / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", 0.94));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function isCssColorOrGradient(val) {
  if (!val) return false;
  return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|linear-gradient\(|radial-gradient\(|conic-gradient\()/i.test(
    val.trim()
  );
}

function bindBgInteractiveEditor({
  previewWrap,
  previewBox,
  previewImg,
  focalDot,
  scaleBadge,
  urlInput,
  colorPick,
  gradSelect,
  uploadBtn,
  fileInput,
  clearBtn,
  resetPosBtn,
  getState,
  setState
}) {
  function syncUI() {
    if (!previewWrap || !previewImg) return;
    const { bg, pos } = getState();
    const safePos = { x: 50, y: 50, scale: 1, ...(pos || {}) };
    const scale = Math.min(3, Math.max(1, Number(safePos.scale) || 1));
    const isCssBg = isCssColorOrGradient(bg);
    if (urlInput) {
      urlInput.value = bg && !bg.startsWith("data:") ? bg : "";
    }
    if (colorPick && /^#[0-9a-f]{6}$/i.test((bg || "").trim())) {
      colorPick.value = bg.trim();
    }
    if (gradSelect) {
      const matched = Array.from(gradSelect.options).some((o) => o.value === bg);
      gradSelect.value = matched ? bg : "";
    }
    if (bg) {
      previewWrap.style.display = "block";
      if (isCssBg) {
        previewImg.style.backgroundImage = "none";
        previewImg.style.background = bg;
        previewImg.style.transform = "scale(1)";
      } else {
        previewImg.style.background = "";
        previewImg.style.backgroundImage = `url("${bg.replace(/"/g, '\\"')}")`;
        previewImg.style.backgroundSize = "cover";
        previewImg.style.backgroundRepeat = "no-repeat";
        previewImg.style.backgroundPosition = `${safePos.x}% ${safePos.y}%`;
        previewImg.style.transform = `scale(${scale})`;
      }
      if (focalDot) {
        focalDot.style.display = isCssBg ? "none" : "block";
        focalDot.style.left = `${safePos.x}%`;
        focalDot.style.top = `${safePos.y}%`;
      }
      if (scaleBadge) {
        scaleBadge.style.display = isCssBg ? "none" : "block";
        scaleBadge.textContent = `${scale.toFixed(1)}x`;
      }
    } else {
      previewWrap.style.display = "none";
      previewImg.style.background = "";
      previewImg.style.backgroundImage = "";
    }
  }

  uploadBtn?.addEventListener("click", () => fileInput?.click());

  colorPick?.addEventListener("input", async () => {
    await setState({ bg: colorPick.value, pos: { x: 50, y: 50, scale: 1 } }, "已应用纯色背景");
    syncUI();
  });

  gradSelect?.addEventListener("change", async () => {
    if (!gradSelect.value) return;
    await setState({ bg: gradSelect.value, pos: { x: 50, y: 50, scale: 1 } }, "已应用渐变背景");
    syncUI();
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      await setState({ bg: dataUrl, pos: { x: 50, y: 50, scale: 1 } }, "背景已更新");
      syncUI();
    } catch {
      showStatus("图片读取失败");
    }
    fileInput.value = "";
  });

  urlInput?.addEventListener("change", async () => {
    const val = urlInput.value.trim();
    const { pos } = getState();
    await setState(
      { bg: val, pos: val ? { x: 50, y: 50, scale: 1, ...(pos || {}) } : null },
      "背景已更新"
    );
    syncUI();
  });

  clearBtn?.addEventListener("click", async () => {
    await setState({ bg: "", pos: null }, "已清除背景");
    syncUI();
  });

  resetPosBtn?.addEventListener("click", async () => {
    const { bg } = getState();
    if (!bg) return;
    await setState({ bg, pos: { x: 50, y: 50, scale: 1 } }, "已重置居中与缩放");
    syncUI();
  });

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startPos = { x: 50, y: 50, scale: 1 };

  previewBox?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const { bg, pos } = getState();
    if (!bg) return;
    e.preventDefault();
    isDragging = true;
    previewBox.style.cursor = "grabbing";
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startPos = { x: 50, y: 50, scale: 1, ...(pos || {}) };
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging || !previewBox || !previewImg) return;
    const rect = previewBox.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStartX) / Math.max(1, rect.width)) * 100;
    const dyPct = ((e.clientY - dragStartY) / Math.max(1, rect.height)) * 100;
    const x = Math.round(Math.min(100, Math.max(0, startPos.x - dxPct)));
    const y = Math.round(Math.min(100, Math.max(0, startPos.y - dyPct)));
    const nextPos = { ...startPos, x, y };
    previewImg.style.backgroundPosition = `${x}% ${y}%`;
    if (focalDot) {
      focalDot.style.left = `${x}%`;
      focalDot.style.top = `${y}%`;
    }
    setState({ posOnly: nextPos });
  });

  window.addEventListener("mouseup", async () => {
    if (!isDragging) return;
    isDragging = false;
    if (previewBox) previewBox.style.cursor = "grab";
    await setState({ flushPos: true }, "已保存裁剪中心点");
  });

  let wheelSaveTimer = null;
  previewBox?.addEventListener(
    "wheel",
    (e) => {
      const { bg, pos } = getState();
      if (!bg || !previewImg) return;
      e.preventDefault();
      const cur = { x: 50, y: 50, scale: 1, ...(pos || {}) };
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const nextScale = Math.round(Math.min(3, Math.max(1, cur.scale + delta)) * 10) / 10;
      const nextPos = { ...cur, scale: nextScale };
      previewImg.style.transform = `scale(${nextScale})`;
      if (scaleBadge) scaleBadge.textContent = `${nextScale.toFixed(1)}x`;
      setState({ posOnly: nextPos });
      if (wheelSaveTimer) clearTimeout(wheelSaveTimer);
      wheelSaveTimer = setTimeout(async () => {
        await setState({ flushPos: true }, "已保存背景缩放");
      }, 200);
    },
    { passive: false }
  );

  return syncUI;
}

async function initFolderBgControls() {
  const localRes = await chrome.storage.local.get([
    "folderBgMap",
    "folderBgPosMap",
    "folderClickUrlMap",
    "categoryBarBg",
    "categoryBarBgPos"
  ]);
  if (localRes.folderBgMap && typeof localRes.folderBgMap === "object") {
    folderBgMap = localRes.folderBgMap;
  }
  if (localRes.folderBgPosMap && typeof localRes.folderBgPosMap === "object") {
    folderBgPosMap = localRes.folderBgPosMap;
  }
  if (localRes.folderClickUrlMap && typeof localRes.folderClickUrlMap === "object") {
    folderClickUrlMap = localRes.folderClickUrlMap;
  }
  if (typeof localRes.categoryBarBg === "string") {
    categoryBarBg = localRes.categoryBarBg;
  }
  if (localRes.categoryBarBgPos && typeof localRes.categoryBarBgPos === "object") {
    categoryBarBgPos = localRes.categoryBarBgPos;
  }

  const select = document.getElementById("bgFolderSelect");
  const clickUrlInput = document.getElementById("folderClickUrlInput");
  if (!select) return;

  function syncClickUrlUI() {
    if (!clickUrlInput) return;
    const fid = select.value;
    clickUrlInput.value = (fid && folderClickUrlMap[fid]) || "";
  }

  clickUrlInput?.addEventListener("change", async () => {
    const fid = select.value;
    if (!fid) return;
    const val = clickUrlInput.value.trim();
    if (val) folderClickUrlMap[fid] = val;
    else delete folderClickUrlMap[fid];
    await chrome.storage.local.set({ folderClickUrlMap });
    showStatus("已保存该文件夹点击跳转网址");
  });

  const syncFolderBgUI = bindBgInteractiveEditor({
    previewWrap: document.getElementById("bgPreviewWrap"),
    previewBox: document.getElementById("bgPreviewBox"),
    previewImg: document.getElementById("bgPreviewImg"),
    focalDot: document.getElementById("bgFocalDot"),
    scaleBadge: document.getElementById("bgScaleBadge"),
    urlInput: document.getElementById("bgUrlInput"),
    colorPick: document.getElementById("bgColorPick"),
    gradSelect: document.getElementById("bgGradSelect"),
    uploadBtn: document.getElementById("bgUploadBtn"),
    fileInput: document.getElementById("bgFileInput"),
    clearBtn: document.getElementById("bgClearBtn"),
    resetPosBtn: document.getElementById("bgResetPosBtn"),
    getState: () => {
      const fid = select.value;
      return {
        bg: fid ? folderBgMap[fid] || "" : "",
        pos: (fid && folderBgPosMap[fid]) || { x: 50, y: 50, scale: 1 }
      };
    },
    setState: async (patch, msg) => {
      const fid = select.value;
      if (!fid) return;
      if (patch.posOnly) {
        folderBgPosMap[fid] = patch.posOnly;
        return;
      }
      if (patch.flushPos) {
        await chrome.storage.local.set({ folderBgPosMap });
        if (msg) showStatus(msg);
        return;
      }
      if (patch.bg) {
        folderBgMap[fid] = patch.bg;
        if (patch.pos) folderBgPosMap[fid] = patch.pos;
      } else {
        delete folderBgMap[fid];
        delete folderBgPosMap[fid];
      }
      await chrome.storage.local.set({ folderBgMap, folderBgPosMap });
      populateBgFolderSelect(cachedFolders);
      if (msg) showStatus(msg);
    }
  });

  window.__syncFolderBgUI = () => {
    syncFolderBgUI();
    syncClickUrlUI();
  };
  select.addEventListener("change", () => {
    syncFolderBgUI();
    syncClickUrlUI();
  });

  const syncCatBarBgUI = bindBgInteractiveEditor({
    previewWrap: document.getElementById("catBarBgPreviewWrap"),
    previewBox: document.getElementById("catBarBgPreviewBox"),
    previewImg: document.getElementById("catBarBgPreviewImg"),
    focalDot: document.getElementById("catBarBgFocalDot"),
    scaleBadge: document.getElementById("catBarBgScaleBadge"),
    urlInput: document.getElementById("catBarBgUrlInput"),
    colorPick: document.getElementById("catBarBgColorPick"),
    gradSelect: document.getElementById("catBarBgGradSelect"),
    uploadBtn: document.getElementById("catBarBgUploadBtn"),
    fileInput: document.getElementById("catBarBgFileInput"),
    clearBtn: document.getElementById("catBarBgClearBtn"),
    resetPosBtn: document.getElementById("catBarBgResetPosBtn"),
    getState: () => ({ bg: categoryBarBg, pos: categoryBarBgPos }),
    setState: async (patch, msg) => {
      if (patch.posOnly) {
        categoryBarBgPos = patch.posOnly;
        return;
      }
      if (patch.flushPos) {
        await chrome.storage.local.set({ categoryBarBgPos });
        if (msg) showStatus(msg);
        return;
      }
      categoryBarBg = patch.bg || "";
      categoryBarBgPos = patch.pos || { x: 50, y: 50, scale: 1 };
      await chrome.storage.local.set({ categoryBarBg, categoryBarBgPos });
      if (msg) showStatus(msg);
    }
  });
  syncCatBarBgUI();
}

function syncNewtabIconPickerUI() {
  const hidden = document.getElementById("newtabIconShape");
  const picker = document.getElementById("newtabIconPicker");
  if (!hidden || !picker) return;
  const cur = hidden.value || "bookmarkSolid";
  const fg = document.getElementById("newtabIconColor")?.value || "#e5e7eb";
  const bg = document.getElementById("newtabIconBg")?.value || "transparent";
  picker.querySelectorAll(".icon-pick-btn").forEach((btn) => {
    const isActive = btn.dataset.shape === cur;
    btn.classList.toggle("active", isActive);
    btn.style.color = fg;
    btn.style.background = bg !== "transparent" ? bg : "";
  });
}

document.getElementById("newtabIconPicker")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".icon-pick-btn");
  if (!btn) return;
  const hidden = document.getElementById("newtabIconShape");
  if (hidden) hidden.value = btn.dataset.shape;
  syncNewtabIconPickerUI();
  scheduleLivePreview();
});
document.getElementById("newtabIconColor")?.addEventListener("input", syncNewtabIconPickerUI);
document.getElementById("newtabIconBg")?.addEventListener("change", syncNewtabIconPickerUI);

document.getElementById("didaOauthBtn")?.addEventListener("click", async () => {
  const host = document.getElementById("didaHost").value || "dida365.com";
  const clientId = document.getElementById("didaClientId").value.trim();
  const clientSecret = document.getElementById("didaClientSecret").value.trim();
  const hint = document.getElementById("didaStatusHint");
  if (!clientId || !clientSecret) {
    if (hint) hint.textContent = "请先填写 Client ID 和 Client Secret";
    return;
  }
  await chrome.storage.sync.set({
    didaHost: host,
    didaClientId: clientId,
    didaClientSecret: clientSecret
  });
  const redirectUri = chrome.runtime.getURL("options.html");
  const authUrl =
    `https://${host}/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent("tasks:read tasks:write")}&state=dida_auth`;
  window.location.href = authUrl;
});

document.getElementById("didaTestBtn")?.addEventListener("click", async () => {
  const host = document.getElementById("didaHost").value || "dida365.com";
  const token = document.getElementById("didaToken").value.trim();
  const hint = document.getElementById("didaStatusHint");
  if (!token) {
    if (hint) hint.textContent = "请先填写 Access Token";
    return;
  }
  if (hint) hint.textContent = "测试连接中...";
  const res = await chrome.runtime.sendMessage({
    type: "DIDA_API",
    host,
    token,
    method: "GET",
    path: "/open/v1/project"
  });
  if (res?.ok) {
    const count = Array.isArray(res.data) ? res.data.length : 0;
    if (hint) hint.textContent = `连接成功！已读取 ${count} 个清单`;
  } else {
    if (hint) hint.textContent = `连接失败：${res?.error || "请检查 Token 或服务版本"}`;
  }
});

async function handleDidaOauthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code || params.get("state") !== "dida_auth") return;
  const hint = document.getElementById("didaStatusHint");
  if (hint) hint.textContent = "正在换取 Access Token...";
  const cfg = await chrome.storage.sync.get(["didaHost", "didaClientId", "didaClientSecret"]);
  const res = await chrome.runtime.sendMessage({
    type: "DIDA_EXCHANGE_CODE",
    host: cfg.didaHost || "dida365.com",
    clientId: cfg.didaClientId || "",
    clientSecret: cfg.didaClientSecret || "",
    code,
    redirectUri: chrome.runtime.getURL("options.html")
  });
  history.replaceState({}, "", chrome.runtime.getURL("options.html"));
  if (res?.ok && res.accessToken) {
    document.getElementById("didaToken").value = res.accessToken;
    await chrome.storage.sync.set({ didaToken: res.accessToken });
    if (hint) hint.textContent = "授权成功，已自动保存 Access Token！";
    showStatus("滴答清单授权成功");
  } else {
    if (hint) hint.textContent = `换取 Token 失败：${res?.error || "请检查 Client ID/Secret 及回调地址"}`;
  }
}

let sidebarSearchBoxesDraft = [];

function getAvailableSearchEngineNames() {
  const raw = document.getElementById("newtabSearchEngines")?.value || "";
  const names = ["书签"];
  const parsed = [];
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf("|");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();
    if (name && url) parsed.push(name);
  }
  const webNames =
    parsed.length > 0 ? parsed : ["Google", "必应", "百度", "DuckDuckGo", "GitHub", "B站"];
  for (const n of webNames) {
    if (!names.includes(n)) names.push(n);
  }
  return names;
}

function renderSidebarSearchBoxesUI() {
  const wrap = document.getElementById("sidebarSearchBoxesList");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (sidebarSearchBoxesDraft.length === 0) {
    const tip = document.createElement("div");
    tip.className = "small-label";
    tip.textContent = "当前未启用侧边栏搜索框，点击右上角「+ 添加搜索框」可叠加 1 个或多个搜索框。";
    wrap.appendChild(tip);
    return;
  }
  const engines = getAvailableSearchEngineNames();
  sidebarSearchBoxesDraft.forEach((box, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.style.cssText = "justify-content: flex-start; gap: 10px; flex-wrap: wrap;";

    const label = document.createElement("span");
    label.className = "small-label";
    label.style.minWidth = "64px";
    label.textContent = `搜索框 #${idx + 1}`;

    const posSel = document.createElement("select");
    posSel.style.width = "136px";
    posSel.innerHTML = `
      <option value="top">侧边栏最上方</option>
      <option value="bottom">侧边栏最下方</option>
    `;
    posSel.value = box.pos === "bottom" ? "bottom" : "top";
    posSel.addEventListener("change", () => {
      box.pos = posSel.value;
      scheduleLivePreview();
    });

    const engSel = document.createElement("select");
    engSel.style.width = "150px";
    const opts = engines.includes(box.engine) ? engines : [...engines, box.engine];
    for (const name of opts) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name === "书签" ? "书签搜索" : name;
      engSel.appendChild(o);
    }
    engSel.value = box.engine || "Google";
    engSel.addEventListener("change", () => {
      box.engine = engSel.value;
      scheduleLivePreview();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-secondary";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => {
      sidebarSearchBoxesDraft.splice(idx, 1);
      renderSidebarSearchBoxesUI();
      scheduleLivePreview();
    });

    row.appendChild(label);
    row.appendChild(posSel);
    row.appendChild(engSel);
    row.appendChild(delBtn);
    wrap.appendChild(row);
  });
}

document.getElementById("addSidebarSearchBoxBtn")?.addEventListener("click", () => {
  const engines = getAvailableSearchEngineNames();
  const nextEng = engines[(sidebarSearchBoxesDraft.length + 1) % engines.length] || "Google";
  sidebarSearchBoxesDraft.push({ pos: "top", engine: nextEng });
  renderSidebarSearchBoxesUI();
  scheduleLivePreview();
});

document.getElementById("newtabSearchEngines")?.addEventListener("input", () => {
  renderSidebarSearchBoxesUI();
});

document.getElementById("newtabWallpaperUploadBtn")?.addEventListener("click", () => {
  document.getElementById("newtabWallpaperFile")?.click();
});
document.getElementById("newtabWallpaperFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = typeof reader.result === "string" ? reader.result : "";
    if (!dataUrl) return;
    await chrome.storage.local.set({ newtabWallpaperData: dataUrl });
    const hint = document.getElementById("newtabWallpaperHint");
    if (hint) hint.textContent = `已上传本地壁纸（${file.name}）`;
    showStatus("已保存本地壁纸");
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});
document.getElementById("newtabWallpaperClearBtn")?.addEventListener("click", async () => {
  document.getElementById("newtabWallpaperUrl").value = "";
  await chrome.storage.local.remove("newtabWallpaperData");
  await chrome.storage.sync.set({ newtabWallpaperUrl: "" });
  const hint = document.getElementById("newtabWallpaperHint");
  if (hint) hint.textContent = "已清除壁纸";
  showStatus("已清除新标签页壁纸");
});

initPageTheme();
initFolderBgControls().then(() => loadSystemFonts().then(load).then(handleDidaOauthCallback));
