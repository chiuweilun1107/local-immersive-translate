import { checkOllamaHealth, translate, translateBatch, listModels } from '../src/utils/OllamaClient';
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

    case 'TRANSLATE_BATCH': {
      const { texts, lang = 'zh-TW', model } = message as {
        texts: string[];
        lang?: string;
        model?: string;
      };
      // Check cache for each
      const results: string[] = [];
      const uncachedIndexes: number[] = [];
      const uncachedTexts: string[] = [];

      for (let i = 0; i < texts.length; i++) {
        const cached = await getCache(lang, texts[i]);
        if (cached) {
          results[i] = cached;
        } else {
          uncachedIndexes.push(i);
          uncachedTexts.push(texts[i]);
        }
      }

      if (uncachedTexts.length > 0) {
        const translated = await translateBatch(uncachedTexts, model);
        for (let j = 0; j < uncachedIndexes.length; j++) {
          const idx = uncachedIndexes[j];
          results[idx] = translated[j];
          await setCache(lang, texts[idx], translated[j]);
        }
      }

      return { results };
    }

    case 'CLEAR_CACHE':
      await clearAllCache();
      return { ok: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
