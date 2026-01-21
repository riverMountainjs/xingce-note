
// ==UserScript==
// @name         行测错题本智能助手 (粉笔专用)
// @namespace    http://tampermonkey.net/
// @version      10.14
// @description  AI 原地辅助录入：自动分类提取、AI 对话助手（支持追问）、可缩放富文本笔记、异步静默同步到错题本。
// @author       You
// @match        *://*.fenbi.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 全局变量与配置
    // ==========================================
    
    // 缓存：Key=题目DOM节点, Value={stem, aiResult, chatHistory, userNoteValue, qData}
    var fbPanelCache = new WeakMap();
    
    // 全局面板单例引用
    var globalPanel = null;
    var currentActiveContainer = null; 
    
    // 自动关闭的定时器
    var autoCloseTimer = null;

    const CONFIG = {
       SERVER_URL: GM_getValue('server_url', 'https://notebookv3.pages.dev'),
        EXTERNAL_TOKEN: GM_getValue('external_token', 'a192eaa1-aa13-44e8-ad71-7a2b91061ea9'),
    };

    // 分类映射表
    const SUB_CATEGORY_MAP = {
      '常识判断': ['政治常识', '法律常识', '经济常识', '人文历史', '科技常识', '地理国情', '管理公文'],
      '判断推理': ['图形推理', '定义判断', '类比推理', '逻辑判断', '事件排序'],
      '言语理解': ['逻辑填空', '中心理解', '细节判断', '语句表达', '篇章阅读'],
      '数量关系': ['数字推理', '数学运算', '工程问题', '行程问题', '经济利润', '几何问题', '排列组合', '最值问题', '和差倍比问题', '概率问题', '不定方程问题', '统筹规划问题', '分段计算问题', '数列问题'],
      '资料分析': ['文字材料', '表格材料', '图形材料', '综合材料']
    };

    const STYLES = `
        /* 按钮样式 */
        .fb-plugin-btn-li { display: inline-flex; align-items: center; margin-left: 10px; cursor: pointer; position: relative; z-index: 999; vertical-align: middle; }
        .fb-plugin-btn { display: inline-flex; align-items: center; padding: 4px 10px; background: #f0f9ff; color: #3b82f6; border: 1px solid #bfdbfe; border-radius: 14px; font-size: 12px; font-weight: 600; transition: all 0.2s; cursor: pointer; pointer-events: auto; user-select: none; outline: none; line-height: 1.5; white-space: nowrap; }
        .fb-plugin-btn:hover { background: #3b82f6; color: white; border-color: #3b82f6; }
        .fb-plugin-btn:active { transform: translateY(1px); }
        .fb-plugin-btn.done { background: #dcfce7; color: #166534; border-color: #86efac; }
        
        /* 全局悬浮面板 */
        .fb-smart-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            position: fixed; top: 60px; right: 40px; width: 33vw; min-width: 420px; max-width: 1200px; height: 85vh; min-height: 600px; max-height: 95vh;
            background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            z-index: 2147483647; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; 
            opacity: 0; visibility: hidden; transform: scale(0.98) translateX(20px); transition: opacity 0.2s ease-out, transform 0.2s ease-out, visibility 0s linear 0.2s; pointer-events: none; 
        }
        .fb-smart-panel.active { visibility: visible; opacity: 1; transform: scale(1) translateX(0); pointer-events: auto; transition: opacity 0.2s ease-out, transform 0.2s ease-out, visibility 0s linear 0s; }

        /* 通用UI组件 */
        .fb-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; user-select: none; }
        .fb-panel-header h4 { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
        
        .fb-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #eff6ff; color: #3b82f6; margin-right: 6px; border: 1px solid #dbeafe; cursor: default; margin-bottom: 4px; }
        .fb-badge .remove-tag { margin-left: 4px; cursor: pointer; opacity: 0.6; font-size: 14px; line-height: 1; }
        .fb-badge .remove-tag:hover { opacity: 1; color: #ef4444; }
        
        .fb-select { display: inline-block; padding: 2px 4px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #eff6ff; color: #1d4ed8; margin-right: 6px; border: 1px solid #dbeafe; outline: none; cursor: pointer; height: 24px; }
        
        .fb-scroll-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
        .fb-section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: #fff; display: flex; flex-direction: column; overflow: hidden; }
        .fb-splitter { height: 10px; width: 100%; cursor: row-resize; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin: 2px 0; z-index: 10; }
        .fb-splitter:hover { background: #f1f5f9; }
        .fb-splitter::after { content: ""; display: block; width: 40px; height: 4px; background: #cbd5e1; border-radius: 2px; }

        /* Markdown & Chat */
        .fb-md-content { font-size: 14px; line-height: 1.6; color: #334155; }
        .fb-md-content p { margin: 0 0 8px 0; text-align: justify; }
        .fb-md-content ul, .fb-md-content ol { margin: 4px 0 8px 0; padding-left: 20px; }
        .fb-md-content li { margin-bottom: 4px; }
        .fb-md-content strong { font-weight: 700; color: #0f172a; }
        .fb-md-content code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #d63384; }
        .fb-md-content pre { background: #f8fafc; padding: 8px; border-radius: 6px; overflow-x: auto; border: 1px solid #e2e8f0; }
        
        .fb-chat-section { flex: none; height: 75%; min-height: 150px; }
        .fb-chat-msgs { flex: 1; overflow-y: auto; margin-bottom: 12px; padding-right: 6px; scroll-behavior: smooth; }
        .fb-chat-msg { margin-bottom: 12px; padding: 10px 14px; border-radius: 12px; max-width: 95%; word-wrap: break-word; font-size: 14px; line-height: 1.6; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .fb-chat-msg.user { background: #eff6ff; color: #1e40af; align-self: flex-end; margin-left: auto; border-bottom-right-radius: 2px; border: 1px solid #dbeafe; }
        .fb-chat-msg.ai { background: #ffffff; border: 1px solid #e2e8f0; align-self: flex-start; margin-right: auto; border-bottom-left-radius: 2px; }
        
        /* 光标特效 */
        .cursor {
            display: inline-block;
            width: 2px;
            height: 1em;
            background-color: #3b82f6;
            vertical-align: text-bottom;
            animation: blink 1s infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        /* 思考中动效 */
        .thinking-dots::after {
            content: '.';
            animation: dots 1.5s steps(5, end) infinite;
        }
        @keyframes dots { 0%, 20% { content: '.'; } 40% { content: '..'; } 60% { content: '...'; } 80%, 100% { content: ''; } }

        .fb-suggestions { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 8px; scrollbar-width: none; flex-shrink: 0; }
        .fb-chip { white-space: nowrap; background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; padding: 6px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .fb-chip:hover { background: #0284c7; color: white; border-color: #0284c7; }
        
        .fb-chat-input-box { display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
        .fb-chat-input { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 14px; outline: none; height: 42px; resize: none; font-family: inherit; line-height: 1.4; transition: border-color 0.2s; }
        .fb-chat-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

        /* 笔记区 */
        .fb-note-section { flex: 1; min-height: 120px; display: flex; flex-direction: column; position: relative; }
        .fb-rich-editor { flex: 1; width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 15px; line-height: 1.6; color: #334155; outline: none; overflow-y: auto; background: #f8fafc; resize: none; white-space: pre-wrap; word-wrap: break-word; }
        .fb-rich-editor:focus { background: #fff; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        .fb-rich-editor img { max-width: 90%; border-radius: 6px; margin: 8px 0; border: 2px solid transparent; display: block; cursor: pointer; }
        .fb-rich-editor img.selected { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .fb-img-resizer { position: absolute; border: 2px solid #3b82f6; pointer-events: none; z-index: 100; display: none; }
        .fb-img-resizer.active { display: block; }
        .fb-img-handle { position: absolute; bottom: -6px; right: -6px; width: 12px; height: 12px; background: #3b82f6; border: 2px solid #fff; border-radius: 50%; cursor: se-resize; pointer-events: auto; }

        .fb-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .fb-btn:hover { background: #2563eb; transform: translateY(-1px); }
        .fb-btn.success { background: #10b981; }
        .fb-loader { width: 14px; height: 14px; border: 2px solid #fff; border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; margin-right: 8px; }
        .fb-resize-handle { position: absolute; bottom: 0; left: 0; width: 24px; height: 24px; cursor: sw-resize; z-index: 20; background: linear-gradient(45deg, transparent 50%, #cbd5e1 50%); border-bottom-left-radius: 16px; opacity: 0.5; transition: opacity 0.2s; }
        .fb-resize-handle:hover { opacity: 1; background: linear-gradient(45deg, transparent 50%, #3b82f6 50%); }
        
        .fb-add-tag-input { border: none; background: transparent; width: 60px; font-size: 12px; outline: none; border-bottom: 1px dashed #cbd5e1; color: #64748b; }
        .fb-add-tag-input:focus { border-bottom-color: #3b82f6; color: #3b82f6; width: 100px; }

        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;

    // 增强版 Markdown 解析器
    function parseMarkdown(text) {
        if (!text) return '';
        let html = text
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/^\s*-\s+(.*)$/gm, '<ul><li>$1</li></ul>')
            .replace(/^\s*\d+\.\s+(.*)$/gm, '<ol><li>$1</li></ol>')
            .replace(/<\/ul>\s*<ul>/g, '')
            .replace(/<\/ol>\s*<ol>/g, '')
            .replace(/\n/g, '<br>');
        return `<div class="fb-md-content">${html}</div>`;
    }

    async function callBackend(endpoint, body) {
        if (!CONFIG.EXTERNAL_TOKEN) {
            alert("未配置 Token！");
            return null;
        }

        // 调试日志：开始请求
        console.groupCollapsed(`[FenbiPlugin] 🚀 Calling ${endpoint}`);
        console.log("📍 Payload:", body);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `${CONFIG.SERVER_URL}/api/external/${endpoint}`,
                headers: { "Content-Type": "application/json", "X-External-Token": CONFIG.EXTERNAL_TOKEN },
                data: JSON.stringify(body),
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const json = JSON.parse(res.responseText);
                            
                            // 调试日志：请求成功
                            console.log("✅ Response:", json);
                            if (json._debug_request) console.log("🤖 AI Request (Raw):", json._debug_request);
                            if (json._debug_response) console.log("🤖 AI Response (Raw):", json._debug_response);
                            if (json._debug_request_body) console.log("🤖 AI Request Body:", json._debug_request_body);
                            console.groupEnd();
                            
                            resolve(json); 
                        } catch(e) { 
                            console.error("❌ JSON Parse Error:", e);
                            console.groupEnd();
                            reject("JSON Parse Error"); 
                        }
                    } else {
                        console.error(`❌ API Error ${res.status}:`, res.responseText);
                        console.groupEnd();
                        reject(`Error ${res.status}`);
                    }
                },
                onerror: (err) => {
                    console.error("❌ Network Error:", err);
                    console.groupEnd();
                    reject("Network Error");
                }
            });
        });
    }

    // ==========================================
    // 题目数据提取
    // ==========================================
    function getQuestionData(tiContainer) {
        if (!tiContainer) return null;

        const stemNode = tiContainer.querySelector('app-format-html > div');
        let stemText = "";
        let images = [];
        if (stemNode) {
            const clonedStem = stemNode.cloneNode(true);
            
            // 0. 移除无用标签
            clonedStem.querySelectorAll('script, style').forEach(el => el.remove());
            
            // 1. 处理图片
            Array.from(clonedStem.querySelectorAll('img')).forEach(img => { 
                if (img.src) images.push(img.src); 
                // 移除图片节点，不再保留[图片]占位符
                img.remove();
            });

            // 2. 处理逻辑填空题的下划线
            clonedStem.querySelectorAll('u').forEach(u => {
                const text = u.textContent;
                if (!text.replace(/[\s\u00a0]/g, '').length) {
                    const placeholder = document.createTextNode('______');
                    u.parentNode.replaceChild(placeholder, u);
                }
            });

            // 3. 显式处理换行 (核心修复)
            // 针对 detached node，innerText 可能丢失换行，改用手动注入 + textContent
            clonedStem.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            clonedStem.querySelectorAll('p, div, li').forEach(el => {
                el.appendChild(document.createTextNode('\n'));
            });

            // 4. 提取文本并规范化换行
            // 使用 textContent 避免 detached node 的 innerText 格式化丢失问题
            // 将连续的换行符合并为一个，并清除首尾空格
            stemText = clonedStem.textContent.replace(/\n\s*\n/g, '\n').trim();
        }
        const options = Array.from(tiContainer.querySelectorAll('.choice-radio-label')).map(node => {
            const textNode = node.querySelector('.input-text');
            const imgNode = node.querySelector('img');
            return imgNode ? imgNode.src : (textNode ? textNode.innerText.trim() : "");
        });
        const answerMap = {'A':0, 'B':1, 'C':2, 'D':3};
        let correctAnswer = -1;
        let userAnswer = -1;
        const correctNode = tiContainer.querySelector('.overall-item-value.correct-answer');
        if (correctNode) correctAnswer = answerMap[correctNode.innerText.trim()] ?? -1;
        if (correctAnswer === -1) {
             const c = tiContainer.querySelector('.input-radio.correct, .input-radio.correctLost');
             if (c) correctAnswer = answerMap[c.innerText.trim()];
        }
        const yourAnswerNode = tiContainer.querySelector('.overall-item-value.your-answer');
        if (yourAnswerNode) {
            const text = yourAnswerNode.innerText.trim();
            if (!text.includes('未作答')) {
                const match = text.match(/[A-D]/);
                if (match) userAnswer = answerMap[match[0]];
            }
        } else {
            const wrongOption = tiContainer.querySelector('.input-radio.wrong');
            const correctOption = tiContainer.querySelector('.input-radio.correct');
            if (wrongOption) userAnswer = answerMap[wrongOption.innerText.trim()];
            else if (correctOption) userAnswer = answerMap[correctOption.innerText.trim()];
        }
        const accNode = tiContainer.querySelector('.overall-item-value.correct-rate');
        const accuracy = parseInt(accNode?.innerText) || 60;
        
        let tags = [];
        const tagNodes = tiContainer.querySelectorAll('.solution-keypoint-item-name'); 
        if (tagNodes.length > 0) tags = Array.from(tagNodes).map(n => n.innerText.trim()).filter(t => t);
        
        let materialText = "";
        let materialsContainer = null;

        // --- 修复：更精准的材料查找逻辑 ---
        
        // 策略 1：分屏查找 (Split Screen) - 针对资料分析/篇章阅读
        // 使用 closest 查找最近的分屏容器，确保不会跨越到外层的其他题目模块
        const splitWrapper = tiContainer.closest('.resizable-container');
        
        if (splitWrapper) {
            // 确保当前题目确实位于该分屏容器的右侧区域
            const rightPane = splitWrapper.querySelector('.right, .right-part');
            if (rightPane && rightPane.contains(tiContainer)) {
                // 定位左侧区域
                const leftPane = splitWrapper.querySelector('.left, .left-part');
                if (leftPane) {
                    // 尝试查找标准的材料容器
                    materialsContainer = leftPane.querySelector('app-materials .material-body') || 
                                         leftPane.querySelector('.material-body') || 
                                         leftPane.querySelector('.material-content') ||
                                         leftPane.querySelector('app-materials');
                    
                    // 兜底策略：如果没找到标准容器，但左侧有内容 (例如单张图片)，则直接使用 leftPane
                    // 这修复了部分资料分析题只有一张裸图导致报错的问题
                    if (!materialsContainer && (leftPane.querySelector('img') || leftPane.innerText.trim().length > 10)) {
                         materialsContainer = leftPane;
                    }
                }
            }
        }

        // 策略 2：本地查找 (Local Search) - 针对普通列表题目
        // 只有在分屏查找失败时才执行，且严格限制查找范围，防止抓到邻居的材料
        if (!materialsContainer) {
             let parent = tiContainer.parentElement;
             // 仅向上查找 4 层，避免查找到全局容器
             for (let i = 0; i < 4 && parent && parent.tagName !== 'BODY'; i++) {
                 // 如果遇到了明显的题目分组边界，停止查找
                 if (parent.classList.contains('ti-group') || parent.classList.contains('paper-body') || parent.classList.contains('activity-body')) break;

                 const cand = parent.querySelector('.material-body, .material-content, app-materials');
                 if (cand) {
                     // 1. 归属权校验：材料不能属于其他题目容器 (基本检查)
                     const owner = cand.closest('.ti-container, .solution-choice-container');
                     if (owner && owner !== tiContainer && !owner.contains(tiContainer)) continue;

                     // 2. 分屏隔离检查 (关键修复)
                     // 如果找到的这个材料其实是位于某个分屏容器内的（比如隔壁的资料分析模块），
                     // 那么当前题目必须也位于同一个分屏容器内。如果当前题目在外面，说明抓错了。
                     const splitParent = cand.closest('.resizable-container');
                     if (splitParent) {
                         // 材料在分屏里，但题目不在该分屏里 -> 忽略
                         if (!splitParent.contains(tiContainer)) continue;
                     }

                     materialsContainer = cand;
                     break;
                 }
                 parent = parent.parentElement;
             }
        }

        if (materialsContainer) {
            const cloneMat = materialsContainer.cloneNode(true);
            cloneMat.querySelectorAll('.tooltip-container, .tooltip-mask, .expand-btn').forEach(el => el.remove());
            
            // 提取图片（放入数组，供AI识别）
            cloneMat.querySelectorAll('img').forEach(img => {
                if (img.src) {
                    img.style.maxWidth = '100%';
                    if (!images.includes(img.src)) images.push(img.src);
                }
            });
            
            // 优化表格样式
            cloneMat.querySelectorAll('table').forEach(tbl => {
                tbl.style.borderCollapse = 'collapse';
                tbl.style.width = '100%';
                tbl.querySelectorAll('td, th').forEach(cell => {
                    cell.style.border = '1px solid #e2e8f0';
                    cell.style.padding = '8px';
                });
            });

            // 总是提取富文本材料，确保资料分析等依赖 HTML 结构的题型能正常显示
            materialText = cloneMat.innerHTML.trim();
        }

        // --- 增强的解析提取逻辑 ---
        let analysisHtml = "";
        let solutionContainer = null;
        
        // 1. 尝试 ID 选择器
        const solutionSection = tiContainer.querySelector('[id^="section-solution-"]');
        if (solutionSection) {
            solutionContainer = solutionSection.querySelector('.content');
        }
        
        // 2. 尝试常规类名
        if (!solutionContainer) {
             const selectors = ['.solution-content', '.solution-body', '.analysis-body', '.app-solution-content', '.material-analysis'];
            for (const sel of selectors) {
                const el = tiContainer.querySelector(sel);
                if (el && el.innerText.trim().length > 5) {
                    solutionContainer = el;
                    break;
                }
            }
        }
        
        // 3. 暴力查找
        if (!solutionContainer) {
            const sections = tiContainer.querySelectorAll('section');
            for (const sec of sections) {
                const title = sec.querySelector('.solution-title');
                if (title && title.innerText.includes('解析') && !title.innerText.includes('视频')) {
                    solutionContainer = sec.querySelector('.content');
                    break;
                }
            }
        }

        if (solutionContainer) {
            const cloneSol = solutionContainer.cloneNode(true);
            cloneSol.querySelectorAll('script, style, .expand-btn').forEach(el => el.remove());
            analysisHtml = cloneSol.innerHTML.trim();
        }
        
        return { stem: stemText, options, correctAnswer, userAnswer, accuracy, materials: images, tags, materialText, analysisHtml };
    }

    function makeResizable(el, handle) { 
        let isResizing = false; let startX, startY, startW, startH;
        handle.addEventListener('mousedown', (e) => { isResizing = true; startX = e.clientX; startY = e.clientY; startW = el.offsetWidth; startH = el.offsetHeight; e.preventDefault(); e.stopPropagation(); });
        window.addEventListener('mousemove', (e) => { if (!isResizing) return; el.style.width = `${Math.max(480, startW - (e.clientX - startX))}px`; el.style.height = `${Math.max(500, startH + (e.clientY - startY))}px`; });
        window.addEventListener('mouseup', () => { isResizing = false; });
    }

    // --- 打字机特效 ---
    async function typewriterEffect(container, text) {
        container.innerHTML = '<span class="cursor"></span>';
        const chunkSize = 2; 
        const len = text.length;
        let currentText = '';
        for (let i = 0; i < len; i += chunkSize) {
            currentText += text.substring(i, i + chunkSize);
            container.innerHTML = parseMarkdown(currentText) + '<span class="cursor"></span>';
            container.scrollTop = container.scrollHeight;
            await new Promise(r => setTimeout(r, 15));
        }
        const cursor = container.querySelector('.cursor');
        if (cursor) cursor.remove();
    }

    function ensureGlobalPanel() {
        if (globalPanel && document.body.contains(globalPanel)) return globalPanel;
        globalPanel = document.createElement('div');
        globalPanel.className = 'fb-smart-panel';
        globalPanel.innerHTML = `
            <div class="fb-panel-header"><h4>🤖 错题录入助手</h4><button id="fb-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;">×</button></div>
            <div id="fb-panel-body" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>
            <div class="fb-resize-handle" id="fb-resize-sw"></div>
        `;
        document.body.appendChild(globalPanel);
        const hidePanel = () => { globalPanel.classList.remove('active'); globalPanel.style.pointerEvents = 'none'; currentActiveContainer = null; };
        globalPanel.querySelector('#fb-panel-close').onclick = hidePanel;
        globalPanel.addEventListener('mouseenter', () => { clearTimeout(autoCloseTimer); });
        globalPanel.addEventListener('mouseleave', () => { autoCloseTimer = setTimeout(hidePanel, 800); });
        makeResizable(globalPanel, globalPanel.querySelector('#fb-resize-sw'));
        return globalPanel;
    }

    function renderPanelContent(data, qDataRaw) {
        const body = globalPanel.querySelector('#fb-panel-body');
        if (!data) return;

        const { aiResult, chatHistory } = data;
        const userAnswer = qDataRaw ? qDataRaw.userAnswer : -1;
        const correctAnswer = qDataRaw ? qDataRaw.correctAnswer : -1;
        const wrongOptionChar = (userAnswer !== -1 && userAnswer !== correctAnswer) ? String.fromCharCode(65 + userAnswer) : 'A';
        if (!data.chatHistory) data.chatHistory = [];

        const suggestions = [
            { label: `为什么不选${wrongOptionChar}?`, text: `这道题为什么不能选${wrongOptionChar}？请详细对比正确选项和${wrongOptionChar}的区别。` },
            { label: "做题技巧", text: "这类题目有什么通用的解题技巧或秒杀法吗？" },
            { label: "举一反三", text: "请出一道考察相同知识点的类似题目，并附带解析。" }
        ];

        const categoryOptions = Object.keys(SUB_CATEGORY_MAP).map(c => `<option value="${c}" ${c === aiResult.category ? 'selected' : ''}>${c}</option>`).join('');
        const currentSubCats = SUB_CATEGORY_MAP[aiResult.category] || [];
        const subCategoryOptions = currentSubCats.map(sc => `<option value="${sc}" ${sc === aiResult.subCategory ? 'selected' : ''}>${sc}</option>`).join('');
        const renderTags = (tags) => tags.map(t => `<span class="fb-badge" data-tag="${t}">${t} <span class="remove-tag">×</span></span>`).join('');

        body.innerHTML = `
            <div style="margin-bottom:10px;flex-shrink:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <select id="fb-category-select" class="fb-select">${categoryOptions}</select>
                <select id="fb-subcategory-select" class="fb-select">${subCategoryOptions}</select>
                <div id="fb-tags-container" style="display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    ${renderTags(aiResult.tags || [])}
                    <input type="text" class="fb-add-tag-input" placeholder="+ 考点" />
                </div>
            </div>
            
            <div class="fb-scroll-area">
                <div class="fb-section fb-chat-section">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;flex-shrink:0;">AI 助手</div>
                    <div class="fb-chat-msgs" id="chat-msgs"></div>
                    <div class="fb-suggestions">${suggestions.map((s, idx) => `<div class="fb-chip" data-idx="${idx}">${s.label}</div>`).join('')}</div>
                    <div class="fb-chat-input-box">
                        <textarea class="fb-chat-input" id="chat-input" placeholder="输入问题..." rows="1"></textarea>
                        <button id="send-chat-btn" style="border:none;background:#3b82f6;color:white;border-radius:6px;padding:0 12px;height:42px;cursor:pointer;font-weight:bold;font-size:12px;flex-shrink:0;">发送</button>
                    </div>
                </div>
                <div class="fb-splitter" id="section-splitter"></div>
                <div class="fb-section fb-note-section">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;flex-shrink:0;">我的笔记</div>
                    <div id="user-note" class="fb-rich-editor" contenteditable="true" placeholder="在此记录学习心得..."></div>
                    <div id="img-resizer" class="fb-img-resizer"><div class="fb-img-handle"></div></div>
                </div>
            </div>
            <button class="fb-btn" id="save-btn" style="margin-top:16px;">同步到错题本</button>
        `;

        const tagsContainer = body.querySelector('#fb-tags-container');
        const tagInput = body.querySelector('.fb-add-tag-input');
        
        tagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                const tag = e.target.parentElement.getAttribute('data-tag');
                aiResult.tags = aiResult.tags.filter(t => t !== tag);
                e.target.parentElement.remove();
            }
        });

        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val && !aiResult.tags.includes(val)) {
                    aiResult.tags.push(val);
                    const span = document.createElement('span');
                    span.className = 'fb-badge';
                    span.setAttribute('data-tag', val);
                    span.innerHTML = `${val} <span class="remove-tag">×</span>`;
                    tagsContainer.insertBefore(span, tagInput);
                    e.target.value = '';
                }
            }
        });

        const chatInput = body.querySelector('#chat-input');
        const suggestionsDiv = body.querySelector('.fb-suggestions');
        suggestionsDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('fb-chip')) {
                const idx = e.target.getAttribute('data-idx');
                if (suggestions[idx]) {
                    chatInput.value = suggestions[idx].text;
                    chatInput.focus();
                }
            }
        });

        body.querySelector('#fb-category-select').addEventListener('change', (e) => {
             const newCat = e.target.value; aiResult.category = newCat;
             const subs = SUB_CATEGORY_MAP[newCat] || []; aiResult.subCategory = subs[0] || '';
             body.querySelector('#fb-subcategory-select').innerHTML = subs.map(s => `<option value="${s}" ${s === aiResult.subCategory ? 'selected' : ''}>${s}</option>`).join('');
        });
        body.querySelector('#fb-subcategory-select').addEventListener('change', (e) => { aiResult.subCategory = e.target.value; });

        const userNote = body.querySelector('#user-note');
        if (data.userNoteValue) userNote.innerHTML = data.userNoteValue;
        userNote.addEventListener('input', (e) => { data.userNoteValue = e.target.innerHTML; });

        const chatMsgs = body.querySelector('#chat-msgs');
        
        const renderHistory = () => {
            chatMsgs.innerHTML = '';
            data.chatHistory.forEach(msg => {
                const div = document.createElement('div');
                div.className = `fb-chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`;
                div.innerHTML = parseMarkdown(msg.content);
                chatMsgs.appendChild(div);
            });
            setTimeout(() => chatMsgs.scrollTop = chatMsgs.scrollHeight, 50);
        };
        renderHistory();
        
        const handleSend = async () => {
            const msg = chatInput.value.trim();
            if (!msg) return;
            
            data.chatHistory.push({ role: 'user', content: msg });
            const userDiv = document.createElement('div');
            userDiv.className = 'fb-chat-msg user';
            userDiv.innerHTML = parseMarkdown(msg);
            chatMsgs.appendChild(userDiv);
            chatInput.value = '';
            chatMsgs.scrollTop = chatMsgs.scrollHeight;

            const aiDiv = document.createElement('div');
            aiDiv.className = 'fb-chat-msg ai';
            aiDiv.innerHTML = '<span class="thinking-dots" style="color:#94a3b8;font-size:12px;">AI思考中</span>';
            chatMsgs.appendChild(aiDiv);
            chatMsgs.scrollTop = chatMsgs.scrollHeight;

            try {
                const res = await callBackend('chat', { 
                    stem: qDataRaw.stem, 
                    options: qDataRaw.options, 
                    history: data.chatHistory.slice(-6), 
                    newMessage: msg 
                });
                
                if (res.reply) {
                    data.chatHistory.push({ role: 'assistant', content: res.reply });
                    await typewriterEffect(aiDiv, res.reply);
                }
            } catch (e) {
                aiDiv.innerHTML = `<span style="color:red">请求出错: ${e}</span>`;
            }
        };

        body.querySelector('#send-chat-btn').onclick = handleSend;
        chatInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }};

        body.querySelector('#save-btn').onclick = async () => {
            const btn = body.querySelector('#save-btn'); btn.disabled = true; btn.innerHTML = '<span class="fb-loader"></span> 保存中...';
            await new Promise(r => setTimeout(r, 50));

            try {
                const latestQData = getQuestionData(currentActiveContainer);
                const finalAnalysis = latestQData.analysisHtml || qDataRaw.analysisHtml || '';
                const finalNote = userNote.innerHTML;

                // --- 保存时的优化策略 ---
                // 1. 如果AI判断是资料分析，我们优先使用 Rich Text 材料，并清空原始附件数组，避免重复。
                let materialsToSave = qDataRaw.materials;
                if (aiResult.category === '资料分析') {
                    materialsToSave = [];
                }
                
                // 2. 如果是非资料分析，通常只有图片是重要的。
                // 此时保留 materials 数组。如果 Rich Text 里只有一张图，App 端可能会显示两遍，但为了保险起见，
                // 对于非资料分析题，我们不强行清除 materials，以防深度抓取逻辑遗漏了某些图。

                await callBackend('save', {
                    id: Date.now().toString(),
                    createdAt: Date.now(),
                    stem: qDataRaw.stem, options: qDataRaw.options, 
                    materials: materialsToSave, 
                    materialText: qDataRaw.materialText,
                    correctAnswer: qDataRaw.correctAnswer, accuracy: qDataRaw.accuracy,
                    category: aiResult.category, subCategory: aiResult.subCategory, tags: aiResult.tags,
                    noteText: finalNote, 
                    analysis: finalAnalysis,
                    mistakeCount: 0
                });
                btn.classList.add('success'); btn.innerHTML = '✓ 已存入';
                setTimeout(() => { globalPanel.classList.remove('active'); globalPanel.style.pointerEvents = 'none'; currentActiveContainer = null; }, 1000);
            } catch (e) { alert("保存失败: " + e); btn.disabled = false; btn.innerHTML = '重试'; }
        };
    }

    async function startAnalysis(tiContainer, btn, isBatch = false) {
        currentActiveContainer = tiContainer;
        if (!isBatch) ensureGlobalPanel();
        const qData = getQuestionData(tiContainer);
        if (!qData) { alert("无法获取题目数据"); return; }
        
        if (fbPanelCache.has(tiContainer)) {
            if (!isBatch) { 
                const cachedData = fbPanelCache.get(tiContainer);
                renderPanelContent(cachedData, cachedData.qData); 
                globalPanel.classList.add('active'); 
                globalPanel.style.pointerEvents = 'auto'; 
            }
            return;
        }

        let allBase64Materials = qData.materials || [];
        btn.innerHTML = '<span class="fb-loader"></span> 识别中';
        await new Promise(r => setTimeout(r, 50));

        try {
            const stripBase64 = (html) => html ? html.replace(/src="data:image\/[^;]+;base64,[^"]+"/g, 'src="[IMG]"') : '';
            const payload = {
                stem: qData.stem, options: qData.options, materials: allBase64Materials, 
                materialText: stripBase64(qData.materialText), userAnswer: qData.userAnswer, correctAnswer: qData.correctAnswer
            };
            const aiResult = await callBackend('analyze', payload);
            if (aiResult) {
                const combinedTags = [...new Set([...(qData.tags || []), ...(aiResult.tags || [])])];
                aiResult.tags = combinedTags;
                
                const cacheData = { 
                    stem: qData.stem, 
                    aiResult: aiResult, 
                    chatHistory: [],
                    userNoteValue: '', 
                    qData: qData 
                };
                fbPanelCache.set(tiContainer, cacheData);
                
                btn.classList.add('done'); btn.innerHTML = '已识别';
                if (!isBatch) { 
                    renderPanelContent(cacheData, qData); 
                    globalPanel.classList.add('active'); 
                    globalPanel.style.pointerEvents = 'auto'; 
                }
            }
        } catch (e) { console.error(e); btn.innerHTML = 'AI识别'; alert("提取失败"); }
    }

    function initButton(tiContainer) { 
        let targetArea = tiContainer.querySelector('.title .title-right') || tiContainer.querySelector('.title');
        if (!targetArea || targetArea.querySelector('.fb-plugin-btn-li')) return;
        
        const btnLi = document.createElement('li'); btnLi.className = 'fb-plugin-btn-li';
        const btn = document.createElement('button'); btn.className = 'fb-plugin-btn'; btn.innerHTML = '<span>⚡</span>&nbsp;AI识别';
        
        btn.addEventListener('click', (e) => { 
            e.preventDefault(); e.stopPropagation(); 
            startAnalysis(tiContainer, btn); 
        }, true);

        btn.addEventListener('mouseenter', () => {
            if (fbPanelCache.has(tiContainer)) {
                clearTimeout(autoCloseTimer);
                currentActiveContainer = tiContainer;
                const cache = fbPanelCache.get(tiContainer);
                ensureGlobalPanel(); 
                renderPanelContent(cache, cache.qData);
                globalPanel.classList.add('active');
                globalPanel.style.pointerEvents = 'auto';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (fbPanelCache.has(tiContainer)) {
                autoCloseTimer = setTimeout(() => {
                    if (globalPanel) {
                        globalPanel.classList.remove('active');
                        globalPanel.style.pointerEvents = 'none';
                        currentActiveContainer = null;
                    }
                }, 800); 
            }
        });

        btnLi.appendChild(btn);
        if (targetArea.tagName === 'UL') targetArea.insertBefore(btnLi, targetArea.firstChild); else targetArea.appendChild(btnLi);
    }

    function init() {
        if (!document.getElementById('fb-plugin-styles')) { const s = document.createElement('style'); s.id = 'fb-plugin-styles'; s.textContent = STYLES; document.head.appendChild(s); }
        document.querySelectorAll('.ti-container, .solution-choice-container').forEach(c => initButton(c));
    }
    
    const observer = new MutationObserver(init); observer.observe(document.body, { childList: true, subtree: true });
    setInterval(init, 2000); setTimeout(init, 1000);
})();
