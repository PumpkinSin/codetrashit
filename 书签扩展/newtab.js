const ICONS = {
  plusCircle: (fg) =>
    `<circle cx="16" cy="16" r="11" fill="none" stroke="${fg}" stroke-width="2.2"/><path d="M16 11v10M11 16h10" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>`,
  plusSquare: (fg) =>
    `<rect x="6" y="6" width="20" height="20" rx="3" fill="none" stroke="${fg}" stroke-width="2.2"/><path d="M16 11v10M11 16h10" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>`,
  bookmarkOutline: (fg) =>
    `<path d="M9 5h14v22l-7-5-7 5V5z" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linejoin="round"/>`,
  bookmarkSolid: (fg) =>
    `<path d="M9 5h14v22l-7-5-7 5V5z" fill="${fg}"/>`,
  starOutline: (fg) =>
    `<path d="M16 4l3.7 7.5 8.3 1.2-6 5.8 1.4 8.3L16 23l-7.4 3.8 1.4-8.3-6-5.8 8.3-1.2L16 4z" fill="none" stroke="${fg}" stroke-width="2" stroke-linejoin="round"/>`,
  starSolid: (fg) =>
    `<path d="M16 4l3.7 7.5 8.3 1.2-6 5.8 1.4 8.3L16 23l-7.4 3.8 1.4-8.3-6-5.8 8.3-1.2L16 4z" fill="${fg}"/>`
};

const DEFAULT_SEARCH_ENGINES = [
  { name: "Google", url: "https://www.google.com/search?q=%s" },
  { name: "必应", url: "https://www.bing.com/search?q=%s" },
  { name: "百度", url: "https://www.baidu.com/s?wd=%s" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { name: "GitHub", url: "https://github.com/search?q=%s" },
  { name: "B站", url: "https://search.bilibili.com/all?keyword=%s" }
];

function buildFaviconDataUrl(shape, fgColor, bgColor, customSvg) {
  const raw = (customSvg || "").trim();
  if (raw && /<svg[\s>]/i.test(raw)) {
    const withNs = raw.includes("xmlns=")
      ? raw
      : raw.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return `data:image/svg+xml,${encodeURIComponent(withNs)}`;
  }
  const draw = ICONS[shape] || ICONS.bookmarkOutline;
  const bgRect =
    bgColor && bgColor !== "transparent"
      ? `<rect width="32" height="32" rx="6" fill="${bgColor}"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${bgRect}${draw(fgColor)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Config & Data State
let didaCfg = { host: "dida365.com", token: "" };
let wallpaperSrc = "";
let searchEngines = [...DEFAULT_SEARCH_ENGINES];
let activeEngineName = "Google";

let projects = [];
let allTasks = [];
let completedHistory = [];

// Workspace UI State (persisted in chrome.storage.local)
let workspaceMode = "list"; // list | calendar | gantt
let calendarScale = "month"; // month | week | day
let calendarAnchor = new Date();
let ganttAnchor = new Date();

// List Mode State
let activeSmartView = "ALL"; // ALL | TODAY | NEXT7 | OVERDUE | HIGH | NODATE | INBOX | COMPLETED
let activeProjectId = "ALL"; // ALL | <projectId>
let activeTag = "";
let searchQuery = "";
let sortMode = "default"; // default | dueDate | priority | title
let viewMode = "list"; // list | kanban
let collapsedTaskIds = new Set();
let collapsedGanttGroups = new Set();
let selectedTaskId = null;

function didaApi(method, path, body) {
  return chrome.runtime.sendMessage({
    type: "DIDA_API",
    host: didaCfg.host,
    token: didaCfg.token,
    method,
    path,
    body
  });
}

function parseSearchEngines(raw) {
  const text = (raw || "").trim();
  if (!text) return [...DEFAULT_SEARCH_ENGINES];
  const parsed = [];
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf("|");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();
    if (name && url) parsed.push({ name, url });
  }
  return parsed.length > 0 ? parsed : [...DEFAULT_SEARCH_ENGINES];
}

function serializeSearchEngines(list) {
  return list.map((e) => `${e.name} | ${e.url}`).join("\n");
}

function getLocalOffsetStr() {
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}${mm}`;
}

function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

function toDidaIso(dateStr, timeStr = "09:00", isAllDay = true) {
  if (!dateStr) return "";
  const t = isAllDay ? "00:00:00.000" : `${timeStr || "09:00"}:00.000`;
  return `${dateStr}T${t}${getLocalOffsetStr()}`;
}

function dateToYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateToYmd(d);
}

function isoToTimeInput(iso) {
  if (!iso) return "09:00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "09:00";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function getDayDiff(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const todayStart = startOfDay(new Date());
  const dueStart = startOfDay(d);
  return Math.round((dueStart - todayStart) / 86400000);
}

function formatDueDate(iso) {
  const diffDays = getDayDiff(iso);
  if (diffDays === null) return { text: "", overdue: false };
  const d = new Date(iso);
  if (diffDays === 0) return { text: "今天", overdue: false };
  if (diffDays === 1) return { text: "明天", overdue: false };
  if (diffDays === -1) return { text: "昨天", overdue: true };
  return {
    text: `${d.getMonth() + 1}月${d.getDate()}日`,
    overdue: diffDays < 0
  };
}

function isInboxTask(task) {
  const knownIds = new Set(projects.map((p) => p.id));
  return !task.projectId || String(task.projectId).startsWith("inbox") || !knownIds.has(task.projectId);
}

async function recordCompletedTask(task) {
  const entry = {
    id: task.id,
    title: task.title || "(无标题)",
    projectId: task.projectId || "",
    completedAt: new Date().toISOString()
  };
  completedHistory = [entry, ...completedHistory.filter((x) => x.id !== task.id)].slice(0, 100);
  await chrome.storage.local.set({ didaCompletedHistory: completedHistory });
}

function persistViewPrefs() {
  chrome.storage.local.set({
    didaWorkspaceMode: workspaceMode,
    didaCalendarScale: calendarScale
  });
}

/* ==================== NO-API WALLPAPER & SEARCH VIEW ==================== */
let clockTimer = null;

function renderWallpaperSearchUI() {
  const root = document.getElementById("didaWorkspace");
  if (!root) return;
  root.classList.add("wallpaper-mode");

  if (!searchEngines.some((e) => e.name === activeEngineName)) {
    activeEngineName = searchEngines[0]?.name || "Google";
  }

  const stageClass = wallpaperSrc ? "wallpaper-stage" : "wallpaper-stage default-bg";
  const topSwitcherHtml = didaCfg.token
    ? `<div class="mode-switcher wp-top-switcher">
        <button class="mode-tab" data-mode="list">清单</button>
        <button class="mode-tab" data-mode="calendar">日历</button>
        <button class="mode-tab" data-mode="gantt">甘特图</button>
        <button class="mode-tab active" data-mode="search">搜索</button>
      </div>`
    : "";

  root.innerHTML = `
    <div id="wpStage" class="${stageClass}">
      <div class="wallpaper-scrim"></div>
      ${topSwitcherHtml}
      <div class="search-glass">
        <div id="wpClock" class="wp-clock">00:00</div>
        <div id="wpDate" class="wp-date"></div>
        <div id="wpEngines" class="engine-pills"></div>
        <form id="wpSearchForm" class="search-box-pill">
          <input id="wpSearchInput" type="text" autocomplete="off" placeholder="使用 ${activeEngineName} 搜索..." />
          <button type="submit">搜索</button>
        </form>
      </div>
      <div class="wp-corner-actions">
        <input id="wpLocalFile" type="file" accept="image/*" style="display:none" />
        <button id="wpChangeBtn" type="button" class="wp-chip">更换壁纸</button>
        <button id="wpOptBtn" type="button" class="wp-chip">设置</button>
      </div>
    </div>
  `;

  const stage = document.getElementById("wpStage");
  if (wallpaperSrc) {
    stage.style.backgroundImage = `url("${wallpaperSrc.replace(/"/g, '\\"')}")`;
  }

  root.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      workspaceMode = btn.dataset.mode;
      persistViewPrefs();
      renderDidaUI();
    });
  });

  function updateClock() {
    const now = new Date();
    const clk = document.getElementById("wpClock");
    const dt = document.getElementById("wpDate");
    if (!clk || !dt) return;
    clk.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    dt.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${weeks[now.getDay()]}`;
  }
  updateClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 15000);

  const engWrap = document.getElementById("wpEngines");
  const inp = document.getElementById("wpSearchInput");

  for (const eng of searchEngines) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "engine-pill" + (eng.name === activeEngineName ? " active" : "");
    b.textContent = eng.name;
    b.addEventListener("click", () => {
      activeEngineName = eng.name;
      chrome.storage.local.set({ newtabActiveEngine: activeEngineName });
      renderWallpaperSearchUI();
    });
    engWrap.appendChild(b);
  }

  const addEngBtn = document.createElement("button");
  addEngBtn.type = "button";
  addEngBtn.className = "engine-pill";
  addEngBtn.textContent = "+ 自定义";
  addEngBtn.addEventListener("click", openAddEngineModal);
  engWrap.appendChild(addEngBtn);

  document.getElementById("wpSearchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (inp?.value || "").trim();
    if (!q) return;
    const eng = searchEngines.find((x) => x.name === activeEngineName) || searchEngines[0];
    const targetUrl = eng.url.includes("%s")
      ? eng.url.replace(/%s/g, encodeURIComponent(q))
      : `${eng.url}${encodeURIComponent(q)}`;
    window.location.href = targetUrl;
  });

  const wpFile = document.getElementById("wpLocalFile");
  document.getElementById("wpChangeBtn")?.addEventListener("click", () => wpFile?.click());
  wpFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        wallpaperSrc = reader.result;
        await chrome.storage.local.set({ newtabWallpaperData: wallpaperSrc });
        renderWallpaperSearchUI();
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("wpOptBtn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function openAddEngineModal() {
  const mask = document.createElement("div");
  mask.className = "dida-modal-mask";
  mask.innerHTML = `
    <div class="dida-modal">
      <div class="dida-modal-title">添加自定义搜索引擎</div>
      <div class="drawer-field">
        <div class="drawer-label">引擎名称</div>
        <input id="engNameInp" class="drawer-input" placeholder="例如：知乎、小红书、维基百科" />
      </div>
      <div class="drawer-field">
        <div class="drawer-label">搜索链接（用 %s 代表关键词）</div>
        <input id="engUrlInp" class="drawer-input" placeholder="https://www.zhihu.com/search?q=%s" />
      </div>
      <div class="drawer-row" style="justify-content:flex-end;">
        <button id="engCancel" class="dida-btn">取消</button>
        <button id="engSave" class="dida-btn primary">添加</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector("#engCancel").addEventListener("click", close);
  mask.querySelector("#engSave").addEventListener("click", async () => {
    const name = (mask.querySelector("#engNameInp").value || "").trim();
    const url = (mask.querySelector("#engUrlInp").value || "").trim();
    if (!name || !url) return;
    searchEngines.push({ name, url });
    activeEngineName = name;
    await chrome.storage.sync.set({ newtabSearchEngines: serializeSearchEngines(searchEngines) });
    await chrome.storage.local.set({ newtabActiveEngine: activeEngineName });
    close();
    renderWallpaperSearchUI();
  });
}

