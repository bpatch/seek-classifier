# Seek Employer Classifier

A Chrome Extension that classifies job listings on [Seek](https://www.seek.com.au) and [Careers Victoria](https://www.careers.vic.gov.au) as **Public Service**, **Public Sector**, or **Private / Unlisted** based on a curated spreadsheet of Victorian government employers.

## Features

- 🏛️ **Automatic Classification** — Badges appear next to each employer name on job search results pages, instantly telling you whether a role is in the Public Service, Public Sector, or Private sector.
- 🟢 **Public Sector** — Green badge for employers classified as Public Sector bodies (e.g. water corporations, health services, TAFEs).
- 🟠 **Public Service** — Orange badge for employers classified as Public Service (e.g. government departments).
- ⬜ **Private / Unlisted** — Grey badge for employers not found in the spreadsheet.
- 🔀 **Filter Toggles** — Two toggle switches let you instantly hide jobs that don't match your preferred category. Toggle "Show Public Sector only", "Show Public Service only", or both at once.
- 🔍 **Fuzzy Matching** — Intelligently matches employer names even when the website uses abbreviations or omits suffixes like "Pty Ltd" or "Corporation".
- 🌐 **Multi-site Support** — Works on `seek.com.au`, `seek.co.nz`, `seek.com`, and `careers.vic.gov.au`.

---

## User Guide

### Installation

This extension is not published on the Chrome Web Store. To install it locally:

1. Clone or download this repository to your computer.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the root folder of this repository (the folder containing `manifest.json`).
5. The extension icon should appear in your toolbar. Navigate to [Seek](https://www.seek.com.au/jobs) or [Careers Vic](https://www.careers.vic.gov.au/jobs) to see it in action.

### How It Works

Once installed, the extension automatically scans every job listing on supported websites. It reads the employer name from each job card and checks it against a bundled list of ~260 Victorian government employers.

- If a match is found, a coloured badge appears next to the employer name indicating whether it is **Public Sector** (green) or **Public Service** (orange).
- If no match is found, a grey **Private / Unlisted** badge appears instead.

### Using the Filter Toggles

Two toggle switches appear at the top of the search results (or as a floating panel if the sidebar isn't available):

| Toggle | Behaviour |
|---|---|
| **Show Public Sector only** | Hides all jobs except those with a green Public Sector badge. |
| **Show Public Service only** | Hides all jobs except those with an orange Public Service badge. |
| **Both toggled on** | Shows Public Sector AND Public Service jobs, hides everything else. |
| **Both toggled off** | Shows all jobs (default). |

Your toggle preferences are saved securely within the extension and persist across page reloads and browser sessions.

### Updating the Extension

After pulling new changes or modifying files:

1. Go to `chrome://extensions/`.
2. Click the **Reload** button (circular arrow) on the Seek Employer Classifier card.
3. Refresh any open Seek or Careers Vic tabs.

---

## Developer Guide

### Project Structure

```
seek-classifier/
├── manifest.json                # Chrome Extension manifest (MV3)
├── content/
│   ├── seek_flag.js             # Content script — core classification logic
│   └── styles.css               # Injected stylesheet — badges, toggles, hide rules
├── data/
│   └── employers.json           # Generated employer dictionary (do not edit manually)
├── scripts/
│   ├── convert_data.js          # Build script — converts .xlsx → employers.json
│   └── test_seek.js             # Dev utility — Playwright script for DOM inspection
├── Spreadsheet - list of employers 2 April 2026.xlsx   # Source data
├── package.json
└── .gitignore
```

### Architecture

The extension is a pure MV3 content script — no background service worker, no popup UI. It consists of:

1. **`manifest.json`** — Declares the content script injection targets, the `storage` permission, and scoped `web_accessible_resources` for the employer data file.

2. **`content/seek_flag.js`** — The entire runtime. Wrapped in an IIFE for scope isolation. On load, it:
   - Fetches `data/employers.json` via `chrome.runtime.getURL`.
   - Pre-computes sanitized employer names for efficient matching.
   - Scans the existing DOM and attaches a `MutationObserver` for dynamically loaded content (React re-renders on Seek, Drupal/Vue on Careers Vic).
   - Injects badge `<span>` elements next to employer names.
   - Injects filter toggle UI into the page's native sidebar (or as a floating panel).

3. **`content/styles.css`** — Handles badge styling and the CSS-driven hide/show logic using `:has()` pseudo-class selectors, which makes filtering immune to React's aggressive DOM reconciliation.

4. **`data/employers.json`** — A flat JSON array of `{ name, type }` objects generated from the source spreadsheet. This file is bundled with the extension and loaded at runtime.

### Updating the Employer Data

When the source spreadsheet is updated:

```bash
# Install dependencies (first time only)
npm install

# Regenerate employers.json from the xlsx file
node scripts/convert_data.js
```

The script reads the `Agency` and `Employer type` columns from the first sheet, deduplicates by agency name, and writes sorted JSON to `data/employers.json`.

After regenerating, reload the extension in `chrome://extensions/`.

### Fuzzy Matching Logic

The `fuzzyMatch` function in `seek_flag.js` uses a three-tier strategy:

1. **Exact match** — After stripping common suffixes (Pty Ltd, Inc, Limited, etc.) and lowercasing, check for string equality.
2. **Target contains source** — The website's employer name contains the spreadsheet name (e.g. the site shows "Department of Health - Victoria" and the spreadsheet has "Department of Health"). Requires the spreadsheet name to be longer than 5 characters to avoid false positives.
3. **Source contains target** — The spreadsheet name contains the website's employer name (e.g. the spreadsheet has "Agriculture Victoria Services Pty Ltd" and the site shows "Agriculture Victoria"). Requires the website name to be longer than 8 characters.

### CSS Hide Strategy

Filtering uses pure CSS via the `:has()` pseudo-class rather than JavaScript DOM manipulation. This approach was chosen because:

- **React immunity** — Seek's React app aggressively re-renders the DOM, which would strip any JavaScript-applied `display: none` overrides within milliseconds. CSS rules applied via the extension's stylesheet are not affected by React reconciliation.
- **Performance** — The browser's CSS engine handles show/hide natively without any JavaScript overhead.

The body element receives a class (e.g. `seek-classifier-only-sector`) and CSS rules like `body.seek-classifier-only-sector article:not(:has(.seek-employer-badge-sector))` hide non-matching cards.

### Security Considerations

- **No `innerHTML`** — All DOM writes use `textContent` and `className` to prevent XSS.
- **IIFE scope isolation** — No variables leak to the host page's `window` object.
- **`chrome.storage.local`** — Toggle state is stored in Chrome's sandboxed extension storage, not in the host website's `localStorage` (which would be readable/writable by the host site's scripts).
- **Scoped `web_accessible_resources`** — `employers.json` is only accessible to the declared origin patterns, preventing arbitrary websites from fingerprinting the extension.
- **Minimal permissions** — Only `storage` is requested. No `activeTab`, no `<all_urls>`, no network permissions.

### Testing

A basic Playwright script is included for inspecting Seek's DOM structure:

```bash
# Requires playwright to be installed
npx playwright install chromium
node scripts/test_seek.js
```

This launches a headless browser, navigates to a Seek search page, and logs the `data-automation` attributes found inside the first job card. Useful for debugging selector changes if Seek updates their markup.

---

## License

This project is for personal use. The employer data is sourced from publicly available Victorian Government publications.
