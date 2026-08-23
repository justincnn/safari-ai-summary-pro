# Safari AI Summary Pro 🧠✨

> Safari 专用 AI 页面总结工具 — 把任意网页提炼成结构清晰的中文概要。
> AI page-summary userscript for Safari — distill any webpage into a clean, structured summary.
> **中文 · English**

![license](https://img.shields.io/badge/license-MIT-blue)
![version](https://img.shields.io/badge/version-2.0-blue)

---

## ✨ 功能 / Features

- 🔍 **一键总结**：悬浮球按钮或快捷键，即刻总结当前网页
- 📄 **正文提取**：基于 Mozilla Readability 思路，自动剔除导航/广告/评论，只保留正文
- 🎨 **毛玻璃 UI**：苹果原生毛玻璃面板，原生暗黑模式
- 📝 **模型自动加载**：填好 API 地址后自动拉取 `/v1/models` 下拉选择，不写死模型
- ⚙️ **完全自定义**：API 地址 / Key / 模型 / 提示词 / 快捷键 / 主题
- 🖱️ **可拖悬浮球**：随意拖动，自动吸附屏幕边缘

---

## 📦 安装 / Install

需要一个**用户脚本管理器**：

| 浏览器 | 管理器 |
|---|---|
| **Safari** | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 或 Tampermonkey for Safari |
| Chrome / Edge | [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) / [Violentmonkey](https://violentmonkey.github.io/) |
| Firefox | [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) / [Violentmonkey](https://violentmonkey.github.io/) |

**安装步骤：**

1. 装好上面的管理器
2. 打开脚本地址（本仓库 `safari-ai-summary-pro.user.js`，或安装 Greasy Fork 版本）
3. 管理器弹窗 → 点击「安装」
4. 刷新任意网页，右下角出现 **＋** 悬浮按钮

> **Safari 特别说明**：安装 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 后，在 设置 → Safari → 扩展 里开启 Userscripts，然后用其编辑器导入脚本源码并保存，刷新页面即可。

---

## 🚀 使用 / Usage

1. 点右下角 **＋** 悬浮球 → 打开面板
2. 首次使用点击 ⚙ **设置**，填写：
   - **API 地址**：OpenAI 兼容网关 Base URL，如 `https://your-gateway.com/v1`
   - **API Key**：对应密钥
   - **模型**：填好地址后点「刷新」自动列出可用模型，下拉选择
   - （提示词、快捷键、主题按需调整）
3. 点 **保存配置**
4. 点 **开始总结** → 几秒后出现中文概要
5. 可**复制**结果，或在**新标签**打开

### ⌨️ 快捷键
- 默认 `Alt+A`：一键打开并总结
- 设置里可重新录入（键盘直接按组合键），`Backspace` 清除

---

## ⚙️ 配置项 / Configuration

| 配置 | 默认 | 说明 |
|---|---|---|
| API 地址 | 空 | OpenAI 兼容 Base URL，含 `/v1` |
| API Key | 空 | 网关密钥 |
| 模型 | 空（自动加载） | 填好地址后自动列出 |
| 提示词 | 内置中文总结器 | 决定总结风格与结构 |
| 快捷键 | `Alt+A` | Ctrl/Alt/Shift/Meta 组合 |
| 主题 | 跟随系统 | auto / light / dark |

配置保存于本机（`GM_setValue` / localStorage），换机或清缓存需重新配置。

---

## 🛠️ 技术细节 / Tech

- 纯原生 JavaScript，**零构建、单文件**
- `GM_xmlhttpRequest` 处理跨域请求
- 懒加载 `marked.js` 渲染 Markdown；正文提取仿 Readability
- 全部逻辑封装在单个 `safari-ai-summary-pro.user.js`

---

## 📈 更新 / Updates

脚本带 `@updateURL` / `@downloadURL`，配合 Greasy Fork 自动更新。也可在本仓库获取最新源码。

---

## 📜 License

[MIT](./LICENSE) © Justin Ye

---

*中文文档 · English available on request — 提 Issue 我会补完整英文版。*