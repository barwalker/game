/**
 * Color Lines game logic: a faithful JavaScript port of the rules reverse-engineered from the original
 * LINES.EXE (Gamos, 1992) by rembish/color-lines-game (core/ln_core.c, BSD-3-Clause; see NOTICE).
 *
 * Pure and deterministic: no DOM, no storage, no clock. The game is a seed plus the moves; each move carries
 * the player's thinking time (in hundredths of a second), which the score depends on.
 *
 * Board coordinates are board[x][y] with x (column) and y (row) in 1..9, 0 = empty, 1..7 = ball colour.
 */
export const SIZE = 9;
export const COLOURS = 7;
export const START_FREE = 76; // a new game starts with five balls on the board

/** The original's random number generator (Turbo Pascal LCG), reproduced exactly. */
export function random(g, n) {
  g.seed = (Math.imul(g.seed, 0x08088405) + 1) >>> 0;
  return n ? (g.seed >>> 16) % n : 0;
}

const emptyBoard = () => Array.from({ length: SIZE + 1 }, () => new Array(SIZE + 1).fill(0));
const inBoard = (x, y) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= SIZE && y >= 1 && y <= SIZE;

/** Draws the colours of the next balls: min(free, 3) of them. */
function nextColours(g) {
  g.nextCount = Math.min(g.freeCells, 3);
  for (let i = 1; i <= g.nextCount; i++) {
    g.colour = random(g, COLOURS) + 1;
    g.next[i] = g.colour;
  }
}

/** Random(80) picks a start cell, then the next free cell is probed (so the last cell is only reached by probing). */
function freePosition(g) {
  let k = random(g, 80);
  for (;;) {
    g.lastX = (k % 9) + 1;
    g.lastY = Math.floor(k / 9) + 1;
    if (!g.board[g.lastX][g.lastY]) {
      return;
    }
    if (++k === 81) {
      k = 0;
    }
  }
}

function put(g, ev) {
  g.board[g.lastX][g.lastY] = g.colour;
  g.balls++;
  g.freeCells--;
  ev?.placed.push({ x: g.lastX, y: g.lastY, c: g.colour });
}

function placeNext(g, i, ev) {
  freePosition(g);
  g.colour = g.next[i];
  put(g, ev);
}

function placeRandom(g, ev) {
  freePosition(g);
  g.colour = random(g, COLOURS) + 1;
  put(g, ev);
}

/**
 * Removes every run of 5+ balls of colour g.colour along the row, column and both diagonals through (x, y).
 * lineCount is the total length of all runs: the centre cell is counted once per direction, so a cross of two
 * lines of five counts 10 (but is emptied once).
 */
function checkLines(g, x, y, ev) {
  const cx = [],
    cy = [];
  g.lineCount = 0;
  for (let d = 0; d < 4; d++) {
    const lx = [],
      ly = [],
      c = [];
    for (let k = 1; k <= SIZE; k++) {
      if (d === 0) {
        lx[k] = k;
        ly[k] = y;
      } // row
      else if (d === 1) {
        lx[k] = x;
        ly[k] = k;
      } // column
      else if (d === 2) {
        lx[k] = k;
        ly[k] = x + y - k;
      } // anti-diagonal
      else {
        lx[k] = k;
        ly[k] = k + (y - x);
      } // diagonal
      c[k] = ly[k] >= 1 && ly[k] <= SIZE ? g.board[lx[k]][ly[k]] : 0;
    }
    let run = 0;
    for (let k = 1; k <= SIZE + 1; k++) {
      if (k <= SIZE && c[k] === g.colour) {
        cx[g.lineCount + run] = lx[k];
        cy[g.lineCount + run] = ly[k];
        run++;
      } else {
        if (run > 4) {
          g.lineCount += run;
        }
        run = 0;
      }
    }
  }
  for (let i = 0; i < g.lineCount; i++) {
    const c = g.board[cx[i]][cy[i]];
    if (c) {
      g.board[cx[i]][cy[i]] = 0;
      g.freeCells++;
      ev?.cleared.push({ x: cx[i], y: cy[i], c });
    }
  }
}