/* ==================== DIDA365 LIST / CALENDAR / GANTT ==================== */
function matchesSmartView(task, view) {
  if (view === "ALL") return true;
  if (view === "INBOX") return isInboxTask(task);
  if (view === "HIGH") return Number(task.priority) === 5;
  const diff = getDayDiff(task.dueDate);
  if (view === "NODATE") return diff === null;
  if (view === "OVERDUE") return diff !== null && diff < 0;
  if (view === "TODAY") return diff !== null && diff <= 0;
  if (view === "NEXT7") return diff !== null && diff >= 0 && diff <= 7;
  return true;
}

function getFilteredTasks() {
  const q = searchQuery.trim().toLowerCase();
  return allTasks.filter((t) => {
    if (activeProjectId !== "ALL") {
      if (t.projectId !== activeProjectId) return false;
    } else if (!matchesSmartView(t, activeSmartView)) {
      return false;
    }
    if (activeTag) {
      if (!Array.isArray(t.tags) || !t.tags.includes(activeTag)) return false;
    }
    if (q) {
      const hay = [
        t.title || "",
        t.content || "",
        ...(Array.isArray(t.tags) ? t.tags : []),
        ...(Array.isArray(t.items) ? t.items.map((i) => i.title || "") : [])
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortTaskArray(arr) {
  return [...arr].sort((a, b) => {
    if (sortMode === "dueDate") {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
    } else if (sortMode === "title") {
      return (a.title || "").localeCompare(b.title || "", "zh-CN");
    } else if (sortMode === "priority") {
      const pDiff = (b.priority || 0) - (a.priority || 0);
      if (pDiff !== 0) return pDiff;
    }
    const pDiff = (b.priority || 0) - (a.priority || 0);
    if (pDiff !== 0) return pDiff;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

function appendRichNote(container, rawText) {
  const text = (rawText || "").trim();
  if (!text) return;
  const mdLink = text.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (mdLink) {
    const a = document.createElement("a");
    a.href = mdLink[2];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = mdLink[1].slice(0, 48);
    a.addEventListener("click", (e) => e.stopPropagation());
    container.appendChild(a);
    return;
  }
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    const a = document.createElement("a");
    a.href = urlMatch[1];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = urlMatch[1].slice(0, 48);
    a.addEventListener("click", (e) => e.stopPropagation());
    container.appendChild(a);
    return;
  }
  const cSpan = document.createElement("span");
  cSpan.textContent = text.slice(0, 56);
  container.appendChild(cSpan);
}

function openCreateTaskModal(defaults = {}) {
  const mask = document.createElement("div");
  mask.className = "dida-modal-mask";
  const defStart = defaults.startDate || dateToYmd(new Date());
  const defDue = defaults.dueDate || defStart;
  const defProj = defaults.projectId || (activeProjectId !== "ALL" ? activeProjectId : "");

  mask.innerHTML = `
    <div class="dida-modal">
      <div class="dida-modal-title">新建任务（同步至滴答清单）</div>
      <div class="drawer-field">
        <div class="drawer-label">任务标题</div>
        <input id="ntModalTitle" class="drawer-input" placeholder="输入任务内容..." />
      </div>
      <div class="drawer-row">
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">开始日期</div>
          <input id="ntModalStart" type="date" class="drawer-input" value="${defStart}" />
        </div>
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">截止日期</div>
          <input id="ntModalDue" type="date" class="drawer-input" value="${defDue}" />
        </div>
      </div>
      <div class="drawer-row">
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">所属清单</div>
          <select id="ntModalProj" class="drawer-select">
            <option value="">收集箱</option>
            ${projects.map((p) => `<option value="${p.id}" ${p.id === defProj ? "selected" : ""}>${p.name}</option>`).join("")}
          </select>
        </div>
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">优先级</div>
          <select id="ntModalPrio" class="drawer-select">
            <option value="0">无优先级</option>
            <option value="1">低优先级</option>
            <option value="3">中优先级</option>
            <option value="5">高优先级</option>
          </select>
        </div>
      </div>
      <div class="drawer-row" style="justify-content:flex-end; margin-top:4px;">
        <button id="ntModalCancel" class="dida-btn">取消</button>
        <button id="ntModalSave" class="dida-btn primary">创建任务</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  const titleInp = mask.querySelector("#ntModalTitle");
  titleInp.focus();
  const close = () => mask.remove();
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector("#ntModalCancel").addEventListener("click", close);

  async function doCreate() {
    const title = (titleInp.value || "").trim();
    if (!title) return;
    const saveBtn = mask.querySelector("#ntModalSave");
    saveBtn.disabled = true;
    const sDate = mask.querySelector("#ntModalStart").value;
    const dDate = mask.querySelector("#ntModalDue").value || sDate;
    const pid = mask.querySelector("#ntModalProj").value;
    const prio = Number(mask.querySelector("#ntModalPrio").value) || 0;

    const payload = { title, priority: prio, isAllDay: true, timeZone: getLocalTimeZone() };
    if (pid) payload.projectId = pid;
    if (sDate) payload.startDate = toDidaIso(sDate, "00:00", true);
    if (dDate) payload.dueDate = toDidaIso(dDate >= sDate ? dDate : sDate, "00:00", true);

    const res = await didaApi("POST", "/open/v1/task", payload);
    saveBtn.disabled = false;
    if (res?.ok && res.data) {
      allTasks.unshift(res.data);
      close();
      renderDidaUI();
    } else {
      alert(`创建失败：${res?.error || "未知错误"}`);
    }
  }
  mask.querySelector("#ntModalSave").addEventListener("click", doCreate);
  titleInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doCreate();
  });
}

function openProjectModal(existingProj = null) {
  const mask = document.createElement("div");
  mask.className = "dida-modal-mask";
  const swatches = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];
  let chosenColor = existingProj?.color || "#3b82f6";

  mask.innerHTML = `
    <div class="dida-modal">
      <div class="dida-modal-title">${existingProj ? "编辑清单" : "新建清单"}</div>
      <div class="drawer-field">
        <div class="drawer-label">清单名称</div>
        <input id="projModalName" class="drawer-input" placeholder="例如：工作、学习、娱乐..." value="${(existingProj?.name || "").replace(/"/g, "&quot;")}" />
      </div>
      <div class="drawer-field">
        <div class="drawer-label">标识颜色</div>
        <div id="projSwatches" class="color-swatches"></div>
      </div>
      <div class="drawer-row" style="justify-content: space-between; margin-top: 4px;">
        <div>
          ${existingProj ? `<button id="projModalDel" class="dida-btn danger">删除清单</button>` : ""}
        </div>
        <div class="drawer-row">
          <button id="projModalCancel" class="dida-btn">取消</button>
          <button id="projModalSave" class="dida-btn primary">保存</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(mask);
  const swWrap = mask.querySelector("#projSwatches");
  function renderSwatches() {
    swWrap.innerHTML = "";
    for (const c of swatches) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch" + (chosenColor.toLowerCase() === c ? " active" : "");
      b.style.background = c;
      b.addEventListener("click", () => {
        chosenColor = c;
        renderSwatches();
      });
      swWrap.appendChild(b);
    }
  }
  renderSwatches();

  const close = () => mask.remove();
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector("#projModalCancel").addEventListener("click", close);

  mask.querySelector("#projModalSave").addEventListener("click", async () => {
    const name = (mask.querySelector("#projModalName").value || "").trim();
    if (!name) return;
    if (existingProj) {
      const res = await didaApi("POST", `/open/v1/project/${encodeURIComponent(existingProj.id)}`, {
        name,
        color: chosenColor
      });
      if (res?.ok) {
        existingProj.name = name;
        existingProj.color = chosenColor;
        close();
        renderDidaUI();
      } else {
        alert(`修改清单失败：${res?.error || "未知错误"}`);
      }
    } else {
      const res = await didaApi("POST", "/open/v1/project", {
        name,
        color: chosenColor,
        viewMode: "list"
      });
      if (res?.ok && res.data) {
        projects.push(res.data);
        activeProjectId = res.data.id;
        close();
        renderDidaUI();
      } else {
        alert(`新建清单失败：${res?.error || "未知错误"}`);
      }
    }
  });

  mask.querySelector("#projModalDel")?.addEventListener("click", async () => {
    if (!confirm(`确定删除清单「${existingProj.name}」吗？其中的任务也会被删除。`)) return;
    const res = await didaApi("DELETE", `/open/v1/project/${encodeURIComponent(existingProj.id)}`);
    if (res?.ok) {
      projects = projects.filter((p) => p.id !== existingProj.id);
      allTasks = allTasks.filter((t) => t.projectId !== existingProj.id);
      if (activeProjectId === existingProj.id) activeProjectId = "ALL";
      close();
      renderDidaUI();
    } else {
      alert(`删除清单失败：${res?.error || "未知错误"}`);
    }
  });
}

function buildTaskCard(task, projNameMap, hasKids = false, nodeWrap = null) {
  const card = document.createElement("div");
  card.className = "task-card" + (selectedTaskId === task.id ? " selected" : "");

  if (viewMode === "list") {
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "task-toggle" + (hasKids ? "" : " spacer");
    toggleBtn.textContent = collapsedTaskIds.has(task.id) ? "▸" : "▾";
    if (hasKids && nodeWrap) {
      toggleBtn.title = "展开 / 收起子任务";
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (collapsedTaskIds.has(task.id)) collapsedTaskIds.delete(task.id);
        else collapsedTaskIds.add(task.id);
        nodeWrap.classList.toggle("collapsed");
        toggleBtn.textContent = collapsedTaskIds.has(task.id) ? "▸" : "▾";
      });
    }
    card.appendChild(toggleBtn);
  }

  const check = document.createElement("button");
  check.type = "button";
  check.className = `task-check p${task.priority || 0}`;
  check.title = "标记完成";
  check.addEventListener("click", async (e) => {
    e.stopPropagation();
    card.style.opacity = "0.35";
    const res = await didaApi(
      "POST",
      `/open/v1/project/${encodeURIComponent(task.projectId)}/task/${encodeURIComponent(task.id)}/complete`
    );
    if (res?.ok) {
      await recordCompletedTask(task);
      allTasks = allTasks.filter((x) => x.id !== task.id);
      if (selectedTaskId === task.id) selectedTaskId = null;
      renderDidaUI();
    } else {
      card.style.opacity = "1";
    }
  });
  card.appendChild(check);

  const body = document.createElement("div");
  body.className = "task-body";
  body.addEventListener("click", () => {
    selectedTaskId = selectedTaskId === task.id ? null : task.id;
    renderDidaUI();
  });

  const titleEl = document.createElement("div");
  titleEl.className = "task-title";
  titleEl.textContent = task.title || "(无标题)";
  body.appendChild(titleEl);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const due = formatDueDate(task.dueDate);
  if (due.text) {
    const dueSpan = document.createElement("span");
    dueSpan.className = "task-due" + (due.overdue ? " overdue" : "");
    dueSpan.textContent = due.text;
    meta.appendChild(dueSpan);
  }
  if (task.repeatFlag) {
    const repSpan = document.createElement("span");
    repSpan.className = "task-meta-badge";
    repSpan.title = task.repeatFlag;
    repSpan.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5L13.5 4.5L11.5 6.5"/><path d="M2.5 7.5V6.5C2.5 5.4 3.4 4.5 4.5 4.5H13.5"/><path d="M4.5 13.5L2.5 11.5L4.5 9.5"/><path d="M13.5 8.5V9.5C13.5 10.6 12.6 11.5 11.5 11.5H2.5"/></svg><span>重复</span>`;
    meta.appendChild(repSpan);
  }
  if (Array.isArray(task.reminders) && task.reminders.length > 0) {
    const remSpan = document.createElement("span");
    remSpan.className = "task-meta-badge";
    remSpan.title = "已设提醒";
    remSpan.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8.5" r="5"/><path d="M8 5.8V8.5L9.8 9.8"/><path d="M3 3.5L5 2M13 3.5L11 2"/></svg>`;
    meta.appendChild(remSpan);
  }
  if (Array.isArray(task.tags) && task.tags.length > 0) {
    for (const tg of task.tags) {
      const tgEl = document.createElement("span");
      tgEl.className = "task-tag";
      tgEl.textContent = `#${tg}`;
      tgEl.addEventListener("click", (e) => {
        e.stopPropagation();
        activeTag = activeTag === tg ? "" : tg;
        renderDidaUI();
      });
      meta.appendChild(tgEl);
    }
  }
  const pName = projNameMap.get(task.projectId);
  if (pName && activeProjectId === "ALL") {
    const pSpan = document.createElement("span");
    pSpan.textContent = pName;
    meta.appendChild(pSpan);
  }
  if (task.content) {
    appendRichNote(meta, task.content);
  }
  if (meta.children.length > 0) body.appendChild(meta);

  if (Array.isArray(task.items) && task.items.length > 0) {
    const clWrap = document.createElement("div");
    clWrap.className = "task-checklist";
    for (const subItem of task.items) {
      const row = document.createElement("div");
      const isDone = subItem.status === 2 || subItem.status === 1;
      row.className = "checklist-item" + (isDone ? " done" : "");
      const box = document.createElement("button");
      box.type = "button";
      box.className = "checklist-box";
      box.addEventListener("click", async (e) => {
        e.stopPropagation();
        subItem.status = isDone ? 0 : 2;
        const res = await didaApi("POST", `/open/v1/task/${encodeURIComponent(task.id)}`, {
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          items: task.items
        });
        if (res?.ok) renderDidaUI();
      });
      const txt = document.createElement("span");
      txt.textContent = subItem.title || "";
      row.appendChild(box);
      row.appendChild(txt);
      clWrap.appendChild(row);
    }
    body.appendChild(clWrap);
  }
  card.appendChild(body);

  const acts = document.createElement("div");
  acts.className = "task-actions";

  const subBtn = document.createElement("button");
  subBtn.type = "button";
  subBtn.className = "task-act";
  subBtn.textContent = "+子项";
  subBtn.title = "为该任务添加子任务";
  subBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const subTitle = prompt(`为「${task.title}」添加子任务：`);
    if (!subTitle || !subTitle.trim()) return;
    const res = await didaApi("POST", "/open/v1/task", {
      title: subTitle.trim(),
      projectId: task.projectId,
      parentId: task.id
    });
    if (res?.ok && res.data) {
      if (!res.data.parentId) res.data.parentId = task.id;
      allTasks.push(res.data);
      collapsedTaskIds.delete(task.id);
      renderDidaUI();
    } else {
      alert(`添加子任务失败：${res?.error || "未知错误"}`);
    }
  });
  acts.appendChild(subBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "task-act";
  editBtn.textContent = "编辑";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedTaskId = task.id;
    renderDidaUI();
  });
  acts.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "task-act danger";
  delBtn.textContent = "删除";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`确定删除任务「${task.title}」吗？`)) return;
    const res = await didaApi(
      "DELETE",
      `/open/v1/project/${encodeURIComponent(task.projectId)}/task/${encodeURIComponent(task.id)}`
    );
    if (res?.ok) {
      allTasks = allTasks.filter((x) => x.id !== task.id);
      if (selectedTaskId === task.id) selectedTaskId = null;
      renderDidaUI();
    }
  });
  acts.appendChild(delBtn);

  card.appendChild(acts);
  return card;
}

