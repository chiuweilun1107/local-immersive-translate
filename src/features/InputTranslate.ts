const BTN_ID = 'imt-translate-btn';

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let mousemoveHandler: ((e: MouseEvent) => void) | null = null;
let lastMouseX = 0;
let lastMouseY = 0;

function getInputText(el: HTMLElement): string {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return el.innerText ?? el.textContent ?? '';
}

function replaceInputText(el: HTMLElement, text: string): void {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const nativeSet = Object.getOwnPropertyDescriptor(
      el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    nativeSet?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable: use InputEvent to work with modern editors (Lexical, ProseMirror)
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Try execCommand first, fallback to direct manipulation
    const ok = document.execCommand('insertText', false, text);
    if (!ok) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }
}

function findEditableRoot(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA') return cur;
    if (cur.getAttribute('contenteditable') === 'true' || cur.getAttribute('contenteditable') === '') return cur;
    cur = cur.parentElement;
  }
  return el;
}

function isInputTarget(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();
}

function showButton(el: HTMLElement, getModel: () => string): void {
  removeButton();

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.textContent = '中 → 英';
  btn.type = 'button';
  btn.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    padding: 6px 14px;
    background: #ff6b9d;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    user-select: none;
    left: ${Math.min(lastMouseX + 12, window.innerWidth - 100)}px;
    top: ${Math.min(lastMouseY - 36, window.innerHeight - 40)}px;
  `;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[IMT Input] button clicked');

    // Visual feedback
    btn.textContent = '翻譯中...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    const rawText = getInputText(el).trimEnd();
    console.log('[IMT Input] rawText:', rawText, 'el:', el.tagName, el.getAttribute('contenteditable'));
    if (!rawText) { console.log('[IMT Input] empty text, abort'); removeButton(); return; }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: rawText,
        lang: 'en',
        model: getModel(),
      });

      if (response?.translated) {
        // Try direct replacement first (works for <input>/<textarea>)
        const isNative = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
        if (isNative) {
          removeButton();
          replaceInputText(el, response.translated);
        } else {
          // For contenteditable (Lexical/ProseMirror), copy to clipboard + show result
          await navigator.clipboard.writeText(response.translated);
          btn.textContent = '已複製 ✓';
          btn.style.background = '#34c759';
          btn.style.opacity = '1';

          // Show translated text below button
          const tip = document.createElement('div');
          tip.style.cssText = `
            position: fixed; z-index: 2147483647;
            left: ${btn.style.left}; top: ${parseInt(btn.style.top) + 36}px;
            max-width: 300px; padding: 8px 12px;
            background: #fff; color: #1a1a1a; font-size: 13px; line-height: 1.5;
            border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border: 1px solid #e0e0e0; word-break: break-word;
          `;
          tip.textContent = response.translated;
          document.body.appendChild(tip);

          setTimeout(() => { removeButton(); tip.remove(); }, 4000);
        }
      } else if (response?.error) {
        btn.textContent = '翻譯失敗';
        btn.style.background = '#ff3b30';
        setTimeout(() => removeButton(), 2000);
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      btn.textContent = '翻譯失敗';
      btn.style.background = '#ff3b30';
      setTimeout(() => removeButton(), 2000);
      console.error('[IMT Input] sendMessage failed:', err);
    }
  });

  document.body.appendChild(btn);
}

export function startInputTranslate(getModel: () => string): void {
  if (keydownHandler) return;

  mousemoveHandler = (e: MouseEvent) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  };
  document.addEventListener('mousemove', mousemoveHandler, { passive: true });

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key !== ' ') {
      removeButton();
      return;
    }

    const target = (e.composedPath?.()[0] ?? e.target) as EventTarget;
    if (!isInputTarget(target)) return;

    const el = findEditableRoot(target as HTMLElement);
    const text = getInputText(el);

    // Show button when: has Chinese content + ends with at least 1 space
    if (text.slice(-1) === ' ' && hasChinese(text)) {
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
  if (mousemoveHandler) {
    document.removeEventListener('mousemove', mousemoveHandler);
    mousemoveHandler = null;
  }
  removeButton();
}
