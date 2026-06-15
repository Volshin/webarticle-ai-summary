import browser from 'webextension-polyfill';
import type { SummaryResult } from './types';
import { LEVEL_KEYS, LEVEL_LABELS } from './types';

async function init(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const articleUrl = params.get('url');
  const lang = params.get('lang') || 'ru';

  if (!articleUrl) {
    showError('No article URL provided.');
    return;
  }

  const urlEl = document.getElementById('articleUrl');
  if (urlEl) {
    try {
      const u = new URL(articleUrl);
      urlEl.textContent = u.hostname + u.pathname;
    } catch {
      urlEl.textContent = articleUrl;
    }
    urlEl.title = articleUrl;
  }

  try {
    document.title = `Summary — ${new URL(articleUrl).hostname}`;
  } catch { /* ignore */ }

  const cacheKey = `summary_${articleUrl}_${lang}`;
  const stored = await browser.storage.session.get(cacheKey);
  const summary = stored[cacheKey] as SummaryResult | undefined;

  if (!summary) {
    showError(
      'Summary not found in cache.<br><br>' +
      'Open the extension popup while on the article page to generate a summary, ' +
      'then use "Open in tab" again.'
    );
    return;
  }

  renderSummary(summary);
}

function renderSummary(data: SummaryResult): void {
  const fluff   = data.fluffPercentage;
  const novelty = data.noveltyScore;

  const metricsEl = document.getElementById('metrics');
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="metric">
        <span class="metric-label">Fluff</span>
        <div class="metric-bar">
          <div class="metric-fill" style="width:${fluff}%;background-color:${fluff > 60 ? '#ef4444' : fluff > 35 ? '#f59e0b' : '#22c55e'}"></div>
        </div>
        <span class="metric-val">${fluff}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">Novelty</span>
        <div class="metric-bar">
          <div class="metric-fill" style="width:${novelty}%;background-color:${novelty > 60 ? '#22c55e' : novelty > 35 ? '#f59e0b' : '#ef4444'}"></div>
        </div>
        <span class="metric-val">${novelty}%</span>
      </div>
    `;
  }

  const container = document.getElementById('summaryContent');
  if (!container) return;

  LEVEL_KEYS.forEach((key, i) => {
    const section = document.createElement('section');
    section.className = 'summary-section';

    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = LEVEL_LABELS[i];
    section.appendChild(heading);

    const content = document.createElement('div');
    content.className = 'section-text';
    content.innerHTML = (data[key] as string)
      .split(/\n\n+/)
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
    section.appendChild(content);

    container.appendChild(section);
  });

  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
}

function showError(msg: string): void {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error');
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = msg;
  }
}

init();
