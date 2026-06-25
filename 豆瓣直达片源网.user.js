// ==UserScript==
// @name         豆瓣直达片源网
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      1.0.02
// @description  在豆瓣电影页面新增一个按钮直达片源网搜索结果
// @author       JSSM
// @match        *://movie.douban.com/subject/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @grant        GM_setClipboard
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E7%9B%B4%E8%BE%BE%E7%89%87%E6%BA%90%E7%BD%91.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E7%9B%B4%E8%BE%BE%E7%89%87%E6%BA%90%E7%BD%91.user.js
// ==/UserScript==

(function() {
    'use strict';

    const sites = [
		{ name: 'to：片源网',         url: 'https://pianyuan.org/search?q=',                mode: 'tt' },
//		{ name: 'to：RARBG',          url: 'https://therarbg.com/get-posts/?keywords=',     mode: 'tt' },
		{ name: 'to：TorrentDownload', url: 'https://www.torrentdownload.info/search?q=',  mode: 'nameEN' },
		{ name: 'to：杰士凡',         url: 'https://www.jiesfan.com/search/',               mode: 'nameCN' },
		{ name: 'to：megapeer',       url: 'https://megapeer.vip/browse.php?search=',      mode: 'nameEN' },
//        { name: 'to：黑马',       url: 'https://heimawo.top/search?keyword=',         mode: 'nameCN' },
		{ name: 'to：BTSearch',       url: 'https://www.btsearch.love/en/search?keyword=',  mode: 'nameEN' },
		{ name: '磁力魔',           url: 'https://cilimo.com/?q=',                          mode: 'nameEN' },
		{ name: 'to：字幕库',        url: 'https://zimuku.org/search?q=',                   mode: 'tt' },
    ];

    // =====================================================
    //  获取 IMDb ID
    // =====================================================
    const infoDiv = document.getElementById('info');
    const plSpans = infoDiv.querySelectorAll('.pl');

    let imdbIdElement = null;
    const imdbSpan = Array.from(plSpans).find(s => s.textContent.includes('IMDb:'));
    if (imdbSpan) {
        const nextNode = imdbSpan.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
            const id = nextNode.textContent.trim();
            if (id.startsWith('tt')) {
                imdbIdElement = { span: imdbSpan, idNode: nextNode };
            }
        }
    }
    if (!imdbIdElement) return;
    const imdbId = imdbIdElement.idNode.textContent.trim();

    // =====================================================
    //  获取年份、英文名、中文名
    // =====================================================
    const yearEl = document.querySelector('span.year');
    const year = yearEl ? yearEl.textContent.replace(/[()\s]/g, '') : '';

    function getAkaText() {
        for (const span of infoDiv.querySelectorAll('.pl')) {
            if (span.textContent.includes('又名:')) {
                let text = '';
                let node = span.nextSibling;
                while (node && node.nodeName !== 'BR') {
                    text += node.textContent || '';
                    node = node.nextSibling;
                }
                return text.trim();
            }
        }
        return '';
    }

    function extractEnglishName() {
        const h1Span = document.querySelector('h1 span[property="v:itemreviewed"]');
        const fullTitle = h1Span ? h1Span.textContent.trim() : '';

        const alphaMatch = fullTitle.match(/[a-zA-Z][\sa-zA-Z0-9&'.!?,\/:\-#]*/);
        if (alphaMatch) {
            const candidate = alphaMatch[0].trim();
            if (/[a-zA-Z]/.test(candidate)) return candidate;
        }

        const aka = getAkaText();
        if (aka) {
            const parts = aka.split('/').map(s => s.trim());
            for (const part of parts) {
                if (/[a-zA-Z]/.test(part)) return part;
            }
        }

        return fullTitle;
    }

    function extractChineseName() {
        const h1Span = document.querySelector('h1 span[property="v:itemreviewed"]');
        const fullTitle = h1Span ? h1Span.textContent.trim() : '';
        if (!fullTitle) return '';
        const spaceIndex = fullTitle.indexOf(' ');
        return spaceIndex > 0 ? fullTitle.substring(0, spaceIndex).trim() : fullTitle;
    }

    const englishName = extractEnglishName();
    const chineseName = extractChineseName();

    // =====================================================
    //  生成搜索 query
    // =====================================================
    function buildSearchQuery(site) {
        if (site.mode === 'nameEN') {
            return (englishName + ' ' + year)
                .replace(/\s+/g, '+')
                .replace(/\+$/, '')
                .replace(/^\+/, '');
        }
        if (site.mode === 'nameCN') {
            return encodeURIComponent(chineseName);
        }
        return encodeURIComponent(imdbId);
    }

    // =====================================================
    //  写剪贴板：GM API → Clipboard API → execCommand 降级
    // =====================================================
    function copyToClipboard(text) {
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text);
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            return;
        }
        fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    // =====================================================
    //  生成链接行，点击时复制关键词
    // =====================================================
    function createLinkRow(siteName, searchUrl, keyword) {
        const lineBreak = document.createElement('br');

        const link = document.createElement('a');
        link.href = searchUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.innerText = siteName;

        link.addEventListener('click', () => copyToClipboard(keyword));

        const span = document.createElement('span');
        span.classList.add('pl');
        span.appendChild(link);
        return { lineBreak, span };
    }

    // =====================================================
    //  插入到页面
    // =====================================================
    let lastElement = imdbIdElement.idNode;
    const parent = imdbIdElement.span.parentNode;

    sites.forEach(site => {
        const query = buildSearchQuery(site);
        const searchUrl = site.url + query;
        const keyword = decodeURIComponent(query.replace(/\+/g, ' '));

        const { lineBreak, span } = createLinkRow(site.name, searchUrl, keyword);

        parent.insertBefore(lineBreak, lastElement.nextSibling);
        parent.insertBefore(span, lineBreak.nextSibling);

        lastElement = span;
    });

})();
