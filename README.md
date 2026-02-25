# Article Summary by Claude

A Chrome extension that instantly summarizes any article using Claude AI — with four progressive detail levels and readability metrics.

![Article Summary by Claude](icons/icon128.png)

## What it does

Open any article, click the extension — get a summary at exactly the depth you need:

- **Brief** — 2-3 sentences, the core idea
- **Short** — one paragraph, main points
- **Medium** — 3-4 paragraphs, arguments and context
- **Full** — comprehensive, all significant details

Each level continues where the previous one left off — no repetition. Read as little or as much as you want.

Two bonus metrics:
- **Fluff %** — how much of the article is filler, padding, or obvious facts
- **Novelty score** — how original or insightful the content is

Summaries are cached per-tab — re-opening the popup is instant, no re-analysis.

## Installation

This extension is not on the Chrome Web Store yet. Load it manually:

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Pet4_Ext_summary.git
   cd Pet4_Ext_summary
   npm install
   npm run build
   ```

2. Open Chrome → `chrome://extensions`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** → select the `dist/` folder

5. Click the extension icon → enter your [Anthropic API key](https://console.anthropic.com/) → done

## Usage

1. Navigate to any article
2. Click the extension icon
3. Read the **Brief** summary — if you want more, click **→** to expand
4. Click **Re-analyze** to force a fresh summary

## Tech stack

- TypeScript
- Anthropic SDK (`@anthropic-ai/sdk`)
- Webpack
- Chrome Extension Manifest V3

## Project structure

```
src/
├── background.ts   — service worker, Claude API calls, caching
├── content.ts      — page text extraction (noise-stripped, no DOM mutation)
├── types.ts        — shared types
└── popup/
    ├── popup.ts    — UI logic
    ├── popup.html
    └── popup.css
```

## Requirements

- Chrome 116+
- An [Anthropic API key](https://console.anthropic.com/) (Claude Sonnet)

## Roadmap

- [ ] Safari support (via Safari Web Extension)
- [ ] Comments summary — separate view for discussion insights
- [ ] Haiku mode — faster, cheaper analysis option
- [ ] Chrome Web Store release

## License

MIT
