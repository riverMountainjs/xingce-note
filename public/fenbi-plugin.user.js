
// ==UserScript==
// @name         行测错题本智能助手 (粉笔专用)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  AI 原地辅助录入：一键识别分类、AI 助手解析（支持追问）、原地写笔记、异步静默同步到错题本。
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
    
    // 缓存：Key=题目DOM节点, Value={stem, aiResult, chatHistory}
    var fbPanelCache = new WeakMap();
    
    // 全局面板单例引用
    var globalPanel = null;
    var currentActiveContainer = null; // 当前正在展示的题目容器

    const CONFIG = {
        SERVER_URL: GM_getValue('server_url', 'https://xingce-note.pages.dev'), 
        EXTERNAL_TOKEN: GM_getValue('external_token', ''),
    };

    const STYLES = `
        /* 按钮样式 */
        .fb-plugin-btn-li {
            display: flex;
            align-items: center;
            margin-left: 10px;
            cursor: pointer;
            position: relative;
            z-index: 999;
        }
        .fb-plugin-btn {
            display: flex;
            align-items: center;
            padding: 4px 10px;
            background: #f0f9ff;
            color: #3b82f6;
            border: 1px solid #bfdbfe;
            border-radius: 14px;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
            cursor: pointer;
            pointer-events: auto;
            user-select: none;
            outline: none;
        }
        .fb-plugin-btn:hover { background: #3b82f6; color: white; border-color: #3b82f6; }
        .fb-plugin-btn:active { transform: translateY(1px); }
        
        /* 全局悬浮面板 */
        .fb-smart-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            position: fixed; /* 固定定位，防止被父元素遮挡 */
            top: 80px; 
            right: 40px; 
            width: 450px; 
            height: 70vh;
            min-width: 380px;
            min-height: 400px;
            max-width: 90vw;
            max-height: 90vh;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.25);
            z-index: 2147483647; /* 最高层级 */
            padding: 20px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            resize: both; /* 允许拖拽调整大小 */
            overflow: hidden; /* 配合resize */
            transition: opacity 0.2s, transform 0.2s;
            opacity: 0;
            pointer-events: none;
            transform: scale(0.95);
        }

        .fb-smart-panel.active {
            opacity: 1;
            pointer-events: auto;
            transform: scale(1);
        }

        /* 顶部拖拽区 (可选) */
        .fb-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #f1f5f9;
            cursor: move; /* 暗示可拖动位置，虽然这里是固定定位 */
            flex-shrink: 0;
        }
        .fb-panel-header h4 { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
        
        .fb-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            background: #eff6ff;
            color: #3b82f6;
            margin-right: 4px;
            border: 1px solid #dbeafe;
        }

        /* 滚动区域 */
        .fb-scroll-area {
            flex: 1;
            overflow-y: auto;
            padding-right: 4px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .fb-ai-content {
            background: #f8fafc;
            border-radius: 8px;
            padding: 12px;
            font-size: 14px;
            color: #334155;
            border: 1px solid #e2e8f0;
            line-height: 1.6;
        }
        .fb-ai-content p { margin: 0 0 8px 0; }
        .fb-ai-content strong { color: #0f172a; font-weight: 700; }
        
        /* 聊天区域 */
        .fb-chat-section {
            background: #fff;
            border: 1px solid #f1f5f9;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
        }
        .fb-chat-msgs {
            max-height: 180px;
            overflow-y: auto;
            margin-bottom: 8px;
            font-size: 13px;
            padding-right: 4px;
        }
        .fb-chat-msg {
            margin-bottom: 8px;
            padding: 6px 10px;
            border-radius: 6px;
            max-width: 92%;
            word-wrap: break-word;
            line-height: 1.4;
        }
        .fb-chat-msg.user {
            background: #eff6ff;
            color: #1e40af;
            align-self: flex-end;
            margin-left: auto;
            border-bottom-right-radius: 2px;
        }
        .fb-chat-msg.ai {
            background: #f1f5f9;
            color: #334155;
            align-self: flex-start;
            margin-right: auto;
            border-bottom-left-radius: 2px;
        }
        
        .fb-chat-input-box {
            display: flex;
            gap: 6px;
            align-items: flex-end;
        }
        .fb-chat-input {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 13px;
            outline: none;
            transition: all 0.2s;
            resize: none; 
            height: 36px;
            min-height: 36px;
            max-height: 72px;
            font-family: inherit;
        }
        .fb-chat-input:focus { border-color: #3b82f6; background: #fff; }

        .fb-input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px;
            font-size: 13px;
            background: #fff;
            outline: none;
            resize: vertical;
            min-height: 50px;
            font-family: inherit;
        }
        
        .fb-btn {
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: 6px;
            background: #3b82f6;
            color: white;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .fb-btn:hover { background: #2563eb; }
        .fb-btn:disabled { opacity: 0.7; cursor: not-allowed; background: #94a3b8; }
        .fb-btn.secondary { background: #fff; color: #475569; border: 1px solid #e2e8f0; margin-bottom: 8px; }
        .fb-btn.secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
        .fb-btn.success { background: #10b981; }

        .fb-loader {
            width: 12px;
            height: 12px;
            border: 2px solid #3b82f6;
            border-bottom-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: rotation 1s linear infinite;
            margin-right: 6px;
        }
        .fb-plugin-btn:hover .fb-loader { border-color: white; border-bottom-color: transparent; }
        
        .fb-chat-typing {
            display: flex;
            gap: 3px;
            padding: 6px 10px;
            background: #f1f5f9;
            border-radius: 6px;
            align-self: flex-start;
            margin-bottom: 8px;
            width: fit-content;
        }
        .fb-dot {
            width: 4px;
            height: 4px;
            background: #94a3b8;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        .fb-dot:nth-child(1) { animation-delay: -0.32s; }
        .fb-dot:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
    `;

    // ==========================================
    // 基础函数
    // ==========================================

    function parseMarkdown(text) {
        if (!text) return '';
        let html = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    async function callBackend(endpoint, body) {
        if (!CONFIG.EXTERNAL_TOKEN) {
            alert("未配置 Token！请在油猴菜单或代码中配置 EXTERNAL_TOKEN");
            return null;
        }
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `${CONFIG.SERVER_URL}/api/external/${endpoint}`,
                headers: {
                    "Content-Type": "application/json",
                    "X-External-Token": CONFIG.EXTERNAL_TOKEN
                },
                data: JSON.stringify(body),
                onload: (res) => {
                    if (res.status === 200) {
                        try { resolve(JSON.parse(res.responseText)); } catch(e) { reject("JSON Parse Error"); }
                    } else reject(`Error ${res.status}: ${res.responseText}`);
                },
                onerror: (err) => reject("Network Error")
            });
        });
    }

    // ==========================================
    // 题目数据提取
    // ==========================================
    function getQuestionData(tiContainer) {
        if (!tiContainer) return null;

        // 1. 题干
        const stemNode = tiContainer.querySelector('app-format-html > div');
        let stemText = "";
        let images = [];
        
        if (stemNode) {
            const clonedStem = stemNode.cloneNode(true);
            clonedStem.querySelectorAll('img').forEach(img => { 
                if (img.src) images.push(img.src); 
                const placeholder = document.createTextNode('[图片]');
                img.parentNode.replaceChild(placeholder, img);
            });
            stemText = clonedStem.innerText.trim();
        }

        // 2. 选项
        const options = Array.from(tiContainer.querySelectorAll('.choice-radio-label')).map(node => {
            const textNode = node.querySelector('.input-text');
            const imgNode = node.querySelector('img');
            return imgNode ? imgNode.src : (textNode ? textNode.innerText.trim() : "");
        });

        // 3. 答案提取
        const answerMap = {'A':0, 'B':1, 'C':2, 'D':3};
        let correctAnswer = -1;
        let userAnswer = -1;

        // 3.1 正确答案
        const correctNode = tiContainer.querySelector('.overall-item-value.correct-answer');
        if (correctNode) {
            correctAnswer = answerMap[correctNode.innerText.trim()] ?? -1;
        }
        if (correctAnswer === -1) {
             const c = tiContainer.querySelector('.input-radio.correct, .input-radio.correctLost');
             if (c) correctAnswer = answerMap[c.innerText.trim()];
        }

        // 3.2 用户答案
        const yourAnswerNode = tiContainer.querySelector('.overall-item-value.your-answer');
        if (yourAnswerNode) {
            const text = yourAnswerNode.innerText.trim();
            if (text.includes('未作答')) {
                userAnswer = -1;
            } else {
                const match = text.match(/[A-D]/);
                if (match) userAnswer = answerMap[match[0]];
            }
        } else {
            // 推测用户答案
            const wrongOption = tiContainer.querySelector('.input-radio.wrong');
            const correctOption = tiContainer.querySelector('.input-radio.correct');
            
            if (wrongOption) {
                userAnswer = answerMap[wrongOption.innerText.trim()];
            } else if (correctOption) {
                // 如果显示了正确选项且没显示错误选项，或者用户处于练习模式选中了该项
                userAnswer = answerMap[correctOption.innerText.trim()];
            }
        }
        
        // 如果无法确定用户选了啥，但找到了正确答案，默认用户做对了（或者不强制纠错）
        if (userAnswer === -1 && correctAnswer !== -1) {
             // 保持 -1，后端会处理为 "请完整解析"
        }

        // 4. 正确率
        const accNode = tiContainer.querySelector('.overall-item-value.correct-rate');
        const accuracy = parseInt(accNode?.innerText) || 60;

        // 5. 考点
        let tags = [];
        const tagNodes = tiContainer.querySelectorAll('.solution-keypoint-item-name'); 
        if (tagNodes.length > 0) tags = Array.from(tagNodes).map(n => n.innerText.trim()).filter(t => t);
        tags = [...new Set(tags)];

        // 6. 材料
        let materialText = "";
        const materialsContainer = document.querySelector('app-materials .material-body');
        if (materialsContainer) {
            const cloneMat = materialsContainer.cloneNode(true);
            cloneMat.querySelectorAll('img').forEach(img => {
                if (img.src && !images.includes(img.src)) images.push(img.src);
                img.remove();
            });
            materialText = cloneMat.innerText.trim();
        }

        return { stem: stemText, options, correctAnswer, userAnswer, accuracy, materials: images, tags, materialText };
    }

    // ==========================================
    // 全局面板管理
    // ==========================================

    function ensureGlobalPanel() {
        if (globalPanel) return globalPanel;

        globalPanel = document.createElement('div');
        globalPanel.className = 'fb-smart-panel';
        globalPanel.innerHTML = `
            <div class="fb-panel-header">
                <h4>🤖 AI 错题助手</h4>
                <button id="fb-panel-close" style="border:none;background:transparent;cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;">×</button>
            </div>
            <div id="fb-panel-body" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <!-- 动态内容 -->
            </div>
        `;
        document.body.appendChild(globalPanel);

        // 绑定关闭事件
        globalPanel.querySelector('#fb-panel-close').onclick = () => {
            globalPanel.classList.remove('active');
            currentActiveContainer = null;
        };

        return globalPanel;
    }

    function renderPanelContent(data) {
        const body = globalPanel.querySelector('#fb-panel-body');
        if (!data || !data.aiResult) {
            body.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">数据加载错误</div>';
            return;
        }

        const { aiResult, chatHistory } = data;

        body.innerHTML = `
            <div style="margin-bottom:10px;flex-shrink:0;">
                <span class="fb-badge" style="background:#eff6ff;color:#1d4ed8">${aiResult.category}</span>
                <span class="fb-badge" style="background:#f0fdf4;color:#15803d">${aiResult.subCategory}</span>
                ${(aiResult.tags || []).map(t => `<span class="fb-badge" style="background:#fff7ed;color:#c2410c">#${t}</span>`).join('')}
            </div>
            
            <div class="fb-scroll-area">
                <!-- AI 解析 -->
                <div class="fb-ai-content">${aiResult.miniAnalysis}</div>
                
                <!-- 聊天区 -->
                <div class="fb-chat-section">
                    <div class="fb-chat-msgs" id="chat-msgs"></div>
                    <div class="fb-chat-input-box">
                        <textarea class="fb-chat-input" id="chat-input" placeholder="有疑问？输入后点发送 (回车换行)" rows="1"></textarea>
                        <button id="send-chat-btn" style="border:none;background:#3b82f6;color:white;border-radius:6px;padding:0 12px;height:36px;cursor:pointer;font-weight:bold;font-size:12px;flex-shrink:0;">发送</button>
                    </div>
                </div>

                <!-- 笔记区 -->
                <div class="fb-note-section">
                    <button class="fb-btn secondary" id="copy-btn">📋 复制解析到笔记</button>
                    <textarea class="fb-input" id="user-note" placeholder="我的心得笔记..."></textarea>
                </div>
            </div>

            <button class="fb-btn" id="save-btn" style="margin-top:12px;height:40px;">同步到错题本</button>
        `;

        // 绑定事件
        const chatMsgs = body.querySelector('#chat-msgs');
        const chatInput = body.querySelector('#chat-input');
        const sendBtn = body.querySelector('#send-chat-btn');
        const saveBtn = body.querySelector('#save-btn');
        const copyBtn = body.querySelector('#copy-btn');
        const userNote = body.querySelector('#user-note');

        // 1. 渲染聊天历史
        if (chatHistory.length > 1) {
            chatHistory.slice(1).forEach(msg => {
                const div = document.createElement('div');
                div.className = `fb-chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`;
                div.innerHTML = parseMarkdown(msg.content);
                chatMsgs.appendChild(div);
            });
            setTimeout(() => chatMsgs.scrollTop = chatMsgs.scrollHeight, 50);
        }

        // 2. 聊天逻辑
        const sendChat = async () => {
            const msg = chatInput.value.trim();
            if (!msg) return;

            // UI 更新
            const userDiv = document.createElement('div');
            userDiv.className = 'fb-chat-msg user';
            userDiv.innerText = msg;
            chatMsgs.appendChild(userDiv);
            chatInput.value = '';

            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'fb-chat-typing';
            loadingDiv.innerHTML = '<div class="fb-dot"></div><div class="fb-dot"></div><div class="fb-dot"></div>';
            chatMsgs.appendChild(loadingDiv);
            chatMsgs.scrollTop = chatMsgs.scrollHeight;
            chatInput.disabled = true;

            try {
                // 获取当前题目最新上下文
                const qData = getQuestionData(currentActiveContainer);
                const chatRes = await callBackend('chat', {
                    stem: qData.stem,
                    options: qData.options,
                    history: chatHistory.slice(-6),
                    newMessage: msg
                });

                chatMsgs.removeChild(loadingDiv);
                if (chatRes && chatRes.reply) {
                    const aiDiv = document.createElement('div');
                    aiDiv.className = 'fb-chat-msg ai';
                    aiDiv.innerHTML = parseMarkdown(chatRes.reply);
                    chatMsgs.appendChild(aiDiv);
                    
                    // 更新历史
                    chatHistory.push({ role: 'user', content: msg });
                    chatHistory.push({ role: 'assistant', content: chatRes.reply });
                    
                    // 更新缓存
                    fbPanelCache.set(currentActiveContainer, { 
                        stem: qData.stem, 
                        aiResult: aiResult, 
                        chatHistory: chatHistory 
                    });
                }
            } catch (e) {
                if(loadingDiv.parentNode) chatMsgs.removeChild(loadingDiv);
                alert("发送失败，请重试");
            } finally {
                chatInput.disabled = false;
                chatInput.focus();
                chatMsgs.scrollTop = chatMsgs.scrollHeight;
            }
        };

        sendBtn.onclick = sendChat;
        // 注意：这里不监听 Enter，完全符合用户需求

        // 3. 复制笔记
        copyBtn.onclick = () => {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = aiResult.miniAnalysis;
            userNote.value = (userNote.value + '\n\n【AI解析】\n' + tempDiv.innerText).trim();
            copyBtn.innerText = '✅ 已复制';
            setTimeout(() => copyBtn.innerText = '📋 复制解析到笔记', 2000);
        };

        // 4. 保存同步
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="fb-loader"></span> 同步中...';
            try {
                const qData = getQuestionData(currentActiveContainer);
                const finalNote = userNote.value ? `<p>${userNote.value.replace(/\n/g, '<br/>')}</p>` : '';
                
                await callBackend('save', {
                    id: Date.now().toString(),
                    createdAt: Date.now(),
                    stem: qData.stem,
                    options: qData.options,
                    materials: qData.materials,
                    materialText: qData.materialText,
                    correctAnswer: qData.correctAnswer,
                    accuracy: qData.accuracy,
                    category: aiResult.category,
                    subCategory: aiResult.subCategory,
                    tags: aiResult.tags,
                    noteText: finalNote,
                    mistakeCount: 0
                });

                saveBtn.classList.add('success');
                saveBtn.innerHTML = '✓ 已存入';
                
                // 自动关闭
                setTimeout(() => {
                    globalPanel.classList.remove('active');
                    currentActiveContainer = null;
                }, 1000);
            } catch (e) {
                alert("保存失败: " + e);
                saveBtn.disabled = false;
                saveBtn.innerHTML = '重试';
            }
        };
    }

    // ==========================================
    // 启动流程
    // ==========================================

    async function startAnalysis(tiContainer, btn) {
        currentActiveContainer = tiContainer;
        ensureGlobalPanel();
        
        // 1. 检查缓存
        if (fbPanelCache.has(tiContainer)) {
            const cached = fbPanelCache.get(tiContainer);
            // 简单验证题干是否匹配（防止题目列表刷新后DOM重用）
            const currentQ = getQuestionData(tiContainer);
            if (currentQ && currentQ.stem && cached.stem.substring(0, 20) === currentQ.stem.substring(0, 20)) {
                renderPanelContent(cached);
                globalPanel.classList.add('active');
                return;
            }
        }

        // 2. 无缓存，开始分析
        if (!CONFIG.EXTERNAL_TOKEN) {
            const token = prompt("请输入错题本 External Token:");
            if (token) {
                GM_setValue('external_token', token);
                CONFIG.EXTERNAL_TOKEN = token;
            } else return;
        }

        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<span class="fb-loader"></span> 分析中';
        btn.style.pointerEvents = 'none';

        try {
            const qData = getQuestionData(tiContainer);
            if (!qData || !qData.stem) throw "未找到题目内容";

            const payload = {
                stem: qData.stem,
                options: qData.options,
                materials: qData.materials,
                materialText: qData.materialText,
                userAnswer: qData.userAnswer,
                correctAnswer: qData.correctAnswer
            };

            const aiResult = await callBackend('analyze', payload);
            
            if (aiResult) {
                // 补全 tags
                aiResult.tags = qData.tags || [];
                
                const cacheData = {
                    stem: qData.stem,
                    aiResult: aiResult,
                    chatHistory: [{ role: 'assistant', content: aiResult.miniAnalysis }]
                };

                fbPanelCache.set(tiContainer, cacheData);
                renderPanelContent(cacheData);
                globalPanel.classList.add('active');
            }
        } catch (e) {
            console.error(e);
            alert("分析失败: " + e);
        } finally {
            btn.innerHTML = originalBtnText;
            btn.style.pointerEvents = 'auto';
        }
    }

    function initButton(tiContainer) {
        // 找到标题栏右侧
        const titleRightUl = tiContainer.querySelector('.title .title-right');
        if (!titleRightUl) return;
        if (titleRightUl.querySelector('.fb-plugin-btn-li')) return;

        const btnLi = document.createElement('li');
        btnLi.className = 'fb-plugin-btn-li';
        
        const btn = document.createElement('button');
        btn.className = 'fb-plugin-btn';
        btn.innerHTML = '<span>⚡</span>&nbsp;AI 分析';
        
        // 强力点击事件
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            startAnalysis(tiContainer, btn);
        }, true);
        
        btnLi.appendChild(btn);
        titleRightUl.insertBefore(btnLi, titleRightUl.firstChild);
    }

    function init() {
        const styleId = 'fb-plugin-styles';
        if (!document.getElementById(styleId)) {
            const styleTag = document.createElement('style');
            styleTag.id = styleId;
            styleTag.textContent = STYLES;
            document.head.appendChild(styleTag);
        }

        const containers = document.querySelectorAll('.ti-container');
        containers.forEach(c => initButton(c));
    }

    // 监听 DOM 变化
    const observer = new MutationObserver(init);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 初始运行
    setTimeout(init, 1000);

})();
