// YouTube Subtitle Translation — inject into YouTube's caption DOM

const TRANS_CLASS = 'imt-yt-trans';
const STYLE_ID = 'imt-yt-style';

let active = false;
let observer: MutationObserver | null = null;
let observeTarget: Element | null = null;
let getModel: () => string = () => 'qwen3:8b';
let lastText = '';
let cache = new Map<string, string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startYouTubeSubtitle(modelGetter: () => string): void {
  if (active) return;
  if (!location.hostname.includes('youtube.com')) return;
  active = true;
  getModel = modelGetter;
  injectStyles();
  tryObserve();
  window.addEventListener('yt-navigate-finish', onNavigate);
}

export function stopYouTubeSubtitle(): void {
  active = false;
  window.removeEventListener('yt-navigate-finish', onNavigate);
  observer?.disconnect();
  observer = null;
  observeTarget = null;
  removeTranslations();
  lastText = '';
}

function onNavigate(): void {
  if (!active) return;
  observer?.disconnect();
  observer = null;
  observeTarget = null;
  removeTranslations();
  lastText = '';
  setTimeout(() => tryObserve(), 1500);
}

function tryObserve(): void {
  if (!active || observer) return;
  const container = document.querySelector('.ytp-caption-window-container');
  if (container) { setupObserver(container); return; }

  let retries = 0;
  const timer = setInterval(() => {
    if (!active || retries > 15 || observer) { clearInterval(timer); return; }
    retries++;
    const el = document.querySelector('.ytp-caption-window-container');
    if (el) { clearInterval(timer); setupObserver(el); }
  }, 1000);
}

function setupObserver(container: Element): void {
  if (observer) return;
  observeTarget = container;
  console.log('[IMT YT] Observing captions');

  observer = new MutationObserver(() => {
    // Debounce to avoid rapid-fire during caption transitions
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onCaptionChange(), 100);
  });

  startObserving();
}

function startObserving(): void {
  if (!observer || !observeTarget) return;
  observer.observe(observeTarget, { childList: true, subtree: true, characterData: true });
}

function pauseObserving(): void {
  observer?.disconnect();
}

function onCaptionChange(): void {
  if (!observeTarget) return;

  // Read original segments (exclude our translations)
  const segments = observeTarget.querySelectorAll(`.ytp-caption-segment:not(.${TRANS_CLASS})`);
  if (segments.length === 0) {
    pauseObserving();
    removeTranslations();
    lastText = '';
    startObserving();
    return;
  }

  const text = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
  if (!text || text === lastText) return;
  lastText = text;

  // Pause observer → modify DOM → resume observer
  pauseObserving();
  removeTranslations();

  const captionWindow = observeTarget.querySelector('.caption-window');
  if (!captionWindow) { startObserving(); return; }

  const transLine = document.createElement('span');
  transLine.className = TRANS_CLASS;
  transLine.style.cssText = 'display: block; margin-top: 2px;';

  const transText = document.createElement('span');
  transText.className = TRANS_CLASS; // also marked so excluded from query
  transText.style.cssText = 'color: #ffe066; font-size: 0.9em; background: rgba(8,8,8,0.75); padding: 1px 6px; border-radius: 2px;';

  const cached = cache.get(text);
  if (cached) {
    transText.textContent = cached;
  } else {
    transText.textContent = '⋯';
    translateAndUpdate(text, transText);
  }

  transLine.appendChild(transText);
  captionWindow.appendChild(transLine);

  // Resume observing after DOM modification
  startObserving();
}

async function translateAndUpdate(text: string, el: HTMLElement): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text,
      lang: 'zh-TW',
      model: getModel(),
    });
    if (response?.translated) {
      cache.set(text, response.translated);
      // Only update if element is still in DOM
      if (el.isConnected) {
        el.textContent = response.translated;
      }
    }
  } catch (err) {
    console.error('[IMT YT] translate error:', err);
  }
}

function removeTranslations(): void {
  document.querySelectorAll(`.${TRANS_CLASS}`).forEach(el => el.remove());
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.${TRANS_CLASS} { pointer-events: none; }`;
  document.head?.appendChild(style);
}
