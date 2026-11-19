import { createRouter } from './router.js';
import { gameRegistry, createGameContext, sessions } from './game-registry.js';
import { profileManager, validateName } from './profile-manager.js';
import { statistics } from './statistics.js';
import { settings, LANGUAGES } from './settings.js';
import { icon, hydrate } from './icons.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const t0 = performance.now();

/* ---------- helpers ---------- */
const AVATARS = ['fox', 'panda', 'tiger', 'frog', 'unicorn', 'octopus', 'monkey', 'bunny'];
const AVATAR_BASE = new URL('../img/avatars/', import.meta.url).href;
const avatarFor = (name) =>
  AVATARS[[...String(name)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATARS.length];
const picture = (src, cls = 'pic') =>
  `<img class="${cls}" src="${src}" alt="" width="128" height="128" decoding="async" draggable="false">`;
const avatarImg = (name) => picture(`${AVATAR_BASE}${name}.webp`);
const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/** Generic dialog: resolves with the value of the pressed button ('cancel' for the X button or Escape). */
function showDialog({ title, message, actions }) {
  const d = $('#dialog');
  $('#dlg-title').textContent = title;
  $('#dlg-msg').textContent = message;
  $('#dlg-actions').replaceChildren(
    ...actions.map((a) => {
      const b = document.createElement('button');
      b.className = `btn ${a.variant ?? ''}`;
      b.value = a.value;
      if (a.icon) {
        b.innerHTML = icon(a.icon);
      }
      b.append(a.label);
      return b;
    })
  );
  d.returnValue = 'cancel';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue), { once: true });
    d.showModal();
  });
}
const confirmDialog = async (message) =>
  (await showDialog({
    title: 'Wait a moment!',
    message,
    actions: [
      { label: 'Cancel', value: 'cancel', icon: 'close' },
      { label: 'Yes, do it', value: 'ok', variant: 'primary', icon: 'check' },
    ],
  })) === 'ok';

const closeModal = () => (history.length > 1 ? history.back() : (location.hash = '#/'));

const pageCache = new Map();
async function loadPage(name) {
  if (!pageCache.has(name)) {
    const res = await fetch(`pages/${name}.html`);
    if (!res.ok) {
      throw new Error(`Could not load the ${name} page.`);
    }
    pageCache.set(name, await res.text());
  }
  view.innerHTML = pageCache.get(name); // static, same-origin markup shipped with the app
  hydrate(view);
}
const showMessage = (text) => {
  const p = document.createElement('p');
  p.className = 'notice';
  p.textContent = text;
  view.replaceChildren(p);
};

function chip(iconName, text) {
  const el = document.createElement('span');
  el.className = 'chip';
  el.innerHTML = `<i>${icon(iconName)}</i><span></span>`;
  el.lastElementChild.textContent = text;
  return el;
}

/* ---------- HUD ---------- */
function refreshHud() {
  const p = profileManager.current;
  $('#avatar .face').innerHTML = avatarImg(p ? avatarFor(p.name) : 'guest');
  $('#avatar .dot').hidden = !!p;
  const { rows, totalPlays } = statistics.summary(gameRegistry.list());
  const compact = (n) => (n < 10000 ? String(n) : `${(n / 1000).toFixed(n < 100000 ? 1 : 0)}k`); // keeps the header pills short
  $('#hud-score').textContent = compact(rows.reduce((sum, r) => sum + (r.highScore ?? 0), 0));
  $('#hud-plays').textContent = compact(totalPlays);
  $('#hud-saved').textContent = p
    ? gameRegistry.list().filter((g) => sessions.has(g.id)).length
    : 0;
}

/* ---------- views ---------- */
async function homeView() {
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const g of gameRegistry.list()) {
    const s = statistics.get(g.id);
    const resumable = sessions.has(g.id);
    const card = document.createElement('article');
    card.className = 'card game-card';
    card.style.setProperty('--tile', g.color);
    card.innerHTML =
      '<div class="tile"><span class="tag">Saved game</span><span class="icon" aria-hidden="true"></span></div><div class="body"><h2></h2><p class="muted desc"></p><div class="pills2"></div><a class="btn big"></a></div>';
    if (!resumable) {
      card.querySelector('.tag').remove();
    }
    card.querySelector('.icon').innerHTML = picture(g.image);
    card.querySelector('h2').textContent = g.name;
    card.querySelector('.desc').textContent = g.description;
    card
      .querySelector('.pills2')
      .append(chip('coin', s.highScore ?? '—'), chip('chevrons', s.plays));
    const a = card.querySelector('a');
    a.classList.add(resumable ? 'accent' : 'primary');
    a.href = `#/game/${encodeURIComponent(g.id)}`;
    a.innerHTML = `${icon('play')}<span></span>`;
    a.lastElementChild.textContent = resumable ? 'Resume' : 'Play';
    grid.append(card);
  }
  const banner = document.createElement('div');
  banner.className = 'banner purple';
  banner.innerHTML = `${icon('gamepad')}<span></span>`;
  banner.lastElementChild.textContent = `Hi ${profileManager.current.name}! Pick a game`;
  view.replaceChildren(banner, grid);
}

