const IMT_CLASS = 'imt-translation';
const IMT_LOADING_CLASS = 'imt-loading';

const STYLES = `
  .${IMT_CLASS} {
    display: block !important;
    margin-top: 4px !important;
    padding: 2px 8px !important;
    font-family: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: inherit !important;
    color: inherit !important;
    background: rgba(255, 230, 0, 0.18) !important;
    border-left: 3px solid rgba(220, 160, 0, 0.6) !important;
    border-radius: 0 3px 3px 0 !important;
  }
  @media (prefers-color-scheme: dark) {
    .${IMT_CLASS} {
      background: rgba(255, 220, 0, 0.1) !important;
      border-left-color: rgba(200, 160, 0, 0.5) !important;
    }
  }
  .${IMT_LOADING_CLASS} {
    display: block !important;
    margin-top: 4px !important;
    font-family: inherit !important;
    font-size: 0.85em !important;
    color: inherit !important;
    opacity: 0.3;
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

function removeExistingBilingual(el: Element): void {
  el.querySelector(`.${IMT_CLASS}`)?.remove();
  el.querySelector(`.${IMT_LOADING_CLASS}`)?.remove();
}

export function injectTranslation(
  el: Element,
  translatedText: string,
  mode: 'bilingual' | 'translation_only' = 'bilingual'
): void {
  injectGlobalStyles();
  // Skip if already has a translation
  if (el.querySelector(`.${IMT_CLASS}`)) return;
  removeExistingBilingual(el);

  if (mode === 'translation_only') {
    if (!el.hasAttribute('data-imt-original')) {
      el.setAttribute('data-imt-original', el.innerHTML);
    }
    el.textContent = translatedText;
  } else {
    // 雙語：span 直接 append 進原始元素，緊貼在原文下方
    const span = document.createElement('span');
    span.className = IMT_CLASS;
    span.textContent = translatedText;
    el.appendChild(span);
  }
}

export function removeAllTranslations(): void {
  // 還原僅譯文模式改過的元素
  document.querySelectorAll('[data-imt-original]').forEach((el) => {
    el.innerHTML = el.getAttribute('data-imt-original')!;
    el.removeAttribute('data-imt-original');
  });
  document.querySelectorAll(`.${IMT_CLASS}, .${IMT_LOADING_CLASS}`).forEach((el) => el.remove());
  document.getElementById('imt-styles')?.remove();
  stylesInjected = false;
}

export function injectStreamSpan(el: Element): HTMLElement {
  injectGlobalStyles();
  const existing = el.querySelector(`.${IMT_CLASS}`);
  if (existing) return existing as HTMLElement;
  removeExistingBilingual(el);
  const span = document.createElement('span');
  span.className = IMT_CLASS;
  span.textContent = '';
  el.appendChild(span);
  return span;
}

export function injectLoadingPlaceholder(el: Element): HTMLElement {
  injectGlobalStyles();
  removeExistingBilingual(el);
  const span = document.createElement('span');
  span.className = IMT_LOADING_CLASS;
  span.textContent = '…';
  el.appendChild(span);
  return span;
}
