import { storage } from './storage.js';

/** Device-level preferences (not tied to a profile). Games can read them through `ctx.settings`. */
const KEY = storage.key('settings');

export const LANGUAGES = [
  { code: 'en-GB', name: 'English (British)', flag: '🇬🇧' },
  { code: 'en-US', name: 'English (USA)', flag: '🇺🇸' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
];

export const settings = {
  /** Always returns a complete, valid object (bad or missing values fall back to defaults). */
  get() {
    const s = storage.get(KEY, null, (o) => o && typeof o === 'object' && !Array.isArray(o)) ?? {};
    return {
      sound: s.sound !== false,
      music: s.music !== false,
      vibration: s.vibration !== false,
      language: LANGUAGES.some((l) => l.code === s.language) ? s.language : 'en-GB',
      rating: Number.isInteger(s.rating) && s.rating >= 0 && s.rating <= 5 ? s.rating : 0,
    };
  },
  patch(changes) {
    return storage.set(KEY, { ...this.get(), ...changes });
  },
};
