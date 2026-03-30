import { useEffect, useState } from 'react';
import './App.css';

const MODELS = ['qwen3:8b', 'qwen2.5:7b', 'qwen2.5:3b', 'gemma3:4b'];

type Mode = 'bilingual' | 'translation_only';

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState('qwen3:8b');
  const [mode, setMode] = useState<Mode>('bilingual');
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Phase 2 feature flags
  const [selectionEnabled, setSelectionEnabled] = useState(true);
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const [inputEnabled, setInputEnabled] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(
      ['imt_enabled', 'imt_model', 'imt_mode', 'imt_selection', 'imt_hover', 'imt_input'],
      (result) => {
        setEnabled(result.imt_enabled ?? false);
        setModel(result.imt_model ?? 'qwen3:8b');
        setMode(result.imt_mode ?? 'bilingual');
        setSelectionEnabled(result.imt_selection ?? true);
        setHoverEnabled(result.imt_hover ?? true);
        setInputEnabled(result.imt_input ?? true);
      }
    );
    checkHealth();
  }, []);

  async function checkHealth() {
    setOllamaOk(null);
    const res = await chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' });
    setOllamaOk(res?.ok ?? false);
    if (res?.ok) {
      const modelsRes = await chrome.runtime.sendMessage({ type: 'LIST_MODELS' });
      setAvailableModels(modelsRes?.models ?? []);
    }
  }

  async function sendToContentScript(payload: Record<string, unknown>) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, payload);
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    await chrome.storage.local.set({ imt_enabled: next, imt_model: model, imt_mode: mode });
    await sendToContentScript({ type: 'SET_ENABLED', enabled: next, model, mode });
  }

  async function changeModel(m: string) {
    setModel(m);
    await chrome.storage.local.set({ imt_model: m });
  }

  async function changeMode(m: Mode) {
    setMode(m);
    await chrome.storage.local.set({ imt_mode: m });
    if (enabled) {
      await sendToContentScript({ type: 'SET_ENABLED', enabled: false, model, mode: m });
      setTimeout(async () => {
        await sendToContentScript({ type: 'SET_ENABLED', enabled: true, model, mode: m });
      }, 100);
    }
  }

  async function toggleFeature(feature: 'selection' | 'hover' | 'input', current: boolean) {
    const next = !current;
    const storageKey = `imt_${feature}` as const;
    await chrome.storage.local.set({ [storageKey]: next });
    await sendToContentScript({ type: 'SET_FEATURE', feature, enabled: next });

    if (feature === 'selection') setSelectionEnabled(next);
    else if (feature === 'hover') setHoverEnabled(next);
    else if (feature === 'input') setInputEnabled(next);
  }

  const displayModels = availableModels.length > 0 ? availableModels : MODELS;

  return (
    <div className="popup">
      <header>
        <div className="logo-area">
          <span className="logo">本地沈浸式翻譯</span>
          <span className={`status-dot ${ollamaOk === true ? 'ok' : ollamaOk === false ? 'err' : 'checking'}`} />
        </div>
        <span className="version">v0.1.0</span>
      </header>

      {ollamaOk === false && (
        <div className="warning">
          Ollama 未啟動，請執行 <code>ollama serve</code>
        </div>
      )}

      {/* 主要翻譯按鈕 */}
      <button
        className={`main-btn ${enabled ? 'active' : ''}`}
        onClick={toggleEnabled}
        disabled={ollamaOk !== true}
      >
        {enabled ? '顯示原文' : '開始雙語翻譯'}
      </button>

      {/* 翻譯模式 */}
      <div className="section-label">翻譯模式</div>
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'bilingual' ? 'active' : ''}`}
          onClick={() => changeMode('bilingual')}
        >
          雙語對照
        </button>
        <button
          className={`mode-tab ${mode === 'translation_only' ? 'active' : ''}`}
          onClick={() => changeMode('translation_only')}
        >
          僅譯文
        </button>
      </div>

      {/* 翻譯服務 */}
      <div className="row">
        <span className="row-label">翻譯服務</span>
        <span className="row-value service-badge">Ollama 本地</span>
      </div>

      {/* 模型選擇 */}
      <div className="row">
        <span className="row-label">模型</span>
        <select value={model} onChange={(e) => changeModel(e.target.value)}>
          {displayModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* 目標語言 */}
      <div className="row">
        <span className="row-label">目標語言</span>
        <span className="row-value">繁體中文</span>
      </div>

      {/* 進階功能 */}
      <div className="section-label">進階功能</div>
      <div className="toggle-row">
        <div className="toggle-info">
          <span className="toggle-label">選取翻譯</span>
          <span className="toggle-desc">選取文字即時翻譯</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={selectionEnabled}
            onChange={() => toggleFeature('selection', selectionEnabled)}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="toggle-row">
        <div className="toggle-info">
          <span className="toggle-label">懸停翻譯</span>
          <span className="toggle-desc">按住 Alt 懸停段落</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={hoverEnabled}
            onChange={() => toggleFeature('hover', hoverEnabled)}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="toggle-row">
        <div className="toggle-info">
          <span className="toggle-label">輸入框翻譯</span>
          <span className="toggle-desc">連按三個空格翻譯</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={inputEnabled}
            onChange={() => toggleFeature('input', inputEnabled)}
          />
          <span className="slider" />
        </label>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <footer>
        <button className="footer-btn" onClick={checkHealth}>重新連線</button>
        <button className="footer-btn" onClick={async () => {
          await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
          setToast('快取已清除');
          setTimeout(() => setToast(null), 2000);
        }}>清除快取</button>
      </footer>
    </div>
  );
}
