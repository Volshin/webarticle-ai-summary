import browser from 'webextension-polyfill';
import type { SummaryResult, BackgroundResponse, SummaryLanguage } from '../types';
import { LEVEL_KEYS } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_FONT_SIZE = 15;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentData: SummaryResult | null = null;
let currentLevel = 0;
let currentLanguage: SummaryLanguage = 'ru';
let currentFontSize: number = DEFAULT_FONT_SIZE;

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
const openInTabBtn   = $('openInTabBtn');
const settingsBtn    = $('settingsBtn');
const apiKeySection  = $('apiKeySection');
const apiKeyInput    = $('apiKeyInput') as HTMLInputElement;
const saveApiKeyBtn  = $('saveApiKeyBtn');
const fontDecBtn     = $('fontDecBtn');
const fontIncBtn     = $('fontIncBtn');
const levelTabs      = document.querySelectorAll<HTMLButtonElement>('.level-tab');
const langBtns       = document.querySelectorAll<HTMLButtonElement>('.lang-btn');

// ---------------------------------------------------------------------------
// Font size
// ---------------------------------------------------------------------------
function applyFontSize(): void {
  document.documentElement.style.setProperty('--summary-font-size', `${currentFontSize}px`);
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------
function updateLangButtons(): void {
  langBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLanguage);
  });
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------
function showOnly(el: HTMLElement): void {
  [loadingState, errorState, summaryState].forEach(v => v.classList.add('hidden'));
  el.classList.remove('hidden');
}

function showLoading(): void { showOnly(loadingState); }

function showError(msg: string): void {
  errorMsg.textContent = msg;
  showOnly(errorState);
}

function renderSummary(data: SummaryResult, level: number): void {
  const key = LEVEL_KEYS[level];
  const rawText = data[key] as string;
  summaryText.innerHTML = rawText
    .split(/\n\n+/)
    .map(p => `<p>${p.trim()}</p>`)
    .join('');

  const fluff   = data.fluffPercentage;
  const novelty = data.noveltyScore;

  fluffFill.style.width = `${fluff}%`;
  fluffFill.style.backgroundColor = fluff > 60 ? '#ef4444' : fluff > 35 ? '#f59e0b' : '#22c55e';
  fluffValue.textContent = `${fluff}%`;

  noveltyFill.style.width = `${novelty}%`;
  noveltyFill.style.backgroundColor = novelty > 60 ? '#22c55e' : novelty > 35 ? '#f59e0b' : '#ef4444';
  noveltyValue.textContent = `${novelty}%`;

  levelTabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === level);
    tab.classList.toggle('seen', i < level);
  });

  if (level >= 3) {
    moreDetailsBtn.style.display = 'none';
  } else {
    moreDetailsBtn.style.display = '';
    const nextLabels = ['Short', 'Medium', 'Detailed'];
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
        // Clear cache for all language variants of this URL
        const keys = ['ru', 'en', 'de'].map(l => `summary_${tab.url}_${l}`);
        browser.storage.session.remove(keys).then(() => sendAnalyzeMessage());
      } else {
        sendAnalyzeMessage();
      }
    });
  } else {
    sendAnalyzeMessage();
  }
}

function sendAnalyzeMessage(): void {
  browser.runtime.sendMessage({ type: 'ANALYZE_PAGE', payload: { language: currentLanguage } })
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

openInTabBtn.addEventListener('click', async () => {
  if (!currentData) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const params = new URLSearchParams({ url: tab.url, lang: currentLanguage });
  browser.tabs.create({ url: browser.runtime.getURL('tab.html') + '?' + params.toString() });
});

fontDecBtn.addEventListener('click', () => {
  if (currentFontSize <= MIN_FONT_SIZE) return;
  currentFontSize--;
  applyFontSize();
  browser.storage.local.set({ fontSize: currentFontSize });
});

fontIncBtn.addEventListener('click', () => {
  if (currentFontSize >= MAX_FONT_SIZE) return;
  currentFontSize++;
  applyFontSize();
  browser.storage.local.set({ fontSize: currentFontSize });
});

settingsBtn.addEventListener('click', () => {
  apiKeySection.classList.toggle('hidden');
  if (!apiKeySection.classList.contains('hidden')) {
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

langBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang as SummaryLanguage;
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    browser.storage.local.set({ summaryLanguage: lang });
    updateLangButtons();
    analyze();
  });
});

// ---------------------------------------------------------------------------
// Boot — load preferences, then auto-analyze
// ---------------------------------------------------------------------------
async function init(): Promise<void> {
  const stored = await browser.storage.local.get(['fontSize', 'summaryLanguage']);
  currentFontSize = (stored.fontSize as number) || DEFAULT_FONT_SIZE;
  currentLanguage = (stored.summaryLanguage as SummaryLanguage) || 'ru';
  applyFontSize();
  updateLangButtons();
  analyze();
}

init();
