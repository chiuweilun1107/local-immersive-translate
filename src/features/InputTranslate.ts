const DATA_ORIGINAL = 'data-imt-original';

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function getInputText(el: HTMLElement): string {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return el.textContent ?? '';
}

function setInputText(el: HTMLElement, text: string): void {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    (el as HTMLInputElement | HTMLTextAreaElement).value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function isInputTarget(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function hasTrailingDoubleSpace(el: HTMLElement): boolean {
  const text = getInputText(el);
  return text.length >= 2 && text.slice(-2) === '  ';
}

export function startInputTranslate(getModel: () => string): void {
  if (keydownHandler) return;

  keydownHandler = async (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    // composedPath()[0] 穿透 Shadow DOM 拿到真實 target
    const target = (e.composedPath?.()[0] ?? e.target) as EventTarget;
    if (!isInputTarget(target)) return;

    // Detect 3rd consecutive space: current input already ends with "  " and user hits space again
    if (!hasTrailingDoubleSpace(target as HTMLElement)) return;

    e.preventDefault();

    const el = target as HTMLElement;
    const rawText = getInputText(el).trimEnd(); // strip trailing spaces
    if (!rawText) return;

    // Save original text before overwriting
    el.setAttribute(DATA_ORIGINAL, rawText);
    setInputText(el, '翻譯中...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: rawText,
        lang: 'zh-TW',
        model: getModel(),
      });

      if (response?.translated) {
        setInputText(el, response.translated);
      } else if (response?.error) {
        // Restore original on error
        setInputText(el, el.getAttribute(DATA_ORIGINAL) ?? rawText);
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      setInputText(el, el.getAttribute(DATA_ORIGINAL) ?? rawText);
      console.error('[IMT Input] sendMessage failed:', err);
    }
  };

  document.addEventListener('keydown', keydownHandler, true);
}

export function stopInputTranslate(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
}
