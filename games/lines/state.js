import { SIZE } from './core.js';

/** Saved-game format (stored by the hub as the game's session). Board is 81 digits, row by row (y, then x). */
export const STATE_VERSION = 1;

export function serialize(g) {
  let board = '';
  for (let y = 1; y <= SIZE; y++) {
    for (let x = 1; x <= SIZE; x++) {
      board += g.board[x][y];
    }
  }
  return {
    v: STATE_VERSION,
    seed: g.seed,
    board,
    freeCells: g.freeCells,
    balls: g.balls,
    score: g.score,
    next: g.next.slice(1),
    nextCount: g.nextCount,
    colour: g.colour,
    lastX: g.lastX,
    lastY: g.lastY,
    lineCount: g.lineCount,
    moves: g.moves,
  };
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Rebuilds a game from saved data, or returns null if the data is missing, malformed or inconsistent. */
export function deserialize(s) {
  try {
    if (!s || typeof s !== 'object' || s.v !== STATE_VERSION) {
      return null;
    }
    if (
      !isInt(s.seed, 0, 0xffffffff) ||
      typeof s.board !== 'string' ||
      !/^[0-7]{81}$/.test(s.board)
    ) {
      return null;
    }
    if (!isInt(s.score, 0, 0xffff) || !isInt(s.balls, 0, 1e9) || !isInt(s.moves, 0, 1e9)) {
      return null;
    }
    if (!isInt(s.nextCount, 0, 3) || !Array.isArray(s.next) || s.next.length !== 3) {
      return null;
    }
    if (
      !isInt(s.colour, 0, 7) ||
      !isInt(s.lastX, 0, SIZE) ||
      !isInt(s.lastY, 0, SIZE) ||
      !isInt(s.lineCount, 0, 4 * SIZE)
    ) {
      return null;
    }
    for (let i = 0; i < 3; i++) {
      if (!isInt(s.next[i], i < s.nextCount ? 1 : 0, 7)) {
        return null;
      }
    }
    const board = Array.from({ length: SIZE + 1 }, () => new Array(SIZE + 1).fill(0));
    let free = 0;
    for (let i = 0; i < 81; i++) {
      const c = Number(s.board[i]);
      board[(i % 9) + 1][Math.floor(i / 9) + 1] = c;
      if (c === 0) {
        free++;
      }
    }
    if (s.freeCells !== free) {
      return null;
    }
    return {
      seed: s.seed,
      board,
      freeCells: free,
      balls: s.balls,
      score: s.score,
      next: [0, ...s.next],
      nextCount: s.nextCount,
      colour: s.colour,
      lastX: s.lastX,
      lastY: s.lastY,
      lineCount: s.lineCount,
      moves: s.moves,
    };
  } catch {
    return null;
  }
}
