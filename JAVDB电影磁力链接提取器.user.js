// ==UserScript==
// @name         JAVDB电影磁力链接提取器
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      3.2
// @description  手动切换页面处理，结果复制到剪贴板，支持所有 javdb/javdb数字.com
// @author       JSSM
// @include      https://javdb*.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

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
            " title="按住此处可拖动窗口">
                <h3 style="margin: 0; color: #007cba; pointer-events: none;">MUMU磁力链接提取器</h3>
            </div>
            <div style="padding: 10px 15px 15px 15px;">
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
        `;

        document.body.appendChild(panel);

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
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        })();

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

    async function extractMagnetsFromDetailPage(url, title) {
        try {
            addDebugInfo(`正在访问: ${title}`);
            const response = await fetch(url);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const magnetItems = doc.querySelectorAll('.item.columns.is-desktop');
            if (magnetItems.length === 0) {
                addDebugInfo(`  - 未找到磁力链接区块`);
                return null;
            }
            const candidates = [];
            magnetItems.forEach(item => {
                const linkEl = item.querySelector('.magnet-name a');
                if (!linkEl) return;
                const magnetUrl = linkEl.getAttribute('href');
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
            const FOUR_GB = 4 * 1024 * 1024 * 1024;
            const withSub = candidates.filter(c => c.hasSubtitle && c.sizeBytes >= FOUR_GB);
            const best = (withSub.length ? withSub : candidates).reduce((a, b) => a.sizeBytes > b.sizeBytes ? a : b);
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
        debugDiv.innerHTML += `[${timestamp}] ${message}<br>`;
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }

    // 开始提取当前页面
    async function startExtraction() {
        const statusInfo = document.getElementById('status-info');
        const progressInfo = document.getElementById('progress-info');
        const startBtn = document.getElementById('start-extraction');
        const copyBtn = document.getElementById('copy-results');

        startBtn.disabled = true;
        statusInfo.textContent = '正在分析当前页面...';
        const page = (window.location.search.match(/[?&]page=(\d+)/) || [])[1] || 1;
        addDebugInfo(`[开始] 处理当前页面 (页码: ${page})`);

        // 获取所有电影项目
        const items = document.querySelectorAll('.movie-list .item, .item-box, .item');
        if (items.length === 0) {
            statusInfo.textContent = '未找到电影项目';
            addDebugInfo('[错误] 未找到电影项目');
            startBtn.disabled = false;
            return;
        }
        addDebugInfo(`[分析] 找到 ${items.length} 个电影项目`);

        const results = [];
        let processedCount = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const linkElement = item.querySelector('a.box') || item.querySelector('a');
            if (!linkElement) {
                addDebugInfo(`[跳过] 第 ${i+1} 个项目没有找到链接元素`);
                continue;
            }
            const relativeUrl = linkElement.getAttribute('href');
            if (!relativeUrl) {
                addDebugInfo(`[跳过] 第 ${i+1} 个项目没有href属性`);
                continue;
            }

            const url = new URL(relativeUrl, window.location.origin).href;

            // 获取标题：优先从 .video-title 提取完整文本（含番号）
            let title = '';
            const videoTitleElement = item.querySelector('.video-title') ||
                                  linkElement.querySelector('.video-title');

            if (videoTitleElement) {
                // 直接取整个文本内容，并压缩连续空白为单空格
                title = videoTitleElement.textContent.trim().replace(/\s+/g, ' ');
            } else {
                // 降级方案：尝试其他常见类名
                const fallbackTitleEl = item.querySelector('.title') ||
                                        linkElement.querySelector('.title') ||
                                        linkElement;
                title = fallbackTitleEl ? fallbackTitleEl.textContent.trim().replace(/\s+/g, ' ') : '';
            }

            // 不再删除番号！番号是标题的一部分
            if (!title) {
                title = `未知标题_${i + 1}`;
            }

            // 番号名：从 .video-title 内的 <strong> 提取（如 KTRA-767）
            let codeName = '';
            const strongEl = videoTitleElement ? videoTitleElement.querySelector('strong') : item.querySelector('.video-title strong');
            if (strongEl) {
                codeName = strongEl.textContent.trim();
            }
            if (!codeName) {
                const codeMatch = relativeUrl.match(/\/v\/([^/?]+)/);
                codeName = codeMatch ? codeMatch[1] : (relativeUrl.split('/').filter(Boolean).pop() || '');
            }

            if (!url) continue;

            // 更新进度
            processedCount++;
            progressInfo.textContent = `进度: ${processedCount}/${items.length}`;
            statusInfo.textContent = `正在处理: ${title}`;
            addDebugInfo(`[处理] ${title}`);

            // 提取磁力链接（增强版）
            const magnet = await extractMagnetsFromDetailPage(url, title);

            results.push({
                番号名: codeName,
                电影名: title,
                电影链接: url,
                磁力链接: magnet ? magnet.magnet : '',
                文件体积: magnet ? magnet.fileSize : '',
                是否有字幕: magnet ? magnet.hasSubtitle : ''
            });

            // 延迟一下避免请求过于频繁
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 初始化全局存储（如果不存在）
        if (!window.allExtractionResults) {
            window.allExtractionResults = [];
        }

        // 将当前页面结果追加到全局数组
        window.allExtractionResults = window.allExtractionResults.concat(results);

        statusInfo.textContent = `当前页完成！共提取 ${results.length} 个结果，总计 ${window.allExtractionResults.length} 个`;
        addDebugInfo(`[完成] 当前页提取 ${results.length} 个，总计 ${window.allExtractionResults.length} 个`);
        copyBtn.style.display = 'inline-block';
        startBtn.disabled = false;
    }

    // 复制结果到剪贴板（Tab 分隔，UTF-8 BOM 便于 Excel 识别中文）
    async function copyResultsToClipboard() {
        if (!window.allExtractionResults || window.allExtractionResults.length === 0) {
            alert('没有可复制的结果');
            return;
        }

        const TAB = '\t';
        const headers = ['番号名', '电影名', '电影链接', '磁力链接', '文件体积', '是否有字幕'];
        const rows = [
            headers.join(TAB),
            ...window.allExtractionResults.map(item => [
                item.番号名 || '',
                item.电影名 || '',
                item.电影链接 || '',
                item.磁力链接 || '',
                item.文件体积 || '',
                item.是否有字幕 || ''
            ].join(TAB))
        ];
        const fullContent = '\uFEFF' + rows.join('\n');

        try {
            await navigator.clipboard.writeText(fullContent);
            const statusInfo = document.getElementById('status-info');
            const originalText = statusInfo.textContent;
            statusInfo.textContent = `已复制 ${window.allExtractionResults.length} 条到剪贴板`;
            statusInfo.style.color = '#28a745';
            setTimeout(() => {
                statusInfo.textContent = originalText;
                statusInfo.style.color = '';
            }, 2000);
        } catch (err) {
            alert('复制到剪贴板失败，请确保页面为 HTTPS 或尝试手动选择后复制');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createControlPanel);
    } else {
        createControlPanel();
    }
})();
