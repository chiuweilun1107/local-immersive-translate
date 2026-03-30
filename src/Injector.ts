const IMT_CLASS = 'imt-translation';

const STYLES = `
  .${IMT_CLASS} {
    display: block;
    margin-top: 4px;
    padding: 4px 8px;
    font-size: 0.9em;
    color: #555;
    border-left: 2px solid #ccc;
    background: rgba(0,0,0,0.03);
    font-family: inherit;
    line-height: 1.6;
  }
  @media (prefers-color-scheme: dark) {
    .${IMT_CLASS} {
      color: #aaa;
      border-left-color: #555;
      background: rgba(255,255,255,0.05);
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

  // Remove existing translation if re-translating
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
  div.style.opacity = '0.5';
  div.textContent = '翻譯中…';
  el.insertAdjacentElement('afterend', div);
  return div;
}
