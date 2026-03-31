const DATA_ORIGINAL = 'data-imt-original';
const BTN_ID = 'imt-translate-btn';

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let currentTarget: HTMLElement | null = null;

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

function hasTrailingSpace(el: HTMLElement): boolean {
  const text = getInputText(el);
  return text.length >= 1 && text.slice(-1) === ' ';
}

function showButton(el: HTMLElement, getModel: () => string): void {
  removeButton();
  currentTarget = el;

  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.textContent = '中 → 英';
  btn.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    padding: 4px 10px;
    background: #ff6b9d;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    font-weight: 600;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    user-select: none;
    transition: opacity 0.15s;
  `;

  // Position at bottom-right of input element
  const rect = el.getBoundingClientRect();
  btn.style.left = `${Math.min(rect.right - 80, window.innerWidth - 90)}px`;
  btn.style.top = `${rect.bottom + 6}px`;

  btn.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeButton();

    const rawText = getInputText(el).trimEnd(); // strip trailing spaces
    if (!rawText) return;

    el.setAttribute(DATA_ORIGINAL, rawText);
    setInputText(el, '翻譯中...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: rawText,
        lang: 'en', // 中文 → 英文
        model: getModel(),
      });

      if (response?.translated) {
        setInputText(el, response.translated);
      } else if (response?.error) {
        setInputText(el, el.getAttribute(DATA_ORIGINAL) ?? rawText);
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      setInputText(el, el.getAttribute(DATA_ORIGINAL) ?? rawText);
      console.error('[IMT Input] sendMessage failed:', err);
    }
  });

  document.documentElement.appendChild(btn);

  // Auto-hide on blur or next non-space keydown
  const hide = () => { removeButton(); el.removeEventListener('blur', hide); };
  el.addEventListener('blur', hide);
}

function removeButton(): void {
  const btn = document.getElementById(BTN_ID);
  if (btn) btn.remove();
  currentTarget = null;
}

export function startInputTranslate(getModel: () => string): void {
  if (keydownHandler) return;

  keydownHandler = (e: KeyboardEvent) => {
    // Hide button on any non-space key
    if (e.key !== ' ') {
      removeButton();
      return;
    }

    // composedPath()[0] 穿透 Shadow DOM 拿到真實 target
    const target = (e.composedPath?.()[0] ?? e.target) as EventTarget;
    if (!isInputTarget(target)) return;

    const el = target as HTMLElement;

    // Show button when user types 2nd space (input already ends with one space)
    if (hasTrailingSpace(el)) {
      showButton(el, getModel);
    }
  };

  document.addEventListener('keydown', keydownHandler, true);
}

export function stopInputTranslate(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  removeButton();
}
