import { scanParagraphs, markTranslated, isTranslated } from '../src/DOMScanner';
import { injectTranslation, removeAllTranslations, injectLoadingPlaceholder, injectStreamSpan } from '../src/Injector';
import { startSelectionTranslate, stopSelectionTranslate } from '../src/features/SelectionTranslate';
import { startHoverTranslate, stopHoverTranslate } from '../src/features/HoverTranslate';
import { startInputTranslate, stopInputTranslate } from '../src/features/InputTranslate';

const MAX_CONCURRENT = 2; // 同時最多 2 個 Ollama 請求

let isEnabled = false;
let currentModel = 'qwen3:8b';
let currentMode: 'bilingual' | 'translation_only' = 'bilingual';
let observer: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let deepScanTimer: ReturnType<typeof setInterval> | null = null;

// Phase 2 feature flags
let selectionEnabled = true;
let hoverEnabled = true;
let inputEnabled = true;
let streamEnabled = true;

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

      if (msg.type === 'SET_FEATURE') {
        const { feature, enabled } = msg as { feature: string; enabled: boolean };
        if (feature === 'selection') {
          selectionEnabled = enabled;
          if (enabled) startSelectionTranslate(() => currentModel);
          else stopSelectionTranslate();
        } else if (feature === 'hover') {
          hoverEnabled = enabled;
          if (enabled) startHoverTranslate(() => currentModel);
          else stopHoverTranslate();
        } else if (feature === 'input') {
          inputEnabled = enabled;
          if (enabled) startInputTranslate(() => currentModel);
          else stopInputTranslate();
        } else if (feature === 'stream') {
          streamEnabled = enabled;
        }
      }
    });

    // Option+A (Mac) / Alt+A 快捷鍵：切換全頁翻譯
    // 用 e.code 而非 e.key，避免 Mac 上 ⌥+A 產生特殊字元 'å'
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyA') {
        isEnabled = !isEnabled;
        chrome.storage.local.set({ imt_enabled: isEnabled, imt_model: currentModel, imt_mode: currentMode });
        if (isEnabled) {
          startTranslation();
        } else {
          stopTranslation();
        }
      }
    });

    chrome.storage.local.get(
      ['imt_enabled', 'imt_model', 'imt_mode', 'imt_selection', 'imt_hover', 'imt_input', 'imt_stream'],
      (result) => {
        isEnabled = result.imt_enabled ?? false;
        currentModel = result.imt_model ?? 'qwen3:8b';
        currentMode = result.imt_mode ?? 'bilingual';
        selectionEnabled = result.imt_selection ?? true;
        hoverEnabled = result.imt_hover ?? true;
        inputEnabled = result.imt_input ?? true;
        streamEnabled = result.imt_stream ?? true;

        if (isEnabled) startTranslation();
        initPhase2Features();
      }
    );
  },
});

function initPhase2Features(): void {
  if (selectionEnabled) startSelectionTranslate(() => currentModel);
  if (hoverEnabled) startHoverTranslate(() => currentModel);
  if (inputEnabled) startInputTranslate(() => currentModel);
}

function startTranslation(): void {
  setupIntersectionObserver();
  const paragraphs = scanParagraphs();
  paragraphs.forEach((el) => observeElement(el));
  startMutationObserver();
  startDeepScan(); // 補抓 Shadow DOM 延遲渲染的內容
}

// 啟動後 30 秒內每 2 秒深掃，補抓 Shadow DOM 裡延遲出現的元素
function startDeepScan(): void {
  if (deepScanTimer) return;
  let count = 0;
  deepScanTimer = setInterval(() => {
    if (!isEnabled || count >= 15) {
      clearInterval(deepScanTimer!);
      deepScanTimer = null;
      return;
    }
    count++;
    scanParagraphs().forEach((el) => observeElement(el));
  }, 2000);
}

function stopTranslation(): void {
  observer?.disconnect();
  observer = null;
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  if (deepScanTimer) { clearInterval(deepScanTimer); deepScanTimer = null; }
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

  markTranslated(el); // 先標記，防止重複加入 queue

  if (streamEnabled && currentMode === 'bilingual') {
    processElementStream(el, text);
  } else {
    processElementNormal(el, text);
  }
}

function processElementStream(el: Element, text: string): void {
  const span = injectStreamSpan(el);
  const port = chrome.runtime.connect({ name: 'imt-stream' });

  port.onMessage.addListener((msg) => {
    if (msg.token) {
      // Clean thinking tags on the fly
      span.textContent = (span.textContent + msg.token)
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/\s*\/no_think\b/gi, '');
    }
    if (msg.done) {
      port.disconnect();
      if (msg.error) {
        span.textContent = `[IMT Error] ${msg.error}`;
      } else if (msg.full) {
        // Final clean replacement
        span.textContent = msg.full;
      }
      activeCount--;
      drainQueue();
    }
  });

  port.postMessage({
    type: 'TRANSLATE_STREAM',
    text,
    lang: 'zh-TW',
    model: currentModel,
  });
}

async function processElementNormal(el: Element, text: string): Promise<void> {
  const placeholder = injectLoadingPlaceholder(el);

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