function buildEditorDrawer(task) {
  const drawer = document.createElement("aside");
  drawer.className = "dida-drawer";

  let editPrio = Number(task.priority) || 0;
  let editItems = Array.isArray(task.items) ? task.items.map((x) => ({ ...x })) : [];

  const repeatOptions = [
    { label: "不重复", val: "" },
    { label: "每天", val: "RRULE:FREQ=DAILY;INTERVAL=1" },
    { label: "每个工作日", val: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { label: "每周", val: "RRULE:FREQ=WEEKLY;INTERVAL=1" },
    { label: "每月", val: "RRULE:FREQ=MONTHLY;INTERVAL=1" },
    { label: "每年", val: "RRULE:FREQ=YEARLY;INTERVAL=1" }
  ];
  const currentRepeat = task.repeatFlag || "";
  if (currentRepeat && !repeatOptions.some((o) => o.val === currentRepeat)) {
    repeatOptions.push({ label: `自定义 (${currentRepeat})`, val: currentRepeat });
  }

  const reminderOptions = [
    { label: "无提醒", val: "" },
    { label: "准时提醒", val: "TRIGGER:PT0S" },
    { label: "提前 5 分钟", val: "TRIGGER:-PT5M" },
    { label: "提前 30 分钟", val: "TRIGGER:-PT30M" },
    { label: "提前 1 小时", val: "TRIGGER:-PT1H" },
    { label: "提前 1 天", val: "TRIGGER:-P1D" }
  ];
  const currentRem = Array.isArray(task.reminders) && task.reminders[0] ? task.reminders[0] : "";
  if (currentRem && !reminderOptions.some((o) => o.val === currentRem)) {
    reminderOptions.push({ label: currentRem, val: currentRem });
  }

  drawer.innerHTML = `
    <div class="drawer-header">
      <span>编辑任务详情</span>
      <button id="drawerCloseBtn" class="task-act" title="关闭">✕</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-field">
        <div class="drawer-label">标题</div>
        <input id="edTitle" class="drawer-input" />
      </div>
      <div class="drawer-field">
        <div class="drawer-label">优先级</div>
        <div class="prio-group" id="edPrioGroup">
          <button type="button" class="prio-btn p0" data-p="0">无</button>
          <button type="button" class="prio-btn p1" data-p="1">低</button>
          <button type="button" class="prio-btn p3" data-p="3">中</button>
          <button type="button" class="prio-btn p5" data-p="5">高</button>
        </div>
      </div>
      <div class="drawer-row">
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">开始日期（甘特图起点）</div>
          <input id="edStartDate" type="date" class="drawer-input" />
        </div>
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">截止日期</div>
          <input id="edDueDate" type="date" class="drawer-input" />
        </div>
      </div>
      <div class="drawer-row" style="justify-content:space-between;">
        <div class="drawer-quick-dates">
          <button type="button" class="mini-pill" data-qdate="0">今天</button>
          <button type="button" class="mini-pill" data-qdate="1">明天</button>
          <button type="button" class="mini-pill" data-qdate="7">+7天</button>
          <button type="button" class="mini-pill" data-qdate="clear">清除</button>
        </div>
        <div class="drawer-row">
          <input id="edDueTime" type="time" class="drawer-input" style="width:92px;padding:4px 6px;" />
          <label style="font-size:11.5px; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
            <input id="edAllDay" type="checkbox" /> 全天
          </label>
        </div>
      </div>
      <div class="drawer-row">
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">重复规则</div>
          <select id="edRepeat" class="drawer-select">
            ${repeatOptions.map((o) => `<option value="${o.val}">${o.label}</option>`).join("")}
          </select>
        </div>
        <div class="drawer-field" style="flex:1">
          <div class="drawer-label">提醒</div>
          <select id="edReminder" class="drawer-select">
            ${reminderOptions.map((o) => `<option value="${o.val}">${o.label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="drawer-field">
        <div class="drawer-label">标签（用空格或逗号分隔）</div>
        <input id="edTags" class="drawer-input" placeholder="例如：工作 每日签到" />
      </div>
      <div class="drawer-field">
        <div class="drawer-label">备注 / 正文</div>
        <textarea id="edContent" class="drawer-textarea" placeholder="支持粘贴链接或 Markdown 备注..."></textarea>
      </div>
      <div class="drawer-field">
        <div class="drawer-label">检查清单（Checklist）</div>
        <div id="edChecklistWrap"></div>
        <div class="drawer-row">
          <input id="edNewCheckItem" class="drawer-input" style="flex:1" placeholder="新增检查项，回车添加..." />
          <button type="button" id="edAddCheckItemBtn" class="dida-btn">+</button>
        </div>
      </div>
    </div>
    <div class="drawer-footer">
      <div class="drawer-row">
        <button type="button" id="edCompleteBtn" class="dida-btn">✓ 完成</button>
        <button type="button" id="edDeleteBtn" class="dida-btn danger">删除</button>
      </div>
      <button type="button" id="edSaveBtn" class="dida-btn primary">保存修改</button>
    </div>
  `;

  const edTitle = drawer.querySelector("#edTitle");
  const edStartDate = drawer.querySelector("#edStartDate");
  const edDueDate = drawer.querySelector("#edDueDate");
  const edDueTime = drawer.querySelector("#edDueTime");
  const edAllDay = drawer.querySelector("#edAllDay");
  const edRepeat = drawer.querySelector("#edRepeat");
  const edReminder = drawer.querySelector("#edReminder");
  const edTags = drawer.querySelector("#edTags");
  const edContent = drawer.querySelector("#edContent");

  edTitle.value = task.title || "";
  edStartDate.value = isoToDateInput(task.startDate || task.dueDate);
  edDueDate.value = isoToDateInput(task.dueDate || task.startDate);
  edDueTime.value = isoToTimeInput(task.dueDate || task.startDate);
  edAllDay.checked = task.isAllDay !== false;
  edDueTime.disabled = edAllDay.checked;
  edRepeat.value = currentRepeat;
  edReminder.value = currentRem;
  edTags.value = Array.isArray(task.tags) ? task.tags.join(" ") : "";
  edContent.value = task.content || "";

  edAllDay.addEventListener("change", () => {
    edDueTime.disabled = edAllDay.checked;
  });
  edStartDate.addEventListener("change", () => {
    if (edStartDate.value && edDueDate.value && edStartDate.value > edDueDate.value) {
      edDueDate.value = edStartDate.value;
    }
  });
  edDueDate.addEventListener("change", () => {
    if (edStartDate.value && edDueDate.value && edDueDate.value < edStartDate.value) {
      edStartDate.value = edDueDate.value;
    }
  });

  const prioBtns = drawer.querySelectorAll("#edPrioGroup .prio-btn");
  function syncPrioBtns() {
    prioBtns.forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.p) === editPrio);
    });
  }
  syncPrioBtns();
  prioBtns.forEach((b) => {
    b.addEventListener("click", () => {
      editPrio = Number(b.dataset.p);
      syncPrioBtns();
    });
  });

  drawer.querySelectorAll("[data-qdate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.qdate;
      if (v === "clear") {
        edStartDate.value = "";
        edDueDate.value = "";
        return;
      }
      const d = addDays(new Date(), Number(v));
      const ymd = dateToYmd(d);
      if (!edStartDate.value) edStartDate.value = ymd;
      edDueDate.value = ymd;
    });
  });

  const clWrap = drawer.querySelector("#edChecklistWrap");
  function renderDrawerChecklist() {
    clWrap.innerHTML = "";
    editItems.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "drawer-checklist-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = it.status === 2 || it.status === 1;
      cb.addEventListener("change", () => {
        it.status = cb.checked ? 2 : 0;
      });
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = it.title || "";
      inp.addEventListener("input", () => {
        it.title = inp.value;
      });
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "task-act danger";
      rm.textContent = "✕";
      rm.addEventListener("click", () => {
        editItems.splice(idx, 1);
        renderDrawerChecklist();
      });
      row.appendChild(cb);
      row.appendChild(inp);
      row.appendChild(rm);
      clWrap.appendChild(row);
    });
  }
  renderDrawerChecklist();

  const newClInp = drawer.querySelector("#edNewCheckItem");
  function pushCheckItem() {
    const t = (newClInp.value || "").trim();
    if (!t) return;
    editItems.push({ title: t, status: 0 });
    newClInp.value = "";
    renderDrawerChecklist();
  }
  drawer.querySelector("#edAddCheckItemBtn").addEventListener("click", pushCheckItem);
  newClInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pushCheckItem();
    }
  });

  drawer.querySelector("#drawerCloseBtn").addEventListener("click", () => {
    selectedTaskId = null;
    renderDidaUI();
  });

  drawer.querySelector("#edCompleteBtn").addEventListener("click", async () => {
    const res = await didaApi(
      "POST",
      `/open/v1/project/${encodeURIComponent(task.projectId)}/task/${encodeURIComponent(task.id)}/complete`
    );
    if (res?.ok) {
      await recordCompletedTask(task);
      allTasks = allTasks.filter((x) => x.id !== task.id);
      selectedTaskId = null;
      renderDidaUI();
    }
  });

  drawer.querySelector("#edDeleteBtn").addEventListener("click", async () => {
    if (!confirm(`确定删除任务「${task.title}」吗？`)) return;
    const res = await didaApi(
      "DELETE",
      `/open/v1/project/${encodeURIComponent(task.projectId)}/task/${encodeURIComponent(task.id)}`
    );
    if (res?.ok) {
      allTasks = allTasks.filter((x) => x.id !== task.id);
      selectedTaskId = null;
      renderDidaUI();
    }
  });

  drawer.querySelector("#edSaveBtn").addEventListener("click", async () => {
    const title = (edTitle.value || "").trim();
    if (!title) return;
    const saveBtn = drawer.querySelector("#edSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";

    const isAllDay = edAllDay.checked;
    let startVal = edStartDate.value || edDueDate.value;
    let dueVal = edDueDate.value || edStartDate.value;
    if (startVal && dueVal && startVal > dueVal) {
      dueVal = startVal;
    }
    const startIso = startVal ? toDidaIso(startVal, edDueTime.value, isAllDay) : null;
    const dueIso = dueVal ? toDidaIso(dueVal, edDueTime.value, isAllDay) : null;
    const tagsArr = (edTags.value || "")
      .split(/[\s,，#]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      id: task.id,
      projectId: task.projectId,
      title,
      content: edContent.value || "",
      priority: editPrio,
      isAllDay,
      timeZone: task.timeZone || getLocalTimeZone(),
      tags: tagsArr,
      items: editItems.filter((x) => (x.title || "").trim()),
      reminders: edReminder.value ? [edReminder.value] : [],
      repeatFlag: edRepeat.value || "",
      startDate: startIso,
      dueDate: dueIso
    };

    const res = await didaApi("POST", `/open/v1/task/${encodeURIComponent(task.id)}`, payload);
    saveBtn.disabled = false;
    saveBtn.textContent = "保存修改";
    if (res?.ok) {
      const merged = { ...payload, ...(res.data || {}) };
      if (!startVal) {
        merged.startDate = "";
        merged.dueDate = "";
      }
      Object.assign(task, merged);
      renderDidaUI();
    } else {
      alert(`保存失败：${res?.error || "未知错误"}`);
    }
  });

  return drawer;
}

/* ==================== CALENDAR RENDERER ==================== */
function getTasksOnDate(ymd) {
  return allTasks.filter((t) => {
    const s = isoToDateInput(t.startDate);
    const d = isoToDateInput(t.dueDate);
    if (!s && !d) return false;
    const start = s || d;
    const end = d || s;
    return ymd >= start && ymd <= end;
  });
}

function buildCalEventPill(task) {
  const el = document.createElement("div");
  el.className = `cal-event p${task.priority || 0}` + (selectedTaskId === task.id ? " selected" : "");
  el.textContent = task.title || "(无标题)";
  el.title = task.title || "";
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedTaskId = selectedTaskId === task.id ? null : task.id;
    renderDidaUI();
  });
  return el;
}

function renderCalendarView(split) {
  const scroll = document.createElement("div");
  scroll.className = "cal-scroll";
  const todayYmd = dateToYmd(new Date());

  if (calendarScale === "month") {
    const year = calendarAnchor.getFullYear();
    const month = calendarAnchor.getMonth();
    const first = new Date(year, month, 1);
    const firstDow = (first.getDay() + 6) % 7; // Monday = 0
    const gridStart = addDays(first, -firstDow);

    const grid = document.createElement("div");
    grid.className = "cal-month-grid";
    for (const w of ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]) {
      const h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = w;
      grid.appendChild(h);
    }

    for (let i = 0; i < 42; i++) {
      const cur = addDays(gridStart, i);
      const ymd = dateToYmd(cur);
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (cur.getMonth() !== month ? " other" : "");
      cell.addEventListener("dblclick", () => openCreateTaskModal({ startDate: ymd, dueDate: ymd }));

      const top = document.createElement("div");
      top.className = "cal-day-num";
      const numSpan = document.createElement("span");
      if (ymd === todayYmd) numSpan.className = "today-dot";
      numSpan.textContent = cur.getDate();
      top.appendChild(numSpan);
      cell.appendChild(top);

      const dayTasks = sortTaskArray(getTasksOnDate(ymd));
      for (const t of dayTasks.slice(0, 4)) {
        cell.appendChild(buildCalEventPill(t));
      }
      if (dayTasks.length > 4) {
        const more = document.createElement("div");
        more.style.cssText = "font-size:11px;opacity:0.65;padding-left:4px;";
        more.textContent = `+ 还有 ${dayTasks.length - 4} 项`;
        cell.appendChild(more);
      }
      grid.appendChild(cell);
    }
    scroll.appendChild(grid);
  } else if (calendarScale === "week") {
    const dow = (calendarAnchor.getDay() + 6) % 7;
    const weekStart = addDays(calendarAnchor, -dow);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const dows = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    const grid = document.createElement("div");
    grid.className = "cal-week-grid";

    const corner = document.createElement("div");
    corner.className = "cal-dow";
    corner.textContent = "时间";
    grid.appendChild(corner);

    days.forEach((d, idx) => {
      const h = document.createElement("div");
      h.className = "cal-dow";
      const ymd = dateToYmd(d);
      h.innerHTML =
        ymd === todayYmd
          ? `${dows[idx]} <span class="today-dot">${d.getDate()}</span>`
          : `${dows[idx]} ${d.getDate()}`;
      grid.appendChild(h);
    });

    // All-day row
    const allLabel = document.createElement("div");
    allLabel.className = "cal-time-cell";
    allLabel.textContent = "全天";
    grid.appendChild(allLabel);

    for (const d of days) {
      const ymd = dateToYmd(d);
      const cell = document.createElement("div");
      cell.className = "cal-cell";
      cell.style.minHeight = "56px";
      cell.addEventListener("dblclick", () => openCreateTaskModal({ startDate: ymd, dueDate: ymd }));
      const dayTasks = getTasksOnDate(ymd).filter((t) => t.isAllDay !== false);
      for (const t of dayTasks) cell.appendChild(buildCalEventPill(t));
      grid.appendChild(cell);
    }

    // Hourly slots 08:00 - 22:00
    for (let hr = 8; hr <= 22; hr += 2) {
      const tCell = document.createElement("div");
      tCell.className = "cal-time-cell";
      tCell.textContent = `${String(hr).padStart(2, "0")}:00`;
      grid.appendChild(tCell);

      for (const d of days) {
        const ymd = dateToYmd(d);
        const cell = document.createElement("div");
        cell.className = "cal-cell";
        cell.style.minHeight = "54px";
        cell.addEventListener("dblclick", () => openCreateTaskModal({ startDate: ymd, dueDate: ymd }));
        const slotTasks = getTasksOnDate(ymd).filter((t) => {
          if (t.isAllDay !== false) return false;
          const dt = new Date(t.dueDate || t.startDate);
          const h = dt.getHours();
          return h >= hr && h < hr + 2;
        });
        for (const t of slotTasks) cell.appendChild(buildCalEventPill(t));
        grid.appendChild(cell);
      }
    }
    scroll.appendChild(grid);
  } else {
    // Day View
    const ymd = dateToYmd(calendarAnchor);
    const grid = document.createElement("div");
    grid.className = "cal-day-grid";

    const allLabel = document.createElement("div");
    allLabel.className = "cal-time-cell";
    allLabel.textContent = "全天";
    grid.appendChild(allLabel);

    const allCell = document.createElement("div");
    allCell.className = "cal-cell";
    allCell.style.minHeight = "64px";
    allCell.addEventListener("dblclick", () => openCreateTaskModal({ startDate: ymd, dueDate: ymd }));
    for (const t of getTasksOnDate(ymd).filter((x) => x.isAllDay !== false)) {
      allCell.appendChild(buildCalEventPill(t));
    }
    grid.appendChild(allCell);

    for (let hr = 7; hr <= 23; hr++) {
      const tCell = document.createElement("div");
      tCell.className = "cal-time-cell";
      tCell.textContent = `${String(hr).padStart(2, "0")}:00`;
      grid.appendChild(tCell);

      const cell = document.createElement("div");
      cell.className = "cal-cell";
      cell.style.minHeight = "44px";
      cell.addEventListener("dblclick", () => openCreateTaskModal({ startDate: ymd, dueDate: ymd }));
      const slotTasks = getTasksOnDate(ymd).filter((t) => {
        if (t.isAllDay !== false) return false;
        const dt = new Date(t.dueDate || t.startDate);
        return dt.getHours() === hr;
      });
      for (const t of slotTasks) cell.appendChild(buildCalEventPill(t));
      grid.appendChild(cell);
    }
    scroll.appendChild(grid);
  }

  split.appendChild(scroll);
}

/* ==================== GANTT RENDERER ==================== */
function renderGanttView(split) {
  const scroll = document.createElement("div");
  scroll.className = "gantt-scroll";

  const TOTAL_DAYS = 14;
  const winStart = addDays(ganttAnchor, -3);
  const days = Array.from({ length: TOTAL_DAYS }, (_, i) => addDays(winStart, i));
  const todayYmd = dateToYmd(new Date());
  const todayIdx = days.findIndex((d) => dateToYmd(d) === todayYmd);

  const board = document.createElement("div");
  board.className = "gantt-board";

  // Header
  const head = document.createElement("div");
  head.className = "gantt-head";
  const firstHead = document.createElement("div");
  firstHead.className = "gantt-head-cell";
  firstHead.style.cssText = "text-align:left;padding-left:12px;font-weight:700;";
  firstHead.textContent = "清单分组";
  head.appendChild(firstHead);

  days.forEach((d, idx) => {
    const cell = document.createElement("div");
    cell.className = "gantt-head-cell" + (idx === todayIdx ? " today" : "");
    const label = d.getDate() === 1 ? `${d.getMonth() + 1}/1` : String(d.getDate());
    cell.innerHTML = idx === todayIdx ? `<span class="today-dot">${label}</span>` : label;
    head.appendChild(cell);
  });
  board.appendChild(head);

  // Build project groups
  const groups = [
    { id: "__inbox__", name: "收集箱", color: "#6b7280", tasks: [] },
    ...projects.map((p) => ({ id: p.id, name: p.name, color: p.color || "#3b82f6", tasks: [] }))
  ];
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const unscheduled = [];

  for (const t of allTasks) {
    const sYmd = isoToDateInput(t.startDate);
    const dYmd = isoToDateInput(t.dueDate);
    if (!sYmd && !dYmd) {
      unscheduled.push(t);
      continue;
    }
    const g = groupMap.get(t.projectId) || groupMap.get("__inbox__");
    g.tasks.push(t);
  }

  const winStartMs = startOfDay(days[0]).getTime();
  const winEndMs = startOfDay(days[TOTAL_DAYS - 1]).getTime();

  for (const g of groups) {
    if (g.tasks.length === 0 && g.id === "__inbox__") continue;
    const isCollapsed = collapsedGanttGroups.has(g.id);

    const row = document.createElement("div");
    row.className = "gantt-group-row";

    const labelCell = document.createElement("div");
    labelCell.className = "gantt-group-label";
    labelCell.innerHTML = `
      <span style="opacity:0.6;font-size:10px;margin-top:3px;">${isCollapsed ? "▸" : "▾"}</span>
      <span class="proj-dot" style="background:${g.color};margin-top:5px;"></span>
      <span>${g.name} (${g.tasks.length})</span>
    `;
    labelCell.addEventListener("click", () => {
      if (isCollapsed) collapsedGanttGroups.delete(g.id);
      else collapsedGanttGroups.add(g.id);
      renderDidaUI();
    });
    row.appendChild(labelCell);

    const trackWrap = document.createElement("div");
    trackWrap.className = "gantt-track-wrap";

    const bgCols = document.createElement("div");
    bgCols.className = "gantt-bg-cols";
    for (const d of days) {
      const col = document.createElement("div");
      const dow = d.getDay();
      col.className = "gantt-bg-col" + (dow === 0 || dow === 6 ? " weekend" : "");
      bgCols.appendChild(col);
    }
    trackWrap.appendChild(bgCols);

    if (todayIdx >= 0) {
      const line = document.createElement("div");
      line.className = "gantt-today-line";
      line.style.left = `${((todayIdx + 0.5) / TOTAL_DAYS) * 100}%`;
      trackWrap.appendChild(line);
    }

    const visibleInWin = isCollapsed
      ? []
      : g.tasks.filter((t) => {
          const s = startOfDay(new Date(t.startDate || t.dueDate)).getTime();
          const e = startOfDay(new Date(t.dueDate || t.startDate)).getTime();
          return e >= winStartMs && s <= winEndMs;
        });

    if (visibleInWin.length === 0) {
      const emptyLane = document.createElement("div");
      emptyLane.className = "gantt-lane";
      emptyLane.style.cursor = "pointer";
      emptyLane.title = "双击在此清单新建甘特任务";
      emptyLane.addEventListener("dblclick", () =>
        openCreateTaskModal({ projectId: g.id === "__inbox__" ? "" : g.id })
      );
      trackWrap.appendChild(emptyLane);
    } else {
      for (const t of visibleInWin) {
        const lane = document.createElement("div");
        lane.className = "gantt-lane";

        const sDay = startOfDay(new Date(t.startDate || t.dueDate));
        const eDay = startOfDay(new Date(t.dueDate || t.startDate));
        const rawStartIdx = Math.round((sDay.getTime() - winStartMs) / 86400000);
        const rawEndIdx = Math.round((eDay.getTime() - winStartMs) / 86400000);
        const clampedStart = Math.max(0, rawStartIdx);
        const clampedEnd = Math.min(TOTAL_DAYS - 1, Math.max(clampedStart, rawEndIdx));
        const span = Math.max(1, clampedEnd - clampedStart + 1);

        const bar = document.createElement("div");
        bar.className = "gantt-bar" + (selectedTaskId === t.id ? " selected" : "");
        const leftPct = (clampedStart / TOTAL_DAYS) * 100;
        const spanPct = (span / TOTAL_DAYS) * 100;
        bar.style.left = `${leftPct}%`;
        bar.style.minWidth = `${spanPct}%`;
        bar.style.maxWidth = `calc(${100 - leftPct}% - 6px)`;
        bar.style.borderLeftColor = g.color || "var(--nt-accent)";
        bar.title = `${t.title || "(无标题)"} (${isoToDateInput(t.startDate || t.dueDate)} ~ ${isoToDateInput(t.dueDate || t.startDate)})`;

        let pctHtml = "";
        if (Array.isArray(t.items) && t.items.length > 0) {
          const doneCnt = t.items.filter((x) => x.status === 2 || x.status === 1).length;
          const pct = Math.round((doneCnt / t.items.length) * 100);
          pctHtml = `<span style="font-size:11px;opacity:0.68;">${pct}%</span>`;
        }

        const diff = getDayDiff(t.dueDate || t.startDate);
        let stCls = "upcoming";
        let stTxt = "计划中";
        if (diff !== null && diff < 0) {
          stCls = "overdue";
          stTxt = "已延期";
        } else if (diff === 0) {
          stCls = "active";
          stTxt = "今日";
        }

        const titleSpan = document.createElement("span");
        titleSpan.style.cssText = "overflow:hidden;text-overflow:ellipsis;";
        titleSpan.textContent = t.title || "(无标题)";
        bar.appendChild(titleSpan);
        if (pctHtml) {
          const pWrap = document.createElement("span");
          pWrap.innerHTML = pctHtml;
          bar.appendChild(pWrap);
        }
        const stEl = document.createElement("span");
        stEl.className = `gantt-status ${stCls}`;
        stEl.textContent = stTxt;
        bar.appendChild(stEl);

        bar.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedTaskId = selectedTaskId === t.id ? null : t.id;
          renderDidaUI();
        });
        lane.appendChild(bar);
        trackWrap.appendChild(lane);
      }
    }

    row.appendChild(trackWrap);
    board.appendChild(row);
  }

  scroll.appendChild(board);

  if (unscheduled.length > 0) {
    const box = document.createElement("div");
    box.className = "gantt-unscheduled";
    box.innerHTML = `<div style="font-size:12px;font-weight:600;opacity:0.78;">未设置日期的任务 (${unscheduled.length}) · 点击右侧抽屉可快速排期</div>`;
    const list = document.createElement("div");
    list.className = "gantt-unscheduled-list";
    for (const t of unscheduled) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "proj-tab" + (selectedTaskId === t.id ? " active" : "");
      chip.textContent = t.title || "(无标题)";
      chip.addEventListener("click", () => {
        selectedTaskId = selectedTaskId === t.id ? null : t.id;
        renderDidaUI();
      });
      list.appendChild(chip);
    }
    box.appendChild(list);
    scroll.appendChild(box);
  }

  split.appendChild(scroll);
}

/* ==================== MAIN WORKSPACE RENDERER ==================== */
function renderDidaUI(loadingText = "", errorText = "") {
  const root = document.getElementById("didaWorkspace");
  if (!root) return;

  if (!didaCfg.token || workspaceMode === "search") {
    renderWallpaperSearchUI();
    return;
  }

  root.classList.remove("wallpaper-mode");
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }

  const visible = getFilteredTasks();
  const projNameMap = new Map(projects.map((p) => [p.id, p.name]));

  const allTagSet = new Set();
  for (const t of allTasks) {
    if (Array.isArray(t.tags)) {
      for (const tg of t.tags) allTagSet.add(tg);
    }
  }
  const allTags = [...allTagSet].sort((a, b) => a.localeCompare(b, "zh-CN"));

  let rightActionsHtml = "";
  if (workspaceMode === "list") {
    rightActionsHtml = `
      <input id="didaSearchInput" class="dida-search" placeholder="搜索任务 / 备注 / 标签..." />
      <select id="didaSortSelect" class="dida-select compact" title="排序方式">
        <option value="default">默认排序</option>
        <option value="dueDate">按截止日期</option>
        <option value="priority">按优先级</option>
        <option value="title">按标题</option>
      </select>
      <button id="didaViewToggleBtn" class="dida-btn">${viewMode === "list" ? "看板" : "列表"}</button>
      <button id="didaCollapseAllBtn" class="dida-btn">折展</button>
      <button id="didaRefreshBtn" class="dida-btn">刷新</button>
      <button id="didaOpenWebBtn" class="dida-btn">网页版</button>
      <button id="didaSettingsBtn" class="dida-btn" title="扩展设置">设置</button>
    `;
  } else if (workspaceMode === "calendar") {
    const calLabel =
      calendarScale === "month"
        ? `${calendarAnchor.getFullYear()}年${calendarAnchor.getMonth() + 1}月`
        : calendarScale === "week"
          ? `${calendarAnchor.getFullYear()}年${calendarAnchor.getMonth() + 1}月 第${Math.ceil(calendarAnchor.getDate() / 7)}周`
          : `${calendarAnchor.getFullYear()}年${calendarAnchor.getMonth() + 1}月${calendarAnchor.getDate()}日`;
    rightActionsHtml = `
      <div class="mode-switcher">
        <button class="mode-tab ${calendarScale === "month" ? "active" : ""}" data-scale="month">月</button>
        <button class="mode-tab ${calendarScale === "week" ? "active" : ""}" data-scale="week">周</button>
        <button class="mode-tab ${calendarScale === "day" ? "active" : ""}" data-scale="day">日</button>
      </div>
      <span class="dida-badge">${calLabel}</span>
      <button id="navPrevBtn" class="dida-btn">‹</button>
      <button id="navTodayBtn" class="dida-btn">今天</button>
      <button id="navNextBtn" class="dida-btn">›</button>
      <button id="modalAddTaskBtn" class="dida-btn primary">+ 新建任务</button>
      <button id="didaRefreshBtn" class="dida-btn">刷新</button>
      <button id="didaSettingsBtn" class="dida-btn">设置</button>
    `;
  } else {
    const gStart = addDays(ganttAnchor, -3);
    const gEnd = addDays(ganttAnchor, 10);
    const gLabel = `${gStart.getMonth() + 1}月${gStart.getDate()}日 — ${gEnd.getMonth() + 1}月${gEnd.getDate()}日`;
    rightActionsHtml = `
      <span class="dida-badge">${gLabel}</span>
      <button id="navPrevBtn" class="dida-btn">‹</button>
      <button id="navTodayBtn" class="dida-btn">今天</button>
      <button id="navNextBtn" class="dida-btn">›</button>
      <button id="modalAddTaskBtn" class="dida-btn primary">+ 新建甘特任务</button>
      <button id="didaRefreshBtn" class="dida-btn">刷新</button>
      <button id="didaSettingsBtn" class="dida-btn">设置</button>
    `;
  }

  root.innerHTML = `
    <div class="dida-header">
      <div class="dida-title">
        <div class="mode-switcher">
          <button class="mode-tab ${workspaceMode === "list" ? "active" : ""}" data-mode="list">清单</button>
          <button class="mode-tab ${workspaceMode === "calendar" ? "active" : ""}" data-mode="calendar">日历</button>
          <button class="mode-tab ${workspaceMode === "gantt" ? "active" : ""}" data-mode="gantt">甘特图</button>
          <button class="mode-tab ${workspaceMode === "search" ? "active" : ""}" data-mode="search">搜索</button>
        </div>
        <span class="dida-badge">${workspaceMode === "list" ? `${visible.length} / ${allTasks.length}` : `${allTasks.length} 项待办`}</span>
      </div>
      <div class="dida-header-actions">
        ${rightActionsHtml}
      </div>
    </div>
    ${
      workspaceMode === "list"
        ? `
      <div id="didaSmartBar" class="dida-smart-bar"></div>
      <div id="didaProjects" class="dida-projects"></div>
      ${allTags.length > 0 ? `<div id="didaTagsBar" class="dida-tags-bar"></div>` : ""}
      <div class="dida-add-bar">
        <input id="didaNewTitle" class="dida-input" placeholder="添加新任务，回车立即创建..." />
        <input id="didaNewDue" type="date" class="dida-date" title="截止日期（可选）" />
        <select id="didaNewPriority" class="dida-select" title="优先级">
          <option value="0">无优先级</option>
          <option value="1">低优先级</option>
          <option value="3">中优先级</option>
          <option value="5">高优先级</option>
        </select>
        <select id="didaNewProject" class="dida-select" title="所属清单">
          <option value="">收集箱</option>
          ${projects.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
        </select>
        <button id="didaAddBtn" class="dida-btn primary">+ 添加</button>
      </div>
    `
        : ""
    }
    <div id="didaMainSplit" class="dida-main-split"></div>
  `;

  // Top mode tabs
  root.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      workspaceMode = btn.dataset.mode;
      persistViewPrefs();
      renderDidaUI();
    });
  });

  // Calendar scale tabs
  root.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      calendarScale = btn.dataset.scale;
      persistViewPrefs();
      renderDidaUI();
    });
  });

  // Calendar / Gantt Date Nav
  document.getElementById("navPrevBtn")?.addEventListener("click", () => {
    if (workspaceMode === "calendar") {
      if (calendarScale === "month") {
        calendarAnchor = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() - 1, 1);
      } else if (calendarScale === "week") {
        calendarAnchor = addDays(calendarAnchor, -7);
      } else {
        calendarAnchor = addDays(calendarAnchor, -1);
      }
    } else {
      ganttAnchor = addDays(ganttAnchor, -7);
    }
    renderDidaUI();
  });
  document.getElementById("navNextBtn")?.addEventListener("click", () => {
    if (workspaceMode === "calendar") {
      if (calendarScale === "month") {
        calendarAnchor = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + 1, 1);
      } else if (calendarScale === "week") {
        calendarAnchor = addDays(calendarAnchor, 7);
      } else {
        calendarAnchor = addDays(calendarAnchor, 1);
      }
    } else {
      ganttAnchor = addDays(ganttAnchor, 7);
    }
    renderDidaUI();
  });
  document.getElementById("navTodayBtn")?.addEventListener("click", () => {
    if (workspaceMode === "calendar") calendarAnchor = new Date();
    else ganttAnchor = new Date();
    renderDidaUI();
  });
  document.getElementById("modalAddTaskBtn")?.addEventListener("click", () => {
    openCreateTaskModal({});
  });

  document.getElementById("didaRefreshBtn")?.addEventListener("click", loadDidaData);
  document.getElementById("didaOpenWebBtn")?.addEventListener("click", () => {
    window.open(`https://${didaCfg.host}/webapp/`, "_blank");
  });
  document.getElementById("didaSettingsBtn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  if (workspaceMode === "list") {
    const searchInp = document.getElementById("didaSearchInput");
    searchInp.value = searchQuery;
    searchInp.addEventListener("input", () => {
      searchQuery = searchInp.value;
      renderMainSplit(loadingText, errorText, projNameMap);
    });

    const sortSel = document.getElementById("didaSortSelect");
    sortSel.value = sortMode;
    sortSel.addEventListener("change", () => {
      sortMode = sortSel.value;
      renderDidaUI();
    });

    document.getElementById("didaViewToggleBtn").addEventListener("click", () => {
      viewMode = viewMode === "list" ? "kanban" : "list";
      renderDidaUI();
    });

    document.getElementById("didaCollapseAllBtn").addEventListener("click", () => {
      if (collapsedTaskIds.size > 0) {
        collapsedTaskIds.clear();
      } else {
        for (const t of allTasks) {
          if ((Array.isArray(t.childIds) && t.childIds.length > 0) || allTasks.some((x) => x.parentId === t.id)) {
            collapsedTaskIds.add(t.id);
          }
        }
      }
      renderDidaUI();
    });

    // Smart Views
    const smartBar = document.getElementById("didaSmartBar");
    const smartDefs = [
      { id: "ALL", label: "全部" },
      { id: "TODAY", label: "今天" },
      { id: "NEXT7", label: "最近7天" },
      { id: "OVERDUE", label: "已过期" },
      { id: "HIGH", label: "高优先级" },
      { id: "NODATE", label: "无日期" },
      { id: "INBOX", label: "收集箱" },
      { id: "COMPLETED", label: "已完成(本地)" }
    ];
    for (const s of smartDefs) {
      const cnt = s.id === "COMPLETED" ? completedHistory.length : allTasks.filter((t) => matchesSmartView(t, s.id)).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "smart-pill" + (activeProjectId === "ALL" && activeSmartView === s.id ? " active" : "");
      btn.innerHTML = `<span>${s.label}</span><span class="cnt">${cnt}</span>`;
      btn.addEventListener("click", () => {
        activeProjectId = "ALL";
        activeSmartView = s.id;
        renderDidaUI();
      });
      smartBar.appendChild(btn);
    }

    // Project Tabs
    const projEl = document.getElementById("didaProjects");
    for (const p of projects) {
      const cnt = allTasks.filter((t) => t.projectId === p.id).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "proj-tab" + (activeProjectId === p.id ? " active" : "");
      if (p.color) {
        const dot = document.createElement("span");
        dot.className = "proj-dot";
        dot.style.background = p.color;
        btn.appendChild(dot);
      }
      const span = document.createElement("span");
      span.textContent = `${p.name} (${cnt})`;
      btn.appendChild(span);

      if (activeProjectId === p.id) {
        const ed = document.createElement("span");
        ed.className = "proj-edit-btn";
        ed.textContent = "✎";
        ed.title = "编辑 / 删除此清单";
        ed.addEventListener("click", (e) => {
          e.stopPropagation();
          openProjectModal(p);
        });
        btn.appendChild(ed);
      }
      btn.addEventListener("click", () => {
        activeProjectId = activeProjectId === p.id ? "ALL" : p.id;
        renderDidaUI();
      });
      projEl.appendChild(btn);
    }
    const addProjBtn = document.createElement("button");
    addProjBtn.type = "button";
    addProjBtn.className = "proj-tab add-proj";
    addProjBtn.textContent = "+ 新建清单";
    addProjBtn.addEventListener("click", () => openProjectModal(null));
    projEl.appendChild(addProjBtn);

    // Tags Bar
    const tagsBar = document.getElementById("didaTagsBar");
    if (tagsBar) {
      for (const tg of allTags) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag-chip" + (activeTag === tg ? " active" : "");
        chip.textContent = `#${tg}`;
        chip.addEventListener("click", () => {
          activeTag = activeTag === tg ? "" : tg;
          renderDidaUI();
        });
        tagsBar.appendChild(chip);
      }
    }

    // Quick Add Bar
    const addInput = document.getElementById("didaNewTitle");
    const addDue = document.getElementById("didaNewDue");
    const addPrio = document.getElementById("didaNewPriority");
    const addProj = document.getElementById("didaNewProject");
    if (activeProjectId !== "ALL") addProj.value = activeProjectId;
    if (activeSmartView === "TODAY" && activeProjectId === "ALL") {
      addDue.value = dateToYmd(new Date());
    }

    async function handleAddTask() {
      const title = (addInput.value || "").trim();
      if (!title) return;
      addInput.disabled = true;
      const payload = {
        title,
        priority: Number(addPrio.value) || 0
      };
      if (addProj.value) payload.projectId = addProj.value;
      if (addDue.value) {
        const iso = toDidaIso(addDue.value, "00:00", true);
        payload.dueDate = iso;
        payload.startDate = iso;
        payload.isAllDay = true;
      }
      if (activeTag) payload.tags = [activeTag];

      const res = await didaApi("POST", "/open/v1/task", payload);
      addInput.disabled = false;
      if (res?.ok && res.data) {
        addInput.value = "";
        allTasks.unshift(res.data);
        renderDidaUI();
      } else {
        alert(`创建失败：${res?.error || "未知错误"}`);
      }
    }
    document.getElementById("didaAddBtn").addEventListener("click", handleAddTask);
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddTask();
    });
  }

  renderMainSplit(loadingText, errorText, projNameMap);
}

