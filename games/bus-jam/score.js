/* Bus Jam - scoring formula (pure, no DOM). The numbers live in config.scoring. */
import { config } from './config.js';

const cfg = config.scoring;

export function compute(passengers, seconds) {
  const count = Math.max(0, passengers | 0);
  const time = Math.max(0, +seconds || 0);

  const base = count * cfg.perPassenger;
  const fast = count * cfg.fastSecPerPassenger;
  const slow = count * cfg.slowSecPerPassenger;

  let share;
  if (slow > fast) {
    share = Math.max(0, Math.min(1, (slow - time) / (slow - fast)));
  } else {
    share = time <= fast ? 1 : 0;
  }

  const timeBonus = Math.round((base * cfg.maxTimeBonus * share) / cfg.roundTo) * cfg.roundTo;
  return { passengers: count, seconds: time, base, timeBonus, total: base + timeBonus };
}

// 754.2 -> "12:34"
export function formatTime(totalSeconds) {
  const s = Math.floor(Math.max(0, totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
