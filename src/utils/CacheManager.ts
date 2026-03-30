const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_PREFIX = 'imt_';

interface CacheEntry {
  value: string;
  ts: number;
}

function cacheKey(lang: string, text: string): string {
  return `${CACHE_PREFIX}${lang}_${text.slice(0, 80).trim()}`;
}

export async function getCache(lang: string, text: string): Promise<string | null> {
  const key = cacheKey(lang, text);
  const result = await chrome.storage.local.get(key);
  const entry: CacheEntry | undefined = result[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    chrome.storage.local.remove(key);
    return null;
  }
  return entry.value;
}

export async function setCache(lang: string, text: string, value: string): Promise<void> {
  const key = cacheKey(lang, text);
  const entry: CacheEntry = { value, ts: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

export async function clearAllCache(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
}
