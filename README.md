# api-gateway

Order sync service — web console prototype.

A static web app (no build step) backed by Firebase: Auth (email/password), Cloud Firestore and the Realtime Database. It runs on GitHub Pages and can be installed as an app (PWA).

## Structure

```
index.html            markup + script tags
css/app.css           all styles (one section per skin: VS Code, Excel, Notion, terminal)
js/firebase.js        loads the Firebase SDK (ES module) and exposes its functions
js/config.js          Firebase web config (public by design; access is enforced by security rules)
js/core.js            helpers, app state, colours, presence helpers
js/render.js          rendering for each skin, tabs, window chrome
js/shell.js           unread counts & alerts, room tabs, terminal panel, input dialogs
js/accounts.js        quick-pick list, sign-in / sign-up
js/reader.js          book import (EPUB / MOBI / AZW3 / FB2 / HTML / TXT), pages, comments
js/reader-extras.js   reader settings, contents, find, comment list, follow mode, reading stats
js/notes-board.js     private notes & to-dos, per-room board
js/chat.js            message actions, mentions, mute, search, replies, images, invites, commands
js/menus.js           menu bar and dropdowns
js/data.js            Firestore / Realtime Database subscriptions
js/pwa.js             service worker registration, system notifications
js/main.js            start-up
sw.js                 service worker (offline app shell, notifications)
manifest.webmanifest  install metadata
tests/                Playwright tests + an in-memory fake of the Firebase SDK
```

The scripts are plain (non-module) scripts loaded with `defer`, in the order listed in `index.html`, and share one global scope. Each file starts with `'use strict'`.

## Run locally

```
npm install
npm start            # http://localhost:4173
```

## Tests

```
npm install
npx playwright install chromium   # first time only
npm test
```

The tests never touch the real Firebase project: every `https://www.gstatic.com/firebasejs/…` request is answered with `tests/fake-firebase.js`, an in-memory implementation of the parts of the SDK the app uses. Security rules are not simulated — check them in the Firebase console's rules playground.

| File | Covers |
|---|---|
| `tests/chat.spec.js` | sign-up / sign-in, sending, edit & recall, mentions, mute, search, "new" divider, skins, hide key |
| `tests/reader.spec.js` | EPUB / MOBI import, DRM refusal, contents, find, comments, reader settings, board, to-dos |
| `tests/mobile.spec.js` | phone layout (runs in a Pixel 7 viewport) |
