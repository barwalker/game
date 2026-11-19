/* Bus Jam - Puzzle Hub integration, game flow, animations, clock and session management. */
import { config } from './config.js';
import { canSeat } from './rules.js';
import { compute as computeScore, formatTime } from './score.js';
import { makeLevel } from './levels.js';
import { serialize, deserialize, serializeProgress, deserializeProgress } from './state.js';
import {
  makePassenger,
  revealPassenger,
  renderTunnel,
  renderBus,
  renderScore,
  clearScore,
} from './view.js';

const SLOTS = config.lineSlots;
const TIME = config.timing;
const UI = config.ui;
const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const cssSeconds = (ms) => `${ms / 1000}s`;

const TEMPLATE = `
  <div class="bus-jam">
    <div class="bj-board" data-bj="board">
      <div class="bj-panel bj-header">
        <div class="bj-controls">
          <button type="button" class="bj-btn bj-btn-blue" data-bj="prev">Prev</button>
          <div class="bj-level-wrap">
            <span class="bj-level" data-bj="level">Level 1</span>
            <span class="bj-level-best" data-bj="best"></span>
          </div>
          <button type="button" class="bj-btn bj-btn-green" data-bj="next">Next level</button>
          <button type="button" class="bj-btn bj-btn-orange" data-bj="retry">Retry</button>
        </div>
      </div>

      <div class="bj-road" data-bj="road"><div class="bj-current-bus" data-bj="current-bus"></div></div>

      <div class="bj-panel">
        <h3>Next buses<span class="bj-timer" data-bj="timer">\u23F1 0:00</span></h3>
        <div class="bj-next-buses" data-bj="next-buses"></div>
      </div>

      <div class="bj-panel">
        <h3>Waiting line</h3>
        <div class="bj-line" data-bj="line"></div>
      </div>

      <div class="bj-panel"><div class="bj-grid" data-bj="grid"></div></div>

      <p class="bj-status" data-bj="status" role="status" aria-live="polite"></p>

      <p class="bj-hint">? secret: revealed when a neighbour is tapped &middot; gold seats: reserved for hat passengers &middot; tunnels show who is inside, in the order they come out &middot; walls and barriers block the way</p>

      <div class="bj-overlay" data-bj="overlay" hidden>
        <div class="bj-panel bj-overlay-panel">
          <h2 data-bj="overlay-title"></h2>
          <div class="bj-overlay-score" data-bj="overlay-score"></div>
          <button type="button" class="bj-btn bj-btn-green" data-bj="overlay-button"></button>
        </div>
      </div>
    </div>
  </div>`;

let dispose = null;

function loadStyles() {
  const existing = document.querySelector('link[data-bus-jam-css]');
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./bus-jam.css', import.meta.url).href;
    link.dataset.busJamCss = '';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
}

