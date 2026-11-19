/* Bus Jam - configuration.
 *
 * Every tunable number lives here: colours, sizes, animation timing, scoring and the whole difficulty curve.
 * This file is plain data (no DOM). Level generation is deterministic: the same config and the same level
 * number always give the same level, so changing a number under `difficulty` changes the generated levels. */

/* Colours. Order matters: early levels use the first colours, so the first three are the most different.
 * colors = [base, light, dark]. glyph = the shape drawn on passengers, buses and tunnel chips,
 * a second cue for players who cannot tell the colours apart. */
const palette = {
  red: { colors: ['#e63a2e', '#ff9288', '#a3201a'], glyph: '\u2665' },
  blue: { colors: ['#2b8cff', '#92c8ff', '#1858b8'], glyph: '\u25C6' },
  yellow: { colors: ['#ffd21f', '#fff08a', '#c79a00'], glyph: '\u2605' },
  green: { colors: ['#37b24a', '#8ae27e', '#1e7a2e'], glyph: '\u25B2' },
  purple: { colors: ['#6a1fb8', '#b27ae8', '#43107c'], glyph: '\u25CF' },
  orange: { colors: ['#ff8a1a', '#ffc47a', '#c25a00'], glyph: '\u25A0' },
  magenta: { colors: ['#f0489e', '#ffa3d2', '#a8206b'], glyph: '\u271A' },
};

export const config = {
  lineSlots: 6, // waiting-line capacity; also the most passengers that may be out of the grid at once
  palette,
  secretColours: ['#9aa3b8', '#cdd3e0', '#6a7390'], // grey pawn shown while a passenger's colour is hidden

  // Board sizing. paxScale = passenger size as a share of one tile.
  ui: { maxCell: 54, minCell: 26, sidePadding: 70, slotGaps: 40, slotScale: 0.96, paxScale: 0.84 },

  // Animation timings in milliseconds. A "...WaitMs" value is how long the game logic waits, which can
  // differ slightly from the matching CSS transition.
  timing: {
    stepMs: 130, // one tile of walking
    toLineMs: 450, // sliding into the waiting line
    boardMs: 450, // walking onto the bus
    busInMs: 800, // bus driving in (CSS transition)
    busInWaitMs: 850, // ...and how long the game waits for it
    pullGapMs: 160, // gap between passengers pulled from the line when a bus arrives
    departWaitMs: 250, // pause before a full bus drives off
    busOutMs: 600, // bus driving off (CSS transition)
    busOutWaitMs: 650, // ...and how long the game waits for it
    spawnMs: 300, // a passenger sliding out of a tunnel
    shakeMs: 240, // "you can't move that one" wobble
  },

  /* Score = passengers x perPassenger + time bonus.
   * The bonus is maxTimeBonus (a share of the base) when the level is cleared within
   * fastSecPerPassenger x passengers seconds, falls linearly, and is 0 from slowSecPerPassenger x passengers
   * seconds. It is rounded to a multiple of roundTo. The clock starts when the first bus is ready and pauses
   * while the tab is hidden. */
  scoring: {
    perPassenger: 1,
    fastSecPerPassenger: 2,
    slowSecPerPassenger: 8,
    maxTimeBonus: 1,
    roundTo: 1,
    version: 2,
  },

  difficulty: {
    lateFrom: 15, // from this level the "late" rules apply: wall curve, density, bus sizes, search effort

    // Layout seed = level * mul + add + attempt * attemptMul
    seed: { mul: 7919, add: 13, attemptMul: 104729 },

    // Grid size: cols = min(maxCols, colsBase + ceil(level / colsDiv)); rows likewise.
    grid: { colsBase: 4, colsDiv: 3, maxCols: 7, rowsBase: 4, rowsDiv: 2, maxRows: 8 },

    // Colours in play = min(max, base + ceil(level / div))
    colours: { base: 2, div: 2, max: 7 },

    // Buses per level = min(max, base + ceil(level / div)). Late levels keep room for the planned number of
    // buses, assuming avgSeats per bus, and never plan for buses smaller than minSeats.
    busCount: { base: 2, div: 2, maxEarly: 6, maxLate: 5, avgSeats: 5, minSeats: 4 },

    // Seats per bus: the last entry whose `from` is <= the level is used. Repeated sizes make that size likelier.
    busSizes: [
      { from: 0, sizes: [4, 6] },
      { from: 3, sizes: [4, 6, 8] },
      { from: 6, sizes: [4, 6, 8, 10] },
      { from: 15, sizes: [4, 4, 6, 6, 8, 10] },
    ],

    // Share of free tiles that may hold passengers. Late: min(lateMax, lateStart + lateStep * (level - (lateFrom - 1))).
    density: { early: 0.55, lateStart: 0.55, lateStep: 0.01, lateMax: 0.75 },

    // From `from`, each bus gets 1..min(maxSeats, seats / 2) reserved (gold) seats with probability `chance`.
    reserved: { from: 5, chance: 0.4, maxSeats: 3 },

    // Secret passengers = min(max, base + floor((level - from) / every))
    secret: { from: 4, base: 1, every: 2, max: 6 },

    // Tunnels = min(max, base + floor((level - from) / every)). Each holds queueMin .. queueMin + queueExtra - 1 passengers.
    tunnels: { from: 8, base: 1, every: 6, max: 3, queueMin: 2, queueExtra: 2 },

    // Wall posts (barrier ends included). Early: min(floor(level / earlyDiv), earlyMax).
    // Late: min(lateBase + floor((level - lateFrom) / lateEvery), lateMax).
    walls: { earlyDiv: 2, earlyMax: 6, lateBase: 7, lateEvery: 3, lateMax: 12 },

    // Barriers = min(max, base + floor((level - from) / every)); each spans 1..gapMax fence tiles between two
    // posts (1..gapMaxLong from level longFrom). `tries` = placement attempts per level.
    barriers: {
      from: 15,
      base: 1,
      every: 5,
      max: 5,
      tries: 80,
      gapMax: 2,
      longFrom: 30,
      gapMaxLong: 3,
    },

    // Fairness filter. The generator tries layouts until one is solvable and simulated "natural" play wins at
    // least max(barFloor, barStart - barSlope * level) of the time; otherwise it keeps the best solvable one.
    fairness: {
      barStart: 0.6,
      barSlope: 0.015,
      barFloor: 0.15,
      solverCap: 30000, // solver search nodes; a layout too hard to search is rejected
      rateSeedMul: 31,
      early: { attempts: 120, playouts: 150 },
      late: { attempts: 300, playouts: 100 },
      lateExtraAfter: 120,
      lateExtraMin: 0.14, // late levels may stop after this many attempts at this win rate
    },
  },
};

export const COL = Object.fromEntries(Object.entries(palette).map(([name, v]) => [name, v.colors]));
export const GLY = Object.fromEntries(Object.entries(palette).map(([name, v]) => [name, v.glyph]));
