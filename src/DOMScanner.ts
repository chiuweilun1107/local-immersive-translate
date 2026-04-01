const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
  'SELECT', 'BUTTON', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
  'IMG', 'VIDEO', 'AUDIO', 'BR', 'HR', 'LINK', 'META',
  'TEMPLATE', 'SLOT', 'OPTION',
]);

// Tags that are always worth scanning (block text elements)
const BLOCK_TEXT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'TD', 'TH', 'FIGCAPTION', 'CAPTION',
  'ARTICLE', 'SECTION', 'DD', 'DT', 'SUMMARY',
]);

const NAV_SELECTORS = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="toolbar"], [role="tablist"]';

const MIN_TEXT_LENGTH = 20;
const MAX_SCAN_ELEMENTS = 500; // 效能限制：最多掃 500 個元素
const TRANSLATED_ATTR = 'data-imt-done';

// Site-specific selectors
const SITE_SELECTORS = [
  'div[slot="title"] > a',           // Reddit shreddit
  'div[slot="text-body"] > p',       // Reddit shreddit
  '[data-testid="post-title"] > a',  // Reddit old
  '[data-testid="tweetText"]',       // Twitter/X
  'article [lang]',                  // Twitter/X content
];

export function scanParagraphs(root: Document | Element = document): Element[] {
  // 不再整頁跳過中文頁面 — 改為逐元素判斷語言
  const results: Element[] = [];
  const rootEl = root instanceof Document ? root.body : root;
  _scanRoot(rootEl, results);
  _scanSiteSelectors(rootEl, results);
  return results;
}

function _scanSiteSelectors(root: Element, results: Element[]): void {
  if (results.length >= MAX_SCAN_ELEMENTS) return;
  const seen = new Set(results);
  for (const selector of SITE_SELECTORS) {
    try {
      root.querySelectorAll(selector).forEach((el) => {
        if (results.length >= MAX_SCAN_ELEMENTS) return;
        if (seen.has(el) || el.hasAttribute(TRANSLATED_ATTR)) return;
        if (el.closest(NAV_SELECTORS)) return;
        if (shouldTranslate(el)) {
          results.push(el);
          seen.add(el);
        }
      });
    } catch { /* skip */ }
  }
}

function _scanRoot(root: Element | ShadowRoot, results: Element[]): void {
  if (results.length >= MAX_SCAN_ELEMENTS) return;

  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (results.length >= MAX_SCAN_ELEMENTS) return NodeFilter.FILTER_REJECT;

        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.hasAttribute(TRANSLATED_ATTR)) return NodeFilter.FILTER_REJECT;

        // 快速排除導覽元素（只對根層級檢查，避免重複 closest 調用）
        const tag = el.tagName;
        if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE') {
          return NodeFilter.FILTER_REJECT;
        }
        const role = el.getAttribute('role');
        if (role === 'navigation' || role === 'banner' || role === 'toolbar') {
          return NodeFilter.FILTER_REJECT;
        }

        const text = el.textContent?.trim() || '';
        if (text.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_SKIP;

        // 語言判斷：只翻外語（非中文）內容
        if (!isTranslatable(text)) return NodeFilter.FILTER_SKIP;

        // Block text tags: 直接接受
        if (BLOCK_TEXT_TAGS.has(tag)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        // 通用偵測：text leaf
        if (isTextLeaf(el)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  // 用 Set 追蹤已接受的元素，避免父子重複（O(1) 查詢）
  const accepted = new Set<Element>();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (results.length >= MAX_SCAN_ELEMENTS) break;
    const el = node as Element;

    // 跳過已有翻譯父元素的子元素
    let hasParent = false;
    let parent = el.parentElement;
    while (parent) {
      if (accepted.has(parent)) { hasParent = true; break; }
      parent = parent.parentElement;
    }

    if (!hasParent) {
      results.push(el);
      accepted.add(el);
    }

    // Shadow DOM
    if (el.shadowRoot) _scanRoot(el.shadowRoot, results);
  }

  // 掃描 Shadow DOM hosts
  if (results.length < MAX_SCAN_ELEMENTS) {
    const hosts = root.querySelectorAll('*');
    for (const el of hosts) {
      if (results.length >= MAX_SCAN_ELEMENTS) break;
      if (el.shadowRoot) _scanRoot(el.shadowRoot, results);
    }
  }
}

/**
 * 判斷文字是否需要翻譯（是外語而非目標語言）
 */
function isTranslatable(text: string): boolean {
  const len = text.length;
  if (len === 0) return false;

  // 計算各語系字元比例
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;

  // 如果 CJK 佔比 > 50%，這是中文/日文/韓文內容，不翻
  if (cjk / len > 0.5) return false;

  // 如果 Latin 佔比 > 30%，且 CJK < 20%，視為外語，翻譯
  if (latin / len > 0.3 && cjk / len < 0.2) return true;

  return false;
}

/**
 * Text leaf：有文字但子元素都沒有足夠文字的元素
 */
function isTextLeaf(el: Element): boolean {
  // 跳過隱藏元素
  if (el instanceof HTMLElement) {
    if (el.offsetHeight === 0 && el.offsetWidth === 0) return false;
  }

  // 跳過 code/data 相關元素
  const cls = el.className?.toString?.() || '';
  if (/\b(script|style|json|code|hidden|sr-only|visually-hidden)\b/i.test(cls)) return false;

  // 無子元素 = leaf
  if (el.children.length === 0) return true;

  // 有子元素但子元素都沒有足夠文字
  for (const child of el.children) {
    if (SKIP_TAGS.has(child.tagName)) continue;
    const childText = child.textContent?.trim() || '';
    if (childText.length >= MIN_TEXT_LENGTH) {
      return false;
    }
  }

  return true;
}

// 向外公開的 helper — 給 site selector 用
function shouldTranslate(el: Element): boolean {
  const text = el.textContent?.trim() || '';
  return text.length >= MIN_TEXT_LENGTH && isTranslatable(text);
}

export function markTranslated(el: Element): void {
  el.setAttribute(TRANSLATED_ATTR, '1');
}

export function isTranslated(el: Element): boolean {
  return el.hasAttribute(TRANSLATED_ATTR);
}
