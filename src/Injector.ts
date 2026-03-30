const IMT_CLASS = 'imt-translation';

const STYLES = `
  .${IMT_CLASS} {
    display: block !important;
    margin: 6px 0 4px !important;
    padding: 5px 10px !important;
    font-size: 0.88em !important;
    color: #1a1a1a !important;
    background: rgba(240, 247, 255, 0.97) !important;
    border-left: 3px solid #1a73e8 !important;
    border-radius: 0 4px 4px 0 !important;
    font-family: inherit !important;
    line-height: 1.6 !important;
    box-sizing: border-box !important;
    position: relative !important;
    z-index: 9999 !important;
    pointer-events: none !important;
  }
  @media (prefers-color-scheme: dark) {
    .${IMT_CLASS} {
      color: #e8e8e8 !important;
      background: rgba(26, 60, 100, 0.95) !important;
      border-left-color: #6ba4ff !important;
    }
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

export function injectTranslation(el: Element, translatedText: string): void {
  injectGlobalStyles();

  const existing = el.nextElementSibling;
  if (existing?.classList.contains(IMT_CLASS)) {
    existing.remove();
  }

  const div = document.createElement('div');
  div.className = IMT_CLASS;
  div.textContent = translatedText;
  el.insertAdjacentElement('afterend', div);
}

export function removeAllTranslations(): void {
  document.querySelectorAll(`.${IMT_CLASS}`).forEach((el) => el.remove());
  document.getElementById('imt-styles')?.remove();
  stylesInjected = false;
}

export function injectLoadingPlaceholder(el: Element): HTMLDivElement {
  injectGlobalStyles();
  const div = document.createElement('div');
  div.className = IMT_CLASS;
  div.style.opacity = '0.6';
  div.textContent = '翻譯中…';
  el.insertAdjacentElement('afterend', div);
  return div;
}
