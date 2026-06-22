// ==UserScript==
// @name         豆瓣观影记录一键复制
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      0.9
// @description  在「我看过的影视」翻页区增加「复制」按钮，一键复制本页条目（片名、年份、主要演职员、评分、日期、短评）供粘贴分析
// @author       JSSM
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @match        *://movie.douban.com/people/*/collect*
// @grant        none
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E8%A7%82%E5%BD%B1%E8%AE%B0%E5%BD%95%E4%B8%80%E9%94%AE%E5%A4%8D%E5%88%B6.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E8%A7%82%E5%BD%B1%E8%AE%B0%E5%BD%95%E4%B8%80%E9%94%AE%E5%A4%8D%E5%88%B6.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ========== 工具函数（保留自原脚本） ==========

    function isLikelyCountryOrRegion(s) {
        if (!s) return true;
        if (
            /^(中国大陆|中国香港|中国台湾|美国|日本|韩国|法国|英国|德国|印度|意大利|西班牙|俄罗斯|加拿大|澳大利亚|波兰|丹麦|泰国|越南|巴西|墨西哥|瑞典|比利时|荷兰|挪威|芬兰|新西兰|爱尔兰|奥地利|瑞士|匈牙利|土耳其|伊朗|以色列|阿根廷|智利|捷克|罗马尼亚|希腊|南非|埃及|新加坡|马来西亚|印度尼西亚|菲律宾|巴基斯坦|乌克兰|卡塔尔|阿联酋|葡萄牙|哥伦比亚|秘鲁|乌拉圭|新西兰|澳大利亚)/.test(
                s
            )
        ) {
            return true;
        }
        if (/国$/.test(s) && s.length <= 4) return true;
        return false;
    }

    function isReleaseDateSegment(s) {
        return /^\d{4}-\d{2}-\d{2}/.test((s || '').trim());
    }

    function isDurationSegment(s) {
        const t = (s || '').trim();
        return /^\d+分钟/.test(t) || /^\d+min$/i.test(t);
    }

    function parseIntro(intro) {
        if (!intro) return { year: '', principalCast: '' };
        const yearMatch = intro.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : '';
        const parts = intro.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
        let i = 0;
        while (i < parts.length && isReleaseDateSegment(parts[i])) {
            i++;
        }
        const cast = [];
        while (i < parts.length) {
            const p = parts[i];
            if (isLikelyCountryOrRegion(p) || isDurationSegment(p)) break;
            cast.push(p);
            i++;
        }
        return { year, principalCast: cast.join(' / ') };
    }

    function getRatingStars(item) {
        const el = item.querySelector(
            'span.rating1-t, span.rating2-t, span.rating3-t, span.rating4-t, span.rating5-t'
        );
        if (!el || !el.className) return '';
        const m = el.className.match(/rating(\d)-t/);
        return m ? m[1] : '';
    }

    function getTitle(item) {
        const em = item.querySelector('li.title em');
        return em ? em.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
        } finally {
            document.body.removeChild(ta);
        }
        return Promise.resolve();
    }

    // ========== 核心：从指定 document 提取本页文本 ==========

    function buildExportTextFromDoc(doc) {
        const items = Array.from(
            doc.querySelectorAll('.grid-view .item.comment-item')
        ).reverse();
        const blocks = items.map(function (item) {
            const title = getTitle(item);
            const introEl = item.querySelector('li.intro');
            const intro = introEl
                ? introEl.textContent.replace(/\s+/g, ' ').trim()
                : '';
            const { year, principalCast } = parseIntro(intro);
            const stars = getRatingStars(item);
            const dateEl = item.querySelector('span.date');
            const date = dateEl ? dateEl.textContent.trim() : '';
            const commentEl = item.querySelector('span.comment');
            const comment = commentEl
                ? commentEl.textContent.replace(/\s+/g, ' ').trim()
                : '';

            return [
                '【' + title + '】',
                '年份：' + (year || '—'),
                '主要演职员：' + (principalCast || '—'),
                '评分：' + (stars ? stars + '/5' : '—'),
                '评价日期：' + (date || '—'),
                '短评：' + (comment || '—'),
                '---'
            ].join('\n');
        });
        return blocks.join('\n');
    }

    function buildExportText() {
        return buildExportTextFromDoc(document);
    }

    // ========== 翻页相关 ==========

    /** 从当前 URL 解析 start 参数 */
    function getCurrentStart() {
        var url = new URL(window.location.href);
        return parseInt(url.searchParams.get('start')) || 0;
    }

    /** 获取总页数（来自 paginator 中 span.thispage 的 data-total-page） */
    function getTotalPages() {
        var el = document.querySelector('.paginator span.thispage');
        if (el && el.dataset.totalPage) {
            return parseInt(el.dataset.totalPage) || 0;
        }
        return 0;
    }

    /** 获取当前页码（从 URL start 推算，1-indexed） */
    function getCurrentPage() {
        return Math.floor(getCurrentStart() / 15) + 1;
    }

    /** 构建指定 start 偏移量的页面 URL */
    function getPageUrl(offsetStart) {
        var url = new URL(window.location.href);
        url.searchParams.set('start', String(offsetStart));
        return url.toString();
    }

    /** 后台抓取并解析一页 */
    function fetchPage(offsetStart) {
        var url = getPageUrl(offsetStart);
        return fetch(url, { credentials: 'include' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                var parser = new DOMParser();
                return parser.parseFromString(html, 'text/html');
            });
    }

    // ========== 批量复制 ==========

    /**
     * 批量复制指定页数
     * @param {number} pageCount 要复制的页数（含当前页）
     * @param {HTMLElement} btn  按钮元素，用于更新状态文字
     */
    function batchCopy(pageCount, btn) {
        var originalText = btn.textContent;
        btn.textContent = '复制中...';
        btn.style.color = '#999';
        btn.style.cursor = 'default';

        var currentStart = getCurrentStart();
        var totalPages = getTotalPages();
        var currentPageNum = getCurrentPage();

        // 如果知道总页数，限制不超过剩余页数
        var actualCount = pageCount;
        if (totalPages > 0) {
            var remaining = totalPages - currentPageNum + 1;
            if (remaining < actualCount) {
                actualCount = remaining;
            }
        }

        var allTexts = [];
        // 第 1 页：当前已加载页面
        allTexts.push(buildExportText());

        // 组装后续页面抓取任务（后台并行抓取）
        var fetchPromises = [];
        for (var i = 1; i < actualCount; i++) {
            (function (pageIndex) {
                var pageStart = currentStart + pageIndex * 15;
                var p = fetchPage(pageStart).then(
                    function (doc) {
                        var text = buildExportTextFromDoc(doc);
                        allTexts.push(text);
                        btn.textContent =
                            '复制中(' + (allTexts.length) + '/' + actualCount + ')...';
                    },
                    function (err) {
                        console.warn(
                            '[豆瓣批量复制] 抓取第 ' + (currentPageNum + pageIndex) + ' 页失败 (start=' + pageStart + '):',
                            err
                        );
                        btn.textContent =
                            '复制中(' + allTexts.length + '/' + actualCount + ')... 第' + (currentPageNum + pageIndex) + '页失败';
                    }
                );
                fetchPromises.push(p);
            })(i);
        }

        Promise.all(fetchPromises).then(function () {
            // 反转页面顺序：最后一页（最早记录）在前，当前页（最新记录）在后
var combined = allTexts.reverse().join('\n');
            return copyText(combined).then(
                function () {
                    btn.textContent = '成功(' + allTexts.length + '页)';
                    btn.style.color = '#37a';
                    btn.style.cursor = 'pointer';
                    window.setTimeout(function () {
                        btn.textContent = originalText;
                    }, 2000);
                },
                function () {
                    btn.textContent = '复制失败';
                    btn.style.color = '#f00';
                    btn.style.cursor = 'pointer';
                    window.setTimeout(function () {
                        btn.textContent = originalText;
                        btn.style.color = '#37a';
                    }, 2000);
                }
            );
        }).catch(function (err) {
            console.error('[豆瓣批量复制] 出错:', err);
            btn.textContent = '失败';
            btn.style.color = '#f00';
            btn.style.cursor = 'pointer';
            window.setTimeout(function () {
                btn.textContent = originalText;
                btn.style.color = '#37a';
            }, 2000);
        });
    }

    // ========== 插入按钮 ==========

    function insertButtons() {
        var paginator = document.querySelector('.paginator');
        var prev = paginator && paginator.querySelector('span.prev');
        if (!paginator || !prev) return;

        // ---- 单页复制按钮（保留原功能） ----
        if (!paginator.querySelector('.db-collect-copy-btn')) {
            var btn = document.createElement('a');
            btn.href = 'javascript:;';
            btn.className = 'db-collect-copy-btn';
            btn.textContent = '复制';
            btn.setAttribute('rel', 'nofollow');
            Object.assign(btn.style, {
                cursor: 'pointer',
                marginRight: '12px',
                color: '#37a',
                textDecoration: 'none'
            });
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var text = buildExportText();
                copyText(text).then(
                    function () {
                        btn.textContent = '成功';
                        window.setTimeout(function () {
                            btn.textContent = '复制';
                        }, 2000);
                    },
                    function () {
                        btn.textContent = '失败';
                        window.setTimeout(function () {
                            btn.textContent = '复制';
                        }, 2000);
                    }
                );
            });
            prev.parentNode.insertBefore(btn, prev);
        }

        // ---- 批量复制 3 页按钮（测试版） ----
        if (!paginator.querySelector('.db-collect-batch-copy-btn')) {
            var batchBtn = document.createElement('a');
            batchBtn.href = 'javascript:;';
            batchBtn.className = 'db-collect-batch-copy-btn';
            batchBtn.textContent = '批量复制(全部)';
            batchBtn.setAttribute('rel', 'nofollow');
            Object.assign(batchBtn.style, {
                cursor: 'pointer',
                marginRight: '12px',
                color: '#37a',
                textDecoration: 'none'
            });
            batchBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var total = getTotalPages();
                batchCopy(total, batchBtn);
            });
            prev.parentNode.insertBefore(batchBtn, prev);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertButtons);
    } else {
        insertButtons();
    }
})();
