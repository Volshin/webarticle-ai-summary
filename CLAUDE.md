# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build commands

```bash
npm run build           # Chrome production build → dist/chrome/
npm run build:safari    # Safari production build → dist/safari/
npm run build:all       # Both targets
npm run dev             # Chrome development build (unminified)
npm run watch           # Chrome development build with watch mode
```

No test suite exists. TypeScript type-checking via `npx tsc --noEmit`.

## Architecture

This is a browser extension with three separate execution contexts that communicate via message passing:

**`src/background.ts`** — Service worker (Manifest V3). The only context with access to the Anthropic API key and the ability to make `api.anthropic.com` requests. Handles three message types: `ANALYZE_PAGE` (orchestrates the full flow), `SET_API_KEY`, and `GET_API_KEY`. Caches results in `browser.storage.session` keyed by tab URL, so re-opening the popup is instant.

**`src/content.ts`** — Injected into every http/https page. Responds to `EXTRACT_TEXT` messages by running a priority-ordered extraction strategy: `<article>` → `<main>` → `[role="main"]` → common CMS class selectors → full body fallback. Strips noise (nav, sidebar, comments, ads) on a DOM clone — never mutates the live page. Output is truncated to 8,000 chars (~2k tokens).

**`src/popup/popup.ts`** — UI logic only. On open, immediately sends `ANALYZE_PAGE` to the background. Manages a `currentLevel` (0–3) state that maps to the four progressive summary keys (`ultraShort` → `short` → `medium` → `detailed`). The "More Details" button increments the level; level tabs allow jumping directly.

**`src/types.ts`** — Shared types across all three contexts. `SummaryResult` defines the four text fields plus `fluffPercentage` and `noveltyScore`. `MessageType` is the exhaustive union of all valid message strings.

## Dual-target build

`webpack.config.js` reads `process.env.TARGET` (default: `chrome`) to select the output directory and manifest file. The only difference between targets is the manifest: Chrome uses `background.service_worker`, Safari uses `background.scripts` with `"type": "module"`. Source code is identical for both.

The Safari native wrapper (Xcode project) lives in `Safari/` and is a separate concern — it hosts the web extension output but has no build integration with webpack/npm.

## Claude API usage

The extension calls `claude-sonnet-4-6` directly from the background service worker using `dangerouslyAllowBrowser: true` (safe because service workers are not accessible to web content). The prompt instructs Claude to:
- Detect and match the article's language
- Return raw JSON only (no markdown fences)
- Produce four progressive summaries with zero repetition between levels

API key is stored in `browser.storage.local` (persists across sessions); summaries are cached in `browser.storage.session` (cleared when browser closes).
