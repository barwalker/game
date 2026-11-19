/* Bus Jam - endless level generator (pure logic, no DOM).
 *
 * makeLevel(n) returns level n. The same n always gives the same level.
 *
 * IMPORTANT: the generator draws random numbers in a fixed order. Adding, removing or reordering a draw
 * changes every level. Keep the order of the steps in generateLevel(). */
import { config } from './config.js';
import { solve, winRate } from './rules.js';

const D = config.difficulty;
const colourNames = Object.keys(config.palette);
const levelCache = new Map();

// ---- Seeded random numbers ------------------------------------------------------------------------------------
function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = (next() * (i + 1)) | 0;
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  return { next, shuffle };
}

// ---- How big and how busy is level n? -------------------------------------------------------------------------
const isLate = (n) => n >= D.lateFrom;

function gridSize(n) {
  return {
    cols: Math.min(D.grid.maxCols, D.grid.colsBase + Math.ceil(n / D.grid.colsDiv)),
    rows: Math.min(D.grid.maxRows, D.grid.rowsBase + Math.ceil(n / D.grid.rowsDiv)),
  };
}

function featureCounts(n) {
  const walls = isLate(n)
    ? Math.min(D.walls.lateBase + (((n - D.lateFrom) / D.walls.lateEvery) | 0), D.walls.lateMax)
    : Math.min(Math.floor(n / D.walls.earlyDiv), D.walls.earlyMax);
  const barriers =
    n >= D.barriers.from
      ? Math.min(D.barriers.base + (((n - D.barriers.from) / D.barriers.every) | 0), D.barriers.max)
      : 0;
  const tunnels =
    n >= D.tunnels.from
      ? Math.min(D.tunnels.max, D.tunnels.base + (((n - D.tunnels.from) / D.tunnels.every) | 0))
      : 0;
  return { walls, barriers, tunnels };
}

function passengerDensity(n) {
  if (!isLate(n)) {
    return D.density.early;
  }
  return Math.min(
    D.density.lateMax,
    D.density.lateStart + D.density.lateStep * (n - (D.lateFrom - 1))
  );
}

// ---- Generation steps (called in this order by generateLevel) --------------------------------------------------
const newBus = (color, seats) => ({
  color,
  seats,
  reserved: 0,
  taken: 0,
  takenReserved: 0,
  shown: 0,
  shownReserved: 0,
  shownNormal: 0,
});

function makeBuses(n, tileCount, counts, random) {
  const late = isLate(n);
  const colourCount = Math.min(D.colours.max, D.colours.base + Math.ceil(n / D.colours.div));
  const sizes = D.busSizes.filter((entry) => entry.from <= n).pop().sizes;
  const colours = random.shuffle(colourNames.slice(0, colourCount));

  const target = Math.min(
    late ? D.busCount.maxLate : D.busCount.maxEarly,
    D.busCount.base + Math.ceil(n / D.busCount.div)
  );
  const budget =
    (tileCount - counts.walls - 2 * counts.barriers - 2 * counts.tunnels) * passengerDensity(n);
  const planned = late ? Math.min(target, (budget / D.busCount.avgSeats) | 0) : target;
  const reserveForRest = late ? D.busCount.minSeats : 0;

  const buses = [];
  let seatsSoFar = 0;
  while (buses.length < target) {
    let fits = sizes.filter(
      (size) =>
        seatsSoFar + size + reserveForRest * Math.max(0, planned - buses.length - 1) <= budget
    );
    if (!fits.length) {
      fits = sizes.filter((size) => seatsSoFar + size <= budget);
    }
    if (!fits.length) {
      break;
    }

    const seats = fits[(random.next() * fits.length) | 0];
    seatsSoFar += seats;
    buses.push(newBus(colours[buses.length % colours.length], seats));
  }
  return buses;
}

function addReservedSeats(n, buses, random) {
  if (n < D.reserved.from) {
    return;
  }
  buses.forEach((bus) => {
    if (random.next() < D.reserved.chance) {
      bus.reserved = 1 + ((random.next() * Math.min(D.reserved.maxSeats, bus.seats >> 1)) | 0);
    }
  });
}

function placeTunnels(rows, cols, count, random) {
  return random
    .shuffle([...Array(cols).keys()])
    .slice(0, count)
    .map((col) => ({ row: rows - 1, col, mouthRow: rows - 2, mouthCol: col, queue: [] }));
}

