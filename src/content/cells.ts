/**
 * IMMUNE CELLS
 * ============
 * Your cells. Every one of them is autonomous: it wanders on its own, spots
 * pathogens by itself, and goes for them without being told. Player orders are
 * a temporary override, never a permanent mode.
 *
 * The macrophage is the big eater and your income engine. It swallows a
 * bacterium whole, digests it for a couple of seconds, and gets paid. It also
 * clears away the outlines dead body cells leave behind, which is real work
 * that real macrophages do — the tissue can't heal until the mess is gone.
 *
 * To add a cell type, copy one below, change the numbers, add it to the
 * `immuneCells` list at the bottom, and put it in a level's `startingCells`.
 */

export interface ImmuneCellDef {
  id: string
  name: string

  // --- how it looks ---
  /**
   * How big it is, and the circle the simulation uses for bumping into things.
   * Body cells are 28 and a bacterium is 10, so a macrophage at 22 reads as big
   * without being mistaken for tissue.
   */
  radius: number
  /**
   * Its shape. The cell always points its narrow end where it is going, which
   * is how a crawling white blood cell really looks: it reaches forward with a
   * thin edge and drags its bulk along behind.
   *
   * `nose` pinches the front in and `belly` fattens the back out, both as
   * fractions of the radius. Set both to 0 for a plain circle.
   */
  nose: number
  belly: number
  /** How many spikes go round the outside. 0 for a smooth cell. */
  spikes: number
  /** How far the spikes stick out, as a fraction of the radius. */
  spikiness: number

  // --- how it behaves ---
  /**
   * Pixels per second through the open channels. Squeezing between body cells
   * is slower — see `squeezeSpeedMultiplier` in balance.ts.
   */
  speed: number
  /** How far away it notices a pathogen, or a dead body cell to clear up. */
  visionRange: number
  /** How often it picks a new direction while wandering. */
  wanderChangeSeconds: number

  // --- eating ---
  /**
   * Seconds spent swallowing and digesting one pathogen. It can't move or hunt
   * while it does, which is why a swarm can walk straight past a lone
   * macrophage that is busy.
   */
  engulfPathogenSeconds: number
  /** Energy earned for a finished pathogen meal. */
  energyPerPathogen: number
  /**
   * Clearing up after dead body cells: how long it takes and what it pays.
   * Leave both out for a cell that doesn't do clean-up — that is the
   * macrophage's job, and a neutrophil walks straight past the mess.
   */
  engulfDebrisSeconds?: number
  energyPerDebris?: number

  // --- what it costs you ---
  /** Energy to recruit one. Used by the recruit panel. */
  cost: number
  /** Energy per second, every second it is alive. */
  upkeepPerSecond: number

  /**
   * How long it lives, in seconds. Leave it out for a cell that outlasts a
   * whole level: a macrophage really does live for months. Neutrophils live
   * hours and will want a number here.
   */
  lifespanSeconds?: number

  /**
   * Degranulation: throwing poison at whatever it can see. Leave it out and the
   * cell has no such weapon.
   *
   * This is real, and it is the reason "granulocyte" is a word: neutrophils are
   * packed with granules full of defensins, elastase and myeloperoxidase, which
   * makes bleach. They spray it at what they are attacking, and it damages your
   * own tissue too. That is not a game-balance compromise, it is the biology.
   */
  /**
   * The NET: the cell tears itself apart and throws its own DNA out as a sticky
   * web, studded with the poison from its granules. Bacteria caught in it are
   * held still and killed. So is a good deal of whatever tissue it lands on.
   *
   * This is real, it is called NETosis, and the cell does not survive it. Leave
   * it out and the cell has no such last resort.
   */
  net?: {
    /** How far the web reaches from the cell that made it. */
    radius: number
    /** How long it stays sticky before it breaks down. */
    durationSeconds: number
    /** Damage a second to any pathogen held in it. */
    damagePerSecondToPathogens: number
    /**
     * Damage to each of your body cells under it, once, as the web lands.
     * A one-off rather than per second — the web smothers what it falls on and
     * then it is done, instead of dissolving the tissue while it sits there.
     */
    damageToBodyCells: number
  }

