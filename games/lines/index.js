import { createGame, move, isGameOver } from './core.js';
import { serialize, deserialize } from './state.js';
import { createBoardView } from './ui.js';

/**
 * Lines: the hub integration. Lifecycle: mount(container, ctx) / unmount().
 * Saved game: ctx.saveSession(serialize(game)) after every move (once at least one move was made), restored on mount.
 * A finished game (or a restarted one that has moves) is recorded with ctx.completeSession(score).
 */
const TEMPLATE = `
  <div class="lines">
    <div class="lines-top">
      <div class="lines-score"><span>Score</span><b class="lines-score-value">0</b></div>
      <button type="button" class="btn accent lines-new">New game</button>
    </div>
    <div class="lines-stage">
      <div class="lines-board" role="group" aria-label="Lines board, 9 by 9"></div>
      <div class="lines-over" hidden>
        <h2>Game over!</h2>
        <p>Final score <b class="lines-final">0</b></p>
        <button type="button" class="btn primary lines-again">Play again</button>
      </div>
    </div>
    <p class="lines-status" role="status" aria-live="polite"></p>
  </div>`;

const HINT = 'Click a ball, then an empty cell. Make lines of 5 or more!';
let dispose = null;

function loadStyles() {
  if (document.querySelector('link[data-lines-css]')) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./lines.css', import.meta.url).href;
  link.dataset.linesCss = '';
  document.head.append(link);
}

const randomSeed = () => crypto.getRandomValues(new window.Uint32Array(1))[0];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(container, ctx) {
  dispose?.();
  loadStyles();
  container.innerHTML = TEMPLATE;
  const $ = (sel) => container.querySelector(sel);
  const scoreEl = $('.lines-score-value'),
    statusEl = $('.lines-status'),
    overEl = $('.lines-over'),
    newBtn = $('.lines-new');

  let disposed = false,
    busy = false,
    over = false,
    selected = null,
    turnStart = performance.now(),
    confirmTimer = null;
  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const restore = () => {
    let saved = null;
    try {
      saved = ctx.loadSession();
    } catch (err) {
      console.warn('[lines] cannot read the saved game:', err);
    }
    if (saved === null || saved === undefined) {
      return null;
    }
    const restored = deserialize(saved);
    if (!restored || isGameOver(restored)) {
      // corrupted or already finished: discard it
      console.warn('[lines] discarding an invalid saved game');
      try {
        ctx.clearSession();
      } catch {
        /* ignore */
      }
      return null;
    }
    return restored;
  };

  let g = restore();
  const resumed = g !== null;
  g ??= createGame(randomSeed());

  const view = createBoardView($('.lines-board'), { onCell });
  const showScore = (bump = false) => {
    scoreEl.textContent = g.score;
    if (bump) {
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
    }
  };
  view.render(g);
  showScore();
  setStatus(resumed ? 'Welcome back! Your game was restored.' : HINT);

  const save = () => {
    try {
      ctx.saveSession(serialize(g));
    } catch (err) {
      console.error('[lines] cannot save:', err);
    }
  };

  function startNewGame() {
    clearTimeout(confirmTimer);
    newBtn.textContent = 'New game';
    g = createGame(randomSeed());
    over = false;
    selected = null;
    busy = false;
    overEl.hidden = true;
    try {
      ctx.clearSession();
    } catch {
      /* ignore */
    }
    view.clearSelection();
    view.render(g);
    showScore();
    setStatus(HINT);
    turnStart = performance.now();
  }

  async function onCell(x, y) {
    if (busy || over || disposed) {
      return;
    }
    if (g.board[x][y]) {
      // a ball: (re)select it
      selected = { x, y };
      view.select(x, y);
      setStatus('Now pick an empty cell to move it to.');
      return;
    }
    if (!selected) {
      setStatus('Pick a ball first.');
      return;
    }
    const colour = g.board[selected.x][selected.y];
    const thinkHundredths = Math.floor((performance.now() - turnStart) / 10);
    const ev = move(g, selected.x, selected.y, x, y, thinkHundredths);
    if (!ev) {
      view.shake(x, y);
      setStatus('The ball cannot get there. Try another cell.');
      return;
    }

    selected = null;
    view.clearSelection();
    busy = true;
    const finished = isGameOver(g);
    try {
      if (finished) {
        ctx.completeSession(g.score); // records the game in the hub and clears the saved game
      } else {
        save(); // saved before the animation, so a refresh during it is safe
      }
    } catch (err) {
      console.error('[lines] cannot record:', err);
    }

    if (!reducedMotion()) {
      await view.slide(ev.path, colour, Math.max(18, Math.min(45, 320 / ev.path.length)));
    }
    if (disposed) {
      return;
    }
    view.render(g);
    view.pop(ev.placed, g);
    view.poof(ev.cleared, g);
    showScore(ev.points > 0);
    if (ev.points > 0) {
      setStatus(`Line! +${ev.points}`);
    } else {
      setStatus(HINT);
    }

    if (finished) {
      over = true;
      $('.lines-final').textContent = g.score;
      overEl.hidden = false;
      setStatus(`Game over! Final score ${g.score}.`);
      $('.lines-again').focus();
    }
    turnStart = performance.now();
    busy = false;
  }

  newBtn.addEventListener('click', () => {
    if (busy) {
      return;
    }
    if (over || g.moves === 0) {
      startNewGame();
      return;
    }
    if (newBtn.dataset.confirm) {
      // second tap: the game so far is recorded, then a new one starts
      delete newBtn.dataset.confirm;
      try {
        ctx.completeSession(g.score);
      } catch (err) {
        console.error('[lines] cannot record:', err);
      }
      startNewGame();
      return;
    }
    newBtn.dataset.confirm = '1';
    newBtn.textContent = 'Tap again to restart';
    confirmTimer = setTimeout(() => {
      delete newBtn.dataset.confirm;
      newBtn.textContent = 'New game';
    }, 3000);
  });
  $('.lines-again').addEventListener('click', startNewGame);

  dispose = () => {
    disposed = true;
    clearTimeout(confirmTimer);
    view.destroy();
    container.replaceChildren();
    dispose = null;
  };
}

export default {
  mount,
  unmount() {
    dispose?.();
  },
};
