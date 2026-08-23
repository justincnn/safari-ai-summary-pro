// ==UserScript==
// @name         Safari AI Summary Pro
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Safari 专用 AI 页面总结工具，Readability 提取正文, 毛玻璃UI, 支持暗黑模式, 模型 API 动态加载
// @author       Justin Ye
// @license      MIT
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      api.openai.com
// @connect      *
// ==/UserScript==

(function () {
'use strict';

// 兼容性处理：获取正确的 window 对象（marked/Readability 需在页面 context）
let targetWindow = window;
try {
    if (typeof unsafeWindow !== 'undefined') targetWindow = unsafeWindow;
    else if (window.unsafeWindow) targetWindow = window.unsafeWindow;
} catch (e) {}

// ---------- 工具 ----------

// 封装 GM_xmlhttpRequest 为 Promise，解决跨域
function gmFetch(url, options) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: options.method || 'GET',
            url: url,
            headers: options.headers,
            data: options.body,
            timeout: options.timeout || 30000,
            onload: (r) => {
                if (r.status >= 200 && r.status < 300) {
                    resolve({
                        json: () => Promise.resolve((() => { try { return JSON.parse(r.responseText); } catch (e) { return {}; } })()),
                        status: r.status
                    });
                } else {
                    reject(new Error(`HTTP ${r.status} ${r.statusText || ''}`));
                }
            },
            onerror: () => reject(new Error('网络错误：无法连接服务器')),
            ontimeout: () => reject(new Error('请求超时'))
        });
    });
}

// 懒加载外部 JS 注入页面 context (marked / highlight)
function loadScriptInPage(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('资源加载失败: ' + src));
        document.head.appendChild(s);
    });
}

