// ==UserScript==
// @name         微信读书网页版 MiMo-TTS 自动听书（原生逐字高亮版）
// @namespace    https://weread.qq.com/
// @version      3.0.0
// @description  直取微信读书内存排版对象，调用原生highLightObjs实现100%精准逐字荧光笔跟读，直连小米MiMo-V2.5-TTS朗读并自动跨章
// @match        https://weread.qq.com/web/reader/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.xiaomimimo.com
// ==/UserScript==

(() => {
  'use strict';

  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ============================================================================
  // 1. document-start 阶段：无感拦截微信读书阅读器 Vue 组件实例
  // ============================================================================
  if (!pageWin.__wrProtoHooked) {
    pageWin.__wrProtoHooked = true;
    const ObjProto = pageWin.Object.prototype;
    try {
      pageWin.Object.defineProperty(ObjProto, 'highLightObjs', {
        configurable: true,
        set(val) {
          pageWin.Object.defineProperty(this, 'highLightObjs', {
            value: val,
            writable: true,
            enumerable: true,
            configurable: true
          });
          if (this && (this.$store || this._isVue || typeof this.copyObjsText === 'function')) {
            pageWin.__wrReaderVM = this;
            console.log('[MiMo-TTS] 已成功绑定微信读书原生阅读器实例');
          }
        }
      });
    } catch (e) {
      console.warn('[MiMo-TTS] Hook 注册失败:', e);
    }
  }

  // ============================================================================
  // 2. 等待 DOM 就绪后挂载控制面板与业务逻辑
  // ============================================================================
  function initUI() {
    if (!document.body) return setTimeout(initUI, 100);
    document.getElementById('wr-tts-panel')?.remove();
    document.getElementById('wr-tts-style')?.remove();

    // 美化微信读书原生 .wr_highlight_bg 高亮样式（支持自定义颜色，柔和荧光笔质感）
    const styleEl = document.createElement('style');
    styleEl.id = 'wr-tts-style';
    document.head.appendChild(styleEl);

    function applyHighlightColor(hex) {
      const cleanHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffd028';
      const r = parseInt(cleanHex.slice(1, 3), 16);
      const g = parseInt(cleanHex.slice(3, 5), 16);
      const b = parseInt(cleanHex.slice(5, 7), 16);
      styleEl.textContent = `
        .wr_highlight_bg {
          background-color: rgba(${r}, ${g}, ${b}, 0.28) !important;
          border-radius: 3px !important;
          transition: all 0.2s ease !important;
        }
      `;
    }
    const savedColor = localStorage.getItem('wr_tts_hl_color') || '#ffd028';
    applyHighlightColor(savedColor);

    const MIMO_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
    const VOICES = [
      {
        id: 'bingtang',
        name: '冰糖（MiMo-v2.5 中文）',
        model: 'mimo-v2.5-tts',
        voice: '冰糖',
        prompt: '请用自然流畅、清晰温柔的有声书旁白语气朗读'
      },
      {
        id: 'moli',
        name: '茉莉（MiMo-v2.5 中文）',
        model: 'mimo-v2.5-tts',
        voice: '茉莉',
        prompt: '请用自然流畅、沉稳清晰的有声书旁白语气朗读'
      },
      {
        id: 'mia',
        name: 'Mia（MiMo-v2.5）',
        model: 'mimo-v2.5-tts',
        voice: 'Mia',
        prompt: '请用自然清晰的有声书旁白语气朗读'
      },
      {
        id: 'voicedesign_male',
        name: '定制沉稳男声（捏音）',
        model: 'mimo-v2.5-tts-voicedesign',
        voice: null,
        prompt: '一位声音低沉稳重、吐字清晰、富有故事感的中年男性有声书播音员，语速平稳自然。'
      }
    ];

    let isPlaying = false;
    let audioCtx = null;
    let currentSource = null;
    let currentHtmlAudio = null;
    let currentPlayResolve = null;
    let skipDirection = 0; // -1 上一句, 1 下一句
    let stopTimerId = null;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cleanText = (s) => (s || '').replace(/[\u200B-\u200D\uFEFF]/g, '');

    function getVM() {
      return pageWin.__wrReaderVM || null;
    }

    // ============================================================================
    // 3. 原生内存直取：获取当前章节文字对象数组并按句切分（带精确 objs 映射）
    // ============================================================================
    function buildChapterChunks(fromViewportTop = true, anchorText = '') {
      const vm = getVM();
      if (!vm || typeof vm.findObjsWithPoints !== 'function') {
        throw new Error('未捕获到阅读器实例，请刷新页面后重试');
      }

      // 获取整章所有渲染对象
      const allObjs = vm.findObjsWithPoints({ x: 0, y: 0 }, { x: 4000, y: 120000 }) || [];
      if (!allObjs.length) return [];

      // 先把所有带文字的 obj 按句子分组，确保每句都持有精确的 objs 子数组
      const chunks = [];
      let curObjs = [];
      let curText = '';

      const flushChunk = () => {
        const t = curText.trim();
        if (t && curObjs.length) {
          chunks.push({ text: t, objs: curObjs });
        }
        curObjs = [];
        curText = '';
      };

      for (let i = 0; i < allObjs.length; i++) {
        const obj = allObjs[i];
        const ch = cleanText(vm.getTextFromObjs([obj]));
        if (!ch) continue;
        curObjs.push(obj);
        curText += ch;

        const isNewline = /\n$/.test(ch);
        const endsWithSentence = /[。！？!?]$/.test(ch);
        const endsWithPause = /[；;，,：:]$/.test(ch);
        // 尽量按完整自然段或约 110~180 字切分（兼顾连贯性与合成速度）
        if (
          (isNewline && curText.length >= 50) ||
          (endsWithSentence && curText.length >= 110) ||
          (endsWithPause && curText.length >= 160) ||
          curText.length >= 200
        ) {
          flushChunk();
        }
      }
      flushChunk();

      if (!chunks.length) return [];

      // 若用户手动划选了某句话，定位到包含该文本的句子作为起点
      if (anchorText) {
        const key = cleanText(anchorText).trim().slice(0, 16);
        if (key) {
          const idx = chunks.findIndex((c) => c.text.includes(key));
          if (idx !== -1) return chunks.slice(idx);
        }
      }

      // 若从当前阅读视口位置起读，找视口顶部第一个可见 obj 所在的句子
      if (fromViewportTop && typeof vm.clientXY2RenderAreaXY === 'function') {
        const topAreaPt = vm.clientXY2RenderAreaXY({ x: 80, y: 76 });
        const visibleObjs = vm.findObjsWithPoints(topAreaPt, { x: 4000, y: 120000 }) || [];
        if (visibleObjs.length) {
          const firstVisibleText = cleanText(vm.getTextFromObjs(visibleObjs.slice(0, 15))).trim().slice(0, 12);
          if (firstVisibleText) {
            const startIdx = chunks.findIndex((c) => c.text.includes(firstVisibleText) || firstVisibleText.includes(c.text.slice(0, 10)));
            if (startIdx !== -1) return chunks.slice(startIdx);
          }
        }
      }

      return chunks;
    }

    // 获取当前用户鼠标划选的文字（不污染剪贴板）
    function captureCurrentUserSelection() {
      const vm = getVM();
      const copyBtn = document.querySelector('.wr_copy');
      if (copyBtn) {
        let grabbed = '';
        const origExec = document.execCommand.bind(document);
        document.execCommand = function (cmd, ...args) {
          if (cmd === 'copy') {
            grabbed = cleanText((document.getSelection() || pageWin.getSelection())?.toString() || '');
            return true;
          }
          return origExec(cmd, ...args);
        };
        try {
          copyBtn.click();
        } finally {
          document.execCommand = origExec;
        }
        if (vm && typeof vm.clearSelection === 'function') vm.clearSelection();
        (document.getSelection() || pageWin.getSelection())?.removeAllRanges();
        return grabbed.trim();
      }
      return cleanText((document.getSelection() || pageWin.getSelection())?.toString() || '').trim();
    }

    // ============================================================================
    // 4. 调用原生 highLightObjs 逐字精准高亮 + 自动平滑跟随
    // ============================================================================
    function highlightSentence(chunk) {
      const vm = getVM();
      if (!vm || typeof vm.highLightObjs !== 'function') return;

      if (chkHighlight.checked && chunk && chunk.objs && chunk.objs.length) {
        try {
          vm.highLightObjs(chunk.objs);
        } catch (e) {
          console.warn('[MiMo-TTS] 原生高亮失败:', e);
        }
      } else if (typeof vm.clearHighLight === 'function') {
        vm.clearHighLight();
      }

      if (chkFollow.checked) {
        setTimeout(() => {
          const hlEl = document.querySelector('.wr_highlight_bg');
          if (hlEl) {
            const rect = hlEl.getBoundingClientRect();
            const vh = pageWin.innerHeight || 800;
            if (rect.top > vh * 0.56 || rect.top < 64) {
              pageWin.scrollBy({ top: rect.top - Math.round(vh * 0.30), behavior: 'smooth' });
            }
          } else if (chunk?.objs?.[0] && typeof vm.scrollToObj === 'function') {
            // 若关闭了高亮但开启了自动跟滚，用原生 scrollToObj 兜底
            try { vm.scrollToObj(chunk.objs[0]); } catch (_) {}
          }
        }, 30);
      }
    }

    function clearNativeHighlight() {
      const vm = getVM();
      if (vm && typeof vm.clearHighLight === 'function') {
        try { vm.clearHighLight(); } catch (_) {}
      }
    }

    // ============================================================================
    // 5. 小米 MiMo-V2.5-TTS 请求与音频播放（变速不变调）
    // ============================================================================
    function base64ToArrayBuffer(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }

    function getApiKey() {
      return (localStorage.getItem('wr_mimo_api_key') || '').trim();
    }

    function promptForApiKey() {
      const current = getApiKey();
      const input = window.prompt('请输入你的小米 MiMo API Key（仅保存在本地浏览器）：', current);
      if (input !== null) localStorage.setItem('wr_mimo_api_key', input.trim());
      return getApiKey();
    }

    function fetchMiMoAudioBuffer(text, voiceCfg) {
      const apiKey = getApiKey();
      if (!apiKey) return Promise.reject(new Error('请先点击 🔑 设置 MiMo API Key'));

      const audioOpt = { format: 'wav' };
      if (voiceCfg.voice) audioOpt.voice = voiceCfg.voice;

      const payload = JSON.stringify({
        model: voiceCfg.model,
        messages: [
          { role: 'user', content: voiceCfg.prompt },
          { role: 'assistant', content: text }
        ],
        audio: audioOpt
      });

      const reqPromise =
        typeof GM_xmlhttpRequest === 'function'
          ? new Promise((resolve, reject) => {
              GM_xmlhttpRequest({
                method: 'POST',
                url: MIMO_ENDPOINT,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`
                },
                data: payload,
                timeout: 28000,
                responseType: 'json',
                onload: (res) => {
                  try {
                    const data = typeof res.response === 'object' && res.response !== null
                      ? res.response
                      : JSON.parse(res.responseText || '{}');
                    if (res.status !== 200) {
                      console.error('[MiMo-TTS 报错详情]', res.status, JSON.stringify(data));
                      const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
                      return reject(new Error(msg));
                    }
                    const b64 = data?.choices?.[0]?.message?.audio?.data;
                    if (!b64) return reject(new Error('接口未返回音频数据'));
                    resolve({ b64, arrayBuffer: base64ToArrayBuffer(b64) });
                  } catch (e) {
                    reject(new Error('解析 MiMo 响应失败: ' + e.message));
                  }
                },
                ontimeout: () => reject(new Error('MiMo 请求超时')),
                onabort: () => reject(new Error('MiMo 请求被中止')),
                onerror: () => reject(new Error('网络错误，无法连接 api.xiaomimimo.com'))
              });
            })
          : fetch(MIMO_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: payload
            }).then(async (res) => {
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
              const b64 = data?.choices?.[0]?.message?.audio?.data;
              if (!b64) throw new Error('接口未返回音频数据');
              return { b64, arrayBuffer: base64ToArrayBuffer(b64) };
            });

      const hardTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求 30s 超时')), 30000)
      );
      return Promise.race([reqPromise, hardTimeout]);
    }

    async function fetchWithRetry(text, voiceCfg, retries = 2) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fetchMiMoAudioBuffer(text, voiceCfg);
        } catch (err) {
          if (attempt === retries || err.message.includes('Key')) throw err;
          await sleep(400);
        }
      }
    }

    function ensureAudioContext() {
      if (!audioCtx) {
        const Ctx = pageWin.AudioContext || pageWin.webkitAudioContext || window.AudioContext;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }

    function stopAudio() {
      if (currentHtmlAudio) {
        try {
          currentHtmlAudio.onended = null;
          currentHtmlAudio.onerror = null;
          currentHtmlAudio.pause();
          currentHtmlAudio.src = '';
        } catch (_) {}
        currentHtmlAudio = null;
      }
      if (currentSource) {
        try {
          currentSource.onended = null;
          currentSource.stop();
          currentSource.disconnect();
        } catch (_) {}
        currentSource = null;
      }
      if (currentPlayResolve) {
        currentPlayResolve('stopped');
        currentPlayResolve = null;
      }
    }

    async function playAudioPayload(payload, speed) {
      stopAudio();
      try {
        return await new Promise((resolve, reject) => {
          const audio = new Audio(`data:audio/wav;base64,${payload.b64}`);
          audio.preservesPitch = true;
          audio.mozPreservesPitch = true;
          audio.webkitPreservesPitch = true;
          audio.playbackRate = speed;
          currentHtmlAudio = audio;
          currentPlayResolve = resolve;
          audio.onended = () => {
            if (currentHtmlAudio === audio) currentHtmlAudio = null;
            if (currentPlayResolve === resolve) currentPlayResolve = null;
            resolve('ended');
          };
          audio.onerror = () => {
            if (currentHtmlAudio === audio) currentHtmlAudio = null;
            if (currentPlayResolve === resolve) currentPlayResolve = null;
            reject(new Error('HTMLAudio blocked'));
          };
          audio.play().catch((err) => {
            if (currentHtmlAudio === audio) currentHtmlAudio = null;
            if (currentPlayResolve === resolve) currentPlayResolve = null;
            reject(err);
          });
        });
      } catch (_) {
        const ctx = ensureAudioContext();
        const decoded = await ctx.decodeAudioData(payload.arrayBuffer.slice(0));
        return new Promise((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = speed;
          source.connect(ctx.destination);
          currentSource = source;
          currentPlayResolve = resolve;
          source.onended = () => {
            if (currentSource === source) currentSource = null;
            if (currentPlayResolve === resolve) currentPlayResolve = null;
            resolve('ended');
          };
          source.start(0);
        });
      }
    }

    // ============================================================================
    // 6. 播放队列与跨章控制
    // ============================================================================
    let currentSpeakCtx = null;

    // 窗口缩放时自动重新定位当前句子的原生坐标（解决 resize 后高亮偏移）
    let resizeTimer = null;
    pageWin.addEventListener('resize', () => {
      if (!isPlaying || !currentSpeakCtx) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!isPlaying || !currentSpeakCtx) return;
        try {
          const curText = currentSpeakCtx.chunks[currentSpeakCtx.index]?.text;
          if (!curText) return;
          const newChunks = buildChapterChunks(false, curText);
          if (newChunks.length) {
            currentSpeakCtx.chunks = newChunks;
            currentSpeakCtx.index = 0;
            currentSpeakCtx.preloadCache.clear();
            highlightSentence(newChunks[0]);
          }
        } catch (_) {}
      }, 650);
    });

    async function speakChunks(chunks, voiceCfg) {
      if (!chunks.length) return;
      const preloadCache = new Map();
      const ctxState = { chunks, index: 0, preloadCache };
      currentSpeakCtx = ctxState;

      const getOrFetch = (idx) => {
        const list = ctxState.chunks;
        if (idx < 0 || idx >= list.length) return null;
        if (!preloadCache.has(idx)) {
          preloadCache.set(
            idx,
            fetchWithRetry(list[idx].text, voiceCfg, 2).then(
              (buf) => ({ ok: true, buf }),
              (err) => {
                console.warn('[MiMo-TTS] 合成失败:', list[idx].text, err);
                preloadCache.delete(idx);
                return { ok: false, err };
              }
            )
          );
        }
        return preloadCache.get(idx);
      };

      let consecutiveFails = 0;
      while (ctxState.index < ctxState.chunks.length && isPlaying) {
        const i = ctxState.index;
        const list = ctxState.chunks;
        skipDirection = 0;
        statusEl.textContent = `合成中 (${i + 1}/${list.length})`;

        if (i + 1 < list.length) getOrFetch(i + 1);

        const res = await getOrFetch(i);
        if (!isPlaying) break;

        if (!res || !res.ok || !res.buf) {
          consecutiveFails += 1;
          if (i === 0 || consecutiveFails >= 2) {
            throw new Error(res?.err?.message || '合成失败');
          }
          ctxState.index += 1;
          continue;
        }

        consecutiveFails = 0;
        const speed = parseFloat(speedSel.value);
        statusEl.textContent = `朗读 ${i + 1}/${list.length}`;
        highlightSentence(list[i]);

        let playStatus = 'ended';
        try {
          playStatus = await playAudioPayload(res.buf, speed);
        } catch (err) {
          console.warn('[MiMo-TTS] 播放出错，跳过:', err);
        }

        if (!isPlaying) break;
        if (skipDirection === -1) {
          ctxState.index = Math.max(0, ctxState.index - 1);
        } else if (skipDirection === 1) {
          ctxState.index += 1;
        } else {
          // 正常播完一段后停顿 450ms，留出自然气口
          if (playStatus === 'ended') await sleep(450);
          ctxState.index += 1;
        }
      }
      currentSpeakCtx = null;
      clearNativeHighlight();
    }

    async function goToNextChapter() {
      const vm = getVM();
      const prevSig = vm && vm.findObjsWithPoints ? vm.getTextFromObjs((vm.findObjsWithPoints({ x: 0, y: 0 }, { x: 4000, y: 5000 }) || []).slice(0, 20)) : '';
      const nextBtn = document.querySelector('.readerFooter_button');
      if (nextBtn) {
        nextBtn.click();
      } else if (vm && typeof vm.handleNextChapter === 'function') {
        vm.handleNextChapter();
      } else {
        return false;
      }

      // 等待新章节渲染完毕
      for (let t = 0; t < 10; t++) {
        await sleep(600);
        if (!isPlaying) return false;
        const curObjs = vm && vm.findObjsWithPoints ? vm.findObjsWithPoints({ x: 0, y: 0 }, { x: 4000, y: 5000 }) || [] : [];
        const curSig = curObjs.length ? vm.getTextFromObjs(curObjs.slice(0, 20)) : '';
        if (curSig && curSig !== prevSig) return true;
      }
      return false;
    }

    function clearStopTimer() {
      if (stopTimerId) {
        clearTimeout(stopTimerId);
        stopTimerId = null;
      }
    }

    function setupStopTimer() {
      clearStopTimer();
      const val = timerSel.value;
      if (val === '0' || val === 'chapter') return;
      const mins = parseInt(val, 10);
      if (mins > 0) {
        stopTimerId = setTimeout(() => {
          if (isPlaying) stopAll(`已到定时（${mins}分钟），自动停止`);
        }, mins * 60 * 1000);
      }
    }

    function stopAll(msg = '已暂停') {
      isPlaying = false;
      clearStopTimer();
      stopAudio();
      clearNativeHighlight();
      btnPlay.textContent = '▶ 开始';
      statusEl.textContent = msg;
    }

    async function playLoop(initialAnchor = '') {
      let isFirstChapter = true;
      let anchor = initialAnchor;
      while (isPlaying) {
        try {
          statusEl.textContent = '正在读取本章排版...';
          const chunks = buildChapterChunks(isFirstChapter, anchor);
          isFirstChapter = false;
          anchor = '';

          if (!chunks.length) {
            stopAll('未读取到正文内容');
            break;
          }

          const voiceCfg = VOICES.find((v) => v.id === voiceSel.value) || VOICES[0];
          await speakChunks(chunks, voiceCfg);
          if (!isPlaying) break;

          if (timerSel.value === 'chapter') {
            stopAll('本章朗读完成');
            break;
          }

          statusEl.textContent = '正在切换下一章...';
          const ok = await goToNextChapter();
          if (!ok) {
            stopAll('已到全书末尾');
            break;
          }
        } catch (err) {
          console.error('[MiMo-TTS]', err);
          stopAll(`错误: ${err.message}`);
          break;
        }
      }
    }

    // ============================================================================
    // 7. 构建紧凑两行可拖拽长条控制面板
    // ============================================================================
    const rawSavedVoice = localStorage.getItem('wr_mimo_voice');
    const savedVoice = VOICES.some((v) => v.id === rawSavedVoice) ? rawSavedVoice : VOICES[0].id;
    const savedSpeed = localStorage.getItem('wr_tts_speed') || '1.15';

    const panel = document.createElement('div');
    panel.id = 'wr-tts-panel';
    panel.style.cssText =
      'position:fixed;right:24px;bottom:24px;z-index:99999;background:rgba(28,28,30,0.94);color:#fff;' +
      'padding:8px 12px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:12px;' +
      'display:flex;flex-direction:column;gap:6px;font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(8px);user-select:none;';

    // 恢复上次拖拽保存的位置
    const savedPos = localStorage.getItem('wr_tts_pos');
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        if (typeof left === 'number' && typeof top === 'number') {
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
          panel.style.left = `${Math.max(0, Math.min(pageWin.innerWidth - 120, left))}px`;
          panel.style.top = `${Math.max(0, Math.min(pageWin.innerHeight - 60, top))}px`;
        }
      } catch (_) {}
    }

    panel.innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;white-space:nowrap;">
        <span id="wr-tts-drag" title="按住拖拽移动位置" style="cursor:grab;color:#8e8e93;padding:2px 4px;font-size:14px;line-height:1;">⠿</span>
        <button id="wr-tts-btn" style="padding:5px 10px;border:none;border-radius:6px;background:#1677ff;color:#fff;cursor:pointer;font-weight:600;font-size:12px;">▶ 开始</button>
        <button id="wr-tts-sel" title="从当前鼠标划选的文字开始往后连续朗读" style="padding:5px 9px;border:none;border-radius:6px;background:#2e7d32;color:#fff;cursor:pointer;font-size:12px;">🎯 从选中起读</button>
        <button id="wr-tts-next" style="padding:5px 9px;border:none;border-radius:6px;background:#3a3a3c;color:#fff;cursor:pointer;font-size:12px;">⏭ 下一章</button>
        <button id="wr-tts-key" title="设置小米 MiMo API Key" style="padding:5px 8px;border:none;border-radius:6px;background:#48484a;color:#fff;cursor:pointer;font-size:12px;">🔑</button>
        <span id="wr-tts-status" style="color:#a1a1a6;font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;margin-left:2px;">${getApiKey() ? '就绪' : '请先设🔑'}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;white-space:nowrap;">
        <select id="wr-tts-voice" style="background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:5px;padding:3px 6px;font-size:12px;max-width:140px;"></select>
        <select id="wr-tts-speed" style="background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:5px;padding:3px 4px;font-size:12px;">
          <option value="0.9">0.9x</option>
          <option value="1.0">1.0x</option>
          <option value="1.15">1.15x</option>
          <option value="1.25">1.25x</option>
          <option value="1.4">1.4x</option>
          <option value="1.6">1.6x</option>
        </select>
        <select id="wr-tts-timer" title="定时停止" style="background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:5px;padding:3px 4px;font-size:12px;">
          <option value="0">不定时</option>
          <option value="chapter">仅本章</option>
          <option value="15">15分钟</option>
          <option value="30">30分钟</option>
          <option value="60">60分钟</option>
        </select>
        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;color:#ccc;font-size:11px;"><input type="checkbox" id="wr-tts-follow" checked>跟滚</label>
        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;color:#ccc;font-size:11px;"><input type="checkbox" id="wr-tts-hl" checked>高亮</label>
        <input type="color" id="wr-tts-hl-color" title="自定义高亮颜色" value="${savedColor}" style="width:18px;height:18px;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;">
      </div>
    `;
    document.body.appendChild(panel);

    // 实现拖拽功能（按住 ⠿ 或面板空白区拖动）
    const dragHandle = document.getElementById('wr-tts-drag');
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const onDragStart = (e) => {
      if (['BUTTON', 'SELECT', 'INPUT', 'LABEL'].includes(e.target.tagName)) return;
      isDragging = true;
      const r = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - r.left;
      dragOffsetY = e.clientY - r.top;
      dragHandle.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      const maxX = (pageWin.innerWidth || window.innerWidth) - panel.offsetWidth;
      const maxY = (pageWin.innerHeight || window.innerHeight) - panel.offsetHeight;
      const x = Math.max(0, Math.min(maxX, e.clientX - dragOffsetX));
      const y = Math.max(0, Math.min(maxY, e.clientY - dragOffsetY));
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };
    const onDragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      dragHandle.style.cursor = 'grab';
      const r = panel.getBoundingClientRect();
      localStorage.setItem('wr_tts_pos', JSON.stringify({ left: r.left, top: r.top }));
    };
    panel.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    const btnPlay = document.getElementById('wr-tts-btn');
    const btnSel = document.getElementById('wr-tts-sel');
    const btnKey = document.getElementById('wr-tts-key');
    const btnNext = document.getElementById('wr-tts-next');
    const voiceSel = document.getElementById('wr-tts-voice');
    const speedSel = document.getElementById('wr-tts-speed');
    const timerSel = document.getElementById('wr-tts-timer');
    const chkFollow = document.getElementById('wr-tts-follow');
    const chkHighlight = document.getElementById('wr-tts-hl');
    const colorPicker = document.getElementById('wr-tts-hl-color');
    const statusEl = document.getElementById('wr-tts-status');

    VOICES.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      if (v.id === savedVoice) opt.selected = true;
      voiceSel.appendChild(opt);
    });
    speedSel.value = savedSpeed;

    chkHighlight.onchange = () => { if (!chkHighlight.checked) clearNativeHighlight(); };
    colorPicker.oninput = () => {
      localStorage.setItem('wr_tts_hl_color', colorPicker.value);
      applyHighlightColor(colorPicker.value);
    };
    voiceSel.onchange = () => localStorage.setItem('wr_mimo_voice', voiceSel.value);
    speedSel.onchange = () => {
      const sp = parseFloat(speedSel.value);
      localStorage.setItem('wr_tts_speed', speedSel.value);
      if (currentHtmlAudio) currentHtmlAudio.playbackRate = sp;
      if (currentSource) currentSource.playbackRate.value = sp;
    };
    timerSel.onchange = () => { if (isPlaying) setupStopTimer(); };

    btnKey.onclick = () => {
      const k = promptForApiKey();
      statusEl.textContent = k ? 'Key已存' : '未设Key';
    };

    btnPlay.onclick = () => {
      if (isPlaying) {
        stopAll('已暂停');
      } else {
        if (!getApiKey() && !promptForApiKey()) {
          statusEl.textContent = '需设Key';
          return;
        }
        ensureAudioContext();
        const anchor = captureCurrentUserSelection();
        isPlaying = true;
        btnPlay.textContent = '⏸ 停止';
        setupStopTimer();
        playLoop(anchor);
      }
    };

    // 从选中开始往后连续朗读（并支持在播放中随时点它切换新起点）
    btnSel.onclick = async () => {
      const selText = captureCurrentUserSelection();
      if (!selText) {
        statusEl.textContent = '请先划选文字';
        return;
      }
      if (!getApiKey() && !promptForApiKey()) {
        statusEl.textContent = '需设Key';
        return;
      }
      ensureAudioContext();
      if (isPlaying) {
        isPlaying = false;
        stopAudio();
        clearNativeHighlight();
        await sleep(80);
      }
      isPlaying = true;
      btnPlay.textContent = '⏸ 停止';
      setupStopTimer();
      playLoop(selText);
    };

    btnNext.onclick = async () => {
      stopAudio();
      clearNativeHighlight();
      if (isPlaying) {
        await goToNextChapter();
        playLoop();
      } else {
        const nextBtn = document.querySelector('.readerFooter_button');
        if (nextBtn) nextBtn.click();
        else getVM()?.handleNextChapter?.();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
