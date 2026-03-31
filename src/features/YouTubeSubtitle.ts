// YouTube Subtitle Translation Feature
// Detects captions, translates them, and displays bilingual subtitles

const OVERLAY_ID = 'imt-yt-subtitle';
const STYLE_ID = 'imt-yt-subtitle-style';

interface CaptionEvent {
  tStartMs: number;
  dDurationMs: number;
  text: string;
  translated?: string;
}

let active = false;
let captionEvents: CaptionEvent[] = [];
let translatedMap = new Map<number, string>(); // startMs → translated text
let currentVideoId = '';
let observer: MutationObserver | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let getModel: () => string = () => 'qwen3:8b';

// ── Public API ──

export function startYouTubeSubtitle(modelGetter: () => string): void {
  if (active) return;
  active = true;
  getModel = modelGetter;

  injectStyles();
  detectVideo();

  // YouTube SPA: detect navigation between videos
  window.addEventListener('yt-navigate-finish', onNavigate);
}

export function stopYouTubeSubtitle(): void {
  active = false;
  window.removeEventListener('yt-navigate-finish', onNavigate);
  observer?.disconnect();
  observer = null;
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  removeOverlay();
  captionEvents = [];
  translatedMap.clear();
  currentVideoId = '';
}

// ── Navigation Detection ──

function onNavigate(): void {
  if (!active) return;
  // Reset state for new video
  captionEvents = [];
  translatedMap.clear();
  removeOverlay();
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  setTimeout(() => detectVideo(), 1000); // wait for new player to load
}

// ── Video & Caption Detection ──

function detectVideo(): void {
  if (!active) return;
  if (!location.hostname.includes('youtube.com')) return;

  const videoId = new URLSearchParams(location.search).get('v');
  if (!videoId || videoId === currentVideoId) return;
  currentVideoId = videoId;

  // Extract caption tracks from the page
  extractCaptionTracks();
}

function extractCaptionTracks(): void {
  if (!active) return;

  // Find timedtext baseUrl directly from page scripts
  let captionUrl = '';
  const scripts = document.querySelectorAll('script');

  for (const script of scripts) {
    const text = script.textContent || '';
    if (!text.includes('timedtext')) continue;

    // Extract first baseUrl for timedtext endpoint
    const match = text.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
    if (match) {
      captionUrl = match[1].replace(/\\u0026/g, '&');
      break;
    }
  }

  if (!captionUrl) {
    // Retry after a delay (page might not be fully loaded)
    if (active) setTimeout(() => extractCaptionTracks(), 2000);
    return;
  }

  console.log('[IMT YT] Found caption URL');
  fetchAndTranslateCaptions(captionUrl);
}

// ── Fetch & Translate ──

async function fetchAndTranslateCaptions(baseUrl: string): Promise<void> {
  if (!active) return;

  // Fetch JSON3 format via background script (avoids CORS)
  const url = baseUrl + (baseUrl.includes('fmt=') ? '' : '&fmt=json3');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_CAPTIONS',
      url,
    });

    if (!response?.ok || !response.data?.events) {
      console.error('[IMT YT] Failed to fetch captions');
      return;
    }

    // Parse events into our format
    captionEvents = response.data.events
      .filter((e: { segs?: unknown[] }) => e.segs)
      .map((e: { tStartMs: number; dDurationMs: number; segs: { utf8: string }[] }) => ({
        tStartMs: e.tStartMs,
        dDurationMs: e.dDurationMs || 3000,
        text: e.segs.map((s) => s.utf8).join('').trim(),
      }))
      .filter((e: CaptionEvent) => e.text.length > 0);

    console.log(`[IMT YT] Loaded ${captionEvents.length} caption segments`);

    // Start translating with look-ahead
    createOverlay();
    startSync();
    translateAhead(0);
  } catch (err) {
    console.error('[IMT YT] Caption fetch error:', err);
  }
}

// ── Translation with Look-ahead ──

let translateIndex = 0;
let translating = false;

async function translateAhead(fromIndex: number): Promise<void> {
  if (!active || translating) return;
  translating = true;
  translateIndex = fromIndex;

  const BATCH_SIZE = 5;
  const LOOK_AHEAD = 15;

  while (translateIndex < Math.min(fromIndex + LOOK_AHEAD, captionEvents.length)) {
    if (!active) break;

    // Batch: collect next N untranslated segments
    const batch: CaptionEvent[] = [];
    const startIdx = translateIndex;

    for (let i = 0; i < BATCH_SIZE && translateIndex < captionEvents.length; i++, translateIndex++) {
      const ev = captionEvents[translateIndex];
      if (!translatedMap.has(ev.tStartMs) && ev.text.length > 1) {
        batch.push(ev);
      }
    }

    if (batch.length === 0) continue;

    // Translate batch: combine short segments for better context
    const combined = batch.map((e) => e.text).join('\n');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: combined,
        lang: 'zh-TW',
        model: getModel(),
      });

      if (response?.translated) {
        const lines = response.translated.split('\n');
        batch.forEach((ev, i) => {
          translatedMap.set(ev.tStartMs, lines[i] || lines[lines.length - 1] || '');
        });
      }
    } catch (err) {
      console.error('[IMT YT] Translation error:', err);
    }
  }

  translating = false;
}

// ── Playback Sync ──

function startSync(): void {
  if (syncTimer) return;

  syncTimer = setInterval(() => {
    if (!active) { clearInterval(syncTimer!); syncTimer = null; return; }
    updateSubtitle();
  }, 200); // check every 200ms
}

function updateSubtitle(): void {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (!video) return;

  const currentMs = video.currentTime * 1000;

  // Find current caption event
  const current = captionEvents.find(
    (e) => currentMs >= e.tStartMs && currentMs < e.tStartMs + e.dDurationMs
  );

  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  if (!current) {
    overlay.style.display = 'none';
    return;
  }

  const translated = translatedMap.get(current.tStartMs);
  if (translated) {
    overlay.innerHTML = `<div class="imt-yt-original">${escapeHtml(current.text)}</div><div class="imt-yt-translated">${escapeHtml(translated)}</div>`;
    overlay.style.display = 'block';
  } else {
    // Not yet translated, show original only
    overlay.innerHTML = `<div class="imt-yt-original">${escapeHtml(current.text)}</div><div class="imt-yt-translated" style="opacity:0.4">翻譯中...</div>`;
    overlay.style.display = 'block';
  }

  // Trigger look-ahead translation from current position
  const currentIdx = captionEvents.indexOf(current);
  if (currentIdx >= 0 && currentIdx + 5 >= translateIndex) {
    translateAhead(currentIdx);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      text-align: center;
      pointer-events: none;
      max-width: 80%;
      transition: opacity 0.15s;
    }
    .imt-yt-original {
      color: #fff;
      font-size: 1.15em;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9);
      padding: 2px 8px;
      line-height: 1.4;
    }
    .imt-yt-translated {
      color: #ffe066;
      font-size: 1.05em;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9);
      padding: 2px 8px;
      line-height: 1.4;
      margin-top: 2px;
    }
    /* Fullscreen adjustments */
    :fullscreen #${OVERLAY_ID},
    :-webkit-full-screen #${OVERLAY_ID} {
      bottom: 80px;
      font-size: 1.2em;
    }
  `;
  document.head?.appendChild(style);
}
