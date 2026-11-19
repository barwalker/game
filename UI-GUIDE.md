# Puzzle Hub: UI structure and asset replacement guide

For humans and AI agents who need to change how the interface looks (icons, images, colours, sizes) without breaking it.
Everything is plain HTML, CSS and ES modules: no build step, no dependencies, no external URLs. Keep it that way, because the app must work offline.

---

## 1. How the interface is built

One page (`index.html`) holds a fixed **shell**. Screens are swapped into `<main id="view">` by a hash router (`#/`, `#/game/lines`, `#/statistics`, `#/profile`, `#/settings`, `#/language`, `#/rate`).

| Layer                 | Element             | Defined in               | Filled by                                      |
| --------------------- | ------------------- | ------------------------ | ---------------------------------------------- |
| Loading screen        | `#splash`           | `index.html`, `main.css` | removed by `boot()` in `app.js`                |
| Header (HUD)          | `header.hud`        | `index.html`, `main.css` | `refreshHud()` in `app.js`                     |
| Screen                | `main#view`         | `index.html`             | views in `app.js`, templates in `pages/*.html` |
| Footer tabs           | `nav#nav.tabs`      | `index.html`, `main.css` | static links, `onRoute` sets `aria-current`    |
| Confirm / info dialog | `dialog#dialog.dlg` | `index.html`             | `showDialog()` in `app.js`                     |
| Toast                 | `#toast`            | `index.html`             | `toast()` in `app.js`                          |

Files: `assets/css/main.css` (all shell, component and page styles), `assets/css/game.css` (shared game-screen bits), `assets/js/icons.js` (all UI icons),
`assets/js/app.js` (views), `assets/js/game-registry.js` (game list, tile colours and icons), `pages/*.html` (screen templates), `games/<id>/` (each game; Lines has its own `lines.css`).

### Routes

| Route          | View function    | Template                | Look                                   |
| -------------- | ---------------- | ----------------------- | -------------------------------------- |
| `#/`           | `homeView`       | built in JS             | banner + grid of game cards            |
| `#/game/<id>`  | `gameView`       | built in JS             | purple dialog panel hosting the game   |
| `#/statistics` | `statisticsView` | `pages/statistics.html` | **Leaderboard** (podium + ranked rows) |
| `#/profile`    | `profileView`    | `pages/profile.html`    | purple dialog panel with forms         |
| `#/settings`   | `settingsView`   | `pages/settings.html`   | modal dialog over a dimmed screen      |
| `#/language`   | `languageView`   | `pages/language.html`   | modal dialog                           |
| `#/rate`       | `rateView`       | `pages/rate.html`       | modal dialog                           |

Routes marked `modal: true` in `app.js` add `body.dim` (dark scrim). Without a profile every non-public route redirects to `#/profile`.

---

## 2. Layout and positioning (phone portrait is the base; 390 x 844 shown)

```
+--------------------------------------+  <- viewport
| HUD  (sticky, top 0, z 10)           |  padding-top includes the notch inset
| [avatar][ coin ][ plays ][ saved ][gear]
|--------------------------------------|
| main#view  (scrolls; max-width 980px, centred, padding 1rem .9rem)
|                                      |
|   current screen                     |
|                                      |
|            [ toast ] (fixed, centred, above the tabs, z 30)
|                                      |  bottom padding = nav height + safe-area + 1rem
|======================================|
| TABS (fixed bottom, z 10, max-width 560px, centred)
| [cup][  house  Home  ][player][cog]  |  active tab is ~2x wide, its icon pops out above it
+--------------------------------------+
```

Stacking order (highest first):

| z-index   | Layer                             |
| --------- | --------------------------------- |
| top layer | native `<dialog>` (`showModal()`) |
| 100       | `#splash`                         |
| 30        | `#toast`                          |
| 12        | `main` while `body.dim`           |
| 11        | scrim `body.dim::after`           |
| 10        | `.hud` and `.tabs`                |
| -1        | cloud background `body::before`   |

