import { storage } from './storage.js';
import { profileManager } from './profile-manager.js';
import { statistics } from './statistics.js';
import { settings } from './settings.js';

/**
 * Add a game by adding one entry here (plus a folder under /games and a service-worker precache entry).
 * `load` is a lazy dynamic import so games stay independent of each other and of the shell.
 */
const GAMES = [
  {
    id: 'lines',
    name: 'Lines',
    image: new URL('../img/games/lines.webp', import.meta.url).href,
    color: '#2ea8ff',
    description: 'Connect matching ends without crossing paths.',
    load: () => import('../../games/lines/index.js'),
  },
  {
    id: 'bus-jam',
    name: 'Bus Jam',
    image: new URL('../img/games/bus-jam.webp', import.meta.url).href,
    color: '#ff8a3d',
    description: 'Tap passengers to board matching buses without jamming the waiting line.',
    load: () => import('../../games/bus-jam/index.js'),
  },
];

export const gameRegistry = {
  list: () =>
    GAMES.map(({ id, name, image, color, description }) => ({
      id,
      name,
      image,
      color,
      description,
    })),
  get: (id) => GAMES.find((g) => g.id === id) ?? null,

  /** Loads a game module and checks it implements the lifecycle: { mount(container, ctx), unmount() }. */
  async load(id) {
    const entry = this.get(id);
    if (!entry) {
      throw new Error(`Unknown game "${id}".`);
    }
    const game = (await entry.load()).default;
    if (!game || typeof game.mount !== 'function' || typeof game.unmount !== 'function') {
      throw new Error(`Game "${id}" must default-export { mount(container, ctx), unmount() }.`);
    }
    return game;
  },
};

const profileKey = (gameId, kind) => {
  const p = profileManager.current;
  if (!p) {
    throw new Error('No active profile.');
  }
  return storage.profileKey(p.id, gameId, kind);
};
const isEnvelope = (e) => e && typeof e === 'object' && e.v === 1 && 'state' in e;

/** Per-profile, per-game session storage. */
export const sessions = {
  load(gameId) {
    return storage.get(profileKey(gameId, 'session'), null, isEnvelope)?.state ?? null;
  },
  has(gameId) {
    try {
      return this.load(gameId) !== null;
    } catch {
      return false;
    }
  },
  save(gameId, state) {
    const ok = storage.set(profileKey(gameId, 'session'), {
      v: 1,
      savedAt: new Date().toISOString(),
      state,
    });
    globalThis.dispatchEvent?.(new CustomEvent('hub:sessionchange'));
    return ok;
  },
  clear(gameId) {
    storage.remove(profileKey(gameId, 'session'));
    globalThis.dispatchEvent?.(new CustomEvent('hub:sessionchange'));
  },
};

/** Per-profile, per-game persistent progress (e.g. unlocked level and per-level bests), independent of active session. */
const progress = {
  load(gameId) {
    return storage.get(profileKey(gameId, 'progress'), null);
  },
  save(gameId, data) {
    return storage.set(profileKey(gameId, 'progress'), data);
  },
};

/** The only API a game receives. Games never touch storage or other games directly. */
export function createGameContext(gameId) {
  return Object.freeze({
    gameId,
    profile: Object.freeze({ ...profileManager.current }),
    loadSession: () => sessions.load(gameId),
    saveSession: (state) => sessions.save(gameId, state),
    clearSession: () => sessions.clear(gameId),
    loadProgress: () => progress.load(gameId),
    saveProgress: (data) => progress.save(gameId, data),
    /** Call when a run ends: records stats + high score and clears the saved session. */
    completeSession(score) {
      const stats = statistics.record(gameId, score);
      sessions.clear(gameId);
      return stats;
    },
    getStats: () => statistics.get(gameId),
    /** Device preferences: { sound, music, vibration, language, rating }. Read-only snapshot on each access. */
    get settings() {
      return settings.get();
    },
  });
}