let markedLoaded = false;
async function loadMarked() {
    if (markedLoaded) return;
    if (typeof targetWindow.marked !== 'undefined') { markedLoaded = true; return; }
    await loadScriptInPage('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
    if (targetWindow.marked) targetWindow.marked.setOptions({ breaks: true, gfm: true });
    markedLoaded = true;
}

// 提取正文：优先主要内容容器，剔除杂项，长度受限
function extractMainText() {
    const sel = 'article, [role="main"], main, #content, .post-content, .entry-content, .prose, .article-content';
    let el = document.querySelector(sel) || document.body;
    const clone = el.cloneNode(true);
    ['script','style','noscript','iframe','svg','canvas','form','button','nav','aside','footer','header','.ads','.ad','[class*="ad-"]','[id*="ad-"]','.share','.social','#comments','.comment','.related']
        .forEach(s => { clone.querySelectorAll(s).forEach(n => n.remove()); });
    const text = (clone.innerText || '').trim().replace(/\n{3,}/g, '\n\n');
    return text.length > 24000 ? text.substring(0, 24000) + '\n\n……[内容过长已截断]' : text;
}

// ---------- 配置 ----------

const NEW_PROMPT = `你是一个专业的中文内容总结器。你的任务是分析提供的网页内容，**识别内容类型（例如：新闻报道、研究报告、普通文章、市场分析等）**，并在此基础上创建一个清晰、简洁、结构良好的中文总结。**总结必须严格依据原文内容，不得进行任何推测、假设或添加原文中未包含的信息。**

请严格遵守以下指南：
1. **内容类型识别与结构确定：** 先识别原文的内容类型，根据类型确定最合适的自然分段。可以使用 **##** 作为主要分段的标题，例如新闻用"事件概述"、"关键进展"，报告用"主要发现"、"数据支持"等。
2. **输出格式：** 使用 **##** 表示主要段落标题；使用 **•** 表示段落内的关键点；使用**粗体**突出重要术语；使用 **>** 表示引人注目的原文引述（如果适用）。
3. **内容要求：** 总结必须**严格忠于原文**，禁止任何推测或观点；保留重要数据、数字、关键事实。
4. **写作风格：** 语言清晰简洁、专业客观、逻辑流畅、易于理解。
5. **重要规则：** **DO NOT show your reasoning process.**`;

const DEFAULT_CONFIG = {
    apiUrl: '',
    apiKey: '',
    model: '',
    prompt: NEW_PROMPT,
    theme: 'auto', // auto, light, dark
    shortcut: 'Alt+S'
};

const GM = {
    setValue: (k, v) => { if (typeof GM_setValue !== 'undefined') GM_setValue(k, v); else localStorage.setItem('safari_pro_' + k, JSON.stringify(v)); },
    getValue: (k, d) => { if (typeof GM_getValue !== 'undefined') return GM_getValue(k, d); const v = localStorage.getItem('safari_pro_' + k); return v ? JSON.parse(v) : d; }
};

let config = Object.assign({}, DEFAULT_CONFIG);
Object.keys(DEFAULT_CONFIG).forEach(k => { config[k] = GM.getValue(k, DEFAULT_CONFIG[k]); });

// ---------- UI 样式 ----------
const style = document.createElement('style');
style.textContent = `
:root{
    --glass-bg: rgba(255,255,255,0.75);
    --glass-border: rgba(255,255,255,0.5);
    --glass-shadow: 0 8px 32px rgba(31,38,135,0.15);
    --text-primary:#1d1d1f; --text-secondary:#86868b;
    --accent:#007AFF; --accent-hover:#0a6fe0;
    --input-bg: rgba(255,255,255,0.5);
    --radius-lg:16px; --radius-md:12px; --radius-sm:8px;
    --hl-bg: rgba(0,0,0,0.08);
}
@media (prefers-color-scheme: dark){
    :root{
        --glass-bg: rgba(30,30,32,0.78);
        --glass-border: rgba(255,255,255,0.1);
        --glass-shadow: 0 8px 32px rgba(0,0,0,0.3);
        --text-primary:#f5f5f7; --text-secondary:#98989d;
        --accent:#0A84FF; --accent-hover:#409CFF;
        --input-bg: rgba(0,0,0,0.3);
        --hl-bg: rgba(255,255,255,0.08);
    }
}
[data-theme="light"]{--glass-bg:rgba(255,255,255,0.75);--text-primary:#1d1d1f;--text-secondary:#86868b;--input-bg:rgba(255,255,255,0.5);--hl-bg:rgba(0,0,0,0.08);}
[data-theme="dark"]{--glass-bg:rgba(30,30,32,0.78);--text-primary:#f5f5f7;--text-secondary:#98989d;--input-bg:rgba(0,0,0,0.3);--hl-bg:rgba(255,255,255,0.08);}

.sas-glass{background:var(--glass-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--glass-border);box-shadow:var(--glass-shadow);color:var(--text-primary);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.sas-fab{position:fixed;right:24px;bottom:24px;z-index:2147483647;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:transform .2s;}
.sas-fab:hover{transform:scale(1.08);}
.sas-fab:active{transform:scale(.95);}
.sas-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.96);z-index:2147483647;width:92%;max-width:640px;max-height:86vh;border-radius:var(--radius-lg);display:flex;flex-direction:column;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;overflow:hidden;}
.sas-panel.show{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1);}
.sas-header{padding:16px 20px;border-bottom:1px solid var(--glass-border);display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:17px;}
.sas-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;}
.sas-icon-btn{background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:4px;border-radius:50%;transition:background .2s;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;}
.sas-icon-btn:hover{background:rgba(128,128,128,.12);}
.sas-content{padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;}
#sas-settings{background:rgba(128,128,128,.06);padding:16px;border-radius:var(--radius-md);border:1px solid var(--glass-border);}
.sas-field{margin-bottom:14px;}
.sas-label{display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px;font-weight:500;}
.sas-input,.sas-textarea,.sas-select{width:100%;padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--glass-border);background:var(--input-bg);color:var(--text-primary);font-family:inherit;font-size:14px;box-sizing:border-box;transition:border-color .2s;}
.sas-input:focus,.sas-textarea:focus,.sas-select:focus{outline:none;border-color:var(--accent);}
.sas-textarea{min-height:90px;resize:vertical;}
.sas-row{display:flex;gap:8px;}
.sas-btn{background:var(--accent);color:#fff;border:none;padding:10px 18px;border-radius:var(--radius-md);font-weight:500;cursor:pointer;font-size:15px;transition:background .2s,opacity .2s;}
.sas-btn:hover{background:var(--accent-hover);}
.sas-btn:disabled{opacity:.6;cursor:not-allowed;}
.sas-btn.sec{background:transparent;border:1px solid var(--glass-border);color:var(--text-primary);}
.sas-btn.sec:hover{background:rgba(128,128,128,.1);}
.sas-btn.sm{padding:6px 12px;font-size:13px;}
.sas-actions{padding:16px 20px;border-top:1px solid var(--glass-border);display:flex;gap:8px;align-items:center;}
.sas-spacer{flex:1;}
.sas-markdown{line-height:1.75;font-size:15px;}
.sas-markdown h1,.sas-markdown h2,.sas-markdown h3{font-weight:600;line-height:1.3;margin:1.4em 0 .8em;}
.sas-markdown h1,.sas-markdown h2{font-size:1.5em;}
.sas-markdown h3{font-size:1.2em;}
.sas-markdown p{margin:.8em 0;}
.sas-markdown ul{padding-left:1.2em;margin:.6em 0;}
.sas-markdown li{margin:.4em 0;}
.sas-markdown blockquote{margin:1em 0;padding:.8em 1.2em;background:rgba(128,128,128,.05);border-left:4px solid var(--accent);border-radius:6px;color:var(--text-secondary);font-style:italic;}
.sas-markdown code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.9em;background:rgba(128,128,128,.15);border:1px solid var(--glass-border);border-radius:4px;padding:.15em .4em;color:var(--accent);}
.sas-markdown pre{background:var(--hl-bg);border:1px solid var(--glass-border);border-radius:8px;padding:1.2em;overflow-x:auto;margin:1.2em 0;}
.sas-markdown pre code{background:none;border:none;padding:0;color:inherit;}
.sas-markdown table{border-collapse:collapse;width:100%;margin:1em 0;}
.sas-markdown th,.sas-markdown td{border:1px solid var(--glass-border);padding:8px 12px;font-size:14px;}
.sas-markdown th{background:rgba(128,128,128,.1);}
@keyframes spin{100%{transform:rotate(360deg)}}
.sas-loading{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin-right:8px;vertical-align:middle;}
.sas-muted{color:var(--text-secondary);font-size:13px;}
.sas-error{color:#ff3b30;}
`;
document.head.appendChild(style);

// ---------- DOM ----------
const fab = document.createElement('div');
fab.className = 'sas-glass sas-fab';
fab.title = 'AI 页面总结 (右键设置)';
fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" opacity=".15"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
(document.body || document.documentElement).appendChild(fab);

const panel = document.createElement('div');
panel.className = 'sas-glass sas-panel';
(document.body || document.documentElement).appendChild(panel);

// ---------- 逻辑 ----------
let isOpen = false, isSettingsOpen = false, lastMarkdown = '';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function applyTheme() {
    const t = config.theme;
    panel.setAttribute('data-theme', t === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t);
}

function refreshModels() {
    const urlInput = document.getElementById('sas-api-url'), keyInput = document.getElementById('sas-api-key'), sel = document.getElementById('sas-model');
    if (!sel) return;
    const apiUrl = urlInput ? urlInput.value.trim() : config.apiUrl;
    const key = keyInput ? keyInput.value.trim() : config.apiKey;
    if (!apiUrl) { sel.innerHTML = '<option value="">请先填 API 地址</option>'; return; }
    sel.innerHTML = '<option value="">加载模型中…</option>';
    gmFetch(apiUrl.replace(/\/+$/, '') + '/models', { method: 'GET', headers: { 'Authorization': 'Bearer ' + key }, timeout: 15000 })
        .then(r => r.json())
        .then(data => {
            const ids = (data.data || []).map(m => m && m.id).filter(Boolean);
            if (!ids.length) { sel.innerHTML = '<option value="">未返回模型</option>'; return; }
            sel.innerHTML = ['<option value="">请选择模型</option>', ...ids.map(id => `<option value="${esc(id)}" ${id === config.model ? 'selected' : ''}>${esc(id)}</option>`)].join('');
        })
        .catch(() => { sel.innerHTML = '<option value="">模型加载失败（检查 API 地址/Key）</option>'; });
}

function renderPanel() {
    applyTheme();
    if (!config.apiKey) isSettingsOpen = true;
    const title = (document.title || '').length > 24 ? document.title.substring(0, 24) + '…' : (document.title || 'AI 总结');
    const settingsHtml = `
        <div id="sas-settings" style="display:${isSettingsOpen ? 'block' : 'none'}">
            <div class="sas-field"><label class="sas-label">API 地址 (Base URL，例：https://xx/v1)</label>
                <input type="text" class="sas-input" id="sas-api-url" value="${esc(config.apiUrl)}" placeholder="https://example.com/v1"></div>
            <div class="sas-field"><label class="sas-label">API Key</label>
                <input type="password" class="sas-input" id="sas-api-key" value="${esc(config.apiKey)}" placeholder="sk-..."></div>
            <div class="sas-field"><label class="sas-label">模型 (填对 API 地址后自动加载)</label>
                <div class="sas-row"><select class="sas-input" id="sas-model" style="flex:1;"><option value="${esc(config.model)}">${esc(config.model || '加载中，请先填 API 地址…')}</option></select>
                <button class="sas-btn sec sm" id="sas-refresh">刷新</button></div></div>
            <div class="sas-field"><label class="sas-label">提示词 (Prompt)</label>
                <textarea class="sas-textarea" id="sas-prompt">${esc(config.prompt)}</textarea></div>
            <div class="sas-field"><label class="sas-label">快捷键 — 点击输入，Backspace 清除</label>
                <input type="text" class="sas-input" id="sas-shortcut" value="${esc(config.shortcut)}" readonly></div>
            <div class="sas-field"><label class="sas-label">主题</label>
                <select class="sas-select" id="sas-theme">
                    <option value="auto" ${config.theme === 'auto' ? 'selected' : ''}>跟随系统</option>
                    <option value="light" ${config.theme === 'light' ? 'selected' : ''}>浅色</option>
                    <option value="dark" ${config.theme === 'dark' ? 'selected' : ''}>深色</option>
                </select></div>
            <button class="sas-btn" id="sas-save" style="width:100%;margin-top:4px;">保存配置</button>
        </div>`;
    panel.innerHTML = `
        <div class="sas-header">
            <span class="sas-title">${esc(title)}</span>
            <div style="display:flex;"><button class="sas-icon-btn" id="sas-set" title="设置">⚙</button>
            <button class="sas-icon-btn" id="sas-close" title="关闭">✕</button></div>
        </div>
        <div class="sas-content">
            ${settingsHtml}
            <div id="sas-result" class="sas-markdown"><p class="sas-muted">点击「开始总结」生成内容概要…</p></div>
        </div>
        <div class="sas-actions">
            <button class="sas-btn" id="sas-go">开始总结</button>
            <span class="sas-spacer"></span>
            <button class="sas-btn sec sm" id="sas-copy">复制</button>
            <button class="sas-btn sec sm" id="sas-newtab">新标签</button>
        </div>`;

    panel.querySelector('#sas-close').onclick = () => { closePanel(); };
    panel.querySelector('#sas-set').onclick = () => { isSettingsOpen = !isSettingsOpen; document.getElementById('sas-settings').style.display = isSettingsOpen ? 'block' : 'none'; };
    panel.querySelector('#sas-save').onclick = saveSettings;
    panel.querySelector('#sas-go').onclick = startSummary;
    panel.querySelector('#sas-copy').onclick = copyResult;
    panel.querySelector('#sas-newtab').onclick = openInNewTab;
    panel.querySelector('#sas-refresh').onclick = refreshModels;

    document.getElementById('sas-shortcut').addEventListener('keydown', e => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Backspace' || e.key === 'Delete') { document.getElementById('sas-shortcut').value = ''; return; }
        const keys = [];
        if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift'); if (e.metaKey) keys.push('Meta');
        let k = e.key.toUpperCase();
        if (e.code.startsWith('Key')) k = e.code.slice(3).toUpperCase();
        else if (e.code.startsWith('Digit')) k = e.code.slice(5);
        if (!['CONTROL', 'ALT', 'SHIFT', 'META', 'BACKSPACE', 'DELETE'].includes(k)) keys.push(k);
        if (keys.length) document.getElementById('sas-shortcut').value = keys.join('+');
    });

    if (config.apiUrl) refreshModels();
}

