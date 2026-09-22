// ==UserScript==
// @name         JAVDB电影磁力链接提取器
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      3.7
// @description  一键批量提取磁力，结果复制到剪贴板，支持所有 javdb/javdb数字.com
// @author       MUMU
// @include      https://javdb*.com/*
// @icon		 https://javdb575.com/favicon.ico
// @grant        none
// @license 	 MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/JAVDB%E7%94%B5%E5%BD%B1%E7%A3%81%E5%8A%9B%E9%93%BE%E6%8E%A5%E6%8F%90%E5%8F%96%E5%99%A8.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/JAVDB%E7%94%B5%E5%BD%B1%E7%A3%81%E5%8A%9B%E9%93%BE%E6%8E%A5%E6%8F%90%E5%8F%96%E5%99%A8.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const COOKIE_SETTINGS = 'magnet_extractor_settings';
    const COOKIE_LANG = 'magnet_extractor_lang';
    const COOKIE_PANEL_POS = 'magnet_extractor_panel_pos';
    const ALL_COLUMNS = ['番号名', '电影名', '电影链接', '磁力链接', '文件体积', '是否有字幕'];

    const COLUMN_LABELS = {
        zh: { 番号名: '番号名', 电影名: '电影名', 电影链接: '电影链接', 磁力链接: '磁力链接', 文件体积: '文件体积', 是否有字幕: '是否有字幕' },
        en: { 番号名: 'Code', 电影名: 'Title', 电影链接: 'Page URL', 磁力链接: 'Magnet', 文件体积: 'Size', 是否有字幕: 'Subtitle' }
    };

    const T = {
        zh: {
            title: 'MUMU磁力链接提取器',
            statusReady: '准备就绪 - 请在页面就绪后手动点击开始',
            processPage: '开始',
            copyToClipboard: '复制到剪贴板',
            settings: '设置',
            openSettings: '打开设置',
            delayLabel: '子网页打开间隔：',
            delayUnit: '秒',
            maxSizeLabel: '文件体积上限：',
            subtitlePriorityLabel: '带字幕影片优先',
            unlimitedHint: '设置为0时为无限制',
            columnsHint: '要输出的列：',
            includeHeader: '复制时包含表头',
            save: '保存',
            analyzing: '正在分析当前页面...',
            noItems: '未找到电影项目',
            progress: '进度: ',
            processing: '正在处理: ',
            pageDone: '当前页完成！共提取 ',
            resultsTotal: ' 个结果，总计 ',
            totalSuffix: ' 个',
            noResults: '没有可复制的结果',
            copied: '已复制 ',
            toClipboard: ' 条到剪贴板',
            copyFail: '复制到剪贴板失败，请确保页面为 HTTPS 或尝试手动选择后复制',
            visiting: '正在访问: ',
            noMagnetBlock: '  - 未找到磁力链接区块',
            noValid: '  - 无有效磁力链接',
            error: '  - 错误: '
        },
        en: {
            title: 'MUMU Magnet Extractor',
            statusReady: 'Ready - Click Start when page is loaded',
            processPage: 'Start',
            copyToClipboard: 'Copy to Clipboard',
            settings: 'Settings',
            openSettings: 'Open settings',
            delayLabel: 'Delay:',
            delayUnit: 'sec',
            maxSizeLabel: 'Max file size:',
            subtitlePriorityLabel: 'Subtitle prefer',
            unlimitedHint: 'Set 0 for unlimited',
            columnsHint: 'Columns select:',
            includeHeader: 'Include header',
            save: 'Save',
            analyzing: 'Analyzing page...',
            noItems: 'No movie items found',
            progress: 'Progress: ',
            processing: 'Processing: ',
            pageDone: 'Page done. Extracted ',
            resultsTotal: ' results, total ',
            totalSuffix: '',
            noResults: 'No results to copy',
            copied: 'Copied ',
            toClipboard: ' rows to clipboard',
            copyFail: 'Copy failed. Ensure HTTPS or try selecting and copying manually.',
            visiting: 'Visiting: ',
            noMagnetBlock: '  - No magnet block found',
            noValid: '  - No valid magnets',
            error: '  - Error: '
        }
    };

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : '';
    }

    function setCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;expires=' + d.toUTCString() + ';SameSite=Lax';
    }

    function loadPanelPosition() {
        try {
            const raw = getCookie(COOKIE_PANEL_POS);
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (typeof p.left !== 'number' || typeof p.top !== 'number') return null;
            return p;
        } catch (e) {
            return null;
        }
    }

    function savePanelPosition(left, top) {
        try {
            setCookie(COOKIE_PANEL_POS, JSON.stringify({ left, top }));
        } catch (e) {}
    }

    function normalizeOneDecimal(value, fallback, min, max) {
        if (isNaN(value)) return fallback;
        const clamped = Math.min(max, Math.max(min, value));
        return Math.round(clamped * 10) / 10;
    }

    function getDefaultSettings() {
        return {
            delaySeconds: 2,
            maxFileSizeGb: 30,
            subtitlePriorityEnabled: true,
            subtitleMinSizeGb: 1,
            visibleColumns: [...ALL_COLUMNS],
            includeHeader: true
        };
    }

    function loadSettings() {
        try {
            const raw = getCookie(COOKIE_SETTINGS);
            if (!raw) return getDefaultSettings();
            const saved = JSON.parse(raw);
            const def = getDefaultSettings();
            return {
                delaySeconds: typeof saved.delaySeconds === 'number' && saved.delaySeconds >= 0.5
                    ? saved.delaySeconds : def.delaySeconds,
                maxFileSizeGb: typeof saved.maxFileSizeGb === 'number' && saved.maxFileSizeGb >= 0
                    ? normalizeOneDecimal(saved.maxFileSizeGb, def.maxFileSizeGb, 0, 999)
                    : def.maxFileSizeGb,
                subtitlePriorityEnabled: typeof saved.subtitlePriorityEnabled === 'boolean'
                    ? saved.subtitlePriorityEnabled : def.subtitlePriorityEnabled,
                subtitleMinSizeGb: typeof saved.subtitleMinSizeGb === 'number' && saved.subtitleMinSizeGb >= 0
                    ? normalizeOneDecimal(saved.subtitleMinSizeGb, def.subtitleMinSizeGb, 0, 999)
                    : def.subtitleMinSizeGb,
                visibleColumns: Array.isArray(saved.visibleColumns)
                    ? saved.visibleColumns.filter(c => ALL_COLUMNS.includes(c))
                    : def.visibleColumns,
                includeHeader: typeof saved.includeHeader === 'boolean' ? saved.includeHeader : def.includeHeader
            };
        } catch (e) {
            return getDefaultSettings();
        }
    }

    function saveSettings(settings) {
        try {
            setCookie(COOKIE_SETTINGS, JSON.stringify(settings));
        } catch (e) {}
    }

    function getSettings() {
        if (!window._magnetExtractorSettings) {
            window._magnetExtractorSettings = loadSettings();
        }
        return window._magnetExtractorSettings;
    }

    function getLang() {
        if (window._magnetExtractorLang === undefined) {
            const v = getCookie(COOKIE_LANG);
            window._magnetExtractorLang = (v === 'en' || v === 'zh') ? v : 'zh';
        }
        return window._magnetExtractorLang;
    }

    function setLang(lang) {
        if (lang !== 'zh' && lang !== 'en') return;
        window._magnetExtractorLang = lang;
        setCookie(COOKIE_LANG, lang);
    }

    function t(key) {
        return T[getLang()][key] || T.zh[key] || key;
    }

    function refreshUI() {
        const lang = getLang();
        const titleEl = document.getElementById('panel-title');
        if (titleEl) titleEl.textContent = t('title');
        const statusInfo = document.getElementById('status-info');
        const panelSettings = document.getElementById('panel-settings');
        if (statusInfo && panelSettings && panelSettings.style.display === 'none') {
            const ready = document.getElementById('start-extraction').disabled === false;
            if (ready) statusInfo.textContent = t('statusReady');
        }
        const startBtn = document.getElementById('start-extraction');
        if (startBtn) startBtn.textContent = t('processPage');
        const copyBtn = document.getElementById('copy-results');
        if (copyBtn) copyBtn.textContent = t('copyToClipboard');
        const headerActionBtn = document.getElementById('header-action-btn');
        if (headerActionBtn) {
            const inSettings = panelSettings && panelSettings.style.display === 'block';
            headerActionBtn.textContent = inSettings ? t('save') : t('settings');
            headerActionBtn.title = inSettings ? t('save') : t('openSettings');
        }
        const delayLabel = document.getElementById('setting-delay-label');
        if (delayLabel) delayLabel.textContent = t('delayLabel');
        const delayUnit = document.getElementById('setting-delay-unit');
        if (delayUnit) delayUnit.textContent = t('delayUnit');
        const maxSizeLabel = document.getElementById('setting-max-size-label');
        if (maxSizeLabel) maxSizeLabel.textContent = t('maxSizeLabel');
        const subtitlePriorityLabel = document.getElementById('setting-subtitle-priority-label');
        if (subtitlePriorityLabel) subtitlePriorityLabel.textContent = t('subtitlePriorityLabel');
        const maxSizeInput = document.getElementById('setting-max-size');
        if (maxSizeInput) maxSizeInput.placeholder = t('unlimitedHint');
        const subtitleMinInput = document.getElementById('setting-subtitle-min');
        if (subtitleMinInput) subtitleMinInput.placeholder = t('unlimitedHint');
        const columnsHint = document.getElementById('setting-columns-hint');
        if (columnsHint) columnsHint.textContent = t('columnsHint');
        const headerLabel = document.getElementById('setting-header-label');
        if (headerLabel) headerLabel.textContent = t('includeHeader');
        ALL_COLUMNS.forEach(col => {
            const span = document.querySelector(`#setting-columns label[data-column="${col}"] span`);
            if (span) span.textContent = COLUMN_LABELS[lang][col] || col;
        });
        const langZh = document.getElementById('lang-zh');
        const langEn = document.getElementById('lang-en');
        if (langZh) langZh.style.fontWeight = lang === 'zh' ? 'bold' : 'normal';
        if (langEn) langEn.style.fontWeight = lang === 'en' ? 'bold' : 'normal';
    }

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'magnet-extractor-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            background: white;
            border: 2px solid #007cba;
            border-radius: 8px;
            padding: 0;
            z-index: 10000;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        panel.innerHTML = `
            <div id="panel-drag-handle" style="
                padding: 15px 15px 8px 15px;
                cursor: move;
                user-select: none;
                -webkit-user-select: none;
                border-bottom: 1px solid #e0e0e0;
            ">
                <h3 style="margin: 0; color: #007cba; pointer-events: none; display: inline-block;"><span id="panel-title">MUMU磁力链接提取器</span></h3>
                <button type="button" id="lang-switch" style="margin-left: 10px; font-size: 13px; background: none; border: none; padding: 0; color: #007cba; cursor: pointer; text-decoration: underline;"><span id="lang-zh">zh</span>/<span id="lang-en">en</span></button>
                <button type="button" id="header-action-btn" style="margin-left: 10px; background: #6c757d; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">设置</button>
            </div>
            <div id="panel-main" style="padding: 10px 15px 15px 15px;">
            <div id="status-info">准备就绪 - 请在页面就绪后手动点击开始</div>
            <div style="margin-top: 10px;">
                <button id="start-extraction" style="
                    background: #007cba;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 10px;
                ">处理当前页</button>
                <button id="copy-results" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: none;
                ">复制到剪贴板</button>
            </div>
            <div id="progress-info" style="margin-top: 10px; font-size: 12px; min-height: 20px;"></div>
            <div id="debug-info" style="margin-top: 10px; font-size: 11px; color: #666; height: 80px; overflow-y: auto; border: 1px solid #eee; padding: 5px;"></div>
            </div>
            <div id="panel-settings" style="display: none; padding: 10px 15px 15px 15px;">
                <div style="margin-bottom: 10px;">
                    <label id="setting-delay-label">子网页打开间隔：</label>
                    <span style="display:inline-block; position: relative; margin-left: 6px;">
                        <input type="number" id="setting-delay" min="0.5" max="20" step="0.5" style="width: 40px; padding-right: 20px;">
                        <span id="setting-delay-unit" style="position:absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #888; pointer-events: none;">秒</span>
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <label id="setting-max-size-label">文件体积上限：</label>
                    <span style="display:inline-block; position: relative; margin-left: 6px;">
                        <input type="number" id="setting-max-size" min="0" max="999" step="0.1" placeholder="设置为0时为无限制" style="width: 40px; padding-right: 20px;">
                        <span style="position:absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #888; pointer-events: none;">gb</span>
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <label>
                        <input type="checkbox" id="setting-subtitle-priority" checked>
                        <span id="setting-subtitle-priority-label">带字幕影片优先</span>
                    </label>
                    <span id="setting-subtitle-min-wrap" style="display:inline-block; position: relative; margin-left: 8px;">
                        <input type="number" id="setting-subtitle-min" min="0" max="999" step="0.1" placeholder="设置为0时为无限制" style="width: 40px; padding-right: 20px;">
                        <span id="setting-subtitle-min-unit" style="position:absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #888; pointer-events: none;">gb</span>
                    </span>
                </div>
                <div style="text-align: center;">
                    <div id="setting-columns-wrap" style="display: inline-block; text-align: left;">
                        <div id="setting-columns-hint" style="margin-bottom: 8px; text-align: center;">复制输出包含的列（取消勾选则不输出该列）：</div>
                        <div id="setting-columns" style="margin-bottom: 12px; font-size: 13px; text-align: left;"></div>
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <label><input type="checkbox" id="setting-header" checked> <span id="setting-header-label">复制时包含表头</span></label>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        const savedPos = loadPanelPosition();
        if (savedPos) {
            panel.style.right = 'auto';
            panel.style.left = savedPos.left + 'px';
            panel.style.top = savedPos.top + 'px';
        }

        // 拖动：按住标题栏空白处在页面内移动，滚动时保持固定（position:fixed）
        (function initDrag() {
            const handle = document.getElementById('panel-drag-handle');
            let startX, startY, startLeft, startTop;

            handle.addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                e.preventDefault();
                const rect = panel.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                panel.style.right = 'auto';
                panel.style.left = startLeft + 'px';
                panel.style.top = startTop + 'px';

                function onMove(e) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    panel.style.left = (startLeft + dx) + 'px';
                    panel.style.top = (startTop + dy) + 'px';
                    startLeft += dx;
                    startTop += dy;
                    startX = e.clientX;
                    startY = e.clientY;
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    const rect = panel.getBoundingClientRect();
                    savePanelPosition(Math.round(rect.left), Math.round(rect.top));
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        })();

        // 设置页：列勾选（列名用 span 便于语言切换时刷新）
        const colsContainer = document.getElementById('setting-columns');
        const lang0 = getLang();
        ALL_COLUMNS.forEach(col => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.marginBottom = '4px';
            label.dataset.column = col;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.column = col;
            const span = document.createElement('span');
            span.textContent = COLUMN_LABELS[lang0][col] || col;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' '));
            label.appendChild(span);
            colsContainer.appendChild(label);
        });

        function showMain() {
            document.getElementById('panel-main').style.display = 'block';
            document.getElementById('panel-settings').style.display = 'none';
        }
        function showSettings() {
            const s = getSettings();
            document.getElementById('setting-delay').value = s.delaySeconds;
            document.getElementById('setting-max-size').value = s.maxFileSizeGb;
            document.getElementById('setting-subtitle-priority').checked = s.subtitlePriorityEnabled;
            document.getElementById('setting-subtitle-min').value = s.subtitleMinSizeGb;
            document.getElementById('setting-header').checked = s.includeHeader;
            ALL_COLUMNS.forEach(col => {
                const cb = document.querySelector(`#setting-columns input[data-column="${col}"]`);
                if (cb) cb.checked = s.visibleColumns.includes(col);
            });
            document.getElementById('panel-main').style.display = 'none';
            document.getElementById('panel-settings').style.display = 'block';
            updateSubtitleMinState();
            refreshUI();
        }

        function saveSettingsFromInputs() {
            const delay = parseFloat(document.getElementById('setting-delay').value);
            const delaySeconds = normalizeOneDecimal(delay, 2, 0.5, 60);
            const maxFileSizeGb = normalizeOneDecimal(parseFloat(document.getElementById('setting-max-size').value), 30, 0, 999);
            const subtitlePriorityEnabled = document.getElementById('setting-subtitle-priority').checked;
            const subtitleMinSizeGb = normalizeOneDecimal(parseFloat(document.getElementById('setting-subtitle-min').value), 1, 0, 999);
            const includeHeader = document.getElementById('setting-header').checked;
            const visibleColumns = ALL_COLUMNS.filter(col => {
                const cb = document.querySelector(`#setting-columns input[data-column="${col}"]`);
                return cb && cb.checked;
            });
            const next = {
                delaySeconds,
                maxFileSizeGb,
                subtitlePriorityEnabled,
                subtitleMinSizeGb,
                visibleColumns: visibleColumns.length ? visibleColumns : [...ALL_COLUMNS],
                includeHeader
            };
            window._magnetExtractorSettings = next;
            saveSettings(next);
            showMain();
            refreshUI();
        }

        document.getElementById('header-action-btn').addEventListener('click', function(e) {
            e.preventDefault();
            const isSettingsVisible = document.getElementById('panel-settings').style.display === 'block';
            if (isSettingsVisible) {
                saveSettingsFromInputs();
            } else {
                showSettings();
            }
        });
        function updateSubtitleMinState() {
            const checked = document.getElementById('setting-subtitle-priority').checked;
            const input = document.getElementById('setting-subtitle-min');
            const wrap = document.getElementById('setting-subtitle-min-wrap');
            const unit = document.getElementById('setting-subtitle-min-unit');
            input.disabled = !checked;
            if (wrap) wrap.style.opacity = checked ? '1' : '0.45';
            if (unit) unit.style.color = checked ? '#888' : '#aaa';
        }
        document.getElementById('setting-subtitle-priority').addEventListener('change', updateSubtitleMinState);

        document.getElementById('lang-switch').addEventListener('click', function() {
            setLang(getLang() === 'zh' ? 'en' : 'zh');
            refreshUI();
        });
        refreshUI();

        // 绑定事件
        document.getElementById('start-extraction').addEventListener('click', startExtraction);
        document.getElementById('copy-results').addEventListener('click', copyResultsToClipboard);
    }

    // 解析文件大小为字节数
    function parseFileSize(sizeStr) {
        if (!sizeStr) return 0;

        const match = sizeStr.trim().match(/([\d.]+)\s*(GB|MB|KB)/i);
        if (!match) return 0;

        const [, num, unit] = match;
        const value = parseFloat(num);

        switch(unit.toUpperCase()) {
            case 'GB': return value * 1024 * 1024 * 1024;
            case 'MB': return value * 1024 * 1024;
            case 'KB': return value * 1024;
            default: return 0;
        }
    }

    async function extractMagnetsFromDetailPage(url, title, currentDoc = null) {
        try {
            addDebugInfo(`正在访问: ${title}`);
            let doc = currentDoc;
            if (!doc) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 30000);
                try {
                    const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    doc = new DOMParser().parseFromString(await response.text(), 'text/html');
                } finally {
                    clearTimeout(timer);
                }
            }
            // 新版列表去掉了 columns/is-desktop；同时兼容旧版结构。
            const magnetItems = doc.querySelectorAll(
                '#magnets-content .item, [data-movie-tab-target="magnets"] .item, .magnet-links .item, .item.columns.is-desktop'
            );
            if (magnetItems.length === 0) {
                addDebugInfo(`  - 未找到磁力链接区块`);
                return null;
            }
            const candidates = [];
            magnetItems.forEach(item => {
                const linkEl = item.querySelector('.magnet-name a[href^="magnet:"]');
                const copyEl = item.querySelector('[data-clipboard-text^="magnet:"]');
                const magnetUrl = linkEl?.getAttribute('href') || copyEl?.getAttribute('data-clipboard-text');
                if (!magnetUrl || !magnetUrl.startsWith('magnet:')) return;
                const metaEl = item.querySelector('.meta');
                const sizeMatch = metaEl && metaEl.textContent.match(/([\d.]+)\s*(GB|MB|KB)/i);
                const fileSizeStr = sizeMatch ? sizeMatch[0].trim() : '';
                const tagEls = item.querySelectorAll('.tags .tag');
                let hasSubtitle = false;
                for (const tag of tagEls) {
                    if (tag.textContent.trim() === '字幕') { hasSubtitle = true; break; }
                }
                const sizeBytes = parseFileSize(fileSizeStr);
                candidates.push({ magnet: magnetUrl, sizeStr: fileSizeStr || '未知', sizeBytes, hasSubtitle });
                addDebugInfo(`  - 候选: ${fileSizeStr || '??'} | 字幕: ${hasSubtitle ? '是' : '否'}`);
            });
            if (candidates.length === 0) {
                addDebugInfo(`  - 无有效磁力链接`);
                return null;
            }
            const s = getSettings();
            const maxBytes = s.maxFileSizeGb > 0 ? s.maxFileSizeGb * 1024 * 1024 * 1024 : 0;
            const subtitleMinBytes = s.subtitleMinSizeGb * 1024 * 1024 * 1024;
            const pool = maxBytes > 0
                ? candidates.filter(c => c.sizeBytes <= maxBytes || c.sizeBytes === 0)
                : candidates;
            if (!pool.length) {
                addDebugInfo('  - 所有磁链均超过文件体积上限');
                return null;
            }
            const sortedPool = pool.sort((a, b) => b.sizeBytes - a.sizeBytes);
            const preferred = s.subtitlePriorityEnabled
                ? sortedPool.filter(c => c.hasSubtitle && c.sizeBytes >= subtitleMinBytes)
                : [];
            const best = preferred.length ? preferred[0] : sortedPool[0];
            addDebugInfo(`  - 选定: ${best.sizeStr} | 字幕: ${best.hasSubtitle ? '是' : '否'}`);
            return { magnet: best.magnet, fileSize: best.sizeStr, hasSubtitle: best.hasSubtitle ? '是' : '否' };
        } catch (error) {
            addDebugInfo(`  - 错误: ${error.message}`);
            return null;
        }
    }

    // 添加调试信息
    function addDebugInfo(message) {
        const debugDiv = document.getElementById('debug-info');
        const timestamp = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.textContent = `[${timestamp}] ${message}`;
        debugDiv.appendChild(line);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }

    // 开始提取当前页面
    async function startExtraction() {
        const statusInfo = document.getElementById('status-info');
        const progressInfo = document.getElementById('progress-info');
        const startBtn = document.getElementById('start-extraction');
        const copyBtn = document.getElementById('copy-results');

        startBtn.disabled = true;
        statusInfo.textContent = t('analyzing');
        const page = (window.location.search.match(/[?&]page=(\d+)/) || [])[1] || 1;
        addDebugInfo(`[开始] 处理当前页面 (页码: ${page})`);

        try {
        const jobs = [];
        const seen = new Set();
        const cleanText = el => (el?.textContent || '').trim().replace(/\s+/g, ' ');
        // 详情页直接读取当前 DOM，支持已经由站点动态加载的磁链。
        if (/^\/v\/[^/]+\/?$/.test(location.pathname)) {
            const heading = document.querySelector('h2.title, h1.title, h1');
            jobs.push({
                url: location.href,
                title: cleanText(heading) || document.title,
                codeName: cleanText(heading?.querySelector('strong')),
                doc: document
            });
        } else {
            for (const link of document.querySelectorAll('.movie-list a[href], .item-box a[href], .item a.box[href]')) {
                const url = new URL(link.getAttribute('href'), location.href);
                if (url.origin !== location.origin || !/^\/v\/[^/]+\/?$/.test(url.pathname)) continue;
                url.search = '';
                url.hash = '';
                if (seen.has(url.href)) continue;
                seen.add(url.href);
                const item = link.closest('.item, .item-box') || link;
                const titleEl = item.querySelector('.video-title') || item.querySelector('.title');
                jobs.push({
                    url: url.href,
                    title: cleanText(titleEl) || cleanText(link) || url.pathname,
                    codeName: cleanText(titleEl?.querySelector('strong')),
                    doc: null
                });
            }
        }
        if (!jobs.length) {
            statusInfo.textContent = t('noItems');
            addDebugInfo('[错误] 未找到电影项目');
            return;
        }
        addDebugInfo(`[分析] 找到 ${jobs.length} 个电影项目`);
        const results = [];
        let processedCount = 0;
        for (let i = 0; i < jobs.length; i++) {
            const { url, title, codeName, doc } = jobs[i];
            // 更新进度
            processedCount++;
            progressInfo.textContent = t('progress') + processedCount + '/' + jobs.length;
            statusInfo.textContent = t('processing') + title;
            addDebugInfo(`[处理] ${title}`);

            // 提取磁力链接（增强版）
            const magnet = await extractMagnetsFromDetailPage(url, title, doc);

            results.push({
                番号名: codeName,
                电影名: title,
                电影链接: url,
                磁力链接: magnet ? magnet.magnet : '',
                文件体积: magnet ? magnet.fileSize : '',
                是否有字幕: magnet ? magnet.hasSubtitle : ''
            });

            // 可配置延迟，避免请求过于频繁
            const delayMs = (getSettings().delaySeconds || 2) * 1000;
            if (i + 1 < jobs.length) await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // 初始化全局存储（如果不存在）
        if (!window.allExtractionResults) {
            window.allExtractionResults = [];
        }

        // 将当前页面结果追加到全局数组
        window.allExtractionResults = window.allExtractionResults.concat(results);

        statusInfo.textContent = t('pageDone') + results.length + t('resultsTotal') + window.allExtractionResults.length + t('totalSuffix');
        addDebugInfo(`[完成] 当前页提取 ${results.length} 个，总计 ${window.allExtractionResults.length} 个`);
        copyBtn.style.display = 'inline-block';
        } catch (error) {
            statusInfo.textContent = t('error') + error.message;
            addDebugInfo(`[错误] ${error.message}`);
        } finally {
            startBtn.disabled = false;
        }
    }

    // 复制结果到剪贴板（Tab 分隔，按设置只输出勾选的列）
    async function copyResultsToClipboard() {
        if (!window.allExtractionResults || window.allExtractionResults.length === 0) {
            alert(t('noResults'));
            return;
        }

        const s = getSettings();
        const cols = (s.visibleColumns && s.visibleColumns.length) ? s.visibleColumns : ALL_COLUMNS;
        const lang = getLang();
        const TAB = '\t';
        const rows = [];
        if (s.includeHeader) {
            rows.push(cols.map(k => COLUMN_LABELS[lang][k] || k).join(TAB));
        }
        rows.push(...window.allExtractionResults.map(item => cols.map(key => item[key] || '').join(TAB)));
        const fullContent = '\uFEFF' + rows.join('\n');

        try {
            await navigator.clipboard.writeText(fullContent);
            const statusInfo = document.getElementById('status-info');
            const originalText = statusInfo.textContent;
            statusInfo.textContent = t('copied') + window.allExtractionResults.length + t('toClipboard');
            statusInfo.style.color = '#28a745';
            setTimeout(() => {
                statusInfo.textContent = originalText;
                statusInfo.style.color = '';
            }, 2000);
        } catch (err) {
            alert(t('copyFail'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createControlPanel);
    } else {
        createControlPanel();
    }
})();
