// ==UserScript==
// @name         TAPD一键关闭按钮
// @namespace    https://github.com/Jssmme/Greasy-Fork
// @version      1.12
// @description  在TAPD中添加一个一键关闭按钮
// @author       JSSM
// @match        *www.tapd.cn/*/bugtrace/bugs/view*
// @match        *www.tapd.cn/tapd_fe/*/bug/detail/*
// @grant        none
// @run-at       document-end
// @license MIT
// @downloadURL https://github.com/Jssmme/Greasy-Fork/blob/main/TAPD%E4%B8%80%E9%94%AE%E5%85%B3%E9%97%AD%E6%8C%89%E9%92%AE.js
// @updateURL https://github.com/Jssmme/Greasy-Fork/blob/main/TAPD%E4%B8%80%E9%94%AE%E5%85%B3%E9%97%AD%E6%8C%89%E9%92%AE.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('MutationObserver initialized');

    // 创建观察者实例
    const observer = new MutationObserver((mutations) => {
        // 查找目标位置的两个相邻 <div>
        const targetDiv1 = document.querySelector('.status-transfer-wrap.status-transfer-wrap--large .status-label-button');
        const targetDiv2 = document.querySelector('.detail-container-header-top__info-wrapper');

        if (targetDiv1 && targetDiv2) {
            // 创建新的 div 用于按钮
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'close-button-container';

            // 创建关闭按钮
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'agi-button agi-button--default agi-button--level-primary agi-button--size-small agi-button--text-only';
            closeButton.id = 'close-tab-btn';
            closeButton.innerHTML = '<span class="agi-button__text"> 一键关闭然后流转然后关闭 </span>';

            // 关闭按钮的点击事件
            closeButton.addEventListener('click', function() {
                // 查找所有选项卡
                const tabs = document.querySelectorAll('.el-tabs__item');
                let closedTabFound = false;

                // 遍历选项卡，查找包含"已关闭"文本的选项卡
                tabs.forEach(tab => {
                    const label = tab.querySelector('.tag-name');
                    if (label && label.textContent.trim() === '已关闭') {
                        // 点击 "已关闭" 选项卡以选中它
                        tab.click();
                        closedTabFound = true;
                    }
                });

                // 如果找到了已关闭选项卡
                if (closedTabFound) {
                    // 等待 1 秒后执行流转按钮的点击
                    setTimeout(function() {
                        // 查找页面上存在的流转按钮
                        const flowButton = document.getElementById('guide-trans-btn');
                        if (flowButton) {
                            // 点击流转按钮
                            flowButton.click();
                        }

                        // 再等 1 秒后关闭当前标签页
                        setTimeout(function() {
                            window.close();
                        }, 1000);
                    }, 100);
                } else {
                    // 如果没有找到已关闭选项卡，修改按钮文字为"状态错误"
                    closeButton.innerHTML = '<span class="agi-button__text"> 状态错误 </span>';
                }
            });

            // 将关闭按钮添加到新建的 div 中
            buttonContainer.appendChild(closeButton);

            // 将新建的 div 插入到 TargetDiv1 的父节点之后
            targetDiv1.parentNode.parentNode.insertBefore(buttonContainer, targetDiv1.parentNode.nextSibling);

            // 停止观察
            observer.disconnect();
        }
    });

    // 配置观察器
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('Observer started');

})();
