const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
  'SELECT', 'BUTTON', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
]);

const MIN_TEXT_LENGTH = 20;
const TRANSLATED_ATTR = 'data-imt-done';
const SCAN_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'TD', 'TH']);

// 網站專屬 selector：用於抓 TreeWalker 掃不到的標題元素
// 注意：必須指向最葉層的文字節點容器，避免 textContent 混入 badge/hidden 元素
const SITE_SELECTORS = [
  'div[slot="title"] > a',      // Reddit shreddit: 只取標題 <a>，排除 badge 子元素
  'div[slot="text-body"] > p',  // Reddit shreddit post body paragraphs
  '[data-testid="post-title"] > a', // Reddit old design
];

export function scanParagraphs(root: Document | Element = document): Element[] {
  const results: Element[] = [];
  const rootEl = root instanceof Document ? root.body : root;
  _scanRoot(rootEl, results);
  _scanSiteSelectors(rootEl, results);
  return results;
}

function _scanSiteSelectors(root: Element, results: Element[]): void {
  const seen = new Set(results);
  SITE_SELECTORS.forEach((selector) => {
    try {
      root.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el)) return;
        if (el.hasAttribute(TRANSLATED_ATTR)) return;
        if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"]')) return;
        const text = el.textContent?.trim() || '';
        if (text.length >= MIN_TEXT_LENGTH && isMainlyLatin(text)) {
          results.push(el);
          seen.add(el);
        }
      });
    } catch {
      // ignore invalid selectors
    }
  });
}

function _scanRoot(root: Element | ShadowRoot, results: Element[]): void {
  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.hasAttribute(TRANSLATED_ATTR)) return NodeFilter.FILTER_REJECT;
        if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (SCAN_TAGS.has(el.tagName)) {
          const text = el.textContent?.trim() || '';
          if (text.length >= MIN_TEXT_LENGTH && isMainlyLatin(text)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    results.push(node as Element);
    // 進入 Shadow DOM
    const shadow = (node as Element).shadowRoot;
    if (shadow) _scanRoot(shadow, results);
  }

  // 掃描此層直接子元素中有 shadow root 的宿主
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) _scanRoot(el.shadowRoot, results);
  });
}

export function markTranslated(el: Element): void {
  el.setAttribute(TRANSLATED_ATTR, '1');
}

export function isTranslated(el: Element): boolean {
  return el.hasAttribute(TRANSLATED_ATTR);
}

function isMainlyLatin(text: string): boolean {
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return latinCount / text.length > 0.4;
}
