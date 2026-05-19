// ==UserScript==
// @name         TorrentDownload-Auto-Copy-Magnet
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      0.2
// @description  Auto copy clean magnet link and update label
// @author       JSSM
// @match        https://www.torrentdownload.info/*
// @grant        GM_setClipboard
// @run-at       document-end
// @license MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/TorrentDownload-Auto-Copy-Magnet.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/TorrentDownload-Auto-Copy-Magnet.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Find the magnet link anchor
    const magnetAnchor = document.querySelector('a.tosa[href^="magnet:"]');
    if (!magnetAnchor) return;

    const fullMagnet = magnetAnchor.getAttribute('href');

    // Keep only the btih hash part: magnet:?xt=urn:btih:HASH
    const cleanMagnet = fullMagnet.split('&')[0];

    // Copy to clipboard
    GM_setClipboard(cleanMagnet, 'text');

    // Find the span containing "Magnet Link" text and update it
    const labelSpan = magnetAnchor.querySelector('span.toswebsite');
    if (labelSpan) {
        // Replace text content while preserving the img and inner div
        const img = labelSpan.querySelector('img');
        const innerDiv = labelSpan.querySelector('div');

        labelSpan.innerHTML = '';
        if (img) labelSpan.appendChild(img);

        const textNode = document.createTextNode(' Copy Successed ');
        labelSpan.appendChild(textNode);

        if (innerDiv) labelSpan.appendChild(innerDiv);

        // Optional: highlight green to confirm
        labelSpan.style.color = '#2ecc71';
        labelSpan.style.fontWeight = 'bold';
    }

})();
