/* Bus Jam - the game rules as a pure simulation (no DOM).
 *
 * The level generator uses it to check that a layout can be won (solve) and how forgiving it is (winRate),
 * and the live game uses canSeat so the screen and the simulation always agree on who may sit where. */
import { config } from './config.js';

const SLOTS = config.lineSlots;

/* May `passenger` take a seat on `bus` that already has `taken` seats claimed (`takenReserved` reserved)?
 * A reserved bus takes exactly bus.reserved hat passengers and the remaining seats go to normal ones;
 * a normal bus takes anyone of its colour. */
export function canSeat(bus, passenger, taken, takenReserved) {
  if (bus.color !== passenger.color) {
    return false;
  }
  if (!bus.reserved) {
    return taken < bus.seats;
  }
  if (passenger.hat) {
    return takenReserved < bus.reserved;
  }
  return taken - takenReserved < bus.seats - bus.reserved;
}

// A tunnel lets its next passenger out as soon as the tile in front of it is empty.
export function releaseFromTunnels(level, sim) {
  level.tunnels.forEach((tunnel, k) => {
    const mouth = tunnel.mouthRow * level.cols + tunnel.mouthCol;
    if (sim.released[k] < tunnel.queue.length && !sim.grid[mouth]) {
      sim.grid[mouth] = 2 + tunnel.queue[sim.released[k]++];
    }
  });
}

export function createSim(level) {
  const grid = Array(level.rows * level.cols).fill(0);
  level.walls.forEach((tile) => {
    grid[tile] = 1;
  });
  level.tunnels.forEach((t) => {
    grid[t.row * level.cols + t.col] = 1;
  });
  level.passengers.forEach((p, i) => {
    if (p.tunnel === null || p.tunnel === undefined) {
      grid[p.row * level.cols + p.col] = 2 + i;
    }
  });

  const sim = {
    grid,
    alive: level.passengers.map(() => 1),
    released: level.tunnels.map(() => 0),
    busIndex: 0,
    taken: 0,
    takenReserved: 0,
    line: [],
  };
  releaseFromTunnels(level, sim);
  return sim;
}

const cloneSim = (sim) => ({
  grid: sim.grid.slice(),
  alive: sim.alive.slice(),
  released: sim.released.slice(),
  busIndex: sim.busIndex,
  taken: sim.taken,
  takenReserved: sim.takenReserved,
  line: sim.line.slice(),
});

/* Indices of the passengers that can walk to the top row right now. */
let reached = new Uint8Array(64);
let stack = new Int16Array(64);

export function reachablePassengers(level, sim) {
  const R = level.rows,
    C = level.cols,
    tiles = R * C,
    grid = sim.grid,
    result = [];
  if (reached.length < tiles) {
    reached = new Uint8Array(tiles);
    stack = new Int16Array(tiles);
  }
  reached.fill(0, 0, tiles);

  let top = 0;
  for (let c = 0; c < C; c++) {
    if (!grid[c]) {
      reached[c] = 1;
      stack[top++] = c;
    }
  }

  const visit = (tile) => {
    if (!grid[tile] && !reached[tile]) {
      reached[tile] = 1;
      stack[top++] = tile;
    }
  };
  while (top) {
    const tile = stack[--top],
      row = (tile / C) | 0,
      col = tile - row * C;
    if (row > 0) {
      visit(tile - C);
    }
    if (row < R - 1) {
      visit(tile + C);
    }
    if (col > 0) {
      visit(tile - 1);
    }
    if (col < C - 1) {
      visit(tile + 1);
    }
  }

  level.passengers.forEach((p, i) => {
    const tile = p.row * C + p.col;
    if (!sim.alive[i] || grid[tile] !== 2 + i) {
      return;
    }
    const canExit =
      p.row === 0 ||
      reached[tile - C] ||
      (p.row < R - 1 && reached[tile + C]) ||
      (p.col > 0 && reached[tile - 1]) ||
      (p.col < C - 1 && reached[tile + 1]);
    if (canExit) {
      result.push(i);
    }
  });
  return result;
}

/* Tap passenger i: free its tile, let tunnels refill, then seat it on the waiting bus or put it in the line. */
export function applyTap(level, sim, i) {
  const passenger = level.passengers[i],
    buses = level.buses;
  sim.alive[i] = 0;
  sim.grid[passenger.row * level.cols + passenger.col] = 0;
  releaseFromTunnels(level, sim);

  const bus = buses[sim.busIndex];
  if (canSeat(bus, passenger, sim.taken, sim.takenReserved)) {
    sim.taken++;
    if (bus.reserved && passenger.hat) {
      sim.takenReserved++;
    }
  } else {
    sim.line.push(i);
  }

  while (sim.busIndex < buses.length && sim.taken === buses[sim.busIndex].seats) {
    sim.busIndex++;
    sim.taken = 0;
    sim.takenReserved = 0;
    const next = buses[sim.busIndex];
    if (!next) {
      break;
    }
    for (let j = sim.line.length - 1; j >= 0 && sim.taken < next.seats; j--) {
      const waiting = level.passengers[sim.line[j]];
      if (canSeat(next, waiting, sim.taken, sim.takenReserved)) {
        sim.line.splice(j, 1);
        sim.taken++;
        if (next.reserved && waiting.hat) {
          sim.takenReserved++;
        }
      }
    }
  }
}

/* Depth-first search for a winning order. True if the level can be cleared. */
export function solve(level, nodeCap) {
  const buses = level.buses,
    passengers = level.passengers,
    seen = new Set();
  const kind = passengers.map((p) => p.color.charCodeAt(0) * 2 + (p.hat ? 1 : 0));
  let nodes = 0;

  const search = (sim) => {
    if (sim.busIndex >= buses.length) {
      return true;
    }
    if (++nodes > nodeCap) {
      throw new Error('node cap');
    }

    const key = `${sim.alive.join('')}|${sim.busIndex}|${sim.taken}|${sim.takenReserved}|${sim.line
      .map((i) => kind[i])
      .sort((a, b) => a - b)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);

    const options = reachablePassengers(level, sim);
    if (sim.line.length >= SLOTS || !options.length) {
      return false;
    }

    const bus = buses[sim.busIndex];
    options.sort(
      (a, b) =>
        canSeat(bus, passengers[b], sim.taken, sim.takenReserved) -
        canSeat(bus, passengers[a], sim.taken, sim.takenReserved)
    );

    for (const i of options) {
      const next = cloneSim(sim);
      applyTap(level, next, i);
      if (search(next)) {
        return true;
      }
    }
    return false;
  };

  try {
    return search(createSim(level));
  } catch {
    return false;
  }
}

/* Share of `games` quick simulated playthroughs that win. */
export function winRate(level, games, seed) {
  let state = seed >>> 0;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  let wins = 0;

  for (let game = 0; game < games; game++) {
    const sim = createSim(level);
    for (;;) {
      if (sim.busIndex >= level.buses.length) {
        wins++;
        break;
      }
      const options = reachablePassengers(level, sim);
      if (sim.line.length >= SLOTS || !options.length) {
        break;
      }

      const bus = level.buses[sim.busIndex];
      const seatable = options.filter((i) =>
        canSeat(bus, level.passengers[i], sim.taken, sim.takenReserved)
      );
      const pool = seatable.length && random() < 0.6 ? seatable : options;
      applyTap(level, sim, pool[(random() * pool.length) | 0]);
    }
  }
  return wins / games;
}
