# LeLe Tab

A minimal, warm-toned new-tab dashboard extension for Chrome and Firefox.

[中文文档](README.zh.md)

---

## Features

| Module | Description |
|--------|-------------|
| **Search** | Web search with Google / Bing / DuckDuckGo / custom engine. Type `#keyword` to jump to an open tab; `!keyword` to open a bookmark. |
| **Calendar** | Monthly view with custom events. Supports Chinese solar terms, public holidays, and bazi day column. |
| **Weather** | Powered by [Open-Meteo](https://open-meteo.com/) — no API key required. Auto-locate or enter a city manually. Shows current conditions, hourly, and 7-day forecast. |
| **Todos** | Lightweight task list with grouping and drag-to-reorder. |
| **Bookmarks** | Tree-structured bookmarks with folder support. Import/export as standard Netscape HTML Bookmark Format. |
| **Tabs** | View, search, switch, close, and archive tabs across all windows. |
| **Quick Links** | Pinned frequent sites for one-click access. |

**Appearance**
- Light / Dark / System theme
- 7 font choices: System, PingFang, [LXGW WenKai](https://github.com/lxgw/LxgwWenKai), Inter, Noto Sans SC, Noto Serif SC, Roboto
- Font weight and scale controls
- Custom background image or color

**Layout**
- Each module card supports show/hide, drag-to-reorder, and three sizes: `1×1`, `2×1`, `2×2`

**Data & Sync**
- All data is stored locally in browser storage by default
- Optional Google Drive sync — uses only the `drive.file` scope (accesses files created by this extension only)
- Data files synced: `bookmarks.html`, `calendar.json`, `todos.json`, `settings.json`, `archived-tabs.json`

**Other**
- Manifest V3, dual manifest for Chrome and Firefox
- i18n: Simplified Chinese (`zh-CN`) and English (`en`)
- Zero telemetry — no analytics, no external data collection

---

## Tech Stack

- **Runtime**: React 19 + TypeScript 5
- **Build**: Vite 7
- **Icons**: Lucide React
- **Testing**: Vitest + Testing Library
- **Linting**: ESLint 9 + Prettier

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install dependencies

```bash
npm install
```

### Development preview

```bash
npm run dev
```

Opens a local dev server at `http://127.0.0.1:5173` for previewing UI. Full extension APIs (tabs, storage, etc.) require loading as an unpacked extension — see below.

### Build

```bash
# Chrome
npm run build:chrome

# Firefox
npm run build:firefox
```

Output directories: `dist/` (Chrome), `dist-firefox/` (Firefox).

---

## Load as Unpacked Extension

**Chrome / Edge**

1. Run `npm run build:chrome`
2. Open `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

**Firefox**

1. Run `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** → select `dist-firefox/manifest.json`

---

## Google Drive Sync Setup (Developer)

> End users only need to click "Connect Google Drive" in Settings — no technical steps required.

Drive sync is **disabled by default** and fully optional. To enable it in your own build, register OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/):

**Chrome**

1. APIs & Services → Credentials → **Create Credentials** → OAuth client ID
2. Application type: **Chrome App**
3. Application ID: your extension's ID (visible on `chrome://extensions` after loading)
4. Paste the generated `client_id` into `manifest.chrome.json` → `oauth2.client_id`

**Firefox**

1. Application type: **Web application**
2. Authorized redirect URIs: add `https://oauthredirect.extensions.mozilla.org/` and the value returned by `browser.identity.getRedirectURL('oauth2')` in your build
3. Paste the generated `client_id` into `src/lib/drive/driveClient.ts` → `FIREFOX_CLIENT_ID`

Without a Client ID, the extension works fully offline; only the Drive connection button will prompt you to contact the developer.

---

## Verification

```bash
npm run typecheck   # TypeScript type check
npm test            # Unit tests (Vitest)
npm run build:chrome  # Smoke-check the production build
```

---

## Project Structure

```
src/
├── background/     # Service worker (SW) — tab events, Drive auto-sync
├── lib/
│   ├── bookmarks/  # Netscape HTML bookmark parser / serializer
│   ├── calendar/   # Solar terms, holidays, bazi calculation
│   ├── drive/      # Google Drive API client
│   ├── weather/    # Open-Meteo API client
│   ├── storage/    # Typed browser storage wrapper
│   ├── browserApi  # Unified Chrome / Firefox API shim
│   ├── i18n        # zh-CN / en message catalogue
│   └── types       # Shared TypeScript types and default settings
├── newtab/         # New-tab page (React entry)
├── options/        # Extension options page (React entry)
├── styles/         # Global CSS
└── theme/          # Design tokens (CSS custom properties)
```

---

## Privacy

LeLe Tab collects no telemetry and uploads no user behavior data.

- All data is stored locally by default.
- Google Drive sync is opt-in. When enabled, the extension uses only the `drive.file` scope, which limits access to files it created. Files are stored under `/LeLe Tab/` on the user's own Drive.
- Weather requests are sent to Open-Meteo. If the user grants geolocation permission, coordinates are used only for the weather query and are not stored or reported by the extension.

---

## License

MIT
