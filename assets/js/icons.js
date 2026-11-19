/**
 * UI icons are high-resolution WebP images (assets/icons/ui/*.webp), drawn in a 3D toy style by tools/assets/build.mjs.
 * `icon(name)` returns an <img>; `hydrate()` fills every [data-icon] element.
 */
const BASE = new URL('../icons/ui/', import.meta.url).href;
const NAMES = new Set([
  'play',
  'home',
  'gamepad',
  'gear',
  'check',
  'close',
  'plus',
  'refresh',
  'sound',
  'music',
  'vibrate',
  'globe',
  'coin',
  'chevrons',
  'card',
  'house',
  'cup',
  'player',
  'cog',
  'chest',
  'star',
  'alert',
]);

export const icon = (name) =>
  NAMES.has(name)
    ? `<img class="ic" src="${BASE}${name}.webp" alt="" width="64" height="64" decoding="async" draggable="false">`
    : '';

export function hydrate(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.done) {
      return;
    }
    el.dataset.done = '1';
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  });
}
