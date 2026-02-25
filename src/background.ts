import browser from 'webextension-polyfill';
import Anthropic from '@anthropic-ai/sdk';
import type { SummaryResult, BackgroundResponse } from './types';

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
browser.runtime.onMessage.addListener(
  (message: unknown, _sender: browser.Runtime.MessageSender) => {
    const msg = message as { type: string; payload?: unknown };

    if (msg.type === 'ANALYZE_PAGE') {
      return handleAnalyze();
    }

    if (msg.type === 'SET_API_KEY') {
      return browser.storage.local.set({ apiKey: msg.payload }).then(() => ({ success: true }));
    }

    if (msg.type === 'GET_API_KEY') {
      return browser.storage.local.get('apiKey').then(data => ({
        apiKey: (data.apiKey as string) || null,
      }));
    }
  }
);

// ---------------------------------------------------------------------------
// Core analysis handler — returns a Promise (MV3 / Safari compatible)
// ---------------------------------------------------------------------------
async function handleAnalyze(): Promise<BackgroundResponse> {
  try {
    // 1. Get the active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      return { success: false, error: 'No active tab found.' };
    }

    // Check for restricted URLs that content scripts can't access
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('safari-web-extension://')
    ) {
      return {
        success: false,
        error: 'Cannot analyze browser internal pages. Navigate to a real article first.',
      };
    }

    // 2. Check session cache (avoids re-analysis on popup re-open)
    const cacheKey = `summary_${tab.url}`;
    const cached = await browser.storage.session.get(cacheKey);
    if (cached[cacheKey]) {
      return { success: true, data: cached[cacheKey] as SummaryResult };
    }

    // 3. Extract page text via content script
    let extractedText: string;
    try {
      const result = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_TEXT' }) as { text: string };
      extractedText = result.text;
    } catch {
      // Content script not yet injected — try scripting API (Chrome) or skip (Safari handles via manifest)
      try {
        await (browser as unknown as typeof chrome).scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        const result = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_TEXT' }) as { text: string };
        extractedText = result.text;
      } catch {
        return {
          success: false,
          error: 'Could not access page content. Try refreshing the page.',
        };
      }
    }

    if (!extractedText || extractedText.trim().length < 100) {
      return {
        success: false,
        error: 'Not enough text found on this page. It may be a video, image, or login-gated article.',
      };
    }

    // 4. Get API key
    const storageData = await browser.storage.local.get('apiKey');
    const apiKey = storageData.apiKey as string | undefined;
    if (!apiKey) {
      return { success: false, error: 'API_KEY_MISSING' };
    }

    // 5. Call Claude
    console.log(
      `[ArticleSummary] Sending to Claude: ${extractedText.length} chars / ~${Math.round(extractedText.length / 4)} tokens\n` +
      `--- FIRST 300 chars ---\n${extractedText.slice(0, 300)}\n` +
      `--- LAST 300 chars ---\n${extractedText.slice(-300)}\n---`
    );
    const t0 = Date.now();
    const result = await callClaude(apiKey, extractedText);
    console.log(`[ArticleSummary] Claude responded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // 6. Cache and respond
    await browser.storage.session.set({ [cacheKey]: result });
    return { success: true, data: result };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------
async function callClaude(apiKey: string, text: string): Promise<SummaryResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // safe in extension service worker context
  });

  const prompt = `Analyze the article below and return summaries at four progressively detailed levels, plus two quality metrics.

IMPORTANT: Detect the language of the article and write ALL summaries in that same language.
For example, if the article is in Russian, all summary fields must be in Russian.
If the article is in French, all summary fields must be in French. Match the article's language exactly.

Return ONLY raw JSON — no markdown code fences, no commentary, no extra text. Just the JSON object.

Required JSON schema (use exactly these keys):
{
  "ultraShort": "2-3 crisp sentences capturing the essential message",
  "short": "One paragraph (5-7 sentences) that ONLY covers points NOT mentioned in ultraShort — develops the idea further",
  "medium": "3-4 paragraphs that ONLY add details, arguments, and evidence NOT covered in ultraShort or short — no repetition of earlier levels",
  "detailed": "Comprehensive continuation that covers remaining significant content, structure, and conclusions NOT yet mentioned — assumes reader has read all previous levels",
  "fluffPercentage": <integer 0-100>,
  "noveltyScore": <integer 0-100>
}

Progressive summary rules:
- Each level MUST NOT repeat information already stated in previous levels
- Each level continues where the previous one left off, adding depth and new details
- A reader going through all four levels in order gets a complete picture with zero repetition
- ultraShort captures the core message; each subsequent level only expands on it

Scoring rubric:
- fluffPercentage: What percentage of the article is filler, repetition, obvious facts, ads, or padding?
  0 = extremely dense and informative, every sentence adds value
  100 = mostly padding, nearly no substance
- noveltyScore: How fresh, unique, or insightful is the content?
  0 = generic common knowledge, nothing new
  100 = highly original insights, surprising data, or rare perspective

Article:
---
${text}
---`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract the text block
  const textContent = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('');

  // Parse JSON — be lenient about surrounding whitespace or stray characters
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude returned an unexpected response format. Please try again.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as SummaryResult;

  // Validate required keys exist
  const required: (keyof SummaryResult)[] = [
    'ultraShort', 'short', 'medium', 'detailed',
    'fluffPercentage', 'noveltyScore',
  ];
  for (const key of required) {
    if (parsed[key] === undefined) {
      throw new Error(`Missing field "${key}" in Claude response.`);
    }
  }

  // Clamp metric values
  parsed.fluffPercentage = Math.max(0, Math.min(100, Math.round(parsed.fluffPercentage)));
  parsed.noveltyScore = Math.max(0, Math.min(100, Math.round(parsed.noveltyScore)));

  return parsed;
}