function placeBarriers(n, rows, cols, count, keepFree, random) {
  const fenceTiles = new Set();
  const barriers = new Map();
  const gapMax = n >= D.barriers.longFrom ? D.barriers.gapMaxLong : D.barriers.gapMax;
  let placed = 0;

  for (let attempt = 0; placed < count && attempt < D.barriers.tries; attempt++) {
    const gap = 1 + ((random.next() * gapMax) | 0);
    const horizontal = random.next() < 0.5;
    const row = 1 + ((random.next() * (rows - 1)) | 0);
    const col = (random.next() * cols) | 0;

    const line = Array.from({ length: gap + 2 }, (_, k) =>
      horizontal ? row * cols + col + k : (row + k) * cols + col
    );
    const runsOffGrid = horizontal ? col + gap + 1 >= cols : row + gap + 1 >= rows;
    if (runsOffGrid || line.some((tile) => fenceTiles.has(tile) || keepFree.has(tile))) {
      continue;
    }

    line.forEach((tile) => fenceTiles.add(tile));
    line.slice(1, -1).forEach((tile) => barriers.set(tile, horizontal ? 'horizontal' : 'vertical'));
    placed++;
  }
  return { fenceTiles, barriers, placed };
}

function placePassengers(n, rows, cols, counts, buses, tunnels, fence, keepFree, random) {
  const tiles = random.shuffle([...Array(rows * cols).keys()]);
  const extraPosts = tiles
    .filter((tile) => tile >= cols && !keepFree.has(tile) && !fence.fenceTiles.has(tile))
    .slice(0, Math.max(0, counts.walls - 2 * fence.placed));
  const walls = new Set([...fence.fenceTiles, ...extraPosts]);
  const freeTiles = tiles.filter((tile) => !walls.has(tile) && !keepFree.has(tile));

  const seats = random.shuffle(
    buses.flatMap((bus) =>
      Array.from({ length: bus.seats }, (_, k) => ({ color: bus.color, hat: k < bus.reserved }))
    )
  );
  tunnels.forEach((tunnel) => {
    tunnel.queue = seats.splice(
      -(D.tunnels.queueMin + ((random.next() * D.tunnels.queueExtra) | 0))
    );
  });

  const passengers = seats.map((seat, k) => ({
    ...seat,
    row: (freeTiles[k] / cols) | 0,
    col: freeTiles[k] % cols,
    tunnel: null,
  }));

  if (n >= D.secret.from) {
    const howMany = Math.min(
      D.secret.base + (((n - D.secret.from) / D.secret.every) | 0),
      D.secret.max
    );
    random
      .shuffle(passengers.map((_, i) => i))
      .slice(0, howMany)
      .forEach((i) => {
        passengers[i].secret = true;
      });
  }
  tunnels.forEach((tunnel, k) => {
    tunnel.queue = tunnel.queue.map(
      (seat) =>
        passengers.push({ ...seat, row: tunnel.mouthRow, col: tunnel.mouthCol, tunnel: k }) - 1
    );
  });
  return { walls, passengers };
}

function generateLevel(n, attempt) {
  const random = createRandom(n * D.seed.mul + D.seed.add + attempt * D.seed.attemptMul);
  const { cols, rows } = gridSize(n);
  const counts = featureCounts(n);

  const buses = makeBuses(n, cols * rows, counts, random);
  addReservedSeats(n, buses, random);
  const tunnels = placeTunnels(rows, cols, counts.tunnels, random);
  const keepFree = new Set(
    tunnels.flatMap((t) => [t.row * cols + t.col, t.mouthRow * cols + t.mouthCol])
  );
  const fence = placeBarriers(n, rows, cols, counts.barriers, keepFree, random);
  const { walls, passengers } = placePassengers(
    n,
    rows,
    cols,
    counts,
    buses,
    tunnels,
    fence,
    keepFree,
    random
  );

  return { rows, cols, walls, barriers: fence.barriers, buses, tunnels, passengers };
}

function cloneLevel(lvl) {
  return {
    rows: lvl.rows,
    cols: lvl.cols,
    walls: new Set(lvl.walls),
    barriers: new Map(lvl.barriers),
    buses: lvl.buses.map((b) => ({ ...b })),
    tunnels: lvl.tunnels.map((t) => ({ ...t, queue: t.queue.slice() })),
    passengers: lvl.passengers.map((p) => ({ ...p })),
  };
}

export function makeLevel(n) {
  const num = Math.max(1, n | 0);
  const cached = levelCache.get(num);
  if (cached) {
    return cloneLevel(cached);
  }

  const F = D.fairness,
    effort = isLate(num) ? F.late : F.early;
  const wanted = Math.max(F.barFloor, F.barStart - F.barSlope * num);
  let best = null,
    bestRate = -1;

  for (let attempt = 0; attempt < effort.attempts; attempt++) {
    const level = generateLevel(num, attempt);
    const rate = winRate(level, effort.playouts, num * F.rateSeedMul + attempt);
    if (rate > bestRate && solve(level, F.solverCap)) {
      bestRate = rate;
      best = level;
    }
    if (bestRate >= wanted || (attempt >= F.lateExtraAfter && bestRate >= F.lateExtraMin)) {
      break;
    }
  }
  const result = best || generateLevel(num, 0);
  if (levelCache.size > 20) {
    levelCache.delete(levelCache.keys().next().value);
  }
  levelCache.set(num, result);
  return cloneLevel(result);
}
