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

  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.innerHTML = '<span style="pointer-events:none;">中 → 英</span>';
  btn.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    padding: 6px 14px;
    background: #ff6b9d;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 600;
    border-radius: 14px;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    user-select: none;
    pointer-events: auto;
    left: ${Math.min(lastMouseX + 12, window.innerWidth - 100)}px;
    top: ${Math.min(lastMouseY - 36, window.innerHeight - 40)}px;
  `;

  // Use onclick (simplest, most reliable)
  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback: keep button visible, show loading
    btn.innerHTML = '<span style="pointer-events:none;">翻譯中...</span>';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    const rawText = getInputText(el).trimEnd();
    if (!rawText) { removeButton(); return; }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: rawText,
        lang: 'en',
        model: getModel(),
      });

      removeButton();

      if (response?.translated) {
        el.focus();
        // Small delay to ensure focus is established
        await new Promise(r => setTimeout(r, 50));
        replaceInputText(el, response.translated);
      } else if (response?.error) {
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      removeButton();
      console.error('[IMT Input] sendMessage failed:', err);
    }
  };

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