function openPanel() { renderPanel(); panel.classList.add('show'); isOpen = true; }
function closePanel() { panel.classList.remove('show'); isOpen = false; }

function saveSettings() {
    ['sas-api-url', 'sas-api-key', 'sas-model', 'sas-prompt', 'sas-theme', 'sas-shortcut'].forEach(id => {
        const val = document.getElementById(id).value;
        const key = { 'sas-api-url': 'apiUrl', 'sas-api-key': 'apiKey', 'sas-model': 'model', 'sas-prompt': 'prompt', 'sas-theme': 'theme', 'sas-shortcut': 'shortcut' }[id];
        config[key] = val;
        GM.setValue(key, val);
    });
    applyTheme();
    alert('配置已保存');
}

function copyResult() {
    const txt = lastMarkdown || (document.getElementById('sas-result') ? document.getElementById('sas-result').innerText : '');
    navigator.clipboard.writeText(txt).then(() => alert('已复制')).catch(() => alert('复制失败'));
}
function openInNewTab() {
    if (!lastMarkdown) return alert('暂无结果');
    const blob = new Blob([lastMarkdown], { type: 'text/markdown' });
    window.open(URL.createObjectURL(blob), '_blank');
}

async function startSummary() {
    const urlInput = document.getElementById('sas-api-url'), keyInput = document.getElementById('sas-api-key'),
          modelSel = document.getElementById('sas-model'), promptTextarea = document.getElementById('sas-prompt'), resultArea = document.getElementById('sas-result'), goBtn = document.getElementById('sas-go');
    const apiUrl = urlInput.value.trim(); const apiKey = keyInput.value.trim(); const model = modelSel.value; const prompt = promptTextarea.value;
    config.apiUrl = apiUrl; config.apiKey = apiKey;

    if (!apiUrl) return alert('请先填写 API 地址');
    if (!apiKey) return alert('请先填写 API Key');
    if (!model) return alert('请先选择模型');

    goBtn.disabled = true; goBtn.innerHTML = '<span class="sas-loading"></span>总结中…';
    resultArea.innerHTML = '<p class="sas-muted">正在提取正文并生成概要，请稍候…</p>';

    try {
        const pageContent = extractMainText();
        if (!pageContent) throw new Error('未能提取到页面正文');
        await loadMarked();
        const r = await gmFetch(apiUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST', timeout: 120000,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: pageContent }] })
        });
        const data = await r.json();
        const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
        if (!content) throw new Error('API 返回异常（无内容）');
        lastMarkdown = content.replace(/^```(markdown)?\s*/i, '').replace(/\s*```$/, '');
        const parse = targetWindow.marked ? targetWindow.marked.parse : t => t;
        resultArea.innerHTML = parse(lastMarkdown);
    } catch (err) {
        console.error(err);
        resultArea.innerHTML = `<p class="sas-error">出错啦: ${esc(err.message || '未知错误')}</p>`;
    } finally {
        goBtn.disabled = false; goBtn.innerHTML = '重新总结';
    }
}

