// Content script — runs on every http/https page.
// Waits for messages from the background service worker and returns extracted text.

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_TEXT') {
      const text = extractArticleText();
      sendResponse({ text });
    }
    return true; // keep the message channel open for async sendResponse
  }
);

// Selectors for non-article noise to strip from any container before extracting text.
// Works on a cloned node — never mutates the real DOM.
const NOISE_SELECTORS = [
  // Comments sections (universal patterns)
  '[id*="comment"]', '[class*="comment"]',
  '[id*="discuss"]', '[class*="discuss"]',
  '[id*="replies"]', '[class*="replies"]',
  // Sidebars, recommendations, ads
  'aside', '[role="complementary"]',
  '[class*="sidebar"]', '[class*="related"]',
  '[class*="recommend"]', '[class*="suggestion"]',
  '[class*="promo"]', '[class*="banner"]', '[class*="advert"]',
  // Navigation chrome
  'nav', 'header', 'footer',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  // Author bio boxes, share widgets, tags
  '[class*="author-bio"]', '[class*="share"]',
  '[class*="tags"]', '[class*="subscribe"]',
].join(',');

function stripNoise(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>(NOISE_SELECTORS).forEach(n => n.remove());
  return clone;
}

function extractArticleText(): string {
  // 1. Semantic <article> element
  const article = document.querySelector('article');
  if (article) return clean(stripNoise(article as HTMLElement).innerText);

  // 2. <main> element
  const main = document.querySelector('main');
  if (main) return clean(stripNoise(main as HTMLElement).innerText);

  // 3. ARIA main landmark
  const ariaMain = document.querySelector('[role="main"]');
  if (ariaMain) return clean(stripNoise(ariaMain as HTMLElement).innerText);

  // 4. Common CMS content selectors — pick the longest candidate
  const candidates = document.querySelectorAll([
    '[class*="article-body"]',
    '[class*="post-content"]',
    '[class*="entry-content"]',
    '[class*="article__body"]',
    '[class*="story-body"]',
    '[class*="article-text"]',
    '[id*="article-body"]',
    '[id*="post-body"]',
    '#content',
    '.content',
  ].join(','));

  let best: HTMLElement | null = null;
  let maxLen = 0;
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i] as HTMLElement;
    const t = stripNoise(el).innerText || '';
    if (t.length > maxLen && t.length > 300) {
      maxLen = t.length;
      best = el;
    }
  }

  if (best !== null) return clean(stripNoise(best).innerText);

  // 5. Fallback: body with noise stripped
  return clean(stripNoise(document.body).innerText);
}

function clean(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000); // ~2k tokens — enough for any article, keeps Claude fast
}
