const CARD_ID = 'imt-float';

const CARD_CSS = `
  position: fixed;
  z-index: 2147483647;
  max-width: 320px;
  min-width: 120px;
  padding: 10px 14px;
  background: #fff;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
  border: 1px solid rgba(0,0,0,0.08);
  pointer-events: none;
  transition: opacity 0.15s ease;
  word-break: break-word;
`;

function getOrCreateCard(): HTMLDivElement {
  let card = document.getElementById(CARD_ID) as HTMLDivElement | null;
  if (!card) {
    card = document.createElement('div');
    card.id = CARD_ID;
    card.style.cssText = CARD_CSS;
    card.style.display = 'none';
    document.documentElement.appendChild(card);

    document.addEventListener('mousedown', (e) => {
      if ((e.target as Element).id !== CARD_ID) {
        hide();
      }
    });
  }
  return card;
}

export function showAt(x: number, y: number, text: string, isLoading = false): void {
  const card = getOrCreateCard();

  if (isLoading) {
    card.innerHTML = `<span style="color:#999;font-size:12px;">翻譯中...</span>`;
  } else {
    card.textContent = text;
  }

  card.style.display = 'block';
  card.style.opacity = '0';
  card.style.left = '-9999px';
  card.style.top = '-9999px';

  // Position after render so we know dimensions
  requestAnimationFrame(() => {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 12;
    let top = y + 16;

    if (left + w > vw - 8) left = x - w - 12;
    if (top + h > vh - 8) top = y - h - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.opacity = '1';
  });
}

export function updateText(text: string): void {
  const card = document.getElementById(CARD_ID) as HTMLDivElement | null;
  if (card && card.style.display !== 'none') {
    card.textContent = text;
  }
}

export function hide(): void {
  const card = document.getElementById(CARD_ID) as HTMLDivElement | null;
  if (card) {
    card.style.display = 'none';
  }
}