Key sizes (CSS variables or fixed values in `main.css`): `--nav-h` 104px (reserved at the bottom of `main` and used to position the toast), content max width 980px, tabs max width 560px,
panels (`.dlg`) max width 520px, leaderboard (`.lb`) max width 560px, base font 18px, minimum touch target about 48px.
At >= 768px only paddings and a few widths change; the layout stays the same (tabs remain at the bottom).

---

## 3. Components

### Shell

| Component       | Selector                           | Position / size                                                                                  | Content                                                                                                  |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Avatar button   | `#avatar.avatar` (`.face`, `.dot`) | HUD left, 54 x 54, radius 16                                                                     | emoji from `AVATARS` in `app.js`; red `.dot` "!" top-right while there is no profile                     |
| Stat pills      | `.pills > .hp` x3                  | HUD middle, equal width, height 36; the 30px icon overhangs the left edge by 9px                 | `#hud-score` (sum of best scores), `#hud-plays`, `#hud-saved`; icons `coin`, `chevrons`, `card`          |
| Settings button | `a.sq.blue`                        | HUD right, 48 x 48                                                                               | icon `gear`                                                                                              |
| Footer tabs     | `nav.tabs > a[data-route]` x4      | tiles 60px high, 4px gap, on a darker base; inactive tiles equal width, active tile `flex: 2.05` | `.ti` icon (42px; 64px and raised 30px above the tile when active), `.tl` label (only shown when active) |
| Dialog          | `dialog#dialog.dlg`                | centred, width min(92vw, 420px)                                                                  | `.dlg-head` (title `#dlg-title`, red close `.sq`), `.dlg-body` (`#dlg-msg`, `#dlg-actions` buttons)      |
| Toast           | `#toast`                           | fixed, centred horizontally, just above the tabs                                                 | text only                                                                                                |
| Splash          | `#splash`                          | full screen, column: logo (top), hero (middle), progress bar (bottom)                            | `.logo` (three text spans), `.hero` (emoji), `.loadbar > #splash-fill`, `#splash-text`                   |

### Reusable pieces

| Piece              | Selector                                                                                   | Notes                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Button             | `.btn` (+ `.primary` green, `.accent` yellow, `.danger` red, `.purple`, `.big` full width) | min-height 58px (66px for `.big`), 3D bottom edge, white outlined text; an optional icon is placed before the text |
| Square icon button | `.sq` (+ colour class)                                                                     | 48 x 48 (`.tbtn` 60 x 60); its icon is 58% of the button                                                           |
| Banner             | `.banner`                                                                                  | centred pill-like heading (home screen)                                                                            |
| Flag tag           | `.tag`                                                                                     | red flag; on game cards it sits at `left: 0; top: .7rem` of the tile                                               |
| Panel / card       | `.card`, `.dlg` (`.dlg-head` + `.dlg-body`), `.well`                                       | cream panels with gold or purple trim                                                                              |
| Chip               | `.chip`                                                                                    | small capsule with an overhanging 30px icon (score, plays on game cards)                                           |
| Avatar tile        | `.av` (46px), `.av.big` (72px), `.pav` (52px, podium)                                      | square white tiles holding an emoji                                                                                |

### Screens

