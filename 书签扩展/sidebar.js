(() => {
  const sidebarTopSearches = document.getElementById("sidebarTopSearches");
  const sidebarBottomSearches = document.getElementById("sidebarBottomSearches");
  let bookmarkSearchQuery = "";

  const DEFAULT_WEB_ENGINES = [
    { name: "Google", url: "https://www.google.com/search?q=%s" },
    { name: "必应", url: "https://www.bing.com/search?q=%s" },
    { name: "百度", url: "https://www.baidu.com/s?wd=%s" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
    { name: "GitHub", url: "https://github.com/search?q=%s" },
    { name: "B站", url: "https://search.bilibili.com/all?keyword=%s" }
  ];

  const customCssTag = document.createElement("style");
  customCssTag.id = "customCssTag";
  document.head.appendChild(customCssTag);

  const searchPane = document.getElementById("searchPane");
  const splitContainer = document.getElementById("splitContainer");
  const topPane = document.getElementById("topPane");
  const bottomPane = document.getElementById("bottomPane");
  const topCatsEl = document.getElementById("topCats");
  const bottomCatsEl = document.getElementById("bottomCats");
  const catDivider = document.querySelector(".cat-divider");
  const categoryBar = document.querySelector(".category-bar");
  const ctxMenu = document.getElementById("ctxMenu");
  const ctxSubmenu = document.getElementById("ctxSubmenu");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalInput = document.getElementById("modalInput");
  const modalConfirmText = document.getElementById("modalConfirmText");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalOkBtn = document.getElementById("modalOkBtn");

  let settings = {
    columns: 2,
    openInNewTab: true,
    openTabActive: true,
    openTabPosition: "after",
    closeOnClickBookmark: true,
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
    sidebarSearchBoxes: [],
    newtabSearchEngines: "",
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
    bgColor: "#18191c",
    barColor: "#121316",
    accentColor: "#0078d4",
    tileColor: "#22242a",
    bigCardColor: "#212329",
    hoverColor: "#2a2d35",
    textColor: "#d4d7dd",
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

  let currentHost = (new URLSearchParams(location.search).get("host") || "").trim().toLowerCase();
  let bookmarkStats = {};
  let allBookmarksById = new Map();

  let allFolders = [];
  let folderMap = new Map();
  let folderBgMap = {};
  let folderBgPosMap = {};
  let folderClickUrlMap = {};
  let categoryBarBg = "";
  let categoryBarBgPos = { x: 50, y: 50, scale: 1 };
  let activeTopSlot = 0;
  let activeBottomSlot = 0;
  let lastActivitySent = 0;
  let pointerDrag = null;
  let suppressNextClick = false;
  let draggedCat = null; // kept for handleCategoryDrop signature compatibility
  let multiSelectMode = false;
  let selectedIds = new Set();
  let collapsedSet = new Set();
  let isPaintingSelect = false;
  let paintSelectAction = "add";

  // Multi-select status bar at top
  const multiBar = document.createElement("div");
  multiBar.className = "multi-bar hidden";
  const multiInfo = document.createElement("span");
  const multiExitBtn = document.createElement("button");
  multiExitBtn.type = "button";
  multiExitBtn.className = "multi-bar-btn";
  multiExitBtn.textContent = "退出多选";
  multiExitBtn.addEventListener("click", () => {
    setMultiSelectMode(false);
  });
  multiBar.appendChild(multiInfo);
  multiBar.appendChild(multiExitBtn);
  document.getElementById("sidebar").insertBefore(multiBar, document.getElementById("searchPane"));

  function updateMultiBar() {
    multiBar.classList.toggle("hidden", !multiSelectMode);
    multiInfo.textContent = `多选模式 · 已选 ${selectedIds.size} 项（点击或按住左键划过选中）`;
  }

  function setMultiSelectMode(enabled, initialId = null) {
    multiSelectMode = Boolean(enabled);
    if (!multiSelectMode) {
      selectedIds.clear();
      isPaintingSelect = false;
    } else if (initialId) {
      selectedIds.add(initialId);
    }
    updateMultiBar();
    refreshData();
  }

  function notifyActivity() {
    const now = Date.now();
    if (now - lastActivitySent < 200) return;
    lastActivitySent = now;
    window.parent.postMessage({ type: "SIDEBAR_ACTIVITY" }, "*");
  }

  ["mousemove", "mousedown", "wheel", "scroll", "keydown"].forEach((evt) => {
    document.addEventListener(evt, notifyActivity, { passive: true });
  });

  function scrollPaneAtPoint(clientY, deltaY) {
    const topRect = topPane.getBoundingClientRect();
    if (clientY >= topRect.top && clientY <= topRect.bottom) {
      topPane.scrollTop += deltaY;
      return true;
    }
    const bottomRect = bottomPane.getBoundingClientRect();
    if (clientY >= bottomRect.top && clientY <= bottomRect.bottom) {
      bottomPane.scrollTop += deltaY;
      return true;
    }
    return false;
  }

  function clearDragVisuals() {
    document
      .querySelectorAll(
        ".drag-over, .drag-insert-before, .drag-insert-after, .drag-insert-top, .drag-insert-bottom, .dragging"
      )
      .forEach((el) => {
        el.classList.remove(
          "drag-over",
          "drag-insert-before",
          "drag-insert-after",
          "drag-insert-top",
          "drag-insert-bottom",
          "dragging"
        );
      });
    document.querySelectorAll(".cat-btn").forEach((el) => {
      el.style.outline = "";
    });
  }

  function startPointerDragCandidate(e, kind, data, label, sourceEl) {
    if (e.button !== 0) return;
    if (kind !== "cat" && multiSelectMode) return;
    e.preventDefault();
    pointerDrag = {
      kind,
      data,
      label: label || "",
      sourceEl,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      ghost: null,
      dropAction: null
    };
  }

  function evaluateDropTarget(clientX, clientY) {
    clearDragVisuals();
    if (!pointerDrag || !pointerDrag.active) return;
    const dragKind = pointerDrag.kind;
    const dragData = pointerDrag.data;
    pointerDrag.sourceEl?.classList.add("dragging");
    pointerDrag.dropAction = null;

    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;

    const catBtn = el.closest(".cat-btn");
    if (catBtn) {
      if (dragKind === "cat" && catBtn.dataset.catIsTop !== undefined) {
        catBtn.style.outline = "2px solid #fff";
        const targetIsTop = catBtn.dataset.catIsTop === "1";
        const targetIdx = Number(catBtn.dataset.catIdx);
        pointerDrag.dropAction = async () => {
          draggedCat = dragData;
          await handleCategoryDrop(targetIsTop, targetIdx);
          draggedCat = null;
        };
        return;
      }
      const folderId = catBtn.dataset.folderId;
      if (dragKind === "folder" && catBtn.dataset.catIsTop !== undefined) {
        catBtn.style.outline = "2px solid #fff";
        const targetIsTop = catBtn.dataset.catIsTop === "1";
        const targetIdx = Number(catBtn.dataset.catIdx);
        const dragLabel = pointerDrag.label || "此文件夹";
        const targetFolder = folderId ? folderMap.get(folderId) : null;
        const dropX = clientX;
        const dropY = clientY;
        pointerDrag.dropAction = async () => {
          const menuItems = [
            {
              label: `替换此分类位（显示「${dragLabel}」）`,
              action: async () => {
                const key = targetIsTop ? "topSlotIds" : "bottomSlotIds";
                const arr = Array.isArray(settings[key])
                  ? [...settings[key]]
                  : ["", "", "", "", "", ""];
                while (arr.length <= targetIdx) arr.push("");
                arr[targetIdx] = dragData.id;
                settings[key] = arr;
                await chrome.storage.sync.set({ [key]: arr });
                refreshData();
              }
            }
          ];
          if (
            folderId &&
            !isFolderDescendant(dragData.id, folderId) &&
            dragData.parentId !== folderId
          ) {
            menuItems.push({
              label: `移动到「${targetFolder?.title || "目标文件夹"}」内部`,
              action: async () => {
                await chrome.bookmarks.move(dragData.id, { parentId: folderId });
              }
            });
          }
          menuItems.push({ sep: true }, { label: "取消", action: () => {} });
          openCtxMenu(dropX, dropY, menuItems);
        };
        return;
      }
      if (folderId && dragKind === "item") {
        catBtn.style.outline = "2px solid #fff";
        pointerDrag.dropAction = () =>
          chrome.bookmarks.move(dragData.id, { parentId: folderId, index: 0 });
        return;
      }
    }

    const linkLi = el.closest("li.link-item[data-bm-id]");
    if (linkLi && dragKind === "item") {
      const targetId = linkLi.dataset.bmId;
      if (targetId !== dragData.id) {
        const targetParentId = linkLi.dataset.parentId;
        const targetIndex = Number(linkLi.dataset.bmIndex);
        if (linkLi.classList.contains("big")) {
          linkLi.classList.add("drag-over");
          pointerDrag.dropAction = async () => {
            if (dragData.parentId === targetParentId) {
              if (dragData.index < targetIndex) {
                await chrome.bookmarks.move(dragData.id, {
                  parentId: targetParentId,
                  index: targetIndex + 1
                });
                await chrome.bookmarks.move(targetId, {
                  parentId: dragData.parentId,
                  index: dragData.index
                });
              } else {
                await chrome.bookmarks.move(dragData.id, {
                  parentId: targetParentId,
                  index: targetIndex
                });
                await chrome.bookmarks.move(targetId, {
                  parentId: dragData.parentId,
                  index: dragData.index + 1
                });
              }
            } else {
              await chrome.bookmarks.move(dragData.id, {
                parentId: targetParentId,
                index: targetIndex
              });
              await chrome.bookmarks.move(targetId, {
                parentId: dragData.parentId,
                index: dragData.index
              });
            }
          };
        } else {
          const rect = linkLi.getBoundingClientRect();
          const isAfter = clientX > rect.left + rect.width / 2;
          linkLi.classList.add(isAfter ? "drag-insert-after" : "drag-insert-before");
          const destIndex = isAfter ? targetIndex + 1 : targetIndex;
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, {
              parentId: targetParentId,
              index: destIndex
            });
        }
      }
      return;
    }

    const subTitle = el.closest(".sub-folder-title[data-folder-id]");
    if (subTitle) {
      const targetFolderId = subTitle.dataset.folderId;
      const targetParentId = subTitle.dataset.parentId;
      const targetIndex = Number(subTitle.dataset.folderIndex);
      if (dragKind === "item") {
        subTitle.classList.add("drag-over");
        if (dragData.parentId !== targetFolderId) {
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, { parentId: targetFolderId });
        }
        return;
      }
      if (dragKind === "folder" && !isFolderDescendant(dragData.id, targetFolderId)) {
        if (dragData.parentId === targetParentId) {
          const rect = subTitle.getBoundingClientRect();
          const isAfter = clientX > rect.left + rect.width / 2;
          subTitle.classList.add(isAfter ? "drag-insert-after" : "drag-insert-before");
          const destIndex = isAfter ? targetIndex + 1 : targetIndex;
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, {
              parentId: targetParentId,
              index: destIndex
            });
        } else {
          subTitle.classList.add("drag-over");
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, { parentId: targetFolderId });
        }
        return;
      }
    }

    const otherBlock = el.closest(".other-folder-block[data-folder-id]");
    if (otherBlock) {
      const targetFolderId = otherBlock.dataset.folderId;
      const targetParentId = otherBlock.dataset.parentId;
      const targetIndex = Number(otherBlock.dataset.folderIndex);
      if (dragKind === "item") {
        otherBlock.classList.add("drag-over");
        if (dragData.parentId !== targetFolderId) {
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, { parentId: targetFolderId });
        }
        return;
      }
      if (dragKind === "folder" && !isFolderDescendant(dragData.id, targetFolderId)) {
        const rect = otherBlock.getBoundingClientRect();
        const relY = (clientY - rect.top) / Math.max(1, rect.height);
        const canPromote = targetParentId === "1" || targetParentId === "2";
        if (canPromote && relY < 0.28) {
          otherBlock.classList.add("drag-insert-top");
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, {
              parentId: targetParentId,
              index: targetIndex
            });
        } else if (canPromote && relY > 0.72) {
          otherBlock.classList.add("drag-insert-bottom");
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, {
              parentId: targetParentId,
              index: targetIndex + 1
            });
        } else {
          otherBlock.classList.add("drag-over");
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, { parentId: targetFolderId });
        }
        return;
      }
    }

    const otherSection = el.closest(".other-folders-section");
    if (otherSection && dragKind === "folder") {
      const blocks = Array.from(
        otherSection.querySelectorAll(".other-folder-block[data-folder-id]")
      ).filter((b) => b.dataset.parentId === "1" || b.dataset.parentId === "2");
      if (blocks.length > 0) {
        let targetBlock = blocks[blocks.length - 1];
        let insertAfter = true;
        for (const b of blocks) {
          const r = b.getBoundingClientRect();
          if (clientY < r.top + r.height / 2) {
            targetBlock = b;
            insertAfter = false;
            break;
          }
        }
        if (!isFolderDescendant(dragData.id, targetBlock.dataset.folderId)) {
          targetBlock.classList.add(insertAfter ? "drag-insert-bottom" : "drag-insert-top");
          const targetParentId = targetBlock.dataset.parentId;
          const targetIndex = Number(targetBlock.dataset.folderIndex);
          pointerDrag.dropAction = () =>
            chrome.bookmarks.move(dragData.id, {
              parentId: targetParentId,
              index: insertAfter ? targetIndex + 1 : targetIndex
            });
        }
      }
    }
  }

  document.addEventListener(
    "click",
    (e) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener("dragstart", (e) => {
    if (pointerDrag) {
      e.preventDefault();
    }
  });

  function extractExternalDropLink(dt) {
    if (!dt) return null;
    const uriList = (dt.getData("text/uri-list") || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
    const plain = (dt.getData("text/plain") || "").trim();
    let url = uriList[0] || "";
    if (!url && /^(https?:\/\/|ftp:\/\/|file:\/\/)/i.test(plain)) {
      url = plain;
    }
    if (!url || !/^(https?:\/\/|ftp:\/\/|file:\/\/)/i.test(url)) return null;

    let title = "";
    const html = dt.getData("text/html") || "";
    if (html) {
      const m = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
      if (m && m[1]) {
        const tmp = document.createElement("div");
        tmp.innerHTML = m[1];
        title = (tmp.textContent || "").trim();
      }
    }
    let hasRealTitle = Boolean(title);
    if (!title && plain && plain !== url && !/^(https?:\/\/|ftp:\/\/|file:\/\/)/i.test(plain)) {
      title = plain;
      hasRealTitle = true;
    }
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    return { url, title, hasRealTitle };
  }

  document.addEventListener("dragover", (e) => {
    if (pointerDrag) return;
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("text/uri-list") && !types.includes("text/plain")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    notifyActivity();
    clearDragVisuals();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const catBtn = el.closest(".cat-btn[data-folder-id]");
    if (catBtn) {
      catBtn.style.outline = "2px solid #fff";
      return;
    }
    const subTitle = el.closest(".sub-folder-title[data-folder-id]");
    if (subTitle) {
      subTitle.classList.add("drag-over");
      return;
    }
    const otherBlock = el.closest(".other-folder-block[data-folder-id]");
    if (otherBlock) {
      otherBlock.classList.add("drag-over");
      return;
    }
    const linkLi = el.closest("li.link-item[data-bm-id]");
    if (linkLi) {
      const rect = linkLi.getBoundingClientRect();
      const isAfter = e.clientX > rect.left + rect.width / 2;
      linkLi.classList.add(isAfter ? "drag-insert-after" : "drag-insert-before");
    }
  });

  document.addEventListener("dragleave", (e) => {
    if (pointerDrag) return;
    if (!e.relatedTarget) clearDragVisuals();
  });

  document.addEventListener("drop", async (e) => {
    if (pointerDrag) return;
    clearDragVisuals();
    const linkData = extractExternalDropLink(e.dataTransfer);
    if (!linkData) return;
    e.preventDefault();
    notifyActivity();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    async function createAndResolve(createOpts) {
      const created = await chrome.bookmarks.create(createOpts);
      if (created?.id && !linkData.hasRealTitle) {
        safeSendMessage({
          type: "RESOLVE_PAGE_TITLE",
          url: linkData.url,
          bookmarkId: created.id
        });
      }
    }

    const catBtn = el.closest(".cat-btn[data-folder-id]");
    if (catBtn) {
      const targetParentId = resolveWritableFolderId(catBtn.dataset.folderId);
      if (targetParentId) {
        await createAndResolve({
          parentId: targetParentId,
          title: linkData.title,
          url: linkData.url,
          index: 0
        });
      }
      return;
    }
    const subTitle = el.closest(".sub-folder-title[data-folder-id]");
    if (subTitle) {
      const targetParentId = resolveWritableFolderId(subTitle.dataset.folderId);
      if (targetParentId) {
        await createAndResolve({
          parentId: targetParentId,
          title: linkData.title,
          url: linkData.url
        });
      }
      return;
    }
    const otherBlock = el.closest(".other-folder-block[data-folder-id]");
    if (otherBlock) {
      const targetParentId = resolveWritableFolderId(otherBlock.dataset.folderId);
      if (targetParentId) {
        await createAndResolve({
          parentId: targetParentId,
          title: linkData.title,
          url: linkData.url
        });
      }
      return;
    }
    const linkLi = el.closest("li.link-item[data-bm-id]");
    if (linkLi) {
      const rect = linkLi.getBoundingClientRect();
      const isAfter = e.clientX > rect.left + rect.width / 2;
      const idx = Number(linkLi.dataset.bmIndex) + (isAfter ? 1 : 0);
      await createAndResolve({
        parentId: linkLi.dataset.parentId,
        index: idx,
        title: linkData.title,
        url: linkData.url
      });
      return;
    }

    const { topFolders, bottomFolders } = resolveSlotFolders();
    const fallbackFolder = topPane.contains(el)
      ? topFolders[activeTopSlot]
      : bottomFolders[activeBottomSlot];
    const fallbackParentId = resolveWritableFolderId(fallbackFolder);
    if (fallbackParentId) {
      await createAndResolve({
        parentId: fallbackParentId,
        title: linkData.title,
        url: linkData.url
      });
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!pointerDrag) return;
    if (!pointerDrag.active) {
      const dx = e.clientX - pointerDrag.startX;
      const dy = e.clientY - pointerDrag.startY;
      if (dx * dx + dy * dy < 16) return;
      pointerDrag.active = true;
      document.body.classList.add("is-dragging");
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = pointerDrag.label;
      document.body.appendChild(ghost);
      pointerDrag.ghost = ghost;
    }
    notifyActivity();
    if (pointerDrag.ghost) {
      pointerDrag.ghost.style.left = `${e.clientX + 12}px`;
      pointerDrag.ghost.style.top = `${e.clientY + 12}px`;
    }
    evaluateDropTarget(e.clientX, e.clientY);
  });

  window.addEventListener(
    "wheel",
    (e) => {
      if (!pointerDrag || !pointerDrag.active) return;
      notifyActivity();
      if (scrollPaneAtPoint(e.clientY, e.deltaY)) {
        e.preventDefault();
        evaluateDropTarget(e.clientX, e.clientY);
      }
    },
    { passive: false }
  );

  window.addEventListener("mouseup", async () => {
    if (!pointerDrag) return;
    const drag = pointerDrag;
    pointerDrag = null;
    if (!drag.active) return;
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
    if (drag.ghost) drag.ghost.remove();
    document.body.classList.remove("is-dragging");
    clearDragVisuals();
    if (drag.dropAction) {
      try {
        await drag.dropAction();
      } catch {
        // Ignore invalid bookmark move
      }
    }
  });

  window.addEventListener("blur", () => {
    if (!pointerDrag) return;
    if (pointerDrag.ghost) pointerDrag.ghost.remove();
    pointerDrag = null;
    document.body.classList.remove("is-dragging");
    clearDragVisuals();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!modalOverlay.classList.contains("hidden")) {
        closeModal();
        return;
      }
      if (!ctxMenu.classList.contains("hidden")) {
        hideCtxMenu();
        return;
      }
      if (multiSelectMode) {
        setMultiSelectMode(false);
        return;
      }
      window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (
      !ctxMenu.classList.contains("hidden") &&
      !ctxMenu.contains(e.target) &&
      !ctxSubmenu.contains(e.target)
    ) {
      hideCtxMenu();
    }
  });

  window.addEventListener("mouseup", () => {
    isPaintingSelect = false;
  });

  // Auto-hide context menu when mouse moves away (>40px outside menu & submenu bounds)
  document.addEventListener(
    "mousemove",
    (e) => {
      if (ctxMenu.classList.contains("hidden")) return;
      const pad = 40;
      const inRect = (r) =>
        e.clientX >= r.left - pad &&
        e.clientX <= r.right + pad &&
        e.clientY >= r.top - pad &&
        e.clientY <= r.bottom + pad;
      const inMain = inRect(ctxMenu.getBoundingClientRect());
      const inSub = !ctxSubmenu.classList.contains("hidden") && inRect(ctxSubmenu.getBoundingClientRect());
      if (!inMain && !inSub) {
        hideCtxMenu();
      }
    },
    { passive: true }
  );

  // Catch right-click on any non-bookmark blank area so browser menu doesn't pop up & close sidebar
  // Hold Shift + Right-Click if you intentionally want the browser's native "Inspect" menu
  document.addEventListener("contextmenu", (e) => {
    if (e.shiftKey) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    if (multiSelectMode && selectedIds.size > 0) {
      openCtxMenu(e.clientX, e.clientY, buildBatchCtxItems());
      return;
    }

    const { topFolders, bottomFolders } = resolveSlotFolders();
    let newFolderParentId = "1";
    let newFolderLabel = "新建文件夹";
    if (e.target.closest(".top-pane") && topFolders[activeTopSlot]) {
      const writable = resolveWritableFolderId(topFolders[activeTopSlot]);
      if (writable) {
        newFolderParentId = writable;
        newFolderLabel = `在「${topFolders[activeTopSlot].mappedFolderTitle || topFolders[activeTopSlot].title}」中新建文件夹`;
      }
    } else if (
      e.target.closest(".bottom-pane") &&
      !e.target.closest(".other-folders-section") &&
      bottomFolders[activeBottomSlot]
    ) {
      const writable = resolveWritableFolderId(bottomFolders[activeBottomSlot]);
      if (writable) {
        newFolderParentId = writable;
        newFolderLabel = `在「${bottomFolders[activeBottomSlot].mappedFolderTitle || bottomFolders[activeBottomSlot].title}」中新建文件夹`;
      }
    }

    openCtxMenu(e.clientX, e.clientY, [
      {
        label: multiSelectMode ? "退出多选模式" : "开启多选模式",
        action: async () => {
          setMultiSelectMode(!multiSelectMode);
        }
      },
      {
        label: newFolderLabel,
        action: async () => {
          const name = await showPromptModal("新建文件夹", "新建文件夹");
          if (name !== null && name.trim()) {
            await chrome.bookmarks.create({ parentId: newFolderParentId, title: name.trim() });
          }
        }
      },
      { sep: true },
      {
        label: "打开扩展设置",
        action: async () => {
          safeSendMessage({ type: "OPEN_OPTIONS" });
        }
      },
      {
        label: "独立标签页打开",
        action: async () => {
          safeSendMessage({
            type: "OPEN_URL",
            url: chrome.runtime.getURL("sidebar.html"),
            newTab: true,
            background: false
          });
        }
      },
      { sep: true },
      {
        label: "收起侧边栏",
        action: async () => {
          window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
        }
      }
    ]);
  });

  let modalResolve = null;

  function closeModal() {
    modalOverlay.classList.add("hidden");
    if (modalResolve) {
      const r = modalResolve;
      modalResolve = null;
      r(null);
    }
  }

  function showPromptModal(title, defaultVal) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      modalInput.classList.remove("hidden");
      modalConfirmText.classList.add("hidden");
      modalOkBtn.classList.remove("danger");
      modalOkBtn.textContent = "确定";
      modalInput.value = defaultVal || "";
      modalOverlay.classList.remove("hidden");
      modalInput.focus();
      modalInput.select();
    });
  }

  function showConfirmModal(title, text) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      modalInput.classList.add("hidden");
      modalConfirmText.classList.remove("hidden");
      modalConfirmText.textContent = text;
      modalOkBtn.classList.add("danger");
      modalOkBtn.textContent = "删除";
      modalOverlay.classList.remove("hidden");
    });
  }

  modalCancelBtn.addEventListener("click", () => closeModal());
  modalOverlay.addEventListener("mousedown", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  modalOkBtn.addEventListener("click", () => {
    if (!modalResolve) return;
    const r = modalResolve;
    modalResolve = null;
    const val = modalInput.classList.contains("hidden") ? true : modalInput.value;
    modalOverlay.classList.add("hidden");
    r(val);
  });
  modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      modalOkBtn.click();
    }
  });

  function hideCtxMenu() {
    ctxMenu.classList.add("hidden");
    ctxMenu.innerHTML = "";
    ctxSubmenu.classList.add("hidden");
    ctxSubmenu.innerHTML = "";
  }

  function openSubmenu(anchorRect, subItems) {
    ctxSubmenu.innerHTML = "";
    for (const sub of subItems) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ctx-item";
      btn.textContent = sub.label;
      btn.addEventListener("click", async () => {
        hideCtxMenu();
        notifyActivity();
        await sub.action();
      });
      ctxSubmenu.appendChild(btn);
    }
    ctxSubmenu.classList.remove("hidden");
    const subRect = ctxSubmenu.getBoundingClientRect();
    let left = anchorRect.right + 4;
    if (left + subRect.width > window.innerWidth - 6) {
      left = Math.max(4, anchorRect.left - subRect.width - 4);
    }
    const top = Math.min(anchorRect.top, Math.max(4, window.innerHeight - subRect.height - 6));
    ctxSubmenu.style.left = `${left}px`;
    ctxSubmenu.style.top = `${top}px`;
  }

  function buildFolderSubItems(excludeFolderId, onPickFolder) {
    return allFolders
      .filter((f) => f.id !== excludeFolderId)
      .map((f) => ({
        label: f.title,
        action: () => onPickFolder(f)
      }));
  }

  function buildBatchCtxItems() {
    const ids = Array.from(selectedIds);
    const trashName = (settings.trashFolderName || "回收站").trim() || "回收站";
    const items = [
      {
        label: `移动到其他分类 (${ids.length} 项)`,
        submenu: buildFolderSubItems(null, async (folder) => {
          for (const id of ids) {
            await chrome.bookmarks.move(id, { parentId: folder.id });
          }
          selectedIds.clear();
          updateMultiBar();
        })
      }
    ];

    if (settings.showPermanentDelete) {
      items.push(
        {
          label: `移动到「${trashName}」(${ids.length} 项)`,
          action: async () => {
            const trash = await findOrCreateTrashFolder();
            for (const id of ids) {
              await chrome.bookmarks.move(id, { parentId: trash.id });
            }
            selectedIds.clear();
            updateMultiBar();
          }
        },
        { sep: true },
        {
          label: `批量永久删除 (${ids.length} 项)`,
          danger: true,
          action: async () => {
            const ok = await showConfirmModal(
              "确认批量删除",
              `确定要永久删除选中的 ${ids.length} 个书签吗？`
            );
            if (ok) {
              for (const id of ids) {
                await chrome.bookmarks.remove(id);
              }
              selectedIds.clear();
              updateMultiBar();
            }
          }
        }
      );
    } else {
      items.push(
        { sep: true },
        {
          label: `删除 (${ids.length} 项)`,
          danger: true,
          action: async () => {
            const trash = await findOrCreateTrashFolder();
            for (const id of ids) {
              await chrome.bookmarks.move(id, { parentId: trash.id });
            }
            selectedIds.clear();
            updateMultiBar();
          }
        }
      );
    }

    items.push(
      { sep: true },
      {
        label: "清空已选",
        action: async () => {
          selectedIds.clear();
          updateMultiBar();
          refreshData();
        }
      },
      {
        label: "退出多选模式",
        action: async () => {
          setMultiSelectMode(false);
        }
      }
    );
    return items;
  }

  async function findOrCreateTrashFolder() {
    const targetName = (settings.trashFolderName || "回收站").trim() || "回收站";
    const tree = await chrome.bookmarks.getTree();
    let found = null;
    function walk(nodes) {
      for (const n of nodes) {
        if (n.children) {
          if (n.title === targetName) {
            found = n;
            return;
          }
          walk(n.children);
          if (found) return;
        }
      }
    }
    walk(tree);
    if (found) return found;
    // Create target folder under Other Bookmarks ("2") or root first child
    const parentId = tree[0]?.children?.find((c) => c.id === "2")?.id || tree[0]?.children?.[0]?.id || "1";
    return await chrome.bookmarks.create({ parentId, title: targetName });
  }

  function openCtxMenu(x, y, items) {
    notifyActivity();
    ctxMenu.innerHTML = "";
    ctxSubmenu.classList.add("hidden");
    ctxSubmenu.innerHTML = "";
    for (const item of items) {
      if (item.sep) {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        ctxMenu.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "ctx-item" + (item.danger ? " danger" : "") + (item.submenu ? " has-sub" : "");
      if (item.submenu) {
        const txt = document.createElement("span");
        txt.textContent = item.label;
        const arrow = document.createElement("span");
        arrow.textContent = "▶";
        arrow.style.fontSize = "10px";
        arrow.style.opacity = "0.75";
        btn.appendChild(txt);
        btn.appendChild(arrow);
        btn.addEventListener("mouseenter", () => {
          openSubmenu(btn.getBoundingClientRect(), item.submenu);
        });
      } else {
        btn.textContent = item.label;
        btn.addEventListener("mouseenter", () => {
          ctxSubmenu.classList.add("hidden");
        });
        btn.addEventListener("click", async () => {
          hideCtxMenu();
          notifyActivity();
          await item.action();
        });
      }
      ctxMenu.appendChild(btn);
    }
    ctxMenu.classList.remove("hidden");
    const rect = ctxMenu.getBoundingClientRect();
    const maxX = Math.max(4, window.innerWidth - rect.width - 6);
    const maxY = Math.max(4, window.innerHeight - rect.height - 6);
    ctxMenu.style.left = `${Math.min(x, maxX)}px`;
    ctxMenu.style.top = `${Math.min(y, maxY)}px`;
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "SIDEBAR_OPENED") {
      hideCtxMenu();
      notifyActivity();
      const incomingHost = (e.data.host || "").trim().toLowerCase();
      let needRender = false;
      if (incomingHost && incomingHost !== currentHost) {
        currentHost = incomingHost;
        needRender = true;
      }
      if (applyAutoSwitchToSiteSlot()) {
        needRender = true;
      }
      if (needRender) {
        renderCategoriesAndPanes();
      }
      topPane.scrollTop = topPane.scrollHeight;
    } else if (e.data?.type === "PREVIEW_SETTINGS" && e.data.settings) {
      settings = { ...settings, ...e.data.settings };
      applyVisualSettings();
      scheduleRefresh(40);
    }
  });

  function applySplitRatio(ratio) {
    const r = Math.min(0.85, Math.max(0.15, Number(ratio) || 0.5));
    document.documentElement.style.setProperty("--top-flex", String(r));
    document.documentElement.style.setProperty("--bottom-flex", String(1 - r));
  }

  function applyVisualSettings() {
    const root = document.documentElement.style;
    const cols = Math.min(4, Math.max(1, Number(settings.columns) || 2));
    root.setProperty("--cols", String(cols));

    const topN = Math.min(6, Math.max(1, Number(settings.topSlotCount) || 3));
    const bottomN = Math.min(6, Math.max(1, Number(settings.bottomSlotCount) || 3));
    root.setProperty("--top-cat-cols", String(topN));
    root.setProperty("--bottom-cat-cols", String(bottomN));

    root.setProperty("--normal-font", `${Number(settings.normalFontSize) || 14.5}px`);
    root.setProperty("--normal-height", `${Number(settings.normalRowHeight) || 36}px`);
    root.setProperty("--icon-size", `${Math.max(12, Number(settings.iconSize) || 18)}px`);
    root.setProperty("--item-px", `${Math.max(2, Number(settings.itemPaddingX) || 8)}px`);
    root.setProperty("--item-gap", `${Math.max(0, Number(settings.itemGap ?? 4))}px`);
    root.setProperty("--scrollbar-w", `${Math.max(0, Number(settings.scrollbarWidth) || 0)}px`);

    const scale = Math.min(2.5, Math.max(1.0, Number(settings.bigScale) || 1.6));
    root.setProperty("--big-scale", String(scale));

    root.setProperty("--tile-height", `${Math.max(28, Number(settings.tileHeight) || 64)}px`);
    root.setProperty("--tile-font", `${Math.max(10, Number(settings.tileFontSize) || 15)}px`);
    root.setProperty("--tile-radius", `${Math.max(0, Number(settings.tileRadius) || 0)}px`);
    let localFontCss = "";
    function resolveFontSetting(val, aliasName, fallback) {
      const raw = (val || "").trim();
      if (!raw) return fallback;
      if (raw.startsWith("local:")) {
        const parts = raw
          .slice(6)
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          const srcList = parts.map((p) => `local("${p.replace(/"/g, '\\"')}")`).join(", ");
          localFontCss += `@font-face { font-family: "${aliasName}"; src: ${srcList}; }\n`;
          return `"${aliasName}", sans-serif`;
        }
      }
      return raw;
    }

    const resolvedGlobalFont = resolveFontSetting(
      settings.fontFamily,
      "__bs_global_face__",
      '"DreamW10", "梦源黑体 SC", "Microsoft YaHei", sans-serif'
    );
    const resolvedTitleFont = resolveFontSetting(
      settings.folderTitleFont,
      "__bs_title_face__",
      "inherit"
    );

    let localFontStyleEl = document.getElementById("localFontFaceStyle");
    if (!localFontStyleEl) {
      localFontStyleEl = document.createElement("style");
      localFontStyleEl.id = "localFontFaceStyle";
      document.head.appendChild(localFontStyleEl);
    }
    localFontStyleEl.textContent = localFontCss;

    root.setProperty("--font-family", resolvedGlobalFont);
    root.setProperty("--font-weight", String(Number(settings.fontWeight) || 600));
    const oAlign = settings.otherFolderAlign || "left";
    root.setProperty("--other-folder-align", oAlign);
    root.setProperty(
      "--other-folder-justify",
      oAlign === "center" ? "center" : oAlign === "right" ? "flex-end" : "flex-start"
    );
    root.setProperty("--folder-mask-color", settings.folderBgMaskColor || "#000000");
    root.setProperty(
      "--folder-mask-opacity",
      String(Math.min(0.9, Math.max(0, Number(settings.folderBgMaskOpacity ?? 0.35))))
    );
    const blurPx = Math.max(0, Number(settings.folderBgBlur) || 0);
    root.setProperty("--folder-bg-blur", `${blurPx}px`);
    root.setProperty("--folder-bg-filter", blurPx > 0 ? `blur(${blurPx}px)` : "none");
    const titleSz = Number(settings.folderTitleSize) || 0;
    root.setProperty("--folder-title-size", titleSz > 0 ? `${titleSz}px` : "inherit");
    root.setProperty("--folder-title-font", resolvedTitleFont);
    const titleWt = Number(settings.folderTitleWeight) || 0;
    root.setProperty("--folder-title-weight", titleWt > 0 ? String(titleWt) : "inherit");

    root.setProperty("--bg-color", settings.bgColor || "#18191c");
    root.setProperty("--bar-color", settings.barColor || "#121316");
    root.setProperty("--accent", settings.accentColor || "#0078d4");
    root.setProperty("--tile-color", settings.tileColor || "#22242a");
    root.setProperty("--big-card-color", settings.bigCardColor || "#212329");
    root.setProperty("--hover-color", settings.hoverColor || "#2a2d35");
    root.setProperty("--text-color", settings.textColor || "#d4d7dd");

    renderSidebarSearchBoxes();
    document.body.classList.toggle("big-two-lines", Boolean(settings.bigCardTwoLines));
    document.body.classList.toggle("fade-overflow", Boolean(settings.fadeOverflowText));
    customCssTag.textContent = settings.customCss || "";

    applySplitRatio(settings.splitRatio);
    requestAnimationFrame(updateOverflowFadeFlags);
  }

  function updateOverflowFadeFlags() {
    const enabled = Boolean(settings.fadeOverflowText);
    document
      .querySelectorAll(".bookmark-pane a.link > span.label, .cat-btn .cat-title")
      .forEach((el) => {
        el.classList.toggle("is-overflowing", enabled && el.scrollWidth > el.clientWidth + 1);
      });
  }

  window.addEventListener("resize", () => requestAnimationFrame(updateOverflowFadeFlags));

  // Dragging divider between the two category rows resizes topPane / bottomPane
  let isDraggingDivider = false;
  catDivider.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDraggingDivider = true;
    catDivider.classList.add("dragging");
    notifyActivity();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingDivider) return;
    notifyActivity();
    const containerRect = splitContainer.getBoundingClientRect();
    const barHeight = categoryBar.getBoundingClientRect().height;
    const availableHeight = containerRect.height - barHeight;
    if (availableHeight <= 40) return;

    const topHeight = e.clientY - containerRect.top - barHeight / 2;
    const ratio = Math.min(0.85, Math.max(0.15, topHeight / availableHeight));
    settings.splitRatio = ratio;
    applySplitRatio(ratio);
  });

  window.addEventListener("mouseup", async () => {
    if (!isDraggingDivider) return;
    isDraggingDivider = false;
    catDivider.classList.remove("dragging");
    if (!chrome?.runtime?.id) return;
    try {
      await chrome.storage.sync.set({ splitRatio: settings.splitRatio });
    } catch {
      // Ignore if extension was reloaded in an existing tab
    }
  });

  function safeSendMessage(payload) {
    if (!chrome?.runtime?.id) return;
    try {
      chrome.runtime.sendMessage(payload);
    } catch {
      // Ignore invalidated context
    }
  }

  function safeStorageSet(area, obj) {
    if (!chrome?.runtime?.id) return;
    try {
      chrome.storage[area].set(obj);
    } catch {
      // Ignore invalidated context
    }
  }

  function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "32");
    return url.toString();
  }

  function stripFromSymbolAfterStart(str, regex) {
    if (!str || str.length <= 1) return str;
    let searchFrom = 1;
    // If string starts with a bracketed prefix like 【xxx】 or [xxx], skip past the closing bracket
    const openMap = { "(": ")", "（": "）", "[": "]", "【": "】" };
    const closeCh = openMap[str[0]];
    if (closeCh) {
      const closeIdx = str.indexOf(closeCh, 1);
      if (closeIdx > 0 && closeIdx + 1 < str.length) {
        searchFrom = closeIdx + 1;
      }
    }
    const tail = str.slice(searchFrom);
    const m = tail.match(regex);
    if (!m || m.index === undefined) return str;
    const cutIdx = searchFrom + m.index;
    return cutIdx > 0 ? str.slice(0, cutIdx).trimEnd() : str;
  }

  function formatBookmarkDisplayTitle(rawTitle, url) {
    const base = (rawTitle || url || "").trim();
    if (!base) return "";
    let out = base;
    if (settings.titleStripParens) {
      out = stripFromSymbolAfterStart(out, /\s*[\(（\[【]/);
    }
    if (settings.titleStripDash) {
      out = stripFromSymbolAfterStart(out, /\s*[-—–－]/);
    }
    if (settings.titleStripPipe) {
      out = stripFromSymbolAfterStart(out, /\s*[|｜]/);
    }
    if (settings.titleStripColon) {
      out = stripFromSymbolAfterStart(out, /\s*[:：]/);
    }
    const customLines = (settings.titleCustomRegex || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of customLines) {
      const sepIdx = line.indexOf("=>");
      const pattern = sepIdx >= 0 ? line.slice(0, sepIdx).trim() : line;
      const replacement = sepIdx >= 0 ? line.slice(sepIdx + 2).trim() : "";
      if (!pattern) continue;
      try {
        out = out.replace(new RegExp(pattern, "g"), replacement);
      } catch {
        // Ignore invalid user regex
      }
    }
    out = out.trim();
    return out || base;
  }

  function createLinkItem(node, isBig = false, paneName = "") {
    const li = document.createElement("li");
    li.className =
      "link-item" + (isBig ? " big" : "") + (selectedIds.has(node.id) ? " selected" : "");
    li.draggable = false;
    if (paneName) {
      li.dataset.bmId = node.id;
      li.dataset.parentId = node.parentId;
      li.dataset.bmIndex = String(node.index);
    }

    const a = document.createElement("a");
    a.className = "link";
    a.href = node.url;
    a.draggable = false;
    if (settings.tooltipMode === "title") {
      a.title = node.title || node.url;
    } else if (settings.tooltipMode === "url") {
      a.title = node.url;
    } else if (settings.tooltipMode === "none") {
      a.title = "";
    } else {
      a.title = `${node.title || node.url}\n${node.url}`;
    }

    const img = document.createElement("img");
    img.className = "favicon";
    img.loading = "lazy";
    img.draggable = false;
    img.src = getFaviconUrl(node.url);

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = formatBookmarkDisplayTitle(node.title, node.url);

    a.appendChild(img);
    a.appendChild(label);

    if (paneName) {
      li.addEventListener("mousedown", (e) => {
        if (e.button === 0 && !multiSelectMode) {
          startPointerDragCandidate(
            e,
            "item",
            { id: node.id, parentId: node.parentId, index: node.index, pane: paneName },
            node.title || node.url,
            li
          );
        }
      });
    }

    a.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        return;
      }
      if (e.button === 0 && multiSelectMode) {
        e.preventDefault();
        notifyActivity();
        isPaintingSelect = true;
        if (selectedIds.has(node.id)) {
          paintSelectAction = "remove";
          selectedIds.delete(node.id);
          li.classList.remove("selected");
        } else {
          paintSelectAction = "add";
          selectedIds.add(node.id);
          li.classList.add("selected");
        }
        updateMultiBar();
      }
    });

    li.addEventListener("mouseenter", () => {
      if (!multiSelectMode || !isPaintingSelect) return;
      notifyActivity();
      if (paintSelectAction === "add") {
        selectedIds.add(node.id);
        li.classList.add("selected");
      } else {
        selectedIds.delete(node.id);
        li.classList.remove("selected");
      }
      updateMultiBar();
    });

    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (multiSelectMode) return;
      const newTab = e.ctrlKey || e.metaKey || Boolean(settings.openInNewTab);
      chrome.runtime.sendMessage({
        type: "OPEN_URL",
        url: node.url,
        bookmarkId: node.id,
        newTab,
        active: settings.openTabActive !== false,
        position: settings.openTabPosition || "after",
        background: e.ctrlKey || e.metaKey
      });
      if (settings.closeOnClickBookmark !== false) {
        window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
      }
    });

    a.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        notifyActivity();
        chrome.runtime.sendMessage({
          type: "OPEN_URL",
          url: node.url,
          bookmarkId: node.id,
          newTab: true,
          position: settings.openTabPosition || "after",
          background: true
        });
      }
    });

    a.addEventListener("contextmenu", (e) => {
      if (e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (multiSelectMode) {
        if (!selectedIds.has(node.id)) {
          selectedIds.add(node.id);
          li.classList.add("selected");
          updateMultiBar();
        }
        openCtxMenu(e.clientX, e.clientY, buildBatchCtxItems());
        return;
      }
      const singleItems = [
        {
          label: "后台新标签页打开",
          action: async () => {
            safeSendMessage({
              type: "OPEN_URL",
              url: node.url,
              bookmarkId: node.id,
              newTab: true,
              position: settings.openTabPosition || "after",
              background: true
            });
          }
        },
        {
          label: "开启多选模式（选中此项）",
          action: async () => {
            setMultiSelectMode(true, node.id);
          }
        },
        { sep: true },
        {
          label: "重命名",
          action: async () => {
            const newTitle = await showPromptModal("重命名书签", node.title || "");
            if (newTitle !== null && newTitle.trim()) {
              await chrome.bookmarks.update(node.id, { title: newTitle.trim() });
            }
          }
        },
        {
          label: "移动到其他分类",
          submenu: buildFolderSubItems(node.parentId, async (folder) => {
            await chrome.bookmarks.move(node.id, { parentId: folder.id });
          })
        }
      ];

      if (settings.showPermanentDelete) {
        const trashName = (settings.trashFolderName || "回收站").trim() || "回收站";
        singleItems.push(
          {
            label: `移动到「${trashName}」`,
            action: async () => {
              const trash = await findOrCreateTrashFolder();
              if (trash && trash.id !== node.parentId) {
                await chrome.bookmarks.move(node.id, { parentId: trash.id });
              }
            }
          },
          { sep: true },
          {
            label: "永久删除",
            danger: true,
            action: async () => {
              const ok = await showConfirmModal(
                "确认永久删除",
                `确定要永久删除书签「${node.title || node.url}」吗？`
              );
              if (ok) {
                await chrome.bookmarks.remove(node.id);
              }
            }
          }
        );
      } else {
        singleItems.push(
          { sep: true },
          {
            label: "删除",
            danger: true,
            action: async () => {
              const trash = await findOrCreateTrashFolder();
              if (trash && trash.id !== node.parentId) {
                await chrome.bookmarks.move(node.id, { parentId: trash.id });
              }
            }
          }
        );
      }
      openCtxMenu(e.clientX, e.clientY, singleItems);
    });

    li.appendChild(a);
    return li;
  }

  function flattenLinksWithOrder(nodes, out = []) {
    for (const n of nodes) {
      if (n.url) out.push(n);
      else if (n.children) flattenLinksWithOrder(n.children, out);
    }
    return out;
  }

  function orderRowsBottomUp(items, cols) {
    if (items.length === 0) return [];
    const rows = [];
    for (let i = 0; i < items.length; i += cols) {
      rows.push(items.slice(i, i + cols));
    }
    rows.reverse();
    return rows.flat();
  }

  function isFolderDescendant(ancestorId, targetId) {
    if (ancestorId === targetId) return true;
    let cur = folderMap.get(targetId);
    while (cur && cur.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = folderMap.get(cur.parentId);
    }
    return false;
  }

  function attachFolderDragAndDrop(dropTarget, titleEl, folderNode) {
    titleEl.draggable = false;
    dropTarget.dataset.folderId = folderNode.id;
    dropTarget.dataset.parentId = folderNode.parentId;
    dropTarget.dataset.folderIndex = String(folderNode.index);

    titleEl.addEventListener("mousedown", (e) => {
      if (e.button === 0 && !multiSelectMode) {
        e.stopPropagation();
        startPointerDragCandidate(
          e,
          "folder",
          {
            id: folderNode.id,
            parentId: folderNode.parentId,
            index: folderNode.index
          },
          folderNode.title || "文件夹",
          dropTarget
        );
      }
    });
  }

  function renderSubFolders(parentEl, nodes, paneName, depth = 1) {
    const subFolders = nodes.filter((n) => Boolean(n.children));
    if (subFolders.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = "sub-folders-wrap";

    for (const sf of subFolders) {
      const block = document.createElement("div");
      block.className = "sub-folder-block" + (collapsedSet.has(sf.id) ? " collapsed" : "");

      const title = document.createElement("div");
      title.className = "sub-folder-title" + (depth >= 2 ? " depth-2" : "");
      title.textContent = sf.title || "子文件夹";
      const directLinks = (sf.children || []).filter((n) => n.url);
      const childSubFolders = (sf.children || []).filter((n) => Boolean(n.children));
      if (directLinks.length === 0 && childSubFolders.length === 0) {
        const emptyHint = document.createElement("span");
        emptyHint.className = "empty-folder-hint";
        emptyHint.textContent = "(空)";
        title.appendChild(emptyHint);
      }
      attachFolderDragAndDrop(title, title, sf);
      title.addEventListener("click", () => {
        notifyActivity();
        if (collapsedSet.has(sf.id)) {
          collapsedSet.delete(sf.id);
          block.classList.remove("collapsed");
        } else {
          collapsedSet.add(sf.id);
          block.classList.add("collapsed");
        }
        safeStorageSet("local", { collapsedIds: Array.from(collapsedSet) });
      });
      title.addEventListener("contextmenu", (e) => {
        if (e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        openCtxMenu(e.clientX, e.clientY, [
          {
            label: "新建子文件夹",
            action: async () => {
              const name = await showPromptModal("新建子文件夹", "新建文件夹");
              if (name !== null && name.trim()) {
                await chrome.bookmarks.create({ parentId: sf.id, title: name.trim() });
              }
            }
          },
          {
            label: "重命名文件夹",
            action: async () => {
              const newTitle = await showPromptModal("重命名文件夹", sf.title || "");
              if (newTitle !== null && newTitle.trim()) {
                await chrome.bookmarks.update(sf.id, { title: newTitle.trim() });
              }
            }
          },
          {
            label: settings.showPermanentDelete
              ? `移动到「${(settings.trashFolderName || "回收站").trim() || "回收站"}」`
              : "删除",
            danger: !settings.showPermanentDelete,
            action: async () => {
              const trash = await findOrCreateTrashFolder();
              if (trash && trash.id !== sf.id && trash.id !== sf.parentId) {
                await chrome.bookmarks.move(sf.id, { parentId: trash.id });
              }
            }
          }
        ]);
      });
      block.appendChild(title);

      if (directLinks.length > 0) {
        const ul = document.createElement("ul");
        for (const link of directLinks) {
          ul.appendChild(createLinkItem(link, false, paneName));
        }
        block.appendChild(ul);
      }

      renderSubFolders(block, sf.children || [], paneName, depth + 1);
      wrap.appendChild(block);
    }

    parentEl.appendChild(wrap);
  }

  function renderFolderContents(container, folderNode, position, bigCountRaw) {
    container.innerHTML = "";
    const stack = document.createElement("div");
    stack.className = "pane-stack";

    const siteSearchStack = folderNode?.virtualType === "site" ? buildSiteSearchStack() : null;

    if (!folderNode || !folderNode.children || folderNode.children.length === 0) {
      if (siteSearchStack && position !== "top") stack.appendChild(siteSearchStack);
      const ul = document.createElement("ul");
      const empty = document.createElement("div");
      empty.className = "empty-tip";
      if (folderNode?.virtualType === "site-empty") {
        empty.textContent = "当前网站未配置站内文件夹（可在 ⚙ 设置中添加域名映射）";
      } else if (
        folderNode?.virtualType === "frequent" ||
        folderNode?.virtualType === "site-fallback"
      ) {
        empty.textContent = "暂无常用书签记录，点击书签后会自动按频次与近期权重排序";
      } else {
        empty.textContent = "该分类暂无书签（可在 ⚙ 设置中指定文件夹）";
      }
      ul.appendChild(empty);
      stack.appendChild(ul);
      if (siteSearchStack && position === "top") stack.appendChild(siteSearchStack);
      container.appendChild(stack);
      return;
    }

    const links = (folderNode.children || []).filter((n) => n.url);
    const hasSubFolders = (folderNode.children || []).some((n) => Boolean(n.children));
    if (links.length === 0 && !hasSubFolders) {
      const ul = document.createElement("ul");
      const empty = document.createElement("div");
      empty.className = "empty-tip";
      empty.textContent = "该分类暂无书签（可在 ⚙ 设置中指定文件夹）";
      ul.appendChild(empty);
      stack.appendChild(ul);
      container.appendChild(stack);
      return;
    }

    const cols = Math.min(4, Math.max(1, Number(settings.columns) || 2));
    const bigCount = Math.min(links.length, Math.max(0, Number(bigCountRaw) || 0));

    const bigLinks = links.slice(0, bigCount);
    const smallLinks = links.slice(bigCount);

    if (position === "top") {
      renderSubFolders(stack, folderNode.children || [], "top", 1);

      if (smallLinks.length > 0) {
        const ulSmall = document.createElement("ul");
        const rem = smallLinks.length % cols;
        if (rem !== 0) {
          for (let s = 0; s < cols - rem; s++) {
            const spacer = document.createElement("li");
            spacer.className = "link-spacer";
            ulSmall.appendChild(spacer);
          }
        }
        for (const item of orderRowsBottomUp(smallLinks, cols)) {
          ulSmall.appendChild(createLinkItem(item, false, "top"));
        }
        stack.appendChild(ulSmall);
      }

      if (bigLinks.length > 0) {
        const ulBig = document.createElement("ul");
        const rem = bigLinks.length % cols;
        if (rem !== 0) {
          for (let s = 0; s < cols - rem; s++) {
            const spacer = document.createElement("li");
            spacer.className = "link-spacer";
            ulBig.appendChild(spacer);
          }
        }
        for (const item of orderRowsBottomUp(bigLinks, cols)) {
          ulBig.appendChild(createLinkItem(item, true, "top"));
        }
        stack.appendChild(ulBig);
      }

      if (siteSearchStack) {
        stack.appendChild(siteSearchStack);
      }

      container.appendChild(stack);
      container.scrollTop = container.scrollHeight;
    } else {
      if (siteSearchStack) {
        stack.appendChild(siteSearchStack);
      }

      if (bigLinks.length > 0) {
        const ulBig = document.createElement("ul");
        for (const item of bigLinks) {
          ulBig.appendChild(createLinkItem(item, true, "bottom"));
        }
        stack.appendChild(ulBig);
      }

      if (smallLinks.length > 0) {
        const ulSmall = document.createElement("ul");
        for (const item of smallLinks) {
          ulSmall.appendChild(createLinkItem(item, false, "bottom"));
        }
        stack.appendChild(ulSmall);
      }

      renderSubFolders(stack, folderNode.children || [], "bottom", 1);

      container.appendChild(stack);
      container.scrollTop = 0;
    }
    requestAnimationFrame(updateOverflowFadeFlags);
  }

  function isTrashFolderNode(f, trashName) {
    if (!f || !f.children) return false;
    if (f.title === trashName) return true;
    return (
      f.parentId === "0" &&
      (f.folderType === "trash" ||
        f.title === "Trash" ||
        f.title === "回收站" ||
        f.title === "已删除")
    );
  }

  function isCssColorOrGradient(val) {
    if (!val) return false;
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|linear-gradient\(|radial-gradient\(|conic-gradient\()/i.test(
      val.trim()
    );
  }

  function applyBgStyleToLayer(el, val) {
    if (!val) return;
    if (isCssColorOrGradient(val)) {
      el.style.background = val;
    } else {
      el.style.background = "";
      el.style.backgroundImage = `url("${val.replace(/"/g, '\\"')}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundRepeat = "no-repeat";
    }
  }

  function applyFolderCardVisual(el, folder, opts = {}) {
    const { fallbackTitle = "", isEmpty = false, isCatTile = false } = opts;
    const useSplitBarBg = isCatTile && Boolean(categoryBarBg);
    const bgUrl = !useSplitBarBg && folder ? folderBgMap[folder.id] : "";
    if (bgUrl) {
      el.classList.add("has-folder-bg");
      el.dataset.bgEffect = settings.folderBgEffect || "zoom";

      const bgLayer = document.createElement("span");
      bgLayer.className = "folder-bg-layer";
      applyBgStyleToLayer(bgLayer, bgUrl);
      const pos = folderBgPosMap[folder.id];
      if (pos && !isCssColorOrGradient(bgUrl)) {
        bgLayer.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
        if (pos.scale && pos.scale > 1) {
          bgLayer.style.setProperty("--bg-base-scale", String(pos.scale));
        }
      }
      el.appendChild(bgLayer);

      const maskLayer = document.createElement("span");
      maskLayer.className = "folder-mask-layer";
      el.appendChild(maskLayer);
    } else if (useSplitBarBg) {
      el.dataset.bgEffect = settings.folderBgEffect || "zoom";
      const maskLayer = document.createElement("span");
      maskLayer.className = "folder-mask-layer";
      el.appendChild(maskLayer);
    }

    const textLayer = document.createElement("div");
    textLayer.className = "folder-text-layer";

    if (!isCatTile) {
      const titleWrap = document.createElement("span");
      titleWrap.className = "folder-title-wrap pos-center";
      const titleSpan = document.createElement("span");
      titleSpan.className = "cat-title";
      titleSpan.textContent = folder ? folder.title : fallbackTitle;
      titleWrap.appendChild(titleSpan);
      if (isEmpty) {
        const emptyHint = document.createElement("span");
        emptyHint.className = "empty-folder-hint";
        emptyHint.textContent = "(空)";
        titleWrap.appendChild(emptyHint);
      }
      textLayer.appendChild(titleWrap);
      el.appendChild(textLayer);
      return;
    }

    const titlePos = settings.folderTitlePos || "center";
    const countPos = settings.folderCountPos || "bottom-right";
    const showTitle = settings.showFolderTitle !== false;
    const showCount = Boolean(folder) && settings.showFolderCount !== false;
    const countVal = folder ? String(flattenLinksWithOrder(folder.children || []).length) : "";
    const countInline =
      showCount && showTitle && (countPos === "inline" || countPos === titlePos);

    if (showTitle) {
      const titleWrap = document.createElement("span");
      titleWrap.className = `folder-title-wrap pos-${titlePos}`;
      const titleSpan = document.createElement("span");
      titleSpan.className = "cat-title";
      titleSpan.textContent = folder ? folder.title : fallbackTitle;
      titleWrap.appendChild(titleSpan);
      if (isEmpty) {
        const emptyHint = document.createElement("span");
        emptyHint.className = "empty-folder-hint";
        emptyHint.textContent = "(空)";
        titleWrap.appendChild(emptyHint);
      }
      if (countInline) {
        const inlineCount = document.createElement("span");
        inlineCount.className = "folder-count-inline";
        inlineCount.textContent = countVal;
        titleWrap.appendChild(inlineCount);
      }
      textLayer.appendChild(titleWrap);
    }

    if (showCount && !countInline) {
      const countSpan = document.createElement("span");
      countSpan.className = `cat-count pos-${countPos}`;
      countSpan.textContent = countVal;
      textLayer.appendChild(countSpan);
    }

    el.appendChild(textLayer);
  }

  function isVirtualFolderId(id) {
    return id === SITE_CONTEXT_ID || id === FREQUENT_ID;
  }

  function matchHostRule(host, domainsStr) {
    if (!host || !domainsStr) return false;
    const parts = String(domainsStr)
      .split(/[\s,;，；]+/)
      .map((s) =>
        s
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "")
          .replace(/:\d+$/, "")
          .replace(/^\*\./, "")
      )
      .filter(Boolean);
    return parts.some((d) => host === d || host.endsWith("." + d));
  }

  function getMatchedSiteRule() {
    if (!currentHost) return null;
    const rules = Array.isArray(settings.siteFolderRules) ? settings.siteFolderRules : [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!r || !r.domains || !r.folderId) continue;
      if (matchHostRule(currentHost, r.domains) && folderMap.has(r.folderId)) {
        return { rule: r, index: i, folder: folderMap.get(r.folderId) };
      }
    }
    return null;
  }

  function getMatchedSiteFolder() {
    return getMatchedSiteRule()?.folder || null;
  }

  function parseSiteRuleEngines(rule) {
    const rawItems = Array.isArray(rule?.searchSlots)
      ? rule.searchSlots
      : String(rule?.searches || "").split(/\r?\n/);
    const list = [];
    for (const rawLine of rawItems) {
      const line = String(rawLine || "").trim();
      if (!line) continue;
      const idx = line.indexOf("|");
      if (idx !== -1) {
        const name = line.slice(0, idx).trim();
        const url = line.slice(idx + 1).trim();
        if (name && url) list.push({ name, url, isSite: true });
      } else if (/^https?:\/\//i.test(line)) {
        list.push({ name: "站内搜索", url: line, isSite: true });
      } else if (currentHost) {
        list.push({
          name: line,
          url: `https://www.google.com/search?q=site:${currentHost}+%s`,
          isSite: true
        });
      }
    }
    return list;
  }

  function buildSiteSearchStack() {
    const matched = getMatchedSiteRule();
    if (!matched) return null;
    const { rule, index: ruleIdx } = matched;
    const siteEngines = parseSiteRuleEngines(rule);
    const count = siteEngines.length;
    if (count <= 0) return null;

    const webEngines = getSidebarWebEngines();
    const allEngines = [...siteEngines, ...webEngines];
    const savedActive = Array.isArray(rule.activeEngines) ? rule.activeEngines : [];

    const stackEl = document.createElement("div");
    stackEl.className = "site-search-stack";

    for (let boxIdx = 0; boxIdx < count; boxIdx++) {
      const fallbackName = siteEngines[boxIdx]?.name || "站内搜索";
      const engineName = savedActive[boxIdx] || fallbackName;
      const isBookmark = engineName === "书签";

      const wrap = document.createElement("div");
      wrap.className = "sidebar-search-wrap";

      const inp = document.createElement("input");
      inp.type = "search";
      inp.className = "sidebar-search-input";
      inp.autocomplete = "off";
      inp.placeholder = isBookmark ? "搜索书签...（右键切换）" : `${engineName}（右键切换）`;
      if (isBookmark && bookmarkSearchQuery) inp.value = bookmarkSearchQuery;

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "sidebar-search-clear" + (inp.value ? "" : " hidden");
      clearBtn.textContent = "✕";
      clearBtn.title = "清空";

      async function switchSiteBoxEngine(nextName) {
        if (isBookmark && nextName !== "书签" && bookmarkSearchQuery) {
          bookmarkSearchQuery = "";
        }
        const nextRules = (settings.siteFolderRules || []).map((r, ri) => {
          if (ri !== ruleIdx) return r;
          const arr = Array.isArray(r.activeEngines) ? [...r.activeEngines] : [];
          while (arr.length < count) arr.push("");
          arr[boxIdx] = nextName;
          return { ...r, activeEngines: arr };
        });
        settings.siteFolderRules = nextRules;
        await chrome.storage.sync.set({ siteFolderRules: nextRules });
        renderCategoriesAndPanes();
      }

      function openSiteEngineMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        notifyActivity();
        const items = [
          ...siteEngines.map((eng) => ({
            label: `${engineName === eng.name ? "✓ " : "　 "}${eng.name}`,
            action: () => switchSiteBoxEngine(eng.name)
          })),
          { sep: true },
          {
            label: `${engineName === "书签" ? "✓ " : "　 "}书签搜索`,
            action: () => switchSiteBoxEngine("书签")
          },
          { sep: true },
          ...webEngines.map((eng) => ({
            label: `${engineName === eng.name ? "✓ " : "　 "}${eng.name}`,
            action: () => switchSiteBoxEngine(eng.name)
          }))
        ];
        openCtxMenu(e.clientX, e.clientY, items);
      }

      wrap.addEventListener("contextmenu", openSiteEngineMenu);

      inp.addEventListener("input", () => {
        notifyActivity();
        clearBtn.classList.toggle("hidden", !inp.value);
        if (isBookmark) {
          bookmarkSearchQuery = inp.value;
          scheduleRefresh(80);
        }
      });

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && inp.value) {
          inp.value = "";
          clearBtn.classList.add("hidden");
          if (isBookmark) {
            bookmarkSearchQuery = "";
            scheduleRefresh(0);
          }
          return;
        }
        if (e.key === "Enter" && !isBookmark) {
          e.preventDefault();
          const q = inp.value.trim();
          if (!q) return;
          const eng = allEngines.find((x) => x.name === engineName) || siteEngines[boxIdx] || siteEngines[0];
          const targetUrl = eng.url.includes("%s")
            ? eng.url.replace(/%s/g, encodeURIComponent(q))
            : `${eng.url}${encodeURIComponent(q)}`;
          safeSendMessage({
            type: "OPEN_URL",
            url: targetUrl,
            newTab: settings.openInNewTab,
            active: settings.openTabActive,
            position: settings.openTabPosition
          });
          inp.value = "";
          clearBtn.classList.add("hidden");
          if (settings.closeOnClickBookmark) {
            try {
              window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
            } catch {}
          }
        }
      });

      clearBtn.addEventListener("click", () => {
        inp.value = "";
        clearBtn.classList.add("hidden");
        inp.focus();
        if (isBookmark) {
          bookmarkSearchQuery = "";
          scheduleRefresh(0);
        }
      });

      wrap.appendChild(inp);
      wrap.appendChild(clearBtn);
      stackEl.appendChild(wrap);
    }

    return stackEl;
  }

  function resolveWritableFolderId(folderOrId) {
    if (!folderOrId) return null;
    if (typeof folderOrId === "object") {
      if (folderOrId.virtualType === "frequent" || folderOrId.virtualType === "site-fallback" || folderOrId.virtualType === "site-empty") {
        return null;
      }
      if (folderOrId.mappedFolderId) return folderOrId.mappedFolderId;
      return isVirtualFolderId(folderOrId.id) ? null : folderOrId.id;
    }
    if (folderOrId === FREQUENT_ID) return null;
    if (folderOrId === SITE_CONTEXT_ID) {
      return getMatchedSiteFolder()?.id || null;
    }
    return folderOrId;
  }

  function buildFrequentFolder() {
    const title = (settings.frequentFolderName || "常用").trim() || "常用";
    const maxCount = Math.min(60, Math.max(4, Number(settings.frequentMaxCount) || 20));
    const halfLifeDays = Math.max(1, Number(settings.frequentHalfLifeDays) || 14);
    const now = Date.now();
    const scored = [];
    for (const [id, st] of Object.entries(bookmarkStats || {})) {
      const node = allBookmarksById.get(id);
      if (!node || !node.url) continue;
      const lastClick = Number(st?.lastClick) || now;
      const deltaDays = Math.max(0, (now - lastClick) / 86400000);
      const eff = (Number(st?.score) || 0) * Math.pow(0.5, deltaDays / halfLifeDays);
      if (eff <= 0) continue;
      scored.push({ node, eff, lastClick });
    }
    scored.sort((a, b) => b.eff - a.eff || b.lastClick - a.lastClick);
    return {
      id: FREQUENT_ID,
      title,
      isVirtual: true,
      virtualType: "frequent",
      children: scored.slice(0, maxCount).map((s) => s.node)
    };
  }

  function buildSiteContextFolder(forMiddleSlot = false) {
    const baseName = (settings.siteFolderName || "站内").trim() || "站内";
    const matched = getMatchedSiteFolder();
    if (matched) {
      return {
        id: SITE_CONTEXT_ID,
        title: baseName,
        isVirtual: true,
        virtualType: "site",
        mappedFolderId: matched.id,
        mappedFolderTitle: matched.title,
        children: matched.children || []
      };
    }
    if (forMiddleSlot && settings.siteFallbackToFrequent !== false) {
      const freq = buildFrequentFolder();
      return {
        id: SITE_CONTEXT_ID,
        title: freq.title,
        isVirtual: true,
        virtualType: "site-fallback",
        children: freq.children
      };
    }
    return {
      id: SITE_CONTEXT_ID,
      title: baseName,
      isVirtual: true,
      virtualType: "site-empty",
      children: []
    };
  }

  function getFolderById(id, forMiddleSlot = false) {
    if (!id) return null;
    if (id === SITE_CONTEXT_ID) return buildSiteContextFolder(forMiddleSlot);
    if (id === FREQUENT_ID) return buildFrequentFolder();
    return folderMap.get(id) || null;
  }

  function applyAutoSwitchToSiteSlot() {
    if (settings.siteAutoSwitch === false || settings.flatFolderMode) return false;
    if (!getMatchedSiteFolder()) return false;
    let changed = false;
    const topN = Math.min(6, Math.max(1, Number(settings.topSlotCount) || 3));
    const bottomN = Math.min(6, Math.max(1, Number(settings.bottomSlotCount) || 3));
    const topIds = Array.isArray(settings.topSlotIds) ? settings.topSlotIds.slice(0, topN) : [];
    const bottomIds = Array.isArray(settings.bottomSlotIds)
      ? settings.bottomSlotIds.slice(0, bottomN)
      : [];
    const topIdx = topIds.indexOf(SITE_CONTEXT_ID);
    if (topIdx >= 0 && activeTopSlot !== topIdx) {
      activeTopSlot = topIdx;
      changed = true;
    }
    const botIdx = bottomIds.indexOf(SITE_CONTEXT_ID);
    if (botIdx >= 0 && activeBottomSlot !== botIdx) {
      activeBottomSlot = botIdx;
      changed = true;
    }
    return changed;
  }

  function appendOtherFolders(container, excludeIds, forceShow = false) {
    if (!forceShow && settings.showOtherFolders === false) return;
    const effectiveExclude = new Set(excludeIds);
    const virtualPrefix = [];

    if (!effectiveExclude.has(SITE_CONTEXT_ID)) {
      const matched = getMatchedSiteFolder();
      if (matched) {
        virtualPrefix.push(buildSiteContextFolder(false));
        effectiveExclude.add(matched.id);
      }
    }
    if (!effectiveExclude.has(FREQUENT_ID) && settings.showFrequentInOther !== false) {
      const freq = buildFrequentFolder();
      if (freq.children.length > 0) {
        virtualPrefix.push(freq);
      }
    }

    // Collect top-level folders (under "1" or "2") + trash folder not in effectiveExclude
    const trashName = (settings.trashFolderName || "回收站").trim() || "回收站";
    const realOthers = allFolders.filter((f) => {
      if (effectiveExclude.has(f.id)) return false;
      if (isTrashFolderNode(f, trashName)) {
        return settings.showTrashFolder !== false;
      }
      if (f.parentId !== "1" && f.parentId !== "2") return false;
      return true;
    });
    const others = [...virtualPrefix, ...realOthers];
    if (others.length === 0) return;

    const section = document.createElement("div");
    section.className = "other-folders-section";

    for (const folder of others) {
      const block = document.createElement("div");
      block.className =
        "other-folder-block" + (collapsedSet.has(folder.id) ? " collapsed" : "");

      const title = document.createElement("div");
      title.className = "other-folder-title";
      const directLinks = (folder.children || []).filter((n) => n.url);
      const childSubFolders = (folder.children || []).filter((n) => Boolean(n.children));
      applyFolderCardVisual(title, folder, {
        isEmpty: directLinks.length === 0 && childSubFolders.length === 0
      });
      if (!folder.isVirtual) {
        attachFolderDragAndDrop(block, title, folder);
      } else if (folder.mappedFolderId) {
        block.dataset.folderId = folder.mappedFolderId;
      }

      title.addEventListener("click", () => {
        notifyActivity();
        if (collapsedSet.has(folder.id)) {
          collapsedSet.delete(folder.id);
          block.classList.remove("collapsed");
        } else {
          collapsedSet.add(folder.id);
          block.classList.add("collapsed");
        }
        safeStorageSet("local", { collapsedIds: Array.from(collapsedSet) });
      });
      title.addEventListener("contextmenu", (e) => {
        if (e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        if (folder.virtualType === "frequent") {
          openCtxMenu(e.clientX, e.clientY, [
            {
              label: "清空常用点击统计",
              danger: true,
              action: async () => {
                const ok = await showConfirmModal("清空常用统计", "确定要清空所有书签的点击频次记录吗？");
                if (ok) {
                  safeSendMessage({ type: "CLEAR_BOOKMARK_STATS" });
                }
              }
            },
            {
              label: "打开扩展设置",
              action: async () => {
                safeSendMessage({ type: "OPEN_OPTIONS" });
              }
            }
          ]);
          return;
        }
        const targetId = folder.mappedFolderId || folder.id;
        const targetTitle = folder.mappedFolderTitle || folder.title || "";
        openCtxMenu(e.clientX, e.clientY, [
          {
            label: "新建子文件夹",
            action: async () => {
              const name = await showPromptModal("新建子文件夹", "新建文件夹");
              if (name !== null && name.trim()) {
                await chrome.bookmarks.create({ parentId: targetId, title: name.trim() });
              }
            }
          },
          {
            label: folder.mappedFolderId ? `重命名「${targetTitle}」` : "重命名文件夹",
            action: async () => {
              const newTitle = await showPromptModal("重命名文件夹", targetTitle);
              if (newTitle !== null && newTitle.trim()) {
                await chrome.bookmarks.update(targetId, { title: newTitle.trim() });
              }
            }
          },
          ...(!folder.isVirtual
            ? [
                {
                  label: settings.showPermanentDelete
                    ? `移动到「${(settings.trashFolderName || "回收站").trim() || "回收站"}」`
                    : "删除",
                  danger: !settings.showPermanentDelete,
                  action: async () => {
                    const trash = await findOrCreateTrashFolder();
                    if (trash && trash.id !== folder.id && trash.id !== folder.parentId) {
                      await chrome.bookmarks.move(folder.id, { parentId: trash.id });
                    }
                  }
                }
              ]
            : [])
        ]);
      });
      block.appendChild(title);

      if (directLinks.length > 0) {
        const ul = document.createElement("ul");
        for (const link of directLinks) {
          ul.appendChild(createLinkItem(link, false, "bottom"));
        }
        block.appendChild(ul);
      }

      renderSubFolders(block, folder.children || [], "bottom", 1);
      section.appendChild(block);
    }

    container.appendChild(section);
  }

  function collectFolders(nodes) {
    const list = [];
    function walk(arr) {
      for (const n of arr) {
        if (n.children) {
          if (n.id !== "0" && n.id !== "1" && n.title) {
            list.push(n);
          }
          walk(n.children);
        }
      }
    }
    walk(nodes);
    return list;
  }

  function resolveSlotFolders() {
    const topN = Math.min(6, Math.max(1, Number(settings.topSlotCount) || 3));
    const bottomN = Math.min(6, Math.max(1, Number(settings.bottomSlotCount) || 3));
    const topIds = Array.isArray(settings.topSlotIds) ? settings.topSlotIds : [];
    const bottomIds = Array.isArray(settings.bottomSlotIds) ? settings.bottomSlotIds : [];

    const topFolders = Array.from({ length: topN }, (_, i) => {
      const id = topIds[i];
      if (id) {
        const resolved = getFolderById(id, true);
        if (resolved) return resolved;
      }
      return allFolders[i] || null;
    });

    const bottomFolders = Array.from({ length: bottomN }, (_, i) => {
      const id = bottomIds[i];
      if (id) {
        const resolved = getFolderById(id, true);
        if (resolved) return resolved;
      }
      return allFolders[i + topN] || null;
    });

    return { topFolders, bottomFolders };
  }

  async function handleCategoryDrop(targetIsTop, targetIdx) {
    if (!draggedCat) return;
    const { isTop: srcIsTop, idx: srcIdx } = draggedCat;
    if (srcIsTop === targetIsTop && srcIdx === targetIdx) return;

    const { topFolders, bottomFolders } = resolveSlotFolders();
    const topIds = topFolders.map((f) => (f ? f.id : ""));
    const bottomIds = bottomFolders.map((f) => (f ? f.id : ""));
    const topCounts = topFolders.map((_, i) => settings.topBigCount?.[i] ?? 4);
    const bottomCounts = bottomFolders.map((_, i) => settings.bottomBigCount?.[i] ?? 4);

    const srcIds = srcIsTop ? topIds : bottomIds;
    const dstIds = targetIsTop ? topIds : bottomIds;
    const srcCounts = srcIsTop ? topCounts : bottomCounts;
    const dstCounts = targetIsTop ? topCounts : bottomCounts;

    [srcIds[srcIdx], dstIds[targetIdx]] = [dstIds[targetIdx], srcIds[srcIdx]];
    [srcCounts[srcIdx], dstCounts[targetIdx]] = [dstCounts[targetIdx], srcCounts[srcIdx]];

    if (srcIsTop === targetIsTop) {
      if (srcIsTop && activeTopSlot === srcIdx) activeTopSlot = targetIdx;
      else if (srcIsTop && activeTopSlot === targetIdx) activeTopSlot = srcIdx;
      if (!srcIsTop && activeBottomSlot === srcIdx) activeBottomSlot = targetIdx;
      else if (!srcIsTop && activeBottomSlot === targetIdx) activeBottomSlot = srcIdx;
    }

    settings.topSlotIds = topIds;
    settings.bottomSlotIds = bottomIds;
    settings.topBigCount = topCounts;
    settings.bottomBigCount = bottomCounts;

    renderCategoriesAndPanes();
    safeStorageSet("sync", {
      topSlotIds: topIds,
      bottomSlotIds: bottomIds,
      topBigCount: topCounts,
      bottomBigCount: bottomCounts
    });
  }

  function createCatTile(folder, idx, isTop, activeIdx, topN, onHover) {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (idx === activeIdx ? " active" : "") + (!folder ? " empty" : "");
    btn.draggable = false;
    btn.dataset.catIsTop = isTop ? "1" : "0";
    btn.dataset.catIdx = String(idx);
    if (folder) {
      btn.dataset.folderId = folder.id;
    }

    const fallbackLabel = `分类 ${isTop ? idx + 1 : idx + 1 + topN}`;
    applyFolderCardVisual(btn, folder, { fallbackTitle: fallbackLabel, isCatTile: true });

    btn.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        startPointerDragCandidate(
          e,
          "cat",
          { isTop, idx },
          folder ? folder.title : fallbackLabel,
          btn
        );
      }
    });

    if (folder) {
      btn.title = folder.title;
      btn.addEventListener("mouseenter", () => {
        notifyActivity();
        if (settings.categorySwitchMode !== "click") {
          onHover();
        }
      });
      btn.addEventListener("click", () => {
        notifyActivity();
        if (settings.categorySwitchMode !== "click") {
          const clickUrl = (folderClickUrlMap[folder.id] || "").trim();
          if (clickUrl) {
            const finalUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clickUrl)
              ? clickUrl
              : `https://${clickUrl}`;
            safeSendMessage({
              type: "OPEN_URL",
              url: finalUrl,
              newTab: settings.openInNewTab,
              active: settings.openTabActive,
              position: settings.openTabPosition
            });
            if (settings.closeOnClickBookmark) {
              window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
            }
            return;
          }
        }
        onHover();
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (folder.virtualType === "frequent" || folder.virtualType === "site-fallback") {
          openCtxMenu(e.clientX, e.clientY, [
            {
              label: "清空常用点击统计",
              danger: true,
              action: async () => {
                const ok = await showConfirmModal("清空常用统计", "确定要清空所有书签的点击频次记录吗？");
                if (ok) {
                  safeSendMessage({ type: "CLEAR_BOOKMARK_STATS" });
                }
              }
            },
            {
              label: "打开扩展设置",
              action: async () => {
                safeSendMessage({ type: "OPEN_OPTIONS" });
              }
            }
          ]);
          return;
        }
        const targetId = resolveWritableFolderId(folder);
        if (!targetId) {
          openCtxMenu(e.clientX, e.clientY, [
            {
              label: "在设置中绑定当前网站文件夹",
              action: async () => {
                safeSendMessage({ type: "OPEN_OPTIONS" });
              }
            }
          ]);
          return;
        }
        const targetTitle = folder.mappedFolderTitle || folder.title || "";
        openCtxMenu(e.clientX, e.clientY, [
          {
            label: "在此分类新建子文件夹",
            action: async () => {
              const name = await showPromptModal("新建子文件夹", "新建文件夹");
              if (name !== null && name.trim()) {
                await chrome.bookmarks.create({ parentId: targetId, title: name.trim() });
              }
            }
          },
          {
            label: folder.mappedFolderId ? `重命名「${targetTitle}」` : "重命名分类文件夹",
            action: async () => {
              const newTitle = await showPromptModal("重命名文件夹", targetTitle);
              if (newTitle !== null && newTitle.trim()) {
                await chrome.bookmarks.update(targetId, { title: newTitle.trim() });
              }
            }
          }
        ]);
      });
    } else {
      btn.title = "未配置";
    }
    return btn;
  }

  function renderCategoryBarBgLayer() {
    if (!categoryBar) return;
    const existing = categoryBar.querySelector(".category-bar-bg-layer");
    if (existing) existing.remove();
    if (!categoryBarBg) {
      categoryBar.classList.remove("has-split-bg");
      return;
    }
    categoryBar.classList.add("has-split-bg");
    const layer = document.createElement("div");
    layer.className = "category-bar-bg-layer";
    applyBgStyleToLayer(layer, categoryBarBg);
    const pos = categoryBarBgPos || { x: 50, y: 50, scale: 1 };
    if (!isCssColorOrGradient(categoryBarBg)) {
      layer.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
      if (pos.scale && pos.scale > 1) {
        layer.style.setProperty("--bg-base-scale", String(pos.scale));
      }
    }
    categoryBar.prepend(layer);
  }

  function renderCategoriesAndPanes() {
    if (settings.flatFolderMode) {
      topPane.style.display = "none";
      categoryBar.style.display = "none";
      bottomPane.style.flex = "1";
      bottomPane.innerHTML = "";
      appendOtherFolders(bottomPane, new Set(), true);
      const sec = bottomPane.querySelector(".other-folders-section");
      if (sec) {
        sec.style.marginTop = "0";
        sec.style.paddingTop = "0";
        sec.style.borderTop = "none";
      }
      requestAnimationFrame(updateOverflowFadeFlags);
      return;
    }

    topPane.style.display = "";
    categoryBar.style.display = "";
    bottomPane.style.flex = "";
    renderCategoryBarBgLayer();
    const { topFolders, bottomFolders } = resolveSlotFolders();
    const excludeIds = new Set();
    for (const f of [...topFolders, ...bottomFolders]) {
      if (!f) continue;
      excludeIds.add(f.id);
      if (f.mappedFolderId) excludeIds.add(f.mappedFolderId);
      if (f.virtualType === "site-fallback") excludeIds.add(FREQUENT_ID);
    }
    const topN = topFolders.length;
    if (activeTopSlot >= topFolders.length) activeTopSlot = 0;
    if (activeBottomSlot >= bottomFolders.length) activeBottomSlot = 0;

    const topCountsArr = Array.isArray(settings.topBigCount) ? settings.topBigCount : [];
    const bottomCountsArr = Array.isArray(settings.bottomBigCount) ? settings.bottomBigCount : [];

    topCatsEl.innerHTML = "";
    topFolders.forEach((folder, idx) => {
      const tile = createCatTile(folder, idx, true, activeTopSlot, topN, () => {
        if (activeTopSlot !== idx) {
          activeTopSlot = idx;
          updateActiveButtons(topCatsEl, idx);
          renderFolderContents(topPane, folder, "top", topCountsArr[idx] ?? 4);
          if (settings.rememberLastCategory) {
            chrome.storage.local.set({ lastTopSlot: idx });
          }
        }
      });
      topCatsEl.appendChild(tile);
    });

    bottomCatsEl.innerHTML = "";
    bottomFolders.forEach((folder, idx) => {
      const tile = createCatTile(folder, idx, false, activeBottomSlot, topN, () => {
        if (activeBottomSlot !== idx) {
          activeBottomSlot = idx;
          updateActiveButtons(bottomCatsEl, idx);
          renderFolderContents(bottomPane, folder, "bottom", bottomCountsArr[idx] ?? 4);
          appendOtherFolders(bottomPane, excludeIds);
          if (settings.rememberLastCategory) {
            chrome.storage.local.set({ lastBottomSlot: idx });
          }
        }
      });
      bottomCatsEl.appendChild(tile);
    });

    renderFolderContents(
      topPane,
      topFolders[activeTopSlot] || null,
      "top",
      topCountsArr[activeTopSlot] ?? 4
    );
    renderFolderContents(
      bottomPane,
      bottomFolders[activeBottomSlot] || null,
      "bottom",
      bottomCountsArr[activeBottomSlot] ?? 4
    );
    appendOtherFolders(bottomPane, excludeIds);
    requestAnimationFrame(updateOverflowFadeFlags);
  }

  function updateActiveButtons(rowEl, activeIdx) {
    Array.from(rowEl.children).forEach((el, i) => {
      el.classList.toggle("active", i === activeIdx);
    });
  }

  async function refreshData() {
    const tree = await chrome.bookmarks.getTree();
    allFolders = collectFolders(tree);
    folderMap = new Map(allFolders.map((f) => [f.id, f]));

    const trashName = (settings.trashFolderName || "回收站").trim() || "回收站";
    allBookmarksById = new Map();
    function collectNonTrashBookmarks(nodes) {
      for (const n of nodes) {
        if (n.children) {
          if (isTrashFolderNode(n, trashName)) continue;
          collectNonTrashBookmarks(n.children);
        } else if (n.url) {
          allBookmarksById.set(n.id, n);
        }
      }
    }
    collectNonTrashBookmarks(tree);

    const q = bookmarkSearchQuery.trim().toLowerCase();
    if (q) {
      splitContainer.classList.add("hidden");
      searchPane.classList.remove("hidden");
      searchPane.innerHTML = "";
      const ul = document.createElement("ul");
      const matches = flattenLinksWithOrder(tree).filter(
        (b) =>
          (b.title && b.title.toLowerCase().includes(q)) ||
          (b.url && b.url.toLowerCase().includes(q))
      );
      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-tip";
        empty.textContent = "没有找到匹配的书签";
        ul.appendChild(empty);
      } else {
        for (const m of matches) ul.appendChild(createLinkItem(m, false, ""));
      }
      searchPane.appendChild(ul);
      return;
    }

    searchPane.classList.add("hidden");
    splitContainer.classList.remove("hidden");
    renderCategoriesAndPanes();
  }

  let refreshDebounceTimer = null;
  function scheduleRefresh(delayMs = 60) {
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = setTimeout(() => {
      refreshDebounceTimer = null;
      refreshData();
    }, delayMs);
  }

  function getSidebarWebEngines() {
    const raw = (settings.newtabSearchEngines || "").trim();
    if (!raw) return DEFAULT_WEB_ENGINES;
    const parsed = [];
    for (const line of raw.split(/\r?\n/)) {
      const idx = line.indexOf("|");
      if (idx === -1) continue;
      const name = line.slice(0, idx).trim();
      const url = line.slice(idx + 1).trim();
      if (name && url) parsed.push({ name, url });
    }
    return parsed.length > 0 ? parsed : DEFAULT_WEB_ENGINES;
  }

  function renderSidebarSearchBoxes() {
    if (!sidebarTopSearches || !sidebarBottomSearches) return;
    sidebarTopSearches.innerHTML = "";
    sidebarBottomSearches.innerHTML = "";

    const boxes = Array.isArray(settings.sidebarSearchBoxes) ? settings.sidebarSearchBoxes : [];
    const webEngines = getSidebarWebEngines();
    let topCount = 0;
    let bottomCount = 0;

    boxes.forEach((box, idx) => {
      const pos = box?.pos === "bottom" ? "bottom" : "top";
      const engineName = box?.engine || "Google";
      const isBookmark = engineName === "书签";

      const wrap = document.createElement("div");
      wrap.className = "sidebar-search-wrap";

      const inp = document.createElement("input");
      inp.type = "search";
      inp.className = "sidebar-search-input";
      inp.autocomplete = "off";
      inp.placeholder = isBookmark ? "搜索书签..." : `${engineName} 搜索...`;
      if (isBookmark && bookmarkSearchQuery) inp.value = bookmarkSearchQuery;

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "sidebar-search-clear" + (inp.value ? "" : " hidden");
      clearBtn.textContent = "✕";
      clearBtn.title = "清空";

      function openEngineMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        notifyActivity();
        const items = [
          {
            label: `${engineName === "书签" ? "✓ " : "　 "}书签搜索`,
            action: async () => {
              const next = boxes.map((b, i) => (i === idx ? { ...b, engine: "书签" } : { ...b }));
              settings.sidebarSearchBoxes = next;
              renderSidebarSearchBoxes();
              await chrome.storage.sync.set({ sidebarSearchBoxes: next });
            }
          },
          { sep: true },
          ...webEngines.map((eng) => ({
            label: `${engineName === eng.name ? "✓ " : "　 "}${eng.name}`,
            action: async () => {
              if (isBookmark && bookmarkSearchQuery) {
                bookmarkSearchQuery = "";
                scheduleRefresh(0);
              }
              const next = boxes.map((b, i) => (i === idx ? { ...b, engine: eng.name } : { ...b }));
              settings.sidebarSearchBoxes = next;
              renderSidebarSearchBoxes();
              await chrome.storage.sync.set({ sidebarSearchBoxes: next });
            }
          })),
          { sep: true },
          {
            label: pos === "top" ? "移到侧边栏最下方" : "移到侧边栏最上方",
            action: async () => {
              const next = boxes.map((b, i) =>
                i === idx ? { ...b, pos: pos === "top" ? "bottom" : "top" } : { ...b }
              );
              settings.sidebarSearchBoxes = next;
              renderSidebarSearchBoxes();
              await chrome.storage.sync.set({ sidebarSearchBoxes: next });
            }
          },
          {
            label: "移除此搜索框",
            danger: true,
            action: async () => {
              if (isBookmark && bookmarkSearchQuery) {
                bookmarkSearchQuery = "";
                scheduleRefresh(0);
              }
              const next = boxes.filter((_, i) => i !== idx);
              settings.sidebarSearchBoxes = next;
              renderSidebarSearchBoxes();
              await chrome.storage.sync.set({ sidebarSearchBoxes: next });
            }
          }
        ];
        openCtxMenu(e.clientX, e.clientY, items);
      }

      wrap.addEventListener("contextmenu", openEngineMenu);

      inp.addEventListener("input", () => {
        notifyActivity();
        clearBtn.classList.toggle("hidden", !inp.value);
        if (isBookmark) {
          bookmarkSearchQuery = inp.value;
          scheduleRefresh(80);
        }
      });

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && inp.value) {
          inp.value = "";
          clearBtn.classList.add("hidden");
          if (isBookmark) {
            bookmarkSearchQuery = "";
            scheduleRefresh(0);
          }
          return;
        }
        if (e.key === "Enter" && !isBookmark) {
          e.preventDefault();
          const q = inp.value.trim();
          if (!q) return;
          const eng = webEngines.find((x) => x.name === engineName) || webEngines[0];
          const targetUrl = eng.url.includes("%s")
            ? eng.url.replace(/%s/g, encodeURIComponent(q))
            : `${eng.url}${encodeURIComponent(q)}`;
          safeSendMessage({
            type: "OPEN_URL",
            url: targetUrl,
            newTab: settings.openInNewTab,
            active: settings.openTabActive,
            position: settings.openTabPosition
          });
          inp.value = "";
          clearBtn.classList.add("hidden");
          if (settings.closeOnClickBookmark) {
            try {
              window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
            } catch {}
          }
        }
      });

      clearBtn.addEventListener("click", () => {
        inp.value = "";
        clearBtn.classList.add("hidden");
        inp.focus();
        if (isBookmark) {
          bookmarkSearchQuery = "";
          scheduleRefresh(0);
        }
      });

      wrap.appendChild(inp);
      wrap.appendChild(clearBtn);

      if (pos === "bottom") {
        sidebarBottomSearches.appendChild(wrap);
        bottomCount++;
      } else {
        sidebarTopSearches.appendChild(wrap);
        topCount++;
      }
    });

    sidebarTopSearches.classList.toggle("hidden", topCount === 0);
    sidebarBottomSearches.classList.toggle("hidden", bottomCount === 0);
  }

  chrome.bookmarks.onCreated.addListener(() => scheduleRefresh());
  chrome.bookmarks.onRemoved.addListener(() => scheduleRefresh());
  chrome.bookmarks.onChanged.addListener(() => scheduleRefresh());
  chrome.bookmarks.onMoved.addListener(() => scheduleRefresh());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (
        changes.folderBgMap ||
        changes.folderBgPosMap ||
        changes.folderClickUrlMap ||
        changes.categoryBarBg ||
        changes.categoryBarBgPos ||
        changes.bookmarkStats
      ) {
        if (changes.folderBgMap) folderBgMap = changes.folderBgMap.newValue || {};
        if (changes.folderBgPosMap) folderBgPosMap = changes.folderBgPosMap.newValue || {};
        if (changes.folderClickUrlMap) folderClickUrlMap = changes.folderClickUrlMap.newValue || {};
        if (changes.categoryBarBg) categoryBarBg = changes.categoryBarBg.newValue || "";
        if (changes.categoryBarBgPos) {
          categoryBarBgPos = changes.categoryBarBgPos.newValue || { x: 50, y: 50, scale: 1 };
        }
        if (changes.bookmarkStats) bookmarkStats = changes.bookmarkStats.newValue || {};
        renderCategoriesAndPanes();
      }
      return;
    }
    if (area !== "sync") return;
    let needRefresh = false;
    for (const [k, v] of Object.entries(changes)) {
      settings[k] = v.newValue;
      if (k === "defaultTopSlot") activeTopSlot = Number(v.newValue) || 0;
      if (k === "defaultBottomSlot") activeBottomSlot = Number(v.newValue) || 0;
      if (
        k === "topSlotCount" ||
        k === "bottomSlotCount" ||
        k === "showOtherFolders" ||
        k === "flatFolderMode" ||
        k === "otherFolderAlign" ||
        k === "trashFolderName" ||
        k === "showPermanentDelete" ||
        k === "showTrashFolder" ||
        k === "folderBgEffect" ||
        k === "folderTitlePos" ||
        k === "showFolderTitle" ||
        k === "folderCountPos" ||
        k === "showFolderCount" ||
        k === "titleStripParens" ||
        k === "titleStripDash" ||
        k === "titleStripPipe" ||
        k === "titleStripColon" ||
        k === "titleCustomRegex" ||
        k === "topSlotIds" ||
        k === "bottomSlotIds" ||
        k === "topBigCount" ||
        k === "bottomBigCount" ||
        k === "defaultTopSlot" ||
        k === "defaultBottomSlot" ||
        k === "columns" ||
        k === "siteFolderName" ||
        k === "siteFolderRules" ||
        k === "siteAutoSwitch" ||
        k === "siteFallbackToFrequent" ||
        k === "frequentFolderName" ||
        k === "frequentMaxCount" ||
        k === "frequentHalfLifeDays" ||
        k === "showFrequentInOther"
      ) {
        needRefresh = true;
      }
    }
    applyVisualSettings();
    if (needRefresh) refreshData();
  });

  async function init() {
    const [res, localRes] = await Promise.all([
      chrome.storage.sync.get([
        "columns",
        "openInNewTab",
        "openTabActive",
        "openTabPosition",
        "closeOnClickBookmark",
        "rememberLastCategory",
        "flatFolderMode",
        "categorySwitchMode",
        "showOtherFolders",
        "otherFolderAlign",
        "trashFolderName",
        "showPermanentDelete",
        "showTrashFolder",
        "folderBgMaskColor",
        "folderBgMaskOpacity",
        "folderBgBlur",
        "folderBgEffect",
        "folderTitlePos",
        "folderTitleSize",
        "folderTitleFont",
        "folderTitleWeight",
        "showFolderTitle",
        "folderCountPos",
        "showFolderCount",
        "sidebarSearchBoxes",
        "newtabSearchEngines",
        "bigCardTwoLines",
        "fadeOverflowText",
        "titleStripParens",
        "titleStripDash",
        "titleStripPipe",
        "titleStripColon",
        "titleCustomRegex",
        "normalFontSize",
        "normalRowHeight",
        "iconSize",
        "itemPaddingX",
        "itemGap",
        "scrollbarWidth",
        "bigScale",
        "tileHeight",
        "tileFontSize",
        "tileRadius",
        "fontFamily",
        "fontWeight",
        "tooltipMode",
        "splitRatio",
        "bgColor",
        "barColor",
        "accentColor",
        "tileColor",
        "bigCardColor",
        "hoverColor",
        "textColor",
        "customCss",
        "topSlotCount",
        "bottomSlotCount",
        "topSlotIds",
        "bottomSlotIds",
        "topBigCount",
        "bottomBigCount",
        "defaultTopSlot",
        "defaultBottomSlot",
        "siteFolderName",
        "siteFolderRules",
        "siteAutoSwitch",
        "siteFallbackToFrequent",
        "frequentFolderName",
        "frequentMaxCount",
        "frequentHalfLifeDays",
        "showFrequentInOther"
      ]),
      chrome.storage.local.get([
        "lastTopSlot",
        "lastBottomSlot",
        "collapsedIds",
        "folderBgMap",
        "folderBgPosMap",
        "folderClickUrlMap",
        "categoryBarBg",
        "categoryBarBgPos",
        "bookmarkStats"
      ])
    ]);
    settings = { ...settings, ...res };
    if (localRes.bookmarkStats && typeof localRes.bookmarkStats === "object") {
      bookmarkStats = localRes.bookmarkStats;
    }
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
    if (Array.isArray(localRes.collapsedIds)) {
      collapsedSet = new Set(localRes.collapsedIds);
    }
    const initTop = settings.rememberLastCategory && localRes.lastTopSlot !== undefined
      ? localRes.lastTopSlot
      : settings.defaultTopSlot;
    const initBottom = settings.rememberLastCategory && localRes.lastBottomSlot !== undefined
      ? localRes.lastBottomSlot
      : settings.defaultBottomSlot;
    activeTopSlot = Math.min(5, Math.max(0, Number(initTop) || 0));
    activeBottomSlot = Math.min(5, Math.max(0, Number(initBottom) || 0));
    applyVisualSettings();
    await refreshData();
    if (applyAutoSwitchToSiteSlot()) {
      renderCategoriesAndPanes();
    }
  }

  init();
})();