// ---------- 悬浮球拖拽 + 边缘吸附 ----------
let dragging = false, isDrag = false, sx, sy, fl, ft;
fab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; isDrag = false; sx = e.clientX; sy = e.clientY;
    const r = fab.getBoundingClientRect();
    fl = r.left; ft = r.top;
    fab.style.right = 'auto'; fab.style.left = r.left + 'px'; fab.style.top = r.top + 'px'; fab.style.bottom = 'auto';
    const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDrag = true;
        if (isDrag) { fab.style.left = (fl + dx) + 'px'; fab.style.top = (ft + dy) + 'px'; }
    };
    const up = () => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
        dragging = false;
        if (isDrag) snapFab();
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});
fab.addEventListener('click', e => { e.stopPropagation(); if (!isDrag) isOpen ? closePanel() : openPanel(); });
fab.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (!isDrag) { isSettingsOpen = true; openPanel(); } });

function snapFab() {
    const r = fab.getBoundingClientRect(), m = 12;
    fab.style.left = ''; fab.style.right = ''; fab.style.top = ''; fab.style.bottom = '';
    if (r.left + r.width / 2 < window.innerWidth / 2) fab.style.left = Math.max(m, r.left) + 'px';
    else fab.style.right = Math.max(m, window.innerWidth - r.right) + 'px';
    fab.style.bottom = '24px';
}

document.addEventListener('click', e => { if (isOpen && !panel.contains(e.target) && !fab.contains(e.target)) closePanel(); });
panel.addEventListener('click', e => e.stopPropagation());

// 全局快捷键
document.addEventListener('keydown', e => {
    if (!config.shortcut) return;
    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift'); if (e.metaKey) keys.push('Meta');
    let k = e.key.toUpperCase();
    if (e.code.startsWith('Key')) k = e.code.slice(3).toUpperCase();
    else if (e.code.startsWith('Digit')) k = e.code.slice(5);
    if (!['CONTROL', 'ALT', 'SHIFT', 'META'].includes(k)) keys.push(k);
    if (keys.join('+') === config.shortcut) {
        e.preventDefault(); e.stopPropagation();
        if (!isOpen) openPanel(); startSummary();
    }
});

if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('打开面板', () => openPanel());
    GM_registerMenuCommand('重置配置', () => { Object.keys(config).forEach(k => { config[k] = DEFAULT_CONFIG[k]; GM.setValue(k, DEFAULT_CONFIG[k]); }); renderPanel(); alert('配置已重置'); });
}

// 初始需要触发 renderPanel 的变量存在，但面板在打开时才构建
})();