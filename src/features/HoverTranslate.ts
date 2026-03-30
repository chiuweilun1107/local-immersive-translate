import { showAt, hide } from '../FloatingCard';

const HOVER_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE']);

let altDown = false;
let mousemoveHandler: ((e: MouseEvent) => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let keyupHandler: ((e: KeyboardEvent) => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastElement: Element | null = null;

function findAncestor(el: Element): Element | null {
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (HOVER_TAGS.has(node.tagName)) return node;
    node = node.parentElement;
  }
  return null;
}

export function startHoverTranslate(getModel: () => string): void {
  if (mousemoveHandler) return;

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Alt') altDown = true;
  };

  keyupHandler = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      altDown = false;
      lastElement = null;
      hide();
    }
  };

  mousemoveHandler = (e: MouseEvent) => {
    if (!altDown) return;

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target) return;

      const ancestor = findAncestor(target as Element);
      if (!ancestor) return;
      if (ancestor === lastElement) return;

      lastElement = ancestor;
      const text = ancestor.textContent?.trim() ?? '';
      if (text.length < 10) return;

      showAt(e.clientX, e.clientY, '', true);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSLATE',
          text,
          lang: 'zh-TW',
          model: getModel(),
        });

        if (!altDown) return; // user released Alt while translating

        if (response?.translated) {
          showAt(e.clientX, e.clientY, response.translated);
        } else if (response?.error) {
          showAt(e.clientX, e.clientY, `[錯誤] ${response.error}`);
        }
      } catch (err) {
        if (altDown) showAt(e.clientX, e.clientY, `[錯誤] ${String(err)}`);
      }
    }, 400);
  };

  document.addEventListener('keydown', keydownHandler);
  document.addEventListener('keyup', keyupHandler);
  document.addEventListener('mousemove', mousemoveHandler);
}

export function stopHoverTranslate(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  if (keyupHandler) {
    document.removeEventListener('keyup', keyupHandler);
    keyupHandler = null;
  }
  if (mousemoveHandler) {
    document.removeEventListener('mousemove', mousemoveHandler);
    mousemoveHandler = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  altDown = false;
  lastElement = null;
  hide();
}