- **Home**: `.banner` (centred) then `.grid` (auto-fit columns, min 300px, gap 1.4rem). Each `.game-card` = `.tile` (118px high, coloured by `--tile`, optional `.tag`, centred 82px `.icon` tile) + `.body` (name, description, two `.chip`s, full-width `.btn.big`).
- **Leaderboard** (`.lb`, centred, max 560px): `.titlebar` (60px, alert icon + title) -> `.stage` (240px high purple curtain; `#podium` is absolutely positioned with three `.ped` columns, order 2nd / 1st / 3rd, each `.pav` + name + coloured block; `.strip` pill centred at the bottom shows total games) -> `.me` (player row) -> `ul.rows` of `.row.r1..r4` (medal, `.av`, name + small chest line, `.sc` score pill).
- **Profile**: `.dlg` panel; head title only; body = `.well.me` (big avatar + summary), rename form, create form.
- **Settings**: `.dlg.modal`; `.well.toggles` row of four 60px `.sq` buttons (sound, music, vibration, home), then four stacked `.btn`s, version text.
- **Language**: `.dlg`; `#lang-list` scrollable list (max-height 58vh) of `.btn.lang` rows with a flag emoji; the selected row is green.
- **Rate Us**: `.dlg`; `.promo` banner (120px), question text, `#stars` row of five 54px `.star` buttons, `.btn.big` Submit.
- **Game screen**: `.dlg` with head (game name, `.sq` home button at the right) and `.dlg-body.game-host` that the game renders into.
- **Lines inside the game host** (`games/lines/lines.css`): `.lines` column: `.lines-top` (score box left, New game button right) -> `.lines-stage` (square `.lines-board`, 9 x 9 grid, max 520px, 3px gaps; `.lines-over` overlay covers it at game over) -> `.lines-status` text line. Each cell is a button with a `.ball` that fills it with 11% inset.

---

## 4. Design tokens (change these first)

`assets/css/main.css`, top of the file:

- `:root`: `--ink`, `--muted`, `--cream`, `--cream-d`, `--cream-edge`, `--navy`, `--sky` (page gradient), `--nav-h`, `--radius`, `--font`, `--cloud` (background cloud image as a data URI).
- **Candy palette**: every `.btn`, `.sq`, `.banner`, `.titlebar`, `.dlg-head`, `.tag` reads three variables, `--cl` (light top), `--c` (base), `--cd` (dark edge and text outline). Colour classes `.blue .green .yellow .purple .red` (and `.btn.primary/.accent/.danger`) set them. Change colours there, not per element.
- Outlined text: one rule (`-webkit-text-stroke` + `paint-order`) in `main.css` around line 35 lists every element that gets the white-text-with-coloured-outline look.
- Game tile colours: `color` per game in `assets/js/game-registry.js` (used as `--tile` on the home card and the stats header).
- Lines ball colours: `--b1` / `--b2` per `.cell[data-c="1..7"]` in `games/lines/lines.css`.

---

## 5. Icon system

All UI icons are inline SVG strings in **`assets/js/icons.js`**, keyed by name. They are inserted two ways:

1. In HTML: add `data-icon="name"` to an element; `hydrate()` prepends the icon at startup, after each page load and in `gameView`.
2. In JS: `` `${icon('name')}` `` returns the `<svg>` markup string.

Two families, both on a 24 x 24 `viewBox`:

- **G (glyphs)**: white shapes drawn with `currentColor`; CSS sets `fill: #fff` and a coloured drop shadow. Used on buttons and square buttons.
- **S (stickers)**: full-colour artwork with explicit `fill` and `stroke`. Used in the HUD, tabs and chips.

| Name                            | Family | Used in (container, size)                                                                 |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `gear`                          | G      | HUD settings button (`.sq`, 58% of 48px)                                                  |
| `home`                          | G      | Settings home button, game-screen back button (`.sq`)                                     |
| `close`                         | G      | red close buttons in dialog heads (`.sq`), Cancel button                                  |
| `check`                         | G      | Save / Yes / Got it / Finish buttons (`.btn svg`, 1.35em)                                 |
| `plus`, `refresh`               | G      | Lines placeholder buttons (`.btn svg`)                                                    |
| `play`                          | G      | Play / Resume buttons on game cards                                                       |
| `gamepad`                       | G      | home banner, Settings "Rate Us" button                                                    |
| `sound`, `music`, `vibrate`     | G      | Settings toggles (`.tbtn`, red slash drawn by CSS when off)                               |
| `globe`                         | G      | Settings "Language" button                                                                |
| `coin`, `chevrons`, `card`      | S      | HUD pills (30px); `coin` and `chevrons` also on game-card chips and the leaderboard strip |
| `cup`, `house`, `player`, `cog` | S      | footer tabs (42px, 64px when active)                                                      |
| `chest`                         | S      | leaderboard rows, small line under the game name (16px)                                   |
| `star`                          | S      | Rate Us stars (54px; colour from `currentColor`: gold when `.on`, brown otherwise)        |
| `alert`                         | S      | Leaderboard title bar (30px)                                                              |