  granules?: {
    /** Seconds between one granule and the next. */
    everySeconds: number
    /** Pixels per second. Fast enough that a bacterium cannot outrun it. */
    speed: number
    /** How far it flies before the poison is spent. */
    range: number
    /** Damage to a pathogen it hits. Bacteria have health; body cells have 1. */
    damageToPathogens: number
    /** Damage to one of your own body cells it hits. The price of using it. */
    damageToBodyCells: number
  }
}

export const macrophage: ImmuneCellDef = {
  id: 'macrophage',
  name: 'Macrophage',

  radius: 22,
  nose: 0.34,
  belly: 0.16,
  spikes: 0,
  spikiness: 0,

  /** Slow on purpose. Bacteria swim at 24, so a macrophage cannot chase one down. */
  speed: 16,
  visionRange: 150,
  wanderChangeSeconds: 3,

  engulfPathogenSeconds: 2,
  energyPerPathogen: 10,
  engulfDebrisSeconds: 3,
  energyPerDebris: 5,

  cost: 60,
  upkeepPerSecond: 0.4,
}

/**
 * The first cell to arrive at anything going wrong. Small, spiky, fast enough
 * to run a bacterium down, and dead within a couple of minutes whatever
 * happens — which is real: neutrophils live hours where a macrophage lives
 * months, and your body makes a hundred billion of them a day.
 *
 * It eats bacteria but earns little for it and does no clearing up, so it
 * fights without ever paying for itself. That is the trade: buy them when you
 * need the fight won now, and know they are a cost.
 */
export const neutrophil: ImmuneCellDef = {
  id: 'neutrophil',
  name: 'Neutrophil',

  radius: 14,
  // Barely a pear — mostly a spiky ball that still points where it's going.
  nose: 0.12,
  belly: 0.06,
  spikes: 9,
  spikiness: 0.2,

  /** Faster than the bacteria swim, so it can actually catch them. */
  speed: 34,
  visionRange: 190,
  wanderChangeSeconds: 1.6,

  /**
   * Twice as slow as a macrophage. A neutrophil is not the specialist eater —
   * it catches things a macrophage never could, then stands there busy for four
   * seconds dealing with it. Its real weapons are coming: NETs, and the
   * poisonous granules it is named for.
   */
  engulfPathogenSeconds: 4,
  energyPerPathogen: 4,

  cost: 30,
  upkeepPerSecond: 0.2,

  /** 90 seconds. Everything else about the neutrophil follows from this. */
  lifespanSeconds: 90,

  net: {
    /** About three body cells across. Enough to cover a cluster at the wound. */
    radius: 90,
    durationSeconds: 8,
    /** A blue bacterium has 3 health, so it dies in about two seconds in there. */
    damagePerSecondToPathogens: 1.5,
    /**
     * Four fifths of a body cell, once. A healthy cell survives on a sliver;
     * one that has already been chewed on dies. So a NET over your own tissue
     * is not instantly fatal to it, but it does leave the place in ruins.
     */
    damageToBodyCells: 0.8,
  },

  granules: {
    everySeconds: 5,
    speed: 130,
    /** As far as it can see: it throws at whatever it is looking at. */
    range: 190,
    /**
     * 3 is exactly a blue bacterium's health, so one hit kills one. Tougher
     * colours will survive a granule, which is the point of colour being
     * difficulty — this number should not go up when they arrive.
     */
    damageToPathogens: 3,
    /**
     * A sixth of a body cell, so six stray granules kill one. Firing into your
     * own tissue costs you, visibly, without one wild shot mattering much.
     */
    damageToBodyCells: 1 / 6,
  },
}

export const immuneCells: ImmuneCellDef[] = [macrophage, neutrophil]

const byId = new Map(immuneCells.map((def) => [def.id, def]))

/** Returns undefined for an unknown id, so a typo in a level doesn't crash. */
export function findImmuneCell(id: string): ImmuneCellDef | undefined {
  return byId.get(id)
}
