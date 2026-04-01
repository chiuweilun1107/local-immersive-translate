const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
  'SELECT', 'BUTTON', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
  'IMG', 'VIDEO', 'AUDIO', 'BR', 'HR', 'LINK', 'META',
  'TEMPLATE', 'SLOT', 'OPTION', 'LABEL',
]);

// Tags that are always worth scanning (traditional block text elements)
const BLOCK_TEXT_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'FIGCAPTION', 'CAPTION']);

// Tags to skip as navigation/chrome (not content)
const NAV_SELECTORS = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="toolbar"], [role="tablist"]';

const MIN_TEXT_LENGTH = 20;
const TRANSLATED_ATTR = 'data-imt-done';

// Site-specific selectors for elements TreeWalker can't easily reach
const SITE_SELECTORS = [
  'div[slot="title"] > a',      // Reddit shreddit
  'div[slot="text-body"] > p',  // Reddit shreddit
  '[data-testid="post-title"] > a', // Reddit old
  '[data-testid="tweetText"]',  // Twitter/X tweet text
  'article [lang]',             // Twitter/X content with lang attr
];

export function scanParagraphs(root: Document | Element = document): Element[] {
  // Skip pages already in target language (zh)
  const htmlLang = document.documentElement.lang?.toLowerCase() || '';
  if (htmlLang.startsWith('zh')) return [];

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
        if (seen.has(el) || el.hasAttribute(TRANSLATED_ATTR)) return;
        if (el.closest(NAV_SELECTORS)) return;
        const text = el.textContent?.trim() || '';
        if (text.length >= MIN_TEXT_LENGTH && isMainlyLatin(text)) {
          results.push(el);
          seen.add(el);
        }
      });
    } catch { /* skip */ }
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
        if (el.closest(NAV_SELECTORS)) return NodeFilter.FILTER_REJECT;

        const text = el.textContent?.trim() || '';
        if (text.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_SKIP;
        if (!isMainlyLatin(text)) return NodeFilter.FILTER_SKIP;

        // Known block text tags: always accept
        if (BLOCK_TEXT_TAGS.has(el.tagName)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        // Universal detection: accept if this is a "text leaf"
        // A text leaf = has enough text but no child elements that also have enough text
        if (isTextLeaf(el)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    // Skip if a parent is already in results (prevents double translation)
    const hasTranslatedParent = results.some(r => r.contains(el) && r !== el);
    if (!hasTranslatedParent) {
      results.push(el);
    }
    const shadow = el.shadowRoot;
    if (shadow) _scanRoot(shadow, results);
  }

  // Shadow DOM scan
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) _scanRoot(el.shadowRoot, results);
  });
}

/**
 * A "text leaf" is an element that contains substantial text
 * but doesn't have child elements that individually contain substantial text.
 */
function isTextLeaf(el: Element): boolean {
  // Skip hidden or zero-size elements
  const style = el instanceof HTMLElement ? el.style : null;
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  if ((el as HTMLElement).offsetHeight === 0) return false;

  // Skip elements that look like code/data (class or id hints)
  const cls = el.className?.toString?.() || '';
  const id = el.id || '';
  if (/script|style|json|code|data-|hidden|sr-only/i.test(cls + id)) return false;

  // If no children at all, it's a leaf
  if (el.children.length === 0) return true;

  // Check: does any single child element have substantial text?
  for (const child of el.children) {
    if (SKIP_TAGS.has(child.tagName)) continue;
    const childText = child.textContent?.trim() || '';
    if (childText.length >= MIN_TEXT_LENGTH) {
      return false; // has a child with enough text → not a leaf
    }
  }

  return true;
}

export function markTranslated(el: Element): void {
  el.setAttribute(TRANSLATED_ATTR, '1');
}

export function isTranslated(el: Element): boolean {
  return el.hasAttribute(TRANSLATED_ATTR);
}

function isMainlyLatin(text: string): boolean {
  // Skip if text is mostly CJK (Chinese/Japanese/Korean)
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  if (cjkCount / text.length > 0.3) return false;

  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return latinCount / text.length > 0.5;
}
