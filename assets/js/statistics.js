import { storage } from './storage.js';
import { profileManager } from './profile-manager.js';

const blank = () => ({ highScore: null, plays: 0, lastPlayed: null });
const isValid = (s) =>
  s &&
  typeof s === 'object' &&
  Number.isInteger(s.plays) &&
  s.plays >= 0 &&
  (s.highScore === null || Number.isFinite(s.highScore)) &&
  (s.lastPlayed === null || !Number.isNaN(Date.parse(s.lastPlayed)));
const keyFor = (gameId) => {
  const p = profileManager.current;
  return p ? storage.profileKey(p.id, gameId, 'stats') : null;
};

export const statistics = {
  get(gameId) {
    const key = keyFor(gameId);
    return key ? storage.get(key, blank(), isValid) : blank();
  },

  /** Records one finished session: increments plays, updates high score and last-played time. */
  record(gameId, score) {
    const key = keyFor(gameId);
    if (!key) {
      throw new Error('No active profile.');
    }
    const s = this.get(gameId);
    const n = Number(score);
    if (Number.isFinite(n) && (s.highScore === null || n > s.highScore)) {
      s.highScore = n;
    }
    s.plays += 1;
    s.lastPlayed = new Date().toISOString();
    storage.set(key, s);
    globalThis.dispatchEvent?.(new CustomEvent('hub:statschange', { detail: { gameId } }));
    return s;
  },

  /** `games` is the list of { id, name } from the registry (kept as a parameter so this module stays game-agnostic). */
  summary(games) {
    const rows = games.map((g) => ({ id: g.id, name: g.name, ...this.get(g.id) }));
    return { rows, totalPlays: rows.reduce((sum, r) => sum + r.plays, 0) };
  },
};
