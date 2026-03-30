import { scanParagraphs, markTranslated } from '../src/DOMScanner';
import { injectTranslation, removeAllTranslations, injectLoadingPlaceholder } from '../src/Injector';

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 200;

let isEnabled = false;
let currentModel = 'qwen3:8b';
let observer: MutationObserver | null = null;
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingElements: Element[] = [];

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for messages from popup / background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SET_ENABLED') {
        isEnabled = msg.enabled;
        currentModel = msg.model || 'qwen3:8b';
        if (isEnabled) {
          startTranslation();
        } else {
          stopTranslation();
        }
      }
    });

    // Restore state from storage on page load
    chrome.storage.local.get(['imt_enabled', 'imt_model'], (result) => {
      isEnabled = result.imt_enabled ?? false;
      currentModel = result.imt_model ?? 'qwen3:8b';
      if (isEnabled) startTranslation();
    });
  },
});

function startTranslation(): void {
  const paragraphs = scanParagraphs();
  queueElements(paragraphs);
  startObserver();
}

function stopTranslation(): void {
  observer?.disconnect();
  observer = null;
  if (batchTimer) clearTimeout(batchTimer);
  pendingElements = [];
  removeAllTranslations();
  // Clear translated markers
  document.querySelectorAll('[data-imt-done]').forEach((el) => {
    el.removeAttribute('data-imt-done');
  });
}

function queueElements(elements: Element[]): void {
  pendingElements.push(...elements);
  scheduleBatch();
}

function scheduleBatch(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(processBatch, BATCH_DELAY_MS);
}

async function processBatch(): Promise<void> {
  batchTimer = null;
  if (!isEnabled || pendingElements.length === 0) return;

  const batch = pendingElements.splice(0, BATCH_SIZE);
  const placeholders = batch.map((el) => injectLoadingPlaceholder(el));

  const texts = batch.map((el) => el.textContent?.trim() || '');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_BATCH',
      texts,
      lang: 'zh-TW',
      model: currentModel,
    });

    if (response?.results) {
      batch.forEach((el, i) => {
        placeholders[i].remove();
        injectTranslation(el, response.results[i]);
        markTranslated(el);
      });
    }
  } catch (err) {
    placeholders.forEach((p) => p.remove());
    console.error('[IMT] Translation failed:', err);
  }

  if (pendingElements.length > 0) scheduleBatch();
}

function startObserver(): void {
  if (observer) return;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!isEnabled) return;
      const newElements = scanParagraphs();
      if (newElements.length > 0) queueElements(newElements);
    }, 50);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
