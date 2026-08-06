/**
 * PATHOGENS
 * =========
 * Colour is one single thing. It says how hard a pathogen is to kill, which
 * powers it has, AND which signature the adaptive immune system learns. They
 * aren't separate ideas — a purple bacterium is nastier, has more tricks, and
 * needs its own antibodies.
 *
 * Blue is tier 1: the simplest thing that can hurt you.
 *
 * To add a new pathogen, copy one below, change the numbers, and add it to the
 * `pathogens` list at the bottom. Then put it in a level's waves.
 */

export type PathogenFamily = 'bacteria' | 'virus' | 'parasite'

/**
 * In order, easiest first. When a pathogen mutates it drifts one step along
 * this list, so the order matters.
 */
export const pathogenColours = ['blue', 'green', 'yellow', 'orange', 'red', 'purple'] as const
export type PathogenColour = (typeof pathogenColours)[number]

export interface PathogenDef {
  id: string
  name: string
  family: PathogenFamily
  colour: PathogenColour

  // --- how it looks ---
  /** Rod-shaped bacteria are drawn as a rounded rectangle this long... */
  length: number
  /** ...and this wide. */
  width: number

  // --- how it behaves ---
  /** Used for touching body cells, and later for being hit by immune cells. */
  radius: number
  health: number
  /** Pixels per second. */
  speed: number
  /** How far away it can notice a body cell and go for it. */
  visionRange: number
  /** Damage per second to a body cell it is touching. Body cells have 1 health. */
  damagePerSecond: number
  /** Seconds between splitting into two. Lower is much scarier than it looks. */
  divideEverySeconds: number
  /** How often it picks a new direction while wandering. */
  wanderChangeSeconds: number
}

export const blueBacteria: PathogenDef = {
  id: 'blue-bacteria',
  name: 'Blue bacteria',
  family: 'bacteria',
  colour: 'blue',

  length: 26,
  width: 15,

  radius: 10,
  health: 3,
  speed: 24,
  visionRange: 160,
  /** 0.09 means it takes about 11 seconds to kill one body cell. */
  damagePerSecond: 0.09,
  divideEverySeconds: 20,
  wanderChangeSeconds: 2.5,
}

export const pathogens: PathogenDef[] = [blueBacteria]

const byId = new Map(pathogens.map((def) => [def.id, def]))

/** Returns undefined for an unknown id, so a typo in a level doesn't crash. */
export function findPathogen(id: string): PathogenDef | undefined {
  return byId.get(id)
}