### Recipe A: redraw an existing icon (keeps everything else working)

1. Open `assets/js/icons.js`, find the key (for example `cup`).
2. Replace the string with new SVG child elements (no `<svg>` wrapper). Use `viewBox 0 0 24 24` coordinates and keep the artwork inside roughly 2..22 so shadows are not clipped.
3. G icons: use `fill="currentColor"` or `stroke="currentColor"`; no hard-coded colours (CSS colours them white). S icons: set explicit colours.
4. Keep the key name unchanged. Nothing else needs editing.

### Recipe B: use image files (SVG or PNG) instead of inline paths

1. Put files in a new folder, for example `assets/icons/ui/` (`cup.svg`, `coin.svg`, ...). Use square canvases (SVG, or PNG at 96 x 96 or larger). Transparent background.
2. In `icons.js`, add a map and change `icon()` so a mapped name returns an `<img>`:

   ```js
   const FILES = { cup: 'cup.svg', coin: 'coin.svg' }; // names that use image files
   const url = (f) => new URL(`../icons/ui/${f}`, import.meta.url).href;
   export const icon = (name) =>
     FILES[name]
       ? `<img src="${url(FILES[name])}" alt="" aria-hidden="true" draggable="false">`
       : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${G[name] ?? S[name] ?? ''}</svg>`;
   ```

3. Add image sizing to `main.css` (images do not inherit the svg rules; this block mirrors them):

   ```css
   .sq img {
     width: 58%;
     height: 58%;
     filter: drop-shadow(0 2px 0 var(--cd));
   }
   .btn img {
     width: 1.35em;
     height: 1.35em;
     flex: none;
   }
   .ti img,
   .ai img,
   .strip span img {
     width: 100%;
     height: 100%;
     display: block;
   }
   .hp > i img,
   .chip > i img {
     width: 100%;
     height: 100%;
     display: block;
   }
   .nm small img {
     display: inline-block;
     width: 16px;
     height: 16px;
     vertical-align: -3px;
     margin-right: 0.25rem;
   }
   .star img {
     width: 100%;
     height: 100%;
   }
   .star:not(.on) img {
     filter: grayscale(1) brightness(0.35);
   } /* off state for image stars */
   ```

   Glyph (G) icons that become images are no longer tinted white by CSS: supply white artwork, or pre-coloured artwork if the button colour allows.

4. Add every new file to `PRECACHE` in `service-worker.js` and bump `CACHE_VERSION` (section 8).

### Recipe C: add a new icon

Add a key to `G` or `S` in `icons.js` (or to `FILES`), then use `data-icon="newname"` in HTML or `icon('newname')` in JS. Unknown names render an empty `<svg>`, so check visually.

---

## 6. Images and picture-like assets (where each one lives)

| Asset                                            | Where                                                                   | How to replace   |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ---------------- |
| App icons (home screen / install)                | `assets/icons/icon-180.png`, `icon-192.png`, `icon-512.png`             | Recipe D         |
| Game tile icons (home, podium, leaderboard rows) | `icon` emoji per game in `assets/js/game-registry.js`                   | Recipe E         |
| Avatars (HUD, profile, leaderboard "me")         | `AVATARS` emoji array in `assets/js/app.js`                             | Recipe F         |
| Splash hero                                      | `<div class="hero">` in `index.html`                                    | Recipe G         |
| Rate Us picture                                  | `<div class="promo">` in `pages/rate.html`                              | same as Recipe G |
| Logo on the loading screen                       | `.logo` text spans in `index.html`, styles in `main.css`                | Recipe H         |
| Clouds / sky                                     | `--cloud` and `--sky` in `main.css` (`body::before`, `#splash::before`) | Recipe I         |
| Lines balls                                      | CSS gradients in `games/lines/lines.css`                                | Recipe J         |

