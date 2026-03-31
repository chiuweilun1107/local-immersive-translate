// YouTube Subtitle Translation — DOM observation approach
// Watches YouTube's caption renderer and appends translated text below

const OVERLAY_ID = 'imt-yt-overlay';
const STYLE_ID = 'imt-yt-style';

let active = false;
let observer: MutationObserver | null = null;
let getModel: () => string = () => 'qwen3:8b';
let lastOriginalText = '';
let translationCache = new Map<string, string>();

export function startYouTubeSubtitle(modelGetter: () => string): void {
  if (active) return;
  if (!location.hostname.includes('youtube.com')) return;
  active = true;
  getModel = modelGetter;

  injectStyles();
  waitForPlayer();

  // YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', onNavigate);
}

export function stopYouTubeSubtitle(): void {
  active = false;
  window.removeEventListener('yt-navigate-finish', onNavigate);
  observer?.disconnect();
  observer = null;
  removeOverlay();
  lastOriginalText = '';
}

function onNavigate(): void {
  if (!active) return;
  observer?.disconnect();
  observer = null;
  removeOverlay();
  lastOriginalText = '';
  setTimeout(() => waitForPlayer(), 1500);
}

// ── Wait for YouTube's caption container to appear ──

function waitForPlayer(): void {
  if (!active) return;

  const container = document.querySelector('.ytp-caption-window-container');
  if (container) {
    startObserving(container);
    return;
  }

  // Retry: container might not exist yet
  let retries = 0;
  const timer = setInterval(() => {
    if (!active || retries > 15) { clearInterval(timer); return; }
    retries++;
    const el = document.querySelector('.ytp-caption-window-container');
    if (el) {
      clearInterval(timer);
      startObserving(el);
    }
  }, 1000);
}

// ── Observe caption changes ──

function startObserving(container: Element): void {
  if (observer) return;

  createOverlay();
  console.log('[IMT YT] Observing captions');

  observer = new MutationObserver(() => {
    const segments = container.querySelectorAll('.ytp-caption-segment');
    if (segments.length === 0) {
      hideOverlay();
      return;
    }

    // Combine all caption segments into one line
    const text = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
    if (!text || text === lastOriginalText) return;
    lastOriginalText = text;

    translateCaption(text);
  });

  observer.observe(container, { childList: true, subtree: true, characterData: true });
}

// ── Translate and display ──

async function translateCaption(text: string): Promise<void> {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  // Check cache first
  const cached = translationCache.get(text);
  if (cached) {
    showTranslation(overlay, cached);
    return;
  }

  // Show loading state
  overlay.textContent = '...';
  overlay.style.display = 'block';
  overlay.style.opacity = '0.5';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text,
      lang: 'zh-TW',
      model: getModel(),
    });

    // Check if this is still the current caption
    if (text !== lastOriginalText) return;

    if (response?.translated) {
      translationCache.set(text, response.translated);
      showTranslation(overlay, response.translated);
    }
  } catch (err) {
    console.error('[IMT YT] translate error:', err);
  }
}

function showTranslation(overlay: HTMLElement, text: string): void {
  overlay.textContent = text;
  overlay.style.display = 'block';
  overlay.style.opacity = '1';
}

function hideOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  lastOriginalText = '';
}

// ── Overlay DOM ──

function createOverlay(): void {
  removeOverlay();
  const player = document.querySelector('#movie_player');
  if (!player) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.display = 'none';
  (player as HTMLElement).appendChild(overlay);
}

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: absolute;
      bottom: 12%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      text-align: center;
      pointer-events: none;
      max-width: 80%;
      color: #ffe066;
      font-size: 1.1em;
      line-height: 1.4;
      padding: 4px 12px;
      background: rgba(0, 0, 0, 0.75);
      border-radius: 4px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
      transition: opacity 0.15s;
    }
    :fullscreen #${OVERLAY_ID},
    :-webkit-full-screen #${OVERLAY_ID} {
      font-size: 1.4em;
      bottom: 10%;
    }
  `;
  document.head?.appendChild(style);
}
