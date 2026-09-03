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
 * SHAPE is the other axis, and it is a different idea from colour. Colour says
 * how nasty it is; shape says how it has to be fought. A rod and a cocci of the
 * same colour hurt a body cell at exactly the same rate — the cocci is just far
 * more work to get rid of.
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

/**
 * What a bacterium is built like.
 *
 *   rod    one capsule-shaped body. Kill it and it is gone.
 *   cocci  little round balls stuck together in a clump. Only ONE ball ever
 *          comes off at a time, so a clump has to be taken apart piece by
 *          piece while the rest of it carries on eating your tissue.
 *
 * Both are real: rods are bacilli — E. coli, salmonella — and cocci are the
 * round ones that grow stuck together in clumps and chains, like staph and
 * strep.
 */
export type PathogenShape = 'rod' | 'cocci'

/** Everything both shapes have. */
interface PathogenBase {
  id: string
  name: string
  family: PathogenFamily
  colour: PathogenColour

  // --- how it behaves ---
  /**
   * Used for touching body cells, for being clicked on, and for being caught.
   * A cocci's is worked out from its clump — see `cocciRadius` — and the
   * simulation shrinks it as balls come off, so a half-eaten clump really is
   * smaller than a whole one.
   */
  radius: number
  /**
   * How much punishment it takes. For a cocci this is the health of ONE ball,
   * not of the whole clump, so a clump of three is three times the work.
   */
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

/** A rod: one rounded rectangle, swimming along its long axis. */
export interface RodDef extends PathogenBase {
  shape: 'rod'
  /** Rod-shaped bacteria are drawn as a rounded rectangle this long... */
  length: number
  /** ...and this wide. */
  width: number
  /** A rod is one single body, so this is always 1. */
  balls: 1
}

/** A cocci: a clump of balls, taken apart one ball at a time. */
export interface CocciDef extends PathogenBase {
  shape: 'cocci'
  /** How big one ball is. */
  ballRadius: number
  /** How many balls it starts with. Comes straight off the colour ladder. */
  balls: number
}

export type PathogenDef = RodDef | CocciDef

/**
 * How many balls a cocci of this colour is made of: two at blue, and one more
 * for every step up the ladder, so purple is a clump of seven.
 *
 * This is the whole cocci idea in one line. A blue cocci is two mouthfuls where
 * a blue rod is one; a purple cocci is seven.
 */
export function ballsForColour(colour: PathogenColour): number {
  return pathogenColours.indexOf(colour) + 2
}

/**
 * Where each ball of a clump sits, in the cocci's own space, before the whole
 * thing is turned to face the way it is swimming.
 *
 * The balls pack the way circles naturally do: one in the middle and up to six
 * around it, each exactly touching its neighbours. So two comes out as a pair
 * end to end, three as a triangle, and seven as a full flower. The clump is
 * then shifted to balance on its own middle, which is the point everything else
 * measures from.
 *
 * The drawing and the simulation both use this, so what you can see is exactly
 * what can be hit.
 */
export function ballOffsets(balls: number, ballRadius: number): { x: number; y: number }[] {
  const spacing = ballRadius * 2
  const offsets: { x: number; y: number }[] = []

  for (let i = 0; i < balls; i++) {
    if (i === 0) {
      offsets.push({ x: 0, y: 0 })
      continue
    }

    // The ring of six around the middle one, every 60 degrees.
    const around = ((i - 1) / 6) * Math.PI * 2
    offsets.push({ x: Math.cos(around) * spacing, y: Math.sin(around) * spacing })
  }

  // Balance the clump on its own middle, so a pair sits either side of where it
  // is rather than hanging off one end of it.
  const middleX = offsets.reduce((sum, ball) => sum + ball.x, 0) / offsets.length
  const middleY = offsets.reduce((sum, ball) => sum + ball.y, 0) / offsets.length

  return offsets.map((ball) => ({ x: ball.x - middleX, y: ball.y - middleY }))
}

/** How far a clump of this many balls reaches out from its middle. */
export function cocciRadius(balls: number, ballRadius: number): number {
  let reach = 0

  for (const ball of ballOffsets(balls, ballRadius)) {
    reach = Math.max(reach, Math.hypot(ball.x, ball.y) + ballRadius)
  }

  return reach
}

export const blueBacteria: RodDef = {
  id: 'blue-bacteria',
  name: 'Blue bacteria',
  family: 'bacteria',
  colour: 'blue',
  shape: 'rod',

  length: 26,
  width: 15,
  balls: 1,

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
export const yellowBacteria: RodDef = {
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
export const redBacteria: RodDef = {
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
 * COCCI
 * -----
 * The tanks. Slow, tough, and made of balls that come off one at a time. A
 * single macrophage can strip a blue one, but it has to digest the first ball
 * before it can come back for the second — and the clump spends that whole time
 * chewing on your tissue.
 *
 * They hit exactly as hard as a rod of the same colour. Nothing about a cocci
 * is nastier per second; it is just far more work to be rid of.
 */
const BLUE_COCCI_BALLS = ballsForColour('blue')

export const blueCocci: CocciDef = {
  id: 'blue-cocci',
  name: 'Blue cocci',
  family: 'bacteria',
  colour: 'blue',
  shape: 'cocci',

  ballRadius: 8,
  balls: BLUE_COCCI_BALLS,
  radius: cocciRadius(BLUE_COCCI_BALLS, 8),

  /** Per BALL. Two balls at blue, so a blue cocci is twice a blue rod. */
  health: 3,
  /** Half a blue rod's 24, and slower than everything that hunts it. */
  speed: 12,
  visionRange: 160,
  /** Exactly a blue rod's, as promised. */
  damagePerSecond: 0.09,
  /** Slower than a rod's 20: a tank that bred like a rod would run away with it. */
  divideEverySeconds: 30,
  wanderChangeSeconds: 3,
}

const YELLOW_COCCI_BALLS = ballsForColour('yellow')

/** Tier 2 cocci: three balls instead of two, and quicker. */
export const yellowCocci: CocciDef = {
  ...blueCocci,
  id: 'yellow-cocci',
  name: 'Yellow cocci',
  colour: 'yellow',

  ballRadius: 8.5,
  balls: YELLOW_COCCI_BALLS,
  radius: cocciRadius(YELLOW_COCCI_BALLS, 8.5),

  /** The step up a yellow rod gets, scaled down to a cocci's crawl. */
  speed: 15,
}

const RED_COCCI_BALLS = ballsForColour('red')

/** Tier 3 cocci: four balls, and it eats a body cell half again as fast. */
export const redCocci: CocciDef = {
  ...yellowCocci,
  id: 'red-cocci',
  name: 'Red cocci',
  colour: 'red',

  ballRadius: 9,
  balls: RED_COCCI_BALLS,
  radius: cocciRadius(RED_COCCI_BALLS, 9),

  /** Exactly a red rod's. */
  damagePerSecond: 0.14,
}

/**
 * Every pathogen in the game. Green, orange and purple are still to come: green
 * needs it to run away from immune cells, which is behaviour rather than
 * numbers, and the two after it sit on the far side of green so nothing can
 * mutate that far yet.
 */
export const pathogens: PathogenDef[] = [
  blueBacteria,
  yellowBacteria,
  redBacteria,
  blueCocci,
  yellowCocci,
  redCocci,
]

const byId = new Map(pathogens.map((def) => [def.id, def]))

/** Returns undefined for an unknown id, so a typo in a level doesn't crash. */
export function findPathogen(id: string): PathogenDef | undefined {
  return byId.get(id)
}

/**
 * The pathogens one step either side of this one on the colour ladder, of the
 * same family AND the same shape — what it might turn into when it divides.
 *
 * Shape is held fixed because it isn't part of the ladder: drifting a shade is
 * a small change to a bacterium, and a rod waking up as a clump of balls is
 * not. A blue cocci can only ever become a yellow cocci.
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
    (candidate) =>
      candidate.family === def.family &&
      candidate.shape === def.shape &&
      neighbours.includes(candidate.colour),
  )
}
