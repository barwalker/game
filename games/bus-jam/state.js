/* Bus Jam - saved-game and progress serialization + validation (pure, no DOM). */
import { config } from './config.js';
import { canSeat } from './rules.js';
import { makeLevel } from './levels.js';

export const STATE_VERSION = 1;
const SLOTS = config.lineSlots;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function serialize(s) {
  return {
    v: STATE_VERSION,
    levelNumber: s.levelNumber,
    moves: s.moves,
    elapsed: Math.max(0, Math.round(s.elapsed * 1000) / 1000),
    clockStarted: !!s.clockStarted,
    busIndex: s.busIndex,
    bus: s.bus
      ? {
          taken: s.bus.taken,
          takenReserved: s.bus.takenReserved,
          shown: s.bus.shown,
          shownReserved: s.bus.shownReserved,
          shownNormal: s.bus.shownNormal,
          ready: !!s.bus.ready,
        }
      : null,
    line: s.line.map((p) => (p ? p.index : null)),
    tunnels: s.tunnels.map((t) => t.queue.map((p) => p.index)),
    passengers: s.passengers.map((p) => {
      const entry = { k: p.at.kind, d: !!p.done, q: !!p.secret };
      if (p.at.kind === 'grid') {
        entry.r = p.at.row;
        entry.c = p.at.col;
      } else if (p.at.kind === 'line') {
        entry.s = p.at.slot;
      }
      return entry;
    }),
  };
}

