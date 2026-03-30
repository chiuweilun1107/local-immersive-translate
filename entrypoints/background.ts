import { checkOllamaHealth, translate, listModels } from '../src/utils/OllamaClient';
import { getCache, setCache, clearAllCache } from '../src/utils/CacheManager';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep message channel open for async
  });
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {
    case 'HEALTH_CHECK':
      return { ok: await checkOllamaHealth() };

    case 'LIST_MODELS':
      return { models: await listModels() };

    case 'TRANSLATE': {
      const { text, lang = 'zh-TW', model } = message as {
        text: string;
        lang?: string;
        model?: string;
      };
      const cached = await getCache(lang, text);
      if (cached) return { translated: cached, cached: true };
      const translated = await translate({ text, model });
      await setCache(lang, text, translated);
      return { translated, cached: false };
    }

    case 'CLEAR_CACHE':
      await clearAllCache();
      return { ok: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
