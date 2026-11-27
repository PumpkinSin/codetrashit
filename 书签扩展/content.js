(() => {
  if (window.top !== window.self) return;
  if (typeof window.__bsProCleanup === "function") {
    try {
      window.__bsProCleanup();
    } catch {
      // Ignore cleanup errors from invalidated context
    }
  }
  const oldHost = document.getElementById("__bs_pro_host__");
  if (oldHost) oldHost.remove();
  const ac = new AbortController();
  const { signal } = ac;

  // Passive bridge for baihurss push-server WebUI (zero overhead on other pages)
  if (document.querySelector('meta[name="baihurss-push-server"]')) {
    window.addEventListener(
      "message",
      (ev) => {
        if (ev.source !== window || !ev.data || ev.data.type !== "BAIHURSS_REQ_BOOKMARKS") return;
        try {
          chrome.runtime.sendMessage({ type: "GET_BAIHURSS_BOOKMARKS" }, (resp) => {
            if (chrome.runtime.lastError) return;
            window.postMessage(
              {
                type: "BAIHURSS_RES_BOOKMARKS",
                bookmarks: Array.isArray(resp?.bookmarks) ? resp.bookmarks : []
              },
              "*"
            );
          });
        } catch {
          // Ignore invalidated context
        }
      },
      { signal }
    );
  }

  const DEFAULT_SETTINGS = {
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
    siteFilterMode: "all",
    siteFilterList: "",
    backdropOpacity: 0.25,
    bgColor: "#18191c"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let isOpen = false;
  let openTimer = null;
  let closeTimer = null;
  let idleTimer = null;
  let prevOverflow = "";

  const host = document.createElement("div");
  host.id = "__bs_pro_host__";
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.25);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.16s ease;
      z-index: 2147483645;
    }
    .backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }
    .trigger {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      left: 0;
      height: 100vh;
      width: 3px;
      background: transparent;
      pointer-events: auto;
      z-index: 2147483646;
    }
    .trigger.disabled {
      pointer-events: none;
    }
    .frame {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      width: 460px;
      border: none;
      margin: 0;
      padding: 0;
      background: #18191c;
      box-shadow: 4px 0 22px rgba(0, 0, 0, 0.45);
      transform: translateX(-105%);
      transition: transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
      pointer-events: none;
      z-index: 2147483647;
    }
    .frame.right {
      left: auto;
      right: 0;
      box-shadow: -4px 0 22px rgba(0, 0, 0, 0.45);
      transform: translateX(105%);
    }
    .frame.open {
      transform: translateX(0);
      pointer-events: auto;
    }
    .resize-handle {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      height: 80px;
      width: 36px;
      cursor: ew-resize;
      background: transparent;
      pointer-events: none;
      opacity: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0;
      box-sizing: border-box;
    }
    .resize-handle.right {
      justify-content: flex-start;
    }
    .resize-handle.open {
      pointer-events: auto;
      opacity: 1;
    }
    .resize-knob {
      width: 36px;
      height: 72px;
      border-radius: 36px 0 0 36px;
      background: rgba(24, 25, 28, 0.92);
      border: 1px solid rgba(96, 165, 250, 0.72);
      border-right: none;
      color: #60cdff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-left: 5px;
      font-size: 18px;
      font-weight: 700;
      box-shadow: -2px 2px 12px rgba(0, 0, 0, 0.45);
      opacity: 0;
      transform: translateX(6px);
      transition: opacity 0.16s ease, transform 0.16s ease;
      pointer-events: none;
      user-select: none;
      box-sizing: border-box;
    }
    .resize-handle.right .resize-knob {
      border-radius: 0 36px 36px 0;
      border-right: 1px solid rgba(96, 165, 250, 0.72);
      border-left: none;
      padding-left: 0;
      padding-right: 5px;
      box-shadow: 2px 2px 12px rgba(0, 0, 0, 0.45);
      transform: translateX(-6px);
    }
    .resize-handle:hover .resize-knob,
    .resize-handle.dragging .resize-knob {
      opacity: 1;
      transform: translateX(0);
    }
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const trigger = document.createElement("div");
  trigger.className = "trigger";
  let extraTriggerEls = [];

  const iframe = document.createElement("iframe");
  iframe.className = "frame";
  iframe.src =
    chrome.runtime.getURL("sidebar.html") +
    "?host=" +
    encodeURIComponent(location.hostname || "");

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  const resizeKnob = document.createElement("div");
  resizeKnob.className = "resize-knob";
  resizeKnob.textContent = "→";
  resizeHandle.appendChild(resizeKnob);

  shadow.appendChild(style);
  shadow.appendChild(backdrop);
  shadow.appendChild(trigger);
  shadow.appendChild(iframe);
  shadow.appendChild(resizeHandle);
  document.documentElement.appendChild(host);

  function isSiteAllowed() {
    const mode = settings.siteFilterMode || "all";
    if (mode === "all") return true;
    const raw = (settings.siteFilterList || "")
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const hostName = location.hostname.toLowerCase();
    const matched = raw.some((item) => hostName === item || hostName.endsWith("." + item));
    return mode === "whitelist" ? matched : !matched;
  }

  function isWindowedMode() {
    return window.outerWidth < screen.availWidth - 20;
  }

  function applySettings() {
    const allowed = isSiteAllowed();
    host.style.display = allowed ? "block" : "none";
    if (!allowed && isOpen) closeSidebar();

    const isRight = settings.position === "right";
    iframe.classList.toggle("right", isRight);

    trigger.style.left = isRight ? "auto" : "0";
    trigger.style.right = isRight ? "0" : "auto";

    const windowed = isWindowedMode();
    const disableEdge =
      settings.triggerMode === "icon" || (windowed && Boolean(settings.disableInWindowed));
    const tWidth = windowed
      ? Math.max(1, Number(settings.triggerWidthWindowed) || 3)
      : Math.max(1, Number(settings.triggerWidth) || 3);

    const tHeight = Math.min(100, Math.max(5, Number(settings.triggerHeight) || 100));
    const tTop = Math.min(100 - tHeight, Math.max(0, Number(settings.triggerTop) || 0));
    trigger.style.width = `${tWidth}px`;
    trigger.style.top = `${tTop}vh`;
    trigger.style.bottom = "auto";
    trigger.style.height = `${tHeight}vh`;
    trigger.style.transform = "none";
    trigger.style.display = disableEdge ? "none" : "block";

    // Rebuild extra trigger zones
    extraTriggerEls.forEach((el) => el.remove());
    extraTriggerEls = [];
    const extras = Array.isArray(settings.extraTriggers) ? settings.extraTriggers : [];
    for (const tr of extras) {
      const el = document.createElement("div");
      el.className = "trigger" + (isOpen ? " disabled" : "");
      const exRight = tr.position === "right";
      const exDisable = tr.triggerMode === "icon" || (windowed && Boolean(tr.disableInWindowed));
      const exW = windowed
        ? Math.max(1, Number(tr.triggerWidthWindowed) || 3)
        : Math.max(1, Number(tr.triggerWidth) || 3);
      const exH = Math.min(100, Math.max(5, Number(tr.triggerHeight) || 100));
      const exTop = Math.min(100 - exH, Math.max(0, Number(tr.triggerTop) || 0));
      el.style.left = exRight ? "auto" : "0";
      el.style.right = exRight ? "0" : "auto";
      el.style.width = `${exW}px`;
      el.style.top = `${exTop}vh`;
      el.style.bottom = "auto";
      el.style.height = `${exH}vh`;
      el.style.transform = "none";
      el.style.display = exDisable ? "none" : "block";
      const mode = tr.triggerMode || "mouseover";
      el.addEventListener("mouseenter", () => {
        if (isOpen || mode !== "mouseover") return;
        if (openTimer) clearTimeout(openTimer);
        const delay = Math.max(0, Number(settings.openDelay) || 0);
        openTimer = setTimeout(() => {
          openTimer = null;
          openSidebar();
        }, delay);
      });
      el.addEventListener("mouseleave", () => {
        if (openTimer) {
          clearTimeout(openTimer);
          openTimer = null;
        }
      });
      el.addEventListener("click", (e) => {
        if (mode === "click") {
          e.preventDefault();
          e.stopPropagation();
          openSidebar();
        }
      });
      el.addEventListener("contextmenu", (e) => {
        if (mode === "rightclick") {
          e.preventDefault();
          e.stopPropagation();
          openSidebar();
        }
      });
      el.addEventListener("dragenter", (e) => {
        if (isOpen) return;
        e.preventDefault();
        if (openTimer) clearTimeout(openTimer);
        const delay = Math.min(180, Math.max(0, Number(settings.openDelay ?? 120)));
        openTimer = setTimeout(() => {
          openTimer = null;
          openSidebar();
        }, delay);
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!isOpen && !openTimer) openSidebar();
      });
      el.addEventListener("dragleave", () => {
        if (openTimer) {
          clearTimeout(openTimer);
          openTimer = null;
        }
      });
      shadow.appendChild(el);
      extraTriggerEls.push(el);
    }

    const sbWidth = Math.min(950, Math.max(260, Number(settings.sidebarWidth) || 460));
    iframe.style.width = `${sbWidth}px`;
    resizeKnob.textContent = isRight ? "←" : "→";
    resizeHandle.classList.toggle("right", isRight);
    if (isRight) {
      resizeHandle.style.left = "auto";
      resizeHandle.style.right = `${sbWidth - 36}px`;
    } else {
      resizeHandle.style.right = "auto";
      resizeHandle.style.left = `${sbWidth - 36}px`;
    }
    iframe.style.background = settings.bgColor || "#18191c";
    const ms = Math.max(0, Number(settings.transitionMs ?? 160));
    iframe.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;

    const op = Math.min(0.85, Math.max(0, Number(settings.backdropOpacity ?? 0.25)));
    backdrop.style.background = `rgba(0, 0, 0, ${op})`;
    backdrop.style.transition = `opacity ${ms}ms ease`;
  }

  function clearAllTimers() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer() {
    if (!isOpen) return;
    if (idleTimer) clearTimeout(idleTimer);
    const ms = Number(settings.idleTimeout);
    if (ms > 0) {
      idleTimer = setTimeout(() => {
        closeSidebar();
      }, ms);
    }
  }

  function openSidebar() {
    if (!isSiteAllowed()) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (!isOpen) {
      isOpen = true;
      trigger.classList.add("disabled");
      extraTriggerEls.forEach((el) => el.classList.add("disabled"));
      iframe.classList.add("open");
      resizeHandle.classList.add("open");
      if (Number(settings.backdropOpacity) > 0) {
        backdrop.classList.add("open");
      }
      if (settings.preventPageScroll) {
        prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
      }
      iframe.contentWindow?.postMessage(
        { type: "SIDEBAR_OPENED", host: location.hostname || "", url: location.href || "" },
        "*"
      );
    }
    resetIdleTimer();
  }

  function closeSidebar() {
    clearAllTimers();
    if (!isOpen) return;
    isOpen = false;
    iframe.classList.remove("open");
    resizeHandle.classList.remove("open");
    backdrop.classList.remove("open");
    if (settings.preventPageScroll) {
      document.documentElement.style.overflow = prevOverflow;
    }
    const waitMs = Math.max(50, (Number(settings.transitionMs) || 160) + 20);
    setTimeout(() => {
      if (!isOpen) {
        trigger.classList.remove("disabled");
        extraTriggerEls.forEach((el) => el.classList.remove("disabled"));
      }
    }, waitMs);
  }

  trigger.addEventListener("mouseenter", () => {
    if (isOpen || settings.triggerMode !== "mouseover") return;
    if (openTimer) clearTimeout(openTimer);
    const delay = Math.max(0, Number(settings.openDelay) || 0);
    openTimer = setTimeout(() => {
      openTimer = null;
      openSidebar();
    }, delay);
  });

  trigger.addEventListener("mouseleave", () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  });

  trigger.addEventListener("dragenter", (e) => {
    if (isOpen) return;
    e.preventDefault();
    if (openTimer) clearTimeout(openTimer);
    const delay = Math.min(180, Math.max(0, Number(settings.openDelay ?? 120)));
    openTimer = setTimeout(() => {
      openTimer = null;
      openSidebar();
    }, delay);
  });

  trigger.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!isOpen && !openTimer) {
      openSidebar();
    }
  });

  trigger.addEventListener("dragleave", () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  });

  trigger.addEventListener("click", (e) => {
    if (settings.triggerMode === "click") {
      e.preventDefault();
      e.stopPropagation();
      openSidebar();
    }
  });

  trigger.addEventListener("contextmenu", (e) => {
    if (settings.triggerMode === "rightclick") {
      e.preventDefault();
      e.stopPropagation();
      openSidebar();
    }
  });

  backdrop.addEventListener("mousedown", () => {
    if (isOpen) closeSidebar();
  });

  iframe.addEventListener("mouseenter", () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    resetIdleTimer();
  });

  iframe.addEventListener("dragover", () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    resetIdleTimer();
  });

  let isResizingWidth = false;
  let resizeStartX = 0;
  let resizeStartWidth = 460;

  resizeHandle.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    isResizingWidth = true;
    resizeStartX = e.clientX;
    resizeStartWidth = Math.min(950, Math.max(260, Number(settings.sidebarWidth) || 460));
    resizeHandle.classList.add("dragging");
    iframe.style.pointerEvents = "none";
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    resetIdleTimer();
  });

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!isResizingWidth) return;
      const isRight = settings.position === "right";
      const dx = e.clientX - resizeStartX;
      const rawW = isRight ? resizeStartWidth - dx : resizeStartWidth + dx;
      const nextW = Math.round(Math.min(950, Math.max(260, rawW)));
      settings.sidebarWidth = nextW;
      iframe.style.width = `${nextW}px`;
      if (isRight) {
        resizeHandle.style.right = `${nextW - 36}px`;
      } else {
        resizeHandle.style.left = `${nextW - 36}px`;
      }
      resetIdleTimer();
    },
    { signal }
  );

  window.addEventListener(
    "mouseup",
    () => {
      if (!isResizingWidth) return;
      isResizingWidth = false;
      resizeHandle.classList.remove("dragging");
      iframe.style.pointerEvents = "";
      try {
        chrome.storage.sync.set({ sidebarWidth: settings.sidebarWidth });
      } catch {
        // Ignore invalidated context
      }
    },
    { signal }
  );

  resizeHandle.addEventListener("mouseenter", () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    resetIdleTimer();
  });

  resizeHandle.addEventListener("mouseleave", (e) => {
    if (!isOpen || isResizingWidth || e.relatedTarget === iframe) return;
    if (closeTimer) clearTimeout(closeTimer);
    const delay = Math.max(0, Number(settings.closeDelay ?? 160));
    closeTimer = setTimeout(() => {
      closeSidebar();
    }, delay);
  });

  iframe.addEventListener("mouseleave", (e) => {
    if (!isOpen || isResizingWidth || e.relatedTarget === resizeHandle) return;
    if (closeTimer) clearTimeout(closeTimer);
    const delay = Math.max(0, Number(settings.closeDelay ?? 160));
    closeTimer = setTimeout(() => {
      closeSidebar();
    }, delay);
  });

  window.addEventListener("resize", () => applySettings(), { signal });

  window.addEventListener(
    "blur",
    () => {
      setTimeout(() => {
        // Only close if the browser window/tab actually lost focus (not when focus moved into our shadow-DOM iframe)
        if (isOpen && !document.hasFocus()) {
          closeSidebar();
        }
      }, 80);
    },
    { signal }
  );

  document.addEventListener(
    "mousedown",
    (e) => {
      if (isOpen && e.target !== host) {
        closeSidebar();
      }
    },
    { capture: true, signal }
  );

  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "SIDEBAR_ACTIVITY") {
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        resetIdleTimer();
      } else if (data.type === "CLOSE_SIDEBAR") {
        closeSidebar();
      }
    },
    { signal }
  );

  const onRuntimeMessage = (msg) => {
    if (msg?.type === "TOGGLE_SIDEBAR") {
      if (isOpen) closeSidebar();
      else openSidebar();
    }
  };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (res) => {
    settings = { ...DEFAULT_SETTINGS, ...res };
    applySettings();
  });

  const onStorageChanged = (changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) {
      settings[k] = v.newValue;
    }
    applySettings();
  };
  chrome.storage.onChanged.addListener(onStorageChanged);

  window.__bsProCleanup = () => {
    clearAllTimers();
    if (isOpen && settings.preventPageScroll) {
      document.documentElement.style.overflow = prevOverflow;
    }
    ac.abort();
    try {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch {
      // Ignore if context already invalidated
    }
    host.remove();
  };
})();
