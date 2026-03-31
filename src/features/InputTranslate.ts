const PANEL_ID = 'imt-input-panel';

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

function removePanel(): void {
  document.getElementById(PANEL_ID)?.remove();
}

function showPanel(el: HTMLElement, translated: string): void {
  removePanel();

  const rect = el.getBoundingClientRect();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    left: ${Math.min(rect.left, window.innerWidth - 340)}px;
    top: ${rect.bottom + 6}px;
    width: 320px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08);
    border: 1px solid rgba(0,0,0,0.08);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding: 8px 12px; background: #f8f8f8; border-bottom: 1px solid #eee; font-size: 11px; color: #999; font-weight: 600; letter-spacing: 0.5px;';
  header.textContent = '中 → 英 翻譯預覽';
  panel.appendChild(header);

  // Translation text
  const body = document.createElement('div');
  body.style.cssText = 'padding: 12px; font-size: 14px; line-height: 1.6; color: #1a1a1a; word-break: break-word; max-height: 200px; overflow-y: auto;';
  body.textContent = translated;
  panel.appendChild(body);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'padding: 8px 12px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #f0f0f0;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.type = 'button';
  cancelBtn.style.cssText = 'padding: 6px 16px; border-radius: 8px; border: 1px solid #ddd; background: #fff; color: #666; font-size: 13px; cursor: pointer;';
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removePanel();
  });

  const replaceBtn = document.createElement('button');
  replaceBtn.textContent = '替換';
  replaceBtn.type = 'button';
  replaceBtn.style.cssText = 'padding: 6px 16px; border-radius: 8px; border: none; background: #ff6b9d; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;';
  replaceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removePanel();
    el.focus();
    replaceInputText(el, translated);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(replaceBtn);
  panel.appendChild(btnRow);

  document.body.appendChild(panel);

  // Dismiss on Escape
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removePanel();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
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

    // Show loading panel
    removePanel();
    const loadingPanel = document.createElement('div');
    loadingPanel.id = PANEL_ID;
    const rect = el.getBoundingClientRect();
    loadingPanel.style.cssText = `
      position: fixed; z-index: 2147483647;
      left: ${Math.min(rect.left, window.innerWidth - 340)}px;
      top: ${rect.bottom + 6}px;
      padding: 12px 16px; background: #fff; border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      border: 1px solid rgba(0,0,0,0.08);
      font-size: 13px; color: #999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    loadingPanel.textContent = '翻譯中...';
    document.body.appendChild(loadingPanel);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: rawText,
        lang: 'en',
        model: getModel(),
      });

      removePanel();

      if (response?.translated) {
        showPanel(el, response.translated);
      } else if (response?.error) {
        console.error('[IMT Input] error:', response.error);
      }
    } catch (err) {
      removePanel();
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
  removePanel();
}