async function mount(container, ctx) {
  dispose?.();
  let disposed = false;
  let onDispose = null;
  dispose = () => {
    disposed = true;
    onDispose?.();
    onDispose = null;
    container.replaceChildren();
    dispose = null;
  };

  await loadStyles();
  if (disposed) {
    return;
  }

  container.innerHTML = TEMPLATE;
  const $ = (name) => container.querySelector(`[data-bj="${name}"]`);
  const dom = {
    board: $('board'),
    grid: $('grid'),
    line: $('line'),
    road: $('road'),
    currentBus: $('current-bus'),
    nextBuses: $('next-buses'),
    level: $('level'),
    best: $('best'),
    timer: $('timer'),
    prev: $('prev'),
    next: $('next'),
    retry: $('retry'),
    status: $('status'),
    overlay: $('overlay'),
    title: $('overlay-title'),
    score: $('overlay-score'),
    overlayButton: $('overlay-button'),
  };

  const timers = new Set();
  const sleep = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  let levelNumber = 1;
  let tileSize = 52;
  let rows = 0;
  let cols = 0;
  let state = null;
  let runId = 0;

  const progress = deserializeProgress(ctx.loadProgress?.());
  const bestScores = progress.best;

  // ---- Level clock ------------------------------------------------------------------------------------------------
  let clock = { accumulated: 0, startedAt: 0, running: false, started: false };
  const now = () => performance.now();
  const elapsedSeconds = () =>
    (clock.accumulated + (clock.running ? now() - clock.startedAt : 0)) / 1000;
  const resetClock = () => {
    clock = { accumulated: 0, startedAt: 0, running: false, started: false };
  };
  const startClock = () => {
    clock = { accumulated: 0, startedAt: now(), running: true, started: true };
  };
  const pauseClock = () => {
    if (clock.running) {
      clock.accumulated += now() - clock.startedAt;
      clock.running = false;
    }
  };
  const resumeClock = () => {
    if (!disposed && clock.started && !clock.running && state && !state.over) {
      clock.startedAt = now();
      clock.running = true;
    }
  };

  const setStatus = (text) => {
    dom.status.textContent = text;
  };

  const updateHeaderMeta = () => {
    dom.level.textContent = `Level ${levelNumber}`;
    dom.prev.disabled = levelNumber <= 1;
    const lvlBest = bestScores[levelNumber];
    dom.best.textContent = lvlBest ? `Best: ${lvlBest}` : '';
  };

  const saveProgress = (nextLevel) => {
    try {
      ctx.saveProgress?.(serializeProgress(nextLevel, bestScores));
    } catch (err) {
      console.error('[bus-jam] cannot save progress:', err);
    }
  };

  const save = () => {
    if (!state || state.over || state.moves === 0) {
      return;
    }
    try {
      ctx.saveSession(
        serialize({
          levelNumber,
          moves: state.moves,
          elapsed: elapsedSeconds(),
          clockStarted: clock.started,
          busIndex: state.busIndex,
          bus: state.bus,
          line: state.line,
          tunnels: state.tunnels,
          passengers: state.passengers,
        })
      );
    } catch (err) {
      console.error('[bus-jam] cannot save session:', err);
    }
  };

  // ---- Layout: tile size, bus scale, and passenger positioning ----------------------------------------------------
  const currentBusScale = (bus) => {
    const roadW = dom.road.clientWidth;
    if (!roadW || !bus) {
      return 1;
    }
    const busW = (bus.seats / 2) * 38 + 10 + 98;
    return Math.min(1, (roadW - 14) / busW);
  };

  const renderCurrentBus = () => {
    if (!state || !state.bus) {
      dom.currentBus.innerHTML = '';
      return;
    }
    dom.currentBus.innerHTML = renderBus(state.bus, currentBusScale(state.bus));
  };

  const renderNextBuses = () => {
    if (!state) {
      return;
    }
    dom.nextBuses.innerHTML =
      state.queue
        .slice(0, 4)
        .map((next) => renderBus(next, 0.34))
        .join('') || '<span>Last bus!</span>';
  };

  const createPassengerElement = (p) =>
    makePassenger(dom.board, p, tileSize, () => tapPassenger(p));

  function boardOrigin() {
    const box = dom.board.getBoundingClientRect();
    return [box.left + dom.board.clientLeft, box.top + dom.board.clientTop];
  }

  function placePassenger(p) {
    if (!p.el) {
      return;
    }
    const [originX, originY] = boardOrigin();
    const size = tileSize * UI.paxScale;
    let x, y;
    if (p.at.kind === 'grid') {
      const grid = dom.grid.getBoundingClientRect();
      x = grid.left - originX + p.at.col * tileSize + (tileSize - size) / 2;
      y = grid.top - originY + p.at.row * tileSize + (tileSize - size) / 2;
    } else if (p.at.kind === 'line') {
      const slot = state.slots[p.at.slot].getBoundingClientRect();
      x = slot.left - originX + (slot.width - size) / 2;
      y = slot.top - originY + (slot.height - size) / 2;
    } else {
      return;
    }
    p.el.style.transform = `translate(${x}px,${y}px)`;
  }

  function fitBoard() {
    if (!state || disposed) {
      return;
    }
    const available = dom.board.clientWidth - UI.sidePadding;
    if (available <= 0) {
      return;
    }
    const forGrid = Math.floor(available / cols);
    const forLine = Math.floor((available - UI.slotGaps) / (SLOTS * UI.slotScale));
    tileSize = Math.max(UI.minCell, Math.min(UI.maxCell, forGrid, forLine));
    dom.board.style.setProperty('--cell', `${tileSize}px`);

    const wrap = dom.currentBus.querySelector('.bj-bus-wrap');
    if (wrap && state.bus) {
      wrap.style.setProperty('--bus-scale', String(currentBusScale(state.bus)));
    }

    state.passengers.forEach((p) => {
      if (p.done || !p.el || (p.at.kind !== 'grid' && p.at.kind !== 'line')) {
        return;
      }
      p.el.style.width = p.el.style.height = `${tileSize * UI.paxScale}px`;
      p.el.style.transition = 'none';
      placePassenger(p);
    });
  }

  // ---- Walking: shortest path to the exit row ---------------------------------------------------------------------
  function findPath(startRow, startCol) {
    const queue = [[startRow, startCol, []]];
    const seen = new Set([startRow * 100 + startCol]);
    while (queue.length) {
      const [row, col, trail] = queue.shift();
      if (row === 0) {
        return [...trail, [row, col]];
      }
      for (const [dRow, dCol] of [
        [-1, 0],
        [0, -1],
        [0, 1],
        [1, 0],
      ]) {
        const r = row + dRow,
          c = col + dCol;
        if (r < 0 || c < 0 || r >= rows || c >= cols || state.grid[r][c] || seen.has(r * 100 + c)) {
          continue;
        }
        seen.add(r * 100 + c);
        queue.push([r, c, [...trail, [row, col]]]);
      }
    }
    return null;
  }

  const shake = (p) =>
    p.el?.animate(
      [{ rotate: '0deg' }, { rotate: '-14deg' }, { rotate: '14deg' }, { rotate: '0deg' }],
      TIME.shakeMs
    );

  function releaseFromTunnels() {
    state.tunnels.forEach((tunnel) => {
      if (state.grid[tunnel.mouthRow][tunnel.mouthCol] || !tunnel.queue.length) {
        return;
      }
      const p = tunnel.queue.shift();
      createPassengerElement(p);

      p.at = { kind: 'grid', row: tunnel.row, col: tunnel.col };
      p.el.style.transition = 'none';
      placePassenger(p);
      void p.el.offsetWidth;

      p.at = { kind: 'grid', row: tunnel.mouthRow, col: tunnel.mouthCol };
      state.grid[tunnel.mouthRow][tunnel.mouthCol] = p;
      p.el.style.transition = `transform ${cssSeconds(TIME.spawnMs)} ease`;
      placePassenger(p);
      renderTunnel(tunnel);
    });
  }

  // ---- Building DOM for a level -----------------------------------------------------------------------------------
  function buildGrid(level) {
    dom.grid.innerHTML = '';
    dom.grid.style.gridTemplateColumns = `repeat(${cols},var(--cell))`;
    const tiles = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const number = row * cols + col;
        const isWall = level.walls.has(number);
        const barrier = level.barriers.get(number);

        const tile = document.createElement('div');
        tile.className = `bj-cell${barrier ? ` barrier ${barrier}` : isWall ? ' wall' : ''}`;
        if (isWall) {
          state.grid[row][col] = 'W';
        }
        tiles.push(tile);
        dom.grid.append(tile);
      }
    }
    return tiles;
  }

  function buildLine() {
    dom.line.innerHTML = '';
    for (let i = 0; i < SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'bj-slot';
      dom.line.append(slot);
      state.slots.push(slot);
    }
  }

  function startLevel(n) {
    runId++;
    levelNumber = Math.max(1, n | 0);
    resetClock();
    dom.board.querySelectorAll('.bj-passenger').forEach((el) => el.remove());
    dom.overlay.hidden = true;

    const level = makeLevel(levelNumber);
    rows = level.rows;
    cols = level.cols;
    state = {
      grid: Array.from({ length: rows }, () => Array(cols).fill(null)),
      line: Array(SLOTS).fill(null),
      slots: [],
      passengers: [],
      tunnels: [],
      queue: level.buses.slice(),
      busIndex: -1,
      total: level.passengers.length,
      bus: null,
      walking: 0,
      inPlay: 0,
      moves: 0,
      over: false,
    };

    const tiles = buildGrid(level);
    level.tunnels.forEach((tunnel) => {
      const tile = tiles[tunnel.row * cols + tunnel.col];
      tile.className = 'bj-cell tunnel';
      state.grid[tunnel.row][tunnel.col] = 'W';
      state.tunnels.push({ ...tunnel, cell: tile });
    });
    buildLine();

    level.passengers.forEach((source, index) => {
      const inTunnel = source.tunnel !== null && source.tunnel !== undefined;
      const p = {
        ...source,
        index,
        done: false,
        moving: false,
        at: inTunnel ? { kind: 'tunnel' } : { kind: 'grid', row: source.row, col: source.col },
      };
      state.passengers.push(p);
      if (!inTunnel) {
        createPassengerElement(p);
        state.grid[p.at.row][p.at.col] = p;
      }
    });
    state.tunnels.forEach((tunnel) => {
      tunnel.queue = tunnel.queue.map((idx) => state.passengers[idx]);
      renderTunnel(tunnel);
    });

    updateHeaderMeta();
    dom.currentBus.innerHTML = '';
    dom.currentBus.style.transform = '';
    fitBoard();
    releaseFromTunnels();
    setStatus('Tap passengers to board matching buses!');
    busArrives();
  }

  function restoreFromSaved(saved) {
    runId++;
    levelNumber = saved.levelNumber;
    const level = saved.level;
    rows = level.rows;
    cols = level.cols;

    clock = {
      accumulated: saved.elapsed * 1000,
      startedAt: 0,
      running: false,
      started: saved.clockStarted,
    };

    dom.board.querySelectorAll('.bj-passenger').forEach((el) => el.remove());
    dom.overlay.hidden = true;

    state = {
      grid: Array.from({ length: rows }, () => Array(cols).fill(null)),
      line: saved.line,
      slots: [],
      passengers: saved.passengers,
      tunnels: [],
      queue: saved.queue,
      busIndex: saved.busIndex,
      total: saved.passengers.length,
      bus: saved.bus,
      walking: 0,
      inPlay: saved.line.filter(Boolean).length,
      moves: saved.moves,
      over: false,
    };

    const tiles = buildGrid(level);
    saved.tunnels.forEach((tunnel) => {
      const tile = tiles[tunnel.row * cols + tunnel.col];
      tile.className = 'bj-cell tunnel';
      state.grid[tunnel.row][tunnel.col] = 'W';
      const tObj = { ...tunnel, cell: tile };
      state.tunnels.push(tObj);
      renderTunnel(tObj);
    });
    buildLine();

    state.passengers.forEach((p) => {
      if (p.at.kind === 'grid') {
        state.grid[p.at.row][p.at.col] = p;
        createPassengerElement(p);
      } else if (p.at.kind === 'line') {
        createPassengerElement(p);
      }
    });

    updateHeaderMeta();
    dom.currentBus.style.transform = '';
    renderCurrentBus();
    renderNextBuses();
    fitBoard();
    setStatus('Welcome back! Your game was restored.');

    if (state.bus.shown === state.bus.seats) {
      busDeparts();
    } else if (!state.bus.ready) {
      animateBusIn(state.bus);
    } else {
      if (clock.started) {
        resumeClock();
      }
      checkForLoss();
    }
  }

  // ---- Tapping a passenger ----------------------------------------------------------------------------------------
  const claimSeat = (bus, p) => {
    bus.taken++;
    if (bus.reserved && p.hat) {
      bus.takenReserved++;
    }
  };

  function revealSecretsAround(p) {
    for (const [dRow, dCol] of NEIGHBOURS) {
      const near = state.grid[p.at.row + dRow]?.[p.at.col + dCol];
      if (near && near.secret) {
        revealPassenger(near, tileSize);
      }
    }
    revealPassenger(p, tileSize);
  }

  async function tapPassenger(p) {
    if (disposed || state.over || p.moving || p.at.kind !== 'grid' || !state.bus) {
      return;
    }
    const run = runId;

    const path = state.inPlay < SLOTS && findPath(p.at.row, p.at.col);
    if (!path) {
      return shake(p);
    }

    state.moves++;
    state.inPlay++;
    state.walking++;
    p.moving = true;
    revealSecretsAround(p);
    state.grid[p.at.row][p.at.col] = null;
    releaseFromTunnels();

    // Mark in-transit and persist immediately so a refresh mid-walk never loses the passenger.
    p.at = { kind: 'transit' };
    save();

    p.el.style.transition = `transform ${cssSeconds(TIME.stepMs)} linear`;
    for (const [row, col] of path.slice(1)) {
      p.at = { kind: 'grid', row, col };
      placePassenger(p);
      await sleep(TIME.stepMs);
      if (disposed || run !== runId) {
        return;
      }
    }
    state.walking--;
    p.moving = false;

    const bus = state.bus;
    if (bus && bus.ready && canSeat(bus, p, bus.taken, bus.takenReserved)) {
      claimSeat(bus, p);
      p.at = { kind: 'bus' };
      save();
      return boardBus(p);
    }
    const slot = state.line.indexOf(null);
    state.line[slot] = p;
    p.at = { kind: 'line', slot };
    save();
    p.el.style.transition = `transform ${cssSeconds(TIME.toLineMs)} ease`;
    placePassenger(p);
    await sleep(TIME.toLineMs);
    if (disposed || run !== runId) {
      return;
    }
    checkForLoss();
  }

  // ---- Buses ------------------------------------------------------------------------------------------------------
  async function boardBus(p) {
    const bus = state.bus,
      run = runId;
    const [originX, originY] = boardOrigin();
    const busBox = (
      dom.currentBus.querySelector('.bj-bus-wrap') || dom.currentBus
    ).getBoundingClientRect();
    const size = tileSize * UI.paxScale;

    if (p.at.kind === 'line') {
      state.line[p.at.slot] = null;
    }
    p.at = { kind: 'bus' };
    state.inPlay--;
    save();

    p.el.style.transition = `transform ${cssSeconds(TIME.boardMs)} ease-in,opacity ${cssSeconds(TIME.boardMs)}`;
    p.el.style.opacity = '0.2';
    p.el.style.transform = `translate(${busBox.left - originX + busBox.width / 2 - size / 2}px,${busBox.top - originY + busBox.height / 2 - size / 2}px) scale(.4)`;
    await sleep(TIME.boardMs);
    if (disposed || run !== runId) {
      return;
    }

    p.el.remove();
    p.done = true;
    bus.shown++;
    if (bus.reserved && p.hat) {
      bus.shownReserved++;
    } else {
      bus.shownNormal++;
    }
    renderCurrentBus();
    save();
    if (bus.shown === bus.seats) {
      busDeparts();
    } else {
      checkForLoss();
    }
  }

  async function animateBusIn(bus) {
    const run = runId;
    renderCurrentBus();
    renderNextBuses();

    dom.currentBus.style.transition = 'none';
    dom.currentBus.style.transform = 'translateX(-130%)';
    void dom.currentBus.offsetWidth;
    dom.currentBus.style.transition = `transform ${cssSeconds(TIME.busInMs)} cubic-bezier(.2,.9,.2,1)`;
    dom.currentBus.style.transform = 'none';
    await sleep(TIME.busInWaitMs);
    if (disposed || run !== runId) {
      return;
    }

    bus.ready = true;
    if (!clock.started) {
      startClock();
    } else {
      resumeClock();
    }
    save();

    for (const p of state.line.filter(Boolean)) {
      if (!canSeat(bus, p, bus.taken, bus.takenReserved)) {
        continue;
      }
      claimSeat(bus, p);
      boardBus(p);
      await sleep(TIME.pullGapMs);
      if (disposed || run !== runId) {
        return;
      }
    }
    checkForLoss();
  }

  function busArrives() {
    const bus = state.queue.shift();
    state.busIndex++;
    if (!bus) {
      state.bus = null;
      dom.currentBus.innerHTML = '';
      dom.nextBuses.innerHTML = '';
      return finishLevel(true);
    }
    state.bus = bus;
    save();
    animateBusIn(bus);
  }

  async function busDeparts() {
    const run = runId;
    state.bus.ready = false;
    await sleep(TIME.departWaitMs);
    if (disposed || run !== runId) {
      return;
    }

    dom.currentBus.style.transition = `transform ${cssSeconds(TIME.busOutMs)} ease-in`;
    dom.currentBus.style.transform = 'translateX(130%)';
    await sleep(TIME.busOutWaitMs);
    if (disposed || run !== runId) {
      return;
    }
    busArrives();
  }

  // ---- Ending a level ---------------------------------------------------------------------------------------------
  function checkForLoss() {
    const bus = state.bus;
    if (disposed || state.over || !bus || !bus.ready || state.walking || bus.taken !== bus.shown) {
      return;
    }
    const someoneCanMove = state.passengers.some(
      (p) => !p.done && !p.moving && p.at.kind === 'grid' && findPath(p.at.row, p.at.col)
    );
    if (state.inPlay >= SLOTS || !someoneCanMove) {
      finishLevel(false);
    }
  }

  function finishLevel(win) {
    state.over = true;
    pauseClock();

    if (win) {
      const score = computeScore(state.total, clock.accumulated / 1000);
      const isNewBest = score.total > (bestScores[levelNumber] || 0);
      if (isNewBest) {
        bestScores[levelNumber] = score.total;
      }
      saveProgress(levelNumber + 1);
      try {
        ctx.completeSession(score.total);
      } catch (err) {
        console.error('[bus-jam] cannot record session:', err);
      }
      renderScore(dom.score, score, bestScores[levelNumber], isNewBest);
      setStatus(`Level ${levelNumber} cleared! Score ${score.total}.`);
    } else {
      try {
        ctx.clearSession();
      } catch {
        /* ignore */
      }
      clearScore(dom.score);
      setStatus('The line is jammed! Try again.');
    }

    dom.title.textContent = win ? 'Level cleared!' : 'The line is jammed!';
    dom.overlayButton.textContent = win ? 'Next level' : 'Try again';
    dom.overlayButton.onclick = () => startLevel(win ? levelNumber + 1 : levelNumber);
    dom.overlay.hidden = false;
    dom.overlayButton.focus();
  }

  // ---- Controls & lifecycle ---------------------------------------------------------------------------------------
  dom.prev.onclick = () => {
    if (levelNumber <= 1) {
      return;
    }
    try {
      ctx.clearSession();
    } catch {
      /* ignore */
    }
    saveProgress(levelNumber - 1);
    startLevel(levelNumber - 1);
  };
  dom.next.onclick = () => {
    try {
      ctx.clearSession();
    } catch {
      /* ignore */
    }
    saveProgress(levelNumber + 1);
    startLevel(levelNumber + 1);
  };
  dom.retry.onclick = () => {
    try {
      ctx.clearSession();
    } catch {
      /* ignore */
    }
    startLevel(levelNumber);
  };

  const onResize = () => fitBoard();
  const onVisibility = () => (document.hidden ? pauseClock() : resumeClock());
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  ro?.observe(dom.board);

  const timerId = setInterval(() => {
    dom.timer.textContent = `\u23F1 ${formatTime(elapsedSeconds())}`;
  }, 250);

  // Restore saved session if valid, otherwise start at saved level progress.
  let restored = null;
  try {
    const raw = ctx.loadSession();
    if (raw !== null && raw !== undefined) {
      restored = deserialize(raw, makeLevel);
      if (!restored) {
        console.warn('[bus-jam] discarding invalid saved session');
        ctx.clearSession();
      }
    }
  } catch (err) {
    console.warn('[bus-jam] cannot read saved session:', err);
  }

  if (restored) {
    restoreFromSaved(restored);
  } else {
    startLevel(progress.level);
  }

  onDispose = () => {
    runId++;
    if (state && !state.over && state.moves > 0) {
      pauseClock();
      save();
    }
    clearInterval(timerId);
    timers.forEach(clearTimeout);
    timers.clear();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    ro?.disconnect();
  };
}

export default {
  mount,
  unmount() {
    dispose?.();
  },
};