function renderMainSplit(loadingText, errorText, projNameMap) {
  const split = document.getElementById("didaMainSplit");
  if (!split) return;
  split.innerHTML = "";

  if (loadingText) {
    split.innerHTML = `<div class="dida-empty">${loadingText}</div>`;
    return;
  }
  if (errorText) {
    split.innerHTML = `<div class="dida-empty">加载失败：${errorText}</div>`;
    return;
  }

  if (workspaceMode === "calendar") {
    renderCalendarView(split);
  } else if (workspaceMode === "gantt") {
    renderGanttView(split);
  } else if (activeProjectId === "ALL" && activeSmartView === "COMPLETED") {
    const listEl = document.createElement("div");
    listEl.className = "dida-list";
    if (completedHistory.length === 0) {
      listEl.innerHTML = `<div class="dida-empty">暂无本地已完成记录（滴答清单开放 API 不返回历史已完成任务，在此扩展内勾掉的任务会自动记录于此）</div>`;
    } else {
      for (const item of completedHistory) {
        const card = document.createElement("div");
        card.className = "task-card completed-row";
        const body = document.createElement("div");
        body.className = "task-body";
        const tEl = document.createElement("div");
        tEl.className = "task-title";
        tEl.textContent = item.title;
        const mEl = document.createElement("div");
        mEl.className = "task-meta";
        const d = new Date(item.completedAt);
        mEl.textContent = `完成于 ${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        body.appendChild(tEl);
        body.appendChild(mEl);
        card.appendChild(body);
        listEl.appendChild(card);
      }
    }
    split.appendChild(listEl);
  } else {
    const visible = getFilteredTasks();
    if (visible.length === 0) {
      split.innerHTML = `<div class="dida-empty">当前筛选条件下暂无待办任务</div>`;
    } else if (viewMode === "kanban") {
      const board = document.createElement("div");
      board.className = "dida-kanban";
      const cols = [
        { p: 5, label: "高优先级", color: "#ef4444" },
        { p: 3, label: "中优先级", color: "#f59e0b" },
        { p: 1, label: "低优先级", color: "#3b82f6" },
        { p: 0, label: "无优先级", color: "#9ca3af" }
      ];
      for (const c of cols) {
        const colTasks = sortTaskArray(visible.filter((t) => (Number(t.priority) || 0) === c.p));
        const colEl = document.createElement("div");
        colEl.className = "kanban-col";
        colEl.innerHTML = `
          <div class="kanban-col-header">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span class="proj-dot" style="background:${c.color}"></span>${c.label}
            </span>
            <span class="dida-badge">${colTasks.length}</span>
          </div>
        `;
        const colList = document.createElement("div");
        colList.className = "kanban-col-list";
        for (const t of colTasks) {
          colList.appendChild(buildTaskCard(t, projNameMap, false, null));
        }
        colEl.appendChild(colList);
        board.appendChild(colEl);
      }
      split.appendChild(board);
    } else {
      const listEl = document.createElement("div");
      listEl.className = "dida-list";

      const visibleMap = new Map(visible.map((t) => [t.id, t]));
      const childrenMap = new Map();
      const childIdSet = new Set();

      for (const t of visible) {
        if (t.parentId && visibleMap.has(t.parentId)) {
          if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, []);
          childrenMap.get(t.parentId).push(t);
          childIdSet.add(t.id);
        }
      }
      for (const t of visible) {
        if (Array.isArray(t.childIds)) {
          for (const cid of t.childIds) {
            const child = visibleMap.get(cid);
            if (child && !childIdSet.has(cid)) {
              if (!childrenMap.has(t.id)) childrenMap.set(t.id, []);
              childrenMap.get(t.id).push(child);
              childIdSet.add(cid);
            }
          }
        }
      }

      function buildTaskNode(task, visited = new Set()) {
        visited.add(task.id);
        const kids = sortTaskArray((childrenMap.get(task.id) || []).filter((k) => !visited.has(k.id)));
        const hasKids = kids.length > 0;

        const nodeWrap = document.createElement("div");
        nodeWrap.className = "task-node" + (collapsedTaskIds.has(task.id) ? " collapsed" : "");

        nodeWrap.appendChild(buildTaskCard(task, projNameMap, hasKids, nodeWrap));

        if (hasKids) {
          const kidsWrap = document.createElement("div");
          kidsWrap.className = "task-children";
          for (const kid of kids) {
            kidsWrap.appendChild(buildTaskNode(kid, visited));
          }
          nodeWrap.appendChild(kidsWrap);
        }
        return nodeWrap;
      }

      const roots = sortTaskArray(visible.filter((t) => !childIdSet.has(t.id)));
      for (const rootTask of roots) {
        listEl.appendChild(buildTaskNode(rootTask));
      }
      split.appendChild(listEl);
    }
  }

  // Right-side 50/50 Editor Drawer (works across 清单, 日历, 甘特图!)
  if (selectedTaskId) {
    const selTask = allTasks.find((t) => t.id === selectedTaskId);
    if (selTask) {
      split.appendChild(buildEditorDrawer(selTask));
    } else {
      selectedTaskId = null;
    }
  }
}

async function loadDidaData() {
  if (!didaCfg.token) {
    renderDidaUI();
    return;
  }
  renderDidaUI("正在同步滴答清单数据...");
  const projRes = await didaApi("GET", "/open/v1/project");
  if (!projRes?.ok) {
    renderDidaUI("", projRes?.error || "无法获取清单，请检查 API Token");
    return;
  }
  projects = Array.isArray(projRes.data) ? projRes.data.filter((p) => !p.closed) : [];

  const fetchIds = ["inbox", ...projects.map((p) => p.id)];
  const results = await Promise.all(
    fetchIds.map((pid) => didaApi("GET", `/open/v1/project/${encodeURIComponent(pid)}/data`))
  );
  const seen = new Set();
  const merged = [];
  for (const r of results) {
    const list = r?.ok && Array.isArray(r.data?.tasks) ? r.data.tasks : [];
    for (const t of list) {
      if (t.status === 2 || seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
  }
  allTasks = merged;
  renderDidaUI();
}

async function init() {
  const [cfg, localData] = await Promise.all([
    chrome.storage.sync.get([
      "bgColor",
      "tileColor",
      "hoverColor",
      "textColor",
      "accentColor",
      "fontFamily",
      "sidebarWidth",
      "position",
      "newtabIconShape",
      "newtabIconColor",
      "newtabIconBg",
      "customIconSvg",
      "didaHost",
      "didaToken",
      "didaCustomCss",
      "newtabWallpaperUrl",
      "newtabSearchEngines"
    ]),
    chrome.storage.local.get([
      "newtabWallpaperData",
      "newtabActiveEngine",
      "didaWorkspaceMode",
      "didaCalendarScale",
      "didaCompletedHistory"
    ])
  ]);

  const didaCssTag = document.getElementById("didaCustomCssTag");
  if (didaCssTag) didaCssTag.textContent = cfg.didaCustomCss || "";

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--nt-bg", cfg.bgColor || "#18191c");
  rootStyle.setProperty("--nt-card", cfg.tileColor || "#22242a");
  rootStyle.setProperty("--nt-hover", cfg.hoverColor || "#2a2d35");
  rootStyle.setProperty("--nt-text", cfg.textColor || "#d4d7dd");
  rootStyle.setProperty("--nt-accent", cfg.accentColor || "#0078d4");
  if (cfg.fontFamily && !cfg.fontFamily.startsWith("local:")) {
    rootStyle.setProperty("--nt-font", cfg.fontFamily);
  }

  const shell = document.getElementById("newtabShell");
  const frame = document.getElementById("sidebarFrame");
  frame.style.width = `${Math.max(260, Number(cfg.sidebarWidth) || 460)}px`;
  frame.style.background = cfg.bgColor || "#18191c";
  shell.classList.toggle("right", cfg.position === "right");

  const favicon = document.getElementById("faviconLink");
  favicon.href = buildFaviconDataUrl(
    cfg.newtabIconShape || "bookmarkOutline",
    cfg.newtabIconColor || "#e5e7eb",
    cfg.newtabIconBg || "transparent",
    cfg.customIconSvg || ""
  );

  wallpaperSrc = localData.newtabWallpaperData || cfg.newtabWallpaperUrl || "";
  searchEngines = parseSearchEngines(cfg.newtabSearchEngines);
  if (localData.newtabActiveEngine) activeEngineName = localData.newtabActiveEngine;
  if (["list", "calendar", "gantt", "search"].includes(localData.didaWorkspaceMode)) {
    workspaceMode = localData.didaWorkspaceMode;
  }
  if (["month", "week", "day"].includes(localData.didaCalendarScale)) {
    calendarScale = localData.didaCalendarScale;
  }
  if (Array.isArray(localData.didaCompletedHistory)) {
    completedHistory = localData.didaCompletedHistory;
  }

  didaCfg = {
    host: cfg.didaHost || "dida365.com",
    token: (cfg.didaToken || "").trim()
  };
  await loadDidaData();
}

init();
