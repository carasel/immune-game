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
  /** Seconds spent clearing away one dead body cell. */
  engulfDebrisSeconds: number
  /** Energy earned for a finished pathogen meal. */
  energyPerPathogen: number
  /** Energy for a cleared dead body cell. Smaller — debris is less of a meal. */
  energyPerDebris: number

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
}

export const macrophage: ImmuneCellDef = {
  id: 'macrophage',
  name: 'Macrophage',

  radius: 22,
  nose: 0.34,
  belly: 0.16,

  /** Slow on purpose. Bacteria swim at 24, so a macrophage cannot chase one down. */
  speed: 16,
  visionRange: 150,
  wanderChangeSeconds: 3,

  engulfPathogenSeconds: 2,
  engulfDebrisSeconds: 3,
  energyPerPathogen: 10,
  energyPerDebris: 5,

  cost: 60,
  upkeepPerSecond: 0.4,
}

export const immuneCells: ImmuneCellDef[] = [macrophage]

const byId = new Map(immuneCells.map((def) => [def.id, def]))

/** Returns undefined for an unknown id, so a typo in a level doesn't crash. */
export function findImmuneCell(id: string): ImmuneCellDef | undefined {
  return byId.get(id)
}