/** Starts a game: draws the next colours, then places balls (clearing accidental lines) until five are on the board. */
export function createGame(seed) {
  const g = {
    seed: seed >>> 0,
    board: emptyBoard(),
    freeCells: SIZE * SIZE,
    balls: 0,
    score: 0,
    next: [0, 0, 0, 0],
    nextCount: 0,
    colour: 0,
    lastX: 0,
    lastY: 0,
    lineCount: 0,
    moves: 0, // not in the original: the number of moves made (used to decide whether a game is worth saving)
  };
  nextColours(g);
  do {
    placeRandom(g);
    checkLines(g, g.lastX, g.lastY);
  } while (g.freeCells !== START_FREE);
  return g;
}

export const isGameOver = (g) => g.freeCells === 0;

/**
 * Shortest path through empty cells (4-neighbours, tried up, down, left, right) from the ball at (fx, fy) to the
 * empty cell (tx, ty), as [{x, y}, ...] including both ends; null if there is none.
 */
export function findPath(g, fx, fy, tx, ty) {
  if (!inBoard(fx, fy) || !inBoard(tx, ty)) {
    return null;
  }
  if (!g.board[fx][fy] || g.board[tx][ty]) {
    return null;
  }
  const DX = [0, 0, -1, 1],
    DY = [-1, 1, 0, 0];
  const parent = new Map([[fx * 10 + fy, null]]);
  const queue = [[fx, fy]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d],
        ny = y + DY[d];
      if (!inBoard(nx, ny) || parent.has(nx * 10 + ny) || g.board[nx][ny]) {
        continue;
      }
      parent.set(nx * 10 + ny, x * 10 + y);
      if (nx === tx && ny === ty) {
        const path = [];
        for (let key = nx * 10 + ny; key !== null; key = parent.get(key)) {
          path.unshift({ x: Math.floor(key / 10), y: key % 10 });
        }
        return path;
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

export const isReachable = (g, fx, fy, tx, ty) => findPath(g, fx, fy, tx, ty) !== null;

const int16 = (v) => (v << 16) >> 16;

/**
 * Points for a line of `count` cells (count includes a crossing cell once per direction) when the move took
 * `hundredths` of a second to think over: Round(((count - 5)^2 + 5) * f), f = 2 - t / 6000 * 0.2, never below 0.
 * Computed exactly with integers (t in hundredths); see README for the one place this can differ from the original.
 */
export function points(count, hundredths) {
  const k = int16(int16((count - 5) * (count - 5)) + 5);
  const D = 6000000 - Math.max(0, Math.floor(hundredths)); // f = D / 3,000,000
  if (D <= 0) {
    return 0;
  }
  const num = 2 * k * D + 3000000; // Round(k * f) = floor((2 k D + 3e6) / 6e6)
  return (num - (num % 6000000)) / 6000000;
}

/**
 * Plays a move. Returns null (and changes nothing) unless the ball at (fx, fy) can reach the empty cell (tx, ty).
 * Otherwise returns { path, cleared, placed, points } describing what happened:
 *  - a line of 5+ is removed and scored, and no new balls arrive;
 *  - otherwise the next balls arrive (each possibly completing and clearing a line, without score).
 */
export function move(g, fx, fy, tx, ty, thinkHundredths = 0) {
  const path = findPath(g, fx, fy, tx, ty);
  if (!path) {
    return null;
  }
  const ev = { path, cleared: [], placed: [], points: 0 };
  g.colour = g.board[fx][fy];
  g.board[fx][fy] = 0;
  g.board[tx][ty] = g.colour;
  checkLines(g, tx, ty, ev);
  if (g.lineCount < 5) {
    const n = g.nextCount;
    for (let i = 1; i <= n; i++) {
      if (g.freeCells !== 0) {
        placeNext(g, i, ev);
      }
      checkLines(g, g.lastX, g.lastY, ev); // with a full board this re-checks the previous cell, as the original does
    }
    nextColours(g);
  } else {
    ev.points = points(g.lineCount, thinkHundredths);
    g.score = (g.score + ev.points) & 0xffff; // the score is a 16-bit word in the original
  }
  g.moves++;
  return ev;
}
