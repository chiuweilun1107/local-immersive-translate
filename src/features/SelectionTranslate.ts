import { showAt, hide } from '../FloatingCard';

let mouseupHandler: ((e: MouseEvent) => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startSelectionTranslate(getModel: () => string): void {
  if (mouseupHandler) return;

  mouseupHandler = (e: MouseEvent) => {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (text.length <= 5) {
        hide();
        return;
      }

      showAt(e.clientX, e.clientY, '', true);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSLATE',
          text,
          lang: 'zh-TW',
          model: getModel(),
        });

        if (response?.translated) {
          showAt(e.clientX, e.clientY, response.translated);
        } else if (response?.error) {
          showAt(e.clientX, e.clientY, `[錯誤] ${response.error}`);
        }
      } catch (err) {
        showAt(e.clientX, e.clientY, `[錯誤] ${String(err)}`);
      }
    }, 300);
  };

  document.addEventListener('mouseup', mouseupHandler);
}

export function stopSelectionTranslate(): void {
  if (mouseupHandler) {
    document.removeEventListener('mouseup', mouseupHandler);
    mouseupHandler = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  hide();
}