async function gameView({ id }) {
  const meta = gameRegistry.get(id);
  if (!meta) {
    return showMessage(`There is no game called "${id}". Go back to the games list.`);
  }
  view.innerHTML =
    '<section class="dlg"><header class="dlg-head"><h1></h1><a class="sq blue" href="#/" aria-label="Back to games" data-icon="home"></a></header><div class="dlg-body game-host" id="game-host">Loading…</div></section>';
  $('h1', view).textContent = meta.name;
  hydrate(view);
  const host = $('#game-host');
  let game;
  try {
    game = await gameRegistry.load(id);
    host.textContent = '';
    await game.mount(host, createGameContext(id));
  } catch (err) {
    console.error(err);
    host.textContent = `${meta.name} could not start: ${err.message}`;
    return;
  }
  return () => {
    try {
      game.unmount();
    } catch (err) {
      console.error(err);
    }
  };
}

async function profileView() {
  await loadPage('profile');
  const p = profileManager.current;
  $('#rename-form').hidden = !p;
  $('#create-warning').hidden = !p;
  $('#profile-avatar').innerHTML = avatarImg(p ? avatarFor(p.name) : 'guest');
  $('#create-title').textContent = p ? 'Start over with a new profile' : 'Create your profile';
  $('#create-submit').textContent = p ? 'Delete everything and create profile' : 'Create profile';
  $('#create-submit').classList.toggle('danger', !!p);
  $('#create-submit').classList.toggle('primary', !p);
  if (p) {
    $('#profile-summary').textContent = `Playing as ${p.name} since ${formatDate(p.createdAt)}.`;
    $('#rename-input').value = p.name;
  } else {
    $('#profile-summary').textContent =
      'Create a profile to start playing. It is stored on this device only.';
  }
  $('#rename-form').onsubmit = (e) => {
    e.preventDefault();
    try {
      profileManager.rename($('#rename-input').value);
      toast('Name saved! Your progress is safe.');
      profileView();
    } catch (err) {
      toast(err.message);
    }
  };
  $('#create-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const name = validateName($('#create-input').value);
      if (
        p &&
        !(await confirmDialog(
          `This permanently deletes ${p.name}'s saved games, high scores and stats, then creates "${name}". Continue?`
        ))
      ) {
        return;
      }
      profileManager.create(name);
      toast(`Profile "${name}" created.`);
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  };
}

/** Leaderboard: games ranked by the player's high score, with a podium for the top 3. */
async function statisticsView() {
  await loadPage('statistics');
  const p = profileManager.current;
  const { rows, totalPlays } = statistics.summary(gameRegistry.list());
  const ranked = [...rows].sort(
    (a, b) => (b.highScore ?? -1) - (a.highScore ?? -1) || b.plays - a.plays
  );

  $('#podium').replaceChildren(
    ...[1, 0, 2].map((i) => {
      const r = ranked[i];
      const el = document.createElement('div');
      el.className = `ped p${i + 1}${r ? '' : ' empty'}`;
      el.innerHTML =
        '<span class="pav"></span><span class="pnm"></span><span class="blk"><b></b></span>';
      if (r) {
        el.querySelector('.pav').innerHTML = picture(gameRegistry.get(r.id).image);
      } else {
        el.querySelector('.pav').textContent = '?';
      }
      el.querySelector('.pnm').textContent = r ? r.name : '—';
      el.querySelector('b').textContent = i + 1;
      return el;
    })
  );
  $('#lb-total').textContent = totalPlays;
  $('#me-avatar').innerHTML = avatarImg(avatarFor(p.name));
  $('#me-name').textContent = p.name;
  $('#me-since').textContent = `Playing since ${formatDate(p.createdAt)}`;
  $('#lb-rows').replaceChildren(
    ...ranked.map((r, i) => {
      const li = document.createElement('li');
      li.className = `row r${Math.min(i + 1, 4)}`;
      li.innerHTML =
        '<span class="medal"></span><span class="av"></span><span class="nm"><b></b><small></small></span><span class="sc"><span>Score</span><b></b></span>';
      li.querySelector('.medal').textContent = i + 1;
      li.querySelector('.av').innerHTML = picture(gameRegistry.get(r.id).image);
      li.querySelector('.nm b').textContent = r.name;
      const small = li.querySelector('small');
      small.innerHTML = `${icon('chest')}<span></span>`;
      small.lastElementChild.textContent = `${r.plays} played · ${formatDate(r.lastPlayed)}`;
      li.querySelector('.sc b').textContent = r.highScore ?? '—';
      return li;
    })
  );
}

