let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function getInputText(el: HTMLElement): string {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return el.innerText ?? el.textContent ?? '';
}

function replaceInputText(el: HTMLElement, text: string): void {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    nativeSet?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable: select all → delete → insertText
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

export function startInputTranslate(getModel: () => string): void {
  if (keydownHandler) return;

  keydownHandler = async (e: KeyboardEvent) => {
    // ⌥+Enter (Option+Enter) triggers translation
    if (!(e.altKey && e.key === 'Enter')) return;

    const target = (e.composedPath?.()[0] ?? e.target) as EventTarget;
    if (!isInputTarget(target)) return;

    const el = findEditableRoot(target as HTMLElement);
    const rawText = getInputText(el).trim();

    if (!rawText || !hasChinese(rawText)) return;

    e.preventDefault();
    e.stopPropagation();

    // Show loading state
    const originalText = rawText;
    const isNative = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    if (isNative) {
      (el as HTMLInputElement | HTMLTextAreaElement).value = '翻譯中...';
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: originalText,
        lang: 'en',
        model: getModel(),
      });

      if (response?.translated) {
        el.focus();
        replaceInputText(el, response.translated);
      } else if (response?.error) {
        // Restore original on error
        if (isNative) {
          (el as HTMLInputElement | HTMLTextAreaElement).value = originalText;
        }
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      if (isNative) {
        (el as HTMLInputElement | HTMLTextAreaElement).value = originalText;
      }
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