/** Rebuilds a live level state from saved data, or returns null if missing, malformed, inconsistent, or already finished. */
export function deserialize(raw, levelFactory = makeLevel) {
  try {
    if (!raw || typeof raw !== 'object' || raw.v !== STATE_VERSION) {
      return null;
    }
    if (!isInt(raw.levelNumber, 1, 100000) || !isInt(raw.moves, 0, 1e9)) {
      return null;
    }
    if (
      typeof raw.elapsed !== 'number' ||
      !Number.isFinite(raw.elapsed) ||
      raw.elapsed < 0 ||
      raw.elapsed > 1e8
    ) {
      return null;
    }
    if (typeof raw.clockStarted !== 'boolean') {
      return null;
    }

    const level = levelFactory(raw.levelNumber);
    const total = level.passengers.length;
    const busCount = level.buses.length;

    if (!isInt(raw.busIndex, 0, busCount)) {
      return null;
    }
    if (raw.busIndex === busCount) {
      return null;
    } // already finished all buses

    const busDef = level.buses[raw.busIndex];
    if (!raw.bus || typeof raw.bus !== 'object') {
      return null;
    }
    if (!isInt(raw.bus.taken, 0, busDef.seats)) {
      return null;
    }
    if (!isInt(raw.bus.takenReserved, 0, Math.min(busDef.reserved, raw.bus.taken))) {
      return null;
    }
    if (raw.bus.taken - raw.bus.takenReserved > busDef.seats - busDef.reserved) {
      return null;
    }
    if (!isInt(raw.bus.shown, 0, raw.bus.taken)) {
      return null;
    }
    if (!isInt(raw.bus.shownReserved, 0, raw.bus.takenReserved)) {
      return null;
    }
    if (!isInt(raw.bus.shownNormal, 0, raw.bus.taken - raw.bus.takenReserved)) {
      return null;
    }
    if (raw.bus.shown !== raw.bus.shownReserved + raw.bus.shownNormal) {
      return null;
    }
    if (typeof raw.bus.ready !== 'boolean') {
      return null;
    }

    if (!Array.isArray(raw.line) || raw.line.length !== SLOTS) {
      return null;
    }
    const lineIndices = new Set();
    for (let slot = 0; slot < SLOTS; slot++) {
      const idx = raw.line[slot];
      if (idx === null) {
        continue;
      }
      if (!isInt(idx, 0, total - 1) || lineIndices.has(idx)) {
        return null;
      }
      lineIndices.add(idx);
    }

    if (!Array.isArray(raw.tunnels) || raw.tunnels.length !== level.tunnels.length) {
      return null;
    }
    const tunnelIndices = new Set();
    const tunnelPos = new Set(level.tunnels.map((t) => t.row * level.cols + t.col));
    for (let k = 0; k < level.tunnels.length; k++) {
      const savedQ = raw.tunnels[k];
      const origQ = level.tunnels[k].queue;
      if (!Array.isArray(savedQ) || savedQ.length > origQ.length) {
        return null;
      }
      // Remaining tunnel passengers must be the exact suffix of the tunnel's emerge queue.
      const offset = origQ.length - savedQ.length;
      for (let j = 0; j < savedQ.length; j++) {
        if (savedQ[j] !== origQ[offset + j]) {
          return null;
        }
        tunnelIndices.add(savedQ[j]);
      }
    }

    if (!Array.isArray(raw.passengers) || raw.passengers.length !== total) {
      return null;
    }
    const occupied = new Set();
    const lineMatched = new Set();
    const tunnelMatched = new Set();
    let boardedCount = 0;
    let transitCount = 0;

    const passengers = level.passengers.map((src, i) => {
      const pe = raw.passengers[i];
      if (!pe || typeof pe !== 'object' || typeof pe.d !== 'boolean' || typeof pe.q !== 'boolean') {
        throw new Error('bad passenger');
      }
      if (!src.secret && pe.q) {
        throw new Error('unexpected secret');
      }

      let at;
      if (pe.k === 'grid') {
        if (pe.d || !isInt(pe.r, 0, level.rows - 1) || !isInt(pe.c, 0, level.cols - 1)) {
          throw new Error('bad grid pos');
        }
        const tile = pe.r * level.cols + pe.c;
        if (level.walls.has(tile) || tunnelPos.has(tile) || occupied.has(tile)) {
          throw new Error('blocked tile');
        }
        occupied.add(tile);
        at = { kind: 'grid', row: pe.r, col: pe.c };
      } else if (pe.k === 'line') {
        if (pe.d || !isInt(pe.s, 0, SLOTS - 1) || raw.line[pe.s] !== i || lineMatched.has(pe.s)) {
          throw new Error('bad line slot');
        }
        lineMatched.add(pe.s);
        at = { kind: 'line', slot: pe.s };
      } else if (pe.k === 'tunnel') {
        if (pe.d || !tunnelIndices.has(i) || tunnelMatched.has(i)) {
          throw new Error('bad tunnel ref');
        }
        tunnelMatched.add(i);
        at = { kind: 'tunnel' };
      } else if (pe.k === 'bus') {
        boardedCount++;
        at = { kind: 'bus' };
      } else if (pe.k === 'transit') {
        if (pe.d) {
          throw new Error('done transit');
        }
        transitCount++;
        at = { kind: 'transit' };
      } else {
        throw new Error('unknown kind');
      }

      return {
        index: i,
        color: src.color,
        hat: !!src.hat,
        secret: pe.q,
        tunnel: src.tunnel,
        at,
        done: pe.d,
        moving: false,
      };
    });

    if (lineMatched.size !== lineIndices.size) {
      throw new Error('line mismatch');
    }
    if (tunnelMatched.size !== tunnelIndices.size) {
      throw new Error('tunnel mismatch');
    }
    if (lineMatched.size + transitCount > SLOTS) {
      throw new Error('line overflow');
    }

    let expectedBoarded = raw.bus.taken;
    for (let b = 0; b < raw.busIndex; b++) {
      expectedBoarded += level.buses[b].seats;
    }
    if (boardedCount !== expectedBoarded) {
      throw new Error('boarded mismatch');
    }

    // Apply bus counters onto the level's current bus and finalize any in-flight boarding animations.
    const bus = level.buses[raw.busIndex];
    bus.taken = raw.bus.taken;
    bus.takenReserved = raw.bus.takenReserved;
    bus.shown = bus.taken;
    bus.shownReserved = bus.takenReserved;
    bus.shownNormal = bus.taken - bus.takenReserved;
    bus.ready = raw.bus.ready;

    for (const p of passengers) {
      if (p.at.kind === 'bus' && !p.done) {
        p.done = true;
      }
    }

    const line = raw.line.map((idx) => (idx === null ? null : passengers[idx]));
    const tunnels = level.tunnels.map((t, k) => ({
      ...t,
      queue: raw.tunnels[k].map((idx) => passengers[idx]),
    }));

    // Reconcile any passengers that were mid-walk when saved.
    for (const p of passengers) {
      if (p.at.kind !== 'transit') {
        continue;
      }
      if (bus.ready && canSeat(bus, p, bus.taken, bus.takenReserved)) {
        bus.taken++;
        if (bus.reserved && p.hat) {
          bus.takenReserved++;
        }
        bus.shown = bus.taken;
        bus.shownReserved = bus.takenReserved;
        bus.shownNormal = bus.taken - bus.takenReserved;
        p.at = { kind: 'bus' };
        p.done = true;
      } else {
        const slot = line.indexOf(null);
        if (slot === -1) {
          throw new Error('no free line slot');
        }
        line[slot] = p;
        p.at = { kind: 'line', slot };
      }
    }

    return {
      levelNumber: raw.levelNumber,
      level,
      moves: raw.moves,
      elapsed: raw.elapsed,
      clockStarted: raw.clockStarted,
      busIndex: raw.busIndex,
      bus,
      queue: level.buses.slice(raw.busIndex + 1),
      line,
      tunnels,
      passengers,
    };
  } catch {
    return null;
  }
}

export function serializeProgress(levelNumber, best) {
  const cleanBest = {};
  if (best && typeof best === 'object') {
    for (const [k, v] of Object.entries(best)) {
      if (/^\d+$/.test(k) && Number.isFinite(v) && v >= 0) {
        cleanBest[k] = v;
      }
    }
  }
  return { v: STATE_VERSION, level: Math.max(1, levelNumber | 0), best: cleanBest };
}

export function deserializeProgress(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== STATE_VERSION) {
    return { level: 1, best: {} };
  }
  const level = isInt(raw.level, 1, 100000) ? raw.level : 1;
  const best = {};
  if (raw.best && typeof raw.best === 'object' && !Array.isArray(raw.best)) {
    for (const [k, v] of Object.entries(raw.best)) {
      if (/^\d+$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        best[k] = v;
      }
    }
  }
  return { level, best };
}