async function settingsView() {
  await loadPage('settings');
  for (const [id, key] of [
    ['t-sound', 'sound'],
    ['t-music', 'music'],
    ['t-vibration', 'vibration'],
  ]) {
    const btn = $(`#${id}`);
    btn.setAttribute('aria-pressed', String(settings.get()[key]));
    btn.onclick = () => {
      const on = !settings.get()[key];
      settings.patch({ [key]: on });
      btn.setAttribute('aria-pressed', String(on));
    };
  }
  $('#privacy').onclick = () =>
    showDialog({
      title: 'Privacy Policy',
      message:
        'Puzzle Hub keeps your profile, saved games and scores only on this device. Nothing is sent anywhere.',
      actions: [{ label: 'Got it', value: 'ok', variant: 'primary', icon: 'check' }],
    });
  $('#withdraw').onclick = async () => {
    if (
      !(await confirmDialog(
        'Withdraw consent and delete the profile, saved games, scores and settings stored on this device? This cannot be undone.'
      ))
    ) {
      return;
    }
    profileManager.deleteAll();
    toast('All data deleted.');
    location.hash = '#/profile';
  };
}

async function languageView() {
  await loadPage('language');
  const list = $('#lang-list');
  const render = () => {
    const current = settings.get().language;
    list.replaceChildren(
      ...LANGUAGES.map((l) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn lang${l.code === current ? ' primary' : ''}`;
        b.setAttribute('aria-pressed', String(l.code === current));
        b.innerHTML = `<span class="flag">${l.flag}</span>`;
        b.append(l.name);
        b.onclick = () => {
          settings.patch({ language: l.code });
          render();
        };
        return b;
      })
    );
  };
  render();
}

async function rateView() {
  await loadPage('rate');
  let rating = settings.get().rating;
  const stars = [...view.querySelectorAll('.star')];
  const draw = () =>
    stars.forEach((b, i) => {
      b.classList.toggle('on', i < rating);
      b.setAttribute('aria-pressed', String(i < rating));
    });
  stars.forEach((b) => {
    b.onclick = () => {
      rating = Number(b.dataset.v);
      draw();
    };
  });
  draw();
  $('#rate-submit').onclick = () => {
    if (!rating) {
      return toast('Tap a star first!');
    }
    settings.patch({ rating });
    toast('Thanks for rating!');
    closeModal();
  };
}

/* ---------- boot ---------- */
const router = createRouter({
  routes: [
    { path: '', handler: homeView },
    { path: 'game/:id', handler: gameView },
    { path: 'statistics', handler: statisticsView },
    { path: 'profile', handler: profileView, public: true },
    { path: 'settings', handler: settingsView, public: true, modal: true },
    { path: 'language', handler: languageView, public: true, modal: true },
    { path: 'rate', handler: rateView, public: true, modal: true },
  ],
  fallback: { handler: () => showMessage('That page does not exist.'), public: true },
  guard: (route) => (route.public || profileManager.hasProfile() ? null : '#/profile'),
  onRoute: (first, route) => {
    document.body.classList.toggle('dim', !!route.modal);
    document.querySelectorAll('#nav a').forEach((a) => {
      if (a.dataset.route === first || (first === 'game' && a.dataset.route === '')) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
    refreshHud();
    view.focus({ preventScroll: true });
  },
  onError: (err) => showMessage(`Something went wrong: ${err.message}`),
});

['hub:profilechange', 'hub:statschange', 'hub:sessionchange'].forEach((evt) =>
  window.addEventListener(evt, refreshHud)
);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) {
    closeModal();
  }
});

async function boot() {
  const fill = $('#splash-fill');
  fill.style.width = '40%';
  hydrate(document);
  refreshHud();
  fill.style.width = '70%';
  await router.start();
  fill.style.width = '100%';
  await new Promise((r) => setTimeout(r, Math.max(250, 900 - (performance.now() - t0))));
  const splash = $('#splash');
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 450);
}
boot().catch((err) => {
  console.error(err);
  $('#splash-text').textContent = `Could not start: ${err.message}`;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('service-worker.js')
      .catch((e) => console.warn('SW registration failed:', e))
  );
}
