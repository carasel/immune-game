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
 *   rod    one capsule-shaped body, with a wiggly tail behind it. Kill it and
 *          it is gone.
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

  // --- running away ---
  /**
   * Green's power: how close an immune cell has to get before this turns round
   * and swims directly away from it, in pixels. Leave it out and it never runs,
   * which is everything up to red.
   *
   * 120 is chosen to sit inside a macrophage's 150 sight and a neutrophil's
   * 190, so you see the chase start before the running does, and outside a
   * granule's 90 throw, so a neutrophil still has to close the gap to shoot.
   */
  fleeRange?: number
  /**
   * Whether fear beats hunger: true and it drops a body cell it was part-way
   * through eating in order to run, false and it commits to the meal once its
   * teeth are in. Ignored when `fleeRange` is unset.
   *
   * Rods run. At a rod's speed running actually works, so a coward rod is
   * genuinely hard to pin down. Cocci don't: a clump crawls, so running could
   * only ever delay the inevitable, and a clump that carries on eating while
   * you take it apart ball by ball is the more frightening thing.
   */
  fleeWhileEating?: boolean
}

/** A rod: one rounded rectangle, swimming along its long axis. */
export interface RodDef extends PathogenBase {
  shape: 'rod'
  /** Rod-shaped bacteria are drawn as a rounded rectangle this long... */
  length: number
  /** ...and this wide. */
  width: number
  /** ...with a wiggly tail trailing this far off the back of it. */
  tailLength: number
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
  /** About two thirds of the body, which is enough to read as a tail at this size. */
  tailLength: 17,
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
  tailLength: 18,

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
  tailLength: 19,

  /** 0.14 means it takes about 7 seconds to kill one body cell, against blue's 11. */
  damagePerSecond: 0.14,
}

/**
 * Tier 4: as quick and as hard-hitting as red, and a coward with it. It watches
 * for immune cells and swims straight away from any that comes within 120px,
 * dropping a body cell it was eating to do it.
 *
 * At 30 against a macrophage's 16 that means one macrophage can never run a
 * green down in the open — it herds one at best. A neutrophil's 34 can, but
 * only just, so a green drags your fast cells all over the map while the rest
 * of the infection gets on with it undisturbed. That is the point of the
 * colour: the answer to a green is cutting it off, not chasing it.
 */
export const greenBacteria: RodDef = {
  ...redBacteria,
  id: 'green-bacteria',
  name: 'Green bacteria',
  colour: 'green',

  length: 29,
  width: 18,
  tailLength: 20,

  fleeRange: 120,
  fleeWhileEating: true,
}

/**
 * Tier 5: a green with the legs on everything. 38 beats a neutrophil's 34, so
 * once an orange has seen you coming nothing in the game can catch it in a
 * straight line. It has to be cornered against the edge of the tissue, shot
 * with a granule, or caught in a NET.
 */
export const orangeBacteria: RodDef = {
  ...greenBacteria,
  id: 'orange-bacteria',
  name: 'Orange bacteria',
  colour: 'orange',

  length: 30,
  width: 19,
  tailLength: 21,

  speed: 38,
}

/**
 * Tier 6: the nastiest thing in the game. Everything an orange has, and it eats
 * through a body cell in about 5 seconds.
 */
export const purpleBacteria: RodDef = {
  ...orangeBacteria,
  id: 'purple-bacteria',
  name: 'Purple bacteria',
  colour: 'purple',

  length: 31,
  width: 20,
  tailLength: 22,

  /** 0.2 means about 5 seconds per body cell, against red's 7 and blue's 11. */
  damagePerSecond: 0.2,
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

const GREEN_COCCI_BALLS = ballsForColour('green')

/**
 * Tier 4 cocci: five balls, and it shies away from immune cells — but only
 * while it hasn't got its teeth into anything. Once it reaches tissue it
 * commits and keeps eating, because at half a rod's speed running was never
 * going to save a clump anyway.
 *
 * So green means two quite different things depending on shape. A green rod is
 * the one you can't catch; a green cocci is the one that can't be driven off
 * the tissue it has already reached.
 */
export const greenCocci: CocciDef = {
  ...redCocci,
  id: 'green-cocci',
  name: 'Green cocci',
  colour: 'green',

  ballRadius: 9.5,
  balls: GREEN_COCCI_BALLS,
  radius: cocciRadius(GREEN_COCCI_BALLS, 9.5),

  fleeRange: 120,
  fleeWhileEating: false,
}

const ORANGE_COCCI_BALLS = ballsForColour('orange')

/**
 * Tier 5 cocci: six balls, and half an orange rod's 38, the way every cocci is
 * half its rod. Worth watching — 19 is the first cocci speed to beat a
 * macrophage's 16, so from orange up a clump out in the open can no longer be
 * run down by the cell whose whole job is eating it.
 */
export const orangeCocci: CocciDef = {
  ...greenCocci,
  id: 'orange-cocci',
  name: 'Orange cocci',
  colour: 'orange',

  ballRadius: 10,
  balls: ORANGE_COCCI_BALLS,
  radius: cocciRadius(ORANGE_COCCI_BALLS, 10),

  speed: 19,
}

const PURPLE_COCCI_BALLS = ballsForColour('purple')

/**
 * Tier 6 cocci: the full flower of seven balls, hitting as hard as a purple
 * rod. Seven separate mouthfuls at three health each, and all seven of them
 * eating your tissue at 0.2 a second while you work through them.
 */
export const purpleCocci: CocciDef = {
  ...orangeCocci,
  id: 'purple-cocci',
  name: 'Purple cocci',
  colour: 'purple',

  ballRadius: 10.5,
  balls: PURPLE_COCCI_BALLS,
  radius: cocciRadius(PURPLE_COCCI_BALLS, 10.5),

  /** Exactly a purple rod's. */
  damagePerSecond: 0.2,
}

/**
 * Every pathogen in the game: the whole colour ladder, in both shapes. Levels
 * only ever send blue, so everything past it is something an infection becomes
 * when you let it run rather than something a level hands you.
 */
export const pathogens: PathogenDef[] = [
  blueBacteria,
  yellowBacteria,
  redBacteria,
  greenBacteria,
  orangeBacteria,
  purpleBacteria,
  blueCocci,
  yellowCocci,
  redCocci,
  greenCocci,
  orangeCocci,
  purpleCocci,
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
 * Colours with no def simply aren't options, which is what kept this working
 * while the ladder was half built. Now that it is full, only the two ends are
 * one-way: a blue can only go up, and a purple can only come back down.
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
