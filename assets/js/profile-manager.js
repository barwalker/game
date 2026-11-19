import { storage } from './storage.js';

const KEY = storage.key('profile');
const isValid = (p) =>
  p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name.trim();
let current = storage.get(KEY, null, isValid);

const emit = () => globalThis.dispatchEvent?.(new CustomEvent('hub:profilechange'));
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function validateName(name) {
  const clean = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean) {
    throw new Error('Enter a display name.');
  }
  if (clean.length > 24) {
    throw new Error('Display name must be 24 characters or fewer.');
  }
  return clean;
}

export const profileManager = {
  get current() {
    return current;
  },
  hasProfile() {
    return current !== null;
  },

  /** Creates a profile. Any existing profile and ALL its data (sessions, scores, stats) is deleted first. */
  create(name) {
    const clean = validateName(name);
    storage.removeByPrefix(storage.profileDataPrefix);
    const profile = { id: newId(), name: clean, createdAt: new Date().toISOString() };
    if (!storage.set(KEY, profile)) {
      throw new Error('Could not save the profile. Is storage full or blocked?');
    }
    current = profile;
    emit();
    return profile;
  },

  /** Renames the active profile; the id (and so all progress) is unchanged. */
  rename(name) {
    if (!current) {
      throw new Error('No active profile.');
    }
    const updated = { ...current, name: validateName(name) };
    if (!storage.set(KEY, updated)) {
      throw new Error('Could not save the new name.');
    }
    current = updated;
    emit();
    return updated;
  },

  /** Deletes the profile and all of its data. */
  deleteAll() {
    storage.clearAll();
    current = null;
    emit();
  },
};
