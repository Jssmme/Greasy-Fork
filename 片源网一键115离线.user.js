// ==UserScript==
// @name         片源网一键115离线
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      1.4.0
// @description  在资源列表页注入「115离线」按钮：点击后台抓取磁力、复制 BTIH 哈希，提交 115 离线，并在离线资源目录内自动创建以哈希命名的文件夹
// @author       JSSM
// @license      MIT
// @match        https://wangyougu.net/m_*.html
// @match        https://www.wangyougu.net/m_*.html
// @match        https://pianyuan.org/m_*.html
// @match        https://pianyuan.org/m_*.html
// @icon         https://wangyougu.net/favicon.ico
// @connect      115.com
// @connect      webapi.115.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_openInTab
// @run-at       document-end
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%e7%89%87%e6%ba%90%e7%bd%91%e4%b8%80%e9%94%ae115%e7%a6%bb%e7%ba%bf.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%e7%89%87%e6%ba%90%e7%bd%91%e4%b8%80%e9%94%ae115%e7%a6%bb%e7%ba%bf.user.js
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.__WYG115_LOADED__) return;
  window.__WYG115_LOADED__ = true;

  /* ================================================================== *
   * 0. 常量 / 配置
   * ================================================================== */

  const API = {
    ADD_URL: 'https://115.com/web/lixian/?ct=lixian&ac=add_task_url',
    ADD_BT: 'https://115.com/web/lixian/?ct=lixian&ac=add_task_bt',
    TASK_LIST: 'https://115.com/web/lixian/?ct=lixian&ac=task_lists',
    FILES: 'https://webapi.115.com/files',
    FILES_SEARCH: 'https://webapi.115.com/files/search',
    FILES_ADD: 'https://webapi.115.com/files/add',
  };

  const DEFAULT = {
    dir: '云下载/临时',
    pick: 'first',
    autoTorrent: true,
    hashInside: true,   // 离线后在资源目录内新建 <哈希> 文件夹
    copyHash: true,     // 提交前把 BTIH 哈希复制到剪贴板
  };

  // 提交后每隔这么久看一次基础目录，最多看几次；只认这么久之内出现的文件夹
  const HASH_FOLDER_DELAY = 3000;
  const HASH_FOLDER_TRIES = 3;
  const RECENT_MS = 12000;

  const S = {
    get: (k, d = DEFAULT[k]) => {
      try {
        const v = GM_getValue('wyg115_' + k);
        return v === undefined || v === null ? d : v;
      } catch { return d; }
    },
    set: (k, v) => { try { GM_setValue('wyg115_' + k, v); } catch { /* noop */ } },
  };

  const HAS_GM = typeof GM_xmlhttpRequest === 'function';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 调试日志：设置面板里开，默认关 */
  const log = (...a) => {
    try {
      if (GM_getValue('wyg115_debug', false) === true) console.log('[wyg115]', ...a);
    } catch { /* noop */ }
  };

  /* ================================================================== *
   * 1. 网络层
   * ================================================================== */

  function gm(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 30000,
        ...opts,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error('网络错误（115 不可达或被拦截）')),
        ontimeout: () => reject(new Error('请求超时')),
        onabort: () => reject(new Error('已取消')),
      });
    });
  }

  function asJson(r) {
    const body = r.response;
    if (body && typeof body === 'object') return body;
    const s = String(body == null ? r.responseText : body).trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return JSON.parse(s); } catch { /* fallthrough */ }
    }
    return s;
  }

  async function apiGet(url, params = {}) {
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    });
    const r = await gm({
      method: 'GET',
      url: u.toString(),
      responseType: 'json',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return asJson(r);
  }

  async function apiPostForm(url, data) {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') fd.append(k, v);
    });
    const r = await gm({
      method: 'POST',
      url,
      data: fd,
      responseType: 'json',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return asJson(r);
  }

  /* ================================================================== *
   * 2. 115 目录操作
   * ================================================================== */

  const cidCache = new Map();
  const normSeg = (s) => String(s || '').trim().replace(/[\\/:*?"<>|]/g, '');

  /** 逐级查找/创建目录链，返回末级 cid，失败 null */
  async function ensurePath(routes) {
    let cid = '0';
    for (const route of routes) {
      const got = await ensureFolderIn(cid, route);
      if (!got) return null;
      cid = got;
    }
    return cid;
  }

  /** 在 pid 下确保有名为 name 的文件夹，返回其 cid */
  async function ensureFolderIn(pid, name) {
    const parent = pid || '0';
    const key = `${parent}/${name}`;
    const memo = cidCache.get(key);
    if (memo) return memo;

    try {
      const j = await apiGet(API.FILES_SEARCH, { search_value: name, fc: 1, cid: parent, limit: 100 });
      const list = j && Array.isArray(j.data) ? j.data : [];
      const hit = list.find((x) => x && String(x.n).trim() === name && x.cid);
      if (hit) {
        cidCache.set(key, String(hit.cid));
        return String(hit.cid);
      }
    } catch (e) { log('search fail', name, e && e.message); }

    try {
      const r = await apiPostForm(API.FILES_ADD, { cname: name, pid: parent });
      const cid = r && (r.cid || (r.data && r.data.cid));
      if (cid) {
        cidCache.set(key, String(cid));
        return String(cid);
      }
      log('files/add 返回异常', name, r);
    } catch (e) { log('add fail', name, e && e.message); }

    return null;
  }

  /** 基础目录 cid（/云下载/临时） */
  async function resolveBaseCid() {
    const base = String(S.get('dir') || '').replace(/^\/+|\/+$/g, '').trim();
    const routes = base.split('/').map(normSeg).filter(Boolean);

    const key = 'cidp_' + routes.join('/');
    const memo = cidCache.get(key) || S.get(key, '');
    if (memo) return memo;
    if (!routes.length) return '0';

    const got = await ensurePath(routes);
    if (!got) return '0';
    cidCache.set(key, got);
    S.set(key, got);
    return got;
  }

  /* ================================================================== *
   * 3. 115 离线任务
   * ================================================================== */

  const ERRCODE_TEXT = {
    911: '触发了 115 安全验证：请在 115 页面手动完成一次验证后重试',
    10008: '115 里已有该离线任务（重复提交）',
    10004: '离线链接无效',
    10003: '离线下载不可用（可能缺少会员权限）',
  };

  function explain(res) {
    if (!res || typeof res !== 'object') return '115 返回了非预期内容（大概率未登录 115，或接口被拦截）';
    if (res.state === true || res.state === 'true') return null;
    const code = Number(res.errcode);
    if (ERRCODE_TEXT[code]) return ERRCODE_TEXT[code];
    if (res.error_msg) return `${res.error_msg}${code ? ` (errcode ${code})` : ''}`;
    if (code) return `提交失败 (errcode ${code})`;
    return '提交失败（未知原因）';
  }

  async function addTaskUrl(magnetUrl, cid) {
    const res = await apiPostForm(API.ADD_URL, { url: magnetUrl, wp_path_id: cid || '0' });
    return {
      ok: !!(res && (res.state === true || res.state === 'true')),
      raw: res,
      msg: explain(res),
      infoHash: res && (res.info_hash || (res.data && res.data.info_hash)) || '',
    };
  }

  async function addTaskBt(torrentUrl, cid, thisHash) {
    const bin = await gm({ method: 'GET', url: torrentUrl, responseType: 'arraybuffer', timeout: 60000 });
    if (bin.status >= 400) throw new Error(`种子下载失败 HTTP ${bin.status}`);
    const blob = new Blob([bin.response], { type: 'application/x-bittorrent' });
    const name = decodeURIComponent((torrentUrl.split('/').pop() || 'a.torrent').split('?')[0]) || 'a.torrent';

    const fd = new FormData();
    fd.append('file', blob, /\.torrent$/i.test(name) ? name : name + '.torrent');
    fd.append('wp_path_id', cid || '0');

    const r = await gm({
      method: 'POST',
      url: API.ADD_BT,
      data: fd,
      responseType: 'json',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    const res = asJson(r);
    return {
      ok: !!(res && (res.state === true || res.state === 'true')),
      raw: res,
      msg: explain(res),
      infoHash: res && (res.info_hash || (res.data && res.data.info_hash)) || thisHash || '',
    };
  }

  /**
   * 取 115 对象的时间戳（秒或字符串两种形态都兼容）
   */
  function folderTime(x) {
    const raw = [x.te, x.tp, x.tu, x.t];
    for (const v of raw) {
      if (v === undefined || v === null || v === '') continue;

      if (typeof v === 'number') return v > 1e12 ? v : v * 1000;

      const s = String(v).trim();
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        return n > 1e12 ? n : n * 1000;
      }
      const t = Date.parse(s.replace(/-/g, '/'));
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  }

  /**
   * 在基础目录里找「最近刚出现」的子文件夹
   * 请求时让 115 按时间倒序，再在本地排序兜底；只认窗口内的，否则视为没有
   */
  async function findRecentFolder(baseCid) {
    const parent = String(baseCid || '0');
    let data = [];
    try {
      const j = await apiGet(API.FILES, { cid: parent, fc: 1, limit: 200, offset: 0, o: 'te', asc: 0 });
      data = j && Array.isArray(j.data) ? j.data : [];
    } catch (e) {
      log('findRecentFolder', e && e.message);
      return null;
    }

    const now = Date.now();
    const newest = data
      .filter((x) => x && x.cid && String(x.cid) !== parent)
      .map((x) => ({ cid: String(x.cid), name: String(x.n || ''), time: folderTime(x) }))
      .filter((x) => x.time > 0)
      .sort((a, b) => b.time - a.time)[0];

    if (!newest) return null;

    // age 为负说明 115 服务器时间超前，给 60 秒容差
    const age = now - newest.time;
    return age <= RECENT_MS && age >= -60000 ? newest : null;
  }

  /* ================================================================== *
   * 4. 哈希文件夹（定位资源根目录后在它里面新建）
   * ================================================================== */

  /**
   * 轮询基础目录，找 RECENT_MS 内刚出现的资源根目录，在它里面建哈希文件夹。
   * 找不到就不建（交由用户在 115 里手动处理），不再往基础目录乱塞。
   */
  async function placeHashFolder({ baseCid, hash }) {
    for (let i = 0; i < HASH_FOLDER_TRIES; i++) {
      await sleep(HASH_FOLDER_DELAY);

      const recent = await findRecentFolder(baseCid);
      if (!recent) continue;

      const got = await ensureFolderIn(recent.cid, hash);
      if (got) return { ok: true, pid: recent.cid, name: recent.name };
      return { ok: false, reason: 'mkdir-failed' };
    }
    return { ok: false, reason: 'no-recent-folder' };
  }

  /** 串行执行，避免批量时同时打一堆请求 */
  let hashChain = Promise.resolve();
  function queueHashJob(job, notify) {
    hashChain = hashChain.then(async () => {
      const r = await placeHashFolder(job);
      notify && notify(r.ok, r);
    }).catch((e) => log('hashChain', e && e.message));
    return hashChain;
  }

  /* ================================================================== *
   * 5. 磁力 / 哈希 / 剪贴板
   * ================================================================== */

  const MAGNET_RE = /magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}[^"'\s<>\\]*/gi;
  const BTIH_RE = /urn:btih:([0-9a-zA-Z]{32,40})/i;
  const SIZE_MULT = { TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 };

  const unescapeHtml = (s) => String(s).replace(/&amp;/gi, '&').replace(/&#38;/g, '&');

  function btihOf(magnet) {
    const m = String(magnet || '').match(BTIH_RE);
    return m ? m[1] : '';
  }

  function sizeFromText(txt) {
    const m = String(txt || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
    return m ? Number.parseFloat(m[1]) * SIZE_MULT[m[2].toUpperCase()] : 0;
  }

  function extractMagnets(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    const seen = new Set();

    const push = (raw, ctx) => {
      if (!raw) return;
      const m = String(raw).match(/magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}[^"'\s<>\\]*/i);
      if (!m) return;
      const url = unescapeHtml(m[0]);
      if (seen.has(url)) return;
      seen.add(url);

      let size = 0;
      let name = '';
      if (ctx) {
        const scope = ctx.closest('tr, li, .item, .magnet, p, div') || ctx;
        const txt = (scope.textContent || '').replace(/\s+/g, ' ').trim();
        size = sizeFromText(txt);
        name = txt.slice(0, 140);
      }
      out.push({ url, size, name });
    };

    doc.querySelectorAll('a[href^="magnet:"]').forEach((a) => push(a.getAttribute('href'), a));

    ['data-clipboard-text', 'data-magnet', 'data-url', 'data-href', 'data-link', 'value', 'onclick'].forEach((attr) => {
      doc.querySelectorAll(`[${attr}]`).forEach((el) => {
        const v = el.getAttribute(attr);
        if (v && /magnet:/i.test(v)) push(v, el);
      });
    });

    const text = unescapeHtml(html);
    let r;
    while ((r = MAGNET_RE.exec(text))) {
      const url = r[0].replace(/[&,;]+$/, '');
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, size: 0, name: '' });
    }
    MAGNET_RE.lastIndex = 0;

    const torrents = [...doc.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && /\.torrent(\?|$)/i.test(h))
      .map((h) => new URL(h, location.origin).href);

    return { magnets: out, torrents: [...new Set(torrents)] };
  }

  const detailCache = new Map();

  async function loadDetail(url) {
    if (detailCache.has(url)) return detailCache.get(url);

    const p = (async () => {
      const resp = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html,*/*' } });
      if (!resp.ok) throw new Error(`详情页 HTTP ${resp.status}`);
      const html = await resp.text();
      if (html.length < 3000 && /请登录后访问|请先登录|User\/login/i.test(html)) {
        throw new Error('网游谷登录态已失效，请重新登录');
      }
      return extractMagnets(html);
    })();

    detailCache.set(url, p);
    p.catch(() => detailCache.delete(url));
    return p;
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* 回退 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  /* ================================================================== *
   * 6. UI
   * ================================================================== */

  const CLS = 'wyg115-b';

  const CSS = `
.${CLS}{display:inline-flex;align-items:center;justify-content:center;gap:3px;cursor:pointer;
  border:0;border-radius:3px;background:#2563eb;color:#fff;font:12px/18px -apple-system,"Microsoft YaHei",sans-serif;
  padding:2px 8px;white-space:nowrap;vertical-align:middle;transition:background .15s,opacity .15s;user-select:none}
.${CLS}:hover{background:#1d4ed8}
.${CLS}[data-st="load"]{background:#6b7280;cursor:progress}
.${CLS}[data-st="ok"]{background:#15803d}
.${CLS}[data-st="err"]{background:#b91c1c}
.${CLS}[disabled]{opacity:.7;cursor:progress}
.wyg115-all{display:inline-block;margin-left:4px;padding:0 5px;border-radius:3px;background:#e0e7ff;
  color:#1d4ed8!important;font-size:11px;font-weight:400;cursor:pointer;line-height:15px;vertical-align:middle}
.wyg115-all:hover{background:#c7d2fe}
#wyg115-toast-box{position:fixed;right:16px;bottom:56px;z-index:999999;display:flex;flex-direction:column;gap:8px;
  align-items:flex-end;pointer-events:none;font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif}
.wyg115-toast{max-width:400px;background:rgba(17,24,39,.94);color:#fff;padding:8px 14px;border-radius:6px;
  box-shadow:0 4px 16px rgba(0,0,0,.28);opacity:0;transform:translateY(8px);transition:.2s;word-break:break-all}
.wyg115-toast.on{opacity:1;transform:none}
.wyg115-toast.ok{background:rgba(21,128,61,.96)}
.wyg115-toast.err{background:rgba(185,28,28,.96)}
#wyg115-login-tip{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999998;
  display:flex;align-items:center;gap:10px;background:rgba(185,28,28,.96);color:#fff;padding:8px 14px;
  border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.28);pointer-events:auto;
  font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif}
#wyg115-login-tip a{color:#fff;text-decoration:underline;font-weight:600}
#wyg115-login-tip b{cursor:pointer;font-weight:400;opacity:.75;padding:0 3px;font-size:15px;line-height:1}
#wyg115-login-tip b:hover{opacity:1}
#wyg115-gear{position:fixed;right:16px;bottom:16px;z-index:999999;width:32px;height:32px;border-radius:50%;
  border:0;background:rgba(37,99,235,.9);color:#fff;cursor:pointer;font-size:16px;line-height:32px;text-align:center;
  box-shadow:0 2px 10px rgba(0,0,0,.25);padding:0}
#wyg115-gear:hover{background:#1d4ed8}
#wyg115-panel{position:fixed;right:16px;bottom:58px;z-index:999999;width:268px;background:#fff;color:#111;
  border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.24);padding:14px;
  font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;display:none}
#wyg115-panel h4{margin:0 0 10px;font-size:13px;font-weight:600}
#wyg115-panel label{display:block;margin:8px 0 3px;color:#4b5563;font-size:12px}
#wyg115-panel input,#wyg115-panel select{width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid #d1d5db;
  border-radius:4px;font-size:12px;outline:none}
#wyg115-panel .chk{display:flex;align-items:center;gap:6px;margin:8px 0 0;color:#374151;font-size:12px;cursor:pointer}
#wyg115-panel .chk input{width:auto;margin:0}
#wyg115-panel .row{display:flex;gap:8px;margin-top:12px}
#wyg115-panel button{flex:1;padding:6px 0;border:0;border-radius:4px;cursor:pointer;font-size:12px}
#wyg115-panel .ok{background:#2563eb;color:#fff}
#wyg115-panel .cancel{background:#e5e7eb;color:#374151}
#wyg115-panel .tip{margin-top:10px;color:#6b7280;font-size:11px;line-height:1.55}
`;

  function injectStyle() {
    const el = document.createElement('style');
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  let toastBox = null;
  function toast(msg, type = '') {
    if (!toastBox || !document.body.contains(toastBox)) {
      toastBox = document.createElement('div');
      toastBox.id = 'wyg115-toast-box';
      document.body.appendChild(toastBox);
    }
    const t = document.createElement('div');
    t.className = 'wyg115-toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => {
      t.classList.remove('on');
      setTimeout(() => t.remove(), 260);
    }, type === 'err' ? 5600 : 3000);
  }

  function setState(btn, st, text) {
    btn.dataset.st = st;
    if (text) btn.textContent = text;
    if (st === 'load') btn.setAttribute('disabled', '');
    else btn.removeAttribute('disabled');
  }

  /* ---------------- 115 登录态检测 ---------------- */

  /** 探测 115 登录态：能拿到 files 接口的正常响应就算已登录 */
  async function check115Login() {
    if (!HAS_GM) return true; // 降级模式下不打扰
    try {
      const r = await gm({
        method: 'GET',
        url: 'https://webapi.115.com/files?cid=0&limit=1&offset=0&show_dir=1',
        responseType: 'json',
        timeout: 12000,
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      const j = asJson(r);
      if (!j || typeof j !== 'object') return false;          // 多半是登录页 HTML
      if (j.state === true || j.state === 'true') return true;
      if (Array.isArray(j.data)) return true;
      if (j.count !== undefined) return true;
      return false;
    } catch (e) {
      log('check115Login', e && e.message);
      return false;
    }
  }

  function showLoginTip() {
    if (document.getElementById('wyg115-login-tip')) return;

    const bar = document.createElement('div');
    bar.id = 'wyg115-login-tip';

    const txt = document.createElement('span');
    txt.textContent = '未检测到 115 登录态，脚本无法提交离线';

    const link = document.createElement('a');
    link.href = 'https://115.com';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '去登录';

    const hint = document.createElement('span');
    hint.style.opacity = '.85';
    hint.textContent = '（登录后刷新本页）';

    const close = document.createElement('b');
    close.textContent = '×';
    close.title = '关闭提示';
    close.addEventListener('click', () => bar.remove());

    bar.append(txt, link, hint, close);
    document.body.appendChild(bar);
  }

  /* ================================================================== *
   * 7. 业务
   * ================================================================== */

  function askMagnet(magnets) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000000;display:flex;align-items:center;justify-content:center;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:8px;max-width:560px;width:90%;max-height:70vh;overflow:auto;padding:16px;font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif;';

      const fmt = (b) => (!b ? '未知大小' : b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(0) + ' MB');
      box.innerHTML = `<h4 style="margin:0 0 12px;font-size:14px">选择要离线的磁力（共 ${magnets.length} 条）</h4>`;

      magnets.forEach((m, i) => {
        const b = document.createElement('button');
        b.textContent = `${i + 1}. ${fmt(m.size)}  ${btihOf(m.url).slice(0, 12)}…  ${m.name.slice(0, 50)}`;
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px 10px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;cursor:pointer;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        b.onmouseenter = () => (b.style.background = '#eef2ff');
        b.onmouseleave = () => (b.style.background = '#f9fafb');
        b.onclick = () => { mask.remove(); resolve(m); };
        box.appendChild(b);
      });

      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      cancel.style.cssText = 'margin-top:10px;padding:6px 14px;border:0;border-radius:4px;background:#e5e7eb;cursor:pointer;font-size:12px;';
      cancel.onclick = () => { mask.remove(); resolve(null); };
      box.appendChild(cancel);

      mask.appendChild(box);
      document.body.appendChild(mask);
    });
  }

  async function chooseMagnet(magnets) {
    const mode = S.get('pick', 'first');
    if (magnets.length === 1) return magnets[0];
    if (mode === 'largest') return [...magnets].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    if (mode === 'ask') return await askMagnet(magnets);
    return magnets[0];
  }

  async function copyAndOpen(magnet) {
    await copyText(magnet);
    window.open('https://115.com/web/lixian/', '_blank');
    toast('磁力已复制，到 115 离线页粘贴即可（当前环境不支持直连接口）', 'ok');
  }

  let submitChain = Promise.resolve();
  function throttleSubmit(fn) {
    const run = submitChain.then(fn, fn);
    submitChain = run.catch(() => {}).then(() => sleep(700));
    return run;
  }

  async function runOffline(btn, detailUrl, ev, silent) {
    const say = (m, t) => { if (!silent) toast(m, t); };
    setState(btn, 'load', '解析…');

    try {
      const { magnets, torrents } = await loadDetail(detailUrl);

      if (!magnets.length) {
        if (torrents.length && S.get('autoTorrent', true) && HAS_GM) {
          setState(btn, 'load', '传种子…');
          const baseCid = await resolveBaseCid();
          const r = await throttleSubmit(() => addTaskBt(torrents[0], baseCid, ''));
          if (!r.ok) throw new Error(r.msg);
          setState(btn, 'ok', '✓ 已离线');
          say('已作为种子任务提交到 115 离线', 'ok');
          setTimeout(() => setState(btn, '', '115离线'), 2600);
          return true;
        }
        throw new Error('详情页没找到磁力链接');
      }

      const picked = (ev && ev.shiftKey && magnets.length > 1)
        ? await askMagnet(magnets)
        : await chooseMagnet(magnets);

      if (!picked) {
        setState(btn, '', '115离线');
        return false;
      }

      if (!HAS_GM) {
        await copyAndOpen(picked.url);
        setState(btn, 'ok', '✓ 已复制');
        setTimeout(() => setState(btn, '', '115离线'), 2600);
        return true;
      }

      // ① 先复制哈希（此时仍在用户手势窗口内，成功率最高）
      const hash = btihOf(picked.url);
      let copied = false;
      if (S.get('copyHash', true) && !silent && hash) {
        copied = await copyText(hash);
        if (copied) say(`哈希已复制：${hash}`, 'ok');
        else say(`哈希：${hash}（剪贴板写入失败，请手动复制）`, 'err');
      }

      // ② 提交离线任务（落在基础目录 /云下载/临时）
      setState(btn, 'load', '提交…');
      const baseCid = await resolveBaseCid();
      const needHashDir = S.get('hashInside', true) && !!hash;

      const r = await throttleSubmit(() => addTaskUrl(picked.url, baseCid));

      if (!r.ok) throw new Error(r.msg);

      setState(btn, 'ok', '✓ 已离线');
      say(`已提交 115 离线 → /${S.get('dir') || ''}${copied ? '（哈希已复制）' : ''}`, 'ok');
      setTimeout(() => { if (btn.dataset.st === 'ok') setState(btn, '', '115离线'); }, 2600);

      // ③ 轮询基础目录，找刚冒出来的资源根目录，在它里面建哈希文件夹
      if (needHashDir) {
        queueHashJob({ baseCid, hash }, (ok, info) => {
          if (silent) return;
          if (ok) toast(`哈希文件夹已建好：${info.name || hash.slice(0, 12)}`, 'ok');
          else if (info && info.reason === 'mkdir-failed') toast('找到资源目录了，但建文件夹失败，可手动建一个同名文件夹', 'err');
          else toast('10 秒内没看到新的资源目录，未自动创建哈希文件夹', '');
        });
      }

      return true;
    } catch (e) {
      log(e);
      setState(btn, 'err', '✗ 失败');
      say(String((e && e.message) || e), 'err');
      setTimeout(() => { if (btn.dataset.st === 'err') setState(btn, '', '115离线'); }, 4500);
      return false;
    }
  }

  let batchRunning = false;

  async function runBatch() {
    if (batchRunning) return;
    const btns = [...document.querySelectorAll(`.${CLS}`)].filter((b) => b.dataset.url);
    if (!btns.length) { toast('这页没有可提交的资源', 'err'); return; }

    const dir = S.get('dir') || '根目录';
    if (!window.confirm(
      `将依次把 ${btns.length} 个资源提交到 115 离线\n目标目录：/${dir}\n每条提交后会在其资源目录内新建「哈希」文件夹\n\n资源多时耗时较长，请勿关闭页面。继续？`
    )) return;

    batchRunning = true;
    document.body.style.cursor = 'progress';
    let ok = 0;
    let fail = 0;

    try {
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (b.dataset.st === 'ok') { ok++; continue; }
        toast(`批量进度 ${i + 1}/${btns.length}`, '');
        const success = await runOffline(b, b.dataset.url, null, true);
        if (success) ok++; else fail++;
      }
    } finally {
      batchRunning = false;
      document.body.style.cursor = '';
    }

    toast(`批量提交完成：成功 ${ok} 条，失败 ${fail} 条`, fail ? 'err' : 'ok');
  }

  /* ================================================================== *
   * 8. 注入
   * ================================================================== */

  const BTN_TEXT = '115离线';

  function makeBtn(detailUrl) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = CLS;
    b.textContent = BTN_TEXT;
    b.dataset.url = detailUrl;
    b.title = '一键离线到 115（Shift+点击可手动挑磁力）';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (batchRunning) return;
      runOffline(b, detailUrl, e);
    });
    return b;
  }

  function injectTables() {
    let added = 0;

    document.querySelectorAll('table.data').forEach((table) => {
      const head = table.querySelector('tr.firstr');
      if (head && !head.querySelector('.wyg115-th')) {
        const th = document.createElement('th');
        th.className = 'nobr center wyg115-th';
        th.style.width = '96px';
        th.innerHTML = '<span>115</span>';

        const all = document.createElement('span');
        all.className = 'wyg115-all';
        all.textContent = '全部';
        all.title = '把这张表里所有资源依次提交到 115 离线';
        all.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); runBatch(); });
        th.appendChild(all);

        head.appendChild(th);
      }

      table.querySelectorAll('tbody > tr').forEach((tr) => {
        if (tr.classList.contains('firstr')) return;
        if (tr.querySelector('.' + CLS)) return;

        const link = tr.querySelector('a.ico_bt[href], a[href^="/r_"], a[href*="/r_"]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || /^javascript:/i.test(href)) return;

        const td = document.createElement('td');
        td.className = 'nobr center wyg115-td';
        td.appendChild(makeBtn(new URL(href, location.origin).href));
        tr.appendChild(td);
        added++;
      });
    });

    return added;
  }

  /* ================================================================== *
   * 9. 设置面板
   * ================================================================== */

  function buildPanel() {
    if (document.getElementById('wyg115-gear')) return;

    const gear = document.createElement('button');
    gear.id = 'wyg115-gear';
    gear.textContent = '⚙';
    gear.title = '网游谷115离线 · 设置';

    const panel = document.createElement('div');
    panel.id = 'wyg115-panel';
    panel.innerHTML = `
      <h4>网游谷 115 离线 · 设置</h4>
      <label>115 基础目录（可用 / 分多级）</label>
      <input id="wyg115-dir" placeholder="云下载/临时" />
      <label>一条资源有多个磁力时</label>
      <select id="wyg115-pick">
        <option value="first">取第一条</option>
        <option value="largest">取体积最大的</option>
        <option value="ask">每次弹窗让我选</option>
      </select>
      <label class="chk"><input type="checkbox" id="wyg115-hashin" /> 离线后在资源目录内建「哈希」文件夹</label>
      <label class="chk"><input type="checkbox" id="wyg115-copyhash" /> 提交前把哈希复制到剪贴板</label>
      <label class="chk"><input type="checkbox" id="wyg115-debug" /> 输出调试日志到控制台</label>
      <div class="row">
        <button class="ok" id="wyg115-save">保存</button>
        <button class="cancel" id="wyg115-close">关闭</button>
      </div>
      <div class="tip">目录不存在会逐级自动创建。<br>需在同一浏览器登录过 115 网页版。<br>提交后会盯 10 秒，看到基础目录里新冒出来的资源文件夹就把哈希文件夹建进去；没看到就不建，你到 115 里手动处理即可。</div>
    `;

    document.body.append(gear, panel);

    const dirInput = panel.querySelector('#wyg115-dir');
    const pickSel = panel.querySelector('#wyg115-pick');
    const hashChk = panel.querySelector('#wyg115-hashin');
    const copyChk = panel.querySelector('#wyg115-copyhash');
    const debugChk = panel.querySelector('#wyg115-debug');

    gear.addEventListener('click', () => {
      if (panel.style.display !== 'block') {
        dirInput.value = S.get('dir') || '';
        pickSel.value = S.get('pick', 'first');
        hashChk.checked = !!S.get('hashInside', true);
        copyChk.checked = !!S.get('copyHash', true);
        debugChk.checked = !!S.get('debug', false);
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    panel.querySelector('#wyg115-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });

    panel.querySelector('#wyg115-save').addEventListener('click', () => {
      const dir = dirInput.value.replace(/^\/+|\/+$/g, '').trim();
      const routes = dir.split('/').map(normSeg).filter(Boolean);

      S.set('dir', dir);
      S.set('pick', pickSel.value);
      S.set('hashInside', hashChk.checked);
      S.set('copyHash', copyChk.checked);
      S.set('debug', debugChk.checked);

      S.set('cidp_' + routes.join('/'), '');
      cidCache.clear();

      panel.style.display = 'none';
      toast(`已保存：/${dir || ''}`, 'ok');
    });
  }

  /* ================================================================== *
   * 10. 启动
   * ================================================================== */

  function boot() {
    injectStyle();

    const n = injectTables();
    if (n) log('injected', n, 'rows');

    const mo = new MutationObserver(() => { injectTables(); });
    mo.observe(document.body, { childList: true, subtree: true });

    buildPanel();

    // 启动后探测一次 115 登录态，没登录就挂条提醒（不阻塞页面）
    setTimeout(() => {
      check115Login().then((ok) => {
        log('115 login =', ok);
        if (!ok) showLoginTip();
      });
    }, 1200);

    log('ready. GM =', HAS_GM);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
