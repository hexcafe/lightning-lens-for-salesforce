# Lightning Lens for Salesforce

Lightning Lens is a lightweight Chrome extension that helps Salesforce developers inspect Lightning applications directly in the browser. It intercepts Aura API calls, provides convenient JSforce helpers, and offers a UI to run SOQL queries or edit records without leaving the page.

## Features

- **Aura request logging** – captures all Aura API calls with timing information and payload details.
- **Record editor** – read or update the current record using JSforce.
- **SOQL playground** – execute SOQL queries with autocompletion and result formatting.
- **LWC debug mode switch** – toggle the user's debug preferences without visiting Setup.
- **Floating companion modal** – access the tools via a draggable button that can dock to any side of the page.

## Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Start a development build:
   ```bash
   npm run dev
   ```
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode**, click **Load unpacked** and select the project directory.

The extension reloads automatically when files change.

To create a production build and packaged zip, run:
```bash
npm run build
```
The zip file is written to `release/`.

## Repository layout

- `src/background` – background service worker handling storage and JSforce calls.
- `src/content` – content script that injects the floating button and modal.
- `src/pages` – React components for the record editor, SOQL runner, request log and settings.
- `public/inject.js` – page‑scope script that wraps Apex calls to emit events.

## Development notes

This project uses [Vite](https://vitejs.dev/) with React, TypeScript and Tailwind CSS. Configuration lives in `vite.config.ts` and `tailwind.config.js`. The build process also bundles a zipped release using `vite-plugin-zip-pack`.

---

Lightning Lens is distributed under the terms of the [GNU General Public License version 3](LICENSE). See the license file for details.
