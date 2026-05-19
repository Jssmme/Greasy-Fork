// ==UserScript==
// @name         豆瓣直达片源网
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      0.8
// @description  在豆瓣电影页面新增一个按钮直达片源网搜索结果
// @author       JSSM
// @match        *://movie.douban.com/subject/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douban.com
// @grant        none
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E7%9B%B4%E8%BE%BE%E7%89%87%E6%BA%90%E7%BD%91.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E7%9B%B4%E8%BE%BE%E7%89%87%E6%BA%90%E7%BD%91.user.js
// ==/UserScript==

(function() {
	'use strict';

	/**
	 * ============================================
	 *  站点配置 —— 想加新站点只在这里加一行即可！
	 * ============================================
	 * name: 豆瓣上显示的站点名
	 * url:  搜索URL的基础地址
	 * mode: 搜索参数模式
	 *   'tt'     - 使用 IMDb ID（如 tt0111161）
	 *   'nameEN' - 使用提取的英文名+年份（如 Code+3+2025）
	 *   'nameCN' - 使用提取的中文名（如 蜀山传）
	 */
	const sites = [
		{ name: 'to：片源网',         url: 'https://pianyuan.org/search?q=',                mode: 'tt' },
		{ name: 'to：RARBG',          url: 'https://therarbg.com/get-posts/?keywords=',     mode: 'tt' },
		{ name: 'to：TorrentDownload', url: 'https://www.torrentdownload.info/search?q=',  mode: 'nameEN' },
		{ name: 'to：杰士凡',         url: 'https://www.jiesfan.com/search/',               mode: 'nameCN' },
		{ name: 'to：megapeer',       url: 'https://megapeer.vip/browse.php?search=',      mode: 'nameEN' },
		{ name: 'to：字幕库',        url: 'https://zimuku.org/search?q=',                   mode: 'tt' },
		// ↓ 在这里加新站点，格式参考上方即可
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
	//  获取影片英文名 / 搜索名
	// =====================================================
	// 年份（从 <span class="year"> 获取）
	const yearEl = document.querySelector('span.year');
	const year = yearEl ? yearEl.textContent.replace(/[()\s]/g, '') : '';

	/**
	 * 获取 <h1> 标题中 "又名" 部分的文本
	 */
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

	/**
	 * 提取用于 nameEN 搜索的关键词
	 *
	 * 逻辑顺序：
	 * 1. 从 <h1> 标题中找第一个包含英文字母的连续文本（如 "Code 3"、"Ford v Ferrari"）
	 * 2. 若没有（纯中文/韩文标题），则从「又名」中找第一个含英文字母的别名
	 * 3. 若也没有，直接用完整原标题
	 * 4. 最后拼上年份
	 */
	function extractEnglishName() {
		const h1Span = document.querySelector('h1 span[property="v:itemreviewed"]');
		const fullTitle = h1Span ? h1Span.textContent.trim() : '';

		// Step 1: 标题中找第一个含英文字母的连续文本
		const alphaMatch = fullTitle.match(/[a-zA-Z][\sa-zA-Z0-9&'.!?,\/:\-#]*/);
		if (alphaMatch) {
			const candidate = alphaMatch[0].trim();
			// 至少要有一个英文字母（排除纯数字情况）
			if (/[a-zA-Z]/.test(candidate)) {
				return candidate;
			}
		}

		// Step 2: 从「又名」中找第一个含英文字母的别名
		const aka = getAkaText();
		if (aka) {
			const parts = aka.split('/').map(s => s.trim());
			for (const part of parts) {
				if (/[a-zA-Z]/.test(part)) {
					return part;
				}
			}
		}

		// Step 3: 降级到完整原标题
		return fullTitle;
	}

	const englishName = extractEnglishName();

	// =====================================================
	//  提取中文名（用于 nameCN 模式）
	// =====================================================
	/**
	 * 从 <h1> 标题中提取中文名
	 *
	 * 逻辑：
	 * 1. 取 <h1> 中 <span property="v:itemreviewed"> 的文本
	 * 2. 取第一个空格前的部分（如 "蜀山传 蜀山傳" → "蜀山传"）
	 * 3. 若没有空格，则取完整文本
	 */
	function extractChineseName() {
		const h1Span = document.querySelector('h1 span[property="v:itemreviewed"]');
		const fullTitle = h1Span ? h1Span.textContent.trim() : '';
		if (!fullTitle) return '';

		// 取第一个空格前的部分（中文标题通常在前）
		const spaceIndex = fullTitle.indexOf(' ');
		if (spaceIndex > 0) {
			return fullTitle.substring(0, spaceIndex).trim();
		}
		return fullTitle;
	}

	const chineseName = extractChineseName();

	// =====================================================
	//  生成各站点的搜索 URL
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
	//  在页面上插入链接行
	// =====================================================
	function createLinkRow(siteName, searchUrl) {
		const lineBreak = document.createElement('br');

		const link = document.createElement('a');
		link.href = searchUrl;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.innerText = siteName;

		const span = document.createElement('span');
		span.classList.add('pl');
		span.appendChild(link);
		return { lineBreak, span };
	}

	let lastElement = imdbIdElement.idNode;
	const parent = imdbIdElement.span.parentNode;

	sites.forEach(site => {
		const searchUrl = site.url + buildSearchQuery(site);
		const { lineBreak, span } = createLinkRow(site.name, searchUrl);

		parent.insertBefore(lineBreak, lastElement.nextSibling);
		parent.insertBefore(span, lineBreak.nextSibling);

		lastElement = span;
	});

})();
