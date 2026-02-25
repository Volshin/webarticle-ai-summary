import browser from 'webextension-polyfill';
import type { SummaryResult, BackgroundResponse } from '../types';
import { LEVEL_KEYS } from '../types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentData: SummaryResult | null = null;
let currentLevel = 0;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;

const loadingState   = $('loadingState');
const errorState     = $('errorState');
const summaryState   = $('summaryState');
const errorMsg       = $('errorMsg');
const summaryText    = $('summaryText');
const fluffFill      = $('fluffFill');
const noveltyFill    = $('noveltyFill');
const fluffValue     = $('fluffValue');
const noveltyValue   = $('noveltyValue');
const moreDetailsBtn = $('moreDetailsBtn');
const retryBtn       = $('retryBtn');
const reanalyzeBtn   = $('reanalyzeBtn');
const settingsBtn    = $('settingsBtn');
const apiKeySection  = $('apiKeySection');
const apiKeyInput    = $('apiKeyInput') as HTMLInputElement;
const saveApiKeyBtn  = $('saveApiKeyBtn');
const levelTabs      = document.querySelectorAll<HTMLButtonElement>('.level-tab');

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------
function showOnly(el: HTMLElement): void {
  [loadingState, errorState, summaryState].forEach(v => v.classList.add('hidden'));
  el.classList.remove('hidden');
}

function showLoading(): void {
  showOnly(loadingState);
}

function showError(msg: string): void {
  errorMsg.textContent = msg;
  showOnly(errorState);
}

function renderSummary(data: SummaryResult, level: number): void {
  // Text — render paragraphs as separate <p> elements for readability
  const key = LEVEL_KEYS[level];
  const rawText = data[key] as string;
  summaryText.innerHTML = rawText
    .split(/\n\n+/)
    .map(p => `<p>${p.trim()}</p>`)
    .join('');

  // Metrics
  const fluff   = data.fluffPercentage;
  const novelty = data.noveltyScore;

  fluffFill.style.width = `${fluff}%`;
  fluffFill.style.backgroundColor = fluff > 60 ? '#ef4444' : fluff > 35 ? '#f59e0b' : '#22c55e';
  fluffValue.textContent = `${fluff}%`;

  noveltyFill.style.width = `${novelty}%`;
  noveltyFill.style.backgroundColor = novelty > 60 ? '#22c55e' : novelty > 35 ? '#f59e0b' : '#ef4444';
  noveltyValue.textContent = `${novelty}%`;

  // Level tabs
  levelTabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === level);
    tab.classList.toggle('seen', i < level);
  });

  // More details button
  if (level >= 3) {
    moreDetailsBtn.style.display = 'none';
  } else {
    moreDetailsBtn.style.display = '';
    const nextLabels = ['Short', 'Medium', 'Full'];
    moreDetailsBtn.textContent = `${nextLabels[level]} →`;
  }

  showOnly(summaryState);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
function analyze(forceRefresh = false): void {
  currentData = null;
  currentLevel = 0;
  showLoading();

  if (forceRefresh) {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) {
        browser.storage.session.remove(`summary_${tab.url}`).then(() => sendAnalyzeMessage());
      } else {
        sendAnalyzeMessage();
      }
    });
  } else {
    sendAnalyzeMessage();
  }
}

function sendAnalyzeMessage(): void {
  browser.runtime.sendMessage({ type: 'ANALYZE_PAGE' })
    .then((response) => {
      const res = response as BackgroundResponse;
      if (!res.success) {
        if (res.error === 'API_KEY_MISSING') {
          apiKeySection.classList.remove('hidden');
          showError('API key required. Enter it above to get started.');
        } else {
          showError(res.error);
        }
        return;
      }
      currentData = res.data;
      renderSummary(currentData, currentLevel);
    })
    .catch((err: Error) => {
      showError('Extension error: ' + err.message);
    });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
moreDetailsBtn.addEventListener('click', () => {
  if (currentData && currentLevel < 3) {
    currentLevel++;
    renderSummary(currentData, currentLevel);
  }
});

// Click on level tabs to jump directly to that level
levelTabs.forEach((tab, i) => {
  tab.addEventListener('click', () => {
    if (currentData) {
      currentLevel = i;
      renderSummary(currentData, currentLevel);
    }
  });
});

retryBtn.addEventListener('click', () => analyze());
reanalyzeBtn.addEventListener('click', () => analyze(true));

settingsBtn.addEventListener('click', () => {
  apiKeySection.classList.toggle('hidden');
  if (!apiKeySection.classList.contains('hidden')) {
    // Pre-fill with existing key (masked)
    browser.runtime.sendMessage({ type: 'GET_API_KEY' }).then((res) => {
      const r = res as { apiKey: string | null };
      if (r.apiKey) {
        apiKeyInput.placeholder = r.apiKey.slice(0, 12) + '…';
      }
    });
    apiKeyInput.focus();
  }
});

saveApiKeyBtn.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveApiKey();
});

function saveApiKey(): void {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  browser.runtime.sendMessage({ type: 'SET_API_KEY', payload: key }).then(() => {
    apiKeyInput.value = '';
    apiKeySection.classList.add('hidden');
    analyze();
  });
}

// ---------------------------------------------------------------------------
// Boot — auto-analyze on popup open
// ---------------------------------------------------------------------------
analyze();
