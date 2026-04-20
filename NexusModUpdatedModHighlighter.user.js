// ==UserScript==
// @name         NexusMod - Updated Mod Highlighter
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      0.2
// @description  Highlight mods that have updated since you last downloaded them
// @author       JSSM
// @match        https://www.nexusmods.com/*/myaccount?tab=download+history
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/NexusModUpdatedModHighlighter.user.js
// @updateURL https://raw.githubusercontent.com/Jssmme/Greasy-Fork/main/NexusModUpdatedModHighlighter.user.js
// ==/UserScript==

(function() {
    'use strict';

    function whenAvailable(jQuery, cb) {
        var interval = 200; // ms
        window.setTimeout(function() {
            var loadingIndicator = jQuery("p.history_loading");
            if (loadingIndicator !== undefined && loadingIndicator.css("display") === "none") {
                cb(jQuery);
            } else {
                whenAvailable(cb, jQuery);
            }
        }, interval);
    }

    //var slowButton = document.getElementById('slowDownloadButton');
    jQuery(document).ready(function() {
        whenAvailable(jQuery, function() {
            var rows = jQuery("tr.even,tr.odd");

            rows.each(function() {
                var downloadDate = jQuery(this).children("td.table-download").text();
                var updateDate = jQuery(this).children("td.table-update").text();

                try {
                    var dateDl = Date.parse(downloadDate);
                    var dateUp = Date.parse(updateDate);

                    if (dateDl < dateUp) {
                        jQuery(this).children("td").css("background-color", "#444400");
                    }
                } catch (error) {
                    console.log("Err? " + error)
                }
            });
        });
    });
})();