### Recipe D: app icons

- Replace the three PNGs, **same file names and sizes** (180 x 180, 192 x 192, 512 x 512). `manifest.json` and `index.html` then need no change.
- Square, no transparency for `icon-180.png` (iOS). For 192 and 512 (declared `any maskable`) keep all important artwork inside the central 80% (a circle of 40% radius); the rest may be cropped by the OS.
- Bump `CACHE_VERSION` in `service-worker.js`. Installed copies may keep the old icon until reinstalled.

### Recipe E: game tile icons as images

1. Save `games/<id>/icon.png` (or `.svg`), at least 164 x 164 px, transparent.
2. In `game-registry.js`, add `image: 'games/lines/icon.png'` to the entry (keep `icon` as the fallback emoji).
3. In `app.js` add one helper and use it in the three places that currently do `textContent = ...icon` (home card `.icon`, podium `.pav`, leaderboard `.av`):

   ```js
   function setGameIcon(el, game) {
     if (game.image) {
       const img = document.createElement('img');
       img.src = game.image;
       img.alt = '';
       el.replaceChildren(img);
     } else el.textContent = game.icon;
   }
   ```

4. CSS: `.tile .icon img, .pav img, .av img { width: 100%; height: 100%; object-fit: contain; border-radius: inherit; }`
5. Add the file to `PRECACHE`, bump `CACHE_VERSION`.

### Recipe F: avatars as images

Change `avatarFor()` to return a file path (and the `AVATARS` array to paths), and replace the places that set `.face`, `#profile-avatar` and `#me-avatar` with a helper like `setGameIcon` above. Size the images 100% of `.avatar` (54px), `.av.big` (72px) and `.av` (46px).

### Recipe G: splash hero and Rate Us picture

Replace the emoji element with an image and give it the size the emoji font-size used to give:

```html
<img class="hero" src="assets/img/hero.png" alt="" aria-hidden="true" />
```

```css
.hero {
  width: clamp(6rem, 34vw, 10rem);
  height: auto;
} /* keep the existing bob animation */
.promo img {
  max-height: 100%;
}
```

The splash appears before JavaScript runs, so keep the hero small (< 100 KB) and precache it.

### Recipe H: logo as an image

Replace the `.logo` div in `index.html` with `<img class="logo-img" src="assets/img/logo.png" alt="Puzzle Hub">` and add `.logo-img { width: min(80vw, 420px); height: auto; }`. Remove the unused `.logo` rules if you like.

### Recipe I: clouds and sky

Put a cloud SVG in `assets/img/cloud.svg` and set `--cloud: url("../img/cloud.svg");` in `:root` (CSS URLs resolve relative to `main.css`). Positions and sizes are in the `body::before, #splash::before` rule (three clouds). Change the page colour in `--sky`.

### Recipe J: Lines balls as images

Save seven transparent PNGs/SVGs in `games/lines/img/ball-1.png` ... `ball-7.png` (square, 128 px or larger), then in `lines.css`:

```css
.lines .cell[data-c='1'] .ball {
  background: url('img/ball-1.png') center / contain no-repeat;
  box-shadow: none;
}
/* ... repeat for data-c 2 to 7 */
```

Colour order is red, green, blue, yellow, pink, cyan, brown (`COLOUR_NAMES` in `ui.js`, used for screen-reader labels; update it if the colours change). The select/pop/poof animations act on `.ball` and keep working. Precache the images.

