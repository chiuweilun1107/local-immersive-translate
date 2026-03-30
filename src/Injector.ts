const IMT_CLASS = 'imt-translation';
const IMT_LOADING_CLASS = 'imt-loading';

const STYLES = `
  .${IMT_CLASS} {
    display: block !important;
    margin-top: 4px !important;
    padding: 3px 8px !important;
    font-family: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: inherit !important;
    color: inherit !important;
    background: rgba(255, 230, 0, 0.15) !important;
    border-left: 3px solid rgba(255, 180, 0, 0.7) !important;
    border-radius: 0 3px 3px 0 !important;
  }
  @media (prefers-color-scheme: dark) {
    .${IMT_CLASS} {
      background: rgba(255, 220, 0, 0.1) !important;
      border-left-color: rgba(255, 200, 0, 0.5) !important;
    }
  }
  .${IMT_LOADING_CLASS} {
    display: block !important;
    margin-top: 4px !important;
    font-family: inherit !important;
    font-size: 0.85em !important;
    color: inherit !important;
    opacity: 0.35;
  }
`;

let stylesInjected = false;

function injectGlobalStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.id = 'imt-styles';
  style.textContent = STYLES;
  document.head?.appendChild(style);
  stylesInjected = true;
}

export function injectTranslation(el: Element, translatedText: string, mode: 'bilingual' | 'translation_only' = 'bilingual'): void {
  injectGlobalStyles();

  // 移除舊譯文
  const existing = el.nextElementSibling;
  if (existing?.classList.contains(IMT_CLASS)) existing.remove();

  if (mode === 'translation_only') {
    // 保存原文以便切回
    if (!el.hasAttribute('data-imt-original')) {
      el.setAttribute('data-imt-original', el.innerHTML);
    }
    el.textContent = translatedText;
  } else {
    // 雙語：譯文插在原文後面，繼承頁面樣式
    const div = document.createElement('div');
    div.className = IMT_CLASS;
    div.textContent = translatedText;
    el.insertAdjacentElement('afterend', div);
  }
}

export function removeAllTranslations(): void {
  // 還原 translation_only 模式改動的原文
  document.querySelectorAll('[data-imt-original]').forEach((el) => {
    el.innerHTML = el.getAttribute('data-imt-original')!;
    el.removeAttribute('data-imt-original');
  });
  document.querySelectorAll(`.${IMT_CLASS}, .${IMT_LOADING_CLASS}`).forEach((el) => el.remove());
  document.getElementById('imt-styles')?.remove();
  stylesInjected = false;
}

export function injectLoadingPlaceholder(el: Element): HTMLDivElement {
  injectGlobalStyles();
  const div = document.createElement('div');
  div.className = IMT_LOADING_CLASS;
  div.textContent = '…';
  el.insertAdjacentElement('afterend', div);
  return div;
}
