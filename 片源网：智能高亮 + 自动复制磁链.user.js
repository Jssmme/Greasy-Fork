// ==UserScript==
// @name         片源网：智能高亮 + 自动复制磁链
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      2.3
// @description  智能高亮 + 自动复制磁链
// @author       JSSM
// @license      MIT
// @match        https://pianyuan.org/m_*
// @match        https://pianyuan.org/r_*
// @match        https://pianyuan.cc/m_*
// @match        https://pianyuan.cc/r_*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E7%89%87%E6%BA%90%E7%BD%91%EF%BC%9A%E6%99%BA%E8%83%BD%E9%AB%98%E4%BA%AE%20%2B%20%E8%87%AA%E5%8A%A8%E5%A4%8D%E5%88%B6%E7%A3%81%E9%93%BE.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E7%89%87%E6%BA%90%E7%BD%91%EF%BC%9A%E6%99%BA%E8%83%BD%E9%AB%98%E4%BA%AE%20%2B%20%E8%87%AA%E5%8A%A8%E5%A4%8D%E5%88%B6%E7%A3%81%E9%93%BE.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 注入高亮样式
    const styles = `
        .qwen-hl-gold { background-color: #fff8e1 !important; color: #e65100 !important; border: 1px solid #ff9800 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; }
        .qwen-hl-orange { background-color: #fff3e0 !important; color: #ef6c00 !important; border: 1px solid #fb8c00 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; }
        .qwen-hl-green { background-color: #e8f5e9 !important; color: #1b5e20 !important; border: 1px solid #4caf50 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; }
        .qwen-hl-blue { background-color: #e3f2fd !important; color: #0d47a1 !important; border: 1px solid #2196f3 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; }
        .qwen-hl-purple { background-color: #f3e5f5 !important; color: #4a148c !important; border: 1px solid #9c27b0 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; }
        .qwen-hl-red { background-color: #ffebee !important; color: #b71c1c !important; border: 1px solid #f44336 !important; padding: 1px 4px !important; border-radius: 3px !important; font-weight: 700 !important; margin: 0 1px !important; display: inline-block !important; text-decoration: line-through !important; opacity: 0.9 !important; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // 2. 定义关键词规则
    const highlightRules = [
        // --- 金色：完整未删减/特别版 ---
        ['INTEGRAL+CUT', 'qwen-hl-gold', 2],
        ['EXTENDED+CUT', 'qwen-hl-gold', 2],
        ['DIRECTOR+S+CUT', 'qwen-hl-gold', 3],
        ['DIRECTOR+CUT', 'qwen-hl-gold', 2],
        ['Extend+Edtion', 'qwen-hl-orange', 2],
        ['UNCUT', 'qwen-hl-gold', 1],
        ['CRITERION', 'qwen-hl-gold', 1],
        ['CC', 'qwen-hl-gold', 1],
        ['RESTORED', 'qwen-hl-gold', 1],
        ['REMASTERED', 'qwen-hl-gold', 1],
        ['COMPLETE', 'qwen-hl-gold', 1],
        ['PROPER', 'qwen-hl-gold', 1],
        ['MULTI', 'qwen-hl-gold', 1],
        ['DIY', 'qwen-hl-gold', 1],
        ['EXTENDED', 'qwen-hl-gold', 1], // 单独出现的 Extended 也高亮
        ['THEATRICAL', 'qwen-hl-orange', 1],

        // --- 橙色：国际版/剧场版 ---
        ['INTERNATIONAL+VERSION', 'qwen-hl-orange', 2],
        ['THEATRICAL+VERSION', 'qwen-hl-orange', 2],
        ['EXTENDED+VERSION', 'qwen-hl-gold', 2],

        // --- 绿色：原盘/高画质 ---
        ['REMUX', 'qwen-hl-green', 1],
        ['BLURAY', 'qwen-hl-green', 1],
        ['BLU-RAY', 'qwen-hl-green', 1],
        ['BDREMUX', 'qwen-hl-green', 1],
        ['UHD', 'qwen-hl-green', 1],
        ['2160P', 'qwen-hl-green', 1],
        ['4K', 'qwen-hl-green', 1],
        ['1080P', 'qwen-hl-green', 1],
        ['1080I', 'qwen-hl-green', 1],
        ['720P', 'qwen-hl-green', 1],
        ['AVC', 'qwen-hl-green', 1],
        ['MPEG-2', 'qwen-hl-green', 1],
        ['MPEG2', 'qwen-hl-green', 1],
        ['LPCM', 'qwen-hl-green', 1],

        // --- 蓝色：编码/音效/HDR ---
        ['X265', 'qwen-hl-blue', 1],
        ['H265', 'qwen-hl-blue', 1],
        ['HEVC', 'qwen-hl-blue', 1],
        ['X264', 'qwen-hl-blue', 1],
        ['H264', 'qwen-hl-blue', 1],
        ['AV1', 'qwen-hl-blue', 1],
        ['10BIT', 'qwen-hl-blue', 1],
        ['8BIT', 'qwen-hl-blue', 1],
        ['HDR', 'qwen-hl-blue', 1],
        ['DV', 'qwen-hl-blue', 1],
        ['DOVI', 'qwen-hl-blue', 1],
        ['DOLBY+VISION', 'qwen-hl-blue', 2],
        ['DTSHD', 'qwen-hl-blue', 1],
        ['DTS+HD', 'qwen-hl-blue', 2],
        ['TRUEHD', 'qwen-hl-blue', 1],
        ['ATMOS', 'qwen-hl-blue', 1],
        ['SDR', 'qwen-hl-blue', 1],
        ['AAC', 'qwen-hl-blue', 1],
        ['FLAC', 'qwen-hl-blue', 1],
        ['OPUS', 'qwen-hl-blue', 1],
        ['DTS', 'qwen-hl-blue', 1],
        ['MA', 'qwen-hl-blue', 1],
        ['DDP', 'qwen-hl-blue', 1],
        ['DD', 'qwen-hl-blue', 1],

        // --- 紫色：发布组 ---
        ['SWTYBLZ', 'qwen-hl-purple', 1],
        ['FGT', 'qwen-hl-purple', 1],
        ['B0MBARDIERS', 'qwen-hl-purple', 1],
        ['BOMBARDIERS', 'qwen-hl-purple', 1],
        ['NAHOM', 'qwen-hl-purple', 1],
        ['SONYHD', 'qwen-hl-purple', 1],
        ['WIKI', 'qwen-hl-purple', 1],
        ['FRAMESTOR', 'qwen-hl-purple', 1],
        ['DON', 'qwen-hl-purple', 1],
        ['LIME', 'qwen-hl-purple', 1],
        ['TERMINAL', 'qwen-hl-purple', 1],
        ['TERMINAL', 'qwen-hl-purple', 1], // 兼容大小写
        ['DREAMHD', 'qwen-hl-purple', 1],
        ['PANAM', 'qwen-hl-purple', 1],
        ['DDR', 'qwen-hl-purple', 1],
        ['DTONE', 'qwen-hl-purple', 1],
        ['CHDBITS', 'qwen-hl-purple', 1],
        ['HDCHINA', 'qwen-hl-purple', 1],
        ['YELLOWBEAST', 'qwen-hl-purple', 1],
        ['GRYM', 'qwen-hl-purple', 1],
        ['CTRLHD', 'qwen-hl-purple', 1],
        ['OFT', 'qwen-hl-purple', 1],
        ['WPI', 'qwen-hl-purple', 1],
        ['NOWYS', 'qwen-hl-purple', 1],
        ['CMCT', 'qwen-hl-purple', 1],
        ['HDBITS', 'qwen-hl-purple', 1],
        ['BEAST', 'qwen-hl-purple', 1],
        ['HDS', 'qwen-hl-purple', 1],
        ['EUREKA', 'qwen-hl-purple', 1],

        // --- 红色：低质 ---
        ['CREEPERS+VERSION', 'qwen-hl-red', 2],
        ['CAM', 'qwen-hl-red', 1],
        ['TS', 'qwen-hl-red', 1],
        ['SCR', 'qwen-hl-red', 1],
        ['HC', 'qwen-hl-red', 1],
        ['WORKPRINT', 'qwen-hl-red', 1]
    ];

    // 辅助函数：清理片段以便匹配 (去除所有非字母数字，转大写)
    function normalizeSegment(seg) {
        return seg.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    // 3. 高亮执行函数
    function applyHighlights() {
        const links = document.querySelectorAll('div.related.allres table.data tr td a');
        if (links.length === 0) return;

        links.forEach(link => {
            if (link.querySelector('[class^="qwen-hl-"]')) return;

            const originalText = link.innerText;

            // 【关键修改】分词正则：同时支持 空格、点号、连字符
            // 这样 "Extended-Cut", "Extended.Cut", "Extended Cut" 都会变成 ["Extended", "Cut"]
            let segments = originalText.split(/[\s.\-]+/);
            segments = segments.filter(s => s.trim() !== '');

            // 检测原始主要分隔符，用于非高亮部分的重建 (虽然高亮块内部我们统一用空格)
            let separator = '.';
            if (originalText.includes(' ') && !originalText.includes('.')) {
                separator = ' ';
            } else if ((originalText.match(/\s+/g) || []).length > (originalText.match(/\./g) || []).length) {
                separator = ' ';
            }

            let skip = new Array(segments.length).fill(false);
            let htmlParts = new Array(segments.length).fill(null);

            // --- 第一步：优先匹配多段组合词 ---
            for (const [ruleKey, className, segmentCount] of highlightRules) {
                if (segmentCount === 1) continue;
                const ruleParts = ruleKey.split('+');

                for (let i = 0; i <= segments.length - segmentCount; i++) {
                    if (skip[i]) continue;
                    let occupied = false;
                    for (let k = 1; k < segmentCount; k++) {
                        if (skip[i+k]) { occupied = true; break; }
                    }
                    if (occupied) continue;

                    let match = true;
                    for (let k = 0; k < segmentCount; k++) {
                        if (normalizeSegment(segments[i+k]) !== ruleParts[k]) {
                            match = false;
                            break;
                        }
                    }

                    if (match) {
                        let combinedHtml = [];
                        for (let k = 0; k < segmentCount; k++) {
                            skip[i+k] = true;
                            // 高亮块内部统一用空格连接，看起来更整洁，也解决了原分隔符混乱的问题
                            if (k > 0) combinedHtml.push(' ');
                            combinedHtml.push(segments[i+k]);
                        }
                        htmlParts[i] = `<span class="${className}">${combinedHtml.join('')}</span>`;
                    }
                }
            }

            // --- 第二步：匹配单段词 ---
            for (let i = 0; i < segments.length; i++) {
                if (skip[i]) continue;
                const seg = segments[i];
                const cleanSeg = normalizeSegment(seg);
                let matchedClass = null;

                for (const [ruleKey, className, segmentCount] of highlightRules) {
                    if (segmentCount !== 1) continue;
                    if (cleanSeg === ruleKey) {
                        matchedClass = className;
                        break;
                    }
                }

                if (matchedClass) {
                    htmlParts[i] = `<span class="${matchedClass}">${seg}</span>`;
                } else {
                    htmlParts[i] = seg;
                }
            }

            // --- 第三步：组装 ---
            let finalHtmlParts = [];
            for (let i = 0; i < segments.length; i++) {
                if (htmlParts[i] !== null) {
                    finalHtmlParts.push(htmlParts[i]);
                }
            }
            // 非高亮部分之间使用检测到的分隔符，高亮块内部已经是完整的 span 了
            // 注意：因为 split 丢弃了所有分隔符，这里 join 会把原本可能是 "-" 的地方变成 "." 或 " "
            // 为了视觉一致性，这是可接受的妥协。
            link.innerHTML = finalHtmlParts.join(separator);
        });
    }

    // 4. 自动复制磁链
    function copyMagnets() {
        if (!window.location.pathname.startsWith('/r_')) return;
        var magnets = document.querySelectorAll('a.btn-primary.btn-sm');
        magnets.forEach(function(magnetElement) {
            if (magnetElement.getAttribute('data-copied') === 'true') return;
            var magnetText = magnetElement.getAttribute('href');
            if (!magnetText) return;
            var match = magnetText.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+/i);
            if (match && match[0]) {
                GM_setClipboard(match[0], 'text');
                magnetElement.innerHTML = magnetElement.innerHTML.replace('点击使用磁力下载', '磁力已复制到剪贴板');
                magnetElement.setAttribute('data-copied', 'true');
            }
        });
    }

    // 5. 初始化
    function init() {
        const path = window.location.pathname;
        if (path.startsWith('/m_')) setTimeout(applyHighlights, 300);
        if (path.startsWith('/r_')) setTimeout(copyMagnets, 300);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