---

## 7. Hooks the JavaScript depends on (do not rename)

IDs and attributes: `#view`, `#splash`, `#splash-fill`, `#splash-text`, `#avatar` (with `.face`, `.dot`), `#hud-score`, `#hud-plays`, `#hud-saved`, `#nav` and its `a[data-route]`, `#dialog`, `#dlg-title`, `#dlg-msg`, `#dlg-actions`, `#toast`, `[data-icon]`, `[data-close]`.
Page ids: `#profile-summary`, `#profile-avatar`, `#rename-form`, `#rename-input`, `#create-form`, `#create-input`, `#create-submit`, `#create-title`, `#create-warning`, `#podium`, `#lb-total`, `#lb-rows`, `#me-avatar`, `#me-name`, `#me-since`, `#t-sound`, `#t-music`, `#t-vibration`, `#privacy`, `#withdraw`, `#lang-list`, `#stars` (with `.star[data-v]`), `#rate-submit`.
Classes used by scripts: `.game-card`, `.tile`, `.icon`, `.tag`, `.chip`, `.pills2`, `.ped`, `.pav`, `.pnm`, `.blk`, `.row`, `.medal`, `.av`, `.nm`, `.sc`, `.game-host`, and in Lines `.lines-board`, `.cell[data-x][data-y][data-c]`, `.ball`, `.lines-score-value`, `.lines-over`, `.lines-final`, `.lines-new`, `.lines-again`, `.lines-status`.
You can restyle all of these freely; change names only together with the JS (and the Playwright test in `games/lines/tests/e2e.mjs`, which selects several of them).

---

## 8. Checklist for every UI change

1. Edit only the files named in the recipe. Use relative paths; no external URLs, fonts or CDNs (offline requirement).
2. New or renamed files that the app loads must be added to `PRECACHE` in `service-worker.js`. **Always bump `CACHE_VERSION`** (for example `puzzle-hub-v7` to `v8`), because the worker serves cached copies first.
3. Decorative images: `alt=""` and `aria-hidden="true"`. Icon-only buttons keep their `aria-label`.
4. Keep touch targets at least 44 to 48px and text contrast readable on the cream and teal backgrounds.
5. Do not touch game logic files (`games/lines/core.js`, `state.js`) for visual changes.
6. Verify: serve the folder (`python3 -m http.server 8080`, open `http://localhost:8080`), check at 390 px wide and at 1024 px, then run the tests if present:
   `node --test games/lines/tests/*.test.js` and `PLAYWRIGHT_PATH=<path> node games/lines/tests/e2e.mjs`.
7. After changing icons or caches, hard-refresh (or unregister the service worker in DevTools > Application) to avoid seeing stale files.

## 9. Quick lookup

| I want to change...                             | Go to                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a button colour                                 | `.blue .green .yellow .purple .red` and `.btn.primary/.accent/.danger` in `main.css`             |
| a toolbar or tab icon                           | `icons.js` (Recipe A or B)                                                                       |
| tab bar look (tile colour, gap, pop-out height) | `.tabs`, `.tabs a`, `.tabs a[aria-current="page"] .ti` in `main.css`                             |
| header pills                                    | `.hud`, `.pills`, `.hp` in `main.css`, markup in `index.html`                                    |
| a game's card colour / icon                     | `game-registry.js` (`color`, `icon`, `image`)                                                    |
| the install icon                                | Recipe D                                                                                         |
| the loading screen                              | `#splash`, `.logo`, `.hero`, `.loadbar` in `main.css`; markup in `index.html`                    |
| the Lines board / balls                         | `games/lines/lines.css` (Recipe J), markup in `games/lines/index.js` (`TEMPLATE`)                |
| leaderboard podium / rows                       | `.stage`, `.podium`, `.ped`, `.row` in `main.css`; building code in `statisticsView` in `app.js` |
