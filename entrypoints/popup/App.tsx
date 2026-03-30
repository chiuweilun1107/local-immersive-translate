import { useEffect, useState } from 'react';
import './App.css';

const MODELS = ['qwen3:8b', 'qwen2.5:7b', 'qwen2.5:3b', 'gemma3:4b'];

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState('qwen3:8b');
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    chrome.storage.local.get(['imt_enabled', 'imt_model'], (result) => {
      setEnabled(result.imt_enabled ?? false);
      setModel(result.imt_model ?? 'qwen3:8b');
    });
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

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    await chrome.storage.local.set({ imt_enabled: next, imt_model: model });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled: next, model });
    }
  }

  async function changeModel(m: string) {
    setModel(m);
    await chrome.storage.local.set({ imt_model: m });
  }

  const displayModels = availableModels.length > 0 ? availableModels : MODELS;

  return (
    <div className="popup">
      <header>
        <span className="logo">沈浸式翻譯</span>
        <span className={`status-dot ${ollamaOk === true ? 'ok' : ollamaOk === false ? 'err' : 'checking'}`} />
      </header>

      {ollamaOk === false && (
        <div className="warning">
          ⚠️ Ollama 未啟動<br />
          <code>ollama serve</code>
        </div>
      )}

      <div className="toggle-row">
        <label>雙語翻譯</label>
        <button
          className={`toggle ${enabled ? 'on' : 'off'}`}
          onClick={toggleEnabled}
          disabled={ollamaOk !== true}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="model-row">
        <label>模型</label>
        <select value={model} onChange={(e) => changeModel(e.target.value)}>
          {displayModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="lang-row">
        <label>目標語言</label>
        <span>繁體中文</span>
      </div>

      <footer>
        <button className="refresh" onClick={checkHealth}>重新連線</button>
      </footer>
    </div>
  );
}
