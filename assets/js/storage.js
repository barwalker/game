/**
 * Versioned, namespaced localStorage wrapper.
 *   puzzlehub:v1:profile                         -> active profile
 *   puzzlehub:v1:settings                        -> app settings
 *   puzzlehub:v1:p:<profileId>:<gameId>:session  -> saved session
 *   puzzlehub:v1:p:<profileId>:<gameId>:stats    -> per-game stats
 * Falls back to in-memory storage if localStorage is unavailable (e.g. private mode).
 */
const PREFIX = 'puzzlehub:v1:';

function createBackend() {
  try {
    const probe = `${PREFIX}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => void m.set(k, String(v)),
      removeItem: (k) => void m.delete(k),
      key: (i) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  }
}
const backend = createBackend();

export const storage = {
  key: (...parts) => PREFIX + parts.join(':'),
  profileKey: (profileId, gameId, kind) => PREFIX + ['p', profileId, gameId, kind].join(':'),
  profileDataPrefix: `${PREFIX}p:`,

  /** Returns parsed value, or `fallback` if missing, unparsable, or failing `validate` (bad data is discarded). */
  get(key, fallback = null, validate) {
    try {
      const raw = backend.getItem(key);
      if (raw === null) {
        return fallback;
      }
      const value = JSON.parse(raw);
      if (validate && !validate(value)) {
        throw new Error('invalid shape');
      }
      return value;
    } catch (err) {
      console.warn(`[storage] discarding corrupted value for ${key}:`, err.message);
      try {
        backend.removeItem(key);
      } catch {
        /* ignore */
      }
      return fallback;
    }
  },
  set(key, value) {
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[storage] write failed:', err.message);
      return false;
    }
  },
  remove(key) {
    try {
      backend.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  removeByPrefix(prefix) {
    const keys = [];
    for (let i = 0; i < backend.length; i++) {
      const k = backend.key(i);
      if (k && k.startsWith(prefix)) {
        keys.push(k);
      }
    }
    keys.forEach((k) => this.remove(k));
    return keys.length;
  },
  /** Removes everything this app owns. */
  clearAll() {
    return this.removeByPrefix(PREFIX);
  },
};
