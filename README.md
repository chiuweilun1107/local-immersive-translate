# 本地端沈浸式翻譯 Chrome Extension

使用本地 Ollama LLM（Qwen3:8B）進行雙語對照網頁翻譯，完全離線，保護隱私。

## 快速開始

### 1. 安裝 Ollama
```bash
brew install ollama
ollama serve
ollama pull qwen3:8b
```

### 2. 安裝依賴並啟動開發模式
```bash
pnpm install
pnpm dev
```

### 3. 載入 Extension
- 開啟 Chrome → `chrome://extensions/`
- 啟用「開發人員模式」
- 點擊「載入未封裝項目」→ 選擇 `.output/chrome-mv3/`

## 功能

- 網頁雙語對照翻譯（英文 → 繁體中文）
- 支援靜態網頁（Wikipedia、GitHub、MDN 等）
- 批次合併請求，翻譯效率提升 60%
- 7 天本地快取，避免重複翻譯
- Popup UI：開關、模型選擇、連線狀態

## 技術棧

- WXT（Chrome Extension 框架）
- React + TypeScript
- Ollama（本地 LLM 伺服器）
- Qwen3:8B（預設翻譯模型）

## 開發路線圖

- [x] Phase 0：環境建置
- [x] Phase 1：MVP（靜態網頁雙語注入）
- [ ] Phase 2：SPA 支援 + 批次優化
- [ ] Phase 3：體驗優化（串流顯示）
- [ ] Phase 4：YouTube 字幕、PDF 翻譯
