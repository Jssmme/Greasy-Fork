// ==UserScript==
// @name         AI Chat Screenshot
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      1.0.1
// @description  One-click screenshot buttons for AI chat platforms — capture Q&A pair or entire conversation. Supports Claude, Grok, ChatGPT, DeepSeek
// @author       JSSM
// @match        https://claude.ai/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        https://chatgpt.com/*
// @match        https://chat.deepseek.com/*
// @icon         https://claude.ai/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @require      https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/AI-Chat-Screenshot.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/AI-Chat-Screenshot.user.js
// ==/UserScript==

/* globals htmlToImage */

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  //   PLATFORM DETECTION
  // ──────────────────────────────────────────────
  const HOST = location.hostname;
  const PATH = location.pathname;

  let PLATFORM = 'unknown';
  if (HOST.includes('claude.ai'))                           PLATFORM = 'claude';
  else if (HOST.includes('grok.com') || PATH.includes('grok')) PLATFORM = 'grok';
  else if (HOST.includes('chatgpt.com') || HOST.includes('chat.openai.com')) PLATFORM = 'gpt';
  else if (HOST.includes('chat.deepseek.com'))               PLATFORM = 'deepseek';
  else if (HOST.includes('gemini.google.com'))              PLATFORM = 'gemini';

  // ──────────────────────────────────────────────
  //   CONFIGURATION
  // ──────────────────────────────────────────────
  const CONFIG = {
    scale: 2,
    toastDuration: 2500,
    injectDebounceMs: 300,
  };

  // ══════════════════════════════════════════════
  //   PLATFORM-SPECIFIC DOM RULES
  // ══════════════════════════════════════════════

  const PLATFORMS = {

    // ── Claude ──────────────────────────────────
    claude: {
      /**
       * Check if an element is a message block wrapper.
       * Do NOT use querySelector to check descendants — that matches
       * large ancestor containers (the whole conversation) as long as
       * they *contain* a user/assistant message anywhere inside.
       */
      isMsgBlock(el) {
        if (!el || typeof el.className !== 'string') return false;
        if (el.className.includes('content-visibility')) return true;
        if (el.hasAttribute && el.hasAttribute('data-testid')) {
          const tid = el.getAttribute('data-testid');
          if (tid === 'user-message' || tid === 'assistant-message' || tid === 'conversation-turn') return true;
        }
        return false;
      },

      /**
       * Walk up from el to find the message block wrapper that actually
       * contains the message *content*. Uses height heuristics to skip
       * tiny wrappers (just the action bar) and stop before multi-turn
       * containers.
       */
      closestMsgBlock(el) {
        const actionBarHeight = el.getBoundingClientRect().height || 0;
        let cur = el, lastMatch = null, lastHeight = 0;

        while (cur && cur !== document.body) {
          if (PLATFORMS.claude.isMsgBlock(cur)) {
            const h = cur.getBoundingClientRect().height;
            if (h > actionBarHeight + 40) {
              if (lastMatch === null) {
                lastMatch = cur;
                lastHeight = h;
              } else {
                if (h > lastHeight * 1.5 + 100) break; // jumped to multi-turn container
                lastMatch = cur;
                lastHeight = h;
              }
            }
          }
          cur = cur.parentElement;
        }
        return lastMatch;
      },

      findQAPair(btn) {
        let asst = PLATFORMS.claude.closestMsgBlock(btn);
        if (asst) {
          const user = findPreviousUserBlock(asst, PLATFORMS.claude.isMsgBlock);
          return { userMsg: user, assistantMsg: asst };
        }
        return findTurnByPosition(btn);
      },

      findConversation() {
        return _findConversationByBlocks(PLATFORMS.claude.isMsgBlock);
      },

      // Claude.ai changed role="group" → role="toolbar" in a recent DOM update.
      // Match both for forward + backward compatibility.
      actionBarSelector: '[role="toolbar"][aria-label="Message actions"], [role="group"][aria-label="Message actions"]',
      copyButtonSelector: '[aria-label="Copy"], [data-testid="action-bar-copy"]',
    },

    // ── Grok ────────────────────────────────────
    grok: {
      /** Grok message blocks are divs with id="response-..." */
      isMsgBlock(el) {
        if (!el || !el.id) return false;
        if (el.id.startsWith('response-')) return true;
        if (typeof el.className === 'string' && el.className.includes('message-bubble')) return true;
        return false;
      },

      closestMsgBlock(el) {
        let cur = el;
        while (cur && cur !== document.body) {
          if (PLATFORMS.grok.isMsgBlock(cur)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },

      findQAPair(btn) {
        const actionBar = btn.closest('.action-buttons');
        if (!actionBar) { console.debug('[Grok] No action-bar found'); return null; }

        let asst = actionBar.parentElement;
        console.debug('[Grok] asst (actionBar.parent):', asst?.id, asst?.className?.slice(0,40));
        if (!asst || !PLATFORMS.grok.isMsgBlock(asst)) {
          // Maybe the response-wrapper is grandparent?
          asst = actionBar.parentElement?.parentElement;
          console.debug('[Grok] asst retry (grandparent):', asst?.id, asst?.className?.slice(0,40));
          if (!asst || !PLATFORMS.grok.isMsgBlock(asst)) {
            console.debug('[Grok] asst not a msg block, giving up');
            return null;
          }
        }

        let user = null;
        const lastReply = asst.closest('#last-reply-container');
        console.debug('[Grok] lastReply found:', !!lastReply);

        if (lastReply) {
          const asstGroup = asst.closest('.flex.flex-col.items-center');
          console.debug('[Grok] asstGroup:', asstGroup?.className?.slice(0,40));
          if (asstGroup) {
            const userGroup = asstGroup.previousElementSibling;
            console.debug('[Grok] userGroup:', userGroup?.className?.slice(0,40), 'matches items-center:', userGroup?.matches?.('.flex.flex-col.items-center'));
            if (userGroup && userGroup.matches && userGroup.matches('.flex.flex-col.items-center')) {
              user = userGroup.querySelector('[id^="response-"]');
              console.debug('[Grok] user found in last-reply:', user?.id);
            }
          }
        } else {
          const sib = asst.previousElementSibling;
          console.debug('[Grok] sibling:', sib?.id, sib?.className?.slice(0,40));
          if (sib && PLATFORMS.grok.isMsgBlock(sib) &&
              sib.querySelector('[data-testid="user-message"]')) {
            user = sib;
            console.debug('[Grok] user from sibling:', user?.id);
          }
        }

        console.debug('[Grok] final pair:', { userMsg: user?.id, assistantMsg: asst?.id });
        return { userMsg: user, assistantMsg: asst };
      },

      findConversation() {
        const container = document.querySelector('.relative.flex.w-full.flex-col.items-center');
        if (container) {
          const style = getComputedStyle(container);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') return container;
        }
        const firstResp = document.querySelector('[id^="response-"]');
        if (firstResp) {
          let el = firstResp.parentElement;
          while (el && el !== document.body) {
            const s = getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) return el;
            el = el.parentElement;
          }
        }
        return _fallbackScrollable();
      },

      actionBarSelector: '.action-buttons.justify-between, .action-buttons.last-response',
      copyButtonSelector: '[aria-label="复制"]',
    },

    // ── GPT ──────────────────────────────────────
    gpt: {
      /** Message blocks are sections with data-testid="conversation-turn-N" */
      isMsgBlock(el) {
        if (!el || !el.hasAttribute) return false;
        // Match the section wrapping each turn
        if (el.tagName === 'SECTION' && el.hasAttribute('data-testid') &&
            el.getAttribute('data-testid').startsWith('conversation-turn-')) return true;
        return false;
      },

      closestMsgBlock(el) {
        let cur = el;
        while (cur && cur !== document.body) {
          if (PLATFORMS.gpt.isMsgBlock(cur)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },

      findQAPair(btn) {
        // Find the turn section first
        const section = btn.closest('section[data-testid^="conversation-turn-"]');
        if (!section || section.getAttribute('data-turn') !== 'assistant') return null;
        // Parent div is the turn container, sibling is the user turn
        const asst = section.parentElement;
        if (!asst || !asst.hasAttribute('data-turn-id-container')) return null;
        const user = asst.previousElementSibling;
        if (user && user.hasAttribute && user.hasAttribute('data-turn-id-container') &&
            user.querySelector('section[data-turn="user"]')) {
          return { userMsg: user, assistantMsg: asst };
        }
        return { userMsg: null, assistantMsg: asst };
      },

      findConversation() {
        const first = document.querySelector('section[data-testid^="conversation-turn-"]');
        if (first) {
          let el = first.parentElement;
          while (el && el !== document.body) {
            const s = getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) return el;
            el = el.parentElement;
          }
          // ChatGPT's turns are often inside a non-scrolling wrapper while the
          // actual scrollbar lives on an ancestor (e.g. <main> or the page
          // itself). No overflow:auto element found — fall back to the
          // outermost wrapper that contains ALL conversation turns, so the
          // capture includes the full history rather than just the first
          // screen's worth of mounted/rendered content.
          const allTurns = document.querySelectorAll('section[data-testid^="conversation-turn-"]');
          const lastTurn = allTurns[allTurns.length - 1];
          let common = first.parentElement;
          while (common && !common.contains(lastTurn)) {
            common = common.parentElement;
          }
          if (common) return common;
        }
        return _fallbackScrollable();
      },

      actionBarSelector: '[aria-label="回复操作"]',
      copyButtonSelector: '[data-testid="copy-turn-action-button"]',
    },

    // ── DeepSeek ─────────────────────────────────
    deepseek: {
      /** User blocks: _9663006, Assistant blocks: _4f9bf79 */
      isMsgBlock(el) {
        if (!el || !el.classList) return false;
        if (el.classList.contains('_9663006')) return true;
        if (el.classList.contains('_4f9bf79')) return true;
        return false;
      },

      closestMsgBlock(el) {
        let cur = el;
        while (cur && cur !== document.body) {
          if (PLATFORMS.deepseek.isMsgBlock(cur)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },

      findQAPair(btn) {
        // Assistant action bar → assistant block
        const actionBar = btn.closest('._0a3d93b');
        if (!actionBar) return null;
        const asst = actionBar.closest('._4f9bf79');
        if (!asst) return null;
        // Previous sibling is the user block
        const user = asst.previousElementSibling;
        if (user && user.classList && user.classList.contains('_9663006')) {
          return { userMsg: user, assistantMsg: asst };
        }
        return { userMsg: null, assistantMsg: asst };
      },

      findConversation() {
        const container = document.querySelector('.ds-virtual-list-visible-items');
        if (container) {
          const s = getComputedStyle(container);
          if (s.overflowY === 'auto' || s.overflowY === 'scroll') return container;
        }
        const firstBlock = document.querySelector('._9663006, ._4f9bf79');
        if (firstBlock) {
          let el = firstBlock.parentElement;
          while (el && el !== document.body) {
            const s = getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) return el;
            el = el.parentElement;
          }
        }
        return _fallbackScrollable();
      },

      actionBarSelector: '._0a3d93b',
      copyButtonSelector: '.db183363',
    },

    // ── Gemini (placeholder) ────────────────────
    gemini: {
      isMsgBlock() { return false; },
      closestMsgBlock() { return null; },
      findQAPair() { return null; },
      findConversation() { return null; },
      actionBarSelector: '',
      copyButtonSelector: '',
    },
  };

  const P = PLATFORMS[PLATFORM] || null;

  // ──────────────────────────────────────────────
  //   SHARED DOM HELPERS
  // ──────────────────────────────────────────────

  function findPreviousUserBlock(asstBlock, isMsgFn) {
    let sib = asstBlock.previousElementSibling;
    while (sib) {
      if (isMsgFn(sib) &&
          (sib.querySelector('[data-user-message-bubble="true"]') ||
           sib.querySelector('[data-testid="user-message"]'))) {
        return sib;
      }
      sib = sib.previousElementSibling;
    }
    return null;
  }

  function findTurnByPosition(btn) {
    let cur = btn;
    while (cur && cur.parentElement && cur.parentElement !== document.body) {
      const parent = cur.parentElement;
      const siblings = Array.from(parent.children);
      if (siblings.length >= 2) {
        const sizable = siblings.filter(s =>
          s.getBoundingClientRect().height > 60 && (s.textContent || '').trim().length > 0
        );
        if (sizable.length >= 2 && sizable.includes(cur)) {
          const idx = sizable.indexOf(cur);
          return { userMsg: idx > 0 ? sizable[idx - 1] : null, assistantMsg: cur };
        }
      }
      cur = parent;
    }
    return null;
  }

  function _findConversationByBlocks(isMsgFn) {
    const candidates = [];
    const allBlocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      if (isMsgFn(walker.currentNode)) allBlocks.push(walker.currentNode);
    }
    allBlocks.forEach(block => {
      let el = block.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
          if (!candidates.find(c => c.el === el)) {
            candidates.push({ el, score: allBlocks.filter(b => el.contains(b)).length });
          }
          break;
        }
        el = el.parentElement;
      }
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].el;
    }
    return _fallbackScrollable();
  }

  function _fallbackScrollable() {
    const all = [];
    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 100) {
        all.push({ el, height: el.scrollHeight });
      }
    });
    all.sort((a, b) => b.height - a.height);
    return all.length > 0 ? all[0].el : null;
  }

  /**
   * Some SPAs (notably ChatGPT) virtualize the conversation list — turns
   * far from the viewport are not mounted in the DOM at all, or are
   * collapsed/placeholder until scrolled into view. Expanding overflow
   * and content-visibility on the container can't reveal content that
   * was never rendered. To work around this, incrementally scroll the
   * container from top to bottom (with small waits) so the framework
   * mounts every turn, then scroll back to the original position.
   */
  async function preloadVirtualizedContent(container) {
    // Determine the actual scrolling element: either `container` itself,
    // or — if container has no real overflow (its scrollHeight ~= clientHeight) —
    // the page/document scrolling element (common on ChatGPT, where <main>
    // or the window scrolls while the conversation column is just a div).
    const ownScrollable = container.scrollHeight > container.clientHeight + 50;
    const scroller = ownScrollable ? container : (document.scrollingElement || document.documentElement);

    const originalScrollTop = scroller.scrollTop;
    const step = Math.max(scroller.clientHeight * 0.8, 200);

    // Scroll to top first
    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 150));

    let lastHeight = -1;
    let stableCount = 0;
    // Walk down in steps until scrollHeight stops growing
    for (let i = 0; i < 200; i++) {
      scroller.scrollTop = Math.min(scroller.scrollTop + step, scroller.scrollHeight);
      await new Promise(r => setTimeout(r, 120));

      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (scroller.scrollHeight === lastHeight) {
        stableCount++;
      } else {
        stableCount = 0;
        lastHeight = scroller.scrollHeight;
      }
      // Stop once we've reached the bottom and height has been stable
      if (atBottom && stableCount >= 1) break;
    }

    // Give virtualized list a final moment to settle, then restore position
    await new Promise(r => setTimeout(r, 150));
    scroller.scrollTop = originalScrollTop;
    await new Promise(r => setTimeout(r, 150));
  }

  // ──────────────────────────────────────────────
  //   CSS STYLES
  // ──────────────────────────────────────────────
  GM_addStyle(`
    .cs-btn {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      user-select: none;
      border: 0;
      outline: none;
      border-radius: 6px;
      height: 32px;
      width: 32px;
      padding: 0;
      background: transparent;
      color: var(--text-muted, #8b8b8b);
      cursor: pointer;
      font-family: inherit;
      transition: color 0.15s, background-color 0.15s;
    }
    .cs-btn:hover {
      color: var(--text-primary, #1a1a1a);
      background: var(--fill-ghost-hover, rgba(0,0,0,0.06));
    }
    .cs-btn:active { background: var(--fill-ghost-pressed, rgba(0,0,0,0.1)); }
    .cs-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
    .cs-tooltip {
      position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
      padding: 4px 10px; font-size: 12px; line-height: 1.4; white-space: nowrap;
      border-radius: 6px; background: var(--tooltip-bg, #1a1a1a); color: #fff;
      pointer-events: none; opacity: 0; transition: opacity 0.15s; z-index: 99999;
    }
    .cs-btn:hover .cs-tooltip { opacity: 1; }
    .cs-tooltip::after {
      content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
      border: 5px solid transparent; border-top-color: var(--tooltip-bg, #1a1a1a);
    }
    .cs-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px);
      padding: 10px 20px; font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border-radius: 8px; background: #1a1a1a; color: #fff; z-index: 999999; opacity: 0;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s;
      pointer-events: none; box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    }
    .cs-toast--visible { transform: translateX(-50%) translateY(0); opacity: 1; }
    .cs-toast--success { background: #1a7f37; }
    .cs-toast--error { background: #cf222e; }
    .cs-btn--loading svg { animation: cs-spin 0.8s linear infinite; opacity: 0.6; }
    @keyframes cs-spin { to { transform: rotate(360deg); } }
    @media (prefers-color-scheme: dark) {
      .cs-toast { background: #e6e6e6; color: #1a1a1a; }
      .cs-toast--success { background: #3fb950; color: #fff; }
      .cs-toast--error { background: #f85149; color: #fff; }
    }
  `);

  // ──────────────────────────────────────────────
  //   UTILITIES
  // ──────────────────────────────────────────────

  function showToast(message, type = '') {
    const existing = document.querySelector('.cs-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `cs-toast cs-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('cs-toast--visible'));
    });
    setTimeout(() => {
      toast.classList.remove('cs-toast--visible');
      setTimeout(() => toast.remove(), 350);
    }, CONFIG.toastDuration);
  }

  function detectPageBackground() {
    const candidates = [
      document.querySelector('[class*="chat"]'),
      document.querySelector('[class*="conversation"]'),
      document.querySelector('[class*="messages"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body,
    ];
    for (const el of candidates) {
      if (!el) continue;
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    const scheme = getComputedStyle(document.documentElement).colorScheme;
    if (scheme && scheme.includes('dark')) return '#141414';
    return '#ffffff';
  }

  async function copyBlobToClipboard(blob) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  // ──────────────────────────────────────────────
  //   SCREENSHOT HELPERS
  // ──────────────────────────────────────────────

  function saveAndExpand(container) {
    const save = {
      el: container,
      overflow: container.style.overflow,
      overflowY: container.style.overflowY,
      maxHeight: container.style.maxHeight,
      height: container.style.height,
      scrollTop: container.scrollTop,
      nested: [],
    };
    container.style.overflow = 'visible';
    container.style.overflowY = 'visible';
    container.style.maxHeight = 'none';
    container.style.height = 'auto';
    container.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      let modified = false;
      const entry = { el };

      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
          cs.overflow === 'auto'  || cs.overflow === 'scroll') {
        entry.overflow = el.style.overflow;
        entry.overflowY = el.style.overflowY;
        entry.maxHeight = el.style.maxHeight;
        entry.height = el.style.height;
        el.style.overflow = 'visible';
        el.style.overflowY = 'visible';
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
        modified = true;
      }

      // GPT & other SPAs use content-visibility:auto to skip rendering
      // off-screen content — force everything to render.
      if (cs.contentVisibility === 'auto') {
        entry.contentVisibility = el.style.contentVisibility;
        el.style.contentVisibility = 'visible';
        modified = true;
      }

      // CSS contain suppresses layout/paint of off-screen elements
      if (cs.contain && cs.contain !== 'none') {
        entry.contain = el.style.contain;
        el.style.contain = (cs.contain === 'strict') ? 'layout style paint' : 'none';
        modified = true;
      }

      if (modified) save.nested.push(entry);
    });
    return save;
  }

  function restoreScrollState(save) {
    save.el.style.overflow  = save.overflow;
    save.el.style.overflowY = save.overflowY;
    save.el.style.maxHeight = save.maxHeight;
    save.el.style.height    = save.height;
    save.el.scrollTop       = save.scrollTop;
    save.nested.forEach(ns => {
      if ('overflow' in ns) {
        ns.el.style.overflow  = ns.overflow;
        ns.el.style.overflowY = ns.overflowY;
        ns.el.style.maxHeight = ns.maxHeight;
        ns.el.style.height    = ns.height;
      }
      if ('contentVisibility' in ns) ns.el.style.contentVisibility = ns.contentVisibility;
      if ('contain' in ns) ns.el.style.contain = ns.contain;
    });
  }

  // ──────────────────────────────────────────────
  //   SCREENSHOT FUNCTIONS
  // ──────────────────────────────────────────────

  async function captureCurrentQA(btnElement) {
    const pair = P.findQAPair(btnElement);

    if (!pair || !pair.assistantMsg) {
      let cur = btnElement, chain = [];
      for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
        chain.push(`${cur.tagName || '?'}.${(cur.className || '').toString().slice(0, 60)}#${(cur.id || '')}`);
        cur = cur.parentElement;
      }
      console.warn(`[AI Screenshot] No message pair found on ${PLATFORM}. Chain:`, chain);
      showToast('⚠️ Could not identify the message pair', 'error');
      return;
    }

    const pageBg = detectPageBackground();
    const { userMsg, assistantMsg } = pair;

    // Resolve parent and direct-child references.
    // In Grok's last-reply-container, messages are wrapped in
    // separate .flex.flex-col.items-center groups — we need to
    // move the entire group so restoration is symmetric.
    let parent = assistantMsg.parentElement;
    let first = userMsg || assistantMsg;
    let second = assistantMsg;

    if (userMsg && parent && !parent.contains(userMsg)) {
      // Climb to common ancestor
      let cur = parent;
      while (cur && cur !== document.body) {
        if (cur.contains(userMsg)) { parent = cur; break; }
        cur = cur.parentElement;
      }
      // Climb first to direct child of common ancestor
      while (first && first.parentElement !== parent) {
        first = first.parentElement;
      }
      // Climb second (assistant) to direct child as well, so we
      // move entire wrapper groups, not just inner responses.
      while (second && second.parentElement !== parent) {
        second = second.parentElement;
      }
    }
    if (!parent || !first) {
      showToast('⚠️ Could not find parent container', 'error');
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.style.background = pageBg;
    parent.insertBefore(wrapper, first);
    wrapper.appendChild(first);
    if (second !== first) {
      wrapper.appendChild(second);
    }

    const scrollSave = saveAndExpand(wrapper);
    await new Promise(r => requestAnimationFrame(r));

    // Remove all img elements to avoid CORS/404 errors during html-to-image capture
    const removedImgs = [];
    wrapper.querySelectorAll('img').forEach(img => {
      removedImgs.push({ el: img, parent: img.parentElement, next: img.nextSibling });
      img.remove();
    });

    try {
      const blob = await htmlToImage.toBlob(wrapper, {
        pixelRatio: CONFIG.scale,
        backgroundColor: pageBg,
      });
      await copyBlobToClipboard(blob);
      showToast('✅ 截图已复制到剪贴板', 'success');
    } catch (err) {
      console.error('[AI Screenshot] QA capture failed:', err);
      showToast('❌ Screenshot failed — see console', 'error');
    } finally {
      // Re-insert images
      removedImgs.forEach(({ el, parent, next }) => {
        try { parent.insertBefore(el, next); } catch (_) {}
      });
      restoreScrollState(scrollSave);
      // Restore: move groups back before wrapper, then remove wrapper
      parent.insertBefore(first, wrapper);
      if (second !== first) {
        parent.insertBefore(second, wrapper);
      }
      wrapper.remove();
    }
  }

  async function captureFullConversation() {
    const container = P.findConversation();
    if (!container) {
      showToast('⚠️ Could not find the conversation area', 'error');
      return;
    }
    const pageBg = detectPageBackground();

    // For virtualized lists (e.g. ChatGPT), force every turn to mount
    // by scrolling through the whole conversation before expanding.
    await preloadVirtualizedContent(container);

    const save = saveAndExpand(container);
    await new Promise(r => requestAnimationFrame(r));

    // Remove all img elements to avoid CORS/404 errors during html-to-image capture
    const removedImgs = [];
    container.querySelectorAll('img').forEach(img => {
      removedImgs.push({ el: img, parent: img.parentElement, next: img.nextSibling });
      img.remove();
    });

    try {
      const blob = await htmlToImage.toBlob(container, {
        pixelRatio: CONFIG.scale,
        backgroundColor: pageBg,
      });
      await copyBlobToClipboard(blob);
      showToast('✅ 截图已复制到剪贴板', 'success');
    } catch (err) {
      console.error('[AI Screenshot] Full capture failed:', err);
      showToast('❌ Screenshot failed — see console', 'error');
    } finally {
      removedImgs.forEach(({ el, parent, next }) => {
        try { parent.insertBefore(el, next); } catch (_) {}
      });
      restoreScrollState(save);
    }
  }

  // ──────────────────────────────────────────────
  //   BUTTON CREATION
  // ──────────────────────────────────────────────

  const ICON_QA = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const ICON_ALL = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  const ICON_SPINNER = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

  function createButton(type) {
    const isQA = type === 'qa';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cs-btn cs-btn--capture-${isQA ? 'qa' : 'all'}`;
    btn.setAttribute('aria-label', isQA ? 'Copy Q&A screenshot' : 'Copy full conversation screenshot');
    btn.setAttribute('data-cs-action', isQA ? 'capture-qa' : 'capture-all');
    btn.innerHTML = isQA ? ICON_QA : ICON_ALL;

    const tooltip = document.createElement('span');
    tooltip.className = 'cs-tooltip';
    tooltip.textContent = isQA ? '复制问答截图' : '复制全部对话';
    btn.appendChild(tooltip);

    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('cs-btn--loading')) return;
      const orig = btn.innerHTML;
      btn.classList.add('cs-btn--loading');
      btn.innerHTML = ICON_SPINNER;
      try {
        if (isQA) await captureCurrentQA(btn);
        else await captureFullConversation();
      } finally {
        btn.classList.remove('cs-btn--loading');
        btn.innerHTML = orig;
      }
    });
    return btn;
  }

  function injectButtons(actionBar) {
    if (actionBar.querySelector('[data-cs-action]')) return;

    // Only inject into action bars that have the Copy button
    let hasCopy = false;
    P.copyButtonSelector.split(',').forEach(sel => {
      if (actionBar.querySelector(sel.trim())) hasCopy = true;
    });
    if (!hasCopy) return;

    const qaBtn = createButton('qa');
    const allBtn = createButton('all');
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:16px;background:var(--border-muted,#e0e0e0);margin:0 4px;align-self:center;flex-shrink:0';

    actionBar.appendChild(sep);
    actionBar.appendChild(qaBtn);
    actionBar.appendChild(allBtn);
  }

  // ──────────────────────────────────────────────
  //   MUTATION OBSERVER
  // ──────────────────────────────────────────────

  let injectTimer = null;
  function scheduleInjection() {
    if (injectTimer) clearTimeout(injectTimer);
    injectTimer = setTimeout(() => { injectAllActionBars(); injectTimer = null; }, CONFIG.injectDebounceMs);
  }

  function injectAllActionBars() {
    if (!P.actionBarSelector) return;
    document.querySelectorAll(P.actionBarSelector).forEach(injectButtons);
  }

  // ──────────────────────────────────────────────
  //   INIT
  // ──────────────────────────────────────────────

  function init() {
    if (!P || !P.actionBarSelector) {
      console.log(`[AI Screenshot] Platform "${PLATFORM}" not yet configured. Skipping.`);
      return;
    }

    injectAllActionBars();

    const observer = new MutationObserver(mutations => {
      let should = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches(P.actionBarSelector)) {
                injectButtons(node);
                should = true;
              } else if (node.querySelectorAll && node.querySelectorAll(P.actionBarSelector).length > 0) {
                should = true;
              }
            }
          }
        }
        if (m.type === 'childList') should = true;
      }
      if (should) scheduleInjection();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log(`[AI Screenshot] 🎯 Ready on ${PLATFORM}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
