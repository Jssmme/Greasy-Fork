// ==UserScript==
// @name         豆瓣观影记录一键复制
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      0.7
// @description  在「我看过的影视」翻页区增加「复制」按钮，一键复制本页条目（片名、年份、主要演职员、评分、日期、短评）供粘贴分析
// @author       JSSM
// @match        *://movie.douban.com/people/*/collect*
// @grant        none
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E8%A7%82%E5%BD%B1%E8%AE%B0%E5%BD%95%E4%B8%80%E9%94%AE%E5%A4%8D%E5%88%B6.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/%E8%B1%86%E7%93%A3%E8%A7%82%E5%BD%B1%E8%AE%B0%E5%BD%95%E4%B8%80%E9%94%AE%E5%A4%8D%E5%88%B6.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

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

    /** 上映日期行：以 YYYY-MM-DD 开头（可带括号备注，如 2025-12-19(美国)） */
    function isReleaseDateSegment(s) {
      return /^\d{4}-\d{2}-\d{2}/.test((s || '').trim());
    }

    /** 片长段，避免误收入主要演职员 */
    function isDurationSegment(s) {
      const t = (s || '').trim();
      return /^\d+分钟/.test(t) || /^\d+min$/i.test(t);
    }

    /**
     * 主要演职员：intro 里「所有上映日期段之后、首个国家/地区名之前」的连续片段（与豆瓣列表展示一致）。
     */
    function parseIntro(intro) {
      if (!intro) return { year: '', principalCast: '' };
      const yearMatch = intro.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? yearMatch[0] : '';
      // 仅按带空格的「 / 」切分；括号内如 (美国/中国大陆) 不含两侧空格，避免被拆碎
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

    function buildExportText() {
    const items = Array.from(document.querySelectorAll('.grid-view .item.comment-item')).reverse();
    const blocks = [];
    items.forEach((item) => {
        const title = getTitle(item);
        const introEl = item.querySelector('li.intro');
        const intro = introEl ? introEl.textContent.replace(/\s+/g, ' ').trim() : '';
        const { year, principalCast } = parseIntro(intro);
        const stars = getRatingStars(item);
        const dateEl = item.querySelector('span.date');
        const date = dateEl ? dateEl.textContent.trim() : '';
        const commentEl = item.querySelector('span.comment');
        const comment = commentEl ? commentEl.textContent.replace(/\s+/g, ' ').trim() : '';

        blocks.push(
          [
            '【' + title + '】',
            '年份：' + (year || '—'),
            '主要演职员：' + (principalCast || '—'),
            '评分：' + (stars ? stars + '/5' : '—'),
            '评价日期：' + (date || '—'),
            '短评：' + (comment || '—'),
            '---'
          ].join('\n')
        );
      });
      return blocks.join('\n');
    }

    function insertButton() {
      const paginator = document.querySelector('.paginator');
      const prev = paginator && paginator.querySelector('span.prev');
      if (!paginator || !prev) return;

      if (paginator.querySelector('.db-collect-copy-btn')) return;

      const btn = document.createElement('a');
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

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const text = buildExportText();
        copyText(text).then(
          () => {
            btn.textContent = '成功';
            window.setTimeout(() => {
              btn.textContent = '复制';
            }, 2000);
          },
          () => {
            btn.textContent = '失败';
            window.setTimeout(() => {
              btn.textContent = '复制';
            }, 2000);
          }
        );
      });

      prev.parentNode.insertBefore(btn, prev);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', insertButton);
    } else {
      insertButton();
    }
  })();
