import { checkOllamaHealth, translate, translateStream, listModels } from '../src/utils/OllamaClient';
import { getCache, setCache, clearAllCache } from '../src/utils/CacheManager';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep message channel open for async
  });

  // Streaming translation via long-lived port
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'imt-stream') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'TRANSLATE_STREAM') return;
      const { text: rawText, lang = 'zh-TW', model } = msg;
      const text = rawText.replace(/\s*\/\w+/g, '').trim();
      if (!text) { port.postMessage({ done: true, full: '' }); return; }

      // Check cache first
      const cached = await getCache(lang, text);
      if (cached) { port.postMessage({ done: true, full: cached, cached: true }); return; }

      try {
        let full = '';
        for await (const token of translateStream({ text, targetLang: lang, model })) {
          full += token;
          port.postMessage({ token, done: false });
        }
        // Clean up output
        full = full.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s*\/no_think\b/gi, '').trim();
        await setCache(lang, text, full);
        port.postMessage({ done: true, full });
      } catch (err) {
        port.postMessage({ done: true, error: (err as Error).message });
      }
    });
  });
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {
    case 'HEALTH_CHECK':
      return { ok: await checkOllamaHealth() };

    case 'LIST_MODELS':
      return { models: await listModels() };

    case 'TRANSLATE': {
      const { text: rawText, lang = 'zh-TW', model } = message as {
        text: string;
        lang?: string;
        model?: string;
      };
      // 清理 slash commands（如 /no_think）避免混入翻譯文字
      const text = rawText.replace(/\s*\/\w+/g, '').trim();
      if (!text) return { translated: '', cached: false };
      const cached = await getCache(lang, text);
      if (cached) return { translated: cached, cached: true };
      const translated = await translate({ text, targetLang: lang, model });
      await setCache(lang, text, translated);
      return { translated, cached: false };
    }

    case 'FETCH_CAPTIONS': {
      const { url } = message as { url: string };
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Caption fetch failed: ${res.status}`);
      const data = await res.json();
      return { ok: true, data };
    }

    case 'CLEAR_CACHE':
      await clearAllCache();
      return { ok: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
