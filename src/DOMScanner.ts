const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
  'SELECT', 'BUTTON', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
]);

const MIN_TEXT_LENGTH = 30; // 提高門檻，避免翻譯導覽列短文字
const TRANSLATED_ATTR = 'data-imt-done';

export function scanParagraphs(root: Document | Element = document): Element[] {
  const results: Element[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.hasAttribute(TRANSLATED_ATTR)) return NodeFilter.FILTER_REJECT;
        // 跳過導覽、側邊欄、頁首頁尾
        if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        const tag = el.tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'TD', 'TH'].includes(tag)) {
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
  }
  return results;
}

export function markTranslated(el: Element): void {
  el.setAttribute(TRANSLATED_ATTR, '1');
}

export function isTranslated(el: Element): boolean {
  return el.hasAttribute(TRANSLATED_ATTR);
}

// 判斷文字是否主要為拉丁字母（需要翻譯）
function isMainlyLatin(text: string): boolean {
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return latinCount / text.length > 0.4;
}
