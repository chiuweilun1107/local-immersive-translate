export interface TranslateRequest {
  text: string;
  targetLang?: string;
  model?: string;
}

export interface TranslateResponse {
  translated: string;
  model: string;
  cached?: boolean;
}

const DEFAULT_MODEL = 'qwen3:8b';
const OLLAMA_BASE_URL = 'http://localhost:11434';

const SYSTEM_PROMPT =
  '你是專業翻譯引擎。將以下內容直譯為繁體中文。保留技術術語原文（括號標注）。不解釋、不加備注、只輸出譯文。';

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

export async function translate(req: TranslateRequest): Promise<string> {
  const model = req.model || DEFAULT_MODEL;
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      prompt: req.text,
      stream: false,
      options: { temperature: 0.1, num_predict: 512 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.response?.trim() || '';
}

export async function translateBatch(texts: string[], model?: string): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    const result = await translate({ text: texts[0], model });
    return [result];
  }

  const joined = texts.join('|||');
  const result = await translate({
    text: `翻譯以下段落（用|||分隔，保持相同分隔符輸出）：\n${joined}`,
    model,
  });

  const parts = result.split('|||');
  // 若分割數量不符，fallback 逐一翻譯
  if (parts.length !== texts.length) {
    return Promise.all(texts.map((t) => translate({ text: t, model })));
  }
  return parts.map((p) => p.trim());
}
