export interface TranslateRequest {
  text: string;
  targetLang?: string;
  model?: string;
}

const DEFAULT_MODEL = 'qwen3:8b';
const OLLAMA_BASE_URL = 'http://localhost:11434';

const SYSTEM_PROMPT_ZH =
  '你是專業翻譯引擎。將以下內容直譯為繁體中文。保留技術術語原文（括號標注）。不解釋、不加備注、只輸出譯文。';

const SYSTEM_PROMPT_EN =
  'You are a professional translation engine. Translate the following content into natural English. Do not explain, do not add notes, output only the translation.';

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

export async function* translateStream(req: TranslateRequest): AsyncGenerator<string> {
  const model = req.model || DEFAULT_MODEL;
  const systemPrompt = req.targetLang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: req.text,
      stream: true,
      think: false,
      options: { temperature: 0.1, num_predict: 512 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.response) yield data.response;
        if (data.done) return;
      } catch { /* skip malformed */ }
    }
  }
}

export async function translate(req: TranslateRequest): Promise<string> {
  const model = req.model || DEFAULT_MODEL;
  const systemPrompt = req.targetLang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: req.text,
      stream: false,
      think: false, // 關閉 Qwen3 思考模式（Ollama 原生選項）
      options: { temperature: 0.1, num_predict: 512 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  // 移除殘留的 <think>...</think> 標籤（雙重保險）
  const raw = data.response?.trim() || '';
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s*\/no_think\b/gi, '')
    .trim();
}
