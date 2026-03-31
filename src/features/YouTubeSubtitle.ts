// YouTube Subtitle Translation — inject into YouTube's own caption container

const TRANS_CLASS = 'imt-yt-trans';
const STYLE_ID = 'imt-yt-style';

let active = false;
let observer: MutationObserver | null = null;
let navObserver: MutationObserver | null = null;
let getModel: () => string = () => 'qwen3:8b';
let lastText = '';
let cache = new Map<string, string>();
let pendingText = '';
let isUpdating = false;

export function startYouTubeSubtitle(modelGetter: () => string): void {
  if (active) return;
  if (!location.hostname.includes('youtube.com')) return;
  active = true;
  getModel = modelGetter;

  injectStyles();
  tryObserve();

  // YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', onNavigate);

  // Fallback: URL change detection
  let lastUrl = location.href;
  navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onNavigate();
    }
  });
  navObserver.observe(document, { childList: true, subtree: true });
}

export function stopYouTubeSubtitle(): void {
  active = false;
  window.removeEventListener('yt-navigate-finish', onNavigate);
  observer?.disconnect();
  observer = null;
  navObserver?.disconnect();
  navObserver = null;
  removeTranslations();
  lastText = '';
}

function onNavigate(): void {
  if (!active) return;
  observer?.disconnect();
  observer = null;
  removeTranslations();
  lastText = '';
  setTimeout(() => tryObserve(), 1500);
}

function tryObserve(): void {
  if (!active || observer) return;

  // Find caption container
  const container = document.querySelector('.ytp-caption-window-container');
  if (container) {
    startObserving(container);
    return;
  }

  // Retry up to 15 seconds
  let retries = 0;
  const timer = setInterval(() => {
    if (!active || retries > 15 || observer) { clearInterval(timer); return; }
    retries++;
    const el = document.querySelector('.ytp-caption-window-container');
    if (el) { clearInterval(timer); startObserving(el); }
  }, 1000);
}

function startObserving(container: Element): void {
  if (observer) return;
  console.log('[IMT YT] Observing captions');

  observer = new MutationObserver(() => {
    if (isUpdating) return; // skip our own DOM changes
    handleCaptionChange(container);
  });

  observer.observe(container, { childList: true, subtree: true, characterData: true });
}

function handleCaptionChange(container: Element): void {
  // Get only YouTube's original segments (exclude our translations)
  const segments = container.querySelectorAll(`.ytp-caption-segment:not(.${TRANS_CLASS}-text)`);
  if (segments.length === 0) {
    removeTranslations();
    lastText = '';
    return;
  }

  const text = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
  if (!text || text === lastText) return;
  lastText = text;

  // Remove old translation (guard against re-entrant mutations)
  isUpdating = true;
  removeTranslations();

  // Find the caption window to append to
  const captionWindow = container.querySelector('.caption-window');
  if (!captionWindow) { isUpdating = false; return; }

  // Create translation line
  const transLine = document.createElement('span');
  transLine.className = `caption-visual-line ${TRANS_CLASS}`;
  transLine.style.cssText = 'display: block;';

  const transSegment = document.createElement('span');
  transSegment.className = `${TRANS_CLASS}-text`;
  transSegment.style.cssText = 'color: #ffe066 !important; font-size: 0.9em; background: rgba(8,8,8,0.75); padding: 1px 4px;';

  // Check cache
  const cached = cache.get(text);
  if (cached) {
    transSegment.textContent = cached;
  } else {
    transSegment.textContent = '...';
    translateText(text, transSegment);
  }

  transLine.appendChild(transSegment);
  captionWindow.appendChild(transLine);
  isUpdating = false;
}

async function translateText(text: string, el: HTMLElement): Promise<void> {
  pendingText = text;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text,
      lang: 'zh-TW',
      model: getModel(),
    });

    // Only update if this is still the current caption
    if (text !== pendingText) return;

    if (response?.translated) {
      cache.set(text, response.translated);
      el.textContent = response.translated;
    }
  } catch (err) {
    console.error('[IMT YT] translate error:', err);
    el.textContent = '';
  }
}

function removeTranslations(): void {
  document.querySelectorAll(`.${TRANS_CLASS}`).forEach(el => el.remove());
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${TRANS_CLASS} {
      display: block !important;
      margin-top: 2px;
    }
    .${TRANS_CLASS} .ytp-caption-segment {
      color: #ffe066 !important;
    }
  `;
  document.head?.appendChild(style);
}
