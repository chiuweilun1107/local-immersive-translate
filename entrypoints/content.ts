import { scanParagraphs, markTranslated, isTranslated } from '../src/DOMScanner';
import { injectTranslation, removeAllTranslations, injectLoadingPlaceholder } from '../src/Injector';

const MAX_CONCURRENT = 2; // 同時最多 2 個 Ollama 請求

let isEnabled = false;
let currentModel = 'qwen3:8b';
let currentMode: 'bilingual' | 'translation_only' = 'bilingual';
let observer: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;

// 並發控制
let activeCount = 0;
const queue: Element[] = [];

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SET_ENABLED') {
        isEnabled = msg.enabled;
        currentModel = msg.model || 'qwen3:8b';
        currentMode = msg.mode || 'bilingual';
        if (isEnabled) {
          startTranslation();
        } else {
          stopTranslation();
        }
      }
    });

    chrome.storage.local.get(['imt_enabled', 'imt_model', 'imt_mode'], (result) => {
      isEnabled = result.imt_enabled ?? false;
      currentModel = result.imt_model ?? 'qwen3:8b';
      currentMode = result.imt_mode ?? 'bilingual';
      if (isEnabled) startTranslation();
    });
  },
});

function startTranslation(): void {
  setupIntersectionObserver();
  // 掃描已在 viewport 的段落
  const paragraphs = scanParagraphs();
  paragraphs.forEach((el) => observeElement(el));
  startMutationObserver();
}

function stopTranslation(): void {
  observer?.disconnect();
  observer = null;
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  queue.length = 0;
  activeCount = 0;
  removeAllTranslations();
  document.querySelectorAll('[data-imt-done]').forEach((el) => {
    el.removeAttribute('data-imt-done');
  });
}

function setupIntersectionObserver(): void {
  if (intersectionObserver) return;
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as Element;
          intersectionObserver?.unobserve(el);
          enqueueElement(el);
        }
      });
    },
    { rootMargin: '100px', threshold: 0.1 }
  );
}

function observeElement(el: Element): void {
  if (isTranslated(el)) return;
  intersectionObserver?.observe(el);
}

function enqueueElement(el: Element): void {
  if (isTranslated(el)) return;
  queue.push(el);
  drainQueue();
}

function drainQueue(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const el = queue.shift()!;
    if (isTranslated(el)) continue; // 跳過已處理的
    processElement(el);
  }
}

async function processElement(el: Element): Promise<void> {
  if (isTranslated(el)) return;
  activeCount++;

  const text = el.textContent?.trim() || '';
  if (!text) {
    activeCount--;
    drainQueue();
    return;
  }

  const placeholder = injectLoadingPlaceholder(el);
  markTranslated(el); // 先標記，防止重複加入 queue

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text,
      lang: 'zh-TW',
      model: currentModel,
    });

    placeholder.remove();

    if (response?.translated) {
      injectTranslation(el, response.translated, currentMode);
    } else if (response?.error) {
      console.error('[IMT] Ollama error:', response.error);
      placeholder.textContent = `[IMT Error] ${response.error}`;
    }
  } catch (err) {
    console.error('[IMT] sendMessage failed:', err);
    placeholder.textContent = `[IMT] ${String(err)}`;
    // 不移除 data-imt-done，避免無限重試跳動
  } finally {
    activeCount--;
    drainQueue();
  }
}

function startMutationObserver(): void {
  if (observer) return;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!isEnabled) return;
      const newElements = scanParagraphs();
      newElements.forEach((el) => observeElement(el));
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
