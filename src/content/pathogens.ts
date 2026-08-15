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
 * this list, so the order matters a great deal.
 *
 * Each colour keeps everything the one before it had and adds one new thing:
 *
 *   blue    the plain one everything else is measured against
 *   yellow  faster
 *   red     hits harder
 *   green   runs away from immune cells
 *   orange  faster again
 *   purple  hits harder again
 *
 * So the ladder alternates between "harder to catch" and "worse when it gets
 * you", and the nastiest thing in the game is a purple that also runs.
 */
export const pathogenColours = ['blue', 'yellow', 'red', 'green', 'orange', 'purple'] as const
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

/**
 * Tier 2: the same bacterium, quicker. Fast enough to be a nuisance to a
 * macrophage (16) but still slower than a neutrophil (34), so it can be caught.
 */
export const yellowBacteria: PathogenDef = {
  ...blueBacteria,
  id: 'yellow-bacteria',
  name: 'Yellow bacteria',
  colour: 'yellow',

  // A little bigger, so a nastier one reads as nastier at a glance.
  length: 27,
  width: 16,

  speed: 30,
}

/** Tier 3: as quick as yellow, and it eats a body cell half again as fast. */
export const redBacteria: PathogenDef = {
  ...yellowBacteria,
  id: 'red-bacteria',
  name: 'Red bacteria',
  colour: 'red',

  length: 28,
  width: 17,

  /** 0.14 means it takes about 7 seconds to kill one body cell, against blue's 11. */
  damagePerSecond: 0.14,
}

/**
 * Every pathogen in the game. Green, orange and purple are still to come: green
 * needs it to run away from immune cells, which is behaviour rather than
 * numbers, and the two after it sit on the far side of green so nothing can
 * mutate that far yet.
 */
export const pathogens: PathogenDef[] = [blueBacteria, yellowBacteria, redBacteria]

const byId = new Map(pathogens.map((def) => [def.id, def]))

/** Returns undefined for an unknown id, so a typo in a level doesn't crash. */
export function findPathogen(id: string): PathogenDef | undefined {
  return byId.get(id)
}

/**
 * The pathogens one step either side of this one on the colour ladder, of the
 * same family — what it might turn into when it divides.
 *
 * Colours with no def yet simply aren't options, so the ladder can be filled in
 * from either end without anything here changing. A blue can only become a
 * yellow today; once green exists, a red will be able to become one.
 */
export function mutationsOf(def: PathogenDef): PathogenDef[] {
  const step = pathogenColours.indexOf(def.colour)
  if (step === -1) return []

  const neighbours = [pathogenColours[step - 1], pathogenColours[step + 1]]

  return pathogens.filter(
    (candidate) => candidate.family === def.family && neighbours.includes(candidate.colour),
  )
}
