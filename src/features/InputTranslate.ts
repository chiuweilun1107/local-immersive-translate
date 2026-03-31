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
    // contenteditable: select all → delete → insertText (works with Lexical/ProseMirror)
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('delete', false);
    document.execCommand('insertText', false, text);
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
        removeButton();
        el.focus();
        await new Promise(r => setTimeout(r, 50));
        replaceInputText(el, response.translated);
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
