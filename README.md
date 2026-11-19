# Puzzle Hub (PWA)

A hub for independent puzzle games: profile, per-game session restore, high scores, statistics and offline support.
Vanilla HTML/CSS/ES modules. **No build step, no dependencies.**

## Run

ES modules and service workers need HTTP (not `file://`):

    cd puzzle-hub && python3 -m http.server 8080   # open http://localhost:8080

## Architecture

| File                            | Responsibility                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `assets/js/storage.js`          | Safe `localStorage` wrapper (versioned/namespaced keys, validation, corrupted-data recovery, in-memory fallback) |
| `assets/js/profile-manager.js`  | Single active profile: create (replaces + wipes all data), rename (keeps id), persist                            |
| `assets/js/statistics.js`       | Per-game plays, high score, last played; totals                                                                  |
| `assets/js/game-registry.js`    | Game list, lazy loading + lifecycle check, session storage, `createGameContext`                                  |
| `assets/js/router.js`           | Hash router with per-route cleanup                                                                               |
| `assets/js/settings.js`         | Device preferences (sound, music, vibration, language, rating)                                                   |
| `assets/js/icons.js`            | Inline SVG icon set                                                                                              |
| `assets/js/app.js`              | UI shell and views (home, game host, profile, statistics, settings)                                              |
| `assets/js/placeholder-game.js` | Gameplay-free module that exercises the hub API                                                                  |
| `pages/*.html`                  | View templates loaded by the router                                                                              |
| `games/<id>/`                   | One folder per game; nothing in shared code imports from here except the registry                                |

Shared modules contain no game-specific logic; the registry is the only place that names games.

### Storage layout (all keys prefixed `puzzlehub:v1:`)

    profile                             {id, name, createdAt}
    settings                            {theme}
    p:<profileId>:<gameId>:session      {v:1, savedAt, state}
    p:<profileId>:<gameId>:stats        {highScore, plays, lastPlayed}

Data is keyed by profile id, so renaming never loses progress. Creating a new profile deletes every `p:` key
(and the previous profile record) before writing the new one. To change the data format, bump `v1` and add a migration in `storage.js`.
Invalid or corrupted values are discarded and replaced by defaults.

## Included games

`lines` is a full implementation of Color Lines (see `games/lines/README.md`, with its tests), and `bus-jam` is a full implementation of Bus Jam (see `games/bus-jam/README.md`, with its tests).

## Adding a game

1. Create `games/<id>/index.js` with a default export:

       export default {
         mount(container, ctx) { /* render into container; restore with ctx.loadSession() */ },
         unmount() { /* remove listeners, timers, observers */ }
       };

2. Register it in `assets/js/game-registry.js` (`id`, `name`, `icon`, `description`, `load: () => import('../../games/<id>/index.js')`). `id` must not contain `:`.
3. Add its files to `PRECACHE` in `service-worker.js` and bump `CACHE_VERSION`.

### `ctx` API

| Member                                                        | Purpose                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.profile`                                                 | Read-only `{id, name, createdAt}`                                                                                                 |
| `ctx.loadSession()` / `saveSession(state)` / `clearSession()` | JSON-serializable state for this game and profile. Save on every meaningful change (there is no guaranteed unmount on tab close). |
| `ctx.completeSession(score)`                                  | Ends a run: updates plays, high score, last played; clears the saved session                                                      |
| `ctx.getStats()`                                              | `{highScore, plays, lastPlayed}`                                                                                                  |
| `ctx.settings`                                                | Read-only `{sound, music, vibration, language, rating}`                                                                           |

Games should scope CSS under `.game-host` and never read storage directly.

## UI/UX

"3D cartoon casual game" style, mobile-first (`assets/css/main.css`, tokens in `:root`):

- **Buttons and tiles:** chunky rounded shapes with a dark outline, an extruded "slab" underneath, a glossy highlight band and a specular dot, and a press-down animation (`:active` only, nothing relies on hover). Colours: blue (default), `primary` green, `accent` yellow, `danger` red, plus `purple`.
- **Lettering:** the bundled Lilita One font (`assets/fonts`, SIL OFL, see `OFL.txt`), outlined and extruded.
- **Panels, dialogs, HUD, footer tabs, leaderboard podium:** bubbly cream panels with thick outlines, purple glossy dialog title bars, glossy HUD pills, blue 3D footer tiles (the active tile grows and its icon pops out).
- **All artwork is high-resolution raster images, no SVG at runtime:** UI icons (`assets/icons/ui/*.webp`, 256px), animal avatars, glossy ball sprites for Lines, game pictures, logo, hero, sky background (`assets/img`), and the home-screen icons (PNG). `assets/js/icons.js` turns `data-icon="name"` into an `<img>`.
- The images are produced by `tools/assets/build.mjs` (illustrations drawn as vector source, rendered in Chromium to transparent WebP/PNG; needs Playwright and sharp). After changing assets run `python3 tools/assets/precache.py` to refresh the offline list in `service-worker.js` and bump `CACHE_VERSION`.
  Device preferences (sound, music, vibration, language, rating) live in `assets/js/settings.js` and are available to games as `ctx.settings`. The language choice is stored but UI text is not translated yet.

## Offline / PWA

`service-worker.js` precaches the shell and games, serves cache-first, and falls back to `index.html` for navigation.
Update flow: change files, bump `CACHE_VERSION`, reload twice. The manifest plus 192/512 icons enable installation on Android; `apple-touch-icon` (180px) and the `apple-mobile-web-app-*` meta tags cover iOS "Add to Home Screen".

## Manual verification checklist

1. Create a profile, refresh: the name persists.
2. Open Lines, make a move, refresh or switch to another view and back: the board is restored.
3. Finish a session: Statistics shows plays, high score (kept as the max), last played and total.
4. Rename: progress and stats remain.
5. Create a new profile and confirm: all sessions and stats are reset.
6. DevTools > Application > Offline: reload still works.
7. Set `localStorage['puzzlehub:v1:profile']='{bad'` and reload: the app recovers and asks for a profile.
